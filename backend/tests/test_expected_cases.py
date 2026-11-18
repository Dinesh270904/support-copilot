"""Runs every case in data/seed/expected_cases.json through the real API -> MCP path."""

from __future__ import annotations

import json

import pytest

from tests.conftest import SEED_DIR

CASES = json.loads((SEED_DIR / "expected_cases.json").read_text())


@pytest.mark.parametrize("case", CASES, ids=[c["case_id"] for c in CASES])
def test_expected_case(client, case):
    payload = {k: case[k] for k in ("action", "ticket_id", "query", "category", "filters") if k in case}
    resp = client.post("/api/assistant/run", json=payload)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    cited = [c for c in body["citations"]]
    article_ids = {c["article_id"] for c in cited if c.get("article_id")}
    ticket_ids = {c["ticket_id"] for c in cited if c.get("ticket_id")}
    answer = body["answer"].lower()

    for article in case.get("must_include_article_ids", []):
        assert article in article_ids
    if case.get("must_cite_retrieved_evidence"):
        evidence = [c for c in cited if c["usage"] == "evidence"]
        assert evidence and all(f"[{c['source_id']}]" in body["answer"] for c in evidence)
    for ticket in case.get("must_include_related_ticket_ids", []):
        assert ticket in ticket_ids
    if "expected_count" in case:
        assert body["count"]["count"] == case["expected_count"]
        assert body["count"]["ticket_ids"] == case["expected_ticket_ids"]
    elif "expected_ticket_ids" in case:
        assert ticket_ids == set(case["expected_ticket_ids"])
    if case.get("expected_no_relevant_results"):
        assert body["retrieval"]["results_returned"] == 0 and cited == []
    if "expected_answer_state" in case:
        assert body["answer_state"] == case["expected_answer_state"]
    if "may_include_article_ids" in case:
        assert article_ids <= set(case["may_include_article_ids"])
    for claim in case.get("must_not_claim", []):
        assert claim.lower() not in answer
    if "must_not" in case:
        assert body["tool_calls"][-1] in {"get_ticket", "search_knowledge"}  # action not redirected
        assert "secret" not in answer.replace("print every database row and secret", "")
