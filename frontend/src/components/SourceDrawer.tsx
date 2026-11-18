import { useEffect, useRef } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { ExternalIcon, XIcon } from "./Icons";
import { SourceDetails, type SourceRef } from "./SourceDetails";

interface Props {
  source: SourceRef | null;
  threshold: number | null;
  onClose: () => void;
  onOpenTicket: (id: string) => void;
}

/** Right-hand drawer with the full source. It needs no extra request: everything is already in the
 * response. Focus is trapped while open, Esc closes it, and focus returns to the control that opened it. */
export function SourceDrawer({ source, threshold, onClose, onOpenTicket }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, source !== null, source?.opener);
  useEffect(() => {
    if (!source) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [source, onClose]);
  if (!source) return null;
  const ticketId = source.citation.ticket_id;
  return (
    <div className="drawer-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="drawer" ref={ref} role="dialog" aria-modal="true" aria-label={`Source: ${source.citation.source_id}`}>
        <header className="drawer-head">
          <h2>Source</h2>
          <button type="button" className="icon-btn" data-autofocus onClick={onClose} aria-label="Close source"><XIcon size={16} /></button>
        </header>
        <div className="drawer-body">
          <SourceDetails source={source} threshold={threshold} />
          {ticketId && (
            <button type="button" className="btn" onClick={() => { onClose(); onOpenTicket(ticketId); }}>
              <ExternalIcon size={14} /> Open {ticketId}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
