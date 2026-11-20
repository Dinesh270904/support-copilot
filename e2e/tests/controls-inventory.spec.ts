import fs from "node:fs";
import path from "node:path";
import { test, type Page } from "@playwright/test";
import { UI_NO_API, UI_NO_DB } from "../env";
import { answerCard, ask, openFilters } from "../helpers";

/** Not an assertion test: it walks every view and state and records every interactive element it can see.
 *  Output: e2e/.controls.json (gitignored). e2e/CONTROLS.md is written from it. */
type Row = { view: string; tag: string; role: string; name: string; disabled: boolean; tabindex: string | null };
const rows: Row[] = [];
const failures: string[] = [];
test.use({ actionTimeout: 8000 });
const flush = (tag: string) => { fs.writeFileSync(path.join(__dirname, "..", `.controls-${tag}.json`), JSON.stringify({ rows, failures }, null, 1)); console.log(`INVENTORY ${tag} rows=${rows.length} failures=${failures.length}`); for (const f of failures) console.log("STEP-FAILED " + f); };

async function record(page: Page, view: string) {
  const found = await page.evaluate(() => {
    const dialog = [...document.querySelectorAll<HTMLElement>('[role=dialog][aria-modal="true"]')].find((d) => d.getBoundingClientRect().width > 0);
    const root: ParentNode = dialog ?? document;
    const sel = 'button, a[href], input, select, textarea, [role=button],[role=tab],[role=menuitem],[role=switch],[role=checkbox],[role=option],[tabindex]';
    const vis = (e: Element) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none"; };
    const nm = (e: any) => (e.getAttribute("aria-label") || (e.labels && e.labels[0]?.innerText) || e.innerText || e.getAttribute("title") || e.getAttribute("placeholder") || e.value || "").replace(/\s+/g, " ").trim().slice(0, 90);
    const rl = (e: any) => e.getAttribute("role") || ({ BUTTON: "button", A: "link", INPUT: e.type || "input", SELECT: "select", TEXTAREA: "textbox" } as any)[e.tagName] || e.tagName.toLowerCase();
    return [...root.querySelectorAll<HTMLElement>(sel)].filter(vis).map((e: any) => ({ tag: e.tagName.toLowerCase(), role: rl(e), name: nm(e), disabled: e.disabled === true || e.getAttribute("aria-disabled") === "true", tabindex: e.getAttribute("tabindex") }));
  });
  for (const f of found) rows.push({ view, ...f });
}
async function step(name: string, fn: () => Promise<void>) {
  try { await fn(); } catch (e) { failures.push(`${name}: ${(e as Error).message.split("\n")[0]}`); }
}
const ready = async (page: Page, id: string) => { await page.keyboard.press("Escape"); await page.goto(`/#/ticket/${id}`); await page.waitForLoadState("networkidle"); await page.waitForTimeout(500); };

