import { expect, test } from "@playwright/test";
import { apiTickets, openFilters, queueIds } from "../helpers";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^Open\s*7$/ })).toBeVisible();
});

test("opens on the queue and the views show the real counts", async ({ page, request }) => {
  const all = (await apiTickets(request)).items as { status: string; priority: string; reviewed_at: string | null }[];
  const counts = {
    Open: all.filter((t) => t.status === "open").length,
    "High priority": all.filter((t) => t.status === "open" && t.priority === "high").length,
    "Needs review": all.filter((t) => t.status === "open" && !t.reviewed_at).length,
    Resolved: all.filter((t) => t.status === "resolved").length,
    "All tickets": all.length,
  };
  expect(counts).toEqual({ Open: 7, "High priority": 4, "Needs review": 7, Resolved: 5, "All tickets": 12 });
  for (const [name, n] of Object.entries(counts)) {
    await expect(page.getByRole("button", { name: new RegExp(`^${name}\\s*${n}$`) })).toBeVisible();
  }
});

test("each view lists exactly what the API says", async ({ page, request }) => {
  const all = (await apiTickets(request)).items as { id: string; status: string; priority: string }[];
  const cases: [string, (t: (typeof all)[number]) => boolean][] = [
    ["Open", (t) => t.status === "open"],
    ["High priority", (t) => t.status === "open" && t.priority === "high"],
    ["Resolved", (t) => t.status === "resolved"],
    ["All tickets", () => true],
  ];
  for (const [name, keep] of cases) {
    await page.getByRole("button", { name: new RegExp(`^${name}\\s*\\d+$`) }).click();
    const expected = all.filter(keep).map((t) => t.id).sort();
    await expect.poll(async () => (await queueIds(page)).sort()).toEqual(expected);
  }
});

test("priority and category filters narrow the list and match GET /api/tickets", async ({ page, request }) => {
  await page.getByRole("button", { name: /^All tickets/ }).click();
  let dialog = await openFilters(page);
  await dialog.getByRole("checkbox", { name: "High" }).check();
  const high = (await apiTickets(request, "&priority=high")).items.map((t: { id: string }) => t.id).sort();
  await expect.poll(async () => (await queueIds(page)).sort()).toEqual(high);

  await dialog.getByRole("checkbox", { name: "Checkout" }).check();
  const highCheckout = (await apiTickets(request, "&priority=high&category=checkout")).items.map((t: { id: string }) => t.id);
  expect(highCheckout).toEqual(["T-101"]);
  await expect.poll(() => queueIds(page)).toEqual(["T-101"]);

  // Chips: both filters appear and each can be removed on its own.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Remove filter Priority: High" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove filter Category: Checkout" })).toBeVisible();
  await page.getByRole("button", { name: "Remove filter Category: Checkout" }).click();
  await expect(page.getByRole("button", { name: "Remove filter Category: Checkout" })).toHaveCount(0);
  await expect.poll(async () => (await queueIds(page)).sort()).toEqual(high);
});

test("an empty result shows the message, and Clear filters restores the list", async ({ page }) => {
  await page.getByRole("button", { name: /^Resolved/ }).click();
  const dialog = await openFilters(page);
  await dialog.getByRole("checkbox", { name: "Integrations" }).check(); // no resolved integrations ticket exists
  await page.keyboard.press("Escape");
  await expect(page.getByText("No tickets match these filters.")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByText("No tickets match these filters.")).toHaveCount(0);
  await expect.poll(async () => (await queueIds(page)).length).toBe(5);
});

test("hash routing: direct link, reload, back and forward", async ({ page }) => {
  await page.goto("/#/ticket/T-104");
  await expect(page.getByRole("heading", { level: 2, name: /Locked out after replacing authenticator phone/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { level: 2, name: /Locked out after replacing authenticator phone/ })).toBeVisible();
  await page.getByRole("region", { name: "Queue" }).getByRole("button", { name: /T-101/ }).click();
  await expect(page).toHaveURL(/#\/ticket\/T-101/);
  await page.goBack();
  await expect(page).toHaveURL(/#\/ticket\/T-104/);
  await expect(page.getByRole("heading", { level: 2, name: /Locked out after replacing/ })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/#\/ticket\/T-101/);
  await expect(page.getByRole("heading", { level: 2, name: /Checkout timed out with a pending payment/ })).toBeVisible();
});
