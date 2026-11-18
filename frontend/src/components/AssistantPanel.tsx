import { useState, type FormEvent } from "react";
import { ApiError, api } from "../api";
import { humanize } from "../format";
import type { Action, AssistantRunRequest, AssistantRunResponse, Meta, TicketDetail, TicketFilters } from "../types";
import { AssistantResult } from "./AssistantResult";
import { FileTextIcon, HashIcon, LayersIcon, PenIcon, SearchIcon, SparkleIcon } from "./Icons";

const ACTION_ICONS = { summarize_ticket: FileTextIcon, search_knowledge: SearchIcon, search_resolved_tickets: LayersIcon, draft_reply: PenIcon, count_tickets: HashIcon };

export const MAX_QUERY_CHARS = 500;
const MIN_QUERY_CHARS = 3;
const ALL = "__all__";

interface ActionConfig {
  label: string;
  needsTicket: boolean;
  query: "required" | "optional" | "none";
  scope: boolean;
  placeholder: string;
  example: string;
  help: string;
  cta: string;
}

const ACTIONS: Record<Action, ActionConfig> = {
  summarize_ticket: {
    label: "Summarize",
    cta: "Summarize ticket",
    needsTicket: true,
    query: "none",
    scope: false,
    placeholder: "",
    example: "",
    help: "Summarizes the selected ticket and lists the facts still needed.",
  },
  search_knowledge: {
    label: "Search knowledge",
    cta: "Search articles",
    needsTicket: false,
    query: "required",
    scope: true,
    placeholder: "e.g. lost authenticator after replacing phone; backup code",
    example: "Find the internal steps for resolving this error",
    help: "Retrieves knowledge-article chunks (TF-IDF) and quotes the supporting sentences with citations.",
  },
  search_resolved_tickets: {
    label: "Similar tickets",
    cta: "Find similar tickets",
    needsTicket: false,
    query: "optional",
    scope: true,
    placeholder: "Leave empty to use the selected ticket's title and description",
    example: "",
    help: "Finds similar resolved tickets (SQLite FTS5) and shows what fixed them.",
  },
  draft_reply: {
    label: "Draft reply",
    cta: "Draft reply",
    needsTicket: true,
    query: "optional",
    scope: true,
    placeholder: "Optional: focus the guidance search (defaults to the ticket text)",
    example: "",
    help: "Prepares an editable draft grounded in retrieved guidance. Nothing is sent.",
  },
  count_tickets: {
    label: "Count tickets",
    cta: "Count tickets",
    needsTicket: false,
    query: "optional",
    scope: false,
    placeholder: "e.g. How many open high-priority tickets mention checkout?",
    example: "How many open high-priority tickets mention checkout failures?",
    help: "Counts tickets by status, priority and category. Filters can be read from your question.",
  },
};

interface Props {
  ticket: TicketDetail | null;
  meta: Meta | null;
  onOpenTicket: (id: string) => void;
}

