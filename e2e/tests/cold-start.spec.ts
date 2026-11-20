import { expect, test } from "@playwright/test";
import { API } from "../env";
import { answerCard, appReady, resetReviews } from "../helpers";

/** Cold-start comprehension: a first-time user, no stored state, no keyboard shortcuts, only visible labels.
 *  Goal: from the start screen to a cited answer, an edited draft on the clipboard, and a reviewed ticket.
 *  Every step is a mouse click on a control a new user can read; the click count is asserted so it cannot grow unnoticed. */
test.use({ permissions: ["clipboard-read", "clipboard-write"] });
test.beforeEach(() => resetReviews());
test.afterEach(() => resetReviews());

test("a new user reaches a cited answer, a copied draft and a reviewed ticket in 5 clicks, with no shortcut and no hidden control", async ({ page, request }) => {
  let clicks = 0;
  const click = async (locator: ReturnType<typeof page.getByRole>) => { await locator.click(); clicks++; };

  await page.goto("/");
  await appReady(page);
  // What a new user can read on the start screen without doing anything:
  await expect(page.getByRole("heading", { name: "Pick a ticket to start" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "How it works" })).toBeVisible();
  await expect(page.getByText(/Pick a ticket/).first()).toBeVisible();

  // 1. pick a ticket from the queue (visible list)
  await click(page.getByRole("region", { name: "Queue" }).getByRole("button", { name: /T-104/ }));
  await expect(page.getByRole("heading", { level: 2, name: /Locked out after replacing authenticator phone/ })).toBeVisible();

  // 2. ask by clicking a suggested question (the Ask box also says what to do); no typing, no "/" shortcut
  await expect(page.getByRole("textbox", { name: "Ask a question" })).toHaveAttribute("placeholder", /Ask about this ticket/);
  await click(page.getByRole("button", { name: "Customer lost their authenticator after a new phone. What now?" }));
  const card = answerCard(page);
  await expect(card.getByRole("heading", { name: /Answered from 1 article/ })).toBeVisible();
  await expect(card.getByRole("region", { name: "Sources" })).toContainText("KB-03#chunk-1");
  await expect(card.getByRole("region", { name: "Sources" })).toContainText(/0\.\d\d/); // the score is shown
  await expect(card.getByRole("region", { name: "How this was answered" })).toContainText("get_ticket"); // the tool trace is shown

  // 3. draft: the button says what it does and shows its shortcut as a hint, not a requirement
  await click(page.getByRole("button", { name: /Draft with Copilot/ }));
  const draft = page.getByRole("textbox", { name: "Reply draft" });
  await expect(draft).toBeVisible();
  await expect(page.getByText("Draft · not sent")).toBeVisible();
  await draft.fill("Hello,\n\nPlease use a saved backup code to sign in, then enrol the new device.\n\nSupport Team");

  // 4. copy: the only way a draft leaves the app (it is never sent)
  await click(page.getByRole("button", { name: /Copy draft/ }));
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("saved backup code");

  // 5. mark reviewed: visible, labelled, and its result is stated
  await click(page.getByRole("button", { name: /Mark reviewed/ }));
  await expect(page.getByRole("button", { name: /^Reviewed/ })).toBeVisible();
  await expect(page.getByText("Marked T-104 reviewed")).toBeAttached();
  expect((await (await request.get(`${API}/api/tickets/T-104`)).json()).reviewed_at).not.toBeNull();

  expect(clicks).toBe(5);

  // Honest limit, asserted so it is documented: a draft lives in the page only; reloading discards it.
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Reply draft" })).toHaveCount(0);
});
