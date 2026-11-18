import type { RunState } from "../hooks/useCopilot";
import { CardSkeleton, ErrorNote } from "./ErrorNote";

// The backend writes one line per ticket: "- T-103 “title”: <fix> [T-103]".
const FIX_LINE = /^- (T-\d+) “.+?”: (.+) \[T-\d+\]$/;

function fixesById(answer: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of answer.split("\n")) {
    const m = line.match(FIX_LINE);
    if (m) map.set(m[1], m[2]);
  }
  return map;
}

interface Props {
  state: RunState;
  onRetry: () => void;
  onOpenTicket: (id: string) => void;
}

export function SimilarCard({ state, onRetry, onOpenTicket }: Props) {
  const r = state.response;
  const rows = r?.citations.filter((c) => c.usage === "similar_ticket") ?? [];
  const fixes = r ? fixesById(r.answer) : new Map<string, string>();
  return (
    <section className="card" aria-labelledby="similar-h">
      <header className="card-head">
        <h3 id="similar-h">Similar resolved tickets</h3>
        <span className="card-tag">auto</span>
        {r && <span className="card-ms num">{Math.round(r.duration_ms)} ms</span>}
      </header>
      {(state.status === "loading" || state.status === "idle") && <CardSkeleton lines={2} />}
      {state.status === "error" && state.error && <ErrorNote error={state.error} onRetry={onRetry} />}
      {state.status === "ok" && rows.length === 0 && <p className="card-empty">No similar resolved tickets.</p>}
      {state.status === "ok" && rows.length > 0 && (
        <ul className="similar-list">
          {rows.map((c) => {
            const id = c.ticket_id ?? c.source_id;
            const fix = fixes.get(id);
            return (
              <li key={c.source_id}>
                <button type="button" className="similar-row" onClick={() => onOpenTicket(id)}>
                  <span className="similar-top">
                    <span className="id-chip num">{id}</span>
                    <span className="similar-title">{c.title}</span>
                    {c.score !== null && <span className="similar-score num" title="SQLite FTS5 bm25 (relative to this result)">bm25 {c.score.toFixed(2)}</span>}
                  </span>
                  {fix && <span className="similar-fix" title={fix}>Fix: {fix}</span>}
                  {c.matched_terms.length > 0 && <span className="similar-terms">matched: {c.matched_terms.join(", ")}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
