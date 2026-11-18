import { useState } from "react";
import { CopyIcon, PenIcon } from "./Icons";

/** Approximate wrapped line count so the whole draft is visible without inner scrolling. */
function visualRows(text: string): number {
  const rows = text.split("\n").reduce((n, line) => n + Math.max(1, Math.ceil(line.length / 62)), 0);
  return Math.min(Math.max(rows + 1, 8), 40);
}

export function DraftEditor({ initialDraft }: { initialDraft: string }) {
  const [text, setText] = useState(initialDraft);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    window.setTimeout(() => setCopyState("idle"), 2000);
  }

  return (
    <div className="draft">
      <div className="draft-label" role="note">
        <span className="draft-pill"><PenIcon size={12} /> Draft</span>
        <strong>Draft, not sent.</strong> Edit it here, then copy it into your support tool. Support Copilot never contacts the customer.
      </div>
      <label htmlFor="draft-text" className="sr-only">Draft reply</label>
      <textarea id="draft-text" value={text} onChange={(e) => setText(e.target.value)} rows={visualRows(text)} />
      <div className="draft-actions">
        <button type="button" className="primary" onClick={copy}><CopyIcon size={14} />Copy draft</button>
        <button type="button" onClick={() => setText(initialDraft)} disabled={text === initialDraft}>
          Reset
        </button>
        <span className="muted small" aria-live="polite">
          {copyState === "copied" ? "Copied to clipboard" : copyState === "failed" ? "Copy failed — select the text and copy manually" : text !== initialDraft ? "Edited" : ""}
        </span>
      </div>
    </div>
  );
}
