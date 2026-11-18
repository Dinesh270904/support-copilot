import type { AnswerEntry } from "../hooks/useCopilot";
import { humanize } from "../format";
import { AnswerCard } from "./AnswerCard";
import { CardSkeleton, ErrorNote } from "./ErrorNote";
import type { SourceRef } from "./SourceDetails";

interface Props {
  entry: AnswerEntry;
  open: boolean;
  onRetry: () => void;
  onOpenTicket: (id: string) => void;
  onViewSource: (source: SourceRef) => void;
  onDraftHolding?: () => void;
}

/** One question and its result. The newest entry is open; older ones collapse under their question. */
export function AnswerEntryView({ entry, open, onRetry, onOpenTicket, onViewSource, onDraftHolding }: Props) {
  const scope = entry.kind === "ask" ? (entry.scope ? humanize(entry.scope) : "All categories") : "Ticket count";
  const body = (
    <>
      {entry.state.status === "loading" && <CardSkeleton />}
      {entry.state.status === "error" && entry.state.error && <ErrorNote error={entry.state.error} onRetry={onRetry} />}
      {entry.state.status === "ok" && entry.state.response && <AnswerCard result={entry.state.response} onOpenTicket={onOpenTicket} onViewSource={onViewSource} onDraftHolding={onDraftHolding} />}
    </>
  );
  return (
    <details className="answer-entry" open={open}>
      <summary><span className="answer-q">{entry.query}</span><span className="card-tag">{scope}</span></summary>
      {body}
    </details>
  );
}
