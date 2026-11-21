import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api } from "../api";
import type { AssistantRunRequest, AssistantRunResponse } from "../types";

export interface RunState {
  status: "idle" | "loading" | "ok" | "error";
  response?: AssistantRunResponse;
  error?: ApiError;
}

/** One question the agent asked (or one count), with the exact request so it can be retried. */
export interface AnswerEntry {
  id: number;
  kind: "ask" | "count";
  query: string;
  scope: string | null;
  request: AssistantRunRequest;
  state: RunState;
}

export interface Session {
  brief: RunState;
  similar: RunState;
  draft: RunState;
  draftText: string;
  answers: AnswerEntry[];
}

const IDLE: RunState = { status: "idle" };
const EMPTY: Session = { brief: IDLE, similar: IDLE, draft: IDLE, draftText: "", answers: [] };
const NO_TICKET = "__none__";

/** A reply draft (and the agent's edits to it) survives a page reload, per ticket, for this browser tab only.
 * sessionStorage, not localStorage: nothing outlives the tab, and storage that is blocked or full just means no restore. */
const draftKey = (tid: string) => `support-copilot:draft:${tid}`;

function loadDraft(tid: string): { response: AssistantRunResponse; text: string } | null {
  try {
    const raw = window.sessionStorage.getItem(draftKey(tid));
    if (!raw) return null;
    const saved = JSON.parse(raw) as { response?: AssistantRunResponse; text?: unknown };
    if (!saved.response || typeof saved.response.draft !== "string" || typeof saved.text !== "string") return null;
    return { response: saved.response, text: saved.text };
  } catch {
    return null;
  }
}

function saveDraft(tid: string, response: AssistantRunResponse, text: string): void {
  try {
    window.sessionStorage.setItem(draftKey(tid), JSON.stringify({ response, text }));
  } catch {
    /* private mode or quota: the draft simply is not restored after a reload */
  }
}

async function execute(body: AssistantRunRequest, signal: AbortSignal | undefined, onSettled: () => void): Promise<RunState> {
  try {
    const response = await api.runAssistant(body, signal);
    onSettled();
    return { status: "ok", response };
  } catch (err) {
    if (signal?.aborted) return IDLE; // the agent moved on: not an error, and nothing to render
    onSettled();
    return { status: "error", error: err instanceof ApiError ? err : new ApiError("Unexpected error", 0, "unknown", "server") };
  }
}

/**
 * Everything the Copilot knows, per ticket. Opening a ticket starts two parallel assistant runs
 * (summarize_ticket and search_resolved_tickets), so each open costs two entries in
 * /api/assistant/runs. Results are written under the ticket they were started for, so switching
 * tickets mid-request can never show an answer against the wrong ticket. History is client-side only.
 */
