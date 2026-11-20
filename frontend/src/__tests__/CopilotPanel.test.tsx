import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { ANSWERED, BRIEF, INSUFFICIENT_BANK, SIMILAR, installApi, run, queue } from "./fixtures";

afterEach(() => vi.unstubAllGlobals());

async function openT101(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await queue().findByRole("button", { name: /T-101/ }));
}

describe("Copilot cards", () => {
  it("opening a ticket runs summarize_ticket and search_resolved_tickets once each, and renders both cards", async () => {
    const api = installApi({ runs: { summarize_ticket: BRIEF, search_resolved_tickets: SIMILAR } });
    const user = userEvent.setup();
    render(<App />);
    await openT101(user);

    const brief = await screen.findByRole("region", { name: "Ticket brief" });
    expect(await within(brief).findByText(/Error codes mentioned: PAYMENT_TIMEOUT/)).toBeInTheDocument();
    const similar = screen.getByRole("region", { name: "Similar resolved" });
    expect(await within(similar).findByText(/Fix: The receipt email was delayed/)).toBeInTheDocument();
    expect(within(similar).getByText("matched: checkout, receipt")).toBeInTheDocument();
    expect(within(similar).getByText("relevance 1.90")).toBeInTheDocument();

    const actions = api.runs.map((r) => `${r.action}:${r.ticket_id}`).sort();
    expect(actions).toEqual(["search_resolved_tickets:T-101", "summarize_ticket:T-101"]);
  });

  it("does not re-run the brief when returning to a ticket already opened", async () => {
    const api = installApi({ runs: { summarize_ticket: BRIEF, search_resolved_tickets: SIMILAR } });
    const user = userEvent.setup();
    render(<App />);
    await openT101(user);
    await screen.findByText(/Error codes mentioned/);
    await user.click(queue().getByRole("button", { name: /T-104/ }));
    await waitFor(() => expect(api.runs).toHaveLength(4));
    await user.click(queue().getByRole("button", { name: /T-101/ }));
    await screen.findByText(/Error codes mentioned/);
    expect(api.runs).toHaveLength(4); // 2 per ticket opened, none for the revisit
  });

  it("'Still needed' items are tickable and ticking sends nothing", async () => {
    const api = installApi({ runs: { summarize_ticket: BRIEF, search_resolved_tickets: SIMILAR } });
    const user = userEvent.setup();
    render(<App />);
    await openT101(user);
    const box = await screen.findByRole("checkbox", { name: "Order ID or gateway transaction reference" });
    const before = api.calls.length;
    await user.click(box);
    expect(box).toBeChecked();
    expect(api.calls.length).toBe(before);
  });

  it("one failing card shows its error with the request ID while the other card keeps working, and Retry re-runs it", async () => {
    let calls = 0;
    installApi({
      runs: {
        summarize_ticket: () => (++calls === 1
          ? { status: 503, body: { error: { code: "assistant_unavailable", message: "The assistant tool server is unavailable. Try again shortly.", request_id: "rid-9" } } }
          : { body: BRIEF }),
        search_resolved_tickets: SIMILAR,
      },
    });
    const user = userEvent.setup();
    render(<App />);
    await openT101(user);
    const brief = await screen.findByRole("region", { name: "Ticket brief" });
    expect(await within(brief).findByText("Assistant tools are offline")).toBeInTheDocument();
    expect(within(brief).getByText("The MCP server isn't reachable. Ticket browsing still works.")).toBeInTheDocument();
    expect(within(brief).getByText("Request ID rid-9")).toBeInTheDocument();
    expect(await screen.findByText(/Fix: The receipt email was delayed/)).toBeInTheDocument(); // similar card unaffected
    await user.click(within(brief).getByRole("button", { name: "Retry" }));
    expect(await within(brief).findByText(/Error codes mentioned/)).toBeInTheDocument();
  });
});

