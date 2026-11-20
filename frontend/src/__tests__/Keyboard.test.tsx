import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { BRIEF, DRAFT, SIMILAR, installApi, run, queue } from "./fixtures";

afterEach(() => vi.unstubAllGlobals());
const base = { summarize_ticket: BRIEF, search_resolved_tickets: SIMILAR, draft_reply: DRAFT };

async function open(user: ReturnType<typeof userEvent.setup>, id = "T-101") {
  render(<App />);
  await user.click(await queue().findByRole("button", { name: new RegExp(id) }));
  await screen.findByRole("region", { name: "Ticket brief" });
}
const selected = () => document.querySelector('.qlist [aria-current="true"] .qrow-id')?.textContent;

describe("j / k", () => {
  it("move through the queue in its displayed order, and are ignored while typing in the Ask box", async () => {
    installApi({ runs: base });
    const user = userEvent.setup();
    await open(user, "T-101"); // all three are high priority and equally new, so the queue falls back to ID order
    expect(selected()).toBe("T-101");
    await user.keyboard("j");
    await waitFor(() => expect(selected()).toBe("T-104"));
    await user.keyboard("j");
    await waitFor(() => expect(selected()).toBe("T-112"));
    await user.keyboard("j"); // already last: stays put
    expect(selected()).toBe("T-112");
    await user.keyboard("k");
    await waitFor(() => expect(selected()).toBe("T-104"));
    expect(window.location.hash).toBe("#/ticket/T-104");

    const ask = screen.getByLabelText("Ask a question");
    await user.click(ask);
    await user.keyboard("jjkk");
    expect(ask).toHaveValue("jjkk"); // typed into the field, not treated as shortcuts
    expect(selected()).toBe("T-104");
  });
});

describe("command palette", () => {
  it("⌘K opens it; typing 'T-104' and Enter opens that ticket and closes the palette", async () => {
    installApi({ runs: base });
    const user = userEvent.setup();
    await open(user);
    await user.keyboard("{Meta>}k{/Meta}");
    const dialog = screen.getByRole("dialog", { name: "Command palette" });
    const input = within(dialog).getByRole("combobox");
    expect(input).toHaveFocus();
    await user.type(input, "T-104");
    expect(within(dialog).getByRole("option", { selected: true })).toHaveTextContent("T-104");
    await user.keyboard("{Enter}");
    expect(window.location.hash).toBe("#/ticket/T-104");
    expect(screen.queryByRole("dialog", { name: "Command palette" })).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Locked out after replacing authenticator phone" })).toBeInTheDocument();
  });

  it("is a combobox over a listbox with grouped options that show their shortcuts; arrows move, Esc closes and focus returns", async () => {
    installApi({ runs: base });
    const user = userEvent.setup();
    await open(user);
    const trigger = screen.getByRole("button", { name: /Search tickets or run an action/ });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Command palette" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const input = within(dialog).getByRole("combobox");
    const listbox = within(dialog).getByRole("listbox");
    expect(input).toHaveAttribute("aria-controls", listbox.id);
    for (const group of ["Tickets", "Actions", "Views", "Preferences"]) expect(within(dialog).getByText(group)).toBeInTheDocument();
    const draft = within(dialog).getByRole("option", { name: /Draft reply for current ticket/ });
    expect(draft).toHaveTextContent("D");
    expect(within(dialog).getByRole("option", { name: /Mark current ticket reviewed/ })).toHaveTextContent("R");
    expect(within(dialog).getByRole("option", { name: /Switch to light theme/ })).toHaveTextContent("T");
    const first = within(dialog).getAllByRole("option")[0];
    expect(input).toHaveAttribute("aria-activedescendant", first.id);
    await user.keyboard("{ArrowDown}");
    expect(input).toHaveAttribute("aria-activedescendant", within(dialog).getAllByRole("option")[1].id);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Command palette" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("fuzzy-matches tickets by title and runs actions (draft)", async () => {
    const api = installApi({ runs: base });
    const user = userEvent.setup();
    await open(user);
    await user.keyboard("{Meta>}k{/Meta}");
    const box = () => within(screen.getByRole("dialog", { name: "Command palette" })).getByRole("combobox");
    await user.type(box(), "sftp");
    expect(within(screen.getByRole("listbox")).getAllByRole("option")[0]).toHaveTextContent("T-112");
    await user.clear(box());
    await user.type(box(), "draft reply");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(api.runs.some((r) => r.action === "draft_reply")).toBe(true));
  });

  it("no results falls back to 'Ask knowledge: …', which runs a knowledge search", async () => {
    const api = installApi({ runs: { ...base, search_knowledge: run({ answer: "x" }) } });
    const user = userEvent.setup();
    await open(user);
    await user.keyboard("{Meta>}k{/Meta}");
    await user.type(within(screen.getByRole("dialog", { name: "Command palette" })).getByRole("combobox"), "zqxjv");
    expect(screen.getByText("No results for “zqxjv”.")).toBeInTheDocument();
    expect(within(screen.getByRole("listbox", { name: "Results" })).getByRole("option")).toHaveTextContent("Ask knowledge: zqxjv");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(api.runs.find((r) => r.action === "search_knowledge")?.query).toBe("zqxjv"));
  });

  it("'count ...' runs count_tickets and shows the answer inline, and Enter again opens the first ticket", async () => {
    const api = installApi({ runs: { ...base, count_tickets: run({ action: "count_tickets", answer: "1 ticket(s) match.", count: { count: 1, ticket_ids: ["T-101"], filters: { status: "open" } } }) } });
    const user = userEvent.setup();
    await open(user, "T-104");
    await user.keyboard("{Meta>}k{/Meta}");
    await user.type(within(screen.getByRole("dialog", { name: "Command palette" })).getByRole("combobox"), "count open high checkout");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(api.runs.find((r) => r.action === "count_tickets")?.query).toBe("open high checkout"));
    expect(await screen.findByText(/1 ticket/)).toBeInTheDocument();
    expect(screen.getByText("T-101", { selector: ".palette-foot .num" })).toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(window.location.hash).toBe("#/ticket/T-101");
  });
});

