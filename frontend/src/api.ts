import type {
  ApiErrorBody,
  Health,
  AssistantRunRequest,
  AssistantRunResponse,
  Meta,
  TicketDetail,
  TicketFilters,
  TicketListResponse,
} from "./types";

export type ErrorKind = "validation" | "not_found" | "unavailable" | "server" | "network";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly kind: ErrorKind,
    readonly requestId?: string,
  ) {
    super(message);
  }
}

function kindFor(status: number): ErrorKind {
  if (status === 422 || status === 400) return "validation";
  if (status === 404) return "not_found";
  if (status === 502 || status === 503 || status === 504) return "unavailable";
  return "server";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError("Cannot reach the Support Copilot API. Is the backend running?", 0, "network_error", "network");
  }
  if (!response.ok) {
    let body: ApiErrorBody | undefined;
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      /* non-JSON error (e.g. proxy failure) */
    }
    const message = body?.error?.message ?? `Request failed (${response.status})`;
    throw new ApiError(message, response.status, body?.error?.code ?? "http_error", kindFor(response.status), body?.error?.request_id);
  }
  return (await response.json()) as T;
}

export const api = {
  health: () => request<Health>("/health"),
  meta: () => request<Meta>("/api/meta"),
  listTickets: (filters: TicketFilters, signal?: AbortSignal) => {
    const params = new URLSearchParams({ limit: "100" });
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    return request<TicketListResponse>(`/api/tickets?${params}`, { signal });
  },
  getTicket: (id: string, signal?: AbortSignal) =>
    request<TicketDetail>(`/api/tickets/${encodeURIComponent(id)}`, { signal }),
  markReviewed: (id: string) =>
    request<TicketDetail>(`/api/tickets/${encodeURIComponent(id)}/reviewed`, { method: "PATCH" }),
  runAssistant: (body: AssistantRunRequest, signal?: AbortSignal) =>
    request<AssistantRunResponse>("/api/assistant/run", { method: "POST", body: JSON.stringify(body), signal }),
};
