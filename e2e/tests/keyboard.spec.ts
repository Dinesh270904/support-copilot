import { expect, test } from "@playwright/test";
import { apiTicket, answerCard, appReady, isRun, resetReviews } from "../helpers";

test.beforeEach(() => resetReviews());
test.afterAll(() => resetReviews());

test("the full demo path with real keys only: palette, ask, preview, draft, edit, copy, review", async ({ page, context, request }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await appReady(page);
  await expect(page.getByText("Pick a ticket to start")).toBeVisible();

  // ⌘K / Ctrl+K → T-101 → Enter
  await page.keyboard.press("ControlOrMeta+K");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(palette).toBeVisible();
  await page.keyboard.type("T-101");
  await expect(palette.getByRole("option").first()).toContainText("T-101");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/ticket\/T-101/);
  await expect(page.getByRole("heading", { level: 2, name: /Checkout timed out/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Ticket brief" })).toContainText("PAYMENT_TIMEOUT");

  // `/` focuses Ask; type the question; Enter submits
  await page.keyboard.press("/");
  const askBox = page.getByRole("textbox", { name: "Ask a question" });
  await expect(askBox).toBeFocused();
  await page.keyboard.type("Can the customer retry while payment is pending?");
  const answered = page.waitForResponse((r) => isRun(r.request()) && r.request().postDataJSON().action === "search_knowledge");
  await page.keyboard.press("Enter");
  await answered;
  await expect(answerCard(page).getByRole("heading", { name: /Answered from 1 article/ })).toBeFocused(); // focus lands on the answer

  // Tab to marker ¹ → preview → Esc
  const marker = answerCard(page).getByRole("button", { name: /^Source 1:/ });
  for (let i = 0; i < 12 && !(await marker.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
  await expect(marker).toBeFocused();
  const preview = page.getByRole("dialog", { name: /^Source 1/ });
  await expect(preview).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(preview).toBeHidden();

  // `d` → draft ready
  await page.keyboard.press("d");
  const draft = page.getByRole("textbox", { name: "Reply draft" });
  await expect(draft).toHaveValue(/Thank you for contacting us/);

  // Tab into the draft, type an edit
  for (let i = 0; i < 30 && !(await draft.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
  await expect(draft).toBeFocused();
  await page.keyboard.press("ControlOrMeta+ArrowDown"); // caret to the end on every OS
  await page.keyboard.type(" Typed with the keyboard.");
  const edited = await draft.inputValue();
  expect(edited.endsWith("Typed with the keyboard.")).toBeTruthy();

  // Tab to the Copy button and press it
  await page.keyboard.press("Tab");
  const copy = page.getByRole("button", { name: "Copy draft" });
  await expect(copy).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Copied")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(edited);

  // `r` → Enter → reviewed
  await page.keyboard.press("r");
  await expect(page.getByText("Mark T-101 reviewed?")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: /^Reviewed/ })).toBeVisible();
  await expect.poll(async () => (await apiTicket(request, "T-101")).reviewed_at).not.toBeNull();
});

test("j and k move the selection through the queue", async ({ page }) => {
  await page.goto("/#/ticket/T-101");
  await appReady(page);
  await expect(page.getByRole("heading", { level: 2, name: /Checkout timed out/ })).toBeVisible();
  // Wait for each ticket to be on screen before the next key.
  await page.keyboard.press("j");
  await expect(page.getByRole("heading", { level: 2, name: "Large CSV export times out" })).toBeVisible();
  await page.keyboard.press("k");
  await expect(page.getByRole("heading", { level: 2, name: /Checkout timed out/ })).toBeVisible();
  await page.keyboard.press("k");
  await expect(page.getByRole("heading", { level: 2, name: /Locked out after replacing/ })).toBeVisible();
  await expect(page).toHaveURL(/#\/ticket\/T-104/);
});

test("single-letter shortcuts do nothing while typing in Ask", async ({ page, request }) => {
  await page.goto("/#/ticket/T-101");
  await appReady(page);
  await expect(page.getByRole("heading", { level: 2, name: /Checkout timed out/ })).toBeVisible();
  const runs: string[] = [];
  page.on("request", (r) => isRun(r) && runs.push(r.postDataJSON().action));
  const themeBefore = await page.locator("html").getAttribute("data-theme");
  await page.keyboard.press("/");
  await expect(page.getByRole("textbox", { name: "Ask a question" })).toBeFocused();
  await page.keyboard.type("jkdrst?12345 ");
  await expect(page.getByRole("textbox", { name: "Ask a question" })).toHaveValue("jkdrst?12345 ");
  await expect(page).toHaveURL(/#\/ticket\/T-101(\?|$)/);
  await expect(page.getByText("Mark T-101 reviewed?")).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toHaveCount(0);
  expect(await page.locator("html").getAttribute("data-theme")).toBe(themeBefore);
  expect(runs).toEqual([]); // no draft or refresh was triggered by d or s
  expect((await apiTicket(request, "T-101")).reviewed_at).toBeNull();
});

test("? opens the shortcut sheet and t toggles the theme", async ({ page }) => {
  await page.goto("/#/ticket/T-101");
  await appReady(page);
  await expect(page.getByRole("heading", { level: 2, name: /Checkout timed out/ })).toBeVisible();
  await page.keyboard.press("?");
  const sheet = page.getByRole("dialog", { name: /shortcuts/i });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("Command palette");
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  const html = page.locator("html");
  const before = await html.evaluate((el) => getComputedStyle(el).colorScheme);
  await page.keyboard.press("t");
  await expect.poll(() => html.evaluate((el) => getComputedStyle(el).colorScheme)).not.toBe(before);
  await page.keyboard.press("t");
  await expect.poll(() => html.evaluate((el) => getComputedStyle(el).colorScheme)).toBe(before);
});

test("the palette counts open high-priority checkout tickets inline", async ({ page }) => {
  await page.goto("/");
  await appReady(page);
  await page.keyboard.press("ControlOrMeta+K");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await page.keyboard.type("count open high priority checkout");
  await expect(palette.getByRole("option", { selected: true })).toContainText("Count tickets");
  await page.keyboard.press("Enter");
  await expect(palette).toContainText(/1 ticket/);
  await expect(palette).toContainText("T-101");
});

test("text typed immediately after / goes into the Ask box, not into shortcuts", async ({ page, request }) => {
  await page.goto("/#/ticket/T-101");
  await appReady(page);
  await expect(page.getByRole("heading", { level: 2, name: /Checkout timed out/ })).toBeVisible();
  const themeBefore = await page.locator("html").evaluate((el) => getComputedStyle(el).colorScheme);
  const runs: string[] = [];
  page.on("request", (r) => isRun(r) && runs.push(r.postDataJSON().action));
  await page.keyboard.press("/");
  await page.keyboard.type("j d r t"); // no waiting: every one of these is also a shortcut key
  await expect(page.getByRole("textbox", { name: "Ask a question" })).toHaveValue("j d r t");
  await expect(page).toHaveURL(/#\/ticket\/T-101(\?|$)/);
  await expect(page.getByRole("heading", { name: "Draft · not sent" })).toHaveCount(0);
  await expect(page.getByText("Mark T-101 reviewed?")).toHaveCount(0);
  expect(await page.locator("html").evaluate((el) => getComputedStyle(el).colorScheme)).toBe(themeBefore);
  expect(runs).toEqual([]); // no draft request
  expect((await apiTicket(request, "T-101")).reviewed_at).toBeNull();
});

test("five quick j presses then five quick k presses land on exactly the right tickets", async ({ page }) => {
  await page.goto("/#/ticket/T-112"); // first in the queue: T-112, T-104, T-101, T-108, T-102, T-106, T-110
  await appReady(page);
  await expect(page.getByRole("heading", { level: 2, name: /Request to export records to an SFTP server/ })).toBeVisible();
  for (let i = 0; i < 5; i++) await page.keyboard.press("j"); // no delay between presses
  await expect(page).toHaveURL(/#\/ticket\/T-106/);
  await expect(page.getByRole("heading", { level: 2, name: /Plan change invoice has an unfamiliar proration line/ })).toBeVisible();
  for (let i = 0; i < 5; i++) await page.keyboard.press("k");
  await expect(page).toHaveURL(/#\/ticket\/T-112/);
  await expect(page.getByRole("heading", { level: 2, name: /Request to export records to an SFTP server/ })).toBeVisible();
});
