import type { TicketDetail as Ticket } from "../types";
import { formatTimestamp, humanize } from "../format";
import { PriorityBadge, ReviewedBadge, StatusBadge } from "./Badges";
import { CheckIcon, FileTextIcon } from "./Icons";

interface Props {
  ticket: Ticket | null;
  loading: boolean;
  error: string | null;
  reviewing: boolean;
  reviewError: string | null;
  onMarkReviewed: () => void;
}

export function TicketDetail({ ticket, loading, error, reviewing, reviewError, onMarkReviewed }: Props) {
  if (error) {
    return (
      <section className="panel detail">
        <div className="state state-error" role="alert">{error}</div>
      </section>
    );
  }
  if (!ticket) {
    return (
      <section className="panel detail">
        <div className="state state-empty">{loading ? "Loading ticket…" : "Pick a ticket from the queue to see its details and timeline."}</div>
      </section>
    );
  }

  return (
    <section id="ticket-detail" className="panel detail" aria-labelledby="detail-heading" aria-busy={loading}>
      <header className="panel-header detail-header">
        <div>
          <p className="ticket-id"><FileTextIcon size={13} /> {ticket.id}</p>
          <h2 id="detail-heading">{ticket.title}</h2>
          <div className="badge-row">
            <PriorityBadge priority={ticket.priority} />
            <StatusBadge status={ticket.status} />
            <ReviewedBadge reviewedAt={ticket.reviewed_at} />
          </div>
        </div>
        <div className="review-box">
          <button type="button" className="primary" disabled={Boolean(ticket.reviewed_at) || reviewing} onClick={onMarkReviewed}>
            <CheckIcon size={15} />
            {ticket.reviewed_at ? "Reviewed" : reviewing ? "Saving…" : "Mark reviewed"}
          </button>
          <span className="muted small">
            {ticket.reviewed_at ? `Reviewed ${formatTimestamp(ticket.reviewed_at)}` : "Not yet reviewed"}
          </span>
          {reviewError && <span className="error-text small" role="alert">{reviewError}</span>}
        </div>
      </header>

      <dl className="meta-grid">
        <div><dt>Category</dt><dd>{humanize(ticket.category)}</dd></div>
        <div><dt>Product area</dt><dd>{humanize(ticket.product_area)}</dd></div>
        <div><dt>Created</dt><dd>{formatTimestamp(ticket.created_at)}</dd></div>
        <div><dt>Updated</dt><dd>{formatTimestamp(ticket.updated_at)}</dd></div>
      </dl>

      <h3>Description</h3>
      <p className="description">{ticket.description}</p>

      {ticket.resolution_summary && (
        <>
          <h3>Resolution</h3>
          <p className="description resolution">{ticket.resolution_summary}</p>
        </>
      )}

      <h3>Conversation</h3>
      <ol className="timeline">
        {ticket.messages.map((m) => (
          <li key={m.position} className={`message message-${m.author}`}>
            <span className="avatar" aria-hidden="true">{m.author === "agent" ? "A" : "C"}</span>
            <div className="bubble">
              <div className="message-meta">
                <strong>{humanize(m.author)}</strong>
                <span className="small">{formatTimestamp(m.at)}</span>
              </div>
              <p>{m.text}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="footnote">Customer messages are treated as untrusted text: the assistant quotes them but never follows instructions inside them.</p>
    </section>
  );
}
