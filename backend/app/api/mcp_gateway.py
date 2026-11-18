"""Long-lived MCP client connection from the FastAPI service to the stdio MCP server.

The server is launched once (at API startup) as a subprocess and reused for every
request: spawning per request would cost a Python start plus an index build each time.
A dedicated asyncio task owns the `stdio_client`/`ClientSession` context managers (anyio
cancel scopes must be exited by the task that entered them); request handlers only send
requests over the established session, which multiplexes concurrent calls by JSON-RPC ID.

Failure handling
- Startup failure: the API still starts; /health reports MCP as down and assistant calls
  return 503 while each call attempts a reconnect.
- Subprocess crash / closed pipe: the call is retried once on a fresh connection. That is
  safe because every exposed tool is read-only and idempotent.
- Per-call timeout -> McpTimeoutError (HTTP 504 gateway_timeout); the connection is recycled and the
  call is NOT retried, because a hung server would make the user wait twice as long.
- A dropped connection is recognised by the SDK's typed JSON-RPC code (CONNECTION_CLOSED), not by
  matching message text; any other protocol error is a tool error and is not retried.
"""

from __future__ import annotations

import asyncio
import logging
import re
import sys
from typing import Any

import anyio
from mcp import ClientSession, StdioServerParameters, stdio_client
from mcp.shared.exceptions import MCPError
from mcp_types import CONNECTION_CLOSED

log = logging.getLogger("support_copilot.mcp_client")

ALLOWED_TOOLS = frozenset({"get_ticket", "search_knowledge", "search_resolved_tickets", "count_tickets"})
_ERROR_CODE = re.compile(r"\[([a-z_]+)\]")
_CONNECTION_ERRORS = (anyio.ClosedResourceError, anyio.BrokenResourceError, anyio.EndOfStream, BrokenPipeError)


class McpUnavailableError(Exception):
    """The MCP server could not be reached (startup failure, crash, timeout)."""


class McpTimeoutError(McpUnavailableError):
    """The MCP server did not answer within the call timeout (mapped to HTTP 504)."""


