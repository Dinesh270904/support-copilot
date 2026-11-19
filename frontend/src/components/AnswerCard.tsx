import { Fragment, useState, type Ref } from "react";
import { humanize } from "../format";
import { parseAnswer } from "../lib/answer";
import type { AssistantRunResponse, Citation } from "../types";
import { AlertIcon, CheckIcon, CircleSlashIcon, ShieldIcon } from "./Icons";
import { CardMenu } from "./CardMenu";
import { CitationMarker } from "./CitationMarker";
import { ScoreMeter } from "./ScoreMeter";
import { IdentifierNote, MatchedLine, ScoreLine, usageLabel, type SourceRef } from "./SourceDetails";
import { ToolTimeline } from "./ToolTimeline";

interface Props {
  result: AssistantRunResponse;
  onViewSource: (source: SourceRef) => void;
  onViewTrace: (result: AssistantRunResponse, opener: HTMLElement | null) => void;
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

// The backend writes: "... explicitly does not cover this: “<sentence>” Do not state a policy ..."
const GAP_QUOTE = /does not cover this: “(.+)”\s*(Do not state.*)$/s;

/** The hero of the product: the answer as prose, each sentence tied to a numbered source, the scores against the
 * threshold, and the tool calls that produced it. Insufficient evidence leads with a plain sentence and keeps the
 * backend's specific reason beneath it, so the transparency is never traded for friendliness. */
export function AnswerCard({ result, onViewSource, onViewTrace, onOpenTicket, onDraftHolding, onSearchAll, question, scope, headingRef }: Props) {
  const [showLimits, setShowLimits] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const parsed = parseAnswer(result.answer);
  const retrieval = result.retrieval;
  const min = retrieval?.min_score ?? null;
  const byId = new Map<string, Citation>(result.citations.map((c) => [c.source_id, c]));
  const refFor = (id: string): SourceRef | null => {
    const citation = byId.get(id);
    return citation ? { citation, n: parsed.numbers.get(id) ?? null, sentences: parsed.quoted.get(id) ?? [] } : null;
  };
  const marker = (id: string, key: string) => {
    const ref = refFor(id);
    return ref && ref.n !== null ? <CitationMarker key={key} n={ref.n} source={ref} threshold={min} onView={onViewSource} onActive={setActive} /> : null;
  };

  const state = result.answer_state;
  const isCount = result.action === "count_tickets";
  const articles = new Set(result.citations.filter((c) => c.usage === "evidence").map((c) => c.article_id ?? c.source_id));
  const headline =
    state === "answered" ? (isCount ? "Count complete" : `Answered from ${articles.size} article${articles.size === 1 ? "" : "s"}`)
      : state === "insufficient_evidence" ? "Not enough evidence" : "Nothing found";
  const StateIcon = state === "answered" ? CheckIcon : state === "insufficient_evidence" ? AlertIcon : CircleSlashIcon;
  const scopeName = retrieval?.category ? humanize(retrieval.category) : null;

  // ---- answered: prose with markers
  const lines = parsed.lines.filter((l) => !(!l.evidence && l.pieces[0]?.kind === "text" && /^Documented guidance from/.test(l.pieces[0].text)));
  const paragraphs: (typeof lines)[] = [];
  for (const line of lines) {
    const last = paragraphs[paragraphs.length - 1];
    if (line.evidence && last && last[0].evidence) last.push(line);
    else paragraphs.push([line]);
  }

  // ---- insufficient: spec headline + the backend's specific reason as a secondary line
  const gapCitation = result.citations.find((c) => c.usage === "coverage_gap");
  const gapMatch = gapCitation ? result.answer.match(GAP_QUOTE) : null;
  const noCandidates = retrieval?.candidates_considered === 0;
  const lowOverlap = (retrieval?.rejected_low_coverage.length ?? 0) > 0;
  const insufficientHeadline = gapCitation
    ? "The knowledge base doesn't cover this, so Copilot won't guess."
    : noCandidates
      ? `No articles in ${scopeName ?? "the knowledge base"} match this question.`
      : lowOverlap
        ? "The closest articles share too few words with your question to count as evidence."
        : "The knowledge base doesn't cover this, so Copilot won't guess.";
  const reason = gapCitation ? (gapMatch ? gapMatch[2] : result.answer) : result.answer;

  // ---- sources list (answered and no-results states)
  const quoted = result.citations.filter((c) => parsed.numbers.has(c.source_id)).sort((a, b) => parsed.numbers.get(a.source_id)! - parsed.numbers.get(b.source_id)!);
  const others = result.citations.filter((c) => !parsed.numbers.has(c.source_id));
  const sources = state === "insufficient_evidence" ? [] : [...quoted, ...others];

  return (
    <article className={`acard acard-${state}`} aria-label="Answer">
      <header className="acard-head">
        <h4 className="acard-state" ref={headingRef} tabIndex={-1}><StateIcon size={15} /><span className="acard-title">{headline}{scope && !isCount && <>{" "}<span className="acard-scope">· {scope}</span></>}</span></h4>
        <span className="acard-ms num">{Math.round(result.duration_ms)} ms</span>
        <CardMenu label="Answer options" items={[{ label: "View raw trace", onSelect: (opener) => onViewTrace(result, opener) }]} />
      </header>

      <div className="acard-main">
        {question && <p className="acard-q"><span aria-hidden="true">Q</span> {question}</p>}

        {result.warnings.map((w) => (
          <p key={w} className="strip strip-warn"><ShieldIcon size={14} /><span>{w}</span></p>
        ))}

        {state === "insufficient_evidence" ? (
          <div className="acard-body">
            <p className="insuf-headline prose-max">{insufficientHeadline}</p>
            <p className="insuf-reason prose-max">{reason}</p>
            {gapCitation && (
              <div className="gap-block">
                <p className="gap-intro">Closest source says this is out of scope:</p>
                <blockquote className="gap-quote">{gapMatch ? `“${gapMatch[1]}”` : gapCitation.excerpt}</blockquote>
                <p className="gap-ref">
                  <span className="num">{gapCitation.source_id}</span>
                  {marker(gapCitation.source_id, "gap")}
                  {gapCitation.score !== null && <ScoreLine citation={gapCitation} threshold={min} />}
                </p>
                {gapCitation.score !== null && min !== null && gapCitation.score >= min && (
                  <p className="insuf-reason">Similarity is high because the article names this topic, but it says the topic is out of scope.</p>
                )}
              </div>
            )}
            {retrieval && retrieval.best_score !== null && !gapCitation && (
              <div className="meter-row">
                <span className="meter-caption">Closest candidate vs minimum score</span>
                <ScoreMeter value={retrieval.best_score} threshold={min} label="Best candidate" neutral />
              </div>
            )}
            {noCandidates && scopeName && <p className="hint">Nothing was scored in this scope. Try “All categories”.</p>}
            {(onDraftHolding || onSearchAll) && (
              <div className="acard-actions">
                {onDraftHolding && result.ticket_id && <button type="button" className="btn" onClick={onDraftHolding}>Draft a holding reply</button>}
                {onSearchAll && <button type="button" className="btn" onClick={onSearchAll}>Search all categories</button>}
              </div>
            )}
          </div>
        ) : state === "no_results" ? (
          <div className="acard-body">
            <p className="prose prose-plain prose-max">{result.answer}</p>
            {retrieval?.category && <p className="hint">Try widening the scope to all categories.</p>}
            {onSearchAll && <button type="button" className="btn acard-widen" onClick={onSearchAll}>Widen filters</button>}
          </div>
        ) : (
          <div className="acard-body">
            {paragraphs.map((para, i) => (
              <p key={i} className={`prose prose-max${para[0].evidence ? "" : " prose-plain"}`}>
                {para.map((line, j) => (
                  <Fragment key={j}>
                    {line.pieces.map((piece, k) => piece.kind === "text"
                      ? <Fragment key={k}>{piece.text}{k < line.pieces.length - 1 || j < para.length - 1 ? " " : ""}</Fragment>
                      : marker(piece.id, `${i}-${j}-${k}`))}
                  </Fragment>
                ))}
              </p>
            ))}
            {isCount && result.count && result.count.ticket_ids.length > 0 && (
              <p className="count-ids">
                {result.count.ticket_ids.map((id) => <button key={id} type="button" className="chip" onClick={() => onOpenTicket(id)}>{id}</button>)}
              </p>
            )}
          </div>
        )}

        {sources.length > 0 && (
          <section className="acard-block" aria-label="Sources">
            <h4>Sources {min !== null && <span className="legend"><span className="legend-tick" aria-hidden="true" /> = minimum score {min.toFixed(2)}</span>}</h4>
            <ul className="sources">
              {sources.map((c) => {
                const ref = refFor(c.source_id)!;
                const dim = c.usage === "retrieved_unused";
                return (
                  <li key={c.source_id} className={`source${dim ? " source-dim" : ""}${active === c.source_id ? " source-active" : ""}`}>
                    <p className="source-line">
                      <span className="source-n num" aria-hidden="true">{ref.n ?? "○"}</span>
                      <span className="source-id num">{c.source_id}</span>
                      <span className="source-title">{c.title}</span>
                      <span className="source-usage">{dim ? "not quoted" : c.usage === "evidence" ? "quoted" : usageLabel(c.usage)}</span>
                    </p>
                    <div className="source-sub">
                      <ScoreLine citation={c} threshold={min} />
                      <MatchedLine citation={c} />
                      <button type="button" className="link-btn" onClick={(e) => onViewSource({ ...ref, opener: e.currentTarget })}>View source</button>
                    </div>
                    <IdentifierNote citation={c} threshold={min} />
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className="acard-block" aria-label="How this was answered">
          <ToolTimeline trace={result.tool_trace} retrieval={retrieval} />
        </section>

        {result.limitations.length > 0 && (
          <div className="acard-block">
            <button type="button" className="link-btn" aria-expanded={showLimits} onClick={() => setShowLimits((s) => !s)}>
              ⓘ {result.limitations.length} limitation{result.limitations.length === 1 ? "" : "s"}
            </button>
            {showLimits && <ul className="plain-list limits">{result.limitations.map((l) => <li key={l}>{l}</li>)}</ul>}
          </div>
        )}
      </div>
    </article>
  );
}
