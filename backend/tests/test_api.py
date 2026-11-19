"""Requirements 4 and 5: FastAPI calls the MCP server through an MCP stdio client end to end;
filters and mark-reviewed persist; unknown IDs, unsupported actions, invalid filters and
oversized input are rejected with clear 4xx errors; MCP failures surface as safe 503s."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db import make_engine, make_sessionmaker
from app.models import AssistantRun, Ticket
from tests.conftest import settings_for


def test_health_reports_mcp_connection(client):
    body = client.get("/health").json()
    assert body["status"] == "ok" and body["database"] == "ok"
    mcp = body["mcp"]
    assert mcp["connected"] and mcp["server"]["name"] == "support-copilot"
    assert set(mcp["tools"]) == {"count_tickets", "get_ticket", "search_knowledge", "search_resolved_tickets"}
    assert mcp["index"]["chunks"] == 14 and mcp["index"]["min_score"] == 0.15


def test_end_to_end_action_goes_through_mcp_stdio(client, settings):
    gateway = client.app.state.gateway
    assert gateway.connected  # a live stdio MCP session owned by the API process
    resp = client.post(
        "/api/assistant/run",
        json={"action": "search_knowledge", "ticket_id": "T-104", "query": "backup code new authenticator device",
              "category": "account_access"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["tool_calls"] == ["get_ticket", "search_knowledge"]
    assert [t["status"] for t in body["tool_trace"]] == ["ok", "ok"]
    assert body["retrieval"]["method"] == "tfidf_cosine"
    assert body["citations"][0]["source_id"] == "KB-03#chunk-1"
    # Run metadata is persisted without query/ticket text.
    engine = make_engine(settings.db_path, read_only=True)
    with make_sessionmaker(engine)() as s:
        run = s.get(AssistantRun, body["run_id"])
        assert run is not None and run.status == "success" and run.tool_calls == body["tool_calls"]
        assert run.retrieval_method == "tfidf_cosine" and run.query_chars == len("backup code new authenticator device")
    engine.dispose()


def test_ticket_filters(client):
    body = client.get("/api/tickets", params={"status": "open", "priority": "high"}).json()
    assert body["total"] == 4 and {t["id"] for t in body["items"]} == {"T-101", "T-104", "T-108", "T-112"}
    body = client.get("/api/tickets", params={"status": "open", "priority": "high", "category": "checkout"}).json()
    assert [t["id"] for t in body["items"]] == ["T-101"]
    body = client.get("/api/tickets", params={"status": "resolved"}).json()
    assert body["total"] == 5 and all(t["status"] == "resolved" for t in body["items"])
    assert client.get("/api/tickets", params={"limit": 2}).json()["items"].__len__() == 2


def test_invalid_filters_rejected(client):
    for params in ({"status": "deleted"}, {"priority": "urgent"}, {"category": "nope"}, {"category": "DROP TABLE"},
                   {"limit": 0}, {"limit": 1000}):
        resp = client.get("/api/tickets", params=params)
        assert resp.status_code == 422, params
        assert resp.json()["error"]["code"] == "validation_error"


def test_mark_reviewed_persists_and_is_idempotent(client, settings):
    first = client.patch("/api/tickets/T-110/reviewed")
    assert first.status_code == 200 and first.json()["reviewed_at"]
    second = client.patch("/api/tickets/T-110/reviewed")
    assert second.json()["reviewed_at"] == first.json()["reviewed_at"]
    assert client.get("/api/tickets/T-110").json()["reviewed_at"] == first.json()["reviewed_at"]
    engine = make_engine(settings.db_path, read_only=True)
    with make_sessionmaker(engine)() as s:
        assert s.scalar(select(Ticket.reviewed_at).where(Ticket.id == "T-110")) == first.json()["reviewed_at"]
    engine.dispose()
    reviewed = client.get("/api/tickets", params={"reviewed": True}).json()["items"]
    assert "T-110" in {t["id"] for t in reviewed}


def test_unknown_and_malformed_ids_rejected(client):
    assert client.get("/api/tickets/T-999").status_code == 404
    assert client.patch("/api/tickets/T-999/reviewed").status_code == 404
    assert client.get("/api/tickets/abc").status_code == 422
    resp = client.post("/api/assistant/run", json={"action": "summarize_ticket", "ticket_id": "T-999"})
    assert resp.status_code == 404 and resp.json()["error"]["code"] == "ticket_not_found"


def test_unsupported_action_and_bad_requests_rejected(client):
    cases = [
        {"action": "run_sql", "query": "SELECT * FROM tickets"},
        {"action": "search_knowledge"},  # missing query
        {"action": "search_knowledge", "query": "x" * 501},  # oversized
        {"action": "search_knowledge", "query": "ab"},  # too short
        {"action": "summarize_ticket"},  # missing ticket_id
        {"action": "search_knowledge", "query": "valid query", "top_k": 50},
        {"action": "search_knowledge", "query": "valid query", "unexpected": 1},
        {"action": "search_knowledge", "query": "valid query", "filters": {"status": "open"}},
        {"action": "count_tickets", "filters": {"status": "archived"}},
    ]
    for payload in cases:
        resp = client.post("/api/assistant/run", json=payload)
        assert resp.status_code == 422, payload
        err = resp.json()["error"]
        assert err["code"] == "validation_error" and err["message"]
        assert "Traceback" not in resp.text


def test_count_parses_question_and_explicit_filters_override(client):
    body = client.post(
        "/api/assistant/run",
        json={"action": "count_tickets", "query": "How many open high-priority tickets mention checkout failures?"},
    ).json()
    assert body["count"]["count"] == 1 and body["count"]["ticket_ids"] == ["T-101"]
    body = client.post(
        "/api/assistant/run",
        json={"action": "count_tickets", "query": "open high priority checkout", "filters": {"priority": "medium"}},
    ).json()
    assert body["count"]["filters"] == {"status": "open", "priority": "medium", "category": "checkout"}
    assert body["count"]["ticket_ids"] == ["T-102"]


def test_draft_is_labelled_and_grounded(client):
    body = client.post("/api/assistant/run", json={"action": "draft_reply", "ticket_id": "T-101"}).json()
    assert body["tool_calls"] == ["get_ticket", "search_knowledge"]
    assert "NOT been sent" in body["answer"]
    sftp = client.post("/api/assistant/run", json={"action": "draft_reply", "ticket_id": "T-112"}).json()
    assert sftp["answer_state"] == "insufficient_evidence"
    assert "rather than guess" in sftp["draft"] and "1." not in sftp["draft"]  # holding reply, no invented steps


def test_mcp_startup_failure_returns_safe_503(seeded_db):
    from app.api.main import create_app

    broken = settings_for(seeded_db, mcp_startup_timeout_s=5.0)
    app = create_app(broken)
    import app.api.main as main_module

    original = main_module.mcp_server_params
    main_module.mcp_server_params = lambda s: original(s).model_copy(update={"args": ["-m", "app.does_not_exist"]})
    try:
        with TestClient(app) as c:
            health = c.get("/health").json()
            assert health["status"] == "degraded" and not health["mcp"]["connected"]
            resp = c.post("/api/assistant/run", json={"action": "count_tickets"})
            assert resp.status_code == 503
            assert resp.json()["error"] == {
                "code": "assistant_unavailable",
                "message": "The assistant tool server is unavailable. Try again shortly.",
                "request_id": resp.headers["X-Request-ID"],
            }
            # Non-assistant routes keep working without MCP.
            assert c.get("/api/tickets").status_code == 200
    finally:
        main_module.mcp_server_params = original


def test_gateway_recovers_after_mcp_process_dies(client):
    import asyncio

    gateway = client.app.state.gateway

    async def kill() -> None:
        # Simulate a crash by closing the live session's transport.
        gateway._stop.set()  # noqa: SLF001 - test-only crash injection
        await asyncio.sleep(0.3)

    client.portal.call(kill)
    resp = client.post("/api/assistant/run", json={"action": "count_tickets", "filters": {"status": "open"}})
    assert resp.status_code == 200 and resp.json()["count"]["count"] == 7
    assert gateway.connected


def test_error_code_question_is_answered_from_its_article(client):
    resp = client.post(
        "/api/assistant/run",
        json={"action": "search_knowledge", "ticket_id": "T-101",
              "query": "What does PAYMENT_TIMEOUT mean and how do I resolve it?", "category": "checkout"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["answer_state"] == "answered"
    assert body["citations"][0]["article_id"] == "KB-01"
    assert body["citations"][0]["matched_identifiers"] == ["PAYMENT_TIMEOUT"]
    # The answer is verbatim sentences from the cited chunk, tagged with their IDs.
    assert "PAYMENT_TIMEOUT" in body["answer"] and "[KB-01#chunk-1]" in body["answer"]
    # The article's prohibition must not be lost just because the question never said "payment" on
    # its own: the question named the article's error code, so its guardrails apply.
    assert "do not ask the customer to submit another payment" in body["answer"]


def test_guardrail_rule_does_not_leak_into_insufficient_evidence_cases(client):
    bank = client.post(
        "/api/assistant/run",
        json={"action": "search_knowledge", "ticket_id": "T-101", "category": "billing",
              "query": "Does the product reimburse a bank decline fee?"},
    ).json()
    assert bank["answer_state"] == "insufficient_evidence"
    assert [c["usage"] for c in bank["citations"]] == ["coverage_gap"]
    assert "do not ask the customer" not in bank["answer"]
    sftp = client.post(
        "/api/assistant/run",
        json={"action": "search_knowledge", "category": "integrations",
              "query": "Configure scheduled SFTP delivery of reports to an external server"},
    ).json()
    assert sftp["answer_state"] == "insufficient_evidence" and sftp["citations"] == []


# --- draft: customer text vs. notes for the agent --------------------------------------------
# Prohibitions ("do not ...", "never ...") are written for the agent. They must not be pasted into the
# customer's message, but they must not be lost either: they move to "Notes for the agent". The
# draft's steps come from the top-ranked article only.

PENDING_RULE = "do not ask the customer to submit another payment"


def _draft(client, ticket_id):
    return client.post("/api/assistant/run", json={"action": "draft_reply", "ticket_id": ticket_id}).json()


def _notes(body):
    return next(s["items"] for s in body["sections"] if s["title"] == "Notes for the agent")


def test_draft_moves_prohibitions_to_agent_notes_instead_of_dropping_them(client):
    body = _draft(client, "T-101")
    assert PENDING_RULE not in body["draft"]
    note = next(n for n in _notes(body) if PENDING_RULE in n)
    assert "[KB-01#chunk-1]" in note and "not in the draft" in note.lower()


def test_draft_steps_come_from_the_top_article_only(client):
    body = _draft(client, "T-101")
    assert "not a completed second charge" not in body["draft"]  # a KB-02 sentence
    other = next(n for n in _notes(body) if "not a completed second charge" in n)
    assert "KB-02" in other and "different article" in other.lower()
    steps = [line for line in body["draft"].splitlines() if line[:2] in {f"{i}." for i in range(1, 10)}]
    assert steps and all("checkout" in line.lower() or "retry" in line.lower() or "transaction" in line.lower() for line in steps)


def test_no_draft_for_any_ticket_tells_the_customer_to_do_an_agent_prohibition(client):
    from app.composer.knowledge import is_guardrail

    for n in range(101, 113):
        body = _draft(client, f"T-{n}")
        customer_text = body["draft"].split("Best regards")[0]
        for line in customer_text.splitlines():
            assert not is_guardrail(line), f"T-{n}: agent-facing prohibition leaked into the customer draft: {line!r}"


def test_knowledge_citations_carry_matched_terms_and_identifiers(client):
    body = client.post(
        "/api/assistant/run",
        json={"action": "search_knowledge", "ticket_id": "T-101", "category": "checkout",
              "query": "What does PAYMENT_TIMEOUT mean and how do I resolve it?"},
    ).json()
    citation = body["citations"][0]
    assert citation["source_id"] == "KB-01#chunk-1"
    assert citation["matched_identifiers"] == ["PAYMENT_TIMEOUT"]
    assert citation["matched_terms"], "the UI shows which words matched for every source"
    assert all(t == t.lower() for t in citation["matched_terms"])  # words, not stems or ids


def test_missing_database_is_never_created_and_routes_say_so(tmp_path):
    from app.api.main import create_app

    db = tmp_path / "absent.db"
    with TestClient(create_app(settings_for(db))) as c:
        health = c.get("/health").json()
        assert health["status"] == "degraded" and health["database"] == "error"
        assert health["mcp"]["last_error"] == "Database not initialized. Run make setup first."
        for resp in (
            c.get("/api/tickets"),
            c.get("/api/tickets/T-101"),
            c.get("/api/meta"),
            c.patch("/api/tickets/T-101/reviewed"),
            c.post("/api/assistant/run", json={"action": "count_tickets"}),
        ):
            assert resp.status_code == 503, resp.text
            error = resp.json()["error"]
            assert error["code"] == "database_not_initialized" and "make setup" in error["message"]
    assert not db.exists()  # nothing created the file


def test_unknown_route_and_wrong_method_use_the_error_envelope(client):
    for resp, status in ((client.get("/api/nope"), 404), (client.delete("/api/tickets/T-101"), 405)):
        assert resp.status_code == status
        error = resp.json()["error"]
        assert error["code"] == "http_error" and error["request_id"] and "detail" not in resp.json()
