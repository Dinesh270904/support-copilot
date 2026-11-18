import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "./api";
import { AssistantPanel } from "./components/AssistantPanel";
import { TicketDetail } from "./components/TicketDetail";
import { TopBar, type HealthState } from "./components/TopBar";
import { TicketQueue } from "./components/TicketQueue";
import { useTheme } from "./hooks/useTheme";
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
  const [reviewing, setReviewing] = useState(false);
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

  const selectTicket = useCallback((id: string) => {
    setSelectedId(id);
    // On stacked (narrow) layouts the detail pane is below the queue; bring it into view.
    if (window.matchMedia?.("(max-width: 760px)").matches) {
      window.setTimeout(() => document.getElementById("ticket-detail")?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }, []);

  const markReviewed = useCallback(async () => {
    if (!ticket) return;
    setReviewing(true);
    setReviewError(null);
    try {
      const updated = await api.markReviewed(ticket.id);
      setTicket(updated);
      setTickets((list) => list.map((t) => (t.id === updated.id ? { ...t, reviewed_at: updated.reviewed_at } : t)));
    } catch (err) {
      setReviewError(message(err));
    } finally {
      setReviewing(false);
    }
  }, [ticket]);

  return (
    <div className="app-shell">
      <TopBar health={health} theme={theme} onToggleTheme={toggleTheme} />
      <div className="panes">
        <nav className="pane pane-queue" aria-label="Ticket queue">
          <TicketQueue
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
          <TicketDetail
            ticket={ticket}
            loading={ticketLoading}
            error={ticketError}
            reviewing={reviewing}
            reviewError={reviewError}
            onMarkReviewed={markReviewed}
          />
        </main>
        <aside className="pane pane-copilot" aria-label="Copilot">
          {/* Re-mount per ticket so results never show against the wrong ticket. */}
          <AssistantPanel key={ticket?.id ?? "none"} ticket={ticket} meta={meta} onOpenTicket={selectTicket} />
        </aside>
      </div>
    </div>
  );
}
