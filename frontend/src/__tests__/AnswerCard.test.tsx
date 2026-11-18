import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { AnswerCard } from "../components/AnswerCard";
import { SourceDrawer } from "../components/SourceDrawer";
import type { SourceRef } from "../components/SourceDetails";
import { highlight, parseAnswer } from "../lib/answer";
import { ANSWERED, INSUFFICIENT_BANK, INSUFFICIENT_LOW, NO_EVIDENCE_SFTP, run } from "./fixtures";
import type { AssistantRunResponse } from "../types";

function Card({ result, onOpenTicket = () => {}, onDraftHolding }: { result: AssistantRunResponse; onOpenTicket?: (id: string) => void; onDraftHolding?: () => void }) {
  const [src, setSrc] = useState<SourceRef | null>(null);
  return (
    <>
      <AnswerCard result={result} onViewSource={setSrc} onOpenTicket={onOpenTicket} onDraftHolding={onDraftHolding} />
      <SourceDrawer source={src} threshold={result.retrieval?.min_score ?? null} onClose={() => setSrc(null)} onOpenTicket={onOpenTicket} />
    </>
  );
}

describe("answer parsing", () => {
  it("numbers sources by first appearance and records the quoted sentences", () => {
    const p = parseAnswer("Lead line.\n- First. [KB-02#chunk-1]\n- Second. [KB-01#chunk-3]\n- Third. [KB-02#chunk-1]");
    expect([...p.numbers]).toEqual([["KB-02#chunk-1", 1], ["KB-01#chunk-3", 2]]);
    expect(p.quoted.get("KB-02#chunk-1")).toEqual(["First.", "Third."]);
  });
  it("turns inline tags in non-evidence lines into markers too", () => {
    const p = parseAnswer("The closest source [KB-06#chunk-2] does not cover this.");
    expect(p.lines[0].pieces.map((x) => x.kind)).toEqual(["text", "cite", "text"]);
  });
  it("highlight finds quoted sentences verbatim and ignores ones that are not there", () => {
    expect(highlight("A one. A two. A three.", ["A two.", "missing"])).toEqual([
      { text: "A one. ", hit: false }, { text: "A two.", hit: true }, { text: " A three.", hit: false },
    ]);
    expect(highlight("only text", ["nope"])).toEqual([{ text: "only text", hit: false }]);
  });
});

