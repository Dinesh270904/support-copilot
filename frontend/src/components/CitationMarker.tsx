import { useRef, useState, type KeyboardEvent } from "react";
import { SourcePreview } from "./SourcePreview";
import type { SourceRef } from "./SourceDetails";

interface Props {
  n: number;
  source: SourceRef;
  threshold: number | null;
  onView: (source: SourceRef) => void;
  /** Lets the card highlight the matching row in its source list while the marker is hovered or focused. */
  onActive?: (id: string | null) => void;
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
/** The next focusable element after `el` in document order, ignoring the (portalled) previews. */
function nextFocusableAfter(el: HTMLElement | null): HTMLElement | null {
  if (!el) return null;
  const all = [...document.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((e) => !e.closest("[hidden],[inert],.preview") && e.getClientRects().length > 0);
  const i = all.indexOf(el);
  return i >= 0 ? (all[i + 1] ?? null) : null;
}

/** A superscript number that is a real button. Hover, focus or tap opens the preview and a click keeps it
 * open (a mouse click is always preceded by a hover, so it must not toggle); Esc, blur or leaving closes it. */
export function CitationMarker({ n, source, threshold, onView, onActive }: Props) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const preview = useRef<HTMLDivElement>(null); // the preview lives on <body> (a portal), so DOM containment alone cannot tell 'still inside'
  const timer = useRef<number | undefined>(undefined);
  // Set when the drawer opens from this marker: the focus the drawer later hands back must not re-open the preview.
  const restoring = useRef(false);

  const show = () => {
    window.clearTimeout(timer.current);
    setOpen(true);
    onActive?.(source.citation.source_id);
  };
  // Hover opens after 150ms (so passing over a marker does not flash a card); focus and click open at once.
  const hoverShow = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(show, 150);
  };
  // Leaving closes after 200ms, so the pointer can travel from the marker to the card.
  const hideSoon = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setOpen(false);
      onActive?.(null);
    }, 200);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && open) {
      e.stopPropagation();
      setOpen(false);
      onActive?.(null);
      button.current?.focus();
    } else if (e.key === "Tab" && open) {
      // The preview lives on <body> (a portal), so Tab from the marker would skip it. Route Tab explicitly:
      // marker -> the preview's button; Shift+Tab from the preview -> the marker; Tab from the preview -> the element after the marker (closing it).
      const inPreview = preview.current?.contains(e.target as Node) ?? false;
      if (!inPreview && !e.shiftKey) {
        const into = preview.current?.querySelector<HTMLElement>("button");
        if (into) { e.preventDefault(); into.focus(); }
      } else if (inPreview && e.shiftKey) {
        e.preventDefault();
        button.current?.focus(); // back to the marker; the preview stays open
      } else if (inPreview) {
        e.preventDefault(); // forward out of the preview: close it and carry on to the element after the marker, as Tab would have
        setOpen(false);
        onActive?.(null);
        (nextFocusableAfter(button.current) ?? button.current)?.focus();
      }
    }
  };

  return (
    <span className="cite" ref={wrap} onKeyDown={onKeyDown} onMouseEnter={hoverShow} onMouseLeave={hideSoon}
      onBlur={(e) => { const to = e.relatedTarget as Node | null; if (!wrap.current?.contains(to) && !preview.current?.contains(to)) { setOpen(false); onActive?.(null); } }}>
      <button
        ref={button}
        type="button"
        className="cite-marker"
        aria-expanded={open}
        aria-label={`Source ${n}: ${source.citation.source_id}, ${source.citation.title}`}
        onFocus={() => {
          if (restoring.current) restoring.current = false;
          else show();
        }}
        onClick={show}
      >
        <sup className="num">{n}</sup>
      </button>
      {open && (
        <SourcePreview
          source={{ ...source, n }}
          threshold={threshold}
          anchor={button}
          rootRef={preview}
          onEnter={show}
          onLeave={hideSoon}
          onView={() => { restoring.current = true; setOpen(false); onView({ ...source, n, opener: button.current }); }}
        />
      )}
    </span>
  );
}
