import { expect, test } from "@playwright/test";
import { API } from "../env";
import { apiTicket, openTicket, resetReviews, setReviewed } from "../helpers";

test.beforeEach(() => resetReviews());
test.afterAll(() => resetReviews());

test("Mark reviewed shows Reviewed with the time and persists across a reload", async ({ page, request }) => {
  await openTicket(page, "T-101", /Checkout timed out/);
  await page.getByRole("button", { name: /Mark reviewed/ }).click();
  await expect(page.getByRole("button", { name: /^Reviewed/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Reviewed/ })).toContainText(/\d{1,2} \w{3}, \d{2}:\d{2}/);
  await expect(page.getByText("Marked T-101 reviewed")).toBeVisible();

  const t = await apiTicket(request, "T-101");
  expect(t.reviewed_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);

  await page.reload();
  await expect(page.getByRole("button", { name: /^Reviewed/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Mark reviewed/ })).toHaveCount(0);
  // the queue row carries the reviewed flag too
  await expect(page.getByRole("region", { name: "Queue" }).getByRole("button", { name: /T-101/ }).getByRole("img", { name: "Reviewed" })).toBeVisible();
});

test("the r key asks first: Esc cancels and writes nothing", async ({ page, request }) => {
  await openTicket(page, "T-101", /Checkout timed out/);
  await page.keyboard.press("r");
  await expect(page.getByText("Mark T-101 reviewed?")).toBeVisible();
  await expect(page.getByText("Enter to confirm · Esc to cancel")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Mark T-101 reviewed?")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Mark reviewed/ })).toBeFocused();
  expect((await apiTicket(request, "T-101")).reviewed_at).toBeNull();
});

test("r then Enter confirms and persists", async ({ page, request }) => {
  await openTicket(page, "T-101", /Checkout timed out/);
  await page.keyboard.press("r");
  await expect(page.getByRole("button", { name: "Confirm" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: /^Reviewed/ })).toBeVisible();
  await expect.poll(async () => (await apiTicket(request, "T-101")).reviewed_at).not.toBeNull();
});

test("reviewing is idempotent: a second PATCH keeps the original timestamp", async ({ request }) => {
  setReviewed("T-104", "2026-01-02T03:04:05Z");
  const again = await request.patch(`${API}/api/tickets/T-104/reviewed`);
  expect(again.status()).toBe(200);
  expect((await again.json()).reviewed_at).toBe("2026-01-02T03:04:05Z");
  expect((await apiTicket(request, "T-104")).reviewed_at).toBe("2026-01-02T03:04:05Z");
});

test("an already reviewed ticket offers no second review and r does nothing", async ({ page, request }) => {
  setReviewed("T-101", "2026-01-02T03:04:05Z");
  await openTicket(page, "T-101", /Checkout timed out/);
  await expect(page.getByRole("button", { name: /^Reviewed/ })).toBeDisabled();
  await page.keyboard.press("r");
  await expect(page.getByText("Mark T-101 reviewed?")).toHaveCount(0);
  expect((await apiTicket(request, "T-101")).reviewed_at).toBe("2026-01-02T03:04:05Z");
});
