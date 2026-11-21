import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, api } from "./api";
import { CommandPalette } from "./components/CommandPalette";
import { CopilotPanel } from "./components/CopilotPanel";
import { Drawer } from "./components/Drawer";
import { EmptyOverview } from "./components/EmptyOverview";
import { SparkleIcon } from "./components/Icons";
import { QueueRail } from "./components/QueueRail";
import { TabBar, type Tab } from "./components/TabBar";
import { ShortcutSheet } from "./components/ShortcutSheet";
import { TopBar, type HealthState } from "./components/TopBar";
import { QueuePane } from "./components/QueuePane";
import { ReplyComposer } from "./components/ReplyComposer";
import { TicketPane, type ReviewState } from "./components/TicketPane";
import { useCopilot } from "./hooks/useCopilot";
import { useTheme } from "./hooks/useTheme";
import { untrustedPositions } from "./lib/untrusted";
import { NO_FILTERS, VIEWS, countViews, visibleTickets, type QueueFilters, type SortId, type ViewId } from "./lib/views";
import { parseHash, useHashRoute } from "./hooks/useHashRoute";
import { useHotkeys } from "./hooks/useHotkeys";
import { useLayoutMode } from "./hooks/useLayoutMode";
import type { Meta, TicketDetail as Ticket, TicketListItem } from "./types";

function message(err: unknown): string {
  return err instanceof ApiError ? err.message : "Unexpected error";
}

/** On a phone only one pane is visible at a time, so that pane is the page's `main` landmark; on wider layouts the
 * queue is navigation and the ticket pane is `main`. Hidden panes are out of the accessibility tree either way. */
function PaneLandmark({ phone, as, children, ...rest }: { phone: boolean; as: "nav" | "aside"; children: React.ReactNode } & React.HTMLAttributes<HTMLElement> & { hidden?: boolean; inert?: boolean }) {
  const Tag = phone ? "main" : as;
  return <Tag {...rest}>{children}</Tag>;
}

