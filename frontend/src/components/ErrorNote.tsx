import type { ApiError } from "../api";
import { AlertIcon, PlugIcon, XIcon } from "./Icons";

/** What happened and what to do next, in user terms, without apologising. */
function describe(error: ApiError): { title: string; body: string; tone: "warn" | "danger"; retry: boolean } {
  if (error.kind === "validation") return { title: "Request rejected", body: error.message, tone: "warn", retry: false };
  if (error.kind === "not_found") return { title: "Ticket not found", body: error.message, tone: "danger", retry: false };
  if (error.status === 504) return { title: "The tool server took too long", body: "Try again; if it repeats, check the API logs.", tone: "danger", retry: true };
  if (error.status === 503) return { title: "Assistant tools are offline", body: "The MCP server isn't reachable. Ticket browsing still works.", tone: "danger", retry: true };
  if (error.kind === "network") return { title: "API unreachable", body: "Check that the backend is running.", tone: "danger", retry: true };
  if (error.kind === "unavailable") return { title: "An assistant tool failed", body: error.message, tone: "danger", retry: true };
  return { title: "Something went wrong", body: error.message, tone: "danger", retry: true };
}

/** Inline error for the card that failed; other cards keep working. 422 is amber (the user can fix it);
 * the rest are red with a Retry. The request ID is always shown when there is one. */
export function ErrorNote({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  const d = describe(error);
  return (
    <div className={`error-note error-note-${d.tone}`} role="alert">
      <p className="error-note-title">{d.tone === "danger" ? <XIcon size={14} /> : <AlertIcon size={14} />} {d.title}</p>
      <p>{d.body}</p>
      {error.requestId && <p className="error-note-id num">Request ID {error.requestId}</p>}
      {d.retry && onRetry && <button type="button" className="btn" onClick={onRetry}>Retry</button>}
    </div>
  );
}

export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="skeleton" role="status" aria-label="Calling MCP tools">
      {Array.from({ length: lines }, (_, i) => <span key={i} className="skeleton-line" style={{ width: `${92 - i * 14}%` }} />)}
      <span className="skeleton-note"><PlugIcon size={13} /> Calling MCP tools…</span>
    </div>
  );
}
