"""Minimal MCP client check (an alternative to the MCP Inspector).

    python scripts/mcp_check.py

Launches the server over stdio with the official SDK client, lists tools, resource
templates and resources, calls one tool and reads one resource.
"""

import asyncio
import json
import sys
from pathlib import Path

from mcp import ClientSession, StdioServerParameters, stdio_client

BACKEND = Path(__file__).resolve().parent.parent


async def main() -> None:
    params = StdioServerParameters(command=sys.executable, args=["-m", "app.mcp_server"], cwd=str(BACKEND))
    async with stdio_client(params) as (read, write), ClientSession(read, write) as session:
        init = await session.initialize()
        print(f"server: {init.server_info.name} (protocol {init.protocol_version})")
        print("tools:", [t.name for t in (await session.list_tools()).tools])
        print("resource templates:", [t.uri_template for t in (await session.list_resource_templates()).resource_templates])
        print("resources:", [str(r.uri) for r in (await session.list_resources()).resources])
        result = await session.call_tool(
            "search_knowledge", {"query": "lost authenticator backup code", "category": "account_access"}
        )
        top = result.structured_content["results"][0]
        print(f"search_knowledge -> {top['chunk_id']} score={top['score']}")
        res = await session.read_resource("support://tickets/T-104")
        print("support://tickets/T-104 ->", json.loads(res.contents[0].text)["title"])


if __name__ == "__main__":
    asyncio.run(main())
