import type { Meta, TicketFilters, TicketListItem } from "../types";
import { humanize } from "../format";
import { PriorityBadge, ReviewedBadge, StatusBadge } from "./Badges";
import { InboxIcon } from "./Icons";

interface Props {
  meta: Meta | null;
  filters: TicketFilters;
  onFiltersChange: (filters: TicketFilters) => void;
  tickets: TicketListItem[];
  total: number;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function TicketQueue(props: Props) {
  const { meta, filters, onFiltersChange, tickets, total, loading, error, selectedId, onSelect } = props;
  const hasFilters = Boolean(filters.status || filters.priority || filters.category);

  function update<K extends keyof TicketFilters>(key: K, value: string) {
    onFiltersChange({ ...filters, [key]: value || undefined });
  }

  return (
    <section className="queue" aria-labelledby="queue-heading">
      <header className="panel-header">
        <h2 id="queue-heading"><InboxIcon size={15} /> Queue</h2>
        <span className="count" aria-live="polite">{loading ? "Loading…" : `${total} ticket${total === 1 ? "" : "s"}`}</span>
      </header>

      <div className="filters" role="group" aria-label="Ticket filters">
        <label>
          Status
          <select value={filters.status ?? ""} onChange={(e) => update("status", e.target.value)}>
            <option value="">All</option>
            {meta?.statuses.map((s) => (
              <option key={s} value={s}>{humanize(s)}</option>
            ))}
          </select>
        </label>
        <label>
          Priority
          <select value={filters.priority ?? ""} onChange={(e) => update("priority", e.target.value)}>
            <option value="">All</option>
            {meta?.priorities.map((p) => (
              <option key={p} value={p}>{humanize(p)}</option>
            ))}
          </select>
        </label>
        <label>
          Category
          <select value={filters.category ?? ""} onChange={(e) => update("category", e.target.value)}>
            <option value="">All</option>
            {meta?.categories.map((c) => (
              <option key={c} value={c}>{humanize(c)}</option>
            ))}
          </select>
        </label>
      </div>

      {error ? (
        <div className="state state-error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={props.onRetry}>Retry</button>
        </div>
      ) : !loading && tickets.length === 0 ? (
        <div className="state state-empty">
          <p>No tickets match these filters. Widen a filter to see more.</p>
          {hasFilters && (
            <button type="button" onClick={() => onFiltersChange({})}>Clear filters</button>
          )}
        </div>
      ) : (
        <ul className="ticket-list" aria-busy={loading}>
          {tickets.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className={`ticket-row priority-${t.priority}${t.id === selectedId ? " selected" : ""}`}
                aria-current={t.id === selectedId ? "true" : undefined}
                onClick={() => onSelect(t.id)}
              >
                <span className="ticket-row-top">
                  <span className="ticket-id">{t.id}</span>
                  <PriorityBadge priority={t.priority} />
                  <StatusBadge status={t.status} />
                  <ReviewedBadge reviewedAt={t.reviewed_at} />
                </span>
                <span className="ticket-title">{t.title}</span>
                <span className="ticket-row-meta">
                  <span>{humanize(t.category)}</span>
                  {t.product_area !== t.category && <span>{humanize(t.product_area)}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
