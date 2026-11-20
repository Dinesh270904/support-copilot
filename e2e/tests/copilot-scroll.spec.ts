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
