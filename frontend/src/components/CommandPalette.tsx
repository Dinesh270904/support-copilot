import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiError, api } from "../api";
import { humanize } from "../format";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { rank } from "../lib/fuzzy";
import { VIEWS, type ViewId } from "../lib/views";
import type { AssistantRunResponse, TicketListItem } from "../types";
import { BookIcon, CheckCircleIcon, EyeIcon, FileTextIcon, HashIcon, InboxIcon, KeyboardIcon, LayersIcon, MoonIcon, PenIcon, PriorityIcon, SearchIcon, SignalIcon, SunIcon } from "./Icons";

type Group = "Tickets" | "Actions" | "Views" | "Preferences";
interface Item {
  id: string;
  group: Group;
  label: string;
  /** What fuzzy matching runs against. */
  text: string;
  hint?: string;
  icon: ReactNode;
  run: () => void;
}

const VIEW_ICON = { open: InboxIcon, high: SignalIcon, review: EyeIcon, resolved: CheckCircleIcon, all: LayersIcon };
const VIEW_KEY: Record<ViewId, string> = { open: "1", high: "2", review: "3", resolved: "4", all: "5" };
const MAX_TICKETS = 6;

interface Props {
  open: boolean;
  onClose: () => void;
  /** The queue as currently shown, in order. */
  tickets: TicketListItem[];
  hasTicket: boolean;
  theme: "light" | "dark";
  onOpenTicket: (id: string) => void;
  onView: (view: ViewId) => void;
  onRefreshBrief: () => void;
  onFocusAsk: () => void;
  onDraft: () => void;
  onMarkReviewed: () => void;
  onAskKnowledge: (query: string) => void;
  onToggleTheme: () => void;
  onShortcuts: () => void;
}

/** ⌘K: tickets by ID or title, plus actions, views and preferences, each with its shortcut. Typing "count ..." runs
 * count_tickets and shows the answer inline. A hand-rolled dialog with a combobox and a listbox. */
