/** `neutral` drops the pass/fail colouring: on an insufficient-evidence card a score above the tick must not look like a pass.
 * Similarity from 0 to 0.6 with a tick at the minimum score, so the threshold is always visible.
 * The numeric value is printed beside the bar: the bar's colour is never the only signal. */
export function ScoreMeter({ value, threshold, max = 0.6, label = "Similarity", neutral = false }: { value: number; threshold?: number | null; max?: number; label?: string; neutral?: boolean }) {
  const clamp = (n: number) => Math.max(0, Math.min(1, n / max)) * 100;
  const above = threshold == null || value >= threshold;
  const text = `${label} ${value.toFixed(2)}${threshold != null ? `, minimum ${threshold.toFixed(2)}` : ""}`;
  return (
    <span className="meter-wrap">
      <span className="meter" role="meter" aria-label={text} aria-valuetext={text} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(value, max)}>
        <span className={`meter-fill ${neutral ? "meter-neutral" : above ? "meter-ok" : "meter-low"}`} style={{ width: `${clamp(value)}%` }} />
        {threshold != null && <span className="meter-tick" data-testid="meter-threshold" style={{ left: `${clamp(threshold)}%` }} />}
      </span>
      <span className="meter-value num">{value.toFixed(2)}</span>
    </span>
  );
}
