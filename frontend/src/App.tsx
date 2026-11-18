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
import type { Meta, TicketDetail as Ticket, TicketFilters, TicketListItem } from "./types";

function message(err: unknown): string {
  return err instanceof ApiError ? err.message : "Unexpected error";
}

export default function App() {
  const { theme, toggle: toggleTheme } = useTheme();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [health, setHealth] = useState<HealthState>(null);
  const [filters, setFilters] = useState<TicketFilters>({});
  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [selectedId, setSelectedId] = useState<string | null>(null);
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
      .listTickets(filters, controller.signal)
      .then((res) => {
        setTickets(res.items);
        setTotal(res.total);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setListError(message(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setListLoading(false);
      });
    return () => controller.abort();
  }, [filters, reloadKey]);

  useEffect(() => {
    if (!selectedId) return;
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
          setTicketError(message(err));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setTicketLoading(false);
      });
    return () => controller.abort();
  }, [selectedId]);

  const selectTicket = useCallback((id: string) => setSelectedId(id), []);

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
            filters={filters}
            onFiltersChange={setFilters}
            tickets={tickets}
            total={total}
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
