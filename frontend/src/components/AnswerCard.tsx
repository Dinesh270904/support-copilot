import { Fragment, useState, type Ref } from "react";
import { parseAnswer } from "../lib/answer";
import type { AssistantRunResponse, Citation } from "../types";
import { AlertIcon, CheckIcon, SearchIcon, ShieldIcon } from "./Icons";
import { CitationMarker } from "./CitationMarker";
import { ScoreMeter } from "./ScoreMeter";
import { IdentifierNote, MatchedLine, ScoreLine, usageLabel, type SourceRef } from "./SourceDetails";
import { ToolTimeline } from "./ToolTimeline";

interface Props {
  result: AssistantRunResponse;
  onViewSource: (source: SourceRef) => void;
  onOpenTicket: (id: string) => void;
  /** Offered on insufficient evidence when a ticket is open. */
  onDraftHolding?: () => void;
  /** Offered when the question was scoped to one category. */
  onSearchAll?: () => void;
  question?: string;
  scope?: string;
  /** Receives focus when the answer arrives, so a screen-reader user lands on it. */
  headingRef?: Ref<HTMLHeadingElement>;
}

/** The hero of the product: the answer as prose, each sentence tied to a numbered source, the scores
 * against the threshold, and the tool calls that produced it. */
export function AnswerCard({ result, onViewSource, onOpenTicket, onDraftHolding, onSearchAll, question, scope, headingRef }: Props) {
  const [showTrace, setShowTrace] = useState(false);
  const [showLimits, setShowLimits] = useState(false);
  const parsed = parseAnswer(result.answer);
  const min = result.retrieval?.min_score ?? null;
  const byId = new Map<string, Citation>(result.citations.map((c) => [c.source_id, c]));
  const refFor = (id: string): SourceRef | null => {
    const citation = byId.get(id);
    return citation ? { citation, n: parsed.numbers.get(id) ?? null, sentences: parsed.quoted.get(id) ?? [] } : null;
  };

  const articles = new Set(result.citations.filter((c) => c.usage === "evidence").map((c) => c.article_id ?? c.source_id));
  const state = result.answer_state;
  const isCount = result.action === "count_tickets";
  const headline =
    state === "answered"
      ? isCount ? "Count complete" : `Answered from ${articles.size} article${articles.size === 1 ? "" : "s"}`
      : state === "insufficient_evidence" ? "Not enough evidence. Don't guess." : "No results";
  const StateIcon = state === "answered" ? CheckIcon : state === "insufficient_evidence" ? AlertIcon : SearchIcon;

  // Prose: consecutive quoted sentences flow into one paragraph; other lines are paragraphs of their own.
  const lines = parsed.lines.filter((l) => !(!l.evidence && l.pieces[0]?.kind === "text" && /^Documented guidance from/.test(l.pieces[0].text)));
  const paragraphs: (typeof lines)[] = [];
  for (const line of lines) {
    const last = paragraphs[paragraphs.length - 1];
    if (line.evidence && last && last[0].evidence) last.push(line);
    else paragraphs.push([line]);
  }
  const marker = (id: string, key: string) => {
    const ref = refFor(id);
    if (!ref || ref.n === null) return null;
    return <CitationMarker key={key} n={ref.n} source={ref} threshold={min} onView={onViewSource} />;
  };

  const quoted = result.citations.filter((c) => parsed.numbers.has(c.source_id)).sort((a, b) => parsed.numbers.get(a.source_id)! - parsed.numbers.get(b.source_id)!);
  const others = result.citations.filter((c) => !parsed.numbers.has(c.source_id));
  const sources = [...quoted, ...others];
  const gap = result.citations.some((c) => c.usage === "coverage_gap");
  const widenHint = result.retrieval?.category && (result.retrieval.candidates_considered === 0 || state === "no_results");

  return (
    <article className={`acard acard-${state}`} aria-label="Answer">
      <header className="acard-head">
        <h4 className="acard-state" ref={headingRef} tabIndex={-1}><StateIcon size={15} /> <span>{headline}</span>{scope && !isCount && <span className="acard-scope"> · {scope}</span>}</h4>
        <span className="acard-ms num">{Math.round(result.duration_ms)} ms</span>
        <button type="button" className="icon-btn acard-more" aria-label="Show raw tool trace" aria-expanded={showTrace} onClick={() => setShowTrace((s) => !s)}>⋯</button>
      </header>

      {question && <p className="acard-q"><span aria-hidden="true">Q</span> {question}</p>}

      {result.warnings.map((w) => (
        <p key={w} className="strip strip-warn"><ShieldIcon size={14} /><span>{w}</span></p>
      ))}

      <div className="acard-body">
        {paragraphs.map((para, i) => (
          <p key={i} className={para[0].evidence ? "prose" : "prose prose-plain"}>
            {para.map((line, j) => (
              <Fragment key={j}>
                {line.pieces.map((piece, k) => piece.kind === "text" ? <Fragment key={k}>{piece.text}{k < line.pieces.length - 1 || j < para.length - 1 ? " " : ""}</Fragment> : marker(piece.id, `${i}-${j}-${k}`))}
              </Fragment>
            ))}
          </p>
        ))}
        {isCount && result.count && result.count.ticket_ids.length > 0 && (
          <p className="count-ids">
            {result.count.ticket_ids.map((id) => <button key={id} type="button" className="chip" onClick={() => onOpenTicket(id)}>{id}</button>)}
          </p>
        )}
        {state === "insufficient_evidence" && result.retrieval && result.retrieval.best_score !== null && result.retrieval.candidates_considered !== 0 && (
          <div className="meter-row">
            <span className="meter-caption">
              {gap && min !== null && result.retrieval.best_score >= min
                ? "Similarity is high because the article names this topic, but it says the topic is out of scope."
                : "Closest candidate vs minimum score"}
            </span>
            <ScoreMeter value={result.retrieval.best_score} threshold={min} label="Best candidate" neutral />
          </div>
        )}
        {state === "insufficient_evidence" && gap && (
          <p className="gap-note">Closest source says this is out of scope.</p>
        )}
        {widenHint && <p className="hint">{state === "no_results" ? "Try widening the scope to all categories." : "No articles exist in this scope. Try “All categories”."}</p>}
        {state === "insufficient_evidence" && (onDraftHolding || onSearchAll) && (
          <div className="acard-actions">
            {onDraftHolding && result.ticket_id && <button type="button" className="btn" onClick={onDraftHolding}>Draft a holding reply</button>}
            {onSearchAll && <button type="button" className="btn" onClick={onSearchAll}>Search all categories</button>}
          </div>
        )}
      </div>

      {sources.length > 0 && (
        <section className="acard-block" aria-label="Sources">
          <h4>Sources {min !== null && <span className="legend"><span className="legend-tick" aria-hidden="true" /> = minimum score {min.toFixed(2)}</span>}</h4>
          <ul className="sources">
            {sources.map((c) => {
              const ref = refFor(c.source_id)!;
              const dim = c.usage === "retrieved_unused";
              return (
                <li key={c.source_id} className={`source${dim ? " source-dim" : ""}`}>
                  <p className="source-line">
                    <span className="source-n num" aria-hidden="true">{ref.n ?? "○"}</span>
                    <span className="source-id num">{c.source_id}</span>
                    <span className="source-title">{c.title}</span>
                  </p>
                  <div className="source-sub">
                    <ScoreLine citation={c} threshold={min} />
                    <span className="source-usage">{usageLabel(c.usage)}</span>
                    <button type="button" className="link-btn" onClick={(e) => onViewSource({ ...ref, opener: e.currentTarget })}>View source</button>
                  </div>
                  <MatchedLine citation={c} />
                  <IdentifierNote citation={c} threshold={min} />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="acard-block" aria-label="How this was answered">
        <h4>How this was answered</h4>
        <ToolTimeline trace={result.tool_trace} retrieval={result.retrieval} />
        {showTrace && <pre className="raw-trace" aria-label="Raw tool trace">{JSON.stringify(result.tool_trace, null, 2)}</pre>}
      </section>

      {result.limitations.length > 0 && (
        <div className="acard-block">
          <button type="button" className="link-btn" aria-expanded={showLimits} onClick={() => setShowLimits((s) => !s)}>
            ⓘ {result.limitations.length} limitation{result.limitations.length === 1 ? "" : "s"}
          </button>
          {showLimits && <ul className="plain-list limits">{result.limitations.map((l) => <li key={l}>{l}</li>)}</ul>}
        </div>
      )}
    </article>
  );
}
