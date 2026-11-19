import { expect, test, type Page } from "@playwright/test";
import { answerCard, ask, isRun } from "../helpers";

async function noHorizontalScroll(page: Page) {
  const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(scroll, "page must not scroll sideways").toBeLessThanOrEqual(client);
}

const sizes = [
  { name: "1440 wide", width: 1440, height: 900 },
  { name: "1100 drawer", width: 1100, height: 900 },
  { name: "820 rail", width: 820, height: 900 },
  { name: "390 phone", width: 390, height: 844 },
];

for (const s of sizes) {
  test(`${s.name}: layout matches the spec and nothing overflows sideways`, async ({ page }) => {
    await page.setViewportSize({ width: s.width, height: s.height });
    await page.goto("/#/ticket/T-101");
    await expect(page.getByRole("heading", { level: 2, name: /Checkout timed out/ })).toBeVisible();
    const queue = page.getByRole("navigation", { name: "Ticket queue" });
    const copilot = page.getByRole("heading", { level: 2, name: "Copilot" });
    const toggle = page.getByRole("button", { name: /^Copilot/ });
    const tabbar = page.getByRole("navigation", { name: "Sections" });

    if (s.width >= 1280) {
      // three panes, no toggle, no tab bar
      await expect(queue.getByRole("button", { name: /^Open\s*7$/ })).toBeVisible();
      await expect(copilot).toBeVisible();
      await expect(toggle).toHaveCount(0);
      await expect(tabbar).toHaveCount(0);
    } else if (s.width >= 1024) {
      // Copilot is a drawer behind a toggle; the queue keeps its full labels
      await expect(queue.getByRole("button", { name: /^Open\s*7$/ })).toBeVisible();
      await expect(copilot).toBeHidden();
      await toggle.click();
      await expect(copilot).toBeVisible();
      await expect(tabbar).toHaveCount(0);
    } else if (s.width >= 768) {
      // the queue is an icon rail: buttons carry their label and count in the accessible name only
      await expect(queue.getByRole("button", { name: "Open 7" })).toBeVisible();
      await expect(queue.getByRole("button", { name: /^Filters/ })).toHaveCount(0);
      await expect(toggle).toBeVisible();
      await expect(tabbar).toHaveCount(0);
    } else {
      // one pane at a time with a bottom tab bar
      await expect(tabbar).toBeVisible();
      for (const name of ["Queue", "Ticket", "Copilot"]) await expect(tabbar.getByRole("button", { name })).toBeVisible();
      await expect(tabbar.getByRole("button", { name: "Ticket" })).toHaveAttribute("aria-current", "page");
      await expect(queue).toBeHidden();
      await expect(copilot).toBeHidden();
    }
    await noHorizontalScroll(page);
  });
}

test("390: the key flow works through the tab bar (open ticket, ask, see sources, draft)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const tabbar = page.getByRole("navigation", { name: "Sections" });
  await expect(tabbar).toBeVisible();

  await tabbar.getByRole("button", { name: "Queue" }).click();
  await page.getByRole("navigation", { name: "Ticket queue" }).getByRole("button", { name: /T-101/ }).click();
  await expect(page.getByRole("heading", { level: 2, name: /Checkout timed out/ })).toBeVisible(); // lands on the Ticket tab
  await expect(tabbar.getByRole("button", { name: "Ticket" })).toHaveAttribute("aria-current", "page");

  await tabbar.getByRole("button", { name: "Copilot" }).click();
  await expect(page.getByRole("region", { name: "Ticket brief" })).toContainText("PAYMENT_TIMEOUT");
  const body = await ask(page, "Can the customer retry while payment is pending?");
  expect(body.answer_state).toBe("answered");
  const card = answerCard(page);
  await expect(card.getByRole("region", { name: "Sources" })).toContainText("KB-01#chunk-1");
  await card.getByRole("button", { name: /^Source 1/ }).focus();
  await expect(page.getByRole("dialog", { name: /^Source 1/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await noHorizontalScroll(page);

  await tabbar.getByRole("button", { name: "Ticket" }).click();
  const drafted = page.waitForResponse((r) => isRun(r.request()) && r.request().postDataJSON().action === "draft_reply");
  await page.getByRole("button", { name: /Draft with Copilot/ }).click();
  await drafted;
  await expect(page.getByRole("heading", { name: "Draft · not sent" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Reply draft" })).toHaveValue(/Thank you for contacting us/);
  await noHorizontalScroll(page);
});
