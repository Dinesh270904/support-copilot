import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { AnswerCard } from "../components/AnswerCard";
import { SourceDrawer } from "../components/SourceDrawer";
import { TraceDrawer } from "../components/TraceDrawer";
import type { SourceRef } from "../components/SourceDetails";
import { highlight, parseAnswer } from "../lib/answer";
import { ANSWERED, INSUFFICIENT_BANK, INSUFFICIENT_LOW, LOW_OVERLAP, NO_EVIDENCE_SFTP, run } from "./fixtures";
import type { AssistantRunResponse } from "../types";

interface CardProps {
  result: AssistantRunResponse;
  onOpenTicket?: (id: string) => void;
  onDraftHolding?: () => void;
  onSearchAll?: () => void;
  onViewTrace?: (r: AssistantRunResponse, opener: HTMLElement | null) => void;
  scope?: string;
  question?: string;
}
function Card({ result, onOpenTicket = () => {}, onDraftHolding, onSearchAll, onViewTrace = () => {}, scope, question }: CardProps) {
  const [src, setSrc] = useState<SourceRef | null>(null);
  return (
    <>
      <AnswerCard result={result} onViewSource={setSrc} onViewTrace={onViewTrace} onOpenTicket={onOpenTicket} onDraftHolding={onDraftHolding} onSearchAll={onSearchAll} scope={scope} question={question} />
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
  it("headline, scope and question; prose with numbered marker buttons that have descriptive names", () => {
    render(<Card result={ANSWERED} scope="Checkout" question="Can the customer retry while payment is pending?" />);
    const card = screen.getByRole("article", { name: "Answer" });
    expect(within(card).getByRole("heading", { name: /Answered from 1 article · Checkout/ })).toBeInTheDocument();
    expect(card).toHaveClass("acard-answered");
    expect(within(card).getByText("Can the customer retry while payment is pending?")).toBeInTheDocument();
    expect(within(card).getAllByRole("button", { name: "Source 1: KB-01#chunk-1, Handling a checkout payment timeout" })).toHaveLength(2);
    expect(within(card).getAllByRole("button", { name: "Source 2: KB-01#chunk-2, Handling a checkout payment timeout" })).toHaveLength(1);
    expect(card).not.toHaveTextContent("Documented guidance from");
  });

  it("lists quoted sources first, then the retrieved-but-unused one dimmed, with scores, matched terms and the legend", () => {
    render(<Card result={ANSWERED} />);
    const items = within(screen.getByRole("region", { name: "Sources" })).getAllByRole("listitem");
    expect(items.map((li) => li.querySelector(".source-id")?.textContent)).toEqual(["KB-01#chunk-1", "KB-01#chunk-2", "KB-02#chunk-1"]);
    expect(items[0]).toHaveTextContent("quoted");
    expect(items[2]).toHaveClass("source-dim");
    expect(items[2]).toHaveTextContent("not quoted");
    expect(items[0]).toHaveTextContent("matched: payment, timeout");
    expect(items[0]).toHaveTextContent("PAYMENT_TIMEOUT");
    expect(within(items[0]).getByRole("meter")).toHaveAttribute("aria-valuenow", "0.2935");
    expect(screen.getByText(/minimum score 0\.15/)).toBeInTheDocument();
  });

  it("hovering or focusing a marker highlights its row in the source list", () => {
    render(<Card result={ANSWERED} />);
    const row = () => screen.getByText("KB-01#chunk-2", { selector: ".source-id" }).closest("li")!;
    expect(row()).not.toHaveClass("source-active");
    act(() => screen.getAllByRole("button", { name: /^Source 2:/ })[0].focus());
    expect(row()).toHaveClass("source-active");
  });

  it("the meter's accessible name states the score, the threshold and which side of it", () => {
    render(<Card result={ANSWERED} />);
    expect(screen.getAllByRole("meter", { name: "Similarity 0.29, threshold 0.15, above threshold" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("meter", { name: "Similarity 0.15, threshold 0.15, above threshold" })).toHaveLength(1);
  });

  it("focusing a marker opens a preview with the highlighted sentence, the score and tick, 'Open source' and 'Esc to close'; Esc closes it", async () => {
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
    expect(within(preview).getByText("KB-01#chunk-1")).toBeInTheDocument();
    expect(within(preview).getByText("Handling a checkout payment timeout")).toBeInTheDocument();
    expect(within(preview).getByRole("button", { name: /Open source/ })).toBeInTheDocument();
    expect(within(preview).getByText(/to close/)).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(marker).toHaveFocus();
  });

  it("'Open source' opens a focus-trapped drawer (with the chunk number) and Esc returns focus to the marker", async () => {
    const user = userEvent.setup();
    render(<Card result={ANSWERED} />);
    const marker = screen.getAllByRole("button", { name: /^Source 2:/ })[0];
    act(() => marker.focus());
    const preview = await screen.findByRole("dialog", { name: "Source 2: KB-01#chunk-2" });
    await user.click(within(preview).getByRole("button", { name: /Open source/ }));
    const drawer = await screen.findByRole("dialog", { name: "Source: KB-01#chunk-2" });
    expect(drawer).toHaveAttribute("aria-modal", "true");
    expect(drawer).toHaveTextContent("Chunk 2");
    expect(drawer).toHaveTextContent("KB-01");
    expect(within(drawer).getByRole("button", { name: "Close source" })).toHaveFocus();
    await user.tab();
    expect(drawer).toContainElement(document.activeElement as HTMLElement);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(marker).toHaveFocus();
  });

  it("a click on a marker opens its preview and a second click keeps it open (hover precedes click)", async () => {
    const user = userEvent.setup();
    render(<Card result={ANSWERED} />);
    const marker = screen.getAllByRole("button", { name: /^Source 1:/ })[0];
    await user.click(marker);
    expect(screen.getByRole("dialog", { name: /Source 1/ })).toBeInTheDocument();
    await user.click(marker);
    expect(screen.getByRole("dialog", { name: /Source 1/ })).toBeInTheDocument();
  });

  it("shows the tool timeline by default; ⋯ → View raw trace hands off to the trace drawer; limitations sit behind a quiet toggle", async () => {
    const user = userEvent.setup();
    const onViewTrace = vi.fn();
    render(<Card result={ANSWERED} onViewTrace={onViewTrace} />);
    const how = screen.getByRole("region", { name: "How this was answered" });
    expect(within(how).getByText("get_ticket")).toBeVisible();
    expect(within(how).getByText("3 ms")).toBeVisible();
    expect(within(how).getByText("search_knowledge")).toBeVisible();
    expect(within(how).getByText("9 ms")).toBeVisible();
    expect(within(how).getByText("TF-IDF cosine")).toBeVisible();
    expect(within(how).getByText("scope Checkout")).toBeVisible();
    expect(within(how).getByText("4 candidates")).toBeVisible();
    expect(within(how).getByText("top 3")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Answer options" }));
    await user.click(screen.getByRole("menuitem", { name: "View raw trace" }));
    expect(onViewTrace).toHaveBeenCalledWith(ANSWERED, screen.getByRole("button", { name: "Answer options" }));

    expect(screen.queryByText("A past fix is a precedent.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /2 limitations/ }));
    expect(screen.getByText("A past fix is a precedent.")).toBeVisible();
  });

  it("a failed tool call shows a cross and its error code in the timeline", () => {
    const failed = run({ ...ANSWERED, tool_trace: [{ tool: "search_knowledge", arguments: {}, status: "error", duration_ms: 4, error: "tool_error" }] });
    render(<Card result={failed} />);
    const how = screen.getByRole("region", { name: "How this was answered" });
    expect(within(how).getByLabelText("failed: tool_error")).toHaveTextContent("✕");
    expect(within(how).getByText("tool_error")).toBeInTheDocument();
  });
});

describe("TraceDrawer", () => {
  it("pretty-prints the raw trace and retrieval, copies the JSON, and Esc closes it", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    const onClose = vi.fn();
    render(<TraceDrawer result={ANSWERED} onClose={onClose} />);
    const drawer = screen.getByRole("dialog", { name: "Raw tool trace" });
    expect(within(drawer).getByLabelText("Raw tool trace JSON")).toHaveTextContent('"tool": "get_ticket"');
    expect(within(drawer).getByLabelText("Raw tool trace JSON")).toHaveTextContent('"method": "tfidf_cosine"');
    await user.click(within(drawer).getByRole("button", { name: "Copy JSON" }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('"tool_trace"'));
    expect(await screen.findByText("Copied")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});

describe("AnswerCard: insufficient evidence and no results", () => {
  it("leads with the plain sentence, keeps the backend's specific reason beneath it, and shows best score against the minimum", () => {
    render(<Card result={INSUFFICIENT_LOW} scope="All categories" />);
    const card = screen.getByRole("article", { name: "Answer" });
    expect(card).toHaveClass("acard-insufficient_evidence");
    expect(within(card).getByRole("heading", { name: /Not enough evidence/ })).toBeInTheDocument();
    expect(within(card).getByText("The knowledge base doesn't cover this, so Copilot won't guess.")).toBeInTheDocument();
    expect(within(card).getByText(/best candidate scored 0\.10/)).toBeInTheDocument(); // the specific reason is kept, as a secondary line
    expect(within(card).getByRole("meter")).toHaveAttribute("aria-valuenow", "0.1");
    expect(within(card).getByTestId("meter-threshold")).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: /^Source \d/ })).not.toBeInTheDocument();
    expect(within(card).queryByRole("region", { name: "Sources" })).not.toBeInTheDocument();
  });

  it("the out-of-scope case quotes the source, keeps a marker and the instruction, explains the high score, and offers both actions", async () => {
    const user = userEvent.setup();
    const onDraftHolding = vi.fn();
    const onSearchAll = vi.fn();
    render(<Card result={INSUFFICIENT_BANK} onDraftHolding={onDraftHolding} onSearchAll={onSearchAll} scope="Billing" />);
    expect(screen.getByText("The knowledge base doesn't cover this, so Copilot won't guess.")).toBeInTheDocument();
    expect(screen.getByText("Closest source says this is out of scope:")).toBeInTheDocument();
    expect(screen.getByText(/“This article does not define bank decline fees, refunds, or tax treatment; escalate questions about those topics for review\.”/)).toBeInTheDocument();
    expect(screen.getByText("Do not state a policy on this topic; escalate it for review.")).toBeInTheDocument(); // the backend's reason
    expect(screen.getByRole("button", { name: /^Source 1: KB-06#chunk-2/ })).toBeInTheDocument();
    expect(screen.getByText(/Similarity is high because the article names this topic/)).toBeInTheDocument();
    expect(screen.getByRole("meter").querySelector(".meter-fill")).toHaveClass("meter-neutral"); // never drawn as a pass
    await user.click(screen.getByRole("button", { name: "Draft a holding reply" }));
    await user.click(screen.getByRole("button", { name: "Search all categories" }));
    expect(onDraftHolding).toHaveBeenCalledTimes(1);
    expect(onSearchAll).toHaveBeenCalledTimes(1);
  });

  it("no articles in the scope: says which scope, shows best 0.00 against the minimum, and keeps the backend reason", () => {
    render(<Card result={NO_EVIDENCE_SFTP} />);
    expect(screen.getByText("No articles in Integrations match this question.")).toBeInTheDocument();
    expect(screen.getByText(/no knowledge articles exist in category 'integrations'/)).toBeInTheDocument();
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "0");
    expect(screen.getByText(/Nothing was scored in this scope/)).toBeInTheDocument();
  });

  it("rejected for low term overlap says the closest articles share too few words", () => {
    render(<Card result={LOW_OVERLAP} />);
    expect(screen.getByText("The closest articles share too few words with your question to count as evidence.")).toBeInTheDocument();
    expect(screen.getByText(/share too few query terms/)).toBeInTheDocument();
  });

  it("no results is neutral with a widen hint and a Widen filters button", async () => {
    const user = userEvent.setup();
    const onSearchAll = vi.fn();
    render(<Card onSearchAll={onSearchAll} result={run({ answer_state: "no_results", answer: "No similar resolved tickets found in category 'checkout'.", retrieval: { ...INSUFFICIENT_LOW.retrieval!, category: "checkout" } })} />);
    expect(screen.getByRole("article", { name: "Answer" })).toHaveClass("acard-no_results");
    expect(screen.getByRole("heading", { name: /Nothing found/ })).toBeInTheDocument();
    expect(screen.getByText("Try widening the scope to all categories.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Widen filters" }));
    expect(onSearchAll).toHaveBeenCalled();
  });

  it("surfaces backend warnings in a strip", () => {
    render(<Card result={run({ answer: "x", warnings: ["A quoted evidence sentence contains instruction-like text."] })} />);
    expect(screen.getByText("A quoted evidence sentence contains instruction-like text.")).toBeInTheDocument();
  });

  it("a count answer shows its ticket IDs as buttons that open the ticket", async () => {
    const user = userEvent.setup();
    const open = vi.fn();
    render(<Card onOpenTicket={open} result={run({ action: "count_tickets", answer: "1 ticket(s) match status=open. Matching IDs: T-101.", tool_calls: ["count_tickets"], count: { count: 1, ticket_ids: ["T-101"], filters: { status: "open" } } })} />);
    expect(screen.getByRole("heading", { name: /Count complete/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "T-101" }));
    expect(open).toHaveBeenCalledWith("T-101");
  });
});

describe("answered by an exact error-code match", () => {
  it("explains a score below the minimum instead of leaving it mysterious", () => {
    const low = run({ ...ANSWERED, citations: [{ ...ANSWERED.citations[0], score: 0.1, matched_identifiers: ["PAYMENT_TIMEOUT"] }] });
    render(<Card result={low} />);
    const sources = within(screen.getByRole("region", { name: "Sources" }));
    expect(sources.getByText(/Accepted by exact match on/)).toHaveTextContent("PAYMENT_TIMEOUT");
    expect(sources.getByRole("meter")).toHaveAttribute("aria-valuenow", "0.1");
    expect(sources.getByRole("meter", { name: /below threshold/ })).toBeInTheDocument();
  });
});
