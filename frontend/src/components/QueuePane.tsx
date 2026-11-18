import { useCallback, useRef, useState } from "react";
import { humanize } from "../format";
import { useDismiss } from "../hooks/useDismiss";
import type { Meta, Priority, Status, TicketFilters, TicketListItem } from "../types";
import { FilterIcon, XIcon } from "./Icons";
import { QueueRow } from "./QueueRow";

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

const STATUS_OPTIONS: { value: Status | undefined; label: string }[] = [
  { value: undefined, label: "All" },
  { value: "open", label: "Open" },
  { value: "resolved", label: "Resolved" },
];

export function QueuePane({ meta, filters, onFiltersChange, tickets, total, loading, error, onRetry, selectedId, onSelect }: Props) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setPopoverOpen(false), []);
  useDismiss(popRef, popoverOpen, close);

  const set = <K extends keyof TicketFilters>(key: K, value: TicketFilters[K]) =>
    onFiltersChange({ ...filters, [key]: value || undefined });
  const activeCount = (filters.priority ? 1 : 0) + (filters.category ? 1 : 0);
  const anyFilter = activeCount > 0 || Boolean(filters.status);

  return (
    <section className="queue" aria-labelledby="queue-heading">
      <header className="queue-head">
        <h2 id="queue-heading">Queue</h2>
        <span className="queue-count num" aria-live="polite">{loading ? "Loading…" : `${total} ticket${total === 1 ? "" : "s"}`}</span>
      </header>

      <div className="queue-controls">
        <div className="segmented" role="group" aria-label="Status">
          {STATUS_OPTIONS.map((o) => (
            <button key={o.label} type="button" aria-pressed={filters.status === o.value} onClick={() => set("status", o.value)}>
              {o.label}
            </button>
          ))}
        </div>
        <div className="popover-anchor" ref={popRef}>
          <button
            type="button"
            className={`filters-btn${activeCount ? " active" : ""}`}
            aria-haspopup="dialog"
            aria-expanded={popoverOpen}
            onClick={() => setPopoverOpen((o) => !o)}
          >
            <FilterIcon size={14} /> Filters{activeCount ? <span className="filters-count num">{activeCount}</span> : null}
          </button>
          {popoverOpen && (
            <div className="popover filters-popover" role="dialog" aria-label="Filters">
              <fieldset>
                <legend>Priority</legend>
                <div className="chip-group">
                  {(["high", "medium", "low"] as Priority[]).map((p) => (
                    <button key={p} type="button" className="chip" aria-pressed={filters.priority === p} onClick={() => set("priority", filters.priority === p ? undefined : p)}>
                      {humanize(p)}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend>Category</legend>
                <div className="chip-group">
                  {meta?.categories.map((c) => (
                    <button key={c} type="button" className="chip" aria-pressed={filters.category === c} onClick={() => set("category", filters.category === c ? undefined : c)}>
                      {humanize(c)}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
          )}
        </div>
      </div>

      {(filters.priority || filters.category) && (
        <div className="active-chips" aria-label="Active filters">
          {filters.priority && (
            <button type="button" className="chip chip-active" onClick={() => set("priority", undefined)} aria-label={`Remove filter: ${humanize(filters.priority)} priority`}>
              {humanize(filters.priority)} priority <XIcon size={12} />
            </button>
          )}
          {filters.category && (
            <button type="button" className="chip chip-active" onClick={() => set("category", undefined)} aria-label={`Remove filter: ${humanize(filters.category)}`}>
              {humanize(filters.category)} <XIcon size={12} />
            </button>
          )}
        </div>
      )}

      {error ? (
        <div className="notice notice-danger" role="alert">
          <p>{error}</p>
          <button type="button" className="btn" onClick={onRetry}>Retry</button>
        </div>
      ) : !loading && tickets.length === 0 ? (
        <div className="notice">
          <p>No tickets match these filters.</p>
          {anyFilter && <button type="button" className="btn" onClick={() => onFiltersChange({})}>Clear filters</button>}
        </div>
      ) : (
        <ul className="qlist" aria-busy={loading}>
          {tickets.map((t) => (
            <li key={t.id}>
              <QueueRow ticket={t} selected={t.id === selectedId} onSelect={onSelect} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
