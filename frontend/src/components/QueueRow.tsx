import type { TicketListItem } from "../types";
import { humanize, relativeTime } from "../format";
import { CategoryDot, PriorityIcon, StatusIcon } from "./Icons";

interface Props {
  ticket: TicketListItem;
  selected: boolean;
  onSelect: (id: string) => void;
}

/** 56px, two lines. Priority is an icon (and a 2px bar for high/medium); status is an icon plus a label;
 * an accent dot marks an open ticket nobody has reviewed. */
export function QueueRow({ ticket: t, selected, onSelect }: Props) {
  const needsReview = t.status === "open" && !t.reviewed_at;
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
        <span className="qrow-title" title={t.title}>{t.title}</span>
        <time className="qrow-time num" dateTime={t.updated_at} title={`Updated ${t.updated_at}`}>{relativeTime(t.updated_at)}</time>
      </span>
      <span className="qrow-line qrow-meta">
        <CategoryDot category={t.category} />
        <span className="qrow-cat">{humanize(t.category)}</span>
        {t.product_area !== t.category && <span className="qrow-area">{humanize(t.product_area)}</span>}
        <span className="qrow-flags">
          <span className="qrow-status"><StatusIcon status={t.status} size={13} />{humanize(t.status)}</span>
          {t.reviewed_at && <span className="qrow-reviewed" role="img" aria-label="Reviewed" title="Reviewed">✓</span>}
          {needsReview && <span className="unreviewed-dot" role="img" aria-label="Needs review" title="Needs review" />}
        </span>
      </span>
    </button>
  );
}
