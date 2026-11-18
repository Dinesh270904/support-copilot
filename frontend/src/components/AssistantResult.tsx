import { Fragment, useState, type ReactNode } from "react";
import type { AssistantRunResponse, Citation } from "../types";
import { DraftEditor } from "./DraftEditor";
import { AlertIcon, CheckIcon, SearchIcon } from "./Icons";

const ANSWERED_LABEL: Record<AssistantRunResponse["action"], string> = {
  summarize_ticket: "Summary from the ticket record",
  search_knowledge: "Answer quoted from knowledge articles",
  search_resolved_tickets: "Similar resolved tickets found",
  draft_reply: "Draft ready for review",
  count_tickets: "Count complete",
};

function stateLabel(result: AssistantRunResponse): string {
  if (result.answer_state === "answered") return ANSWERED_LABEL[result.action];
  if (result.answer_state === "insufficient_evidence") return "Not enough evidence to answer";
  return "Nothing found";
}

const USAGE_LABEL: Record<Citation["usage"], string> = {
  evidence: "quoted",
  coverage_gap: "states topic not covered",
  retrieved_unused: "retrieved, not quoted",
  similar_ticket: "similar ticket",
  ticket_record: "ticket record",
};

const CITE_MARKER = /\[((?:KB-\d+#chunk-\d+)|(?:T-\d+))\]/g;
const EVIDENCE_LINE = /^- (.+) \[((?:KB-\d+#chunk-\d+)|(?:T-\d+))\]$/;
const TICKET_LINE = /^(T-\d+) “(.+?)”: (.+)$/;

function withChips(line: string, onCite: (id: string) => void, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of line.matchAll(CITE_MARKER)) {
    parts.push(line.slice(last, match.index));
    const id = match[1];
    parts.push(
      <button key={`${keyPrefix}-${match.index}`} type="button" className="source-tag" onClick={() => onCite(id)}>
        {id}
      </button>,
    );
    last = (match.index ?? 0) + match[0].length;
  }
  parts.push(line.slice(last));
  return parts.map((p, j) => <Fragment key={j}>{p}</Fragment>);
}

/** Lines quoted verbatim from a source are drawn with a highlighter; everything else is template text. */
function AnswerText({ text, onCite }: { text: string; onCite: (id: string) => void }) {
  const lines = text.split("\n");
  const intro = lines.filter((l) => !EVIDENCE_LINE.test(l));
  const evidence = lines.map((l) => l.match(EVIDENCE_LINE)).filter((m): m is RegExpMatchArray => m !== null);
  return (
    <div className="answer">
      {intro.map((line, i) => (
        <p key={i} className="answer-lead">{withChips(line, onCite, `p${i}`)}</p>
      ))}
      {evidence.length > 0 && (
        <ul className="evidence-list">
          {evidence.map(([, sentence, id], i) => {
            const ticket = sentence.match(TICKET_LINE);
            return (
              <li key={i} style={{ animationDelay: `${i * 120}ms` }}>
                {ticket ? (
                  <>
                    <span className="evidence-heading">{ticket[2]}</span>
                    <mark className="hl">{ticket[3]}</mark>
                  </>
                ) : (
                  <mark className="hl">{sentence}</mark>
                )}
                <button type="button" className="source-tag" onClick={() => onCite(id)}>{id}</button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

interface Props {
  result: AssistantRunResponse;
  onOpenTicket: (id: string) => void;
}

export function AssistantResult({ result, onOpenTicket }: Props) {
  const [openCitation, setOpenCitation] = useState<string | null>(null);

  function focusCitation(id: string) {
    setOpenCitation(id);
    document.getElementById(`cite-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  return (
    <div className="result" aria-live="polite">
      <div className={`state-banner state-${result.answer_state}`} role="status">
        <strong>
          {result.answer_state === "answered" ? <CheckIcon size={15} /> : result.answer_state === "insufficient_evidence" ? <AlertIcon size={15} /> : <SearchIcon size={15} />}
          {stateLabel(result)}
        </strong>
        <span className="small">
          {result.tool_calls.join(", ")} in {result.duration_ms.toFixed(0)} ms
        </span>
      </div>

      {result.warnings.map((w) => (
        <div key={w} className="warning" role="alert"><AlertIcon size={15} /><span>{w}</span></div>
      ))}

      <AnswerText text={result.answer} onCite={focusCitation} />

      {result.sections.map((s) => (
        <div key={s.title} className="result-section">
          <h4>{s.title}</h4>
          <ul>
            {s.items.map((item, i) => <li key={i}>{item}</li>)}
          </ul>
        </div>
      ))}

      {result.draft !== null && <DraftEditor key={result.run_id} initialDraft={result.draft} />}

      {result.citations.length > 0 && (
        <div className="result-section">
          <h4>Sources ({result.citations.length})</h4>
          <ul className="citations">
            {result.citations.map((c) => (
              <li key={c.source_id} id={`cite-${c.source_id}`} className={`citation usage-${c.usage}`}>
                <details open={openCitation === c.source_id} onToggle={(e) => {
                  if ((e.target as HTMLDetailsElement).open) setOpenCitation(c.source_id);
                }}>
                  <summary>
                    <span className="source-id">{c.source_id}</span>
                    <span className="citation-title">{c.title}</span>
                    {c.score !== null && (
                      <span className="score" title={c.score_type === "cosine" ? "TF-IDF cosine similarity" : "FTS5 bm25 (relative)"}>
                        {c.score_type === "cosine" ? "similarity" : "bm25"} {c.score.toFixed(2)}
                      </span>
                    )}
                    <span className="usage">{USAGE_LABEL[c.usage]}</span>
                  </summary>
                  {c.excerpt && <blockquote>{c.excerpt}</blockquote>}
                  {c.ticket_id && (
                    <button type="button" className="link" onClick={() => onOpenTicket(c.ticket_id!)}>
                      Open {c.ticket_id}
                    </button>
                  )}
                </details>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.limitations.length > 0 && (
        <div className="result-section">
          <h4>Limitations</h4>
          <ul className="muted">
            {result.limitations.map((l) => <li key={l}>{l}</li>)}
          </ul>
        </div>
      )}

      <details className="trace">
        <summary>How this answer was produced</summary>
        {result.retrieval && (
          <dl className="meta-grid compact">
            <div><dt>Method</dt><dd><code>{result.retrieval.method}</code></dd></div>
            <div><dt>Scope</dt><dd>{result.retrieval.category ?? "all categories"}</dd></div>
            <div><dt>Top k</dt><dd>{result.retrieval.top_k}</dd></div>
            {result.retrieval.min_score !== null && (
              <div><dt>Min score</dt><dd>{result.retrieval.min_score}</dd></div>
            )}
            {result.retrieval.best_score !== null && (
              <div><dt>Best score</dt><dd>{result.retrieval.best_score.toFixed(3)}</dd></div>
            )}
            {result.retrieval.candidates_considered !== null && (
              <div><dt>Candidates</dt><dd>{result.retrieval.candidates_considered}</dd></div>
            )}
            <div><dt>Returned</dt><dd>{result.retrieval.results_returned}</dd></div>
            {result.retrieval.fts_query && (
              <div className="wide"><dt>FTS query</dt><dd><code>{result.retrieval.fts_query}</code></dd></div>
            )}
          </dl>
        )}
        <table className="trace-table">
          <thead>
            <tr><th>#</th><th>MCP tool</th><th>Arguments</th><th>Status</th><th>ms</th></tr>
          </thead>
          <tbody>
            {result.tool_trace.map((t, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td><code>{t.tool}</code></td>
                <td><code className="args">{JSON.stringify(t.arguments)}</code></td>
                <td className={t.status === "ok" ? "ok" : "error-text"}>{t.status}{t.error ? ` (${t.error})` : ""}</td>
                <td>{t.duration_ms}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">Run ID <code>{result.run_id}</code></p>
      </details>
    </div>
  );
}
