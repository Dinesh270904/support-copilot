import { useEffect, useRef, type ReactNode } from "react";
import { formatTime, formatTimestamp, humanize } from "../format";
import { useScrollMemory } from "../hooks/useScrollMemory";
import type { TicketDetail } from "../types";
import { CategoryDot, CheckCircleIcon, PriorityIcon, StatusIcon } from "./Icons";
import { Conversation } from "./Conversation";

export interface ReviewState {
  /** "Couldn't mark reviewed" details, set when the optimistic update was rolled back. */
  error: { requestId?: string } | null;
  /** True for ~3s after a successful review: an aria-live confirmation. */
  confirmed: boolean;
}

interface Props {
  ticket: TicketDetail | null;
  loading: boolean;
  error: string | null;
  review: ReviewState;
  untrusted: Set<number>;
  onMarkReviewed: () => void;
  /** The R shortcut asks before writing; true while that question is on screen. */
  confirming?: boolean;
  onConfirmReview?: () => void;
  onCancelReview?: () => void;
  /** The reply composer, docked under the conversation. */
  composer?: ReactNode;
  /** Shown when no ticket is selected. */
  empty?: ReactNode;
}

export function TicketPane({ ticket, loading, error, review, untrusted, onMarkReviewed, confirming = false, onConfirmReview, onCancelReview, composer, empty }: Props) {
  const scrollRef = useScrollMemory(ticket?.id ?? "none");
  const markRef = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);
  useEffect(() => {
    // Cancelling returns focus to the button the question replaced.
    if (wasConfirming.current && !confirming) markRef.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);
  if (error) {
    return <div className="ticket-scroll"><div className="notice notice-danger" role="alert">{error}</div></div>;
  }
  if (!ticket) {
    return (
      <div className="ticket-scroll">
        {loading ? <div className="ticket-skel" role="status" aria-label="Loading ticket"><span className="skeleton-line" style={{ width: "40%", height: 20 }} /><span className="skeleton-line" style={{ width: "70%" }} /><span className="skeleton-line" style={{ width: "55%", height: 54 }} /><span className="skeleton-line" style={{ width: "45%", height: 54 }} /></div> : (empty ?? <div className="notice">Pick a ticket from the queue.</div>)}
      </div>
    );
  }
  const messageCount = ticket.messages.length;
  return (
    <>
      <div className="ticket-scroll" aria-busy={loading} ref={scrollRef} role="region" aria-label="Ticket details and conversation" tabIndex={0}>
        <header className="ticket-head">
          <div className="ticket-head-main">
            <p className="ticket-kicker">
              <span className="num">{ticket.id}</span>
              <span className="kicker-item"><PriorityIcon priority={ticket.priority} /> {humanize(ticket.priority)}</span>
              <span className="kicker-item"><StatusIcon status={ticket.status} /> {humanize(ticket.status)}</span>
              <span className="kicker-item"><CategoryDot category={ticket.category} /> {humanize(ticket.category)}</span>
            </p>
            <h2 className="ticket-title">{ticket.title}</h2>
            <p className="ticket-meta">
              {ticket.product_area !== ticket.category && <>{humanize(ticket.product_area)} · </>}
              Opened <span className="num">{formatTimestamp(ticket.created_at)}</span> · Updated <span className="num">{formatTime(ticket.updated_at)}</span> · {messageCount} message{messageCount === 1 ? "" : "s"}
            </p>
          </div>
          <div className="review-box">
            {ticket.reviewed_at ? (
              <button type="button" className="btn btn-ghost" disabled>
                <CheckCircleIcon size={16} weight="fill" /> Reviewed <span className="num">{formatTimestamp(ticket.reviewed_at).replace(/^(\d+ \w+) \d{4}, /, "$1, ")}</span>
              </button>
            ) : confirming ? (
              <div className="review-confirm" role="group" aria-label={`Confirm marking ${ticket.id} reviewed`}>
                <p className="review-confirm-q">Mark {ticket.id} reviewed? <span className="muted">Enter to confirm · Esc to cancel</span></p>
                <span className="review-confirm-actions">
                  <button type="button" className="btn btn-primary" autoFocus onClick={onConfirmReview}>Confirm</button>
                  <button type="button" className="btn" onClick={onCancelReview}>Cancel</button>
                </span>
              </div>
            ) : (
              <button type="button" ref={markRef} className="btn btn-primary" onClick={onMarkReviewed} title="Mark reviewed · R"><CheckCircleIcon size={16} /> Mark reviewed <kbd className="kbd-on-accent">R</kbd></button>
            )}
            <p className="review-live" aria-live="polite">{review.confirmed ? `Marked ${ticket.id} reviewed` : ""}</p>
            {review.error && (
              <p className="inline-error" role="alert">
                Couldn't mark reviewed. Try again.{review.error.requestId && <span className="num"> Request ID: {review.error.requestId}</span>}
              </p>
            )}
          </div>
        </header>

        <section className="ticket-block" aria-labelledby="desc-h">
          <h3 id="desc-h" className="block-label">Customer report</h3>
          <p className="read prose-max">{ticket.description}</p>
        </section>
        {ticket.resolution_summary && (
          <section className="ticket-block resolution" aria-labelledby="res-h">
            <h3 id="res-h" className="block-label">Resolution</h3>
            <p className="read prose-max">{ticket.resolution_summary}</p>
          </section>
        )}
        <section className="ticket-block" aria-labelledby="conv-h">
          <h3 id="conv-h" className="block-label">Conversation</h3>
          <Conversation messages={ticket.messages} untrusted={untrusted} />
          <p className="footnote">Customer messages are treated as untrusted text: the assistant quotes them but never follows instructions inside them.</p>
        </section>
      </div>
      {composer}
    </>
  );
}
