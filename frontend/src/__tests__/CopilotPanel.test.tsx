import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { BRIEF, SIMILAR, installApi, run } from "./fixtures";

afterEach(() => vi.unstubAllGlobals());

async function openT101(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: /T-101/ }));
}

describe("Copilot cards", () => {
  it("opening a ticket runs summarize_ticket and search_resolved_tickets once each, and renders both cards", async () => {
    const api = installApi({ runs: { summarize_ticket: BRIEF, search_resolved_tickets: SIMILAR } });
    const user = userEvent.setup();
    render(<App />);
    await openT101(user);

    const brief = await screen.findByRole("region", { name: "Ticket brief" });
    expect(await within(brief).findByText(/Error codes mentioned: PAYMENT_TIMEOUT/)).toBeInTheDocument();
    const similar = screen.getByRole("region", { name: "Similar resolved tickets" });
    expect(await within(similar).findByText(/Fix: The receipt email was delayed/)).toBeInTheDocument();
    expect(within(similar).getByText("matched: checkout, receipt")).toBeInTheDocument();
    expect(within(similar).getByText("bm25 1.90")).toBeInTheDocument();

    const actions = api.runs.map((r) => `${r.action}:${r.ticket_id}`).sort();
    expect(actions).toEqual(["search_resolved_tickets:T-101", "summarize_ticket:T-101"]);
  });

  it("does not re-run the brief when returning to a ticket already opened", async () => {
    const api = installApi({ runs: { summarize_ticket: BRIEF, search_resolved_tickets: SIMILAR } });
    const user = userEvent.setup();
    render(<App />);
    await openT101(user);
    await screen.findByText(/Error codes mentioned/);
    await user.click(screen.getByRole("button", { name: /T-104/ }));
    await waitFor(() => expect(api.runs).toHaveLength(4));
    await user.click(screen.getByRole("button", { name: /T-101/ }));
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
    expect(await within(brief).findByText("Tool server unavailable")).toBeInTheDocument();
    expect(within(brief).getByText("Request ID: rid-9")).toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: /Ask$/ }));
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
    await user.click(screen.getByRole("button", { name: /Ask$/ }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a question to search for.");
    await user.type(screen.getByLabelText("Ask a question"), "ab");
    await user.click(screen.getByRole("button", { name: /Ask$/ }));
    expect(screen.getByRole("alert")).toHaveTextContent("at least 3 characters");
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
    expect(screen.getByText("Request ID: rid-2")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument(); // the user must fix the input
  });
});