describe("Ask box", () => {
  it("scope defaults to the ticket's category, and 'All categories' drops it", async () => {
    const api = installApi({ runs: { summarize_ticket: BRIEF, search_resolved_tickets: SIMILAR, search_knowledge: run({ answer_state: "insufficient_evidence", answer: "Insufficient evidence." }) } });
    const user = userEvent.setup();
    render(<App />);
    await openT101(user);
    const ask = screen.getByLabelText("Ask a question");
    expect(screen.getByLabelText(/Scope/)).toHaveValue("checkout");
    await user.type(ask, "bank decline fee{Enter}");
    await waitFor(() => expect(api.runs.some((r) => r.action === "search_knowledge")).toBe(true));
    expect(api.runs.find((r) => r.action === "search_knowledge")).toEqual({
      action: "search_knowledge", ticket_id: "T-101", query: "bank decline fee", category: "checkout",
    });
    await user.selectOptions(screen.getByLabelText(/Scope/), "All categories");
    await user.type(ask, "another question here");
    await user.click(screen.getByRole("button", { name: /^Ask/ }));
    await waitFor(() => expect(api.runs.filter((r) => r.action === "search_knowledge")).toHaveLength(2));
    expect(api.runs.filter((r) => r.action === "search_knowledge")[1]).toEqual({
      action: "search_knowledge", ticket_id: "T-101", query: "another question here",
    });
  });

  it("validates before calling the API", async () => {
    const api = installApi({ runs: { summarize_ticket: BRIEF, search_resolved_tickets: SIMILAR } });
    const user = userEvent.setup();
    render(<App />);
    await openT101(user);
    await screen.findByText(/Error codes mentioned/);
    await user.click(screen.getByRole("button", { name: /^Ask/ }));
    expect(screen.getByRole("alert")).toHaveTextContent("Type at least 3 characters");
    await user.type(screen.getByLabelText("Ask a question"), "ab");
    await user.click(screen.getByRole("button", { name: /^Ask/ }));
    expect(screen.getByRole("alert")).toHaveTextContent("Type at least 3 characters");
    expect(api.runs.filter((r) => r.action === "search_knowledge")).toHaveLength(0);
  });

  it("offers category-specific suggestion chips that ask immediately", async () => {
    const api = installApi({ runs: { summarize_ticket: BRIEF, search_resolved_tickets: SIMILAR, search_knowledge: run({ answer: "x" }) } });
    const user = userEvent.setup();
    render(<App />);
    await openT101(user);
    await user.click(screen.getByRole("button", { name: "What does PAYMENT_TIMEOUT mean and how do I resolve it?" }));
    await waitFor(() => expect(api.runs.some((r) => r.action === "search_knowledge")).toBe(true));
    expect(api.runs.find((r) => r.action === "search_knowledge")?.query).toBe("What does PAYMENT_TIMEOUT mean and how do I resolve it?");
  });

  it("shows a 422 from the server as an amber 'Request rejected' note, inline", async () => {
    installApi({ runs: { summarize_ticket: BRIEF, search_resolved_tickets: SIMILAR, search_knowledge: () => ({ status: 422, body: { error: { code: "validation_error", message: "query: String should have at most 500 characters", request_id: "rid-2" } } }) } });
    const user = userEvent.setup();
    render(<App />);
    await openT101(user);
    await user.type(screen.getByLabelText("Ask a question"), "a valid looking question{Enter}");
    expect(await screen.findByText("Request rejected")).toBeInTheDocument();
    expect(screen.getByText("Request ID rid-2")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument(); // the user must fix the input
  });
});

describe("Ask box details", () => {
  it("shows the exact suggestion chips for the ticket's category and follows the scope", async () => {
    installApi({ runs: { summarize_ticket: BRIEF, search_resolved_tickets: SIMILAR } });
    const user = userEvent.setup();
    render(<App />);
    await openT101(user);
    const chips = () => within(screen.getByRole("group", { name: "Suggested questions" })).getAllByRole("button").map((b) => b.textContent);
    expect(chips()).toEqual(["Can the customer retry while payment is pending?", "What does PAYMENT_TIMEOUT mean and how do I resolve it?", "How do I check for a duplicate charge?"]);
    await user.selectOptions(screen.getByLabelText(/Scope/), "Billing");
    expect(chips()).toContain("Does the product reimburse a bank decline fee?");
    await user.selectOptions(screen.getByLabelText(/Scope/), "Integrations");
    expect(chips()).toEqual(["Can scheduled reports be sent to an SFTP server?", "Which integrations are documented?"]);
  });

  it("the counter warns at 450 characters, turns danger and disables Ask over 500", async () => {
    installApi({ runs: { summarize_ticket: BRIEF, search_resolved_tickets: SIMILAR } });
    const user = userEvent.setup();
    render(<App />);
    await openT101(user);
    const box = screen.getByLabelText("Ask a question");
    const count = () => screen.getByLabelText(/characters$/);
    expect(count()).toHaveTextContent("0/500");
    await user.click(box);
    await user.paste("a".repeat(450));
    expect(count()).toHaveClass("warn");
    await user.paste("b".repeat(51));
    expect(count()).toHaveClass("over");
    expect(screen.getByRole("button", { name: /^Ask/ })).toBeDisabled();
  });

  it("with no ticket, the chips include a count question that runs count_tickets", async () => {
    const api = installApi({ runs: { count_tickets: run({ action: "count_tickets", answer: "3 ticket(s) match.", tool_calls: ["count_tickets"], count: { count: 3, ticket_ids: ["T-101"], filters: {} } }) } });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "How many open high-priority tickets mention checkout?" }));
    await waitFor(() => expect(api.runs.some((r) => r.action === "count_tickets")).toBe(true));
    expect(api.runs.find((r) => r.action === "count_tickets")).toEqual({ action: "count_tickets", query: "How many open high-priority tickets mention checkout?" });
    expect(await screen.findByText("Count complete")).toBeInTheDocument();
  });
});

