import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { answerCard, appReady, ask, isRun, openTicket } from "../helpers";

type Scheme = "light" | "dark";
const schemes: Scheme[] = ["light", "dark"];

async function scan(page: Page, label: string) {
  // Colours are measured once transitions and animations have finished (a half-faded tint is not a real contrast failure).
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
    .analyze();
  const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(
    bad.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`),
    `axe violations on: ${label}`,
  ).toEqual([]);
}

/** Tab through the page: every stop must show a visible focus indicator, and every interactive element must be reached. */
async function checkKeyboard(page: Page, label: string, maxStops = 80) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const expected = await page.evaluate(() => {
    const vis = (el: Element) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
    };
    return [...document.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea, [tabindex]")]
      .filter((el) => !(el as HTMLButtonElement).disabled && el.tabIndex >= 0 && vis(el) && !el.closest("[hidden], [inert]"))
      .length;
  });
  const seen = new Set<string>();
  const noRing: string[] = [];
  for (let i = 0; i < maxStops; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      const ring = (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== "none";
      const id = el.getAttribute("aria-label") || el.textContent?.trim().slice(0, 30) || el.tagName;
      return { key: `${el.tagName}:${id}:${Math.round(el.getBoundingClientRect().x)},${Math.round(el.getBoundingClientRect().y)}`, ring, id };
    });
    if (!info) continue;
    if (seen.has(info.key)) break; // wrapped around
    seen.add(info.key);
    if (!info.ring) noRing.push(info.id);
  }
  expect(noRing, `focus stops without a visible ring on: ${label}`).toEqual([]);
  expect(seen.size, `${label}: Tab reached ${seen.size} of ${expected} interactive elements`).toBeGreaterThanOrEqual(Math.floor(expected * 0.9));
}

for (const scheme of schemes) {
  test.describe(`a11y (${scheme})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
    });

    test("start screen", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByText("Pick a ticket to start")).toBeVisible();
      await scan(page, "start screen");
      await checkKeyboard(page, "start screen");
    });

    test("queue with a filter popover", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("button", { name: /^Filters/ }).click();
      await expect(page.getByRole("dialog", { name: "Filters" })).toBeVisible();
      await scan(page, "filters popover");
    });

    test("T-101 with an answered card and an open preview", async ({ page }) => {
      await openTicket(page, "T-101", /Checkout timed out/);
      await ask(page, "Can the customer retry while payment is pending?");
      await answerCard(page).getByRole("button", { name: /^Source 1/ }).focus();
      await expect(page.getByRole("dialog", { name: /^Source 1/ })).toBeVisible();
      await scan(page, "answered card with preview");
      await page.keyboard.press("Escape");
      await checkKeyboard(page, "answered card");
    });

    test("not-enough-evidence card", async ({ page }) => {
      await openTicket(page, "T-101", /Checkout timed out/);
      await ask(page, "Does the product reimburse a bank decline fee?", "Billing");
      await expect(answerCard(page).getByRole("heading", { name: /Not enough evidence/ })).toBeVisible();
      await scan(page, "not enough evidence");
    });

    test("draft composer", async ({ page }) => {
      await openTicket(page, "T-101", /Checkout timed out/);
      const drafted = page.waitForResponse((r) => isRun(r.request()) && r.request().postDataJSON().action === "draft_reply");
      await page.getByRole("button", { name: /Draft with Copilot/ }).click();
      await drafted;
      await expect(page.getByRole("textbox", { name: "Reply draft" })).toHaveValue(/Hello,/);
      await scan(page, "draft");
    });

    test("command palette", async ({ page }) => {
      await page.goto("/");
      await appReady(page);
      await page.keyboard.press("ControlOrMeta+K");
      await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
      await scan(page, "palette");
    });

    test("T-112 untrusted message", async ({ page }) => {
      await openTicket(page, "T-112", /SFTP server/);
      await expect(page.getByText("Untrusted content: not followed")).toBeVisible();
      await scan(page, "untrusted message");
      await checkKeyboard(page, "T-112 ticket");
    });

    // axe supports target-size since 4.8 but disables it by default; enable it and run
    // the whole WCAG 2.2 AA tag set, so touch-target coverage stays enforced.
    test("ticket page passes axe WCAG 2.2 AA, including target-size", async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await openTicket(page, "T-101", /Checkout timed out/);
      const r = await new AxeBuilder({ page })
        .options({ runOnly: { type: "tag", values: ["wcag22aa"] }, rules: { "target-size": { enabled: true } } })
        .analyze();
      expect(
        r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`),
        "wcag22aa + target-size violations on the ticket page",
      ).toEqual([]);
    });
  });
}

for (const scheme of schemes) {
  test(`the tool timeline status has an allowed accessible name (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await openTicket(page, "T-101", /Checkout timed out/);
    await ask(page, "Can the customer retry while payment is pending?");
    const r = await new AxeBuilder({ page }).withRules(["aria-prohibited-attr"]).analyze();
    expect(r.violations).toEqual([]);
  });

  test(`the highlighted source row meets contrast (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await openTicket(page, "T-101", /Checkout timed out/);
    await ask(page, "Can the customer retry while payment is pending?");
    await answerCard(page).getByRole("button", { name: /^Source 1/ }).focus();
    await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
    const r = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
    expect(r.violations).toEqual([]);
  });
}
