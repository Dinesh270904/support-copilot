"""REST contracts (Pydantic). These generate the OpenAPI docs at /docs."""

from __future__ import annotations

from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.composer.types import AnswerState, Citation, Section
from app.schemas import TicketCountResult, TicketDetail, TicketFilters, TicketListItem
from app.validation import CATEGORY_PATTERN, TICKET_ID_PATTERN

MAX_QUERY_CHARS = 500
MIN_QUERY_CHARS = 3


class AssistantAction(str, Enum):
    summarize_ticket = "summarize_ticket"
    search_knowledge = "search_knowledge"
    search_resolved_tickets = "search_resolved_tickets"
    draft_reply = "draft_reply"
    count_tickets = "count_tickets"


class AssistantRunRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "examples": [
                {
                    "ticket_id": "T-104",
                    "action": "search_knowledge",
                    "query": "lost authenticator after replacing phone; backup code and enroll a new device",
                    "category": "account_access",
                }
            ]
        },
    )

    action: AssistantAction
    ticket_id: str | None = Field(default=None, pattern=TICKET_ID_PATTERN)
    query: str | None = Field(default=None, max_length=MAX_QUERY_CHARS)
    category: str | None = Field(
        default=None, pattern=CATEGORY_PATTERN, description="Retrieval scope. Omit to search all categories."
    )
    top_k: int = Field(default=3, ge=1, le=10)
    filters: TicketFilters | None = Field(default=None, description="count_tickets only; overrides parsed filters")

    @field_validator("query")
    @classmethod
    def _normalise_query(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = " ".join(value.split())
        return value or None

    @model_validator(mode="after")
    def _check_action_requirements(self) -> AssistantRunRequest:
        needs_ticket = {AssistantAction.summarize_ticket, AssistantAction.draft_reply}
        if self.action in needs_ticket and not self.ticket_id:
            raise ValueError(f"ticket_id is required for action '{self.action.value}'")
        if self.action is AssistantAction.search_knowledge and not self.query:
            raise ValueError("query is required for action 'search_knowledge'")
        if self.action is AssistantAction.search_resolved_tickets and not (self.query or self.ticket_id):
            raise ValueError("query or ticket_id is required for action 'search_resolved_tickets'")
        if self.query and len(self.query) < MIN_QUERY_CHARS:
            raise ValueError(f"query must be at least {MIN_QUERY_CHARS} characters")
        if self.filters is not None and self.action is not AssistantAction.count_tickets:
            raise ValueError("filters are only accepted for action 'count_tickets'")
        return self


class ToolCallTrace(BaseModel):
    tool: str
    arguments: dict[str, Any]
    status: Literal["ok", "error"]
    duration_ms: float
    error: str | None = None


class RetrievalInfo(BaseModel):
    method: Literal["tfidf_cosine", "sqlite_fts5_bm25"]
    top_k: int
    category: str | None
    min_score: float | None = None
    min_term_coverage: float | None = None
    candidates_considered: int | None = None
    best_score: float | None = None
    results_returned: int
    rejected_low_coverage: list[str] = Field(default_factory=list)
    query_used: str
    fts_query: str | None = None


class AssistantRunResponse(BaseModel):
    run_id: str
    action: AssistantAction
    ticket_id: str | None
    answer_state: AnswerState
    answer: str
    sections: list[Section] = Field(default_factory=list)
    citations: list[Citation] = Field(default_factory=list)
    draft: str | None = Field(default=None, description="Editable draft reply. Never sent by the system.")
    count: TicketCountResult | None = None
    retrieval: RetrievalInfo | None = None
    tool_calls: list[str]
    tool_trace: list[ToolCallTrace]
    limitations: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    duration_ms: float


class TicketListResponse(BaseModel):
    items: list[TicketListItem]
    total: int
    limit: int
    offset: int


class TicketResponse(TicketDetail):
    pass


class MetaResponse(BaseModel):
    statuses: list[str]
    priorities: list[str]
    categories: list[str]
    actions: list[str]


class McpHealth(BaseModel):
    connected: bool
    tools: list[str]
    resource_templates: list[str]
    server: dict[str, str]
    last_error: str | None
    index: dict[str, Any] | None = None


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    database: Literal["ok", "error"]
    mcp: McpHealth


class AssistantRunRecord(BaseModel):
    run_id: str
    created_at: str
    action: str
    ticket_id: str | None
    status: str
    answer_state: str | None
    tool_calls: list[str]
    retrieval_method: str | None
    source_ids: list[str]
    query_chars: int
    duration_ms: int
    error_code: str | None


class ErrorBody(BaseModel):
    code: str
    message: str
    details: list[dict[str, Any]] | None = None
    request_id: str | None = None


class ErrorResponse(BaseModel):
    error: ErrorBody
