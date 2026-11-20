import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { appReady, resetReviews, setReviewed } from "../helpers";

/** After a ticket is reviewed its "Mark reviewed" button is disabled, so the scrolling pane has no focusable content at all.
 *  With a draft open the conversation pane scrolls; axe 'scrollable-region-focusable' (serious) requires that a keyboard
 *  user can focus it to scroll. The pane is now a labelled, focusable region. */
test.beforeEach(() => { resetReviews(); setReviewed("T-101", "2026-01-02T03:04:05Z"); });
test.afterEach(() => resetReviews());
for (const scheme of ["light", "dark"] as const) {
  for (const [w, h] of [[1440, 700], [390, 844]] as const) {
    test(`a11y (${scheme}, ${w}px): a reviewed ticket with a draft open has no serious or critical axe violations`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width: w, height: h });
      await page.goto("/#/ticket/T-101");
      if (w > 767) await appReady(page); // on phones the queue is a separate tab
      else await expect(page.getByRole("navigation", { name: "Sections" })).toBeVisible();
      await page.waitForLoadState("networkidle");
      if (w <= 767) await page.getByRole("navigation", { name: "Sections" }).getByRole("button", { name: "Ticket" }).click();
      await page.getByRole("button", { name: /Draft with Copilot/ }).click();
      await expect(page.getByRole("textbox", { name: "Reply draft" })).toBeVisible();
      // the point of the test: the conversation pane really scrolls here
      expect(await page.evaluate(() => { const s = document.querySelector(".ticket-scroll")!; return s.scrollHeight > s.clientHeight; })).toBe(true);
      await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"]).analyze();
      const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(bad.map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
    });
  }
}

test("keyboard: the scrolling conversation pane can be reached with Tab and scrolled with the arrow keys", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 700 });
  await page.goto("/#/ticket/T-101");
  await appReady(page);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /Draft with Copilot/ }).click();
  await expect(page.getByRole("textbox", { name: "Reply draft" })).toBeVisible();
  const region = page.getByRole("region", { name: "Ticket details and conversation" });
  await region.scrollIntoViewIfNeeded();
  let reached = false;
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (let i = 0; i < 40 && !reached; i++) {
    await page.keyboard.press("Tab");
    reached = await region.evaluate((el) => el === document.activeElement);
  }
  expect(reached, "Tab never reached the scrolling conversation pane").toBe(true);
  const scrollable = await region.evaluate((el) => el.scrollHeight > el.clientHeight);
  if (scrollable) {
    const before = await region.evaluate((el) => el.scrollTop);
    await page.keyboard.press("ArrowDown");
    await expect.poll(() => region.evaluate((el) => el.scrollTop)).toBeGreaterThan(before);
  }
});
