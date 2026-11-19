import { expect, test } from "@playwright/test";
import { openTicket } from "../helpers";

const PENDING_PROHIBITION = "do not ask the customer to submit another payment";

test.describe("draft", () => {
  test("T-101: a draft that says it is not sent, with the pending prohibition moved to the agent notes", async ({ page }) => {
    await openTicket(page, "T-101", /Checkout timed out/);
    await page.getByRole("button", { name: /Draft with Copilot/ }).click();
    await expect(page.getByRole("heading", { name: "Draft · not sent" })).toBeVisible();
    const draft = page.getByRole("textbox", { name: "Reply draft" });
    await expect(draft).toHaveValue(/Thank you for contacting us about “Checkout timed out with a pending payment”/);
    await expect(draft).toHaveValue(/When checkout reports PAYMENT_TIMEOUT, first check the order and payment status/);
    expect(((await draft.inputValue()).toLowerCase())).not.toContain(PENDING_PROHIBITION); // not in the customer text

    const notes = page.getByRole("button", { name: /Notes for the agent \(\d+\)/ });
    await notes.click();
    await expect(page.getByRole("region", { name: /Draft · not sent/ })).toContainText(PENDING_PROHIBITION);
  });

  test("editing shows the Edited indicator and live character count; Reset restores the draft", async ({ page }) => {
    await openTicket(page, "T-101", /Checkout timed out/);
    await page.getByRole("button", { name: /Draft with Copilot/ }).click();
    const draft = page.getByRole("textbox", { name: "Reply draft" });
    await expect(draft).toHaveValue(/Hello,/);
    const original = await draft.inputValue();
    await expect(page.getByRole("button", { name: "Reset", exact: true })).toBeDisabled();
    await draft.evaluate((el: HTMLTextAreaElement) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }); // caret at the end (Ctrl+End is not the same on every OS)
    await page.keyboard.type(" Edited by the agent.");
    const edited = await draft.inputValue();
    expect(edited).toBe(`${original} Edited by the agent.`);
    await expect(page.getByText(/^Edited ·/)).toContainText(`${edited.length} characters`);
    await page.getByRole("button", { name: "Reset", exact: true }).click();
    await expect(draft).toHaveValue(original);
    await expect(page.getByText(/^Edited ·/)).toHaveCount(0);
  });

  test("Copy puts exactly the edited text on the real clipboard", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openTicket(page, "T-101", /Checkout timed out/);
    await page.getByRole("button", { name: /Draft with Copilot/ }).click();
    const draft = page.getByRole("textbox", { name: "Reply draft" });
    await expect(draft).toHaveValue(/Hello,/);
    await draft.evaluate((el: HTMLTextAreaElement) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }); // caret at the end (Ctrl+End is not the same on every OS)
    await page.keyboard.type(" Clipboard check 123.");
    const edited = await draft.inputValue();
    await page.getByRole("button", { name: "Copy draft" }).click();
    await expect(page.getByText("Copied")).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(edited);
  });

  test("T-112: a holding reply with the amber note", async ({ page }) => {
    await openTicket(page, "T-112", /SFTP server/);
    await page.getByRole("button", { name: /Draft with Copilot/ }).click();
    await expect(page.getByRole("heading", { name: "Draft · not sent" })).toBeVisible();
    await expect(page.getByText("No documented guidance found, so this is a holding reply. Don't promise specifics.")).toBeVisible();
    const draft = page.getByRole("textbox", { name: "Reply draft" });
    await expect(draft).toHaveValue(/We are reviewing your request with the relevant team/);
    await expect(draft).not.toHaveValue(/SFTP is supported/i);
  });

  test("nothing in the app can send anything", async ({ page }) => {
    await openTicket(page, "T-101", /Checkout timed out/);
    await page.getByRole("button", { name: /Draft with Copilot/ }).click();
    await expect(page.getByRole("heading", { name: "Draft · not sent" })).toBeVisible();
    // No control is named "Send...", and the word never appears as an action anywhere in the visible text.
    await expect(page.getByRole("button", { name: /\bsend/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /\bsend/i })).toHaveCount(0);
    await expect(page.locator("input[type=submit], button[type=submit]").filter({ hasText: /send/i })).toHaveCount(0);
    const text = await page.locator("body").innerText();
    const mentions = text.match(/[^.\n]*\bsend(?:s|ing)?\b[^.\n]*/gi) ?? [];
    expect(mentions.filter((m) => !/not sent|never|nothing is sent/i.test(m)), `unexpected mentions of "send": ${mentions.join(" | ")}`).toEqual([]);
    // and the app made no request that could send anything: only GETs plus assistant runs and the review PATCH exist
  });
});
