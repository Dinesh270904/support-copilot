import { expect, test, type Request } from "@playwright/test";
import { apiTicket, openTicket } from "../helpers";

const isRun = (r: Request) => r.url().endsWith("/api/assistant/run") && r.method() === "POST";

test("opening a ticket makes exactly two assistant calls: summary and similar", async ({ page }) => {
  const bodies: Record<string, unknown>[] = [];
  page.on("request", (r) => isRun(r) && bodies.push(r.postDataJSON()));
  await page.goto("/");
  await expect(page.getByText("Pick a ticket to start")).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(bodies).toHaveLength(0); // nothing runs until a ticket is opened

  const done = Promise.all([
    page.waitForResponse((r) => isRun(r.request()) && r.status() === 200),
    page.waitForResponse((r) => isRun(r.request()) && r.status() === 200),
  ]);
  await page.goto("/#/ticket/T-101");
  await done;
  await page.waitForLoadState("networkidle");
  expect(bodies).toHaveLength(2);
  expect(bodies).toContainEqual({ action: "summarize_ticket", ticket_id: "T-101" });
  expect(bodies).toContainEqual({ action: "search_resolved_tickets", ticket_id: "T-101" });
});

test("the brief shows the real key facts and a tickable checklist", async ({ page }) => {
  await openTicket(page, "T-101", /Checkout timed out/);
  const brief = page.getByRole("region", { name: "Ticket brief" });
  await expect(brief.getByRole("heading", { name: "Key facts" })).toBeVisible();
  await expect(brief.getByText("Error codes mentioned: PAYMENT_TIMEOUT")).toBeVisible();
  const needed = brief.getByRole("group", { name: "Still needed" });
  const boxes = needed.getByRole("checkbox");
  await expect(boxes).toHaveCount(3);
  await expect(needed.getByRole("checkbox", { name: "Order ID or gateway transaction reference" })).not.toBeChecked();
  await needed.getByRole("checkbox", { name: "Order ID or gateway transaction reference" }).check();
  await expect(needed.getByRole("checkbox", { name: "Order ID or gateway transaction reference" })).toBeChecked();
  await expect(needed.getByRole("checkbox", { name: "Approximate time of the payment attempt" })).not.toBeChecked();
});

test("similar tickets for T-104 show T-105 with its fix and matched terms, and open it", async ({ page, request }) => {
  const t105 = await apiTicket(request, "T-105");
  await openTicket(page, "T-104", /Locked out after replacing authenticator phone/);
  const similar = page.getByRole("region", { name: "Similar resolved" });
  const row = similar.getByRole("button", { name: /T-105/ });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Fix:");
  await expect(row).toContainText(t105.resolution_summary.slice(0, 20));
  await expect(similar).toContainText(/matched:.*authenticator/);
  await row.click();
  await expect(page).toHaveURL(/#\/ticket\/T-105/);
  await expect(page.getByRole("heading", { level: 2, name: t105.title })).toBeVisible();
});

test("switching tickets quickly never shows another ticket's results, and hotkeys act on the visible ticket", async ({ page }) => {
  await openTicket(page, "T-101", /Checkout timed out/);
  const queue = page.getByRole("region", { name: "Queue" });
  await queue.getByRole("button", { name: /T-104/ }).click();
  await queue.getByRole("button", { name: /T-108/ }).click(); // no waiting between the clicks
  await expect(page.getByRole("heading", { level: 2, name: "Large CSV export times out" })).toBeVisible();

  const brief = page.getByRole("region", { name: "Ticket brief" });
  await expect(brief).toContainText("T-108 is an open");
  await expect(brief).not.toContainText("T-101");
  await expect(brief).not.toContainText("T-104");
  await expect(page.getByRole("region", { name: "Similar resolved" })).not.toContainText("T-105");

  // `d` drafts for the ticket that is on screen.
  const draftResponse = page.waitForResponse((r) => isRun(r.request()) && r.request().postDataJSON().action === "draft_reply");
  await page.keyboard.press("d");
  const resp = await draftResponse;
  expect(resp.request().postDataJSON().ticket_id).toBe("T-108");
  const draft = page.getByRole("textbox", { name: "Reply draft" });
  await expect(draft).toHaveValue(/Large CSV export times out/);
  await expect(draft).not.toHaveValue(/Checkout timed out/);
});
