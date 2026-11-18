import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { QueuePane } from "../components/QueuePane";
import { NO_FILTERS, type QueueFilters, type SortId, type ViewId } from "../lib/views";
import type { Meta, TicketListItem } from "../types";
import { BRIEF, SIMILAR, installApi } from "./fixtures";

afterEach(() => vi.unstubAllGlobals());

const meta: Meta = { statuses: ["open", "resolved"], priorities: ["low", "medium", "high"], categories: ["billing", "checkout"], actions: [] };
const mk = (id: string, o: Partial<TicketListItem>): TicketListItem => ({
  id, title: `Title ${id}`, category: "checkout", priority: "high", status: "open", product_area: "web_checkout",
  created_at: "2026-11-12T09:15:00Z", updated_at: "2026-11-12T09:42:00Z", reviewed_at: null, ...o,
});
const tickets = [
  mk("T-101", {}),
  mk("T-102", { priority: "medium", category: "billing", product_area: "billing", updated_at: "2026-11-13T09:00:00Z" }),
  mk("T-103", { status: "resolved", priority: "low", reviewed_at: "2026-11-14T00:00:00Z" }),
];

function Harness({ onSelect = () => {}, onView = () => {}, initialView = "open" as ViewId, list = tickets }: { onSelect?: (id: string) => void; onView?: (v: ViewId) => void; initialView?: ViewId; list?: TicketListItem[] }) {
  const [view, setView] = useState<ViewId>(initialView);
  const [filters, setFilters] = useState<QueueFilters>(NO_FILTERS);
  const [sort, setSort] = useState<SortId>("priority");
  return (
    <QueuePane meta={meta} tickets={list} view={view} onView={(v) => { setView(v); onView(v); }} filters={filters} onFilters={setFilters}
      sort={sort} onSort={setSort} loading={false} error={null} onRetry={() => {}} selectedId="T-101" onSelect={onSelect} />
  );
}

describe("views list", () => {
  it("shows the five views with counts computed from the list; Open is the default", async () => {
    const user = userEvent.setup();
    const onView = vi.fn();
    render(<Harness onView={onView} />);
    const views = within(screen.getByRole("list", { name: "Views" }));
    expect(views.getByRole("button", { name: /Open/ })).toHaveAttribute("aria-pressed", "true");
    expect(views.getByRole("button", { name: /Open/ })).toHaveTextContent("2");
    expect(views.getByRole("button", { name: /High priority/ })).toHaveTextContent("1");
    expect(views.getByRole("button", { name: /Needs review/ })).toHaveTextContent("2");
    expect(views.getByRole("button", { name: /Resolved/ })).toHaveTextContent("1");
    expect(views.getByRole("button", { name: /All tickets/ })).toHaveTextContent("3");
    await user.click(views.getByRole("button", { name: /Resolved/ }));
    expect(onView).toHaveBeenCalledWith("resolved");
    expect(screen.getByRole("button", { name: /T-103/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /T-101/ })).not.toBeInTheDocument();
  });
});

describe("rows", () => {
  it("two lines: priority, status and review flags are icons with accessible names, never colour alone", () => {
    render(<Harness initialView="all" />);
    const row = screen.getByRole("button", { name: /T-101/ });
    expect(row).toHaveAttribute("aria-current", "true");
    expect(within(row).getByRole("img", { name: "high priority" })).toBeInTheDocument();
    expect(within(row).getByRole("img", { name: "Open" })).toBeInTheDocument();
    expect(within(row).getByRole("img", { name: "Needs review" })).toBeInTheDocument();
    expect(within(row).getByText("Checkout")).toBeInTheDocument(); // the category name sits beside its colour dot
    expect(within(row).getByText("Title T-101")).toHaveAttribute("title", "Title T-101");
    const resolved = screen.getByRole("button", { name: /T-103/ });
    expect(within(resolved).getByRole("img", { name: "Resolved" })).toBeInTheDocument();
    expect(within(resolved).getByRole("img", { name: "Reviewed" })).toBeInTheDocument();
    expect(within(resolved).queryByRole("img", { name: "Needs review" })).not.toBeInTheDocument();
  });
  it("sorts by priority then newest, or newest first", async () => {
    const user = userEvent.setup();
    render(<Harness initialView="all" />);
    const order = () => Array.from(document.querySelectorAll(".qrow-id")).map((n) => n.textContent);
    expect(order()).toEqual(["T-101", "T-102", "T-103"]);
    await user.selectOptions(screen.getByRole("combobox"), "Newest first");
    expect(order()).toEqual(["T-102", "T-101", "T-103"]); // T-102 is the only one updated on the 13th; ties fall back to ID
  });
});

describe("filters", () => {
  it("checkbox groups apply as removable 'Group: value' chips; Clear all and Esc work", async () => {
    const user = userEvent.setup();
    render(<Harness initialView="all" />);
    await user.click(screen.getByRole("button", { name: /Filters/ }));
    const dialog = screen.getByRole("dialog", { name: "Filters" });
    await user.click(within(dialog).getByRole("checkbox", { name: "Billing" }));
    expect(screen.getByRole("button", { name: "Remove filter Category: Billing" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /T-102/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /T-101/ })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("checkbox", { name: "High" }));
    expect(await screen.findByText("No tickets match these filters.")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Clear all" }));
    expect(screen.queryByRole("button", { name: /Remove filter/ })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Filters" })).not.toBeInTheDocument();
  });
  it("an empty view says so and offers Show all tickets", async () => {
    const user = userEvent.setup();
    render(<Harness list={[tickets[2]]} initialView="open" />);
    expect(screen.getByText("No tickets in this view.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show all tickets" }));
    expect(screen.getByRole("button", { name: /T-103/ })).toBeInTheDocument();
  });
});

describe("hash routing in the app", () => {
  it("opens the ticket named in the URL, and selecting a row writes it back (so reload and back/forward work)", async () => {
    window.location.hash = "#/ticket/T-101";
    const api = installApi({ runs: { summarize_ticket: BRIEF, search_resolved_tickets: SIMILAR } });
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Checkout timed out with a pending payment" })).toBeInTheDocument();
    expect(api.calls.some((c) => c.url === "/api/tickets/T-101")).toBe(true);
    await user.click(await screen.findByRole("button", { name: /T-104/ }));
    expect(window.location.hash).toBe("#/ticket/T-104");
    expect(await screen.findByRole("heading", { name: "Locked out after replacing authenticator phone" })).toBeInTheDocument();
  });
  it("views live in the URL; an unknown ticket ID shows 'Ticket not found', not a crash", async () => {
    installApi({ runs: { summarize_ticket: BRIEF, search_resolved_tickets: SIMILAR } });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: /High priority/ }));
    expect(window.location.hash).toBe("#/?view=high");
    window.location.hash = "#/ticket/T-999";
    expect(await screen.findByText("Ticket not found: T-999")).toBeInTheDocument();
  });
});