export function useCopilot(ticketId: string | null, onRunSettled: () => void = () => {}) {
  // Called after every assistant run that finishes, ok or not, so the app can re-check the tool server at once.
  const settledRef = useRef(onRunSettled);
  settledRef.current = onRunSettled;
  const settled = useCallback(() => settledRef.current(), []);
  const [sessions, setSessions] = useState<Record<string, Session>>({});
  const nextId = useRef(1);
  const started = useRef(new Set<string>());
  // In-flight auto-runs per ticket, so leaving a ticket can abort them.
  const inflight = useRef(new Map<string, Set<AbortController>>());
  const key = ticketId ?? NO_TICKET;

  const track = useCallback(<T,>(tid: string, run: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    const controller = new AbortController();
    const set = inflight.current.get(tid) ?? new Set<AbortController>();
    set.add(controller);
    inflight.current.set(tid, set);
    return run(controller.signal).finally(() => set.delete(controller));
  }, []);

  const patch = useCallback((k: string, fn: (s: Session) => Session) => {
    setSessions((prev) => ({ ...prev, [k]: fn(prev[k] ?? EMPTY) }));
  }, []);

  const runBrief = useCallback((tid: string) => {
    patch(tid, (s) => ({ ...s, brief: { status: "loading" } }));
    void track(tid, (signal) => execute({ action: "summarize_ticket", ticket_id: tid }, signal, settled)).then((r) => patch(tid, (s) => ({ ...s, brief: r })));
  }, [patch, track, settled]);

  const runSimilar = useCallback((tid: string) => {
    patch(tid, (s) => ({ ...s, similar: { status: "loading" } }));
    void track(tid, (signal) => execute({ action: "search_resolved_tickets", ticket_id: tid }, signal, settled)).then((r) => patch(tid, (s) => ({ ...s, similar: r })));
  }, [patch, track, settled]);

  useEffect(() => {
    if (ticketId && !started.current.has(ticketId)) {
      started.current.add(ticketId);
      runBrief(ticketId);
      runSimilar(ticketId);
    }
  }, [ticketId, runBrief, runSimilar]);

  // Leaving a ticket aborts its in-flight auto-runs; they start afresh if it is opened again. This keys on the
  // previous ID, not on effect cleanup, so React StrictMode's dev-only unmount/remount does not abort and double them.
  const lastTicket = useRef<string | null>(null);
  useEffect(() => {
    const previous = lastTicket.current;
    if (previous && previous !== ticketId) {
      const pending = inflight.current.get(previous);
      if (pending && pending.size > 0) {
        pending.forEach((c) => c.abort());
        started.current.delete(previous);
      }
    }
    lastTicket.current = ticketId;
  }, [ticketId]);

  const submit = useCallback((k: string, entry: Omit<AnswerEntry, "id" | "state">) => {
    const id = nextId.current++;
    patch(k, (s) => ({ ...s, answers: [{ ...entry, id, state: { status: "loading" } }, ...s.answers] }));
    void execute(entry.request, undefined, settled).then((r) =>
      patch(k, (s) => ({ ...s, answers: s.answers.map((a) => (a.id === id ? { ...a, state: r } : a)) })),
    );
  }, [patch, settled]);

  const ask = useCallback((query: string, scope: string | null) => {
    const request: AssistantRunRequest = { action: "search_knowledge", query };
    if (ticketId) request.ticket_id = ticketId;
    if (scope) request.category = scope;
    submit(key, { kind: "ask", query, scope, request });
  }, [key, ticketId, submit]);

  const count = useCallback((query: string) => {
    submit(key, { kind: "count", query, scope: null, request: { action: "count_tickets", query } });
  }, [key, submit]);

  const retryAnswer = useCallback((id: number) => {
    patch(key, (s) => ({ ...s, answers: s.answers.map((a) => (a.id === id ? { ...a, state: { status: "loading" } } : a)) }));
    const entry = (sessions[key] ?? EMPTY).answers.find((a) => a.id === id);
    if (!entry) return;
    void execute(entry.request, undefined, settled).then((r) =>
      patch(key, (s) => ({ ...s, answers: s.answers.map((a) => (a.id === id ? { ...a, state: r } : a)) })),
    );
  }, [key, patch, sessions, settled]);

  const runDraft = useCallback(() => {
    if (!ticketId) return;
    const tid = ticketId;
    patch(tid, (s) => ({ ...s, draft: { status: "loading" } }));
    void track(tid, (signal) => execute({ action: "draft_reply", ticket_id: tid }, signal, settled)).then((r) =>
      patch(tid, (s) => ({ ...s, draft: r, draftText: r.response?.draft ?? s.draftText })),
    );
  }, [ticketId, patch, track, settled]);

  // Restore a saved draft when a ticket is opened, unless this page already has one.
  useEffect(() => {
    if (!ticketId) return;
    const saved = loadDraft(ticketId);
    if (!saved) return;
    patch(ticketId, (s) => (s.draft.status === "idle" ? { ...s, draft: { status: "ok", response: saved.response }, draftText: saved.text } : s));
  }, [ticketId, patch]);

  const current = sessions[key];
  const savedResponse = current?.draft.status === "ok" ? current.draft.response : undefined;
  const savedText = current?.draftText ?? "";
  useEffect(() => {
    if (ticketId && savedResponse) saveDraft(ticketId, savedResponse, savedText);
  }, [ticketId, savedResponse, savedText]);

  const setDraftText = useCallback((text: string) => patch(key, (s) => ({ ...s, draftText: text })), [key, patch]);
  const resetDraft = useCallback(() => patch(key, (s) => ({ ...s, draftText: s.draft.response?.draft ?? "" })), [key, patch]);

  return {
    session: sessions[key] ?? EMPTY,
    ask,
    count,
    retryAnswer,
    runDraft,
    setDraftText,
    resetDraft,
    retryBrief: () => ticketId && runBrief(ticketId),
    retrySimilar: () => ticketId && runSimilar(ticketId),
  };
}
