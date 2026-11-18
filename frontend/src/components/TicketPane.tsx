import type { ReactNode } from "react";
import { formatTimestamp, humanize } from "../format";
import type { TicketDetail } from "../types";
import { CheckIcon, PriorityIcon } from "./Icons";
import { Conversation } from "./Conversation";

interface Props {
  ticket: TicketDetail | null;
  loading: boolean;
  error: string | null;
  reviewError: string | null;
  untrusted: Set<number>;
  onMarkReviewed: () => void;
  /** The reply composer, docked under the conversation. */
  composer?: ReactNode;
  /** Shown when no ticket is selected (the overview, step 8). */
  empty?: ReactNode;
}

export function TicketPane({ ticket, loading, error, reviewError, untrusted, onMarkReviewed, composer, empty }: Props) {
  if (error) {
    return <div className="ticket-scroll"><div className="notice notice-danger" role="alert">{error}</div></div>;
  }
  if (!ticket) {
    return <div className="ticket-scroll">{empty ?? <div className="notice">{loading ? "Loading ticket…" : "Pick a ticket from the queue."}</div>}</div>;
  }
  return (
    <>
      <div className="ticket-scroll" aria-busy={loading}>
        <header className="ticket-head">
          <div className="ticket-head-main">
            <p className="ticket-kicker">
              <span className="num">{ticket.id}</span>
              <span className="kicker-item"><PriorityIcon priority={ticket.priority} /> {humanize(ticket.priority)}</span>
              <span className="kicker-item">{humanize(ticket.status)}</span>
            </p>
            <h2 className="ticket-title">{ticket.title}</h2>
            <p className="ticket-meta">
              {humanize(ticket.category)}{ticket.product_area !== ticket.category && <> · {humanize(ticket.product_area)}</>} · Created <span className="num">{formatTimestamp(ticket.created_at)}</span>
            </p>
          </div>
          <div className="review-box">
            {ticket.reviewed_at ? (
              <p className="reviewed-line"><CheckIcon size={14} /> Reviewed <span className="num">{formatTimestamp(ticket.reviewed_at)}</span></p>
            ) : (
              <button type="button" className="btn btn-primary" onClick={onMarkReviewed}>
                <CheckIcon size={14} /> Mark reviewed
              </button>
            )}
            {reviewError && <p className="inline-error" role="alert">{reviewError}</p>}
          </div>
        </header>

        <section className="ticket-block" aria-labelledby="desc-h">
          <h3 id="desc-h" className="block-label">Description</h3>
          <p className="read">{ticket.description}</p>
        </section>
        {ticket.resolution_summary && (
          <section className="ticket-block" aria-labelledby="res-h">
            <h3 id="res-h" className="block-label">Resolution</h3>
            <p className="read resolution-text">{ticket.resolution_summary}</p>
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
