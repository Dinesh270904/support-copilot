import type { Priority, TicketListItem } from "../types";

export type ViewId = "open" | "high" | "review" | "resolved" | "all";
export type SortId = "priority" | "newest";

export const VIEWS: { id: ViewId; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "high", label: "High priority" },
  { id: "review", label: "Needs review" },
  { id: "resolved", label: "Resolved" },
  { id: "all", label: "All tickets" },
];
export const DEFAULT_VIEW: ViewId = "open";
export const isViewId = (v: string | null | undefined): v is ViewId => VIEWS.some((x) => x.id === v);

/** Each view is a client-side predicate over the loaded list (the queue is small and bounded at 100). */
export function inView(t: TicketListItem, view: ViewId): boolean {
  switch (view) {
    case "open": return t.status === "open";
    case "high": return t.status === "open" && t.priority === "high";
    case "review": return t.status === "open" && t.reviewed_at === null;
    case "resolved": return t.status === "resolved";
    case "all": return true;
  }
}

export function countViews(tickets: TicketListItem[]): Record<ViewId, number> {
  const counts: Record<ViewId, number> = { open: 0, high: 0, review: 0, resolved: 0, all: 0 };
  for (const t of tickets) for (const v of VIEWS) if (inView(t, v.id)) counts[v.id] += 1;
  return counts;
}

export interface QueueFilters {
  priorities: Priority[];
  categories: string[];
}
export const NO_FILTERS: QueueFilters = { priorities: [], categories: [] };
export const filterCount = (f: QueueFilters) => f.priorities.length + f.categories.length;

export function applyFilters(tickets: TicketListItem[], f: QueueFilters): TicketListItem[] {
  return tickets.filter(
    (t) => (f.priorities.length === 0 || f.priorities.includes(t.priority)) && (f.categories.length === 0 || f.categories.includes(t.category)),
  );
}

const RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

/** "Priority, then newest" (default) or "Newest first". Ties fall back to the ID so order is stable. */
export function sortTickets(tickets: TicketListItem[], sort: SortId): TicketListItem[] {
  const newest = (a: TicketListItem, b: TicketListItem) => b.updated_at.localeCompare(a.updated_at) || a.id.localeCompare(b.id);
  return [...tickets].sort(sort === "newest" ? newest : (a, b) => RANK[a.priority] - RANK[b.priority] || newest(a, b));
}
