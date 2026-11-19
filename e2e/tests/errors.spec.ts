import { expect, test } from "@playwright/test";
import fs from "node:fs";
import { DB, UI_NO_API, UI_NO_DB } from "../env";
import { answerCard, ask, mcpChildPid, openTicket } from "../helpers";

test("MCP child killed: browsing still works, the next action reconnects, the pill recovers", async ({ page }) => {
  const pid = mcpChildPid();
  process.kill(pid, "SIGKILL");

  await page.goto("/"); // a fresh health check pings the dead child
  await expect(page.getByRole("button", { name: /Assistant offline/ })).toBeVisible();
  await page.getByRole("button", { name: /Assistant offline/ }).click();
  await expect(page.getByRole("dialog", { name: "Assistant tool status" })).toContainText("Assistant offline");
  await page.keyboard.press("Escape");

  // Ticket browsing needs no MCP: the ticket opens and is readable immediately.
  await page.getByRole("region", { name: "Queue" }).getByRole("button", { name: /T-104/ }).click();
  await expect(page.getByRole("heading", { level: 2, name: /Locked out after replacing authenticator phone/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Customer report" })).toBeVisible();

  // The auto-runs go through the gateway's one retry on a fresh session: a NEW child appears and the card fills in.
  await expect(page.getByRole("region", { name: "Ticket brief" })).toContainText("T-104 is an open", { timeout: 20_000 });
  await expect(page.getByRole("button", { name: /Tools connected \(4\)/ })).toBeVisible();
  expect(mcpChildPid()).not.toBe(pid);
});

test("MCP unrecoverable: the 503 card has Retry and a request ID, and Retry recovers once the database is back", async ({ page }) => {
  await openTicket(page, "T-101", /Checkout timed out/);
  await expect(page.getByRole("region", { name: "Ticket brief" })).toContainText("T-101 is an open");
  // Make the MCP server unable to restart (it opens the database read-only and exits if the file is missing), then kill it.
  const moved = `${DB}.away`;
  fs.renameSync(DB, moved);
  try {
    process.kill(mcpChildPid(), "SIGKILL");
    await page.getByRole("textbox", { name: "Ask a question" }).fill("Can the customer retry while payment is pending?");
    await page.keyboard.press("Enter");
    const card = page.getByRole("alert").filter({ hasText: "Assistant tools are offline" });
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card).toContainText("Ticket browsing still works");
    await expect(card).toContainText(/Request ID [0-9a-f]{12}/);
    await expect(card.getByRole("button", { name: "Retry" })).toBeVisible();
    // the queue (already loaded) is still on screen
    await expect(page.getByRole("region", { name: "Queue" })).toBeVisible();
    await page.getByRole("button", { name: /Assistant offline/ }).waitFor({ timeout: 20_000 });
  } finally {
    fs.renameSync(moved, DB);
  }
  await page.getByRole("alert").filter({ hasText: "Assistant tools are offline" }).getByRole("button", { name: "Retry" }).click();
  await expect(answerCard(page).getByRole("heading", { name: /Answered from 1 article/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: /Tools connected \(4\)/ })).toBeVisible();
});

test("database not initialized: a clear 'Run make setup first' state, no crash", async ({ page }) => {
  await page.goto(UI_NO_DB);
  await expect(page.getByRole("alert").filter({ hasText: "Database not initialized. Run make setup first." }).first()).toBeVisible();
  await expect(page.getByText("Support Copilot").first()).toBeVisible(); // the shell is still there, not a blank page
  await expect(page.getByRole("button", { name: /Assistant offline/ })).toBeVisible();
});

test("API down: the shell stays, an error with Retry is shown, and the pill says offline", async ({ page }) => {
  await page.goto(UI_NO_API); // the dev proxy forwards to a closed port
  await expect(page.getByText("Support Copilot").first()).toBeVisible();
  const alert = page.getByRole("alert").first();
  await expect(alert).toBeVisible();
  await expect(alert.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Assistant offline/ })).toBeVisible();
});

// BUG-4 (awaiting approval): with the API down behind the dev proxy the queue says "Request failed (502)". The 'API unreachable'
// wording only exists for a failed fetch (kind "network"), which a proxy never produces. Expected to fail until mapped.
test("BUG-4: API down says 'API unreachable'", async ({ page }) => {
  test.fail();
  await page.goto(UI_NO_API);
  await expect(page.getByRole("alert").first()).toContainText(/API unreachable/);
});
