import { useState, type FormEvent, type KeyboardEvent, type RefObject } from "react";
import { humanize } from "../format";
import { suggestionsFor } from "../lib/suggestions";
import { SparkleIcon } from "./Icons";

export const MAX_QUERY_CHARS = 500;
const MIN_QUERY_CHARS = 3;
const ALL = "__all__";

interface Props {
  categories: string[];
  /** The selected ticket's category: it becomes the default scope. */
  ticketCategory: string | null;
  onAsk: (query: string, scope: string | null) => void;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  busy?: boolean;
}

/** Pinned at the bottom of the Copilot panel. Mount it with key={ticketId} so the scope resets per ticket. */
export function AskBox({ categories, ticketCategory, onAsk, inputRef, busy }: Props) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<string>(ticketCategory ?? ALL);
  const [problem, setProblem] = useState<string | null>(null);

  function submit(text: string) {
    const q = text.trim();
    if (q.length < MIN_QUERY_CHARS) return setProblem(q ? `Question must be at least ${MIN_QUERY_CHARS} characters.` : "Enter a question to search for.");
    if (q.length > MAX_QUERY_CHARS) return setProblem(`Question must be at most ${MAX_QUERY_CHARS} characters.`);
    setProblem(null);
    onAsk(q, scope === ALL ? null : scope);
    setQuery("");
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    submit(query);
  }
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit(query);
    }
  }

  return (
    <form className="askbox" onSubmit={onSubmit} noValidate aria-label="Ask the knowledge base">
      <div className="suggestions" role="group" aria-label="Suggested questions">
        {suggestionsFor(scope === ALL ? ticketCategory : scope).map((s) => (
          <button key={s} type="button" className="chip" onClick={() => submit(s)} disabled={busy}>{s}</button>
        ))}
      </div>
      <label htmlFor="ask-input" className="sr-only">Ask a question</label>
      <textarea
        id="ask-input"
        ref={inputRef}
        className="ask-input"
        rows={2}
        value={query}
        placeholder="Ask the knowledge base…"
        aria-invalid={problem ? true : undefined}
        aria-describedby={problem ? "ask-problem" : undefined}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
      />
      {problem && <p id="ask-problem" className="inline-error" role="alert">{problem}</p>}
      <div className="ask-row">
        <label className="scope">
          Scope
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value={ALL}>All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{humanize(c)}{c === ticketCategory ? " (ticket)" : ""}</option>
            ))}
          </select>
        </label>
        {query.length > MAX_QUERY_CHARS - 100 && <span className={`ask-count num${query.length > MAX_QUERY_CHARS ? " over" : ""}`}>{query.length}/{MAX_QUERY_CHARS}</span>}
        <button type="submit" className="btn btn-primary ask-submit" disabled={busy}><SparkleIcon size={14} /> Ask</button>
      </div>
    </form>
  );
}
