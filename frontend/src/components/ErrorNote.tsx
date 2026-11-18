import type { ApiError } from "../api";
import { AlertIcon } from "./Icons";

const TITLE: Record<ApiError["kind"], string> = {
  validation: "Request rejected",
  not_found: "Ticket not found",
  unavailable: "Tool server unavailable",
  network: "API unreachable",
  server: "Something went wrong",
};

/** Inline error for the card that failed; other cards keep working. 422 is amber (the user can fix it),
 * 503/504 and other failures are red with a Retry. The request ID is always shown when there is one. */
export function ErrorNote({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  const fixable = error.kind === "validation";
  const retryable = !fixable && error.kind !== "not_found" && onRetry;
  return (
    <div className={`error-note ${fixable ? "error-note-warn" : "error-note-danger"}`} role="alert">
      <p className="error-note-title"><AlertIcon size={14} /> {TITLE[error.kind]}</p>
      <p>{error.message}</p>
      {error.requestId && <p className="error-note-id num">Request ID: {error.requestId}</p>}
      {retryable && <button type="button" className="btn" onClick={onRetry}>Retry</button>}
    </div>
  );
}

export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="skeleton" role="status" aria-label="Calling MCP tools">
      {Array.from({ length: lines }, (_, i) => <span key={i} className="skeleton-line" style={{ width: `${92 - i * 14}%` }} />)}
      <span className="skeleton-note">Calling MCP tools…</span>
    </div>
  );
}
