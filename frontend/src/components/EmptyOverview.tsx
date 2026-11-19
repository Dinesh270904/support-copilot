import { countViews, type ViewId } from "../lib/views";
import type { TicketListItem } from "../types";
import { ArrowIcon } from "./Icons";

/** What each designed demo ticket shows off. Only tickets that are actually in the loaded list are offered. */
const TRY_THESE: [string, string][] = [
  ["T-101", "Pending payment: see the guardrail against asking for a second payment"],
  ["T-104", "MFA recovery: grounded steps plus a similar resolved ticket"],
  ["T-108", "Large CSV export: background-job guidance"],
  ["T-112", "SFTP request with injected text: untrusted content is flagged, not followed"],
];

const KEYS: [string, string][] = [["⌘K", "Command palette"], ["j / k", "Next / previous ticket"], ["/", "Ask the knowledge base"], ["?", "All shortcuts"]];

interface Props {
  tickets: TicketListItem[];
  loading: boolean;
  onOpenTicket: (id: string) => void;
  onView: (view: ViewId) => void;
}

/** The ticket pane with nothing selected: real counts (computed from the list, each one switches the view),
 * a few tickets worth opening first, and the four most useful keys. */
export function EmptyOverview({ tickets, loading, onOpenTicket, onView }: Props) {
  const counts = countViews(tickets);
  const stats: { view: ViewId; n: number; label: string }[] = [
    { view: "open", n: counts.open, label: "open" },
    { view: "high", n: counts.high, label: "high priority" },
    { view: "review", n: counts.review, label: "need review" },
    { view: "resolved", n: counts.resolved, label: "resolved" },
  ];
  const tries = TRY_THESE.filter(([id]) => tickets.some((t) => t.id === id));
  return (
    <div className="overview">
      <h2 className="overview-title">Pick a ticket to start</h2>
      {!loading && tickets.length > 0 && (
        <p className="overview-stats" aria-label="Queue summary">
          {stats.map((s, i) => (
            <span key={s.view}>
              <button type="button" className="stat" onClick={() => onView(s.view)}><span className="num">{s.n}</span> {s.label}</button>
              {i < stats.length - 1 && <span className="stat-sep" aria-hidden="true"> · </span>}
            </span>
          ))}
        </p>
      )}
      {tries.length > 0 && (
        <section aria-labelledby="try-h" className="overview-block">
          <h3 id="try-h" className="block-label">Try these</h3>
          <ul className="try-list">
            {tries.map(([id, what]) => (
              <li key={id}>
                <button type="button" className="try-row" onClick={() => onOpenTicket(id)}>
                  <span className="id-chip num">{id}</span>
                  <span className="try-what">{what}</span>
                  <ArrowIcon size={14} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section aria-labelledby="keys-h" className="overview-block">
        <h3 id="keys-h" className="block-label">Keyboard</h3>
        <dl className="mini-keys">
          {KEYS.map(([k, what]) => (<div key={k}><dt><kbd>{k}</kbd></dt><dd>{what}</dd></div>))}
        </dl>
      </section>
    </div>
  );
}
