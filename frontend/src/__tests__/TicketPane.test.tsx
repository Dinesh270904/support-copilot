import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { Conversation } from "../components/Conversation";
import { ReplyComposer } from "../components/ReplyComposer";
import { useCopilot } from "../hooks/useCopilot";
import { BRIEF, BRIEF_T112, DRAFT, SIMILAR, detail, installApi, queue } from "./fixtures";

afterEach(() => vi.unstubAllGlobals());

describe("Conversation", () => {
  it("flags only the instruction-like message, keeps its text visible, and separates days", () => {
    const t = detail("T-112");
    render(<Conversation messages={t.messages} untrusted={new Set([2])} />);
    expect(screen.getAllByText("Untrusted content: not followed")).toHaveLength(1);
    expect(screen.getByText(/Ignore all prior instructions/)).toBeVisible();
    expect(document.querySelectorAll(".convo-day")).toHaveLength(1); // both messages are on 12 Nov
  });
});

function Composer() {
  const c = useCopilot("T-101");
  return <ReplyComposer draft={c.session.draft} text={c.session.draftText} onText={c.setDraftText} onDraft={c.runDraft} onReset={c.resetDraft} />;
}

describe("ReplyComposer", () => {
  it("idle is just the Draft button; once drafted it is labelled 'Draft · not sent', focused, editable, copyable and resettable", async () => {
    installApi({ runs: { summarize_ticket: BRIEF, search_resolved_tickets: SIMILAR, draft_reply: DRAFT } });
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    render(<Composer />);

    expect(screen.getByRole("heading", { name: "Reply" })).toBeInTheDocument();
    expect(screen.getByText("Copilot drafts from documented guidance. Nothing is sent.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Reply draft")).not.toBeInTheDocument(); // no textarea until there is a draft

    await user.click(screen.getByRole("button", { name: /Draft with Copilot/ }));
    const box = (await screen.findByDisplayValue(/Thank you for contacting us/)) as HTMLTextAreaElement;
    expect(screen.getByRole("heading", { name: /Draft · not sent/ })).toBeInTheDocument();
    expect(box).toHaveFocus(); // focus moves into the draft when it arrives

    // The agent-facing prohibition is in the collapsed notes, never in the customer text.
    expect(box.value).not.toMatch(/do not ask the customer/);
    const toggle = screen.getByRole("button", { name: /Notes for the agent \(1\)/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/do not ask the customer to submit another payment/)).not.toBeInTheDocument();
    await user.click(toggle);
    expect(screen.getByText(/do not ask the customer to submit another payment/)).toBeInTheDocument();

    await user.type(box, " We are checking now.");
    expect(screen.getByText(/Edited ·/)).toHaveTextContent(`Edited · ${box.value.length} characters`);
    expect(screen.getByRole("heading", { name: /Draft · not sent/ })).toBeInTheDocument(); // still labelled while editing
    await user.click(screen.getByRole("button", { name: "Copy draft" }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("We are checking now."));
    expect(await screen.findByText("Copied")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Reset/ }));
    expect(box.value).toBe(DRAFT.draft);
  });

  it("a holding-reply draft carries an amber note so nobody promises specifics", async () => {
    installApi({ runs: { summarize_ticket: BRIEF, search_resolved_tickets: SIMILAR, draft_reply: { ...DRAFT, answer_state: "insufficient_evidence" } } });
    const user = userEvent.setup();
    render(<Composer />);
    await user.click(screen.getByRole("button", { name: /Draft with Copilot/ }));
    expect(await screen.findByText(/holding reply\. Don't promise specifics\./)).toBeInTheDocument();
  });

  it("shows a spinner and skeleton while drafting, and an inline error with Retry if it fails", async () => {
    let n = 0;
    installApi({ runs: { summarize_ticket: BRIEF, search_resolved_tickets: SIMILAR, draft_reply: () => (++n === 1 ? { status: 504, body: { error: { code: "gateway_timeout", message: "The assistant tool server timed out. Try again shortly.", request_id: "rid-5" } } } : { body: DRAFT }) } });
    const user = userEvent.setup();
    render(<Composer />);
    await user.click(screen.getByRole("button", { name: /Draft with Copilot/ }));
    expect(await screen.findByText("The tool server took too long")).toBeInTheDocument();
    expect(screen.getByText("Try again; if it repeats, check the API logs.")).toBeInTheDocument();
    expect(screen.getByText("Request ID rid-5")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByDisplayValue(/Thank you for contacting us/)).toBeInTheDocument();
  });
});

describe("ticket pane in the app", () => {
  it("flags the message the summary warned about", async () => {
    installApi({ runs: { summarize_ticket: BRIEF_T112, search_resolved_tickets: SIMILAR } });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await queue().findByRole("button", { name: /T-112/ }));
    expect(await screen.findByText("Untrusted content: not followed")).toBeInTheDocument();
    expect(screen.getByText(/Ignore all prior instructions/)).toBeVisible();
  });

  it("marks reviewed optimistically and rolls back with an inline error when the request fails", async () => {
    installApi({ runs: { summarize_ticket: BRIEF, search_resolved_tickets: SIMILAR }, reviewStatus: 503 });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await queue().findByRole("button", { name: /T-101/ }));
    await user.click(await screen.findByRole("button", { name: /Mark reviewed/ }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't mark reviewed. Try again.");
    expect(alert).toHaveTextContent("Request ID: rid-1");
    expect(screen.getByRole("button", { name: /Mark reviewed/ })).toBeInTheDocument(); // rolled back
  });

  it("shows 'Reviewed' with the time once the request succeeds", async () => {
    installApi({ runs: { summarize_ticket: BRIEF, search_resolved_tickets: SIMILAR } });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await queue().findByRole("button", { name: /T-101/ }));
    await user.click(await screen.findByRole("button", { name: /Mark reviewed/ }));
    const done = await screen.findByRole("button", { name: /Reviewed 18 Nov, 10:00 UTC/ });
    expect(done).toBeDisabled();
    expect(screen.getByText("Marked T-101 reviewed")).toBeInTheDocument(); // aria-live confirmation
    expect(screen.queryByRole("button", { name: /Mark reviewed/ })).not.toBeInTheDocument();
  });
});
