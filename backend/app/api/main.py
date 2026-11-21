"""FastAPI service: REST API for the UI, MCP client host, and the only writer to SQLite.

    uvicorn app.api.main:app --port 8000      # OpenAPI docs at /docs
"""

from __future__ import annotations

import json
import logging
import os
import sys
import uuid
from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Annotated

from fastapi import Depends, FastAPI, Path, Query, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from mcp import StdioServerParameters
from sqlalchemy import delete, desc, literal_column, select, text
from starlette.exceptions import HTTPException as StarletteHTTPException
from sqlalchemy.orm import Session, sessionmaker

from app import repository
from app.api.assistant import AssistantService, TicketNotFoundError
from app.api.mcp_gateway import McpGateway, McpTimeoutError, McpToolError, McpUnavailableError
from app.api.schemas import (
    AssistantAction,
    AssistantRunRecord,
    AssistantRunRequest,
    AssistantRunResponse,
    ErrorResponse,
    HealthResponse,
    McpHealth,
    MetaResponse,
    TicketListResponse,
    TicketResponse,
)
from app.config import BACKEND_DIR, Settings, get_settings
from app.db import make_engine, make_sessionmaker
from app.logging_config import configure_logging
from app.models import TICKET_PRIORITIES, TICKET_STATUSES, AssistantRun
from app.schemas import Priority, Status, TicketFilters
from app.validation import TICKET_ID_PATTERN

log = logging.getLogger("support_copilot.api")

TicketIdPath = Annotated[str, Path(pattern=TICKET_ID_PATTERN, description="Ticket ID, e.g. T-104")]


class AppError(Exception):
    def __init__(self, status_code: int, code: str, message: str):
        super().__init__(message)
        self.status_code, self.code, self.message = status_code, code, message


DB_NOT_INITIALIZED = "Database not initialized. Run make setup first."


def _sessions_of(app: FastAPI) -> sessionmaker[Session]:
    """The API never creates the database file: without one, data routes answer 503 instead."""
    if app.state.sessions is None:
        raise AppError(503, "database_not_initialized", DB_NOT_INITIALIZED)
    return app.state.sessions


def get_session(request: Request) -> Iterator[Session]:
    session: Session = _sessions_of(request.app)()
    try:
        yield session
    finally:
        session.close()


SessionDep = Annotated[Session, Depends(get_session)]


