import { highlight } from "../lib/answer";
import type { Citation } from "../types";
import { ScoreMeter } from "./ScoreMeter";

export interface SourceRef {
  citation: Citation;
  /** Marker number, or null for sources that were retrieved but never quoted. */
  n: number | null;
  /** Verbatim sentences the answer quoted from this source (highlighted in the excerpt). */
  sentences: string[];
  /** The control that opened the drawer; focus returns to it on close. */
  opener?: HTMLElement | null;
}

const USAGE: Record<Citation["usage"], string> = {
  evidence: "Quoted in the answer",
  coverage_gap: "Closest source says this is out of scope",
  retrieved_unused: "Retrieved, not quoted",
  similar_ticket: "Similar resolved ticket",
  ticket_record: "Ticket record",
};
export const usageLabel = (u: Citation["usage"]) => USAGE[u];

/** Score line: a meter against the minimum score for article chunks, plain text for bm25. */
export function ScoreLine({ citation, threshold }: { citation: Citation; threshold: number | null }) {
  if (citation.score === null) return null;
  // An out-of-scope source can score high precisely because it names the topic it excludes: never draw it as a pass.
  if (citation.score_type === "cosine") return <ScoreMeter value={citation.score} threshold={threshold} neutral={citation.usage === "coverage_gap"} />;
  return <span className="num score-text" title="SQLite FTS5 bm25, relative within this result">bm25 {citation.score.toFixed(2)}</span>;
}

export function MatchedLine({ citation }: { citation: Citation }) {
  const terms = citation.matched_terms ?? [];
  const ids = citation.matched_identifiers ?? [];
  if (terms.length === 0 && ids.length === 0) return null;
  return (
    <p className="matched-line">
      {terms.length > 0 && <span>matched: {terms.join(", ")}</span>}
      {ids.length > 0 && <span className="matched-id">id <code>{ids.join(", ")}</code></span>}
    </p>
  );
}

/** An exact error-code match can admit a chunk whose similarity is under the minimum: say so, so a
 * score below the tick on an answered result is explained, not mysterious. */
export function IdentifierNote({ citation, threshold }: { citation: Citation; threshold: number | null }) {
  const ids = citation.matched_identifiers ?? [];
  if (ids.length === 0 || citation.score === null || threshold === null || citation.score >= threshold) return null;
  return <p className="id-note">Accepted by exact match on <code>{ids.join(", ")}</code>, although similarity is below the minimum.</p>;
}

export function Excerpt({ citation, sentences }: { citation: Citation; sentences: string[] }) {
  return (
    <blockquote className="excerpt">
      {highlight(citation.excerpt, sentences).map((run, i) => (run.hit ? <mark key={i} className="quoted">{run.text}</mark> : <span key={i}>{run.text}</span>))}
    </blockquote>
  );
}

export function SourceDetails({ source, threshold }: { source: SourceRef; threshold: number | null }) {
  const { citation: c } = source;
  return (
    <>
      <p className="src-head">
        {source.n !== null && <span className="src-n num" aria-hidden="true">{source.n}</span>}
        <span className="src-title">{c.title}</span>
      </p>
      <p className="src-id num">{c.source_id}</p>
      <ScoreLine citation={c} threshold={threshold} />
      <Excerpt citation={c} sentences={source.sentences} />
      <MatchedLine citation={c} />
      <IdentifierNote citation={c} threshold={threshold} />
      <p className="src-usage">{usageLabel(c.usage)}</p>
    </>
  );
}
