/** Subsequence fuzzy match. Returns null when the query's letters do not appear in order, otherwise a score
 * (higher is better): an exact prefix scores most, then a contiguous substring (best at a word start), then scattered
 * letters (consecutive letters and word starts score more). */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.toLowerCase().replace(/\s+/g, " ").trim();
  if (!q) return 0;
  const t = text.toLowerCase();
  if (t.startsWith(q)) return 1000 - t.length;
  // A contiguous substring beats any scattered subsequence (greedy matching can mis-align a real hit).
  const at = t.indexOf(q);
  if (at !== -1) return 500 - at * 0.5 - t.length * 0.01 + (/[\s\-_#/]/.test(t[at - 1] ?? " ") ? 20 : 0);
  let ti = 0;
  let score = 0;
  let streak = 0;
  for (const ch of q) {
    if (ch === " ") continue;
    const found = t.indexOf(ch, ti);
    if (found === -1) return null;
    const wordStart = found === 0 || /[\s\-_#/]/.test(t[found - 1]);
    streak = found === ti ? streak + 1 : 0;
    score += 1 + streak * 2 + (wordStart ? 3 : 0) - Math.min(found - ti, 5) * 0.2;
    ti = found + 1;
  }
  return score - t.length * 0.01;
}

export function rank<T>(items: T[], query: string, text: (item: T) => string): T[] {
  if (!query.trim()) return items;
  return items
    .map((item) => ({ item, score: fuzzyScore(query, text(item)) }))
    .filter((x): x is { item: T; score: number } => x.score !== null)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.item);
}
