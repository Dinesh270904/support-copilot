import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RunState } from "../hooks/useCopilot";
import { CardSkeleton, ErrorNote } from "./ErrorNote";
import { CopyIcon, PenIcon, ResetIcon, SparkleIcon } from "./Icons";

interface Props {
  draft: RunState;
  text: string;
  onText: (text: string) => void;
  onDraft: () => void;
  onReset: () => void;
}

/** Idle: just the Draft button and a promise that nothing is sent. Ready: the draft with a violet
 * "Draft · not sent" label that stays visible while editing, Copy/Reset, and collapsible notes for the agent. */
export function ReplyComposer({ draft, text, onText, onDraft, onReset }: Props) {
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const [notesOpen, setNotesOpen] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const response = draft.response;
  const original = response?.draft ?? "";
  const loading = draft.status === "loading";
  const ready = draft.status === "ok" && response !== undefined;
  const holding = ready && response.answer_state === "insufficient_evidence";
  const notes = [...(response?.sections.find((s) => s.title === "Notes for the agent")?.items ?? []), ...(response?.limitations ?? [])];
  const runId = response?.run_id;

  // The draft just arrived: put the cursor in it.
  useEffect(() => {
    if (runId) box.current?.focus();
  }, [runId]);

  // Grow with the text up to 50vh, then scroll.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || !el.scrollHeight) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, window.innerHeight * 0.5)}px`;
  }, [text, ready]);

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
    <section className={`composer${ready ? " composer-ready" : ""}`} aria-labelledby="composer-heading">
      <header className="composer-head">
        {ready ? (
          <h3 id="composer-heading" className="composer-label"><PenIcon size={14} /> Draft · not sent</h3>
        ) : (
          <h3 id="composer-heading" className="composer-title">Reply</h3>
        )}
        <span className="composer-hint">{ready ? "Copilot never contacts the customer. Edit, then copy into your support tool." : "Copilot drafts from documented guidance. Nothing is sent."}</span>
        <button type="button" className="btn" onClick={onDraft} disabled={loading} title="Draft with Copilot · D">
          {loading ? <span className="spinner" aria-hidden="true" /> : <SparkleIcon size={14} />}
          {loading ? "Drafting…" : ready ? "Draft again" : "Draft with Copilot"} {!loading && <kbd>D</kbd>}
        </button>
      </header>

      {loading && <CardSkeleton lines={3} />}
      {draft.status === "error" && draft.error && <ErrorNote error={draft.error} onRetry={onDraft} />}

      {ready && (
        <>
          {holding && <p className="strip strip-warn">No documented guidance found, so this is a holding reply. Don't promise specifics.</p>}
          <label htmlFor="reply-draft" className="sr-only">Reply draft</label>
          <textarea id="reply-draft" ref={box} className="composer-text" value={text} rows={6} onChange={(e) => onText(e.target.value)} />
          <div className="composer-actions">
            <button type="button" className="btn" onClick={copyText} disabled={!text}><CopyIcon size={14} /> Copy draft</button>
            <button type="button" className="btn" onClick={onReset} disabled={text === original}><ResetIcon size={14} /> Reset</button>
            <span className="composer-status" aria-live="polite">
              {copy === "copied" ? "Copied" : copy === "failed" ? "Copy failed. Select the text and press ⌘C." : text !== original ? <>Edited · <span className="num">{text.length}</span> characters</> : ""}
            </span>
          </div>
          {notes.length > 0 && (
            <div className="agent-notes">
              <button type="button" className="notes-toggle" aria-expanded={notesOpen} onClick={() => setNotesOpen((o) => !o)}>
                Notes for the agent <span className="num">({notes.length})</span> <span aria-hidden="true">{notesOpen ? "▴" : "▾"}</span>
              </button>
              {notesOpen && <ul>{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
            </div>
          )}
        </>
      )}
    </section>
  );
}
