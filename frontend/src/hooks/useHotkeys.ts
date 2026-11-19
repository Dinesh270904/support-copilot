import { useEffect, useRef } from "react";

export type HotkeyMap = Record<string, (e: KeyboardEvent) => void>;

const isTyping = (el: EventTarget | null) => {
  const n = el as HTMLElement | null;
  if (!n || !n.tagName) return false;
  return n.tagName === "INPUT" || n.tagName === "TEXTAREA" || n.tagName === "SELECT" || n.isContentEditable;
};

/**
 * Global keyboard shortcuts. Single-letter keys (j, k, d, r, ...) are ignored while focus is in an input, a
 * textarea or a select, and whenever Ctrl/Cmd/Alt is held; only Esc and mod+k work while typing. Keys are matched by
 * `event.key` ("j", "?", "/", "Escape") or "mod+k" for Cmd/Ctrl+K. `enabled=false` turns them all off (an overlay owns the keyboard).
 */
export function useHotkeys(map: HotkeyMap, enabled = true) {
  const ref = useRef(map);
  ref.current = map;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const handlers = ref.current;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        if (handlers["mod+k"]) {
          e.preventDefault();
          handlers["mod+k"](e);
        }
        return;
      }
      if (e.key === "Escape") return void handlers["Escape"]?.(e);
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const handler = handlers[key] ?? handlers[e.key];
      if (handler) {
        e.preventDefault();
        handler(e);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [enabled]);
}
