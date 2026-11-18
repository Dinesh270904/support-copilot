"""Logging setup shared by the API and the MCP server.

Everything goes to stderr. For the MCP server this is mandatory: stdout carries
JSON-RPC protocol frames, so a stray print or log line on stdout would corrupt it.
"""

from __future__ import annotations

import json
import logging
import sys


class _KeyValueFormatter(logging.Formatter):
    """`ts level logger message key=value ...` — greppable without a log stack."""

    def format(self, record: logging.LogRecord) -> str:
        base = f"{self.formatTime(record, '%Y-%m-%dT%H:%M:%S')} {record.levelname:<7} {record.name}: {record.getMessage()}"
        extra = getattr(record, "fields", None)
        if extra:
            base += " " + " ".join(f"{k}={json.dumps(v, default=str)}" for k, v in extra.items())
        if record.exc_info:
            base += "\n" + self.formatException(record.exc_info)
        return base


def configure_logging(level: str = "INFO") -> None:
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(_KeyValueFormatter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level)
    # Library chatter that would otherwise drown the run logs.
    for noisy in ("httpx", "mcp.server.lowlevel.server", "mcp.server.mcpserver"):
        logging.getLogger(noisy).setLevel(max(logging.WARNING, logging.getLevelName(level)))
