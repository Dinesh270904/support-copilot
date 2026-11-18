"""Assistant orchestration: each action maps to a FIXED, allow-listed MCP tool plan.

Nothing in a query, ticket, or article can add, remove or reorder tool calls: the plan
is chosen from `request.action` (a validated enum) before any content is read, and
tool arguments are built from typed request fields. Retrieved text only ever flows into
the deterministic composers as data.

    summarize_ticket         get_ticket
    search_knowledge         [get_ticket] -> search_knowledge
    search_resolved_tickets  [get_ticket] -> search_resolved_tickets
    draft_reply              get_ticket -> search_knowledge
    count_tickets            count_tickets
"""

from __future__ import annotations

import logging
import time
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from app.api.mcp_gateway import McpGateway, McpToolError, McpUnavailableError
from app.api.query_parser import parse_count_filters
from app.api.schemas import (
    AssistantAction,
    AssistantRunRequest,
    AssistantRunResponse,
    RetrievalInfo,
    ToolCallTrace,
)
from app.composer.draft import compose_draft
from app.composer.knowledge import compose_knowledge_answer
from app.composer.tickets import compose_count, compose_similar_tickets, compose_ticket_summary
from app.composer.types import Composed
from app.config import Settings
from app.schemas import (
    KnowledgeSearchResult,
    ResolvedTicketSearchResult,
    TicketCountResult,
    TicketDetail,
    TicketFilters,
)

log = logging.getLogger("support_copilot.assistant")

PLANS: dict[AssistantAction, tuple[str, ...]] = {
    AssistantAction.summarize_ticket: ("get_ticket",),
    AssistantAction.search_knowledge: ("get_ticket?", "search_knowledge"),
    AssistantAction.search_resolved_tickets: ("get_ticket?", "search_resolved_tickets"),
    AssistantAction.draft_reply: ("get_ticket", "search_knowledge"),
    AssistantAction.count_tickets: ("count_tickets",),
}


class TicketNotFoundError(Exception):
    pass


@dataclass
class _Run:
    """Per-request state: records every tool call for the trace."""

    gateway: McpGateway
    trace: list[ToolCallTrace] = field(default_factory=list)

    async def call(self, tool: str, arguments: dict[str, Any]) -> dict[str, Any]:
        started = time.perf_counter()
        try:
            result = await self.gateway.call_tool(tool, arguments)
        except (McpToolError, McpUnavailableError) as exc:
            code = exc.code if isinstance(exc, McpToolError) else "unavailable"
            self.trace.append(ToolCallTrace(tool=tool, arguments=arguments, status="error", duration_ms=_ms(started), error=code))
            raise
        self.trace.append(ToolCallTrace(tool=tool, arguments=arguments, status="ok", duration_ms=_ms(started)))
        return result

    async def ticket(self, ticket_id: str) -> TicketDetail:
        try:
            return TicketDetail.model_validate(await self.call("get_ticket", {"ticket_id": ticket_id}))
        except McpToolError as exc:
            if exc.code == "not_found":
                raise TicketNotFoundError(ticket_id) from exc
            raise


def _ms(started: float) -> float:
    return round((time.perf_counter() - started) * 1000, 1)


@dataclass
class _Outcome:
    composed: Composed
    retrieval: RetrievalInfo | None = None
    draft: str | None = None
    count: TicketCountResult | None = None


Handler = Callable[[AssistantRunRequest, _Run], Awaitable[_Outcome]]


