import { useEffect, useState } from "react";

/** wide >= 1280 (three panes) | drawer 1024-1279 (Copilot is a drawer) | rail 768-1023 (queue is an icon rail, too)
 * | phone < 768 (one pane and a bottom tab bar). */
export type Layout = "wide" | "drawer" | "rail" | "phone";

const QUERIES = { phone: "(max-width: 767px)", rail: "(max-width: 1023px)", drawer: "(max-width: 1279px)" } as const;

function read(): Layout {
  if (typeof window === "undefined" || !window.matchMedia) return "wide";
  const m = (q: string) => window.matchMedia(q).matches;
  if (m(QUERIES.phone)) return "phone";
  if (m(QUERIES.rail)) return "rail";
  if (m(QUERIES.drawer)) return "drawer";
  return "wide";
}

export function useLayoutMode(): Layout {
  const [layout, setLayout] = useState<Layout>(read);
  useEffect(() => {
    if (!window.matchMedia) return;
    const lists = Object.values(QUERIES).map((q) => window.matchMedia(q));
    const onChange = () => setLayout(read());
    lists.forEach((l) => l.addEventListener("change", onChange));
    onChange();
    return () => lists.forEach((l) => l.removeEventListener("change", onChange));
  }, []);
  return layout;
}
