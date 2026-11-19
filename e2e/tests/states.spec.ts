import { expect, test } from "@playwright/test";
import { answerCard, ask, isRun, openFilters, openTicket, shot } from "../helpers";

// G7: every UI state, asserted and saved as a screenshot in e2e/screenshots (gitignored).
// (The offline pill, the 503 card, "database not initialized" and "API unreachable" are captured in errors.spec.ts.)

test("loading: both automatic cards show the skeleton while the assistant calls are in flight", async ({ page }) => {
  // The real API still answers; each request is only held for a moment so the loading state can be observed.
  await page.route("**/api/assistant/run", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.continue();
  });
  await page.goto("/#/ticket/T-101");
  await expect(page.getByRole("heading", { level: 2, name: /Checkout timed out/ })).toBeVisible();
  const skeletons = page.getByRole("status", { name: "Calling MCP tools" });
  await expect(skeletons.first()).toBeVisible();
  await expect(skeletons).toHaveCount(2);
  await shot(page, "state-loading");
  await expect(page.getByRole("region", { name: "Ticket brief" })).toContainText("T-101 is an open", { timeout: 15_000 });
  await expect(skeletons).toHaveCount(0);
});

test("start screen, answered, not enough evidence, no candidates, validation, draft, holding reply, untrusted, empty view", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Pick a ticket to start")).toBeVisible();
  await shot(page, "state-start-screen");

  await openTicket(page, "T-101", /Checkout timed out/);
  await ask(page, "Can the customer retry while payment is pending?");
  await expect(answerCard(page).getByRole("heading", { name: /Answered from 1 article/ })).toBeVisible();
  await shot(page, "state-answered");

  await ask(page, "Does the product reimburse a bank decline fee?", "Billing");
  await expect(answerCard(page).getByRole("heading", { name: /Not enough evidence/ })).toBeVisible();
  await shot(page, "state-not-enough-evidence");

  await page.getByRole("textbox", { name: "Ask a question" }).fill("ab");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert").filter({ hasText: "Type at least 3 characters" })).toBeVisible();
  await shot(page, "state-validation");

  const drafted = page.waitForResponse((r) => isRun(r.request()) && r.request().postDataJSON().action === "draft_reply");
  await page.getByRole("button", { name: /Draft with Copilot/ }).click();
  await drafted;
  await expect(page.getByRole("heading", { name: "Draft · not sent" })).toBeVisible();
  await shot(page, "state-draft-ready");

  await openTicket(page, "T-112", /SFTP server/);
  await expect(page.getByText("Untrusted content: not followed")).toBeVisible();
  await shot(page, "state-untrusted-message");
  await ask(page, "Can scheduled reports be sent to an SFTP server?");
  await expect(answerCard(page)).toContainText("No articles in Integrations match this question.");
  await shot(page, "state-no-candidates");
  const holding = page.waitForResponse((r) => isRun(r.request()) && r.request().postDataJSON().action === "draft_reply");
  await page.getByRole("button", { name: /Draft with Copilot/ }).click();
  await holding;
  await expect(page.getByText("No documented guidance found, so this is a holding reply. Don't promise specifics.")).toBeVisible();
  await shot(page, "state-holding-reply");

  await page.goto("/");
  await page.getByRole("button", { name: /^Resolved/ }).click();
  const dialog = await openFilters(page);
  await dialog.getByRole("checkbox", { name: "Integrations" }).check();
  await page.keyboard.press("Escape");
  await expect(page.getByText("No tickets match these filters.")).toBeVisible();
  await shot(page, "state-empty-view");
});

test("no similar tickets: the similar card says so (T-102)", async ({ page }) => {
  await openTicket(page, "T-102", /Checkout shows timeout but no debit/);
  await expect(page.getByRole("region", { name: "Similar resolved" })).toContainText("No similar resolved tickets");
  await shot(page, "state-no-similar-tickets");
});