export function CommandPalette(p: Props) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [count, setCount] = useState<{ status: "idle" | "loading" | "ok" | "error"; response?: AssistantRunResponse; error?: ApiError }>({ status: "idle" });
  const dialog = useRef<HTMLDivElement>(null);
  useFocusTrap(dialog, p.open);

  useEffect(() => {
    if (p.open) {
      setQuery("");
      setActive(0);
      setCount({ status: "idle" });
    }
  }, [p.open]);

  const done = (fn: () => void) => () => {
    p.onClose();
    fn();
  };

  const countQuery = /^count\b/i.test(query.trim()) ? query.trim().replace(/^count\s*/i, "") || "tickets" : null;

  const items = useMemo<Item[]>(() => {
    const tickets: Item[] = p.tickets.map((t) => ({
      id: `ticket-${t.id}`, group: "Tickets", label: `${t.id}  ${t.title}`, text: `${t.id} ${t.title}`,
      icon: <PriorityIcon priority={t.priority} />, run: done(() => p.onOpenTicket(t.id)),
    }));
    const actions: Item[] = [
      ...(p.hasTicket ? [
        { id: "a-summarize", group: "Actions" as const, label: "Summarize current ticket", text: "summarize current ticket brief refresh", hint: "S", icon: <FileTextIcon size={16} />, run: done(p.onRefreshBrief) },
        { id: "a-draft", group: "Actions" as const, label: "Draft reply for current ticket", text: "draft reply for current ticket", hint: "D", icon: <PenIcon size={16} />, run: done(p.onDraft) },
        { id: "a-review", group: "Actions" as const, label: "Mark current ticket reviewed", text: "mark current ticket reviewed", hint: "R", icon: <CheckCircleIcon size={16} />, run: done(p.onMarkReviewed) },
      ] : []),
      { id: "a-ask", group: "Actions", label: "Ask knowledge…", text: "ask knowledge question", hint: "/", icon: <BookIcon size={16} />, run: done(p.onFocusAsk) },
      { id: "a-count", group: "Actions", label: "Count open high-priority tickets", text: "count open high priority tickets", icon: <HashIcon size={16} />, run: () => runCount("open high-priority tickets") },
    ];
    const views: Item[] = VIEWS.map((v) => {
      const Icon = VIEW_ICON[v.id];
      return { id: `v-${v.id}`, group: "Views", label: `View: ${v.label}`, text: `view ${v.label}`, hint: VIEW_KEY[v.id], icon: <Icon size={16} />, run: done(() => p.onView(v.id)) };
    });
    const prefs: Item[] = [
      { id: "p-theme", group: "Preferences", label: `Switch to ${p.theme === "dark" ? "light" : "dark"} theme`, text: "switch theme light dark toggle", hint: "T", icon: p.theme === "dark" ? <SunIcon size={16} /> : <MoonIcon size={16} />, run: done(p.onToggleTheme) },
      { id: "p-keys", group: "Preferences", label: "Keyboard shortcuts", text: "keyboard shortcuts help", hint: "?", icon: <KeyboardIcon size={16} />, run: done(p.onShortcuts) },
    ];
    const q = query.trim();
    const matched = (list: Item[]) => rank(list, q, (i) => i.text);
    const out = [...matched(tickets).slice(0, MAX_TICKETS), ...matched(actions), ...matched(views), ...matched(prefs)];
    if (countQuery !== null) {
      out.unshift({ id: "count-live", group: "Actions", label: `Count tickets: ${countQuery}`, text: "", icon: <HashIcon size={16} />, run: () => runCount(countQuery) });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.tickets, p.hasTicket, p.theme, query, countQuery]);

  async function runCount(text: string) {
    setCount({ status: "loading" });
    try {
      setCount({ status: "ok", response: await api.runAssistant({ action: "count_tickets", query: text }) });
    } catch (err) {
      setCount({ status: "error", error: err instanceof ApiError ? err : undefined });
    }
  }

  const ids = count.response?.count?.ticket_ids ?? [];
  const noResults = query.trim() !== "" && items.length === 0;
  const fallback: Item | null = noResults ? { id: "ask-fallback", group: "Actions", label: `Ask knowledge: ${query.trim()}`, text: "", hint: "⏎", icon: <BookIcon size={16} />, run: done(() => p.onAskKnowledge(query.trim())) } : null;
  const list = fallback ? [fallback] : items;
  const activeIndex = Math.min(active, Math.max(list.length - 1, 0));

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (i + 1) % Math.max(list.length, 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (i - 1 + list.length) % Math.max(list.length, 1)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const item = list[activeIndex];
      if (item?.id === "count-live" && count.status === "ok" && ids.length > 0) return done(() => p.onOpenTicket(ids[0]))();
      item?.run();
    } else if (e.key === "Escape") { e.preventDefault(); p.onClose(); }
  }

  if (!p.open) return null;
  let lastGroup: Group | null = null;
  return (
    <div className="palette-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) p.onClose(); }}>
      <div className="palette" ref={dialog} role="dialog" aria-modal="true" aria-label="Command palette" onKeyDown={onKeyDown}>
        <div className="palette-input">
          <SearchIcon size={16} />
          <input
            data-autofocus
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={list[activeIndex] ? `palette-${list[activeIndex].id}` : undefined}
            aria-label="Search tickets or run an action"
            placeholder="Search tickets or run an action…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); setCount({ status: "idle" }); }}
          />
          <kbd className="kbd-hint">esc</kbd>
        </div>
        {noResults && <p className="palette-empty">No results for “{query.trim()}”.</p>}
        <ul id="palette-list" role="listbox" aria-label="Results" className="palette-list">
          {list.map((item, i) => {
            const header = item.group !== lastGroup && !fallback ? item.group : null;
            lastGroup = item.group;
            return (
              <li key={item.id} role="presentation">
                {header && <p className="palette-group" role="presentation">{header}</p>}
                <div id={`palette-${item.id}`} role="option" aria-selected={i === activeIndex} className={`palette-item${i === activeIndex ? " active" : ""}`}
                  onMouseMove={() => setActive(i)} onClick={() => (item.id === "count-live" && count.status === "ok" && ids.length > 0 ? done(() => p.onOpenTicket(ids[0]))() : item.run())}>
                  <span className="palette-icon">{item.icon}</span>
                  <span className="palette-label">{item.group === "Tickets" ? <><span className="num palette-tid">{item.label.split("  ")[0]}</span> {item.label.split("  ").slice(1).join("  ")}</> : item.label}</span>
                  {item.hint && <kbd className="kbd-hint">{item.hint}</kbd>}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="palette-foot" aria-live="polite">
          {count.status === "loading" && <span>Counting…</span>}
          {count.status === "ok" && count.response && (
            <span>{count.response.count?.count ?? 0} ticket{(count.response.count?.count ?? 0) === 1 ? "" : "s"}{ids.length > 0 && <> : <span className="num">{ids.slice(0, 4).join(", ")}</span> · Open it <kbd>⏎</kbd></>}</span>
          )}
          {count.status === "error" && <span className="palette-error">{count.error?.message ?? "Couldn't count tickets."}</span>}
          {count.status === "idle" && <span className="kbd-hint">{humanize("navigate")} <kbd>↑</kbd> <kbd>↓</kbd> · run <kbd>⏎</kbd></span>}
        </div>
      </div>
    </div>
  );
}
