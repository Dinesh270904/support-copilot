import { useRef } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { XIcon } from "./Icons";

export const SHORTCUTS: [string, string][] = [
  ["⌘K / Ctrl K", "Command palette"],
  ["j / k", "Next / previous ticket"],
  ["Enter", "Open the focused row"],
  ["/", "Focus Ask"],
  ["s", "Refresh the brief"],
  ["d", "Draft reply"],
  ["r", "Mark reviewed"],
  ["c", "Toggle Copilot (drawer layouts)"],
  ["1–5", "Switch view"],
  ["t", "Toggle theme"],
  ["?", "This sheet"],
  ["Esc", "Close overlay / leave input"],
];

/** The keyboard map. Single-letter keys are ignored while focus is in an input or textarea. */
export function ShortcutSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, open);
  if (!open) return null;
  return (
    <div className="palette-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" ref={ref} role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } }}>
        <header className="drawer-head">
          <h2>Keyboard shortcuts</h2>
          <button type="button" className="icon-btn" data-autofocus onClick={onClose} aria-label="Close shortcuts"><XIcon size={16} /></button>
        </header>
        <table className="sheet-table">
          <tbody>
            {SHORTCUTS.map(([key, what]) => (
              <tr key={key}><th scope="row"><kbd>{key}</kbd></th><td>{what}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="sheet-note">Single-letter keys are ignored while you are typing in a field.</p>
      </div>
    </div>
  );
}
