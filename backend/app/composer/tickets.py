"""Deterministic composers for ticket-centric actions (summary, similar tickets, counts)."""

from __future__ import annotations

import re

from app.composer.types import Citation, Composed, Section
from app.schemas import ResolvedTicketSearchResult, TicketCountResult, TicketDetail, TicketFilters
from app.validation import is_instruction_like

# Fixed per-category intake checklists: (what is needed, regex that shows it is already
# present in the ticket text). These are templates maintained by the support team, not
# inferred facts; detection is keyword-based and deliberately conservative.
INTAKE_CHECKLISTS: dict[str, list[tuple[str, str]]] = {
    "checkout": [
        ("Order ID or gateway transaction reference", r"\b(transaction|order) (id|reference|ref|number)\b"),
        ("Gateway payment status checked by support (pending / captured / none)", r"\bgateway status (is|was)\b|\bcaptured\b"),
        ("Approximate time of the payment attempt", r"\b\d{1,2}:\d{2}\b|\bat about\b|\baround \d"),
    ],
    "account_access": [
        ("Whether the customer still has a saved backup code", r"\bbackup code"),
        ("Identity verified through the account recovery process", r"\b(identity|recovery) (verified|confirmed|check)"),
    ],
    "billing": [
        ("Effective plan-change date", r"\b\d{4}-\d{2}-\d{2}\b|\bchanged (plans? )?on\b"),
        ("Invoice ID and invoice period", r"\binvoice (id|number|#|period)\b"),
    ],
    "exports": [
        ("Approximate row count of the report", r"\d[\d,]*[- ]rows?\b"),
        ("Export ID and failure time, if a background job failed", r"\bexport id\b"),
    ],
    "notifications": [
        ("Account email address is verified", r"\bverified\b"),
        ("Spam / quarantine folders checked", r"\bspam\b|\bquarantine\b"),
        ("Message type and approximate request time", r"\b\d{1,2}:\d{2}\b"),
    ],
    "integrations": [
        ("Integration type and destination system", r"\b(sftp|webhook|api|s3|ftp)\b"),
        ("Required schedule / frequency", r"\b(daily|weekly|hourly|monthly|every)\b"),
        ("Data set or report to be delivered", r"\breport name\b|\bwhich reports?\b"),
    ],
}
_DEFAULT_CHECKLIST = [("Steps to reproduce", r"\bsteps?\b"), ("Expected vs actual behaviour", r"\bexpected\b")]

_ERROR_CODE = re.compile(r"\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b")
_ACRONYM = re.compile(r"\b[A-Z]{2,6}\b")
_QUANTITY = re.compile(r"\b\d{1,3}(?:,\d{3})+(?:[- ]\w+)?|\b\d+[- ](?:rows?|minutes?|hours?|days?|attempts?|times)\b")


def _fmt_ts(ts: str) -> str:
    return ts.replace("T", " ").replace("Z", " UTC")


def _dedupe(items: list[str]) -> list[str]:
    return list(dict.fromkeys(items))


