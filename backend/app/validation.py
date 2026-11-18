"""Identifier patterns and untrusted-content detection shared by the API and MCP server."""

from __future__ import annotations

import re

TICKET_ID_PATTERN = r"^T-\d{3,6}$"
ARTICLE_ID_PATTERN = r"^KB-\d{2,6}$"
CATEGORY_PATTERN = r"^[a-z][a-z_]{1,39}$"

TICKET_ID_RE = re.compile(TICKET_ID_PATTERN)
ARTICLE_ID_RE = re.compile(ARTICLE_ID_PATTERN)

# Phrases typical of prompt-injection / tool-abuse attempts. Detection only *flags*
# content for the agent; it is not the security boundary. The boundary is structural:
# actions map to fixed, allow-listed tool plans, tools take typed parameters, and the
# MCP server's database handle is read-only. Text is never interpreted as a command.
_INSTRUCTION_LIKE = re.compile(
    r"ignore (?:all |any )?(?:prior|previous|above|earlier) instructions"
    r"|disregard (?:all |any )?(?:prior|previous|above) "
    r"|print (?:every|all) (?:database )?(?:rows?|records?|secrets?)"
    r"|(?:reveal|show|print|dump) (?:the )?(?:system prompt|secrets?|credentials?|api keys?|passwords?)"
    r"|\b(?:drop|truncate|alter)\s+table\b"
    r"|\bdelete\s+from\b|\binsert\s+into\b|\bselect\s+\*\s+from\b"
    r"|\b(?:you are now|act as|new instructions:)",
    re.IGNORECASE,
)


def is_instruction_like(text: str) -> bool:
    return bool(_INSTRUCTION_LIKE.search(text))
