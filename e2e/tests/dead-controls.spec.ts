import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { UI_NO_API, UI_NO_DB } from "../env";
import { answerCard, answerSettled, ask as askRaw, appReady, openFilters, resetReviews } from "../helpers";
// every setup that asks a question waits for the new answer to stop smooth-scrolling before anything is clicked
const ask = async (...a: Parameters<typeof askRaw>) => { const r = await askRaw(...a); await answerSettled(a[0]); return r; };

/** Dead-control sweep: every distinct control (role + normalised name) is clicked once, in its own fresh state, and must
 *  (a) cause no console error, page error or failed request (4xx/5xx), (b) not break the layout (no sideways scroll),
 *  and (c) have a visible or behavioural effect: DOM, URL, focus, form state or a network request.
 *  The full console/network log goes to /tmp/master/evidence/sweep_log.json. */
test.use({ permissions: ["clipboard-read", "clipboard-write"] });
test.setTimeout(1_200_000);

const SEL = 'button, a[href], input, select, textarea, [role=button],[role=tab],[role=menuitem],[role=switch],[role=checkbox],[role=option],[tabindex]';
const norm = (role: string, name: string) =>
  role + "|" + name
    .replace(/^(high|medium|low) priority T-\d+.*$/, "Queue row")
    .replace(/^T-\d{3}\s.*/, "Ticket row")
    .replace(/^Source \d+: KB-\d+#chunk-\d+.*/, "Citation marker")
    .replace(/^(Open|High priority|Needs review|Resolved|All tickets)\s*\d+$/, "View $1")
    .replace(/^\d+ (open|high priority|need review|resolved)$/, "Overview stat")
    .replace(/^Filters \d+$/, "Filters n").replace(/^Notes for the agent \(\d+\)/, "Notes").replace(/^Scope: .*/, "Scope select").replace(/^Sort .*/, "Sort select")
    .replace(/^Count tickets: .*/, "Palette count").replace(/\d+ of 500 characters/, "counter");

/** The only controls that WRITE to the shared database. They would change what the other parallel workers see, so they are
 *  not clicked here; each is exercised one at a time by review.spec.ts and controls.spec.ts (confirm, cancel, double click, idempotence). */
const WRITES = /^(Mark reviewed|Confirm$|Mark current ticket reviewed)/;

/** Controls whose documented behaviour in this state is to change nothing. */
const DOCUMENTED_NO_OP = (state: string, role: string, name: string) =>
  state === "citation preview" && role === "button" && /^Source 1:/.test(name); // 'a click keeps the preview open' (CitationMarker): the preview is already open here

type State = { name: string; width?: number; url?: string; setup: (p: Page) => Promise<void> };
const T101 = async (p: Page) => { await p.goto("/#/ticket/T-101"); await appReady(p); await p.waitForLoadState("networkidle"); };
const STATES: State[] = [
  { name: "home", setup: async (p) => { await p.goto("/"); await appReady(p); } },
  { name: "filters popover", setup: async (p) => { await p.goto("/"); await appReady(p); await openFilters(p); } },
  { name: "filters on + chips", setup: async (p) => { await p.goto("/"); await appReady(p); const d = await openFilters(p); await d.getByRole("checkbox", { name: "High", exact: true }).check(); await d.getByRole("checkbox", { name: "Checkout", exact: true }).check(); await p.keyboard.press("Escape"); } },
  { name: "status popover", setup: async (p) => { await p.goto("/"); await appReady(p); await p.getByRole("button", { name: /Assistant ready/ }).click(); } },
  { name: "ticket T-101", setup: T101 },
  { name: "ticket T-104", setup: async (p) => { await p.goto("/#/ticket/T-104"); await appReady(p); await p.waitForLoadState("networkidle"); } },
  { name: "answered", setup: async (p) => { await T101(p); await ask(p, "Can the customer retry while payment is pending?"); await answerCard(p).waitFor(); } },
  { name: "answer menu", setup: async (p) => { await T101(p); await ask(p, "Can the customer retry while payment is pending?"); await answerCard(p).getByRole("button", { name: "Answer options" }).click(); } },
  { name: "citation preview", setup: async (p) => { await T101(p); await ask(p, "Can the customer retry while payment is pending?"); await answerCard(p).getByRole("button", { name: /^Source 1:/ }).first().focus(); await p.getByRole("dialog", { name: /^Source 1/ }).waitFor(); } },
  { name: "source drawer", setup: async (p) => { await T101(p); await ask(p, "Can the customer retry while payment is pending?"); await answerCard(p).getByRole("region", { name: "Sources" }).getByRole("button", { name: "View source" }).first().click(); } },
  { name: "trace drawer", setup: async (p) => { await T101(p); await ask(p, "Can the customer retry while payment is pending?"); await answerCard(p).getByRole("button", { name: "Answer options" }).click(); await p.getByRole("menuitem", { name: "View raw trace" }).click(); } },
  { name: "insufficient evidence", setup: async (p) => { await T101(p); await ask(p, "Does the product reimburse a bank decline fee?", "Billing"); await answerCard(p).waitFor(); } },
  { name: "no candidates", setup: async (p) => { await T101(p); await ask(p, "Configure scheduled SFTP delivery of reports to an external server", "Integrations"); await answerCard(p).waitFor(); } },
  { name: "collapsed brief after answer", setup: async (p) => { await p.goto("/#/ticket/T-104"); await appReady(p); await p.waitForLoadState("networkidle"); await ask(p, "lost authenticator after replacing phone; backup code and enroll a new device"); await answerCard(p).waitFor(); } },
  { name: "count answer", setup: async (p) => { await p.goto("/"); await appReady(p); await p.getByRole("button", { name: "How many open high-priority tickets mention checkout?" }).click(); await answerCard(p).waitFor(); } },
  { name: "draft open", setup: async (p) => { await T101(p); await p.keyboard.press("d"); await p.getByRole("textbox", { name: "Reply draft" }).waitFor(); } },
  { name: "draft holding reply", setup: async (p) => { await p.goto("/#/ticket/T-112"); await appReady(p); await p.waitForLoadState("networkidle"); await p.keyboard.press("d"); await p.getByRole("textbox", { name: "Reply draft" }).waitFor(); } },
  { name: "review confirm", setup: async (p) => { await p.goto("/#/ticket/T-104"); await appReady(p); await p.waitForLoadState("networkidle"); await p.keyboard.press("r"); await p.getByRole("button", { name: "Confirm" }).waitFor(); } },
  { name: "palette", setup: async (p) => { await p.goto("/"); await appReady(p); await p.keyboard.press("Control+k"); await p.getByRole("dialog", { name: "Command palette" }).waitFor(); } },
  { name: "palette typed count", setup: async (p) => { await p.goto("/"); await appReady(p); await p.keyboard.press("Control+k"); await p.keyboard.type("count open high priority checkout"); } },
  { name: "shortcuts sheet", setup: async (p) => { await p.goto("/"); await appReady(p); await p.keyboard.press("?"); await p.getByRole("dialog", { name: "Keyboard shortcuts" }).waitFor(); } },
  { name: "ticket not found", setup: async (p) => { await p.goto("/#/ticket/T-999"); await p.waitForTimeout(900); } },
  { name: "empty filtered queue", setup: async (p) => { await p.goto("/"); await appReady(p); await p.getByRole("button", { name: /^Resolved/ }).click(); const d = await openFilters(p); await d.getByRole("checkbox", { name: "Integrations", exact: true }).check(); await p.keyboard.press("Escape"); } },
  { name: "API down", url: UI_NO_API, setup: async (p) => { await p.goto(UI_NO_API); await p.waitForTimeout(1500); } },
  { name: "database not initialized", url: UI_NO_DB, setup: async (p) => { await p.goto(UI_NO_DB); await p.waitForTimeout(1500); } },
  { name: "390 queue", width: 390, setup: async (p) => { await p.goto("/"); await appReady(p); } },
  { name: "390 ticket", width: 390, setup: async (p) => { await p.goto("/#/ticket/T-101"); await p.waitForTimeout(1200); } },
  { name: "390 copilot", width: 390, setup: async (p) => { await p.goto("/#/ticket/T-101"); await p.waitForTimeout(1200); await p.getByRole("navigation", { name: "Sections" }).getByRole("button", { name: "Copilot" }).click(); } },
  { name: "1100 drawer layout", width: 1100, setup: async (p) => { await p.goto("/#/ticket/T-101"); await p.waitForTimeout(1200); } },
];

async function snapshot(p: Page) {
  return p.evaluate(() => {
    const forms = [...document.querySelectorAll<HTMLInputElement>("input,select,textarea")].map((e) => `${e.type}:${e.checked}:${e.value}`).join("|");
    return { url: location.href, html: document.body.innerHTML.length + ":" + document.body.innerHTML.slice(0, 4000).length, dom: document.body.innerHTML, forms, focus: document.activeElement ? document.activeElement.outerHTML.slice(0, 160) : "", theme: document.documentElement.dataset.theme ?? "" };
  });
}
async function tag(p: Page) {
  return p.evaluate((sel) => {
    const dialog = [...document.querySelectorAll<HTMLElement>('[role=dialog][aria-modal="true"]')].find((d) => d.getBoundingClientRect().width > 0);
    const root: ParentNode = dialog ?? document;
    const vis = (e: Element) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && !(e as HTMLElement).closest("[hidden],[inert]"); };
    const nm = (e: any) => (e.getAttribute("aria-label") || (e.labels && e.labels[0]?.innerText) || e.innerText || e.getAttribute("title") || e.getAttribute("placeholder") || e.value || "").replace(/\s+/g, " ").trim().slice(0, 90);
    const rl = (e: any) => e.getAttribute("role") || ({ BUTTON: "button", A: "link", INPUT: e.type || "input", SELECT: "select", TEXTAREA: "textbox" } as any)[e.tagName] || e.tagName.toLowerCase();
    document.querySelectorAll("[data-sweep]").forEach((e) => e.removeAttribute("data-sweep"));
    const out: { i: number; role: string; name: string; disabled: boolean; tabindex: string | null }[] = [];
    [...root.querySelectorAll<HTMLElement>(sel)].filter(vis).forEach((e, i) => { e.setAttribute("data-sweep", String(i)); out.push({ i, role: rl(e), name: nm(e), disabled: (e as HTMLButtonElement).disabled === true || e.getAttribute("aria-disabled") === "true", tabindex: e.getAttribute("tabindex") }); });
    return out;
  }, SEL);
}

