/**
 * The backend composes answers deterministically: evidence lines look like
 *   "- <verbatim sentence> [KB-01#chunk-1]"
 * and other sentences may carry inline "[KB-06#chunk-2]" tags. This turns those tags into
 * numbered markers (in order of first appearance) and records which sentences each source supplied.
 */
const TAG = /\[((?:KB-\d+#chunk-\d+)|(?:T-\d+))\]/g;
const EVIDENCE_LINE = /^- (.+) \[((?:KB-\d+#chunk-\d+)|(?:T-\d+))\]$/;

export type Piece = { kind: "text"; text: string } | { kind: "cite"; id: string };
export interface Line {
  evidence: boolean;
  pieces: Piece[];
}
export interface ParsedAnswer {
  lines: Line[];
  /** source id -> marker number, by first appearance */
  numbers: Map<string, number>;
  /** source id -> the verbatim sentences quoted from it */
  quoted: Map<string, string[]>;
}

export function parseAnswer(answer: string): ParsedAnswer {
  const lines: Line[] = [];
  const numbers = new Map<string, number>();
  const quoted = new Map<string, string[]>();
  const number = (id: string) => {
    if (!numbers.has(id)) numbers.set(id, numbers.size + 1);
  };

  for (const raw of answer.split("\n")) {
    if (!raw.trim()) continue;
    const ev = raw.match(EVIDENCE_LINE);
    if (ev) {
      number(ev[2]);
      quoted.set(ev[2], [...(quoted.get(ev[2]) ?? []), ev[1]]);
      lines.push({ evidence: true, pieces: [{ kind: "text", text: ev[1] }, { kind: "cite", id: ev[2] }] });
      continue;
    }
    const pieces: Piece[] = [];
    let last = 0;
    for (const m of raw.matchAll(TAG)) {
      if (m.index! > last) pieces.push({ kind: "text", text: raw.slice(last, m.index) });
      pieces.push({ kind: "cite", id: m[1] });
      number(m[1]);
      last = m.index! + m[0].length;
    }
    if (last < raw.length) pieces.push({ kind: "text", text: raw.slice(last) });
    lines.push({ evidence: false, pieces });
  }
  return { lines, numbers, quoted };
}

/** Split an excerpt into plain and highlighted runs, highlighting each quoted sentence found verbatim. */
export function highlight(excerpt: string, sentences: string[]): { text: string; hit: boolean }[] {
  const spans = sentences
    .map((s) => ({ start: excerpt.indexOf(s), len: s.length }))
    .filter((s) => s.start >= 0)
    .sort((a, b) => a.start - b.start);
  const out: { text: string; hit: boolean }[] = [];
  let cursor = 0;
  for (const s of spans) {
    if (s.start < cursor) continue; // overlapping quote: already covered
    if (s.start > cursor) out.push({ text: excerpt.slice(cursor, s.start), hit: false });
    out.push({ text: excerpt.slice(s.start, s.start + s.len), hit: true });
    cursor = s.start + s.len;
  }
  if (cursor < excerpt.length) out.push({ text: excerpt.slice(cursor), hit: false });
  return out.length ? out : [{ text: excerpt, hit: false }];
}
