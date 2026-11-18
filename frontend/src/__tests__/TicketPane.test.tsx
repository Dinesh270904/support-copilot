import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { Conversation } from "../components/Conversation";
import { ReplyComposer } from "../components/ReplyComposer";
import { useCopilot } from "../hooks/useCopilot";
import { BRIEF, BRIEF_T112, DRAFT, SIMILAR, detail, installApi } from "./fixtures";

afterEach(() => vi.unstubAllGlobals());

describe("Conversation", () => {
  it("flags only the instruction-like message, keeps its text visible, and separates days", () => {
    const t = detail("T-112");
    render(<Conversation messages={t.messages} untrusted={new Set([2])} />);
    expect(screen.getAllByText("Untrusted content: not followed")).toHaveLength(1);
    expect(screen.getByText(/Ignore all prior instructions/)).toBeVisible();
    expect(screen.getAllByRole("separator")).toHaveLength(1); // both messages are on 12 Nov
  });
});

function Composer() {
  const c = useCopilot("T-101");
  return <ReplyComposer draft={c.session.draft} text={c.session.draftText} onText={c.setDraftText} onDraft={c.runDraft} onReset={c.resetDraft} />;
}

describe("ReplyComposer", () => {
  it("is labelled 'Draft, not sent', fills from Copilot, and supports edit, reset and copy", async () => {
    installApi({ runs: { summarize_ticket: BRIEF, search_resolved_tickets: SIMILAR, draft_reply: DRAFT } });
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    render(<Composer />);

    expect(screen.getByRole("heading", { name: /Draft, not sent/ })).toBeInTheDocument(); // present before drafting
    const box = screen.getByLabelText("Reply draft");
    expect(box).toHaveValue("");

    await user.click(screen.getByRole("button", { name: /Draft with Copilot/ }));
    expect(await screen.findByDisplayValue(/Thank you for contacting us/)).toBe(box);
    expect(screen.getByRole("heading", { name: /Draft, not sent/ })).toBeInTheDocument(); // and after

    // Agent-facing prohibition is in the notes, not in the customer text.
    const notes = screen.getByText("Notes for the agent").closest("div")!;
    expect(within(notes).getByText(/do not ask the customer to submit another payment/)).toBeInTheDocument();
    expect((box as HTMLTextAreaElement).value).not.toMatch(/do not ask the customer/);

    await user.type(box, " We are checking now.");
    expect(screen.getByText("Edited")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("We are checking now."));
    expect(await screen.findByText("Copied to clipboard")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect((box as HTMLTextAreaElement).value).toBe(DRAFT.draft);
  });
});

describe("ticket pane in the app", () => {
  it("flags the message the summary warned about", async () => {
    installApi({ runs: { summarize_ticket: BRIEF_T112, search_resolved_tickets: SIMILAR } });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: /T-112/ }));
    expect(await screen.findByText("Untrusted content: not followed")).toBeInTheDocument();
    expect(screen.getByText(/Ignore all prior instructions/)).toBeVisible();
  });

  it("marks reviewed optimistically and rolls back with an inline error when the request fails", async () => {
    installApi({ runs: { summarize_ticket: BRIEF, search_resolved_tickets: SIMILAR }, reviewStatus: 503 });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: /T-101/ }));
    await user.click(await screen.findByRole("button", { name: /Mark reviewed/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not mark T-101 reviewed: Tool server unavailable");
    expect(screen.getByRole("button", { name: /Mark reviewed/ })).toBeInTheDocument(); // rolled back
  });

  it("shows 'Reviewed' with the time once the request succeeds", async () => {
    installApi({ runs: { summarize_ticket: BRIEF, search_resolved_tickets: SIMILAR } });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: /T-101/ }));
    await user.click(await screen.findByRole("button", { name: /Mark reviewed/ }));
    expect(await screen.findByText(/Reviewed/, { selector: ".reviewed-line" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Mark reviewed/ })).not.toBeInTheDocument();
  });
});
