import { useState } from "react";
import type { RunState } from "../hooks/useCopilot";
import { CopyIcon, PenIcon, SparkleIcon } from "./Icons";

interface Props {
  draft: RunState;
  text: string;
  onText: (text: string) => void;
  onDraft: () => void;
  onReset: () => void;
}

/** The draft lives here, under the conversation, labelled "Draft, not sent" at all times. Notes for
 * the agent (prohibitions and other-article guidance that must not reach the customer) sit below. */
export function ReplyComposer({ draft, text, onText, onDraft, onReset }: Props) {
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const original = draft.response?.draft ?? "";
  const notes = draft.response?.sections.find((s) => s.title === "Notes for the agent")?.items ?? [];
  const loading = draft.status === "loading";

  async function copyText() {
    try {
      await navigator.clipboard.writeText(text);
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
    window.setTimeout(() => setCopy("idle"), 2000);
  }

  return (
    <section className="composer" aria-labelledby="composer-heading">
      <header className="composer-head">
        <h3 id="composer-heading" className="composer-label"><PenIcon size={14} /> Draft, not sent</h3>
        <span className="composer-hint">Copilot never contacts the customer. Edit, then copy into your support tool.</span>
        <button type="button" className="btn" onClick={onDraft} disabled={loading}>
          <SparkleIcon size={14} /> {loading ? "Drafting…" : "Draft with Copilot"}
        </button>
      </header>

      {draft.status === "error" && (
        <p className="inline-error" role="alert">
          {draft.error?.message ?? "Could not draft a reply."}
          {draft.error?.requestId && <span className="num"> Request ID: {draft.error.requestId}</span>}
        </p>
      )}

      <label htmlFor="reply-draft" className="sr-only">Reply draft</label>
      <textarea
        id="reply-draft"
        className="composer-text"
        value={text}
        rows={5}
        placeholder="Write a reply, or draft one with Copilot…"
        onChange={(e) => onText(e.target.value)}
      />
      <div className="composer-actions">
        <button type="button" className="btn" onClick={copyText} disabled={!text}><CopyIcon size={14} /> Copy</button>
        <button type="button" className="btn" onClick={onReset} disabled={text === original}>Reset</button>
        <span className="composer-status" aria-live="polite">
          {copy === "copied" ? "Copied to clipboard" : copy === "failed" ? "Copy failed: select the text and copy manually" : original && text !== original ? "Edited" : ""}
        </span>
      </div>

      {notes.length > 0 && (
        <div className="agent-notes">
          <h4>Notes for the agent</h4>
          <ul>{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </div>
      )}
    </section>
  );
}
