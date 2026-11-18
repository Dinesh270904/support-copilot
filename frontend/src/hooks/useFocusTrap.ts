import { useEffect, type RefObject } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/** While `active`: focus moves into the dialog, Tab cycles inside it, and focus returns to whatever
 * had it before when the dialog closes. Esc handling is left to the dialog itself. */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean, returnTo?: HTMLElement | null) {
  useEffect(() => {
    const node = ref.current;
    if (!active || !node) return;
    const previous = document.activeElement as HTMLElement | null;
    (node.querySelector<HTMLElement>("[data-autofocus]") ?? node.querySelector<HTMLElement>(FOCUSABLE))?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    node.addEventListener("keydown", onKey);
    return () => {
      node.removeEventListener("keydown", onKey);
      // The opener can unmount (a hover preview closes when the drawer opens), so prefer an explicit target.
      const target = returnTo && returnTo.isConnected ? returnTo : previous;
      target?.focus?.();
    };
  }, [ref, active, returnTo]);
}
