import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { API } from "../env";
import { appReady } from "../helpers";

/** Limitations that used to be documented and are now fixed: each has a regression test here. */

test("a reply draft and the agent's edits survive a page reload (same tab), per ticket", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto("/#/ticket/T-101");
  await appReady(page);
  await page.getByRole("button", { name: /Draft with Copilot/ }).click();
  const box = page.getByRole("textbox", { name: "Reply draft" });
  await expect(box).toBeVisible();
  await box.fill((await box.inputValue()) + " EDITED-BY-AGENT-4471");
  await expect(page.getByText(/^Edited ·/)).toBeVisible();

  await page.reload();
  await appReady(page);
  await expect(page.getByRole("textbox", { name: "Reply draft" })).toHaveValue(/EDITED-BY-AGENT-4471$/);
  await expect(page.getByRole("heading", { name: /Draft · not sent/ })).toBeVisible();

  // Another ticket does not inherit it.
  await page.goto("/#/ticket/T-104");
  await expect(page.getByRole("heading", { level: 2, name: /Locked out after replacing authenticator phone/ })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Reply draft" })).toHaveCount(0);

  // Reset still returns to the generated text.
  await page.goto("/#/ticket/T-101");
  await page.getByRole("button", { name: /Reset/ }).click();
  await expect(page.getByRole("textbox", { name: "Reply draft" })).not.toHaveValue(/EDITED-BY-AGENT-4471/);
});

test("a saved draft belongs to one tab session: a brand-new browser context starts without it, the original keeps it", async ({ page, browser }) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto("/#/ticket/T-101");
  await appReady(page);
  await page.getByRole("button", { name: /Draft with Copilot/ }).click();
  const box = page.getByRole("textbox", { name: "Reply draft" });
  await expect(box).toBeVisible();
  await box.fill("PERSISTED-DRAFT-9183");
  await page.reload();
  await appReady(page);
  await expect(page.getByRole("textbox", { name: "Reply draft" })).toHaveValue("PERSISTED-DRAFT-9183"); // survives a reload

  const fresh = await browser.newContext({ viewport: { width: 1440, height: 800 } }); // what closing the tab and opening a new one amounts to
  const other = await fresh.newPage();
  await other.goto("/#/ticket/T-101");
  await expect(other.getByRole("heading", { level: 2, name: /Checkout timed out/ })).toBeVisible();
  await expect(other.getByRole("textbox", { name: "Reply draft" })).toHaveCount(0); // discarded with the old tab session
  await expect(other.getByText("PERSISTED-DRAFT-9183")).toHaveCount(0);
  await fresh.close();

  await expect(page.getByRole("textbox", { name: "Reply draft" })).toHaveValue("PERSISTED-DRAFT-9183"); // the first tab is unaffected
});

test("phone: every tab has exactly one visible main landmark, and axe finds no landmark-one-main on the Queue screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const tabs = page.getByRole("navigation", { name: "Sections" });
  await expect(tabs).toBeVisible();
  for (const name of ["Queue", "Ticket", "Copilot"]) {
    await tabs.getByRole("button", { name }).click();
    await expect(page.getByRole("main")).toHaveCount(1);
  }
  await tabs.getByRole("button", { name: "Queue" }).click();
  await page.waitForLoadState("networkidle");
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"]).analyze();
  expect(r.violations.map((v) => v.id)).not.toContain("landmark-one-main");
});

test("API: a request body over the limit gets 413 with the standard error shape", async ({ request }) => {
  const resp = await request.post(`${API}/api/assistant/run`, { data: { action: "search_knowledge", query: "x".repeat(40_000) } });
  expect(resp.status()).toBe(413);
  expect((await resp.json()).error.code).toBe("payload_too_large");
  expect((await request.post(`${API}/api/assistant/run`, { data: { action: "count_tickets" } })).ok()).toBeTruthy();
});

test("link-style buttons have a hit area of at least 24px, and shortcut hints are hidden on touch devices", async ({ page, browser }) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto("/#/ticket/T-101");
  await appReady(page);
  const toggle = page.getByRole("button", { name: /Notes for the agent|Show all|Limitations/ }).first();
  if (await toggle.count()) expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(24);
  await page.getByRole("button", { name: /Draft with Copilot/ }).click();
  const notes = page.getByRole("button", { name: /Notes for the agent/ });
  await expect(notes).toBeVisible();
  expect((await notes.boundingBox())!.height).toBeGreaterThanOrEqual(24);

  const touch = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  const tp = await touch.newPage();
  await tp.goto("/");
  await tp.getByRole("button", { name: /Search|Command|palette/i }).first().click();
  await expect(tp.getByRole("dialog", { name: "Command palette" })).toBeVisible();
  await expect(tp.locator(".palette .kbd-hint:visible")).toHaveCount(0);
  await touch.close();
});
