import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssistantPanel } from "../components/AssistantPanel";
import type { AssistantRunResponse, Meta, TicketDetail } from "../types";

const meta: Meta = {
  statuses: ["open", "resolved"],
  priorities: ["low", "medium", "high"],
  categories: ["billing", "checkout", "integrations"],
  actions: ["summarize_ticket", "search_knowledge", "search_resolved_tickets", "draft_reply", "count_tickets"],
};

const ticket: TicketDetail = {
  id: "T-101",
  title: "Checkout timed out with a pending payment",
  category: "checkout",
  priority: "high",
  status: "open",
  product_area: "web_checkout",
  created_at: "2026-11-12T09:15:00Z",
  updated_at: "2026-11-12T09:42:00Z",
  reviewed_at: null,
  description: "The checkout page displayed PAYMENT_TIMEOUT.",
  resolution_summary: null,
  messages: [],
};

function response(overrides: Partial<AssistantRunResponse>): AssistantRunResponse {
  return {
    run_id: "run1",
    action: "search_knowledge",
    ticket_id: "T-101",
    answer_state: "answered",
    answer: "",
    sections: [],
    citations: [],
    draft: null,
    count: null,
    retrieval: null,
    tool_calls: ["get_ticket", "search_knowledge"],
    tool_trace: [],
    limitations: [],
    warnings: [],
    duration_ms: 12,
    ...overrides,
  };
}

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("AssistantPanel", () => {
  it("shows quoted evidence with source tags and an expandable citation with its score", async () => {
    mockFetch(200, response({
      answer: "Documented guidance from “Handling a checkout payment timeout” (KB-01):\n- If the payment is pending, do not ask the customer to submit another payment. [KB-01#chunk-1]",
      citations: [{
        source_id: "KB-01#chunk-1", source_type: "knowledge_chunk", title: "Handling a checkout payment timeout",
        excerpt: "If the payment is pending, do not ask the customer to submit another payment.", score: 0.2935,
        score_type: "cosine", article_id: "KB-01", ticket_id: null, usage: "evidence",
      }],
    }));
    const user = userEvent.setup();
    render(<AssistantPanel ticket={ticket} meta={meta} onOpenTicket={() => {}} />);

    await user.click(screen.getByRole("tab", { name: "Search knowledge" }));
    await user.type(screen.getByLabelText("Question"), "pending payment retry");
    await user.click(screen.getByRole("button", { name: "Search articles" }));

    expect(await screen.findByText("Answer quoted from knowledge articles")).toBeInTheDocument();
    const quote = screen.getByText(/do not ask the customer to submit another payment/, { selector: "mark" });
    expect(quote).toHaveClass("hl");
    expect(screen.getByText("similarity 0.29")).toBeInTheDocument();
    expect(screen.getByText("Sources (1)")).toBeInTheDocument();
  });

  it("sends the request body with ticket context and the ticket category as default scope", async () => {
    const fetchMock = mockFetch(200, response({ answer_state: "insufficient_evidence", answer: "Insufficient evidence." }));
    const user = userEvent.setup();
    render(<AssistantPanel ticket={ticket} meta={meta} onOpenTicket={() => {}} />);
    await user.click(screen.getByRole("tab", { name: "Search knowledge" }));
    await user.type(screen.getByLabelText("Question"), "bank decline fee");
    await user.click(screen.getByRole("button", { name: "Search articles" }));
    await screen.findByText("Not enough evidence to answer");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/assistant/run");
    expect(JSON.parse(init.body)).toEqual({
      action: "search_knowledge", ticket_id: "T-101", query: "bank decline fee", category: "checkout",
    });
    // Insufficient evidence shows no sources at all — nothing to fabricate.
    expect(screen.queryByText(/Sources \(/)).not.toBeInTheDocument();
  });

  it("validates a missing question before calling the API", async () => {
    const fetchMock = mockFetch(200, {});
    const user = userEvent.setup();
    render(<AssistantPanel ticket={null} meta={meta} onOpenTicket={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Search articles" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a question to search for.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows server validation errors and MCP outages as distinct states", async () => {
    const user = userEvent.setup();
    render(<AssistantPanel ticket={ticket} meta={meta} onOpenTicket={() => {}} />);

    mockFetch(503, { error: { code: "assistant_unavailable", message: "The assistant tool server is unavailable. Try again shortly.", request_id: "abc" } });
    await user.click(screen.getByRole("button", { name: "Summarize ticket" }));
    const outage = await screen.findByRole("alert");
    expect(outage).toHaveTextContent("Assistant service unavailable");
    expect(outage).toHaveTextContent("Request ID: abc");

    mockFetch(422, { error: { code: "validation_error", message: "query: String should have at most 500 characters" } });
    await user.click(screen.getByRole("button", { name: "Summarize ticket" }));
    expect(await screen.findByText("Request rejected")).toBeInTheDocument();
  });

  it("labels the draft as not sent and lets the agent edit and copy it", async () => {
    mockFetch(200, response({
      action: "draft_reply",
      answer: "Draft prepared for review. It has NOT been sent.",
      draft: "Hello,\n\nThank you for contacting us.",
    }));
    const user = userEvent.setup();
    // userEvent.setup() installs its own clipboard stub, so spy on it afterwards.
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    render(<AssistantPanel ticket={ticket} meta={meta} onOpenTicket={() => {}} />);

    await user.click(screen.getByRole("tab", { name: "Draft reply" }));
    await user.click(screen.getByRole("button", { name: "Draft reply" }));
    const note = await screen.findByRole("note");
    expect(note).toHaveTextContent("Draft, not sent.");

    const editor = screen.getByLabelText("Draft reply");
    await user.type(editor, " We are checking now.");
    expect(within(editor.parentElement!).getByText("Edited")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Copy draft" }));
    expect(writeText).toHaveBeenCalledWith("Hello,\n\nThank you for contacting us. We are checking now.");
  });
});