export function AssistantPanel({ ticket, meta, onOpenTicket }: Props) {
  const [action, setAction] = useState<Action>(ticket ? "summarize_ticket" : "search_knowledge");
  const [query, setQuery] = useState("");
  // Scope defaults to the ticket's category when a ticket is selected; ALL searches everything.
  const [scope, setScope] = useState<string>(ticket?.category ?? ALL);
  const [countFilters, setCountFilters] = useState<TicketFilters>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AssistantRunResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);

  const config = ACTIONS[action];
  const trimmed = query.trim();

  function validate(): string | null {
    if (config.needsTicket && !ticket) return "Select a ticket first.";
    if (config.query === "required" && !trimmed) return "Enter a question to search for.";
    if (action === "search_resolved_tickets" && !trimmed && !ticket) return "Enter a query or select a ticket.";
    if (trimmed && trimmed.length < MIN_QUERY_CHARS) return `Query must be at least ${MIN_QUERY_CHARS} characters.`;
    if (query.length > MAX_QUERY_CHARS) return `Query must be at most ${MAX_QUERY_CHARS} characters.`;
    return null;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const problem = validate();
    setClientError(problem);
    if (problem) return;

    const body: AssistantRunRequest = { action };
    if (ticket && action !== "count_tickets") body.ticket_id = ticket.id;
    if (trimmed && config.query !== "none") body.query = trimmed;
    if (config.scope && scope !== ALL) body.category = scope;
    if (action === "count_tickets" && Object.values(countFilters).some(Boolean)) body.filters = countFilters;

    setLoading(true);
    setError(null);
    try {
      setResult(await api.runAssistant(body));
    } catch (err) {
      setResult(null);
      setError(err instanceof ApiError ? err : new ApiError("Unexpected error", 0, "unknown", "server"));
    } finally {
      setLoading(false);
    }
  }

  function chooseAction(next: Action) {
    setAction(next);
    setClientError(null);
    setError(null);
    setResult(null);
  }

  return (
    <section className="panel assistant" aria-labelledby="assistant-heading">
      <header className="panel-header">
        <h2 id="assistant-heading"><span className="assistant-mark"><SparkleIcon size={15} /></span> Assistant</h2>
        <span className="count">{ticket ? `Working on ${ticket.id}` : "No ticket selected"}</span>
      </header>

      <div className="action-tabs" role="tablist" aria-label="Assistant actions">
        {(Object.keys(ACTIONS) as Action[]).map((a) => (
          <button
            key={a}
            type="button"
            role="tab"
            aria-selected={a === action}
            className={a === action ? "active" : ""}
            onClick={() => chooseAction(a)}
          >
            {(() => { const I = ACTION_ICONS[a]; return <I size={14} />; })()}
            {ACTIONS[a].label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="assistant-form" noValidate>
        <p className="muted small">{config.help}</p>

        {config.query !== "none" && (
          <div className="field">
            <label htmlFor="assistant-query">
              {config.query === "required" ? "Question" : "Question (optional)"}
            </label>
            <textarea
              id="assistant-query"
              value={query}
              placeholder={config.placeholder}
              rows={3}
              onChange={(e) => setQuery(e.target.value)}
              aria-invalid={query.length > MAX_QUERY_CHARS}
            />
            <div className="field-foot">
              {config.example ? (
                <button type="button" className="link small" onClick={() => setQuery(config.example)}>
                  Try: “{config.example}”
                </button>
              ) : <span />}
              <span className={`small ${query.length > MAX_QUERY_CHARS ? "error-text" : "muted"}`}>
                {query.length}/{MAX_QUERY_CHARS}
              </span>
            </div>
          </div>
        )}

        {config.scope && (
          <div className="field inline">
            <label htmlFor="assistant-scope">Scope</label>
            <select id="assistant-scope" value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value={ALL}>All categories</option>
              {meta?.categories.map((c) => (
                <option key={c} value={c}>
                  {humanize(c)}{ticket?.category === c ? " (ticket)" : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        {action === "count_tickets" && (
          <div className="filters" role="group" aria-label="Count filters (override the question)">
            {(["status", "priority", "category"] as const).map((key) => {
              const options = key === "status" ? meta?.statuses : key === "priority" ? meta?.priorities : meta?.categories;
              return (
                <label key={key}>
                  {humanize(key)}
                  <select
                    value={countFilters[key] ?? ""}
                    onChange={(e) => setCountFilters({ ...countFilters, [key]: e.target.value || undefined })}
                  >
                    <option value="">From question / any</option>
                    {options?.map((o) => <option key={o} value={o}>{humanize(o)}</option>)}
                  </select>
                </label>
              );
            })}
          </div>
        )}

        {clientError && <p className="error-text" role="alert">{clientError}</p>}

        <button type="submit" className="primary" disabled={loading}>
          {loading ? <span className="spinner" aria-hidden="true" /> : <SparkleIcon size={15} />}
          {loading ? "Working…" : config.cta}
        </button>
      </form>

      {loading && (
        <div className="state state-loading" role="status">
          <span className="spinner" aria-hidden="true" /> Calling tools on the MCP server…
        </div>
      )}

      {error && (
        <div className={`state state-error kind-${error.kind}`} role="alert">
          <strong>
            {error.kind === "validation"
              ? "Request rejected"
              : error.kind === "unavailable"
                ? "Assistant service unavailable"
                : error.kind === "not_found"
                  ? "Not found"
                  : error.kind === "network"
                    ? "API unreachable"
                    : "Something went wrong"}
          </strong>
          <p>{error.message}</p>
          {error.requestId && <p className="muted small">Request ID: {error.requestId}</p>}
        </div>
      )}

      {result && !loading && <AssistantResult result={result} onOpenTicket={onOpenTicket} />}
    </section>
  );
}
