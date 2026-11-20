import { execFileSync } from "node:child_process";
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { API, DB, PY } from "./env";

/** Clear every review flag so a test that mutates state starts from the seed. (The API reads the file live.) */
export function resetReviews(): void {
  execFileSync(PY, ["-c", `import sqlite3;c=sqlite3.connect(${JSON.stringify(DB)});c.execute("update tickets set reviewed_at=null");c.commit()`]);
}

export async function apiTicket(request: APIRequestContext, id: string) {
  const resp = await request.get(`${API}/api/tickets/${id}`);
  expect(resp.ok()).toBeTruthy();
  return resp.json();
}

export async function apiTickets(request: APIRequestContext, query = "") {
  const resp = await request.get(`${API}/api/tickets?limit=100${query}`);
  expect(resp.ok()).toBeTruthy();
  return resp.json();
}

/** Open a ticket by URL and wait until its title is on screen. */
export async function openTicket(page: Page, id: string, title: RegExp | string) {
  await page.goto(`/#/ticket/${id}`);
  await expect(page.getByRole("heading", { level: 2, name: title })).toBeVisible();
}

/** The ticket IDs currently listed in the queue, in order. */
export async function queueIds(page: Page): Promise<string[]> {
  const rows = page.getByRole("region", { name: "Queue" }).getByRole("button", { name: /T-\d{3}/ });
  const texts = await rows.allInnerTexts();
  return texts.map((t) => t.match(/T-\d{3}/)![0]);
}

export async function openFilters(page: Page) {
  await page.getByRole("button", { name: /^Filters/ }).click();
  return page.getByRole("dialog", { name: "Filters" });
}

import type { Request } from "@playwright/test";
export const isRun = (r: Request) => r.url().endsWith("/api/assistant/run") && r.method() === "POST";

/** Type a question into the Ask box and submit it with the real Enter key; resolves with the API response body. */
export async function ask(page: Page, text: string, scope?: string) {
  if (scope) await page.getByRole("combobox", { name: /Scope/ }).selectOption({ label: scope });
  await page.getByRole("textbox", { name: "Ask a question" }).fill(text);
  const response = page.waitForResponse((r) => isRun(r.request()) && r.request().postDataJSON().action === "search_knowledge");
  await page.keyboard.press("Enter");
  return (await response).json();
}

/** The newest answer card. */
export const answerCard = (page: Page) => page.getByRole("article", { name: "Answer" }).first();

/** Pre-mark a ticket reviewed at a known time (for idempotency checks). */
export function setReviewed(id: string, at: string): void {
  execFileSync(PY, ["-c", `import sqlite3;c=sqlite3.connect(${JSON.stringify(DB)});c.execute("update tickets set reviewed_at=? where id=?",(${JSON.stringify(at)},${JSON.stringify(id)}));c.commit()`]);
}

import { execSync } from "node:child_process";
/** The real MCP stdio child of the isolated API (port 8100). */
export function mcpChildPid(): number {
  const api = execSync(`pgrep -f "uvicorn app.api.main:app --host 127.0.0.1 --port 8100"`).toString().trim().split("\n")[0];
  return Number(execSync(`pgrep -P ${api} -f app.mcp_server`).toString().trim().split("\n")[0]);
}

/** Save a screenshot of the current state under e2e/screenshots (gitignored). */
export async function shot(page: Page, name: string) {
  await page.screenshot({ path: `screenshots/${name}.png` });
}

/** Wait for the newest answer card and for the Copilot panel to stop scrolling (the new answer is smooth-scrolled into view). */
export async function answerSettled(page: Page) {
  await answerCard(page).waitFor();
  await expect
    .poll(async () => {
      const read = () => page.evaluate(() => document.querySelector(".copilot-scroll")!.scrollTop);
      const a = await read();
      await page.waitForTimeout(250);
      return a === (await read());
    })
    .toBe(true);
}

/** The queue has rendered, so the keyboard shortcuts are registered. (They go live ~120 ms after the load event; a test that
 *  presses a shortcut the instant goto() returns races that.) */
export async function appReady(page: Page) {
  await expect(page.getByRole("button", { name: /^Open\s*\d+$/ })).toBeVisible();
}
