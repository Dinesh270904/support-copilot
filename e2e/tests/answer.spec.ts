import { expect, test } from "@playwright/test";
import { answerCard, answerSettled, ask, isRun, openTicket } from "../helpers";

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

test.beforeEach(async ({ page }) => {
  await openTicket(page, "T-101", /Checkout timed out/);
});

test("an answered question shows markers, sources with scores, matched terms and the tool timeline", async ({ page }) => {
  const body = await ask(page, "Can the customer retry while payment is pending?");
  expect(body.answer_state).toBe("answered");
  const card = answerCard(page);
  await expect(card.getByRole("heading", { name: /Answered from 1 article/ })).toBeVisible();
  await expect(card.getByRole("button", { name: /^Source 1: KB-01#chunk-1/ })).toBeVisible();
  await expect(card.getByRole("button", { name: /^Source 2: KB-01#chunk-2/ })).toBeVisible();

  const sources = card.getByRole("region", { name: "Sources" });
  await expect(sources).toContainText("minimum score 0.15");
  for (const c of body.citations as { source_id: string; score: number }[]) {
    await expect(sources).toContainText(c.source_id);
    await expect(sources.getByRole("meter", { name: new RegExp(`Similarity ${c.score.toFixed(2)}, threshold 0.15, above threshold`) })).toBeVisible();
  }
  await expect(sources).toContainText(/matched:.*pending/);

  const timeline = card.getByRole("region", { name: "How this was answered" });
  await expect(timeline.getByRole("list", { name: "Tool calls" })).toContainText(/get_ticket.*\d+(\.\d+)? ms.*search_knowledge.*\d+(\.\d+)? ms/s);
  await expect(timeline).toContainText("TF-IDF cosine");
});

test("grounding: every answer sentence is a verbatim sentence of the excerpt its marker cites", async ({ page }) => {
  await ask(page, "Can the customer retry while payment is pending?");
  const card = answerCard(page);
  const paragraphs = card.getByRole("paragraph").filter({ has: page.getByRole("button", { name: /^Source \d/ }) });
  // Walk each paragraph: text before a marker is the sentence that marker cites.
  const quoted: { sentence: string; marker: string }[] = (
    await paragraphs.evaluateAll((els) =>
      els.flatMap((p) => {
        const out: { sentence: string; marker: string }[] = [];
        let buf = "";
        p.childNodes.forEach((n) => {
          const el = n as HTMLElement;
          const btn = el.querySelector?.("button[aria-label^='Source']");
          if (btn) { out.push({ sentence: buf, marker: btn.getAttribute("aria-label")! }); buf = ""; }
          else buf += n.textContent ?? "";
        });
        return out;
      }),
    )
  ).map((q) => ({ sentence: norm(q.sentence), marker: q.marker }));
  expect(quoted.length).toBeGreaterThanOrEqual(2);
  for (const { sentence, marker } of quoted) {
    await card.getByRole("button", { name: marker }).focus(); // opens the preview card
    const preview = page.getByRole("dialog", { name: new RegExp(`^Source \\d: ${marker.match(/KB-\d+#chunk-\d+/)![0]}`) });
    await expect(preview).toBeVisible();
    expect(norm(await preview.innerText()), `"${sentence}" must appear in ${marker}`).toContain(sentence);
    await page.keyboard.press("Escape");
  }
});

test("the citation preview opens on hover, on focus (Tab) and on click, highlights the quoted sentence, and Esc returns focus", async ({ page }) => {
  await ask(page, "Can the customer retry while payment is pending?");
  await answerSettled(page); // the new answer smooth-scrolls into view; hover only once it has stopped moving
  const marker = answerCard(page).getByRole("button", { name: /^Source 1: KB-01#chunk-1/ });
  const preview = page.getByRole("dialog", { name: /^Source 1: KB-01#chunk-1/ });

  await marker.hover(); // hover
  await expect(preview).toBeVisible();
  await expect(preview.locator("mark")).toContainText("do not ask the customer to submit another payment");
  await page.mouse.move(5, 5);
  await expect(preview).toBeHidden();

  // focus: reach the marker with real Tab presses
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    if (await marker.evaluate((el) => el === document.activeElement)) break;
  }
  await expect(marker).toBeFocused();
  await expect(preview).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(preview).toBeHidden();
  await expect(marker).toBeFocused();

  await marker.click(); // click keeps it open
  await expect(preview).toBeVisible();
  await page.mouse.move(5, 5);
  await expect(preview).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(preview).toBeHidden();
});

test("Open source opens the drawer and Esc closes it and returns focus to the marker", async ({ page }) => {
  await ask(page, "Can the customer retry while payment is pending?");
  const marker = answerCard(page).getByRole("button", { name: /^Source 1: KB-01#chunk-1/ });
  await marker.focus();
  await page.getByRole("dialog", { name: /^Source 1/ }).getByRole("button", { name: /Open source/ }).click();
  const drawer = page.getByRole("dialog", { name: "Source: KB-01#chunk-1" });
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText("Handling a checkout payment timeout");
  await expect(drawer.locator("mark")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(marker).toBeFocused();
});

test("PAYMENT_TIMEOUT: KB-01 with the identifier match and the pending guardrail sentence", async ({ page }) => {
  const body = await ask(page, "What does PAYMENT_TIMEOUT mean and how do I resolve it?");
  expect(body.citations[0].matched_identifiers).toEqual(["PAYMENT_TIMEOUT"]);
  const card = answerCard(page);
  await expect(card.getByRole("heading", { name: /Answered from 1 article/ })).toBeVisible();
  await expect(card).toContainText("When checkout reports PAYMENT_TIMEOUT, first check the order and payment status");
  await expect(card).toContainText("If the payment is pending, do not ask the customer to submit another payment"); // guardrail kept
  await expect(card.getByRole("region", { name: "Sources" })).toContainText(/id\s*PAYMENT_TIMEOUT/);
  await expect(card).toContainText("Accepted by exact match on PAYMENT_TIMEOUT");
});

test("not enough evidence: bank fee in Billing shows the out-of-scope quote and both actions", async ({ page }) => {
  const body = await ask(page, "Does the product reimburse a bank decline fee?", "Billing");
  expect(body.answer_state).toBe("insufficient_evidence");
  const card = answerCard(page);
  await expect(card.getByRole("heading", { name: /Not enough evidence/ })).toBeVisible();
  await expect(card).toContainText("The knowledge base doesn't cover this, so Copilot won't guess.");
  await expect(card).toContainText("Closest source says this is out of scope:");
  await expect(card.getByRole("blockquote")).toContainText("does not define bank decline fees");
  await expect(card).toContainText("KB-06#chunk-2");
  await expect(card.getByRole("button", { name: /^Source \d/ })).toHaveCount(0); // no source markers on an insufficient-evidence card
  await expect(card.getByRole("button", { name: "Draft a holding reply" })).toBeVisible();
  const wider = page.waitForRequest((r) => isRun(r) && r.postDataJSON().query === "Does the product reimburse a bank decline fee?");
  await card.getByRole("button", { name: "Search all categories" }).click();
  expect((await wider).postDataJSON().category).toBeUndefined(); // re-run without the scope
});

test("no candidates: SFTP in Integrations says no articles exist in that scope", async ({ page }) => {
  await openTicket(page, "T-112", /SFTP server/);
  const body = await ask(page, "Can scheduled reports be sent to an SFTP server?");
  expect(body.retrieval.candidates_considered).toBe(0);
  const card = answerCard(page);
  await expect(card.getByRole("heading", { name: /Not enough evidence/ })).toBeVisible();
  await expect(card).toContainText("No articles in Integrations match this question.");
  await expect(card).toContainText("0 candidates");
});

test("validation: 501 characters disables Ask; 2 characters asks for 3", async ({ page }) => {
  const box = page.getByRole("textbox", { name: "Ask a question" });
  await box.fill("x".repeat(501));
  await expect(page.getByLabel("501 of 500 characters")).toHaveClass(/over/);
  await expect(page.getByRole("button", { name: /^Ask/ })).toBeDisabled();
  await box.fill("ab");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert").filter({ hasText: "Type at least 3 characters" })).toBeVisible();
});

test("a suggestion chip sends its question", async ({ page }) => {
  const sent = page.waitForRequest((r) => isRun(r) && r.postDataJSON().action === "search_knowledge");
  await page.getByRole("group", { name: "Suggested questions" }).getByRole("button", { name: "How do I check for a duplicate charge?" }).click();
  expect((await sent).postDataJSON().query).toBe("How do I check for a duplicate charge?");
  await expect(answerCard(page)).toContainText("How do I check for a duplicate charge?");
});
