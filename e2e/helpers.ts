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
