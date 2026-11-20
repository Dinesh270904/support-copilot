import { expect, test } from "@playwright/test";
import { UI_NO_API, UI_NO_DB } from "../env";

/** Error states must fit the phone: the status pill's long label ("Assistant offline", 131 px) pushed the page 51 px past
 *  a 390 px viewport. The pill now has a short form on phones, like the ready state. */
for (const [name, url] of [["API down", UI_NO_API], ["database not initialized", UI_NO_DB]] as const) {
  test(`390 px, ${name}: nothing scrolls sideways and the status pill is still named`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(url);
    const pill = page.getByRole("button", { name: /offline|Assistant/i }).first();
    await expect(pill).toBeVisible();
    await page.waitForTimeout(600);
    const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(scroll, "page must not scroll sideways").toBeLessThanOrEqual(client);
    const box = await pill.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  });
}

test("1440 px, API down: the full label 'Assistant offline' is shown", async ({ page }) => {
  await page.goto(UI_NO_API);
  await expect(page.getByRole("button", { name: "Assistant offline" })).toBeVisible();
});
