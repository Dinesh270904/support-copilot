import type { RetrievalInfo, ToolCallTrace } from "../types";

/** Visible by default: which MCP tools ran, in order, with status and time, then how retrieval was configured. */
export function ToolTimeline({ trace, retrieval }: { trace: ToolCallTrace[]; retrieval: RetrievalInfo | null }) {
  return (
    <div className="timeline-box">
      <ol className="tool-steps" aria-label="Tool calls">
        {trace.map((t, i) => (
          <li key={i} className={`tool-step${t.status === "error" ? " tool-error" : ""}`}>
            <code>{t.tool}</code>
            <span className="tool-status" aria-label={t.status === "ok" ? "succeeded" : `failed: ${t.error ?? "error"}`}>{t.status === "ok" ? "✓" : "✗"}</span>
            <span className="num">{t.duration_ms} ms</span>
            {i < trace.length - 1 && <span className="tool-arrow" aria-hidden="true">→</span>}
          </li>
        ))}
      </ol>
      {retrieval && (
        <p className="retrieval-line">
          <span>{retrieval.method}</span>
          <span>scope {retrieval.category ?? "all categories"}</span>
          {retrieval.candidates_considered !== null && <span className="num">{retrieval.candidates_considered} candidates</span>}
          <span className="num">k {retrieval.top_k}</span>
        </p>
      )}
    </div>
  );
}
