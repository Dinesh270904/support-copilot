from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

AnswerState = Literal["answered", "insufficient_evidence", "no_results"]
CitationUsage = Literal["evidence", "coverage_gap", "retrieved_unused", "similar_ticket", "ticket_record"]


class Citation(BaseModel):
    source_id: str = Field(description="Stable ID: chunk ID (KB-03#chunk-1) or ticket ID (T-105)")
    source_type: Literal["knowledge_chunk", "ticket"]
    title: str
    excerpt: str
    score: float | None = None
    score_type: Literal["cosine", "bm25"] | None = None
    article_id: str | None = None
    ticket_id: str | None = None
    matched_terms: list[str] = Field(
        default_factory=list, description="Words that matched the query (from the chunk text, or from the ticket)"
    )
    matched_identifiers: list[str] = Field(
        default_factory=list, description="Error codes from the question found verbatim in this source"
    )
    usage: CitationUsage = Field(
        description="evidence: quoted in the answer; coverage_gap: the source states the topic is not covered; "
        "retrieved_unused: passed the threshold but no sentence was selected; similar_ticket / ticket_record."
    )


class Section(BaseModel):
    title: str
    items: list[str]


class Quote(BaseModel):
    source_id: str
    text: str


class Composed(BaseModel):
    answer_state: AnswerState
    answer: str
    citations: list[Citation] = Field(default_factory=list)
    sections: list[Section] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    evidence: list[Quote] = Field(default_factory=list, description="Verbatim sentences used, in answer order")
