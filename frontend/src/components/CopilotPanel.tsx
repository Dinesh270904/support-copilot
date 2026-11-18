import type { RefObject } from "react";
import type { useCopilot } from "../hooks/useCopilot";
import type { Meta, TicketDetail } from "../types";
import { AnswerEntryView } from "./AnswerEntryView";
import { AskBox } from "./AskBox";
import { SimilarCard } from "./SimilarCard";
import { TicketBriefCard } from "./TicketBriefCard";

type Copilot = ReturnType<typeof useCopilot>;

interface Props {
  ticket: TicketDetail | null;
  meta: Meta | null;
  copilot: Copilot;
  onOpenTicket: (id: string) => void;
  askRef?: RefObject<HTMLTextAreaElement | null>;
}

const COUNT_SUGGESTIONS = ["How many open high-priority tickets are there?", "How many open checkout tickets are there?"];

export function CopilotPanel({ ticket, meta, copilot, onOpenTicket, askRef }: Props) {
  const { session } = copilot;
  const busy = session.answers[0]?.state.status === "loading";
  return (
    <div className="copilot">
      <header className="copilot-head">
        <h2>Copilot</h2>
        <span className="copilot-for">{ticket ? `Working on ${ticket.id}` : "No ticket selected"}</span>
      </header>

      {/* Results announce politely to screen readers as they arrive. */}
      <div className="copilot-scroll" aria-live="polite">
        {ticket ? (
          <>
            <TicketBriefCard key={`brief-${ticket.id}`} state={session.brief} onRetry={copilot.retryBrief} />
            <SimilarCard state={session.similar} onRetry={copilot.retrySimilar} onOpenTicket={onOpenTicket} />
          </>
        ) : (
          <div className="card">
            <p className="card-lead">Pick a ticket to get its brief and similar resolved tickets, or ask the knowledge base across all categories.</p>
            <div className="suggestions" role="group" aria-label="Count suggestions">
              {COUNT_SUGGESTIONS.map((q) => <button key={q} type="button" className="chip" onClick={() => copilot.count(q)}>{q}</button>)}
            </div>
          </div>
        )}
        {session.answers.map((entry, i) => (
          <AnswerEntryView key={entry.id} entry={entry} open={i === 0} onRetry={() => copilot.retryAnswer(entry.id)} onOpenTicket={onOpenTicket} />
        ))}
      </div>

      <AskBox key={ticket?.id ?? "none"} categories={meta?.categories ?? []} ticketCategory={ticket?.category ?? null} onAsk={copilot.ask} inputRef={askRef} busy={busy} />
    </div>
  );
}
