import { humanize } from "../format";
import type { Priority, Status } from "../types";

export function StatusBadge({ status }: { status: Status }) {
  return <span className={`badge badge-status-${status}`}>{humanize(status)}</span>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={`badge badge-priority-${priority}`} aria-label={`${priority} priority`}>
      <span className="dot" aria-hidden="true" />
      {humanize(priority)}
    </span>
  );
}

export function ReviewedBadge({ reviewedAt }: { reviewedAt: string | null }) {
  return reviewedAt ? (
    <span className="badge badge-reviewed" title={`Reviewed ${reviewedAt}`}>
      ✓ Reviewed
    </span>
  ) : null;
}
