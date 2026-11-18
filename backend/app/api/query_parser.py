"""Deterministic extraction of count filters from a natural-language question.

"How many open high-priority tickets mention checkout failures?"
  -> status=open, priority=high, category=checkout

Only status, priority and *known* categories are recognised. Anything else in the
question is ignored (and the response says so) rather than guessed at.
"""

from __future__ import annotations

import re

from app.schemas import TicketFilters

_STATUS = [("open", r"\b(open|unresolved|outstanding|active)\b"), ("resolved", r"\b(resolved|closed|fixed)\b")]
_PRIORITY = re.compile(r"\b(high|medium|low)(?:[- ]priority)?\b")
_CATEGORY_ALIASES: dict[str, tuple[str, ...]] = {
    "account_access": ("account access", "login", "log in", "sign in", "sign-in", "mfa", "authenticator", "locked out"),
    "exports": ("export", "csv"),
    "notifications": ("notification", "email"),
    "integrations": ("integration", "sftp", "webhook"),
    "billing": ("invoice", "subscription", "proration", "plan change"),
    "checkout": ("payment",),
}


def _category_patterns(category: str) -> list[str]:
    words = category.replace("_", " ")
    singular = words[:-1] if words.endswith("s") else words
    return [words, singular, *_CATEGORY_ALIASES.get(category, ())]


def parse_count_filters(question: str, known_categories: list[str]) -> tuple[TicketFilters, list[str]]:
    text = question.lower()
    notes: list[str] = []
    status = None
    matched_status = [value for value, pattern in _STATUS if re.search(pattern, text)]
    if len(matched_status) == 1:
        status = matched_status[0]
        notes.append(f"status={status}")
    elif len(matched_status) > 1:
        notes.append("both open and resolved mentioned, so status was not filtered")

    priority = None
    priorities = sorted(set(_PRIORITY.findall(text)))
    if len(priorities) == 1:
        priority = priorities[0]
        notes.append(f"priority={priority}")
    elif len(priorities) > 1:
        notes.append("several priorities mentioned, so priority was not filtered")

    category = None
    matched_categories = [
        c for c in known_categories if any(re.search(rf"\b{re.escape(p)}", text) for p in _category_patterns(c))
    ]
    if len(matched_categories) == 1:
        category = matched_categories[0]
        notes.append(f"category={category}")
    elif len(matched_categories) > 1:
        notes.append(f"several categories mentioned ({', '.join(matched_categories)}), so category was not filtered")

    return TicketFilters(status=status, priority=priority, category=category), notes
