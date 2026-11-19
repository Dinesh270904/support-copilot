import { useEffect, useRef, type ReactNode } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { XIcon } from "./Icons";

interface Props {
  open: boolean;
  title: string;
  label: string;
  onClose: () => void;
  /** Focus returns here on close (the opener can unmount, so this is explicit). */
  returnTo?: HTMLElement | null;
  /** Which edge it slides from (default right). */
  side?: "left" | "right";
  children: ReactNode;
}

/** A 480px right-hand drawer: focus-trapped, Esc and the scrim close it, focus returns to the control that opened it. */
export function Drawer({ open, title, label, onClose, returnTo, side = "right", children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, open, returnTo);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className={`drawer-scrim drawer-${side}`} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="drawer" ref={ref} role="dialog" aria-modal="true" aria-label={label}>
        <header className="drawer-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" data-autofocus onClick={onClose} aria-label={`Close ${title.toLowerCase()}`}><XIcon size={16} /></button>
        </header>
        <div className="drawer-body">{children}</div>
      </div>
    </div>
  );
}
