import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useScrollMemory } from "../hooks/useScrollMemory";
import type { useCopilot } from "../hooks/useCopilot";
import type { AssistantRunResponse, Meta, TicketDetail } from "../types";
import { AnswerEntryView } from "./AnswerEntryView";
import { AskBox } from "./AskBox";
import { CardSkeleton } from "./ErrorNote";
import { SparkleIcon } from "./Icons";
import { SimilarCard } from "./SimilarCard";
import { SourceDrawer } from "./SourceDrawer";
import { TraceDrawer } from "./TraceDrawer";
import type { SourceRef } from "./SourceDetails";
import { TicketBriefCard } from "./TicketBriefCard";

type Copilot = ReturnType<typeof useCopilot>;

interface Props {
  ticket: TicketDetail | null;
  meta: Meta | null;
  copilot: Copilot;
  onOpenTicket: (id: string) => void;
  askRef?: RefObject<HTMLTextAreaElement | null>;
  /** A ticket is selected in the URL but has not loaded yet: show card skeletons, not the no-ticket message. */
  pendingTicket?: boolean;
}

export function CopilotPanel({ ticket, meta, copilot, onOpenTicket, askRef, pendingTicket }: Props) {
  const { session } = copilot;
  const busy = session.answers[0]?.state.status === "loading";
  const [drawer, setDrawer] = useState<SourceRef | null>(null);
  const closeDrawer = useCallback(() => setDrawer(null), []);
  const [trace, setTrace] = useState<{ result: AssistantRunResponse; opener: HTMLElement | null } | null>(null);
  const closeTrace = useCallback(() => setTrace(null), []);
  // A new answer lands below the brief and similar cards: bring it into view when it is asked for.
  const scrollRef = useScrollMemory(ticket?.id ?? "none");
  const newest = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [announce, setAnnounce] = useState("");
  const newestId = session.answers[0]?.id;
  useEffect(() => {
    if (newestId === undefined) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    newest.current?.scrollIntoView?.({ block: "start", behavior: reduce ? "auto" : "smooth" });
  }, [newestId]);

  // When the newest answer arrives, move focus to its heading and announce it ("Answer ready: ...").
  const newestState = session.answers[0]?.state;
  const wasLoading = useRef<number | undefined>(undefined);
  useEffect(() => {
    const entry = session.answers[0];
    if (!entry) return;
    if (entry.state.status === "loading") wasLoading.current = entry.id;
    else if (entry.state.status === "ok" && wasLoading.current === entry.id && entry.state.response) {
      wasLoading.current = undefined;
      const r = entry.state.response;
      const n = new Set(r.citations.filter((c) => c.usage === "evidence").map((c) => c.article_id ?? c.source_id)).size;
      setAnnounce(`Answer ready: ${r.answer_state === "answered" ? (r.action === "count_tickets" ? "count complete" : `answered from ${n} article${n === 1 ? "" : "s"}`) : r.answer_state === "insufficient_evidence" ? "not enough evidence" : "no results"}`);
      window.setTimeout(() => heading.current?.focus(), 0);
    }
  }, [newestState, session.answers]);
  const threshold = session.answers.find((a) => a.state.response?.retrieval?.min_score != null)?.state.response?.retrieval?.min_score ?? null;
  return (
    <div className="copilot">
      <header className="copilot-head">
        <h2><SparkleIcon size={15} /> Copilot</h2>
        <span className="copilot-for">{ticket ? `Working on ${ticket.id}` : pendingTicket ? "Loading ticket…" : "No ticket selected"}</span>
      </header>

      <p className="sr-only" role="status" aria-live="polite">{announce}</p>
      {/* Results announce politely to screen readers as they arrive. */}
      <div className="copilot-scroll" aria-live="polite" ref={scrollRef}>
        {ticket ? (
          <>
            <TicketBriefCard key={`brief-${ticket.id}`} state={session.brief} onRetry={copilot.retryBrief} />
            <SimilarCard state={session.similar} onRetry={copilot.retrySimilar} onOpenTicket={onOpenTicket} />
          </>
        ) : pendingTicket ? (
          <>
            <section className="card" aria-label="Loading ticket brief"><CardSkeleton /></section>
            <section className="card" aria-label="Loading similar resolved tickets"><CardSkeleton lines={2} /></section>
          </>
        ) : (
          <div className="card">
            <p className="card-lead">Ask anything about the knowledge base, or open a ticket for a brief and similar cases.</p>
          </div>
        )}
        {session.answers.map((entry, i) => (
          <div key={entry.id} ref={i === 0 ? newest : undefined} className="answer-anchor">
            <AnswerEntryView
              entry={entry}
              open={i === 0}
              headingRef={heading}
              onRetry={() => copilot.retryAnswer(entry.id)}
              onOpenTicket={onOpenTicket}
              onViewSource={setDrawer}
              onViewTrace={(result, opener) => setTrace({ result, opener })}
              onDraftHolding={ticket ? copilot.runDraft : undefined}
              onSearchAll={() => copilot.ask(entry.query, null)}
            />
          </div>
        ))}
      </div>

      <SourceDrawer source={drawer} threshold={threshold} onClose={closeDrawer} onOpenTicket={onOpenTicket} />

      <TraceDrawer result={trace?.result ?? null} onClose={closeTrace} returnTo={trace?.opener} />

      <AskBox key={ticket?.id ?? "none"} categories={meta?.categories ?? []} ticketCategory={ticket?.category ?? null} hasTicket={ticket !== null} onAsk={copilot.ask} onCount={copilot.count} inputRef={askRef} busy={busy} />
    </div>
  );
}
