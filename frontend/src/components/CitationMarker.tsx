import { useRef, useState, type KeyboardEvent } from "react";
import { SourcePreview } from "./SourcePreview";
import type { SourceRef } from "./SourceDetails";

interface Props {
  n: number;
  source: SourceRef;
  threshold: number | null;
  onView: (source: SourceRef) => void;
}

/** A superscript number that is a real button. Hover, focus or tap opens the preview and a click keeps it
 * open (a mouse click is always preceded by a hover, so it must not toggle); Esc, blur or leaving closes it. */
export function CitationMarker({ n, source, threshold, onView }: Props) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const timer = useRef<number | undefined>(undefined);
  // Set when the drawer opens from this marker: the focus the drawer later hands back must not re-open the preview.
  const restoring = useRef(false);

  const show = () => {
    window.clearTimeout(timer.current);
    setOpen(true);
  };
  // A short delay lets the pointer travel from the marker to the card without it closing.
  const hideSoon = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(false), 160);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && open) {
      e.stopPropagation();
      setOpen(false);
      button.current?.focus();
    }
  };

  return (
    <span className="cite" ref={wrap} onKeyDown={onKeyDown} onMouseEnter={show} onMouseLeave={hideSoon}
      onBlur={(e) => { if (!wrap.current?.contains(e.relatedTarget as Node | null)) setOpen(false); }}>
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
