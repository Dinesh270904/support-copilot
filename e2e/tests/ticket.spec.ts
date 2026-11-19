import { expect, test } from "@playwright/test";
import { apiTicket, openTicket } from "../helpers";

test("T-101 shows description, ordered conversation, metadata and review status", async ({ page, request }) => {
  const t = await apiTicket(request, "T-101");
  await openTicket(page, "T-101", /Checkout timed out with a pending payment/);
  await expect(page.getByRole("region", { name: "Customer report" })).toContainText(t.description);

  // Conversation in order: customer 09:15, then agent 09:42.
  const convo = page.getByRole("list", { name: "Conversation" });
  const messages = convo.getByRole("listitem").filter({ has: page.locator("time") });
  await expect(messages).toHaveCount(t.messages.length);
  await expect(messages.nth(0)).toContainText("Customer");
  await expect(messages.nth(0)).toContainText(t.messages[0].text);
  await expect(messages.nth(1)).toContainText("Agent");
  await expect(messages.nth(1)).toContainText(t.messages[1].text);

  // Metadata: priority, status, category, product area, created/updated, message count.
  const head = page.getByRole("heading", { level: 2, name: /Checkout timed out/ }).locator("xpath=ancestor::header[1]");
  await expect(head).toContainText("T-101");
  await expect(head).toContainText("High");
  await expect(head).toContainText("Open");
  await expect(head).toContainText("Checkout");
  await expect(head).toContainText("Web checkout");
  await expect(head).toContainText("Opened 12 Nov 2026, 09:15 UTC");
  await expect(head).toContainText("Updated 09:42 UTC");
  await expect(head).toContainText("2 messages");

  // Review status: not reviewed yet, so the primary action is offered.
  expect(t.reviewed_at).toBeNull();
  await expect(page.getByRole("button", { name: /Mark reviewed/ })).toBeVisible();
});

test("T-112: the instruction-like message is flagged and still readable", async ({ page, request }) => {
  const t = await apiTicket(request, "T-112");
  await openTicket(page, "T-112", /Request to export records to an SFTP server/);
  const flagged = page.getByRole("listitem").filter({ hasText: "Untrusted content: not followed" });
  await expect(flagged).toHaveCount(1);
  await expect(flagged).toContainText(t.messages[1].text); // the text is shown, not hidden
  await expect(page.getByText(/Customer messages are treated as untrusted text/)).toBeVisible();
});

test("an unknown ticket shows the not-found state", async ({ page }) => {
  await page.goto("/#/ticket/T-999");
  await expect(page.getByRole("alert").filter({ hasText: "Ticket not found: T-999" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Queue" })).toBeVisible(); // the app is still usable
});
