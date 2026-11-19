"""Requirement E2 and E7: the MCP server's startup line names the full database path (and nothing from a ticket), and a complete
stdio session produces only valid JSON-RPC on stdout, with every diagnostic on stderr."""

from __future__ import annotations

import json
import os
import subprocess
import threading
import time

from app.config import BACKEND_DIR
from tests.conftest import SEED_DIR

REQUESTS = [
    {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "test", "version": "1"}}},
    {"jsonrpc": "2.0", "method": "notifications/initialized"},
    {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
    {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "get_ticket", "arguments": {"ticket_id": "T-101"}}},
    {"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {"name": "search_knowledge", "arguments": {"query": "PAYMENT_TIMEOUT pending payment", "top_k": 2}}},
    {"jsonrpc": "2.0", "id": 5, "method": "resources/templates/list"},
    {"jsonrpc": "2.0", "id": 6, "method": "resources/read", "params": {"uri": "support://knowledge/KB-01"}},
    {"jsonrpc": "2.0", "id": 7, "method": "tools/call", "params": {"name": "get_ticket", "arguments": {"ticket_id": "T-999"}}},
]


def _run_session(python: str, db) -> tuple[list[str], list[str]]:
    env = {**os.environ, "SUPPORT_COPILOT_DB": str(db)}
    proc = subprocess.Popen(
        [python, "-m", "app.mcp_server"], cwd=str(BACKEND_DIR), env=env, text=True,
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    out: list[str] = []
    err: list[str] = []
    threading.Thread(target=lambda: out.extend(proc.stdout), daemon=True).start()  # type: ignore[arg-type]
    threading.Thread(target=lambda: err.extend(proc.stderr), daemon=True).start()  # type: ignore[arg-type]
    for message in REQUESTS:
        proc.stdin.write(json.dumps(message) + "\n")  # type: ignore[union-attr]
        proc.stdin.flush()  # type: ignore[union-attr]
    deadline = time.time() + 20
    wanted = {m["id"] for m in REQUESTS if "id" in m}
    while time.time() < deadline:  # wait for every response, then close stdin like a client would
        answered = {json.loads(line).get("id") for line in list(out) if line.strip()}
        if wanted <= answered:
            break
        time.sleep(0.1)
    proc.stdin.close()  # type: ignore[union-attr]
    proc.wait(timeout=15)
    time.sleep(0.2)
    return out, err


def test_full_stdio_session_has_only_json_rpc_on_stdout_and_logs_on_stderr(seeded_db, python):
    out, err = _run_session(python, seeded_db)
    frames = [json.loads(line) for line in out if line.strip()]  # every non-blank stdout line must be JSON
    assert len(frames) >= 7
    for frame in frames:
        assert frame["jsonrpc"] == "2.0"
        assert ("result" in frame or "error" in frame) == ("id" in frame and "method" not in frame)  # a response, or a request/notification
    by_id = {f["id"]: f for f in frames if "id" in f and "method" not in f}
    assert set(by_id) >= {1, 2, 3, 4, 5, 6, 7}
    assert {t["name"] for t in by_id[2]["result"]["tools"]} == {"get_ticket", "search_knowledge", "search_resolved_tickets", "count_tickets"}
    assert by_id[3]["result"]["structuredContent"]["id"] == "T-101"
    assert by_id[4]["result"]["structuredContent"]["results"][0]["article_id"] == "KB-01"
    assert by_id[7]["result"]["isError"] is True  # a tool error is still a protocol-level result
    assert any("Starting MCP server" in line for line in err)  # diagnostics went to stderr


def test_startup_line_names_the_full_database_path_and_no_ticket_text(seeded_db, python):
    _, err = _run_session(python, seeded_db)
    start = next(line for line in err if "Starting MCP server" in line)
    assert f'db="{seeded_db}"' in start
    tickets = json.loads((SEED_DIR / "tickets.json").read_text())
    log = "".join(err)
    for t in tickets:
        assert t["description"][:30] not in log  # the whole stderr of a session that read T-101 and T-999 holds no ticket text
        assert t["title"] not in log
