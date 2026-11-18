import { useState, type FormEvent, type KeyboardEvent, type RefObject } from "react";
import { humanize } from "../format";
import { suggestionsFor } from "../lib/suggestions";
import { SparkleIcon } from "./Icons";

export const MAX_QUERY_CHARS = 500;
const MIN_QUERY_CHARS = 3;
const WARN_AT = 450;
const ALL = "__all__";

interface Props {
  categories: string[];
  /** The selected ticket's category: it becomes the default scope. */
  ticketCategory: string | null;
  hasTicket: boolean;
  onAsk: (query: string, scope: string | null) => void;
  onCount: (query: string) => void;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  busy?: boolean;
}

/** Pinned at the bottom of the Copilot panel. Mount it with key={ticketId} so the scope resets per ticket. */
export function AskBox({ categories, ticketCategory, hasTicket, onAsk, onCount, inputRef, busy }: Props) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<string>(ticketCategory ?? ALL);
  const [problem, setProblem] = useState<string | null>(null);
  const over = query.length > MAX_QUERY_CHARS;

  function submit(text: string) {
    const q = text.trim();
    if (q.length < MIN_QUERY_CHARS) return setProblem("Type at least 3 characters");
    if (q.length > MAX_QUERY_CHARS) return;
    setProblem(null);
    onAsk(q, scope === ALL ? null : scope);
    setQuery("");
  }
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(query);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit(query);
    }
  };

  return (
    <form className="askbox" onSubmit={onSubmit} noValidate aria-label="Ask the knowledge base">
      <label htmlFor="ask-input" className="sr-only">Ask a question</label>
      <textarea
        id="ask-input"
        ref={inputRef}
        className="ask-input"
        rows={2}
        value={query}
        placeholder={hasTicket ? "Ask about this ticket…" : "Ask the knowledge base…"}
        aria-invalid={problem || over ? true : undefined}
        aria-describedby={problem ? "ask-problem" : undefined}
        onChange={(e) => { setQuery(e.target.value); if (problem) setProblem(null); }}
        onKeyDown={onKeyDown}
      />
      {problem && <p id="ask-problem" className="inline-error" role="alert">{problem}</p>}
      <div className="ask-row">
        <label className="scope">
          Scope:
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value={ALL}>All categories</option>
            {categories.map((c) => <option key={c} value={c}>{humanize(c)}{c === ticketCategory ? " · ticket" : ""}</option>)}
          </select>
        </label>
        <span className={`ask-count num${over ? " over" : query.length >= WARN_AT ? " warn" : ""}`} aria-label={`${query.length} of ${MAX_QUERY_CHARS} characters`}>{query.length}/{MAX_QUERY_CHARS}</span>
        <button type="submit" className="btn btn-primary ask-submit" disabled={busy || over}><SparkleIcon size={14} /> Ask <kbd>⏎</kbd></button>
      </div>
      <div className="suggestions" role="group" aria-label="Suggested questions">
        {suggestionsFor(scope === ALL ? null : scope, ticketCategory).map((s) => (
          <button key={s.text} type="button" className="chip" disabled={busy} onClick={() => (s.kind === "count" ? onCount(s.text) : onAsk(s.text, scope === ALL ? null : scope))}>{s.text}</button>
        ))}
      </div>
    </form>
  );
}
