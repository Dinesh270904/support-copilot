import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "./api";
import { CopilotPanel } from "./components/CopilotPanel";
import { TopBar, type HealthState } from "./components/TopBar";
import { QueuePane } from "./components/QueuePane";
import { ReplyComposer } from "./components/ReplyComposer";
import { TicketPane } from "./components/TicketPane";
import { useCopilot } from "./hooks/useCopilot";
import { useTheme } from "./hooks/useTheme";
import { untrustedPositions } from "./lib/untrusted";
import { NO_FILTERS, type QueueFilters, type SortId, type ViewId } from "./lib/views";
import { useHashRoute } from "./hooks/useHashRoute";
import type { Meta, TicketDetail as Ticket, TicketListItem } from "./types";

function message(err: unknown): string {
  return err instanceof ApiError ? err.message : "Unexpected error";
}

export default function App() {
  const { theme, toggle: toggleTheme } = useTheme();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [health, setHealth] = useState<HealthState>(null);
  // The URL hash is the source of truth for the selected ticket and view (#/ticket/T-101?view=high).
  const { route, navigate } = useHashRoute();
  const [filters, setFilters] = useState<QueueFilters>(NO_FILTERS);
  const [sort, setSort] = useState<SortId>("priority");
  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const selectedId = route.ticketId;
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [ticketLoading, setTicketLoading] = useState(false);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);

  useEffect(() => {
    api.meta().then(setMeta).catch((err) => setListError(message(err)));
    const check = () => api.health().then(setHealth).catch(() => setHealth("unreachable"));
    check();
    const timer = window.setInterval(check, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setListLoading(true);
    setListError(null);
    api
      .listTickets({}, controller.signal) // views, filters and counts are computed client-side from this one list
      .then((res) => setTickets(res.items))
      .catch((err) => {
        if (!controller.signal.aborted) setListError(message(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setListLoading(false);
      });
    return () => controller.abort();
  }, [reloadKey]);

  useEffect(() => {
    if (!selectedId) {
      setTicket(null);
      setTicketError(null);
      return;
    }
    const controller = new AbortController();
    setTicketLoading(true);
    setTicketError(null);
    setReviewError(null);
    api
      .getTicket(selectedId, controller.signal)
      .then(setTicket)
      .catch((err) => {
        if (!controller.signal.aborted) {
          setTicket(null);
          // A bad ID in the URL (404, or 422 for a malformed one) is a normal state, not a crash.
          setTicketError(err instanceof ApiError && (err.kind === "not_found" || err.kind === "validation") ? `Ticket not found: ${selectedId}` : message(err));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setTicketLoading(false);
      });
    return () => controller.abort();
  }, [selectedId]);

  const selectTicket = useCallback((id: string) => navigate({ ticketId: id }), [navigate]);

  // Optimistic: the UI flips to "Reviewed" at once and rolls back, with an inline error, if the request fails.
  const markReviewed = useCallback(async () => {
    if (!ticket || ticket.reviewed_at) return;
    const id = ticket.id;
    const stamp = new Date().toISOString();
    setReviewError(null);
    setTicket((t) => (t && t.id === id ? { ...t, reviewed_at: stamp } : t));
    setTickets((list) => list.map((t) => (t.id === id ? { ...t, reviewed_at: stamp } : t)));
    try {
      const updated = await api.markReviewed(id);
      setTicket((t) => (t && t.id === id ? updated : t));
      setTickets((list) => list.map((t) => (t.id === id ? { ...t, reviewed_at: updated.reviewed_at } : t)));
    } catch (err) {
      setTicket((t) => (t && t.id === id ? { ...t, reviewed_at: null } : t));
      setTickets((list) => list.map((t) => (t.id === id ? { ...t, reviewed_at: null } : t)));
      setReviewError(`Could not mark ${id} reviewed: ${message(err)}`);
    }
  }, [ticket]);

  const copilot = useCopilot(ticket?.id ?? null);
  const untrusted = untrustedPositions(copilot.session.brief.response?.warnings ?? [], ticket?.messages ?? []);

  return (
    <div className="app-shell">
      <TopBar health={health} theme={theme} onToggleTheme={toggleTheme} />
      <div className="panes">
        <nav className="pane pane-queue" aria-label="Ticket queue">
          <QueuePane
            meta={meta}
            tickets={tickets}
            view={route.view}
            onView={(view: ViewId) => navigate({ view })}
            filters={filters}
            onFilters={setFilters}
            sort={sort}
            onSort={setSort}
            loading={listLoading}
            error={listError}
            onRetry={() => setReloadKey((k) => k + 1)}
            selectedId={selectedId}
            onSelect={selectTicket}
          />
        </nav>
        <main className="pane pane-ticket">
          <TicketPane
            ticket={ticket}
            loading={ticketLoading}
            error={ticketError}
            reviewError={reviewError}
            untrusted={untrusted}
            onMarkReviewed={markReviewed}
            composer={
              ticket && (
                <ReplyComposer
                  draft={copilot.session.draft}
                  text={copilot.session.draftText}
                  onText={copilot.setDraftText}
                  onDraft={copilot.runDraft}
                  onReset={copilot.resetDraft}
                />
              )
            }
          />
        </main>
        <aside className="pane pane-copilot" aria-label="Copilot">
          <CopilotPanel ticket={ticket} meta={meta} copilot={copilot} onOpenTicket={selectTicket} />
        </aside>
      </div>
    </div>
  );
}
