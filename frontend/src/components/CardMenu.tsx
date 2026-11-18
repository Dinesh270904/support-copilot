import { useCallback, useRef, useState } from "react";
import { useDismiss } from "../hooks/useDismiss";

export interface MenuItem {
  label: string;
  onSelect: () => void;
}

/** The ⋯ menu in a card header. Esc or an outside click closes it. */
export function CardMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);
  return (
    <div className="popover-anchor card-menu" ref={ref}>
      <button type="button" className="icon-btn" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>⋯</button>
      {open && (
        <div className="popover menu" role="menu" aria-label={label}>
          {items.map((it) => (
            <button key={it.label} type="button" role="menuitem" className="menu-item" onClick={() => { close(); it.onSelect(); }}>{it.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}
