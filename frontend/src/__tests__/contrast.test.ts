import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const tokensCss = readFileSync("src/styles/tokens.css", "utf8") // vitest runs from frontend/;

/**
 * WCAG AA (4.5:1) for every text token on every surface it can sit on, in both themes. Tints are composited the way
 * the browser does it: the semantic colour at --tint-a alpha over the surface underneath. Rules this encodes:
 *   - --text and --text-2 work on every surface and every tint;
 *   - --text-3 is for plain surfaces only (it is ~4.3:1 on a tint, so it must not be used there);
 *   - each semantic text token (--ok-text ...) works on its own tint and on every plain surface.
 * Run `CONTRAST_REPORT=1 npx vitest run contrast` to print every ratio.
 */

type Rgb = [number, number, number];

const SURFACES = ["canvas", "surface-1", "surface-2", "surface-3"] as const;
const SEMANTIC = ["ok", "warn", "danger", "accent", "draft"] as const;

function block(start: string): string {
  const from = tokensCss.indexOf(start);
  return tokensCss.slice(from, tokensCss.indexOf("}", from));
}

function tokens(css: string): Record<string, string> {
  return Object.fromEntries([...css.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
}

function alpha(css: string, name: string): number {
  return Number(css.match(new RegExp(`--${name}:\\s*(\\d+)%`))![1]) / 100;
}

const rgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
const mix = (fg: Rgb, a: number, bg: Rgb): Rgb => fg.map((v, i) => v * a + bg[i] * (1 - a)) as Rgb;

function luminance([r, g, b]: Rgb): number {
  const f = (v: number) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function ratio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

interface Pair { theme: string; text: string; background: string; ratio: number }

function pairs(theme: string, css: string): Pair[] {
  const t = tokens(css);
  const tintA = alpha(css, "tint-a");
  const surfaces = Object.fromEntries(SURFACES.map((s) => [s, rgb(t[s])]));
  const out: Pair[] = [];
  const add = (text: string, background: string, bg: Rgb, fg: Rgb = rgb(t[text])) =>
    out.push({ theme, text: `--${text}`, background, ratio: ratio(fg, bg) });

  for (const s of SURFACES) {
    for (const text of ["text", "text-2", "text-3", ...SEMANTIC.map((n) => `${n}-text`)]) add(text, s, surfaces[s]);
  }
  for (const tint of SEMANTIC) {
    for (const s of SURFACES) {
      const bg = mix(rgb(t[tint]), tintA, surfaces[s]);
      for (const text of ["text", "text-2", `${tint}-text`]) add(text, `${tint} tint on ${s}`, bg);
    }
  }
  add("on-accent", "accent", rgb(t.accent));

  // The highlighted source row (a focused or hovered citation marker): an accent tint over the surface.
  for (const sName of SURFACES) {
    const row = mix(rgb(t.accent), tintA, surfaces[sName]);
    add("text-2", `active source row on ${sName} (matched-terms line)`, row);
    add("text", `active source row on ${sName}`, row);
    add("accent-text", `source ID chip on active row (chip background is --surface-1)`, surfaces["surface-1"]);
  }
  return out;
}

const all = [
  ...pairs("dark", block(":root {\n  color-scheme: dark")),
  ...pairs("light", block(':root[data-theme="light"]')),
];

describe("text contrast (WCAG AA 4.5:1)", () => {
  it("covers both themes", () => {
    expect(new Set(all.map((p) => p.theme))).toEqual(new Set(["dark", "light"]));
    expect(all.length).toBeGreaterThan(150);
  });

  it("every text token meets 4.5:1 on every surface and tint it is allowed on", () => {
    if (process.env.CONTRAST_REPORT) console.table(all.map((p) => ({ ...p, ratio: +p.ratio.toFixed(2) })));
    const failing = all.filter((p) => p.ratio < 4.5).map((p) => `${p.theme} ${p.text} on ${p.background}: ${p.ratio.toFixed(2)}`);
    expect(failing).toEqual([]);
  });
});

describe("the highlighted source row", () => {
  const components = readFileSync("src/styles/components.css", "utf8");
  const dark = tokens(block(":root {\n  color-scheme: dark"));
  const light = tokens(block(':root[data-theme="light"]'));
  const a = (css: string) => alpha(css, "tint-a");

  it("needs its overrides: the source ID chip on a doubled accent tint and --text-3 on the tint are below 4.5:1", () => {
    for (const [css, t] of [[block(":root {\n  color-scheme: dark"), dark], [block(':root[data-theme="light"]'), light]] as const) {
      const worst = Math.min(
        ...SURFACES.flatMap((sName) => {
          const row = mix(rgb(t.accent), a(css), rgb(t[sName]));
          const doubled = mix(rgb(t.accent), a(css), row);
          return [ratio(rgb(t["accent-text"]), doubled), ratio(rgb(t["text-3"]), row)];
        }),
      );
      expect(worst).toBeLessThan(4.5);
    }
  });

  it("keeps the overrides in the stylesheet", () => {
    expect(components).toMatch(/\.source-active \.source-id\s*\{[^}]*background:\s*var\(--surface-1\)/);
    expect(components).toMatch(/\.source-active \.matched-line\s*\{[^}]*color:\s*var\(--text-2\)/);
  });
});
