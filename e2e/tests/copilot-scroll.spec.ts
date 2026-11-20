import { expect, test, type Locator } from "@playwright/test";
import { answerCard, ask, openTicket } from "../helpers";

/** True when `el` lies fully inside the Copilot panel's scrolling area (toBeInViewport ignores clipping by a scroll container). */
const visibleInPanel = (el: Locator) =>
  el.evaluate((node) => {
    const panel = document.querySelector(".copilot-scroll")!.getBoundingClientRect();
    const r = node.getBoundingClientRect();
    return r.top >= panel.top - 1 && r.bottom <= panel.bottom + 1;
  });

test("after asking, the answer itself is visible in the Copilot panel, not hidden below the brief and similar cards", async ({ page }) => {
  await openTicket(page, "T-104", /Locked out after replacing authenticator phone/);
  await ask(page, "lost authenticator after replacing phone; backup code and enroll a new device");
  const card = answerCard(page);
  await expect(card.getByRole("heading", { name: /Answered from 1 article/ })).toBeVisible();
  // smooth scroll takes a moment: poll until the heading and the first citation marker are inside the panel
  await expect.poll(() => visibleInPanel(card.getByRole("heading", { name: /Answered from 1 article/ }))).toBe(true);
  await expect.poll(() => visibleInPanel(card.getByRole("button", { name: /^Source 1:/ }).first())).toBe(true);
});

test("once an answer exists the brief and similar cards collapse; Show and Hide really toggle them", async ({ page }) => {
  await openTicket(page, "T-104", /Locked out after replacing authenticator phone/);
  // Before asking: the brief is open and its checklist is visible.
  await expect(page.getByText("Whether the customer still has a saved backup code")).toBeVisible();
  await expect(page.getByRole("button", { name: "Show ticket brief" })).toHaveCount(0);

  await ask(page, "lost authenticator after replacing phone; backup code and enroll a new device");
  const show = page.getByRole("button", { name: "Show ticket brief" });
  await expect(show).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByText("Whether the customer still has a saved backup code")).toBeHidden();
  await expect(page.getByRole("button", { name: "Show similar resolved tickets" })).toHaveAttribute("aria-expanded", "false");

  await show.click();
  await expect(page.getByRole("button", { name: "Hide ticket brief" })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Whether the customer still has a saved backup code")).toBeVisible();
  await page.getByRole("button", { name: "Hide ticket brief" }).click();
  await expect(page.getByText("Whether the customer still has a saved backup code")).toBeHidden();
});
