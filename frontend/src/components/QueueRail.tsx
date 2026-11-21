import { VIEWS, type ViewId } from "../lib/views";
import { CheckCircleIcon, EyeIcon, InboxIcon, LayersIcon, SignalIcon } from "./Icons";

const ICON = { open: InboxIcon, high: SignalIcon, review: EyeIcon, resolved: CheckCircleIcon, all: LayersIcon };

interface Props {
  view: ViewId;
  counts: Record<ViewId, number>;
  /** The list could not be loaded: counts are unknown, not zero. */
  unknown?: boolean;
  /** Choosing a view also opens the queue list in its drawer. */
  onView: (view: ViewId) => void;
}

/** The 56px icon rail shown at 768-1023px: views only, each with its count. */
export function QueueRail({ view, counts, unknown = false, onView }: Props) {
  return (
    <ul className="rail" aria-label="Views">
      {VIEWS.map((v) => {
        const Icon = ICON[v.id];
        return (
          <li key={v.id}>
            <button type="button" className="rail-btn" aria-pressed={view === v.id} aria-label={unknown ? v.label : `${v.label} ${counts[v.id]}`} title={unknown ? v.label : `${v.label} · ${counts[v.id]}`} onClick={() => onView(v.id)}>
              <Icon size={18} weight={view === v.id ? "fill" : "regular"} />
              <span className="rail-count num" aria-hidden="true">{unknown ? "–" : counts[v.id]}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