class McpToolError(Exception):
    """The MCP server answered with a tool error (e.g. not found, invalid arguments)."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


class McpGateway:
    def __init__(self, params: StdioServerParameters, *, startup_timeout_s: float, call_timeout_s: float):
        self._params = params
        self._startup_timeout_s = startup_timeout_s
        self._call_timeout_s = call_timeout_s
        self._session: ClientSession | None = None
        self._task: asyncio.Task[None] | None = None
        self._stop = asyncio.Event()
        self._ready = asyncio.Event()
        self._lock = asyncio.Lock()
        self.tools: list[str] = []
        self.resource_templates: list[str] = []
        self.server_info: dict[str, str] = {}
        self.last_error: str | None = None

    @property
    def connected(self) -> bool:
        return self._session is not None and self._task is not None and not self._task.done()

    # ------------------------------------------------------------- lifecycle
    async def start(self) -> None:
        async with self._lock:
            if self.connected:
                return
            await self._shutdown_locked()
            self._stop, self._ready = asyncio.Event(), asyncio.Event()
            self._task = asyncio.create_task(self._run(), name="mcp-client")
            try:
                await asyncio.wait_for(self._ready.wait(), self._startup_timeout_s)
            except asyncio.TimeoutError:
                self.last_error = "startup timed out"
                await self._shutdown_locked()
            if not self.connected:
                raise McpUnavailableError(f"MCP server unavailable: {self.last_error or 'unknown error'}")

    async def _run(self) -> None:
        errlog = sys.__stderr__ if sys.__stderr__ is not None else sys.stderr
        try:
            async with stdio_client(self._params, errlog=errlog) as (read, write):
                async with ClientSession(read, write) as session:
                    init = await session.initialize()
                    self.tools = sorted(t.name for t in (await session.list_tools()).tools)
                    self.resource_templates = [
                        t.uri_template for t in (await session.list_resource_templates()).resource_templates
                    ]
                    self.server_info = {"name": init.server_info.name, "protocol_version": str(init.protocol_version)}
                    missing = ALLOWED_TOOLS - set(self.tools)
                    if missing:
                        raise RuntimeError(f"MCP server is missing required tools: {sorted(missing)}")
                    self._session, self.last_error = session, None
                    log.info("MCP connected", extra={"fields": {**self.server_info, "tools": self.tools}})
                    self._ready.set()
                    await self._stop.wait()
        except Exception as exc:  # noqa: BLE001 - recorded and surfaced as a safe 503
            self.last_error = type(exc).__name__ if not str(exc) else f"{type(exc).__name__}: {exc}"[:300]
            log.error("MCP connection failed", exc_info=True)
        finally:
            self._session = None
            self._ready.set()

    async def _shutdown_locked(self) -> None:
        self._stop.set()
        if self._task is not None:
            try:
                await asyncio.wait_for(asyncio.shield(self._task), 5)
            except (asyncio.TimeoutError, Exception):  # noqa: BLE001
                self._task.cancel()
        self._task, self._session = None, None

    async def stop(self) -> None:
        async with self._lock:
            await self._shutdown_locked()

    async def _restart(self) -> None:
        async with self._lock:
            await self._shutdown_locked()
        await self.start()

    async def _session_or_start(self) -> ClientSession:
        if not self.connected:
            await self.start()
        assert self._session is not None
        return self._session

    # ------------------------------------------------------------------ calls
    async def call_tool(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        if name not in ALLOWED_TOOLS:  # defence in depth: orchestrator plans are fixed
            raise ValueError(f"Tool {name!r} is not allow-listed")
        for attempt in (1, 2):
            session = await self._session_or_start()
            try:
                result = await asyncio.wait_for(session.call_tool(name, arguments), self._call_timeout_s)
            except asyncio.TimeoutError as exc:
                log.error("MCP tool call timed out", extra={"fields": {"tool": name}})
                await self._restart_quietly()
                raise McpTimeoutError(f"MCP tool {name} timed out") from exc
            except (MCPError, *_CONNECTION_ERRORS) as exc:
                if isinstance(exc, MCPError) and exc.code != CONNECTION_CLOSED:
                    raise McpToolError("protocol_error", str(exc)) from exc
                log.warning("MCP connection lost; reconnecting", extra={"fields": {"tool": name, "attempt": attempt}})
                await self._restart_quietly()
                if attempt == 2:
                    raise McpUnavailableError("MCP connection lost") from exc
                continue
            if result.is_error:
                text = " ".join(getattr(c, "text", "") for c in result.content).strip()
                match = _ERROR_CODE.search(text)
                raise McpToolError(match.group(1) if match else "tool_error", text)
            if result.structured_content is None:
                raise McpToolError("invalid_response", f"Tool {name} returned no structured content")
            return dict(result.structured_content)
        raise McpUnavailableError("unreachable")  # pragma: no cover

    async def read_resource(self, uri: str) -> str:
        session = await self._session_or_start()
        try:
            result = await asyncio.wait_for(session.read_resource(uri), self._call_timeout_s)
        except asyncio.TimeoutError as exc:
            raise McpTimeoutError("MCP resource read timed out") from exc
        except MCPError as exc:
            raise McpToolError("resource_error", str(exc)) from exc
        return "".join(getattr(c, "text", "") for c in result.contents)

    async def ping(self, timeout_s: float = 2.0) -> bool:
        """True only if the server process answers right now (used by /health)."""
        session = self._session
        if session is None or not self.connected:
            return False
        try:
            await asyncio.wait_for(session.send_ping(), timeout_s)
        except (asyncio.TimeoutError, MCPError, *_CONNECTION_ERRORS):
            return False
        return True

    async def _restart_quietly(self) -> None:
        try:
            await self._restart()
        except McpUnavailableError:
            pass
