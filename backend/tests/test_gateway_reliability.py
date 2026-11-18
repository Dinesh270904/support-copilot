"""MCP client reliability: real process kills (not simulated), timeout mapping, env passthrough,
typed (not string-matched) error handling, and an honest /health."""

from __future__ import annotations

import asyncio
import os
import signal
import subprocess
import sys
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from mcp.shared.exceptions import MCPError
from mcp_types import CONNECTION_CLOSED

from app.api.main import create_app, mcp_server_params
from app.api.mcp_gateway import McpGateway, McpToolError
from tests.conftest import settings_for

posix_only = pytest.mark.skipif(sys.platform == "win32", reason="uses POSIX signals and pgrep")


def child_pids() -> set[int]:
    """PIDs of every MCP server subprocess owned by this test process."""
    out = subprocess.run(["pgrep", "-P", str(os.getpid()), "-f", "app.mcp_server"], capture_output=True, text=True)
    return {int(p) for p in out.stdout.split()}


class Isolated:
    """A private app + MCP child, so killing it cannot disturb the session-wide `client` fixture."""

    def __init__(self, client: TestClient, baseline: set[int]):
        self.client, self._baseline = client, baseline

    def pids(self) -> set[int]:
        return child_pids() - self._baseline


@pytest.fixture()
def isolated(seeded_db) -> Iterator[Isolated]:
    baseline = child_pids()  # e.g. the shared session client's child
    with TestClient(create_app(settings_for(seeded_db))) as c:
        yield Isolated(c, baseline)


# ------------------------------------------------------------------ #6 honest /health
@posix_only
def test_health_notices_a_dead_mcp_child_and_recovers_on_next_call(isolated):
    client = isolated.client
    (pid,) = isolated.pids()
    assert client.get("/health").json()["mcp"]["connected"] is True
    os.kill(pid, signal.SIGKILL)
    health = client.get("/health").json()
    assert health["status"] == "degraded" and health["mcp"]["connected"] is False
    # The next assistant call reconnects (safe: every tool is read-only), and health follows.
    assert client.post("/api/assistant/run", json={"action": "count_tickets"}).status_code == 200
    assert client.get("/health").json()["mcp"]["connected"] is True


# ------------------------------------------------- #9 kill the child during an in-flight call
@posix_only
def test_child_killed_while_a_call_is_in_flight_is_retried_once(isolated):
    client = isolated.client
    gateway = client.app.state.gateway
    (pid,) = isolated.pids()

    async def scenario() -> dict:
        os.kill(pid, signal.SIGSTOP)  # frozen: it can read nothing and answer nothing
        task = asyncio.create_task(gateway.call_tool("count_tickets", {"filters": {"status": "open"}}))
        await asyncio.sleep(0.5)  # the request is now written to the frozen child's pipe
        assert not task.done(), "the call must be genuinely in flight"
        os.kill(pid, signal.SIGKILL)
        return await asyncio.wait_for(task, 30)

    result = client.portal.call(scenario)
    assert result["count"] == 7  # served by the replacement process after exactly one retry
    (new_pid,) = isolated.pids()
    assert new_pid != pid and gateway.connected


# ----------------------------------------------------------- #8 timeouts are 504, not 503
def test_mcp_call_timeout_maps_to_504_gateway_timeout(seeded_db):
    app = create_app(settings_for(seeded_db, mcp_call_timeout_s=0.0))  # nothing can answer in 0 s
    with TestClient(app) as c:
        resp = c.post("/api/assistant/run", json={"action": "count_tickets"})
        assert resp.status_code == 504
        assert resp.json()["error"]["code"] == "gateway_timeout"
        assert c.get("/api/tickets").status_code == 200  # non-assistant routes are unaffected


# --------------------------------------------- #9 every SUPPORT_COPILOT_* variable reaches the child
def test_every_support_copilot_variable_is_passed_to_the_child(seeded_db, monkeypatch):
    monkeypatch.setenv("SUPPORT_COPILOT_SOMETHING_NEW", "42")
    monkeypatch.setenv("UNRELATED_SECRET", "nope")
    monkeypatch.setenv("SUPPORT_COPILOT_DB", "/wrong/path.db")
    settings = settings_for(seeded_db)
    env = mcp_server_params(settings).env
    assert env["SUPPORT_COPILOT_SOMETHING_NEW"] == "42"
    assert "UNRELATED_SECRET" not in env, "only SUPPORT_COPILOT_* is forwarded"
    assert env["SUPPORT_COPILOT_DB"] == str(settings.db_path), "the API's resolved settings win over a stale env var"


def test_rag_top_k_setting_reaches_the_mcp_server(seeded_db):
    with TestClient(create_app(settings_for(seeded_db, rag_default_top_k=2))) as c:
        assert c.get("/health").json()["mcp"]["index"]["default_top_k"] == 2


# ----------------------------------------- #9 typed error handling, not substring matching
class _FakeSession:
    def __init__(self, error: Exception):
        self.error, self.calls = error, 0

    async def call_tool(self, name, arguments):
        self.calls += 1
        raise self.error


def _gateway_with(session: _FakeSession, monkeypatch) -> tuple[McpGateway, list[str]]:
    gateway = McpGateway(mcp_server_params(settings_for(__import__("pathlib").Path("x.db"))), startup_timeout_s=1, call_timeout_s=1)
    restarts: list[str] = []

    async def session_or_start():
        return session

    async def restart_quietly():
        restarts.append("restart")

    monkeypatch.setattr(gateway, "_session_or_start", session_or_start)
    monkeypatch.setattr(gateway, "_restart_quietly", restart_quietly)
    return gateway, restarts


def test_connection_closed_is_recognised_by_code_not_by_message(monkeypatch):
    session = _FakeSession(MCPError(CONNECTION_CLOSED, "totally different wording"))
    gateway, restarts = _gateway_with(session, monkeypatch)
    with pytest.raises(Exception, match="connection lost"):
        asyncio.run(gateway.call_tool("count_tickets", {}))
    assert session.calls == 2 and len(restarts) == 2  # retried once, then gave up


def test_other_protocol_errors_are_tool_errors_even_if_the_message_says_closed(monkeypatch):
    session = _FakeSession(MCPError(-32602, "Connection closed"))  # misleading text, different code
    gateway, restarts = _gateway_with(session, monkeypatch)
    with pytest.raises(McpToolError) as info:
        asyncio.run(gateway.call_tool("count_tickets", {}))
    assert info.value.code == "protocol_error"
    assert session.calls == 1 and restarts == []  # no reconnect, no retry
