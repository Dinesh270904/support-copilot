"""Similar-ticket search (SQLite FTS5 bm25) needs a relevance floor: a resolved ticket is a
match only if it shares >= 2 distinct query terms (or the query has just one term). One shared
common word ("email", "invoice") must not turn an unrelated question into "similar tickets"."""

from __future__ import annotations

import pytest

from app import repository
from app.db import make_engine, make_sessionmaker


@pytest.fixture()
def session(seeded_db):
    engine = make_engine(seeded_db, read_only=True)
    with make_sessionmaker(engine)() as s:
        yield s
    engine.dispose()


def search(session, query, **kw):
    kw = {"category": None, "exclude_ticket_id": None, "limit": 3, **kw}
    return repository.search_resolved_tickets(session, query, **kw)[1]


@pytest.mark.parametrize("query", ["customer asks about weather in Paris and email", "invoice for our kubernetes cluster"])
def test_one_shared_common_word_is_not_a_similar_ticket(session, query):
    assert search(session, query) == []


def test_real_matches_survive_the_floor(session):
    hits = search(session, "replaced phone and lost access to authenticator", category="account_access")
    assert [h.ticket_id for h in hits] == ["T-105"]
    hits = search(session, "large CSV report export times out; background job")
    assert hits[0].ticket_id == "T-109"


def test_single_term_query_is_allowed_one_match(session):
    assert [h.ticket_id for h in search(session, "proration")] == ["T-107"]


def test_matched_terms_are_shown_and_really_in_the_ticket(session):
    hit = search(session, "large CSV report export times out; background job")[0]
    assert {"csv", "export"} <= set(hit.matched_terms)
    ticket = repository.get_ticket(session, hit.ticket_id)
    text = " ".join([ticket.title, ticket.description, ticket.resolution_summary or "", *(m.text for m in ticket.messages)]).lower()
    assert all(term in text for term in hit.matched_terms)


def test_weak_match_does_not_crowd_out_a_strong_one(session):
    # Many resolved tickets contain "email"/"report"; the two-term match must still be returned.
    hits = search(session, "notification emails routed to spam", limit=1)
    assert [h.ticket_id for h in hits] == ["T-111"]


def test_api_reports_no_results_for_an_unrelated_question(client):
    body = client.post(
        "/api/assistant/run",
        json={"action": "search_resolved_tickets", "query": "customer asks about weather in Paris and email"},
    ).json()
    assert body["answer_state"] == "no_results" and body["citations"] == []


def test_api_citation_carries_matched_terms(client):
    body = client.post(
        "/api/assistant/run",
        json={"action": "search_resolved_tickets", "ticket_id": "T-108", "query": "large CSV export times out; background job"},
    ).json()
    assert body["citations"][0]["source_id"] == "T-109"
    assert {"csv", "export"} <= set(body["citations"][0]["matched_terms"])
