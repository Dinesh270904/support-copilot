import type { SVGProps } from "react";

// Small inline stroke icon set (Lucide-style geometry), so the UI has no icon dependency.
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 16, children, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}>
      {children}
    </svg>
  );
}

export const SparkleIcon = (p: IconProps) => (
  <Icon {...p}><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></Icon>
);
export const FileTextIcon = (p: IconProps) => (
  <Icon {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></Icon>
);
export const SearchIcon = (p: IconProps) => (
  <Icon {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Icon>
);
export const LayersIcon = (p: IconProps) => (
  <Icon {...p}><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></Icon>
);
export const PenIcon = (p: IconProps) => (
  <Icon {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></Icon>
);
export const HashIcon = (p: IconProps) => (
  <Icon {...p}><path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" /></Icon>
);
export const CheckIcon = (p: IconProps) => (
  <Icon {...p}><path d="M20 6 9 17l-5-5" /></Icon>
);
export const CopyIcon = (p: IconProps) => (
  <Icon {...p}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></Icon>
);
export const AlertIcon = (p: IconProps) => (
  <Icon {...p}><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></Icon>
);
export const InboxIcon = (p: IconProps) => (
  <Icon {...p}><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z" /></Icon>
);
export const ChevronIcon = (p: IconProps) => (
  <Icon {...p}><path d="m9 18 6-6-6-6" /></Icon>
);
export const ShieldIcon = (p: IconProps) => (
  <Icon {...p}><path d="M12 3 4 6v6c0 4.5 3.2 8 8 9 4.8-1 8-4.5 8-9V6z" /><path d="M12 8v4M12 15.5h.01" /></Icon>
);
export const KeyboardIcon = (p: IconProps) => (
  <Icon {...p}><rect x="2.5" y="6" width="19" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" /></Icon>
);
export const SunIcon = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Icon>
);
export const MoonIcon = (p: IconProps) => (
  <Icon {...p}><path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7z" /></Icon>
);
export const ExternalIcon = (p: IconProps) => (
  <Icon {...p}><path d="M14 4h6v6M20 4 10 14" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></Icon>
);
export const ArrowIcon = (p: IconProps) => (
  <Icon {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Icon>
);
export const XIcon = (p: IconProps) => (
  <Icon {...p}><path d="M18 6 6 18M6 6l12 12" /></Icon>
);
export const FilterIcon = (p: IconProps) => (
  <Icon {...p}><path d="M3 5h18l-7 8v6l-4-2v-4z" /></Icon>
);
export const SlidersIcon = (p: IconProps) => (
  <Icon {...p}><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></Icon>
);
export const BookIcon = (p: IconProps) => (
  <Icon {...p}><path d="M2 5.5A1.5 1.5 0 0 1 3.5 4H10a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H3.5A1.5 1.5 0 0 1 2 16.5z" /><path d="M22 5.5A1.5 1.5 0 0 0 20.5 4H14a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6.5a1.5 1.5 0 0 0 1.5-1.5z" /></Icon>
);
export const CompareIcon = (p: IconProps) => (
  <Icon {...p}><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M6 8.5V15a3 3 0 0 0 3 3h3M18 15.5V9a3 3 0 0 0-3-3h-3" /><path d="m14 3-2 3 2 3M10 15l2 3-2 3" /></Icon>
);
export const ActivityIcon = (p: IconProps) => (
  <Icon {...p}><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></Icon>
);
export const PlugIcon = (p: IconProps) => (
  <Icon {...p}><path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0zM12 18v4" /></Icon>
);
export const ClockIcon = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon>
);
export const ResetIcon = (p: IconProps) => (
  <Icon {...p}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></Icon>
);
export const ArrowUpRightIcon = (p: IconProps) => (
  <Icon {...p}><path d="M7 17 17 7M8 7h9v9" /></Icon>
);
export const CircleSlashIcon = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="m5.6 5.6 12.8 12.8" /></Icon>
);
export const EyeIcon = (p: IconProps) => (
  <Icon {...p}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></Icon>
);
export const CheckCircleIcon = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="m8.5 12.5 2.5 2.5 4.5-5" /></Icon>
);
export const SignalIcon = (p: IconProps) => (
  <Icon {...p}><path d="M5 20v-4M10 20v-8M15 20V8M20 20V4" /></Icon>
);

/** Priority is shown by SHAPE as well as colour: signal bars, 3 filled = high, 2 = medium, 1 = low. */
export function PriorityIcon({ priority, size = 14 }: { priority: "low" | "medium" | "high"; size?: number }) {
  const label = `${priority} priority`;
  const filled = priority === "high" ? 3 : priority === "medium" ? 2 : 1;
  const bars = [{ x: 3, y: 14, h: 6 }, { x: 10, y: 9, h: 11 }, { x: 17, y: 4, h: 16 }];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={label} className={`prio-icon prio-${priority}`}>
      <title>{label}</title>
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y={b.y} width="4" height={b.h} rx="1"
          fill={i < filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.75" opacity={i < filled ? 1 : 0.55} />
      ))}
    </svg>
  );
}

/** Status by shape: open = outlined circle, resolved = filled circle with a check. */
export function StatusIcon({ status, size = 14 }: { status: "open" | "resolved"; size?: number }) {
  const label = status === "open" ? "Open" : "Resolved";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={label} className={`status-icon status-${status}`}>
      <title>{label}</title>
      {status === "open" ? (
        <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.75" />
      ) : (
        <>
          <circle cx="12" cy="12" r="9.5" fill="currentColor" />
          <path d="m7.8 12.4 2.9 2.9 5.5-6" fill="none" stroke="var(--surface-1)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}

/** An 8px category dot. Always shown next to the category name, never as a background fill. */
export function CategoryDot({ category }: { category: string }) {
  return <span className="cat-dot" aria-hidden="true" style={{ background: `var(--cat-${category.replace(/_/g, "-")}, var(--text-3))` }} />;
}
