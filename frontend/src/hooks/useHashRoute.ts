import { useCallback, useEffect, useState } from "react";
import { DEFAULT_VIEW, isViewId, type ViewId } from "../lib/views";

export interface Route {
  ticketId: string | null;
  view: ViewId;
}

/** `#/ticket/T-101?view=open`, or `#/` for no ticket. Pure so it can be tested without a browser. */
export function parseHash(hash: string): Route {
  const [path, query = ""] = hash.replace(/^#/, "").split("?");
  const match = path.match(/^\/ticket\/([^/]+)\/?$/);
  const view = new URLSearchParams(query).get("view");
  return { ticketId: match ? decodeURIComponent(match[1]) : null, view: isViewId(view) ? view : DEFAULT_VIEW };
}

export function buildHash(route: Route): string {
  const query = route.view === DEFAULT_VIEW ? "" : `?view=${route.view}`;
  return route.ticketId ? `#/ticket/${encodeURIComponent(route.ticketId)}${query}` : `#/${query}`;
}

/** The URL hash is the source of truth for the selected ticket and view: back/forward work and a reload
 * restores both. No router dependency. */
export function useHashRoute() {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const navigate = useCallback((next: Partial<Route>) => {
    const merged = { ...parseHash(window.location.hash), ...next };
    const hash = buildHash(merged);
    if (hash !== window.location.hash) window.location.hash = hash; // pushes a history entry; fires hashchange
  }, []);
  return { route, navigate };
}
