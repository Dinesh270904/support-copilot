/** Similarity from 0 to 0.6: a 120x6 track, a fill that is accent above the minimum and warning below it, and a
 * 2px tick at the minimum score. The number is printed beside the bar and spoken in the accessible name, so the
 * bar's colour is never the only signal. `neutral` drops the pass/fail colouring: on an insufficient-evidence card a
 * score above the tick must not look like a pass. */
export function ScoreMeter({ value, threshold, max = 0.6, label = "Similarity", neutral = false }: { value: number; threshold?: number | null; max?: number; label?: string; neutral?: boolean }) {
  const pct = (n: number) => Math.max(0, Math.min(1, n / max)) * 100;
  const above = threshold == null || value >= threshold;
  const name = threshold != null ? `${label} ${value.toFixed(2)}, threshold ${threshold.toFixed(2)}, ${above ? "above" : "below"} threshold` : `${label} ${value.toFixed(2)}`;
  const tip = threshold != null ? `Cosine similarity ${value.toFixed(2)}. Minimum to count as evidence: ${threshold.toFixed(2)}.` : `Cosine similarity ${value.toFixed(2)}.`;
  return (
    <span className="meter-wrap" title={tip}>
      <span className="meter" role="meter" aria-label={name} aria-valuetext={name} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(value, max)}>
        <span className={`meter-fill ${neutral ? "meter-neutral" : above ? "meter-ok" : "meter-low"}`} style={{ width: `${pct(value)}%` }} />
        {threshold != null && <span className="meter-tick" data-testid="meter-threshold" style={{ left: `${pct(threshold)}%` }} />}
      </span>
      <span className="meter-value num">{value.toFixed(2)}</span>
    </span>
  );
}
