// Mirrors the FastAPI Pydantic contracts (see /docs on the API).

export type Status = "open" | "resolved";
export type Priority = "low" | "medium" | "high";
export type Action =
  | "summarize_ticket"
  | "search_knowledge"
  | "search_resolved_tickets"
  | "draft_reply"
  | "count_tickets";
export type AnswerState = "answered" | "insufficient_evidence" | "no_results";

export interface TicketListItem {
  id: string;
  title: string;
  category: string;
  priority: Priority;
  status: Status;
  product_area: string;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
}

export interface Message {
  position: number;
  author: "customer" | "agent";
  text: string;
  at: string;
}

export interface TicketDetail extends TicketListItem {
  description: string;
  resolution_summary: string | null;
  messages: Message[];
}

export interface TicketListResponse {
  items: TicketListItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface Meta {
  statuses: Status[];
  priorities: Priority[];
  categories: string[];
  actions: Action[];
}

export interface TicketFilters {
  status?: Status;
  priority?: Priority;
  category?: string;
}

export interface Citation {
  source_id: string;
  source_type: "knowledge_chunk" | "ticket";
  title: string;
  excerpt: string;
  score: number | null;
  score_type: "cosine" | "bm25" | null;
  article_id: string | null;
  ticket_id: string | null;
  /** Words (as written in the source) that matched the query; present on article and ticket sources. */
  matched_terms: string[];
  /** Error codes from the question found verbatim in the source (articles only). */
  matched_identifiers: string[];
  usage: "evidence" | "coverage_gap" | "retrieved_unused" | "similar_ticket" | "ticket_record";
}

export interface Section {
  title: string;
  items: string[];
}

export interface ToolCallTrace {
  tool: string;
  arguments: Record<string, unknown>;
  status: "ok" | "error";
  duration_ms: number;
  error: string | null;
}

export interface RetrievalInfo {
  method: "tfidf_cosine" | "sqlite_fts5_bm25";
  top_k: number;
  category: string | null;
  min_score: number | null;
  min_term_coverage: number | null;
  candidates_considered: number | null;
  best_score: number | null;
  results_returned: number;
  rejected_low_coverage: string[];
  query_used: string;
  fts_query: string | null;
}

export interface CountResult {
  count: number;
  ticket_ids: string[];
  filters: TicketFilters;
}

export interface AssistantRunRequest {
  action: Action;
  ticket_id?: string;
  query?: string;
  category?: string;
  top_k?: number;
  filters?: TicketFilters;
}

export interface AssistantRunResponse {
  run_id: string;
  action: Action;
  ticket_id: string | null;
  answer_state: AnswerState;
  answer: string;
  sections: Section[];
  citations: Citation[];
  draft: string | null;
  count: CountResult | null;
  retrieval: RetrievalInfo | null;
  tool_calls: string[];
  tool_trace: ToolCallTrace[];
  limitations: string[];
  warnings: string[];
  duration_ms: number;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: { field: string | null; message: string }[]; request_id?: string };
}

export interface Health {
  status: "ok" | "degraded";
  database: "ok" | "error";
  mcp: { connected: boolean; tools: string[]; last_error: string | null; index: Record<string, unknown> | null; server?: { name: string; protocol_version?: string } };
}
