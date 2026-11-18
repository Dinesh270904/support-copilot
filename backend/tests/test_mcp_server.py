"""Requirement 3: the MCP server, launched over real stdio with the official client, lists its
tools/resources and returns correct results for tool calls and resource reads. Also
verifies the server's database handle is read-only."""

from __future__ import annotations

import asyncio
import json

import pytest
from mcp import ClientSession, StdioServerParameters, stdio_client
from mcp.shared.exceptions import MCPError
from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from app.config import BACKEND_DIR
from app.db import make_engine


def _params(python: str, db) -> StdioServerParameters:
    return StdioServerParameters(
        command=python, args=["-m", "app.mcp_server"], cwd=str(BACKEND_DIR), env={"SUPPORT_COPILOT_DB": str(db)}
    )


async def _with_session(params, fn):
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            return await fn(session)


@pytest.fixture(scope="module")
def mcp_results(python, seeded_db):
    async def scenario(s: ClientSession):
        out = {}
        out["tools"] = {t.name: t for t in (await s.list_tools()).tools}
        out["templates"] = [t.uri_template for t in (await s.list_resource_templates()).resource_templates]
        out["resources"] = [str(r.uri) for r in (await s.list_resources()).resources]
        out["knowledge"] = await s.call_tool(
            "search_knowledge", {"query": "large CSV export background job", "category": "exports", "top_k": 2}
        )
        out["ticket"] = await s.call_tool("get_ticket", {"ticket_id": "T-104"})
        out["missing"] = await s.call_tool("get_ticket", {"ticket_id": "T-999"})
        out["bad_id"] = await s.call_tool("get_ticket", {"ticket_id": "T-1; DROP TABLE tickets"})
        out["similar"] = await s.call_tool(
            "search_resolved_tickets", {"query": "replaced phone lost authenticator", "category": "account_access"}
        )
        out["count"] = await s.call_tool("count_tickets", {"filters": {"status": "open", "priority": "high"}})
        out["count_bad"] = await s.call_tool("count_tickets", {"filters": {"status": "deleted"}})
        out["resource_ticket"] = await s.read_resource("support://tickets/T-105")
        out["resource_article"] = await s.read_resource("support://knowledge/KB-04")
        try:
            await s.read_resource("support://tickets/T-999")
            out["resource_missing"] = None
        except MCPError as exc:
            out["resource_missing"] = str(exc)
        return out

    return asyncio.run(_with_session(_params(python, seeded_db), scenario))


def test_lists_typed_read_only_tools(mcp_results):
    tools = mcp_results["tools"]
    assert set(tools) == {"get_ticket", "search_knowledge", "search_resolved_tickets", "count_tickets"}
    for tool in tools.values():
        assert tool.description
        assert tool.annotations and tool.annotations.read_only_hint is True
        assert tool.output_schema is not None  # typed structured output
    schema = tools["search_knowledge"].input_schema["properties"]
    assert schema["query"]["maxLength"] == 500
    assert schema["top_k"]["maximum"] == 10


def test_lists_resource_templates_and_resources(mcp_results):
    assert set(mcp_results["templates"]) == {"support://tickets/{ticket_id}", "support://knowledge/{article_id}"}
    assert set(mcp_results["resources"]) == {"support://knowledge", "support://index/status"}


def test_search_knowledge_tool_returns_chunks_ids_excerpts_scores(mcp_results):
    res = mcp_results["knowledge"]
    assert not res.is_error
    data = res.structured_content
    assert data["method"] == "tfidf_cosine" and data["category"] == "exports"
    top = data["results"][0]
    assert top["chunk_id"] == "KB-04#chunk-1" and top["article_id"] == "KB-04"
    assert "background export job" in top["excerpt"] and top["score"] >= data["min_score"]


def test_get_ticket_and_error_cases(mcp_results):
    ticket = mcp_results["ticket"].structured_content
    assert ticket["id"] == "T-104" and len(ticket["messages"]) == 2
    assert mcp_results["missing"].is_error and "[not_found]" in mcp_results["missing"].content[0].text
    assert mcp_results["bad_id"].is_error and "pattern" in mcp_results["bad_id"].content[0].text
    assert mcp_results["count_bad"].is_error


def test_similar_tickets_and_counts(mcp_results):
    similar = mcp_results["similar"].structured_content
    assert similar["method"] == "sqlite_fts5_bm25"
    assert [r["ticket_id"] for r in similar["results"]] == ["T-105"]
    count = mcp_results["count"].structured_content
    assert count["count"] == 4 and set(count["ticket_ids"]) == {"T-101", "T-104", "T-108", "T-112"}


def test_resource_reads(mcp_results):
    ticket = json.loads(mcp_results["resource_ticket"].contents[0].text)
    assert ticket["id"] == "T-105" and ticket["status"] == "resolved"
    article = json.loads(mcp_results["resource_article"].contents[0].text)
    assert article["id"] == "KB-04" and article["chunk_ids"] == ["KB-04#chunk-1", "KB-04#chunk-2"]
    assert "does not exist" in mcp_results["resource_missing"]


def test_mcp_database_handle_is_read_only(seeded_db):
    engine = make_engine(seeded_db, read_only=True)
    with engine.connect() as conn:
        assert conn.execute(text("SELECT count(*) FROM tickets")).scalar() == 12
        with pytest.raises(OperationalError, match="readonly|read-only|query_only"):
            conn.execute(text("UPDATE tickets SET title = 'x' WHERE id = 'T-101'"))
    engine.dispose()
