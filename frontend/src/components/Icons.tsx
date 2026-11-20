import type { Icon as PhosphorIcon, IconWeight } from "@phosphor-icons/react";
import {
  ArrowCounterClockwise, ArrowRight, ArrowSquareOut, BookOpenText, CaretDown, CaretRight, CaretUp, CellSignalHigh,
  CellSignalLow, CellSignalMedium, Check, CheckCircle, Circle, Clock, Copy, Eye, FileText, GitDiff, Hash, Headset, Info,
  ClockCounterClockwise, Keyboard, MagnifyingGlass, Moon, PencilSimpleLine, Plug, Prohibit, Pulse, ShieldWarning, SlidersHorizontal, Sparkle,
  Stack, Sun, Tray, User, Warning, X, XCircle,
} from "@phosphor-icons/react";

/**
 * The only file that imports the icon library (Phosphor, MIT). Components import the named wrappers below, so
 * changing the icon set is a one-file edit. Sizes by role: 16 default, 14 in rows and chips, 18 in the top bar.
 * Weights by role: "regular" by default, "fill" for active or selected states, "duotone" for brand and large
 * empty-state icons. Every icon is aria-hidden; one that stands alone (PriorityIcon, StatusIcon) carries a label.
 */
export interface IconProps {
  size?: number;
  weight?: IconWeight;
  className?: string;
}

const wrap =
  (Glyph: PhosphorIcon) =>
  ({ size = 16, weight = "regular", className }: IconProps) => (
    <Glyph size={size} weight={weight} className={className} aria-hidden="true" focusable="false" />
  );

export const SparkleIcon = wrap(Sparkle);
export const SearchIcon = wrap(MagnifyingGlass);
export const InboxIcon = wrap(Tray);
export const SignalIcon = wrap(CellSignalHigh);
export const EyeIcon = wrap(Eye);
export const CheckCircleIcon = wrap(CheckCircle);
export const LayersIcon = wrap(Stack);
export const SlidersIcon = wrap(SlidersHorizontal);
export const FileTextIcon = wrap(FileText);
export const CompareIcon = wrap(GitDiff);
export const HistoryIcon = wrap(ClockCounterClockwise); // past tickets
export const BookIcon = wrap(BookOpenText);
export const PenIcon = wrap(PencilSimpleLine);
export const HashIcon = wrap(Hash);
export const CheckIcon = wrap(Check);
export const AlertIcon = wrap(Warning);
export const CircleSlashIcon = wrap(Prohibit);
export const ShieldIcon = wrap(ShieldWarning);
export const ActivityIcon = wrap(Pulse);
export const PlugIcon = wrap(Plug);
export const CopyIcon = wrap(Copy);
export const ResetIcon = wrap(ArrowCounterClockwise);
export const ExternalIcon = wrap(ArrowSquareOut);
export const ArrowUpRightIcon = wrap(ArrowSquareOut);
export const XIcon = wrap(X);
export const XCircleIcon = wrap(XCircle);
export const SunIcon = wrap(Sun);
export const MoonIcon = wrap(Moon);
export const KeyboardIcon = wrap(Keyboard);
export const ClockIcon = wrap(Clock);
export const ChevronIcon = wrap(CaretRight);
export const CaretUpIcon = wrap(CaretUp);
export const CaretDownIcon = wrap(CaretDown);
export const ArrowIcon = wrap(ArrowRight);
export const InfoIcon = wrap(Info);
export const CircleIcon = wrap(Circle);
export const UserIcon = wrap(User);
export const HeadsetIcon = wrap(Headset);

/** Priority is shown by shape as well as colour: signal bars, three = high, two = medium, one = low. */
export function PriorityIcon({ priority, size = 14 }: { priority: "low" | "medium" | "high"; size?: number }) {
  const label = `${priority} priority`;
  const Glyph = priority === "high" ? CellSignalHigh : priority === "medium" ? CellSignalMedium : CellSignalLow;
  return <Glyph size={size} weight="regular" role="img" aria-label={label} alt={label} className={`prio-icon prio-${priority}`} />;
}

/** Status by shape: open = outlined circle, resolved = filled circle with a check. */
export function StatusIcon({ status, size = 14 }: { status: "open" | "resolved"; size?: number }) {
  const label = status === "open" ? "Open" : "Resolved";
  const Glyph = status === "open" ? Circle : CheckCircle;
  return <Glyph size={size} weight={status === "open" ? "regular" : "fill"} role="img" aria-label={label} alt={label} className={`status-icon status-${status}`} />;
}

/** An 8px category dot. Always shown next to the category name, never as a background fill. */
export function CategoryDot({ category }: { category: string }) {
  return <span className="cat-dot" aria-hidden="true" style={{ background: `var(--cat-${category.replace(/_/g, "-")}, var(--text-3))` }} />;
}
