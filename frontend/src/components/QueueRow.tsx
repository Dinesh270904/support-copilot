import type { TicketListItem } from "../types";
import { humanize, relativeTime } from "../format";
import { PriorityIcon } from "./Icons";

interface Props {
  ticket: TicketListItem;
  selected: boolean;
  onSelect: (id: string) => void;
}

export function QueueRow({ ticket: t, selected, onSelect }: Props) {
  const unreviewedOpen = t.status === "open" && !t.reviewed_at;
  return (
    <button
      type="button"
      className={`qrow prio-bar-${t.priority}${selected ? " selected" : ""}`}
      aria-current={selected ? "true" : undefined}
      onClick={() => onSelect(t.id)}
    >
      <span className="qrow-line">
        <PriorityIcon priority={t.priority} />
        <span className="qrow-id num">{t.id}</span>
        <span className="qrow-title">{t.title}</span>
        <time className="qrow-time num" dateTime={t.updated_at} title={`Updated ${t.updated_at}`}>{relativeTime(t.updated_at)}</time>
      </span>
      <span className="qrow-line qrow-meta">
        <span className="qrow-cat">{humanize(t.category)}</span>
        {t.product_area !== t.category && <span className="qrow-area">{humanize(t.product_area)}</span>}
        <span className="qrow-flags">
          {/* Filled dot = open, hollow ring = resolved: shape differs, so it is not colour alone. */}
          <span className={`status-dot status-${t.status}`} role="img" aria-label={humanize(t.status)} title={humanize(t.status)} />
          {t.reviewed_at && <span className="qrow-reviewed" role="img" aria-label="Reviewed" title="Reviewed">✓</span>}
          {unreviewedOpen && <span className="unreviewed-dot" role="img" aria-label="Not reviewed" title="Not reviewed" />}
        </span>
      </span>
    </button>
  );
}