describe("single-key shortcuts", () => {
  it("/ focuses Ask without typing a slash; ? opens the sheet; Esc closes it", async () => {
    installApi({ runs: base });
    const user = userEvent.setup();
    await open(user);
    await user.keyboard("/");
    await waitFor(() => expect(screen.getByLabelText("Ask a question")).toHaveFocus());
    expect(screen.getByLabelText("Ask a question")).toHaveValue("");
    await user.keyboard("{Escape}");
    expect(screen.getByLabelText("Ask a question")).not.toHaveFocus(); // Esc leaves the input
    await user.keyboard("?");
    const sheet = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
    expect(within(sheet).getByText("Mark reviewed")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Keyboard shortcuts" })).not.toBeInTheDocument();
  });

  it("d drafts, s refreshes the brief, r marks reviewed, t toggles the theme, 1–5 switch views", async () => {
    const api = installApi({ runs: base });
    const user = userEvent.setup();
    await open(user);
    await user.keyboard("d");
    await screen.findByDisplayValue(/Thank you for contacting us/);
    (document.activeElement as HTMLElement).blur();
    await user.keyboard("s");
    await waitFor(() => expect(api.runs.filter((r) => r.action === "summarize_ticket")).toHaveLength(2));
    await user.keyboard("t");
    expect(["light", "dark"]).toContain(document.documentElement.dataset.theme);
    const before = document.documentElement.dataset.theme;
    await user.keyboard("t");
    expect(document.documentElement.dataset.theme).not.toBe(before);
    await user.keyboard("2");
    expect(window.location.hash).toContain("view=high");
    await user.keyboard("4");
    expect(window.location.hash).toContain("view=resolved");
  });

  const reviewCalls = (api: ReturnType<typeof installApi>) => api.calls.filter((c) => c.method === "PATCH" && c.url === "/api/tickets/T-101/reviewed");

  it("r asks first: nothing is written until Enter confirms", async () => {
    const api = installApi({ runs: base });
    const user = userEvent.setup();
    await open(user);
    await user.keyboard("r");
    expect(screen.getByText(/Mark T-101 reviewed\?/)).toBeInTheDocument();
    expect(screen.getByText(/Enter to confirm · Esc to cancel/)).toBeInTheDocument();
    expect(reviewCalls(api)).toHaveLength(0);
    await user.keyboard("{Enter}");
    await waitFor(() => expect(reviewCalls(api)).toHaveLength(1));
    expect(screen.queryByText(/Mark T-101 reviewed\?/)).not.toBeInTheDocument();
  });

  it("Esc cancels the review question, writes nothing and returns focus to the button", async () => {
    const api = installApi({ runs: base });
    const user = userEvent.setup();
    await open(user);
    await user.keyboard("r");
    await user.keyboard("{Escape}");
    expect(screen.queryByText(/Mark T-101 reviewed\?/)).not.toBeInTheDocument();
    expect(reviewCalls(api)).toHaveLength(0);
    expect(screen.getByRole("button", { name: /Mark reviewed/ })).toHaveFocus();
  });

  it("the button still marks reviewed in one click", async () => {
    const api = installApi({ runs: base });
    const user = userEvent.setup();
    await open(user);
    await user.click(screen.getByRole("button", { name: /Mark reviewed/ }));
    await waitFor(() => expect(reviewCalls(api)).toHaveLength(1));
  });
});

describe("top bar", () => {
  it("the health pill opens a popover with the server, tools and index stats", async () => {
    installApi({ runs: base });
    const user = userEvent.setup();
    render(<App />);
    const pill = await screen.findByRole("button", { name: /Assistant ready/ });
    await user.click(pill);
    const pop = screen.getByRole("dialog", { name: "Assistant tool status" });
    expect(within(pop).getByText(/support-copilot · MCP 2025-11-25/)).toBeInTheDocument();
    expect(within(pop).getByText("search_knowledge")).toBeInTheDocument();
    expect(within(pop).getByText(/14 chunks · 7 articles/)).toBeInTheDocument();
    expect(within(pop).getByText(/min score 0\.15 · coverage 0\.6/)).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Assistant tool status" })).not.toBeInTheDocument();
  });
  it("re-checks health right after an assistant run, so a recovered tool server shows at once", async () => {
    // First check (page load): down. Every later check: up. No 30 s timer fires inside this test.
    const api = installApi({ runs: base, healthy: (nth) => nth > 1 });
    render(<App />);
    await screen.findByText("Assistant offline");
    const healthCalls = () => api.calls.filter((c) => c.url === "/health").length;
    expect(healthCalls()).toBe(1);
    window.location.hash = "#/ticket/T-101"; // opening a ticket starts the two auto-runs
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    await screen.findByRole("button", { name: /Assistant ready/ });
    expect(healthCalls()).toBeGreaterThan(1);
  });
  it("the keyboard button opens the shortcut sheet", async () => {
    installApi({ runs: base });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Keyboard shortcuts" }));
    expect(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument();
  });
});

describe("accessibility details found by Lighthouse", () => {
  it("the search button's accessible name contains its visible text (label in name)", async () => {
    installApi({ runs: base });
    render(<App />);
    const btn = await screen.findByRole("button", { name: /Search tickets or run an action…/ });
    expect(btn).not.toHaveAttribute("aria-label"); // the name comes from the visible text, so they cannot disagree
  });
  it("the conversation list contains only list items", async () => {
    installApi({ runs: base });
    const user = userEvent.setup();
    await open(user);
    const list = document.querySelector("ol.convo")!;
    expect(Array.from(list.children).every((c) => c.tagName === "LI" && !c.hasAttribute("role"))).toBe(true);
  });
});