test("inventory: desktop 1440, dark then light", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/");
  await page.getByRole("button", { name: /^Open\s*7$/ }).waitFor({ timeout: 15000 });
  await step("queue", () => record(page, "Queue (no ticket selected)"));
  await step("filters", async () => { const d = await openFilters(page); await record(page, "Queue: Filters popover"); await d.getByRole("checkbox", { name: "High" }).check(); await d.getByRole("checkbox", { name: "Checkout" }).check(); await record(page, "Queue: Filters popover with a filter on"); await page.keyboard.press("Escape"); await record(page, "Queue: active filter chips"); });
  await step("health", async () => { await page.goto("/"); await page.getByRole("button", { name: /^Open\s*7$/ }).waitFor(); await page.locator("button.health").click(); await record(page, "Top bar: tool status popover"); await page.keyboard.press("Escape"); });
  await step("ticket", async () => { await ready(page, "T-101"); await record(page, "Ticket T-101 with automatic brief and similar cards"); });
  await step("brief-menu", async () => { await page.getByRole("button", { name: "Ticket brief options" }).click(); await record(page, "Ticket brief menu open"); await page.keyboard.press("Escape"); await page.getByRole("button", { name: "Similar resolved options" }).click(); await record(page, "Similar tickets menu open"); await page.keyboard.press("Escape"); });
  await step("brief-expand", async () => { const b = page.getByRole("button", { name: /^Show all/ }); if (await b.count()) { await b.click(); await record(page, "Brief: all missing-info items expanded"); } });
  await step("answered", async () => { await ask(page, "Can the customer retry while payment is pending?"); await answerCard(page).waitFor(); await record(page, "Answered card (T-101, pending payment)"); });
  await step("card-menu", async () => { await answerCard(page).getByRole("button", { name: "Answer options" }).click(); await record(page, "Answer card menu open"); await page.keyboard.press("Escape"); });
  await step("limits", async () => { const b = answerCard(page).getByRole("button", { name: /limit|detail/i }).first(); if (await b.count()) { await b.click(); await record(page, "Answer card: limits expanded"); } });
  await step("preview", async () => { await answerCard(page).getByRole("button", { name: /^Source 1:/ }).focus(); await page.getByRole("dialog", { name: /^Source 1/ }).waitFor(); await record(page, "Citation preview (focus)"); });
  await step("drawer", async () => { await page.getByRole("dialog", { name: /^Source 1/ }).getByRole("button", { name: /Open source/ }).click(); await page.getByRole("dialog", { name: /Source/ }).last().waitFor(); await record(page, "Source drawer"); await page.keyboard.press("Escape"); });
  await step("trace", async () => { await answerCard(page).getByRole("button", { name: "Answer options" }).click(); await page.getByRole("menuitem", { name: "View raw trace" }).click(); await record(page, "Raw trace drawer"); await page.keyboard.press("Escape"); });
  await step("insufficient", async () => { await ready(page, "T-101"); await ask(page, "Does the product reimburse a bank decline fee?", "Billing"); await answerCard(page).waitFor(); await record(page, "Insufficient evidence card (Billing)"); });
  await step("nocand", async () => { await ask(page, "Configure scheduled SFTP delivery of reports to an external server", "Integrations"); await answerCard(page).waitFor(); await record(page, "No candidates card (Integrations)"); });
  await step("validation", async () => { await page.getByRole("textbox", { name: "Ask a question" }).fill("ab"); await page.keyboard.press("Enter"); await record(page, "Ask box: validation message"); });
  await step("draft", async () => { await ready(page, "T-101"); await page.keyboard.press("d"); await page.getByRole("textbox", { name: "Reply draft" }).first().waitFor(); await record(page, "Draft open (T-101)"); });
  await step("holding", async () => { await ready(page, "T-112"); await page.keyboard.press("d"); await page.getByRole("textbox", { name: "Reply draft" }).first().waitFor(); await record(page, "Draft: holding reply (T-112)"); });
  await step("review", async () => { await ready(page, "T-104"); await page.keyboard.press("r"); await page.getByRole("button", { name: "Confirm" }).waitFor(); await record(page, "Review confirm (T-104)"); await page.keyboard.press("Escape"); });
  await step("palette", async () => { await page.keyboard.press("Control+k"); await page.getByRole("dialog", { name: "Command palette" }).waitFor(); await record(page, "Command palette (empty)"); await page.keyboard.type("count open"); await record(page, "Command palette (typed)"); await page.keyboard.press("Escape"); });
  await step("shortcuts", async () => { await page.keyboard.press("?"); await page.getByRole("dialog", { name: "Keyboard shortcuts" }).waitFor(); await record(page, "Shortcuts sheet"); await page.keyboard.press("Escape"); });
  await step("similar", async () => { await ready(page, "T-104"); await record(page, "Ticket T-104 with similar ticket T-105"); });
  await step("notfound", async () => { await page.goto("/#/ticket/T-999"); await page.waitForTimeout(800); await record(page, "Ticket not found"); });
  await step("empty-filter", async () => { await page.goto("/"); await page.getByRole("button", { name: /^Resolved/ }).click(); const d = await openFilters(page); await d.getByRole("checkbox", { name: "Integrations" }).check(); await page.keyboard.press("Escape"); await record(page, "Queue: no tickets match filters"); });
  await step("light", async () => { await page.goto("/"); await page.getByRole("button", { name: /^Open\s*7$/ }).waitFor(); await page.keyboard.press("t"); await record(page, "Queue, light theme"); await ready(page, "T-101"); await record(page, "Ticket T-101, light theme"); await page.keyboard.press("t"); });
  await step("collapsed-brief", async () => { await ready(page, "T-104"); await ask(page, "lost authenticator after replacing phone; backup code and enroll a new device"); await answerCard(page).waitFor(); await record(page, "After an answer: brief and similar collapsed (Show buttons)"); await page.getByRole("button", { name: "Show ticket brief" }).click(); await record(page, "After an answer: brief expanded again (Hide button)"); });
  await step("count-answer", async () => { await ready(page, "T-101"); await page.keyboard.press("Control+k"); await page.keyboard.type("count open high priority checkout"); await page.keyboard.press("Enter"); await page.waitForTimeout(500); await record(page, "Palette: inline count result"); await page.keyboard.press("Escape"); });
  await step("error-card", async () => { await page.route("**/api/assistant/run", (r) => r.request().postDataJSON().action === "search_knowledge" ? r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "assistant_unavailable", message: "The assistant tool server is unavailable. Try again shortly.", request_id: "abc123" } }) }) : r.continue()); await ready(page, "T-101"); await page.getByRole("textbox", { name: "Ask a question" }).fill("Can the customer retry while payment is pending?"); await page.keyboard.press("Enter"); await page.getByRole("button", { name: "Retry" }).first().waitFor(); await record(page, "Answer error card (MCP unavailable) with Retry"); await page.unroute("**/api/assistant/run"); });
  await step("loading", async () => { await page.route("**/api/assistant/run", async (r) => { await new Promise((x) => setTimeout(x, 1500)); await r.continue(); }); await ready(page, "T-104"); await page.getByRole("textbox", { name: "Ask a question" }).fill("Can they sign in with a backup code?"); await page.keyboard.press("Enter"); await page.waitForTimeout(300); await record(page, "Loading: answer in flight (Ask disabled)"); await page.waitForTimeout(1800); await page.unroute("**/api/assistant/run"); });
  flush("desktop");
});

test("inventory: error states and 390 phone layout", async ({ page, browser }) => {
  test.setTimeout(120_000);
  await step("no-db", async () => { await page.goto(UI_NO_DB); await page.waitForTimeout(1500); await record(page, "Error: database not initialized"); });
  await step("no-api", async () => { await page.goto(UI_NO_API); await page.waitForTimeout(1500); await record(page, "Error: API down"); });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: "http://127.0.0.1:5180" });
  const m = await ctx.newPage();
  await step("m-queue", async () => { await m.goto("/"); await m.waitForTimeout(1200); await record(m, "390: queue tab"); });
  await step("m-ticket", async () => { await m.goto("/#/ticket/T-101"); await m.waitForTimeout(1200); await record(m, "390: ticket (tab bar)"); });
  await step("m-copilot", async () => { await m.getByRole("navigation", { name: "Sections" }).getByRole("button").last().click(); await m.waitForTimeout(800); await record(m, "390: copilot tab"); });
  await step("m-palette", async () => { await m.keyboard.press("Control+k"); await m.waitForTimeout(300); await record(m, "390: command palette"); await m.keyboard.press("Escape"); });
  await ctx.close();
  flush("states");
});
