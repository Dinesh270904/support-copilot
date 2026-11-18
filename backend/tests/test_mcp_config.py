"""backend/mcp.json is what MCP clients (Inspector, Claude Desktop, ...) launch. Plain `python3` is
not enough: it is usually a different interpreter without the project's dependencies."""

import json

from app.config import BACKEND_DIR


def test_mcp_json_launches_the_project_venv_interpreter():
    server = json.loads((BACKEND_DIR / "mcp.json").read_text())["mcpServers"]["support-copilot"]
    assert server["command"] == ".venv/bin/python"
    assert server["args"] == ["-m", "app.mcp_server"] and server["cwd"] == "."