def mcp_server_params(settings: Settings) -> StdioServerParameters:
    """The API launches the MCP server as `python -m app.mcp_server` with the same DB."""
    # Forward every SUPPORT_COPILOT_* variable so the child is configured like the API, then let the
    # API's resolved settings win for the values it owns (a stale env var must not point the MCP
    # server at a different database than the API uses).
    env = {k: v for k, v in os.environ.items() if k.startswith("SUPPORT_COPILOT_")}
    env.update(
        {
            "SUPPORT_COPILOT_DB": str(settings.db_path),
            "SUPPORT_COPILOT_LOG_LEVEL": settings.log_level,
            "SUPPORT_COPILOT_RAG_MIN_SCORE": str(settings.rag_min_score),
            "SUPPORT_COPILOT_RAG_MIN_TERM_COVERAGE": str(settings.rag_min_term_coverage),
            "SUPPORT_COPILOT_RAG_TOP_K": str(settings.rag_default_top_k),
            "PYTHONUNBUFFERED": "1",
        }
    )
    return StdioServerParameters(command=sys.executable, args=["-m", "app.mcp_server"], cwd=str(BACKEND_DIR), env=env)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        db_ready = settings.db_path.exists()
        engine = make_engine(settings.db_path) if db_ready else None  # make_engine would create the file
        app.state.sessions = make_sessionmaker(engine) if engine else None
        gateway = McpGateway(
            mcp_server_params(settings),
            startup_timeout_s=settings.mcp_startup_timeout_s,
            call_timeout_s=settings.mcp_call_timeout_s,
        )
        app.state.gateway = gateway
        app.state.index_status = None
        if not db_ready:
            log.error("Database missing; run `make setup` first", extra={"fields": {"db": settings.db_path.name}})
            gateway.last_error = DB_NOT_INITIALIZED
        else:
            try:
                await gateway.start()
                app.state.index_status = json.loads(await gateway.read_resource("support://index/status"))
            except (McpUnavailableError, McpToolError):
                log.error("MCP server failed to start; assistant actions will return 503 until it recovers")

        def known_categories() -> list[str]:
            with _sessions_of(app)() as session:
                return repository.known_categories(session)

        app.state.assistant = AssistantService(gateway, settings, known_categories)
        yield
        await gateway.stop()
        if engine:
            engine.dispose()

    app = FastAPI(
        title="Support Copilot API",
        version="1.0.0",
        description="Evidence-grounded support copilot. Assistant actions run through a local MCP server; "
        "no LLM, no network calls. Nothing is ever sent to a customer.",
        lifespan=lifespan,
        responses={422: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
    )
    # ------------------------------------------------------------- errors
    def _error(status: int, code: str, message: str, request: Request, details=None) -> JSONResponse:
        body = {"error": {"code": code, "message": message, "request_id": getattr(request.state, "request_id", None)}}
        if details is not None:
            body["error"]["details"] = details
        return JSONResponse(status_code=status, content=body)

    @app.middleware("http")
    async def request_id(request: Request, call_next):
        request.state.request_id = request.headers.get("X-Request-ID", "")[:64] or uuid.uuid4().hex[:12]
        # Refuse oversized bodies from the header alone, before anything is read or parsed. A body with no
        # Content-Length (chunked) cannot be checked up front, so it is refused too: browsers and API clients
        # send a length for JSON bodies.
        length = request.headers.get("content-length")
        if length is not None and (not length.isdigit() or int(length) > settings.max_body_bytes):
            response = _error(413, "payload_too_large", f"Request body is larger than {settings.max_body_bytes} bytes.", request)
        elif length is None and "chunked" in request.headers.get("transfer-encoding", "").lower():
            response = _error(411, "length_required", "Send a Content-Length header; chunked request bodies are not accepted.", request)
        else:
            response = await call_next(request)
        response.headers["X-Request-ID"] = request.state.request_id
        return response

    # Added after the request-id/size-guard middleware on purpose: the last middleware added is the outermost, so CORS
    # headers are put on every response, including the 413 and 411 the size guard answers by itself.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_methods=["GET", "POST", "PATCH"],
        allow_headers=["Content-Type", "X-Request-ID"],
    )

    @app.exception_handler(RequestValidationError)
    async def _validation(request: Request, exc: RequestValidationError) -> JSONResponse:
        details = []
        for err in exc.errors():
            loc = [str(p) for p in err.get("loc", ())]
            if loc and loc[0] in ("body", "query", "path"):
                loc = loc[1:]  # drop the request-location prefix, keep the field path
            msg = str(err.get("msg", "invalid value")).removeprefix("Value error, ")
            details.append({"field": ".".join(loc) or None, "message": msg})
        summary = "; ".join(f"{d['field']}: {d['message']}" if d["field"] else d["message"] for d in details)
        return _error(422, "validation_error", summary or "Invalid request", request, details)

    @app.exception_handler(StarletteHTTPException)  # FastAPI's HTTPException subclasses this; routing 404/405 raise it
    async def _http(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        return _error(exc.status_code, "http_error", str(exc.detail), request)

    @app.exception_handler(AppError)
    async def _app_error(request: Request, exc: AppError) -> JSONResponse:
        return _error(exc.status_code, exc.code, exc.message, request)

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        log.exception("Unhandled error", extra={"fields": {"request_id": getattr(request.state, "request_id", None)}})
        return _error(500, "internal_error", "Unexpected server error. See server logs with this request_id.", request)

    def _check_category(session: Session, category: str | None) -> None:
        if category is not None and category not in repository.known_categories(session):
            known = ", ".join(repository.known_categories(session))
            raise AppError(422, "validation_error", f"category: unknown category '{category}'. Known: {known}")

    # ---------------------------------------------------------------- routes
    @app.get("/health", response_model=HealthResponse, tags=["system"])
    async def health(request: Request) -> HealthResponse:
        try:
            with _sessions_of(request.app)() as session:
                session.execute(text("SELECT 1 FROM tickets LIMIT 1"))
            db_ok = True
        except Exception:  # noqa: BLE001
            db_ok = False
        gw: McpGateway = request.app.state.gateway
        alive = await gw.ping()  # a real round trip: `connected` alone stays True after the child is killed
        mcp = McpHealth(
            connected=alive,
            tools=gw.tools,
            resource_templates=gw.resource_templates,
            server=gw.server_info,
            last_error=gw.last_error or (None if alive else "MCP server did not answer a ping"),
            index=request.app.state.index_status,
        )
        ok = db_ok and alive
        return HealthResponse(status="ok" if ok else "degraded", database="ok" if db_ok else "error", mcp=mcp)

    @app.get("/api/meta", response_model=MetaResponse, tags=["tickets"])
    def meta(session: SessionDep) -> MetaResponse:
        return MetaResponse(
            statuses=list(TICKET_STATUSES),
            priorities=list(TICKET_PRIORITIES),
            categories=repository.known_categories(session),
            actions=[a.value for a in AssistantAction],
        )

    @app.get("/api/tickets", response_model=TicketListResponse, tags=["tickets"])
    def list_tickets(
        session: SessionDep,
        status: Status | None = None,
        priority: Priority | None = None,
        category: Annotated[str | None, Query(pattern=r"^[a-z][a-z_]{1,39}$")] = None,
        reviewed: bool | None = None,
        limit: Annotated[int, Query(ge=1, le=100)] = 50,
        offset: Annotated[int, Query(ge=0, le=10_000)] = 0,
    ) -> TicketListResponse:
        _check_category(session, category)
        filters = TicketFilters(status=status, priority=priority, category=category)
        items, total = repository.list_tickets(session, filters, reviewed=reviewed, limit=limit, offset=offset)
        return TicketListResponse(items=items, total=total, limit=limit, offset=offset)

    @app.get("/api/tickets/{ticket_id}", response_model=TicketResponse, tags=["tickets"], responses={404: {"model": ErrorResponse}})
    def get_ticket(ticket_id: TicketIdPath, session: SessionDep) -> TicketResponse:
        ticket = repository.get_ticket(session, ticket_id)
        if ticket is None:
            raise AppError(404, "ticket_not_found", f"Ticket {ticket_id} was not found")
        return TicketResponse(**ticket.model_dump())

    @app.patch(
        "/api/tickets/{ticket_id}/reviewed",
        response_model=TicketResponse,
        tags=["tickets"],
        responses={404: {"model": ErrorResponse}},
        summary="Mark a ticket reviewed (idempotent; the first review time is kept)",
    )
    def mark_reviewed(ticket_id: TicketIdPath, session: SessionDep) -> TicketResponse:
        now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        ticket = repository.mark_reviewed(session, ticket_id, now)
        if ticket is None:
            raise AppError(404, "ticket_not_found", f"Ticket {ticket_id} was not found")
        session.commit()
        log.info("ticket reviewed", extra={"fields": {"ticket_id": ticket_id, "reviewed_at": ticket.reviewed_at}})
        return TicketResponse(**ticket.model_dump())

    @app.post(
        "/api/assistant/run",
        response_model=AssistantRunResponse,
        tags=["assistant"],
        responses={
            404: {"model": ErrorResponse},
            502: {"model": ErrorResponse},
            503: {"model": ErrorResponse},
            504: {"model": ErrorResponse},
        },
    )
    async def run_assistant(body: AssistantRunRequest, request: Request) -> AssistantRunResponse:
        sessions = _sessions_of(request.app)
        if body.category is not None:
            with sessions() as session:
                _check_category(session, body.category)
        assistant: AssistantService = request.app.state.assistant
        try:
            response, record = await assistant.run(body)
        except Exception as exc:
            record = getattr(exc, "run_record", None)
            if record:
                await run_in_threadpool(_save_run, sessions, record, settings.max_run_history)
            if isinstance(exc, TicketNotFoundError):
                raise AppError(404, "ticket_not_found", f"Ticket {exc} was not found") from exc
            if isinstance(exc, McpTimeoutError):
                raise AppError(504, "gateway_timeout", "The assistant tool server timed out. Try again shortly.") from exc
            if isinstance(exc, McpUnavailableError):
                raise AppError(503, "assistant_unavailable", "The assistant tool server is unavailable. Try again shortly.") from exc
            if isinstance(exc, McpToolError):
                log.error("MCP tool error", extra={"fields": {"code": exc.code}})  # the text can echo the query
                raise AppError(502, "tool_error", f"An assistant tool failed ({exc.code}).") from exc
            raise
        await run_in_threadpool(_save_run, sessions, record, settings.max_run_history)
        return response

    @app.get("/api/assistant/runs", response_model=list[AssistantRunRecord], tags=["assistant"])
    def list_runs(session: SessionDep, limit: Annotated[int, Query(ge=1, le=200)] = 50) -> list[AssistantRunRecord]:
        rows = session.scalars(select(AssistantRun).order_by(desc(AssistantRun.created_at)).limit(limit)).all()
        return [AssistantRunRecord.model_validate(r, from_attributes=True) for r in rows]

    return app


def _sessionmaker_from(app: FastAPI) -> sessionmaker[Session]:
    if app.state.sessions is None:
        raise AppError(503, "database_not_initialized", DB_NOT_INITIALIZED)
    return app.state.sessions


def _save_run(sessions: sessionmaker[Session], record: dict, keep: int) -> None:
    log.info("assistant run", extra={"fields": record})
    try:
        with sessions.begin() as session:
            session.add(AssistantRun(**record))
            session.flush()
            # Retention: keep only the newest `keep` rows. created_at has one-second resolution, so ties are broken by
            # insertion order (rowid), never by the random run id. The created_at index makes this a short range scan.
            newest = select(AssistantRun.run_id).order_by(desc(AssistantRun.created_at), desc(literal_column("rowid"))).limit(keep)
            session.execute(delete(AssistantRun).where(AssistantRun.run_id.not_in(newest)))
    except Exception:  # noqa: BLE001 - audit logging must never fail the request
        log.exception("Failed to persist assistant run", extra={"fields": {"run_id": record.get("run_id")}})


app = create_app()