export default function App() {
  const { theme, toggle: toggleTheme } = useTheme();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [health, setHealth] = useState<HealthState>(null);
  // The URL hash is the source of truth for the selected ticket and view (#/ticket/T-101?view=high).
  const { route, navigate } = useHashRoute();
  const layout = useLayoutMode();
  const drawerMode = layout === "drawer" || layout === "rail"; // the Copilot is a drawer
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false); // the queue list's left drawer (rail layout)
  const [tab, setTab] = useState<Tab>(route.ticketId ? "ticket" : "queue"); // phone layout
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
  const [review, setReview] = useState<ReviewState>({ error: null, confirmed: false });

  const refreshHealth = useCallback(() => void api.health().then(setHealth).catch(() => setHealth("unreachable")), []);

  useEffect(() => {
    api.meta().then(setMeta).catch((err) => setListError(message(err)));
    refreshHealth();
    const timer = window.setInterval(refreshHealth, 30_000);
    return () => window.clearInterval(timer);
  }, [refreshHealth]);

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
    // Switching tickets: drop the previous one at once. Showing T-104 under a URL that says T-108 would let a
    // keystroke (r, d) act on the wrong ticket.
    setTicket((t) => (t && t.id === selectedId ? t : null));
    setTicketLoading(true);
    setTicketError(null);
    setReview({ error: null, confirmed: false });
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

  const selectTicket = useCallback((id: string) => {
    navigate({ ticketId: id });
    setQueueOpen(false);
    setTab("ticket");
  }, [navigate]);

  // Optimistic: the UI flips to "Reviewed" at once and rolls back, with an inline error, if the request fails.
  const markReviewed = useCallback(async () => {
    if (!ticket || ticket.reviewed_at) return;
    const id = ticket.id;
    const stamp = new Date().toISOString();
    setReview({ error: null, confirmed: false });
    setTicket((t) => (t && t.id === id ? { ...t, reviewed_at: stamp } : t));
    setTickets((list) => list.map((t) => (t.id === id ? { ...t, reviewed_at: stamp } : t)));
    try {
      const updated = await api.markReviewed(id);
      setTicket((t) => (t && t.id === id ? updated : t));
      setTickets((list) => list.map((t) => (t.id === id ? { ...t, reviewed_at: updated.reviewed_at } : t)));
      setReview({ error: null, confirmed: true });
      window.setTimeout(() => setReview((r) => ({ ...r, confirmed: false })), 3000);
    } catch (err) {
      setTicket((t) => (t && t.id === id ? { ...t, reviewed_at: null } : t));
      setTickets((list) => list.map((t) => (t.id === id ? { ...t, reviewed_at: null } : t)));
      setReview({ error: { requestId: err instanceof ApiError ? err.requestId : undefined }, confirmed: false });
    }
  }, [ticket]);

  // The R key asks first: a stray keystroke must not write. The button and the palette action stay one step.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const confirming = !!ticket && confirmingId === ticket.id && !ticket.reviewed_at;
  const requestReview = () => {
    if (ticket && !ticket.reviewed_at) setConfirmingId(ticket.id);
  };
  const confirmReview = () => {
    setConfirmingId(null);
    void markReviewed();
  };

  const copilot = useCopilot(ticket?.id ?? null, refreshHealth);

  // A new answer brings the Copilot into view when it is a drawer or its own tab. Only genuinely new answers (ids only
  // grow), so switching to a ticket that already has history does not pop it open.
  const newestAnswer = copilot.session.answers[0]?.id;
  const maxSeen = useRef(0);
  useEffect(() => {
    if (newestAnswer === undefined || newestAnswer <= maxSeen.current) return;
    maxSeen.current = newestAnswer;
    if (drawerMode) setCopilotOpen(true);
    else if (layout === "phone") setTab("copilot");
  }, [newestAnswer, drawerMode, layout]);
  // Back/forward or a reload with a ticket in the URL: show the ticket on the phone layout.
  useEffect(() => {
    if (layout === "phone" && selectedId) setTab((t) => (t === "queue" ? "ticket" : t));
  }, [selectedId, layout]);
  const untrusted = untrustedPositions(copilot.session.brief.response?.warnings ?? [], ticket?.messages ?? []);

  // ---- keyboard: overlays own the keyboard while open; single-letter keys never fire while typing
  const [palette, setPalette] = useState(false);
  const [sheet, setSheet] = useState(false);
  const askRef = useRef<HTMLTextAreaElement>(null);
  const shown = useMemo(() => visibleTickets(tickets, route.view, filters, sort), [tickets, route.view, filters, sort]);
  const step = (delta: 1 | -1) => {
    if (shown.length === 0) return;
    // Read the ticket from the URL at keypress time: state updates on hashchange, so quick presses must not step from a stale one.
    const current = parseHash(window.location.hash).ticketId;
    const at = shown.findIndex((t) => t.id === current);
    const next = at === -1 ? (delta === 1 ? 0 : shown.length - 1) : Math.min(Math.max(at + delta, 0), shown.length - 1);
    navigate({ ticketId: shown[next].id });
  };
  const focusAsk = () => {
    const box = askRef.current;
    // Already on screen: focus now, so characters typed straight after "/" go into the box and not into shortcuts.
    if (box && box.getClientRects().length > 0 && getComputedStyle(box).visibility !== "hidden") return box.focus();
    if (drawerMode) setCopilotOpen(true); // the Ask box lives in the drawer
    if (layout === "phone") setTab("copilot");
    window.setTimeout(() => askRef.current?.focus(), 60); // only a drawer or tab that has to open first needs the delay
  };
  useHotkeys(
    {
      "mod+k": () => setPalette(true),
      j: () => step(1),
      k: () => step(-1),
      "/": focusAsk,
      s: () => ticket && copilot.retryBrief(),
      d: () => ticket && copilot.runDraft(),
      r: requestReview,
      t: toggleTheme,
      "?": () => setSheet(true),
      c: () => {
        if (drawerMode) setCopilotOpen((o) => !o);
        else if (layout === "phone") setTab((t) => (t === "copilot" ? "ticket" : "copilot"));
      },
      Escape: () => {
        if (confirming) return setConfirmingId(null);
        const el = document.activeElement as HTMLElement | null;
        if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT")) el.blur(); // Esc leaves an input
        else if (drawerMode && copilotOpen) setCopilotOpen(false);
      },
      ...Object.fromEntries(VIEWS.map((v, i) => [String(i + 1), () => navigate({ view: v.id })])),
    },
    !palette && !sheet,
  );

  const queuePane = (
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
  );

  return (
    <div className="app-shell" data-layout={layout}>
      <TopBar
        health={health}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenPalette={() => setPalette(true)}
        onOpenShortcuts={() => setSheet(true)}
        copilotToggle={drawerMode ? (
          <button type="button" className="copilot-btn" aria-expanded={copilotOpen} aria-controls="copilot-pane" onClick={() => setCopilotOpen((o) => !o)} title="Toggle Copilot · C">
            <SparkleIcon size={14} /> Copilot <kbd>C</kbd>
          </button>
        ) : undefined}
      />
      <div className="panes">
        <PaneLandmark as="nav" phone={layout === "phone"} className="pane pane-queue" aria-label="Ticket queue" hidden={layout === "phone" && tab !== "queue"}>
          {layout === "rail" ? (
            <QueueRail view={route.view} counts={countViews(tickets)} unknown={listError !== null} onView={(view) => { navigate({ view }); setQueueOpen(true); }} />
          ) : (
            queuePane
          )}
        </PaneLandmark>
        <main className="pane pane-ticket" hidden={layout === "phone" && tab !== "ticket"}>
          <TicketPane
            ticket={ticket}
            loading={ticketLoading}
            error={ticketError}
            review={review}
            untrusted={untrusted}
            onMarkReviewed={markReviewed}
            confirming={confirming}
            onConfirmReview={confirmReview}
            onCancelReview={() => setConfirmingId(null)}
            empty={<EmptyOverview tickets={tickets} loading={listLoading} onOpenTicket={selectTicket} onView={(view) => navigate({ view })} error={layout === "rail" || layout === "phone" ? listError : null} onRetry={() => setReloadKey((k) => k + 1)} />}
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
        <PaneLandmark
          as="aside"
          phone={layout === "phone"}
          id="copilot-pane"
          className={`pane pane-copilot${copilotOpen ? " open" : ""}`}
          aria-label="Copilot"
          hidden={layout === "phone" && tab !== "copilot"}
          inert={drawerMode && !copilotOpen}
        >
          <CopilotPanel ticket={ticket} meta={meta} copilot={copilot} onOpenTicket={selectTicket} askRef={askRef} pendingTicket={selectedId !== null && ticket === null && ticketError === null} />
        </PaneLandmark>
      </div>
      {layout === "rail" && (
        <Drawer open={queueOpen} side="left" title="Queue" label="Ticket queue list" onClose={() => setQueueOpen(false)}>
          {queuePane}
        </Drawer>
      )}
      {layout === "phone" && <TabBar tab={tab} onTab={setTab} />}
      <CommandPalette
        open={palette}
        onClose={() => setPalette(false)}
        tickets={shown}
        hasTicket={ticket !== null}
        theme={theme}
        onOpenTicket={selectTicket}
        onView={(view) => navigate({ view })}
        onRefreshBrief={() => copilot.retryBrief()}
        onFocusAsk={focusAsk}
        onDraft={copilot.runDraft}
        onMarkReviewed={() => void markReviewed()}
        onAskKnowledge={(q) => copilot.ask(q, ticket?.category ?? null)}
        onToggleTheme={toggleTheme}
        onShortcuts={() => setSheet(true)}
      />
      <ShortcutSheet open={sheet} onClose={() => setSheet(false)} />
    </div>
  );
}
