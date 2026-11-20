import { expect, test, type Page } from "@playwright/test";
import { answerCard, appReady, resetReviews } from "../helpers";

/** The whole flow with the keyboard only: no mouse call anywhere in this file. At every step focus must be somewhere
 *  real (never <body>), visibly indicated, and where a keyboard user expects it (returned to the opener after a drawer closes). */
test.use({ permissions: ["clipboard-read", "clipboard-write"] });
test.beforeEach(() => resetReviews());
test.afterEach(() => resetReviews());

type Focus = { tag: string; name: string; visible: boolean; ring: boolean };
const focus = (page: Page): Promise<Focus> =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return { tag: "BODY", name: "", visible: false, ring: false };
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const ring = (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow !== "none" && cs.boxShadow !== "") || el.matches(":focus-visible");
    const name = el.getAttribute("aria-label") || (el as HTMLInputElement).labels?.[0]?.innerText || el.innerText || el.getAttribute("placeholder") || "";
    return { tag: el.tagName, name: name.replace(/\s+/g, " ").trim().slice(0, 60), visible: r.width > 0 && r.height > 0, ring };
  });
/** Focus is on a real, visible element that shows a focus indicator. */
async function expectFocusVisible(page: Page, step: string, mustMatch?: RegExp) {
  const f = await focus(page);
  expect(f.tag, `${step}: focus fell back to <body> (lost)`).not.toBe("BODY");
  expect(f.visible, `${step}: focused element is not visible`).toBe(true);
  expect(f.ring, `${step}: no visible focus indicator on ${f.tag} "${f.name}"`).toBe(true);
  if (mustMatch) expect(f.name, `${step}: focus is on "${f.name}"`).toMatch(mustMatch);
}
async function tabTo(page: Page, name: RegExp, max = 60) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    const f = await focus(page);
    expect(f.tag, "Tab landed on <body>: focus is trapped or lost").not.toBe("BODY");
    if (name.test(f.name)) return f;
  }
  throw new Error(`Tab never reached "${name}" within ${max} presses`);
}

test("keyboard only: open a ticket, ask, reach a citation, open and close the drawer, draft, copy, mark reviewed", async ({ page, request }) => {
  await page.goto("/");
  await appReady(page);

  // 1. Tab from the page start: every stop is real and shows focus
  await page.keyboard.press("Tab");
  await expectFocusVisible(page, "first Tab");

  // 2. open a ticket through the palette (Ctrl+K, type, Enter); focus must land somewhere real afterwards
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
  await expectFocusVisible(page, "palette opens", /Search tickets/);
  await page.keyboard.type("T-104");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/ticket\/T-104/);
  await expect(page.getByRole("heading", { level: 2, name: /Locked out after replacing/ })).toBeVisible();
  await expectFocusVisible(page, "after the palette closes");

  // 3. "/" focuses the Ask box; type and press Enter
  await page.keyboard.press("/");
  await expectFocusVisible(page, "after /", /Ask a question/);
  await page.keyboard.type("lost authenticator after replacing phone; backup code and enroll a new device");
  await page.keyboard.press("Enter");
  await expect(answerCard(page).getByRole("heading", { name: /Answered from 1 article/ })).toBeVisible();
  await expectFocusVisible(page, "after the answer arrives (focus moves to the answer)");

  // 4. Tab to the first citation marker; focus opens the preview; Tab to "Open source"; Enter opens the drawer
  const marker = await tabTo(page, /^Source 1:/);
  expect(marker.ring).toBe(true);
  await expect(page.getByRole("dialog", { name: /^Source 1/ })).toBeVisible();
  await page.keyboard.press("Tab");
  await expectFocusVisible(page, "Tab from the marker goes to the preview's Open source", /Open source/);
  await page.keyboard.press("Enter");
  const drawer = page.getByRole("dialog", { name: /^Source: KB-03#chunk-1/ });
  await expect(drawer).toBeVisible();
  await expectFocusVisible(page, "drawer opens", /Close source/);
  for (let i = 0; i < 6; i++) { // focus stays trapped inside the drawer
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')), "focus escaped the drawer").toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expectFocusVisible(page, "after the drawer closes focus returns to the citation", /^Source 1:/);

  // 5. draft with "d"; Tab to Copy draft; Enter copies
  await page.keyboard.press("Escape");
  await page.keyboard.press("d");
  const text = page.getByRole("textbox", { name: "Reply draft" });
  await expect(text).toBeVisible();
  await expectFocusVisible(page, "after the draft arrives");
  await tabTo(page, /Copy draft/);
  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("Hello");
  await expectFocusVisible(page, "after Copy draft focus stays on a real control", /Copy draft/);

  // 6. mark reviewed: r asks, Enter confirms, and focus is not lost afterwards
  await page.keyboard.press("Escape");
  await page.keyboard.press("r");
  await expectFocusVisible(page, "review confirm", /Confirm/);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: /^Reviewed/ })).toBeVisible();
  await expect.poll(async () => (await (await request.get("http://127.0.0.1:8100/api/tickets/T-104")).json()).reviewed_at).not.toBeNull();
  await expectFocusVisible(page, "after reviewing, focus is not lost");
});
