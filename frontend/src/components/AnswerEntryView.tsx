import type { Ref } from "react";
import type { AnswerEntry } from "../hooks/useCopilot";
import { humanize } from "../format";
import { AnswerCard } from "./AnswerCard";
import { CardSkeleton, ErrorNote } from "./ErrorNote";
import type { SourceRef } from "./SourceDetails";

interface Props {
  entry: AnswerEntry;
  /** The newest answer is shown in full; earlier ones collapse to a one-line row. */
  open: boolean;
  onRetry: () => void;
  onOpenTicket: (id: string) => void;
  onViewSource: (source: SourceRef) => void;
  onDraftHolding?: () => void;
  onSearchAll?: () => void;
  headingRef?: Ref<HTMLHeadingElement>;
}

const STATE_LABEL = { answered: "Answered", insufficient_evidence: "Not enough evidence", no_results: "No results" } as const;

function summaryLine(entry: AnswerEntry): string {
  const r = entry.state.response;
  if (entry.state.status === "loading") return "Working…";
  if (entry.state.status === "error" || !r) return "Failed";
  const sources = r.citations.length;
  return `${STATE_LABEL[r.answer_state]}${sources ? ` · ${sources} source${sources === 1 ? "" : "s"}` : ""}`;
}

export function AnswerEntryView({ entry, open, onRetry, onOpenTicket, onViewSource, onDraftHolding, onSearchAll, headingRef }: Props) {
  const scope = entry.kind === "ask" ? (entry.scope ? humanize(entry.scope) : "All categories") : "Ticket count";
  const body = (
    <>
      {entry.state.status === "loading" && <CardSkeleton />}
      {entry.state.status === "error" && entry.state.error && <ErrorNote error={entry.state.error} onRetry={onRetry} />}
      {entry.state.status === "ok" && entry.state.response && (
        <AnswerCard result={entry.state.response} question={entry.query} scope={scope} onOpenTicket={onOpenTicket} onViewSource={onViewSource}
          onDraftHolding={onDraftHolding} onSearchAll={entry.kind === "ask" && entry.scope ? onSearchAll : undefined} headingRef={open ? headingRef : undefined} />
      )}
    </>
  );
  if (open) return <div className="answer-entry answer-entry-open">{entry.state.status !== "ok" && <p className="answer-q-line">Q  {entry.query}</p>}{body}</div>;
  return (
    <details className="answer-entry">
      <summary><span className="answer-q">Q: “{entry.query}”</span><span className="answer-sum">· {summaryLine(entry)}</span></summary>
      {body}
    </details>
  );
}