describe("answer stack, focus and cards", () => {
  it("collapses earlier answers to one-line rows, moves focus to the new answer and announces it", async () => {
    let n = 0;
    installApi({ runs: { summarize_ticket: BRIEF, search_resolved_tickets: SIMILAR, search_knowledge: () => ({ body: ++n === 1 ? ANSWERED : INSUFFICIENT_BANK }) } });
    const user = userEvent.setup();
    render(<App />);
    await openT101(user);
    await user.type(screen.getByLabelText("Ask a question"), "first question here{Enter}");
    const heading = await screen.findByRole("heading", { name: /Answered from 1 article/ });
    await waitFor(() => expect(heading).toHaveFocus()); // focus lands on the new answer
    expect(await screen.findByText("Answer ready: answered from 1 article")).toBeInTheDocument(); // and it is announced

    await user.type(screen.getByLabelText("Ask a question"), "second question here{Enter}");
    await screen.findByRole("heading", { name: /Not enough evidence/ });
    const older = screen.getByText("Q: “first question here”").closest("summary")!;
    expect(older).toHaveTextContent("Answered · 3 sources");
    expect(older.closest("details")).not.toHaveAttribute("open"); // collapsed until clicked
    await user.click(older);
    expect(older.closest("details")).toHaveAttribute("open");
  });

  it("the ⋯ menu refreshes the brief, and 'Show all' reveals facts beyond four", async () => {
    const api = installApi({ runs: { summarize_ticket: { ...BRIEF, sections: [{ title: "Key facts from the ticket", items: ["f1", "f2", "f3", "f4", "f5", "f6"] }] }, search_resolved_tickets: SIMILAR } });
    const user = userEvent.setup();
    render(<App />);
    await openT101(user);
    const brief = await screen.findByRole("region", { name: "Ticket brief" });
    await within(brief).findByText("f4");
    expect(within(brief).queryByText("f5")).not.toBeInTheDocument();
    await user.click(within(brief).getByRole("button", { name: "Show all (6)" }));
    expect(within(brief).getByText("f6")).toBeInTheDocument();
    await user.click(within(brief).getByRole("button", { name: "Ticket brief options" }));
    await user.click(within(brief).getByRole("menuitem", { name: "Refresh brief" }));
    await waitFor(() => expect(api.runs.filter((r) => r.action === "summarize_ticket")).toHaveLength(2));
  });
});

describe("leaving a ticket", () => {
  it("aborts its in-flight auto-runs (and re-runs them when it is opened again)", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const api = installApi({ runs: { summarize_ticket: BRIEF, search_resolved_tickets: SIMILAR }, hold: (body) => (body.ticket_id === "T-101" ? gate : undefined) });
    const user = userEvent.setup();
    render(<App />);
    await openT101(user);
    await waitFor(() => expect(api.runs.filter((r) => r.ticket_id === "T-101")).toHaveLength(2));
    await user.click(queue().getByRole("button", { name: /T-104/ })); // leave while T-101's runs are still in flight
    const t101 = () => api.calls.filter((c) => c.url === "/api/assistant/run" && (c.body as { ticket_id?: string }).ticket_id === "T-101");
    await waitFor(() => expect(t101().every((c) => c.signal?.aborted)).toBe(true)); // once T-104 has loaded
    release();
    await screen.findByRole("region", { name: "Ticket brief" });
    await user.click(queue().getByRole("button", { name: /T-101/ }));
    await waitFor(() => expect(api.runs.filter((r) => r.ticket_id === "T-101").length).toBeGreaterThanOrEqual(4)); // started afresh
  });

  it("remembers the Copilot scroll position per ticket", async () => {
    installApi({ runs: { summarize_ticket: BRIEF, search_resolved_tickets: SIMILAR } });
    const user = userEvent.setup();
    render(<App />);
    await openT101(user);
    const pane = () => document.querySelector(".copilot-scroll") as HTMLElement;
    await screen.findByRole("region", { name: "Ticket brief" });
    pane().scrollTop = 120;
    pane().dispatchEvent(new Event("scroll"));
    await user.click(queue().getByRole("button", { name: /T-104/ }));
    await screen.findByRole("region", { name: "Ticket brief" });
    await user.click(queue().getByRole("button", { name: /T-101/ }));
    await waitFor(() => expect(pane().scrollTop).toBe(120));
  });
});