describe("AnswerCard: answered", () => {
  it("renders the quoted sentences as prose with numbered markers that are buttons with descriptive names", () => {
    render(<Card result={ANSWERED} />);
    const card = screen.getByRole("article", { name: "Answer" });
    expect(within(card).getByText("Answered from 1 article")).toBeInTheDocument();
    expect(within(card).getAllByRole("button", { name: "Source 1: KB-01#chunk-1, Handling a checkout payment timeout" })).toHaveLength(2);
    expect(within(card).getAllByRole("button", { name: "Source 2: KB-01#chunk-2, Handling a checkout payment timeout" })).toHaveLength(1);
    expect(card).not.toHaveTextContent("Documented guidance from"); // the sources list carries the titles
    expect(screen.getAllByText(/^Quoted in the answer$/, { selector: ".source-usage" })).toHaveLength(2); // one per quoted source
  });

  it("lists the quoted sources first, then retrieved-but-unused ones dimmed, with scores and matched terms", () => {
    render(<Card result={ANSWERED} />);
    const items = within(screen.getByRole("region", { name: "Sources" })).getAllByRole("listitem");
    expect(items.map((li) => li.querySelector(".source-id")?.textContent)).toEqual(["KB-01#chunk-1", "KB-01#chunk-2", "KB-02#chunk-1"]);
    expect(items[2]).toHaveClass("source-dim");
    expect(items[2]).toHaveTextContent("Retrieved, not quoted");
    expect(items[0]).toHaveTextContent("matched: payment, timeout");
    expect(items[0]).toHaveTextContent("PAYMENT_TIMEOUT");
    expect(within(items[0]).getByRole("meter")).toHaveAttribute("aria-valuenow", "0.2935");
    expect(screen.getByText(/minimum score 0\.15/)).toBeInTheDocument();
  });

  it("focusing a marker opens a preview with the highlighted quoted sentence, the score and the threshold tick; Esc closes it", async () => {
    const user = userEvent.setup();
    render(<Card result={ANSWERED} />);
    const marker = screen.getAllByRole("button", { name: /^Source 1:/ })[0];
    act(() => marker.focus());
    const preview = await screen.findByRole("dialog", { name: "Source 1: KB-01#chunk-1" });
    const quoted = within(preview).getAllByText(/first check the order|do not ask the customer/, { selector: "mark" });
    expect(quoted).toHaveLength(2);
    expect(quoted[0]).toHaveClass("quoted");
    expect(within(preview).getByRole("meter")).toHaveAttribute("aria-valuenow", "0.2935");
    expect(within(preview).getByText("0.29")).toBeInTheDocument();
    expect(within(preview).getByTestId("meter-threshold")).toBeInTheDocument();
    expect(within(preview).getByText("Handling a checkout payment timeout")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(marker).toHaveFocus();
  });

  it("'View source' opens a focus-trapped drawer and Esc returns focus to the marker", async () => {
    const user = userEvent.setup();
    render(<Card result={ANSWERED} />);
    const marker = screen.getAllByRole("button", { name: /^Source 2:/ })[0];
    act(() => marker.focus());
    const preview = await screen.findByRole("dialog", { name: "Source 2: KB-01#chunk-2" });
    await user.click(within(preview).getByRole("button", { name: "View source" }));
    const drawer = await screen.findByRole("dialog", { name: "Source: KB-01#chunk-2" });
    expect(drawer).toHaveAttribute("aria-modal", "true");
    expect(within(drawer).getByRole("button", { name: "Close source" })).toHaveFocus();
    await user.tab(); // only one focusable control: focus stays inside
    expect(drawer).toContainElement(document.activeElement as HTMLElement);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(marker).toHaveFocus();
  });

  it("shows the tool timeline by default, the raw trace behind ⋯, and the limitations behind a quiet toggle", async () => {
    const user = userEvent.setup();
    render(<Card result={ANSWERED} />);
    const how = screen.getByRole("region", { name: "How this was answered" });
    expect(within(how).getByText("get_ticket")).toBeVisible();
    expect(within(how).getByText("3 ms")).toBeVisible();
    expect(within(how).getByText("search_knowledge")).toBeVisible();
    expect(within(how).getByText("9 ms")).toBeVisible();
    expect(within(how).getByText("scope checkout")).toBeVisible();
    expect(within(how).getByText("4 candidates")).toBeVisible();
    expect(screen.queryByLabelText("Raw tool trace")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show raw tool trace" }));
    expect(screen.getByLabelText("Raw tool trace")).toHaveTextContent('"tool": "get_ticket"');
    expect(screen.queryByText("A past fix is a precedent.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /2 limitations/ }));
    expect(screen.getByText("A past fix is a precedent.")).toBeVisible();
  });
});

describe("AnswerCard: insufficient evidence and no results", () => {
  it("amber state, the meter with its threshold tick, and no source markers when nothing was retrieved", () => {
    render(<Card result={INSUFFICIENT_LOW} />);
    const card = screen.getByRole("article", { name: "Answer" });
    expect(card).toHaveClass("acard-insufficient_evidence");
    expect(within(card).getByText("Not enough evidence. Don't guess.")).toBeInTheDocument();
    expect(within(card).getByText(/best candidate scored 0\.10/)).toBeInTheDocument();
    const meter = within(card).getByRole("meter");
    expect(meter).toHaveAttribute("aria-valuenow", "0.1");
    expect(within(card).getByTestId("meter-threshold")).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: /^Source \d/ })).not.toBeInTheDocument();
    expect(within(card).queryByRole("region", { name: "Sources" })).not.toBeInTheDocument();
  });

  it("the out-of-scope case says so, keeps the coverage-gap source, and offers a holding-reply draft", async () => {
    const user = userEvent.setup();
    const onDraftHolding = vi.fn();
    render(<Card result={INSUFFICIENT_BANK} onDraftHolding={onDraftHolding} />);
    expect(screen.getByText("Closest source says this is out of scope.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Source 1: KB-06#chunk-2/ })).toBeInTheDocument();
    expect(screen.getByText("Closest source says this is out of scope", { selector: ".source-usage" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Draft a holding reply" }));
    expect(onDraftHolding).toHaveBeenCalledTimes(1);
  });

  it("no articles in the scope: no meter (nothing was scored) and a hint to widen the scope", () => {
    render(<Card result={NO_EVIDENCE_SFTP} />);
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
    expect(screen.getByText(/No articles exist in this scope/)).toBeInTheDocument();
  });

  it("no results is neutral grey with a widen-scope hint", () => {
    render(<Card result={run({ answer_state: "no_results", answer: "No similar resolved tickets found.", retrieval: { ...INSUFFICIENT_LOW.retrieval!, category: "checkout" } })} />);
    expect(screen.getByRole("article", { name: "Answer" })).toHaveClass("acard-no_results");
    expect(screen.getByText("No results")).toBeInTheDocument();
    expect(screen.getByText("Try widening the scope to all categories.")).toBeInTheDocument();
  });

  it("surfaces backend warnings in a strip", () => {
    render(<Card result={run({ answer: "x", warnings: ["A quoted evidence sentence contains instruction-like text."] })} />);
    expect(screen.getByText("A quoted evidence sentence contains instruction-like text.")).toBeInTheDocument();
  });

  it("a count answer shows its ticket IDs as buttons that open the ticket", async () => {
    const user = userEvent.setup();
    const open = vi.fn();
    render(<Card onOpenTicket={open} result={run({ action: "count_tickets", answer: "1 ticket(s) match status=open. Matching IDs: T-101.", tool_calls: ["count_tickets"], count: { count: 1, ticket_ids: ["T-101"], filters: { status: "open" } } })} />);
    expect(screen.getByText("Count complete")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "T-101" }));
    expect(open).toHaveBeenCalledWith("T-101");
  });
});

describe("answered by an exact error-code match", () => {
  it("explains a score below the minimum instead of leaving it mysterious", () => {
    const low = run({
      ...ANSWERED,
      citations: [{ ...ANSWERED.citations[0], score: 0.1, matched_identifiers: ["PAYMENT_TIMEOUT"] }],
    });
    render(<Card result={low} />);
    const sources = within(screen.getByRole("region", { name: "Sources" }));
    expect(sources.getByText(/Accepted by exact match on/)).toHaveTextContent("PAYMENT_TIMEOUT");
    expect(sources.getByRole("meter")).toHaveAttribute("aria-valuenow", "0.1");
  });
  it("a click on a marker opens its preview and a second click keeps it open (hover precedes click)", async () => {
    const user = userEvent.setup();
    render(<Card result={ANSWERED} />);
    const marker = screen.getAllByRole("button", { name: /^Source 1:/ })[0];
    await user.click(marker); // user-event hovers first, like a real mouse
    expect(screen.getByRole("dialog", { name: /Source 1/ })).toBeInTheDocument();
    await user.click(marker);
    expect(screen.getByRole("dialog", { name: /Source 1/ })).toBeInTheDocument();
  });
});

describe("a high score on an insufficient-evidence card", () => {
  it("is drawn neutral and explained, so it cannot be read as a pass", () => {
    render(<Card result={INSUFFICIENT_BANK} />);
    const card = screen.getByRole("article", { name: "Answer" });
    expect(card.querySelector(".meter-fill")).toHaveClass("meter-neutral");
    expect(card.querySelector(".meter-ok")).toBeNull();
    expect(within(card).getByText(/Similarity is high because the article names this topic/)).toBeInTheDocument();
  });
});
