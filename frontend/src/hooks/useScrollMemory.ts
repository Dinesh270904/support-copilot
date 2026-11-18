import { useLayoutEffect, useRef } from "react";

/** Remembers a scroll container's position per key (e.g. per ticket) for the life of the session. */
export function useScrollMemory(key: string) {
  const ref = useRef<HTMLDivElement>(null);
  const saved = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = saved.current.get(key) ?? 0;
    const onScroll = () => saved.current.set(key, el.scrollTop);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [key]);
  return ref;
}