def _short(text: str, limit: int = 90) -> str:
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def compose_ticket_summary(ticket: TicketDetail) -> Composed:
    warnings: list[str] = []
    safe_texts = [ticket.title, ticket.description]
    timeline: list[str] = []
    for m in ticket.messages:
        if is_instruction_like(m.text):
            warnings.append(
                f"Message {m.position} ({m.author}) contains instruction-like text. It was treated as untrusted "
                "data: it is not summarised as a request and did not change the action or tools."
            )
            timeline.append(f"{_fmt_ts(m.at)} · {m.author}: [instruction-like content withheld from summary — see ticket timeline]")
        else:
            safe_texts.append(m.text)
            timeline.append(f"{_fmt_ts(m.at)} · {m.author}: {m.text}")

    corpus = "\n".join(safe_texts)
    facts = [f"Customer-reported issue: {ticket.description}"]
    codes = _dedupe(_ERROR_CODE.findall(corpus))
    if codes:
        facts.append(f"Error codes mentioned: {', '.join(codes)}")
    terms = _dedupe(t for t in _ACRONYM.findall(corpus) if t not in codes and t not in {"ID", "OK"})
    if terms:
        facts.append(f"Products / protocols mentioned: {', '.join(terms)}")
    quantities = _dedupe(_QUANTITY.findall(corpus))
    if quantities:
        facts.append(f"Quantities mentioned: {', '.join(quantities)}")
    last_agent = next((m for m in reversed(ticket.messages) if m.author == "agent"), None)
    if last_agent and not is_instruction_like(last_agent.text):
        facts.append(f"Latest agent update ({_fmt_ts(last_agent.at)}): {last_agent.text}")
    if ticket.resolution_summary:
        facts.append(f"Resolution: {ticket.resolution_summary}")

    checklist = INTAKE_CHECKLISTS.get(ticket.category, _DEFAULT_CHECKLIST)
    lowered = corpus.lower()
    needed = [item for item, pattern in checklist if not re.search(pattern, lowered)]
    present = [item for item, pattern in checklist if re.search(pattern, lowered)]

    answer = (
        f"{ticket.id} is {'an' if ticket.status[0] in 'aeiou' else 'a'} {ticket.status}, {ticket.priority}-priority {ticket.category.replace('_', ' ')} ticket "
        f"(product area: {ticket.product_area}), opened {_fmt_ts(ticket.created_at)} and last updated "
        f"{_fmt_ts(ticket.updated_at)}, with {len(ticket.messages)} message(s). {ticket.title}."
    )
    sections = [
        Section(title="Key facts from the ticket", items=facts),
        Section(
            title=f"Information still needed ({ticket.category.replace('_', ' ')} intake checklist)",
            items=needed or ["All checklist items appear in the ticket text."],
        ),
        Section(title="Timeline", items=timeline),
    ]
    if present:
        sections.insert(2, Section(title="Checklist items already present", items=present))
    return Composed(
        answer_state="answered",
        answer=answer,
        sections=sections,
        citations=[
            Citation(
                source_id=ticket.id,
                source_type="ticket",
                title=ticket.title,
                excerpt=_short(ticket.description, 240),
                ticket_id=ticket.id,
                usage="ticket_record",
            )
        ],
        limitations=[
            "Summary is assembled from ticket fields and messages; nothing is inferred beyond them.",
            "‘Information still needed’ uses a fixed per-category checklist with keyword detection; "
            "an item may be present in wording the checklist does not recognise.",
        ],
        warnings=warnings,
    )


def compose_similar_tickets(result: ResolvedTicketSearchResult) -> Composed:
    if not result.results:
        scope = f" in category '{result.category}'" if result.category else ""
        return Composed(
            answer_state="no_results",
            answer=f"No similar resolved tickets found{scope}. Nothing in ticket history supports a known fix.",
            limitations=["Similarity is keyword-based (FTS5 bm25); differently worded tickets can be missed."],
        )
    lines = []
    citations = []
    for hit in result.results:
        fix = hit.resolution_summary or "No resolution summary was recorded."
        lines.append(f"- {hit.ticket_id} “{hit.title}”: {fix} [{hit.ticket_id}]")
        citations.append(
            Citation(
                source_id=hit.ticket_id,
                source_type="ticket",
                title=hit.title,
                excerpt=hit.snippet,
                score=hit.score,
                score_type="bm25",
                matched_terms=hit.matched_terms,
                ticket_id=hit.ticket_id,
                usage="similar_ticket",
            )
        )
    return Composed(
        answer_state="answered",
        answer=f"{len(result.results)} similar resolved ticket(s), best match first. What fixed them:\n" + "\n".join(lines),
        citations=citations,
        limitations=[
            "Ranked by keyword relevance (FTS5 bm25, porter stemming); scores are relative within this result only. "
            "A ticket must share at least 2 query terms to be listed.",
            "A past fix is a precedent, not a confirmed resolution for this ticket.",
        ],
    )


def describe_filters(filters: TicketFilters) -> str:
    parts = [f"{k}={v}" for k, v in filters.model_dump().items() if v is not None]
    return ", ".join(parts) if parts else "no filters (all tickets)"


def compose_count(result: TicketCountResult, interpreted_from_query: list[str]) -> Composed:
    ids = ", ".join(result.ticket_ids) if result.ticket_ids else "none"
    answer = f"{result.count} ticket(s) match {describe_filters(result.filters)}. Matching IDs: {ids}."
    limitations = []
    if interpreted_from_query:
        limitations.append("Filters read from the question: " + "; ".join(interpreted_from_query) + ".")
    limitations.append(
        "Counts use structured status/priority/category fields only; other words in the question are not used "
        "for matching."
    )
    return Composed(
        answer_state="answered" if result.count else "no_results",
        answer=answer,
        citations=[
            Citation(source_id=tid, source_type="ticket", title=tid, excerpt="", ticket_id=tid, usage="ticket_record")
            for tid in result.ticket_ids
        ],
        limitations=limitations,
    )