class AssistantService:
    def __init__(self, gateway: McpGateway, settings: Settings, known_categories: Callable[[], list[str]]):
        self._gateway = gateway
        self._settings = settings
        self._known_categories = known_categories
        self._handlers: dict[AssistantAction, Handler] = {
            AssistantAction.summarize_ticket: self._summarize,
            AssistantAction.search_knowledge: self._search_knowledge,
            AssistantAction.search_resolved_tickets: self._similar_tickets,
            AssistantAction.draft_reply: self._draft,
            AssistantAction.count_tickets: self._count,
        }

    async def run(self, request: AssistantRunRequest) -> tuple[AssistantRunResponse, dict[str, Any]]:
        """Returns the response and a metadata record for the run log."""
        run_id = uuid.uuid4().hex[:16]
        started = time.perf_counter()
        run = _Run(self._gateway)
        record: dict[str, Any] = {
            "run_id": run_id,
            "created_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "action": request.action.value,
            "ticket_id": request.ticket_id,
            "query_chars": len(request.query or ""),
        }
        try:
            outcome = await self._handlers[request.action](request, run)
        except Exception as exc:
            record.update(
                status="error",
                error_code=type(exc).__name__,
                tool_calls=[t.tool for t in run.trace],
                duration_ms=int(_ms(started)),
                answer_state=None,
                retrieval_method=None,
                source_ids=[],
            )
            exc.run_record = record  # type: ignore[attr-defined]  # picked up by the route for logging
            raise

        composed = outcome.composed
        response = AssistantRunResponse(
            run_id=run_id,
            action=request.action,
            ticket_id=request.ticket_id,
            answer_state=composed.answer_state,
            answer=composed.answer,
            sections=composed.sections,
            citations=composed.citations,
            draft=outcome.draft,
            count=outcome.count,
            retrieval=outcome.retrieval,
            tool_calls=[t.tool for t in run.trace],
            tool_trace=run.trace,
            limitations=composed.limitations,
            warnings=composed.warnings,
            duration_ms=_ms(started),
        )
        record.update(
            status="success",
            error_code=None,
            tool_calls=response.tool_calls,
            duration_ms=int(response.duration_ms),
            answer_state=response.answer_state,
            retrieval_method=response.retrieval.method if response.retrieval else None,
            source_ids=[c.source_id for c in response.citations],
        )
        return response, record

    # ----------------------------------------------------------------- helpers
    async def _knowledge(self, run: _Run, query: str, category: str | None, top_k: int) -> KnowledgeSearchResult:
        args: dict[str, Any] = {"query": query, "top_k": top_k}
        if category:
            args["category"] = category
        return KnowledgeSearchResult.model_validate(await run.call("search_knowledge", args))

    @staticmethod
    def _knowledge_retrieval(result: KnowledgeSearchResult) -> RetrievalInfo:
        return RetrievalInfo(
            method=result.method,
            top_k=result.top_k,
            category=result.category,
            min_score=result.min_score,
            min_term_coverage=result.min_term_coverage,
            candidates_considered=result.candidates_considered,
            best_score=result.best_score,
            results_returned=len(result.results),
            rejected_low_coverage=result.rejected_low_coverage,
            query_used=result.query,
        )

    def _compose_knowledge(self, result: KnowledgeSearchResult) -> Composed:
        return compose_knowledge_answer(
            result,
            min_sentence_score=self._settings.evidence_min_sentence_score,
            max_sentences=self._settings.evidence_max_sentences,
        )

    # ---------------------------------------------------------------- handlers
    async def _summarize(self, request: AssistantRunRequest, run: _Run) -> _Outcome:
        assert request.ticket_id
        composed = compose_ticket_summary(await run.ticket(request.ticket_id))
        if request.query:
            composed.limitations.append(
                "The summary is built from the ticket record; the free-text query does not change what is summarised."
            )
        return _Outcome(composed)

    async def _search_knowledge(self, request: AssistantRunRequest, run: _Run) -> _Outcome:
        assert request.query
        if request.ticket_id:
            await run.ticket(request.ticket_id)  # validates the ticket and records context in the trace
        result = await self._knowledge(run, request.query, request.category, request.top_k)
        return _Outcome(self._compose_knowledge(result), retrieval=self._knowledge_retrieval(result))

    async def _similar_tickets(self, request: AssistantRunRequest, run: _Run) -> _Outcome:
        query = request.query
        if request.ticket_id:
            ticket = await run.ticket(request.ticket_id)
            query = query or f"{ticket.title}. {ticket.description}"
        assert query
        args: dict[str, Any] = {"query": query, "limit": request.top_k}
        if request.category:
            args["category"] = request.category
        if request.ticket_id:
            args["exclude_ticket_id"] = request.ticket_id
        result = ResolvedTicketSearchResult.model_validate(await run.call("search_resolved_tickets", args))
        retrieval = RetrievalInfo(
            method=result.method,
            top_k=request.top_k,
            category=result.category,
            results_returned=len(result.results),
            query_used=result.query,
            fts_query=result.fts_query,
        )
        return _Outcome(compose_similar_tickets(result), retrieval=retrieval)

    async def _draft(self, request: AssistantRunRequest, run: _Run) -> _Outcome:
        assert request.ticket_id
        ticket = await run.ticket(request.ticket_id)
        # Default scope for a draft is the ticket's own category; the agent can widen it.
        category = request.category or ticket.category
        query = request.query or f"{ticket.title}. {ticket.description}"
        result = await self._knowledge(run, query, category, request.top_k)
        composed, draft = compose_draft(
            ticket,
            result,
            min_sentence_score=self._settings.evidence_min_sentence_score,
            max_sentences=self._settings.evidence_max_sentences,
        )
        return _Outcome(composed, retrieval=self._knowledge_retrieval(result), draft=draft)

    async def _count(self, request: AssistantRunRequest, run: _Run) -> _Outcome:
        notes: list[str] = []
        filters = TicketFilters()
        if request.query:
            filters, notes = parse_count_filters(request.query, self._known_categories())
        if request.filters:
            explicit = request.filters.model_dump(exclude_none=True)
            filters = filters.model_copy(update=explicit)
            if explicit:
                notes.append("explicit filters applied: " + ", ".join(f"{k}={v}" for k, v in explicit.items()))
        result = TicketCountResult.model_validate(
            await run.call("count_tickets", {"filters": filters.model_dump(exclude_none=True)})
        )
        return _Outcome(compose_count(result, notes), count=result)
