import { createPortal } from "react-dom";
import { useLayoutEffect, useState, type RefObject } from "react";
import { ArrowUpRightIcon } from "./Icons";
import { Excerpt, IdentifierNote, MatchedLine, ScoreLine, type SourceRef } from "./SourceDetails";

interface Props {
  source: SourceRef;
  threshold: number | null;
  anchor: RefObject<HTMLElement | null>;
  /** The marker needs the preview's root to tell 'focus moved into the preview' from 'focus left'. */
  rootRef?: RefObject<HTMLDivElement | null>;
  onView: () => void;
  onEnter: () => void;
  onLeave: () => void;
}

const WIDTH = 360;

/** The hover/focus card for a citation marker: the exact excerpt with the quoted sentence highlighted,
 * the score against the threshold, and a way to open the full source. Positioned from the marker's
 * rectangle and kept inside the viewport (flipped above when there is no room below). */
export function SourcePreview({ source, threshold, anchor, rootRef, onView, onEnter, onLeave }: Props) {
  const [style, setStyle] = useState<React.CSSProperties>({ visibility: "hidden" });
  useLayoutEffect(() => {
    const rect = anchor.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(WIDTH, window.innerWidth - 16);
    const left = Math.max(8, Math.min(rect.left - 12, window.innerWidth - width - 8));
    const below = rect.bottom + 8;
    const room = window.innerHeight - below;
    setStyle(
      room > 220 || rect.top < 240
        ? { left, top: below, width, maxHeight: Math.max(160, room - 8) }
        : { left, bottom: window.innerHeight - rect.top + 8, width, maxHeight: Math.max(160, rect.top - 16) },
    );
  }, [anchor, source]);

  // Rendered on <body>: the preview is position:fixed from the marker's rectangle, and inside the answer's <p> it was invalid HTML
  // (div, blockquote and p inside p), which React reported as console errors on every hover, focus and click.
  return createPortal(
    <div
      ref={rootRef}
      className="preview"
      role="dialog"
      aria-label={`Source ${source.n ?? ""}: ${source.citation.source_id}`.replace("  ", " ")}
      style={style}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <p className="pv-head"><span className="num pv-id">{source.citation.source_id}</span> · <span className="pv-title">{source.citation.title}</span></p>
      <div className="pv-score"><ScoreLine citation={source.citation} threshold={threshold} /><MatchedLine citation={source.citation} /></div>
      <Excerpt citation={source.citation} sentences={source.sentences} />
      <IdentifierNote citation={source.citation} threshold={threshold} />
      <div className="pv-foot">
        <button type="button" className="btn" onClick={onView}>Open source <ArrowUpRightIcon size={14} /></button>
        <span className="pv-esc"><kbd>Esc</kbd> to close</span>
      </div>
    </div>,
    document.body,
  );
}
