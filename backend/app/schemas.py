"""Domain contracts shared by the MCP server (tool outputs) and the FastAPI service.

The MCP tools declare these as return types, so their JSON Schemas are published as
MCP `outputSchema`s and results arrive as `structured_content` on the client side.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.validation import CATEGORY_PATTERN

Status = Literal["open", "resolved"]
Priority = Literal["low", "medium", "high"]


class TicketFilters(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Status | None = None
    priority: Priority | None = None
    category: str | None = Field(default=None, pattern=CATEGORY_PATTERN)


class Message(BaseModel):
    position: int
    author: Literal["customer", "agent"]
    text: str
    at: str


class TicketListItem(BaseModel):
    id: str
    title: str
    category: str
    priority: Priority
    status: Status
    product_area: str
    created_at: str
    updated_at: str
    reviewed_at: str | None


class TicketDetail(TicketListItem):
    description: str
    resolution_summary: str | None
    messages: list[Message]


class ArticleDetail(BaseModel):
    id: str
    title: str
    category: str
    tags: list[str]
    applies_to: str
    updated_at: str
    body: str
    chunk_ids: list[str]


class EvidenceSentence(BaseModel):
    position: int = Field(description="1-based sentence position within the chunk")
    text: str
    score: float = Field(description="Cosine similarity of this sentence to the query (same TF-IDF space)")


class KnowledgeHit(BaseModel):
    chunk_id: str
    article_id: str
    title: str
    category: str
    excerpt: str = Field(description="Exact chunk text, used verbatim for citations")
    score: float = Field(description="Cosine similarity of the chunk to the query")
    matched_terms: list[str] = Field(description="Query terms (unigrams) present in the chunk's indexed text")
    matched_identifiers: list[str] = Field(
        default_factory=list,
        description="UPPER_SNAKE error codes from the query found verbatim in the chunk text. A hit with one "
        "is accepted even below the score floor.",
    )
    sentences: list[EvidenceSentence]


class KnowledgeSearchResult(BaseModel):
    method: Literal["tfidf_cosine"] = "tfidf_cosine"
    query: str
    category: str | None
    top_k: int
    min_score: float
    min_term_coverage: float = Field(description="Required share of query terms present (or >=2 terms)")
    candidates_considered: int = Field(description="Chunks in scope after the category filter")
    query_terms_in_vocabulary: int = Field(description="Query n-grams that exist in the index vocabulary")
    best_score: float = Field(description="Highest score in scope, including candidates below the threshold")
    rejected_low_coverage: list[str] = Field(
        default_factory=list, description="Chunk IDs above min_score but rejected by the term-coverage gate"
    )
    results: list[KnowledgeHit] = Field(description="Chunks at or above min_score, best first, at most top_k")


class ResolvedTicketHit(BaseModel):
    ticket_id: str
    title: str
    category: str
    resolution_summary: str | None
    snippet: str
    matched_terms: list[str] = Field(
        default_factory=list, description="Words from the ticket that matched the query (lower-case, distinct)"
    )
    score: float = Field(description="Negated SQLite FTS5 bm25 rank; higher is better, not normalised")


class ResolvedTicketSearchResult(BaseModel):
    method: Literal["sqlite_fts5_bm25"] = "sqlite_fts5_bm25"
    query: str
    fts_query: str = Field(description="Sanitised FTS5 expression actually executed")
    category: str | None
    results: list[ResolvedTicketHit]


class TicketCountResult(BaseModel):
    count: int
    ticket_ids: list[str] = Field(description="Matching ticket IDs (capped at 100)")
    filters: TicketFilters
