import { describe, expect, it } from "vitest";
import { buildHash, parseHash } from "../hooks/useHashRoute";
import { applyFilters, countViews, inView, sortTickets } from "../lib/views";
import type { TicketListItem } from "../types";

const t = (id: string, o: Partial<TicketListItem>): TicketListItem => ({
  id, title: id, category: "checkout", priority: "high", status: "open", product_area: "x",
  created_at: "2026-11-12T09:00:00Z", updated_at: "2026-11-12T09:00:00Z", reviewed_at: null, ...o,
});
const list = [
  t("T-1", {}),
  t("T-2", { priority: "medium", updated_at: "2026-11-13T09:00:00Z" }),
  t("T-3", { priority: "high", reviewed_at: "2026-11-14T09:00:00Z" }),
  t("T-4", { status: "resolved", priority: "low", reviewed_at: "2026-11-14T09:00:00Z" }),
  t("T-5", { category: "billing", priority: "high" }),
];

describe("views", () => {
  it("defines each view as the spec does and computes counts from the real list", () => {
    expect(list.filter((x) => inView(x, "open")).map((x) => x.id)).toEqual(["T-1", "T-2", "T-3", "T-5"]);
    expect(list.filter((x) => inView(x, "high")).map((x) => x.id)).toEqual(["T-1", "T-3", "T-5"]);
    expect(list.filter((x) => inView(x, "review")).map((x) => x.id)).toEqual(["T-1", "T-2", "T-5"]); // open and unreviewed
    expect(list.filter((x) => inView(x, "resolved")).map((x) => x.id)).toEqual(["T-4"]);
    expect(countViews(list)).toEqual({ open: 4, high: 3, review: 3, resolved: 1, all: 5 });
  });
  it("a resolved ticket is never 'high priority' or 'needs review' even if it matches the field", () => {
    const r = t("T-9", { status: "resolved", priority: "high", reviewed_at: null });
    expect(inView(r, "high")).toBe(false);
    expect(inView(r, "review")).toBe(false);
  });
  it("filters combine as AND across groups and OR within a group", () => {
    expect(applyFilters(list, { priorities: ["high", "medium"], categories: [] }).map((x) => x.id)).toEqual(["T-1", "T-2", "T-3", "T-5"]);
    expect(applyFilters(list, { priorities: ["high"], categories: ["billing"] }).map((x) => x.id)).toEqual(["T-5"]);
    expect(applyFilters(list, { priorities: [], categories: [] })).toHaveLength(5);
  });
  it("sorts by priority then newest (default) or newest first, stably", () => {
    expect(sortTickets(list, "priority").map((x) => x.id)).toEqual(["T-1", "T-3", "T-5", "T-2", "T-4"]);
    // T-2 is the only ticket updated on the 13th; the rest tie on updated_at and fall back to ID order.
    expect(sortTickets(list, "newest").map((x) => x.id)).toEqual(["T-2", "T-1", "T-3", "T-4", "T-5"]);
  });
});

describe("hash route", () => {
  it("parses ticket and view, defaulting the view to open", () => {
    expect(parseHash("#/ticket/T-101")).toEqual({ ticketId: "T-101", view: "open" });
    expect(parseHash("#/ticket/T-101?view=high")).toEqual({ ticketId: "T-101", view: "high" });
    expect(parseHash("#/?view=resolved")).toEqual({ ticketId: null, view: "resolved" });
    expect(parseHash("")).toEqual({ ticketId: null, view: "open" });
  });
  it("ignores an unknown view and keeps an invalid ticket ID so the pane can say 'not found'", () => {
    expect(parseHash("#/ticket/T-101?view=bogus").view).toBe("open");
    expect(parseHash("#/ticket/not-a-ticket").ticketId).toBe("not-a-ticket");
  });
  it("round-trips, omitting the default view", () => {
    for (const route of [{ ticketId: "T-104", view: "open" as const }, { ticketId: "T-104", view: "review" as const }, { ticketId: null, view: "all" as const }]) {
      expect(parseHash(buildHash(route))).toEqual(route);
    }
    expect(buildHash({ ticketId: "T-101", view: "open" })).toBe("#/ticket/T-101");
  });
});
