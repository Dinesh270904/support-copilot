import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../env";
import { answerCard, apiTicket, isRun, openTicket } from "../helpers";

interface Case {
  case_id: string;
  action: "search_knowledge" | "search_resolved_tickets" | "count_tickets" | "summarize_ticket";
  ticket_id?: string;
  query?: string;
  category?: string;
  filters?: Record<string, string>;
  must_include_article_ids?: string[];
  may_include_article_ids?: string[];
  must_cite_retrieved_evidence?: boolean;
  must_not_claim?: string[];
  must_not?: string[];
  must_include_related_ticket_ids?: string[];
  expected_count?: number;
  expected_ticket_ids?: string[];
  expected_no_relevant_results?: boolean;
  expected_answer_state?: "answered" | "insufficient_evidence";
}

const cases: Case[] = JSON.parse(fs.readFileSync(path.join(ROOT, "backend/data/seed/expected_cases.json"), "utf8"));

for (const c of cases) {
  test(`${c.case_id} (${c.action}) through the real UI`, async ({ page, request }, testInfo) => {
    const titleOf = async (id: string) => (await apiTicket(request, id)).title as string;
    if (c.action === "search_knowledge") {
      if (c.ticket_id) await openTicket(page, c.ticket_id, await titleOf(c.ticket_id));
      else await page.goto("/");
      await page.getByRole("combobox", { name: /Scope/ }).selectOption(c.category!); // value = the category key
      await page.getByRole("textbox", { name: "Ask a question" }).fill(c.query!);
      const response = page.waitForResponse((r) => isRun(r.request()) && r.request().postDataJSON().action === "search_knowledge");
      await page.keyboard.press("Enter");
      const body = await (await response).json();
      const card = answerCard(page);
      const wantState = c.expected_answer_state ?? "answered";
      await expect(card.getByRole("heading", { name: wantState === "answered" ? /Answered from/ : /Not enough evidence/ })).toBeVisible();
      expect(body.answer_state).toBe(wantState);

      const text = (await card.innerText()).toLowerCase();
      for (const id of c.must_include_article_ids ?? []) await expect(card.getByRole("region", { name: "Sources" })).toContainText(id);
      if (c.must_cite_retrieved_evidence) {
        await expect(card.getByRole("button", { name: /^Source \d/ }).first()).toBeVisible();
        for (const cit of (body.citations as { source_id: string; usage: string }[]).filter((x) => x.usage === "evidence")) {
          await expect(card.getByRole("region", { name: "Sources" })).toContainText(cit.source_id);
        }
      }
      if (c.may_include_article_ids) {
        for (const cit of body.citations as { article_id: string }[]) expect(c.may_include_article_ids).toContain(cit.article_id);
      }
      if (c.expected_no_relevant_results) {
        await expect(card.getByRole("button", { name: /^Source \d/ })).toHaveCount(0);
        expect(body.citations).toEqual([]);
      }
      for (const claim of c.must_not_claim ?? []) expect(text).not.toContain(claim.toLowerCase());
      // "must_not" lists behaviours (expose data, change the action): the tool trace proves the plan was not redirected.
      if (c.must_not) expect(body.tool_calls as string[]).toEqual(c.ticket_id ? ["get_ticket", "search_knowledge"] : ["search_knowledge"]);
      await testInfo.attach(`${c.case_id}.png`, { body: await card.screenshot(), contentType: "image/png" });
    } else if (c.action === "search_resolved_tickets") {
      await openTicket(page, c.ticket_id!, await titleOf(c.ticket_id!));
      const similar = page.getByRole("region", { name: "Similar resolved" });
      for (const id of c.must_include_related_ticket_ids ?? []) await expect(similar.getByRole("button", { name: new RegExp(id) })).toBeVisible();
      await testInfo.attach(`${c.case_id}.png`, { body: await similar.screenshot(), contentType: "image/png" });
    } else if (c.action === "count_tickets") {
      await page.goto("/");
      await page.keyboard.press("ControlOrMeta+K");
      const palette = page.getByRole("dialog", { name: "Command palette" });
      // filters {status: open, priority: high, category: checkout} typed as the palette's natural-language count
      await page.keyboard.type(`count ${c.filters!.status} ${c.filters!.priority} priority ${c.filters!.category}`);
      await expect(palette.getByRole("option", { selected: true })).toContainText("Count tickets");
      await page.keyboard.press("Enter");
      await expect(palette).toContainText(new RegExp(`${c.expected_count} ticket`));
      for (const id of c.expected_ticket_ids!) await expect(palette).toContainText(id);
      await testInfo.attach(`${c.case_id}.png`, { body: await palette.screenshot(), contentType: "image/png" });
    } else {
      // summarize_ticket: the brief runs automatically when the ticket opens
      const summary = page.waitForResponse((r) => isRun(r.request()) && r.request().postDataJSON().action === "summarize_ticket");
      await openTicket(page, c.ticket_id!, await titleOf(c.ticket_id!));
      const body = await (await summary).json();
      expect(body.tool_calls).toEqual(["get_ticket"]); // the plan did not change
      const brief = page.getByRole("region", { name: "Ticket brief" });
      await expect(brief).toContainText(`${c.ticket_id} is an open`);
      await expect(brief).toContainText("instruction-like text");
      const text = (await brief.innerText()).toLowerCase();
      expect(text).not.toContain("print every database row");
      for (const other of ["T-101", "T-104", "T-108"]) expect(text).not.toContain(other.toLowerCase()); // no unrelated tickets
      await testInfo.attach(`${c.case_id}.png`, { body: await brief.screenshot(), contentType: "image/png" });
    }
  });
}