test("every distinct control, clicked once in its own state: no console error, no failed request, no layout break, and an effect", async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL, permissions: ["clipboard-read", "clipboard-write"] });
  const swept = new Set<string>();
  const log: Record<string, unknown>[] = [];
  const problems: string[] = [];
  let clicks = 0;
  const queue = [...STATES];
  const WORKERS = 1;

  async function startFresh(page: Page, st: State) { await page.goto("about:blank"); await st.setup(page); } // a hash-only goto would keep the previous state's open drawer

  async function worker() {
    const page = await ctx.newPage();
    page.setDefaultTimeout(12000); // a stuck state becomes a reported problem, never a hang
    let current = "";
    let expectFailures = false;
    let requests = 0;
    page.on("request", () => requests++);
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") log.push({ state: current, kind: "console." + m.type(), text: m.text().slice(0, 240) }); });
    page.on("pageerror", (e) => log.push({ state: current, kind: "pageerror", text: e.message.slice(0, 240) }));
    page.on("requestfailed", (r) => log.push({ state: current, kind: "requestfailed", text: `${r.method()} ${r.url()} ${r.failure()?.errorText}` }));
    page.on("response", (r) => { if (r.status() >= 400) log.push({ state: current, kind: "http" + r.status(), text: `${r.request().method()} ${r.url()}` }); });
    for (let st = queue.shift(); st; st = queue.shift()) {
      current = st.name;
      expectFailures = st.name === "API down" || st.name === "database not initialized";
      await page.setViewportSize({ width: st.width ?? 1440, height: st.width === 390 ? 844 : 900 });
      try { await startFresh(page, st); } catch (e) { problems.push(`${st.name}: state could not be set up: ${(e as Error).message.split("\n")[0]}`); continue; }
      const controls = await tag(page);
      let first = true;
      for (const c of controls) {
        const key = norm(c.role, c.name);
        if (swept.has(key) || c.disabled || !c.name || c.tabindex === "-1" || WRITES.test(c.name)) continue;
        swept.add(key);
        if (c.role === "textbox" || c.role === "combobox") continue; // typing controls are exercised by the typed-input tests
        // Infrastructure failures (a state that is slow to re-create under parallel load) are retried once; findings are never retried.
        let done = false;
        for (let attempt = 1; attempt <= 3 && !done; attempt++) {
          try {
            if (!first || attempt > 1) await startFresh(page, st);
            first = false;
            const again = await tag(page);
            const target = again.find((x) => norm(x.role, x.name) === key) ?? again[c.i];
            if (!target) throw new Error("control not found after re-setup");
            const before = await snapshot(page);
            const logBefore = log.length; const reqBefore = requests;
            await page.locator(`[data-sweep="${target.i}"]`).click({ timeout: 3000 });
            done = true;
            clicks++;
            await page.waitForTimeout(300);
            const after = await snapshot(page);
            const effect = before.url !== after.url || before.dom !== after.dom || before.forms !== after.forms || before.focus !== after.focus || before.theme !== after.theme || requests > reqBefore;
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
            const fresh = log.slice(logBefore).filter((l) => l.state === st.name && !(expectFailures && /http5|requestfailed|console/.test(String(l.kind))));
            if (fresh.length) problems.push(`${st.name} | ${c.role} "${c.name}": ${fresh.map((l) => l.kind + " " + l.text).join(" ; ").slice(0, 200)}`);
            if (!effect && !DOCUMENTED_NO_OP(st.name, c.role, c.name)) problems.push(`${st.name} | ${c.role} "${c.name}": NO VISIBLE OR BEHAVIOURAL EFFECT`);
            if (overflow) problems.push(`${st.name} | ${c.role} "${c.name}": page scrolls sideways after the click`);
          } catch (e) {
            if (attempt === 3) problems.push(`${st.name} | ${c.role} "${c.name}": could not be exercised after 3 attempts: ${(e as Error).message.split("\n")[0]}`);
          }
        }
      }
    }
    await page.close();
  }

  resetReviews();
  await Promise.all(Array.from({ length: WORKERS }, () => worker()));
  resetReviews();
  fs.mkdirSync("/tmp/master/evidence", { recursive: true });
  fs.writeFileSync("/tmp/master/evidence/sweep_log.json", JSON.stringify({ clicks, families: swept.size, problems, log }, null, 1));
  console.log(`SWEEP clicks=${clicks} families=${swept.size} problems=${problems.length} logged=${log.length}`);
  for (const p of problems) console.log("SWEEP-PROBLEM " + p);
  await test.info().attach("sweep-log.json", { body: JSON.stringify({ clicks, problems, log }, null, 1), contentType: "application/json" });
  await ctx.close();
  expect(problems).toEqual([]);
});
