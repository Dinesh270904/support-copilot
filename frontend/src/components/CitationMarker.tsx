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

/** A superscript number that is a real button. Hover, focus or tap opens the preview and a click keeps it
 * open (a mouse click is always preceded by a hover, so it must not toggle); Esc, blur or leaving closes it. */
export function CitationMarker({ n, source, threshold, onView, onActive }: Props) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
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
    }
  };

  return (
    <span className="cite" ref={wrap} onKeyDown={onKeyDown} onMouseEnter={hoverShow} onMouseLeave={hideSoon}
      onBlur={(e) => { if (!wrap.current?.contains(e.relatedTarget as Node | null)) { setOpen(false); onActive?.(null); } }}>
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
          onEnter={show}
          onLeave={hideSoon}
          onView={() => { restoring.current = true; setOpen(false); onView({ ...source, n, opener: button.current }); }}
        />
      )}
    </span>
  );
}
