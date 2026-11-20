import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { humanize } from "../format";
import { useDismiss } from "../hooks/useDismiss";
import { VIEWS, countViews, filterCount, visibleTickets, type QueueFilters, type SortId, type ViewId, NO_FILTERS } from "../lib/views";
import type { Meta, Priority, TicketListItem } from "../types";
import { CategoryDot, CheckCircleIcon, EyeIcon, InboxIcon, LayersIcon, SignalIcon, SlidersIcon, XIcon } from "./Icons";
import { QueueRow } from "./QueueRow";

const VIEW_ICON = { open: InboxIcon, high: SignalIcon, review: EyeIcon, resolved: CheckCircleIcon, all: LayersIcon };

interface Props {
  meta: Meta | null;
  tickets: TicketListItem[];
  view: ViewId;
  onView: (view: ViewId) => void;
  filters: QueueFilters;
  onFilters: (filters: QueueFilters) => void;
  sort: SortId;
  onSort: (sort: SortId) => void;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

export function QueuePane({ meta, tickets, view, onView, filters, onFilters, sort, onSort, loading, error, onRetry, selectedId, onSelect }: Props) {
  const [popover, setPopover] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setPopover(false), []);
  useDismiss(popRef, popover, close);

  // Counts reflect the whole loaded list, so each view shows what is in it regardless of filters.
  const counts = useMemo(() => countViews(tickets), [tickets]);
  const rows = useMemo(() => visibleTickets(tickets, view, filters, sort), [tickets, view, filters, sort]);

  // After j/k (or any selection change) keep the selected row on screen without jumping the list.
  useEffect(() => {
    document.querySelector<HTMLElement>('.qlist [aria-current="true"]')?.scrollIntoView?.({ block: "nearest" });
  }, [selectedId]);
  const active = filterCount(filters);

  return (
    <section className="queue" aria-labelledby="queue-heading">
      <h2 id="queue-heading" className="sr-only">Queue</h2>

      <ul className="views" aria-label="Views">
        {VIEWS.map((v) => {
          const Icon = VIEW_ICON[v.id];
          return (
            <li key={v.id}>
              <button type="button" className="view-row" aria-pressed={view === v.id} onClick={() => onView(v.id)}>
                <Icon size={16} weight={view === v.id ? "fill" : "regular"} />
                <span className="view-label">{v.label}</span>
                <span className="view-count num">{loading ? "" : counts[v.id]}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="queue-tools">
        <div className="popover-anchor" ref={popRef}>
          <button type="button" className={`filters-btn${active ? " active" : ""}`} aria-haspopup="dialog" aria-expanded={popover} onClick={() => setPopover((o) => !o)}>
            <SlidersIcon size={14} /> Filters{active ? <span className="filters-count num">{active}</span> : null}
          </button>
          {popover && (
            <div className="popover filters-popover" role="dialog" aria-label="Filters">
              <fieldset>
                <legend>Priority</legend>
                {(["high", "medium", "low"] as Priority[]).map((p) => (
                  <label key={p} className="check">
                    <input type="checkbox" checked={filters.priorities.includes(p)} onChange={() => onFilters({ ...filters, priorities: toggle(filters.priorities, p) })} />
                    <span>{humanize(p)}</span>
                  </label>
                ))}
              </fieldset>
              <fieldset>
                <legend>Category</legend>
                {meta?.categories.map((c) => (
                  <label key={c} className="check">
                    <input type="checkbox" checked={filters.categories.includes(c)} onChange={() => onFilters({ ...filters, categories: toggle(filters.categories, c) })} />
                    <CategoryDot category={c} />
                    <span>{humanize(c)}</span>
                  </label>
                ))}
              </fieldset>
              {active > 0 && <button type="button" className="link-btn" onClick={() => onFilters(NO_FILTERS)}>Clear all</button>}
            </div>
          )}
        </div>
        <label className="sort">
          <span className="sr-only">Sort</span>
          <select value={sort} onChange={(e) => onSort(e.target.value as SortId)}>
            <option value="priority">Priority, then newest</option>
            <option value="newest">Newest first</option>
          </select>
        </label>
      </div>

      {active > 0 && (
        <div className="active-chips" aria-label="Active filters">
          {filters.priorities.map((p) => (
            <button key={p} type="button" className="chip chip-active" aria-label={`Remove filter Priority: ${humanize(p)}`} onClick={() => onFilters({ ...filters, priorities: toggle(filters.priorities, p) })}>
              Priority: {humanize(p)} <XIcon size={12} />
            </button>
          ))}
          {filters.categories.map((c) => (
            <button key={c} type="button" className="chip chip-active" aria-label={`Remove filter Category: ${humanize(c)}`} onClick={() => onFilters({ ...filters, categories: toggle(filters.categories, c) })}>
              Category: {humanize(c)} <XIcon size={12} />
            </button>
          ))}
        </div>
      )}

      {error ? (
        <div className="notice notice-danger" role="alert">
          <p>{error}</p>
          <button type="button" className="btn" onClick={onRetry}>Retry</button>
        </div>
      ) : loading ? (
        <ul className="qlist" aria-busy="true" aria-label="Loading tickets">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="qrow-skel"><span className="skeleton-line" style={{ width: "78%" }} /><span className="skeleton-line" style={{ width: "46%" }} /></li>
          ))}
        </ul>
      ) : rows.length === 0 ? (
        <div className="notice">
          {active > 0 ? <p>No tickets match these filters.</p> : <p>No tickets in this view.</p>}
          {active > 0 ? <button type="button" className="btn" onClick={() => onFilters(NO_FILTERS)}>Clear filters</button> : view !== "all" && <button type="button" className="btn" onClick={() => onView("all")}>Show all tickets</button>}
        </div>
      ) : (
        <ul className="qlist">
          {rows.map((t) => (
            <li key={t.id}><QueueRow ticket={t} selected={t.id === selectedId} onSelect={onSelect} showStatus={view === "all"} /></li>
          ))}
        </ul>
      )}
    </section>
  );
}
