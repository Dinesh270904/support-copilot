import { expect, test } from "@playwright/test";
import { answerCard, answerSettled, ask, openTicket } from "../helpers";

/** The citation preview used to be rendered inside the answer's <p> (div/blockquote/p inside p): React logged
 *  'cannot be a descendant of <p>' errors every time a marker was hovered, focused or clicked. Core interactions must be console-clean. */
test("hovering, focusing and clicking a citation marker, and opening the drawer, log no console errors", async ({ page }) => {
  const problems: string[] = [];
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") problems.push(`${m.type()}: ${m.text().slice(0, 160)}`); });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 160)}`));

  await openTicket(page, "T-101", /Checkout timed out/);
  await ask(page, "Can the customer retry while payment is pending?");
  await answerSettled(page); // the new answer smooth-scrolls into view; hover only once it has stopped moving
  const marker = answerCard(page).getByRole("button", { name: /^Source 1:/ }).first();
  await marker.hover();
  await expect(page.getByRole("dialog", { name: /^Source 1/ })).toBeVisible();
  await page.mouse.move(5, 5);
  await marker.focus();
  await expect(page.getByRole("dialog", { name: /^Source 1/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await marker.click();
  await page.getByRole("dialog", { name: /^Source 1/ }).getByRole("button", { name: /Open source/ }).click();
  await expect(page.getByRole("dialog", { name: /^Source: KB-01#chunk-1/ })).toBeVisible();
  await page.keyboard.press("Escape");
  expect(problems).toEqual([]);
});

test("the preview is not nested inside the answer paragraph (valid HTML)", async ({ page }) => {
  await openTicket(page, "T-101", /Checkout timed out/);
  await ask(page, "Can the customer retry while payment is pending?");
  await answerSettled(page);
  await answerCard(page).getByRole("button", { name: /^Source 1:/ }).first().hover();
  const dialog = page.getByRole("dialog", { name: /^Source 1/ });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((el) => !!el.closest("p"))).toBe(false);
});
