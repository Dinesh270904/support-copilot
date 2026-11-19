import { humanize } from "../format";
import type { RetrievalInfo, ToolCallTrace } from "../types";
import { ActivityIcon, ArrowIcon, CheckCircleIcon, XCircleIcon } from "./Icons";

const METHOD: Record<string, string> = { tfidf_cosine: "TF-IDF cosine", sqlite_fts5_bm25: "FTS5 bm25" };

/** Visible by default: which tools ran, in order, with status and time; then how retrieval was configured. A failed
 * call shows a cross and its error code. */
export function ToolTimeline({ trace, retrieval }: { trace: ToolCallTrace[]; retrieval: RetrievalInfo | null }) {
  return (
    <div className="timeline-box">
      <div className="tool-line">
        <ActivityIcon size={14} />
        <ol className="tool-steps" aria-label="Tool calls">
          {trace.map((t, i) => (
            <li key={i} className={`tool-step${t.status === "error" ? " tool-error" : ""}`}>
              <code>{t.tool}</code>
              <span className="tool-status" aria-label={t.status === "ok" ? "succeeded" : `failed: ${t.error ?? "error"}`}>{t.status === "ok" ? <CheckCircleIcon size={14} weight="fill" /> : <XCircleIcon size={14} weight="fill" />}</span>
              <span className="num">{t.status === "ok" ? `${t.duration_ms} ms` : t.error ?? "error"}</span>
              {i < trace.length - 1 && <span className="tool-arrow" aria-hidden="true"><ArrowIcon size={12} /></span>}
            </li>
          ))}
        </ol>
      </div>
      {retrieval && (
        <p className="retrieval-line">
          <span>{METHOD[retrieval.method] ?? retrieval.method}</span>
          <span>scope {retrieval.category ? humanize(retrieval.category) : "all categories"}</span>
          {retrieval.candidates_considered !== null && <span className="num">{retrieval.candidates_considered} candidates</span>}
          <span className="num">top {retrieval.top_k}</span>
        </p>
      )}
    </div>
  );
}
