import { ExternalIcon } from "./Icons";
import { Drawer } from "./Drawer";
import { Excerpt, MatchedLine, ScoreLine, IdentifierNote, usageLabel, type SourceRef } from "./SourceDetails";

interface Props {
  source: SourceRef | null;
  threshold: number | null;
  onClose: () => void;
  onOpenTicket: (id: string) => void;
}

/** The full source, with no extra request: everything is already in the response. */
export function SourceDrawer({ source, threshold, onClose, onOpenTicket }: Props) {
  const c = source?.citation;
  const chunk = c?.source_id.match(/#chunk-(\d+)$/)?.[1]; // the response does not say how many chunks an article has
  return (
    <Drawer open={source !== null} title="Source" label={c ? `Source: ${c.source_id}` : "Source"} onClose={onClose} returnTo={source?.opener}>
      {source && c && (
        <>
          <p className="src-head">{source.n !== null && <span className="src-n num" aria-hidden="true">{source.n}</span>}<span className="src-title">{c.title}</span></p>
          <p className="src-id num">{c.article_id ?? c.ticket_id ?? c.source_id}{chunk ? ` · Chunk ${chunk}` : ""} · {c.source_id}</p>
          <ScoreLine citation={c} threshold={threshold} />
          <Excerpt citation={c} sentences={source.sentences} />
          <MatchedLine citation={c} />
          <IdentifierNote citation={c} threshold={threshold} />
          <p className="src-usage">{usageLabel(c.usage)}</p>
          {c.ticket_id && (
            <button type="button" className="btn" onClick={() => { onClose(); onOpenTicket(c.ticket_id!); }}>
              <ExternalIcon size={14} /> Open {c.ticket_id}
            </button>
          )}
        </>
      )}
    </Drawer>
  );
}
