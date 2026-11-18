import { useLayoutEffect, useState, type RefObject } from "react";
import { SourceDetails, type SourceRef } from "./SourceDetails";

interface Props {
  source: SourceRef;
  threshold: number | null;
  anchor: RefObject<HTMLElement | null>;
  onView: () => void;
  onEnter: () => void;
  onLeave: () => void;
}

const WIDTH = 360;

/** The hover/focus card for a citation marker: the exact excerpt with the quoted sentence highlighted,
 * the score against the threshold, and a way to open the full source. Positioned from the marker's
 * rectangle and kept inside the viewport (flipped above when there is no room below). */
export function SourcePreview({ source, threshold, anchor, onView, onEnter, onLeave }: Props) {
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

  return (
    <div
      className="preview"
      role="dialog"
      aria-label={`Source ${source.n ?? ""}: ${source.citation.source_id}`.replace("  ", " ")}
      style={style}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <SourceDetails source={source} threshold={threshold} />
      <button type="button" className="btn preview-view" onClick={onView}>View source</button>
    </div>
  );
}
