"""All SQL lives here. Both processes import it, so there is one implementation of each
query; what differs is the privilege of the session passed in (the MCP server's is
read-only). Every query is built with SQLAlchemy expressions or bound parameters —
no string-formatted SQL. FTS5 MATCH input is reduced to quoted alphanumeric terms.
"""

from __future__ import annotations

import re
from collections.abc import Sequence

from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS
from sqlalchemy import Select, case, func, select, text
from sqlalchemy.orm import Session, selectinload

from app.models import Article, ArticleChunk, Ticket
from app.rag.index import ChunkRecord
from app.rag.stemming import stem
from app.schemas import (
    ArticleDetail,
    Message,
    ResolvedTicketHit,
    TicketCountResult,
    TicketDetail,
    TicketFilters,
    TicketListItem,
)

MAX_COUNT_IDS = 100
_FTS_TERM = re.compile(r"[a-z0-9]+")
_MAX_FTS_TERMS = 24
# Relevance floor for similar tickets: distinct matched terms needed (or all of them, if the query
# has fewer). A single shared common word ("email", "invoice") is not similarity.
MIN_MATCHED_TERMS = 2
# A term present in more than this share of the indexed tickets ("customer": 75% here) carries no
# similarity signal and does not count toward the floor.
MAX_TERM_DOC_SHARE = 0.5
_FETCH_LIMIT = 50  # rows pulled before the floor is applied, so weak matches cannot crowd out strong ones
_MARK = re.compile(r"<<(.+?)>>")


# ---------------------------------------------------------------- serialisation
def to_list_item(t: Ticket) -> TicketListItem:
    return TicketListItem(
        id=t.id,
        title=t.title,
        category=t.category,
        priority=t.priority,  # type: ignore[arg-type]
        status=t.status,  # type: ignore[arg-type]
        product_area=t.product_area,
        created_at=t.created_at,
        updated_at=t.updated_at,
        reviewed_at=t.reviewed_at,
    )


def to_detail(t: Ticket) -> TicketDetail:
    return TicketDetail(
        **to_list_item(t).model_dump(),
        description=t.description,
        resolution_summary=t.resolution_summary,
        messages=[Message(position=m.position, author=m.author, text=m.text, at=m.created_at) for m in t.messages],  # type: ignore[arg-type]
    )


# ---------------------------------------------------------------- tickets
def _apply_filters(stmt: Select, filters: TicketFilters) -> Select:
    if filters.status:
        stmt = stmt.where(Ticket.status == filters.status)
    if filters.priority:
        stmt = stmt.where(Ticket.priority == filters.priority)
    if filters.category:
        stmt = stmt.where(Ticket.category == filters.category)
    return stmt


def list_tickets(
    session: Session, filters: TicketFilters, *, reviewed: bool | None = None, limit: int = 50, offset: int = 0
) -> tuple[list[TicketListItem], int]:
    stmt = _apply_filters(select(Ticket), filters)
    if reviewed is not None:
        stmt = stmt.where(Ticket.reviewed_at.is_not(None) if reviewed else Ticket.reviewed_at.is_(None))
    total = session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    # Open work first, then most urgent, then most recently updated.
    priority_rank = case({"high": 0, "medium": 1, "low": 2}, value=Ticket.priority, else_=3)
    rows = session.scalars(
        stmt.order_by(Ticket.status.asc(), priority_rank.asc(), Ticket.updated_at.desc(), Ticket.id.asc())
        .limit(limit)
        .offset(offset)
    ).all()
    return [to_list_item(t) for t in rows], total


def get_ticket(session: Session, ticket_id: str) -> TicketDetail | None:
    ticket = session.scalar(select(Ticket).options(selectinload(Ticket.messages)).where(Ticket.id == ticket_id))
    return to_detail(ticket) if ticket else None


def count_tickets(session: Session, filters: TicketFilters) -> TicketCountResult:
    ids = session.scalars(_apply_filters(select(Ticket.id), filters).order_by(Ticket.id)).all()
    return TicketCountResult(count=len(ids), ticket_ids=list(ids[:MAX_COUNT_IDS]), filters=filters)


def known_categories(session: Session) -> list[str]:
    ticket_cats = session.scalars(select(Ticket.category).distinct()).all()
    article_cats = session.scalars(select(Article.category).distinct()).all()
    return sorted(set(ticket_cats) | set(article_cats))


def mark_reviewed(session: Session, ticket_id: str, reviewed_at: str) -> TicketDetail | None:
    """Idempotent: the first review timestamp wins; repeated calls do not overwrite it."""
    ticket = session.get(Ticket, ticket_id)
    if ticket is None:
        return None
    session.execute(
        Ticket.__table__.update()
        .where(Ticket.id == ticket_id, Ticket.reviewed_at.is_(None))
        .values(reviewed_at=reviewed_at)
    )
    session.flush()
    session.refresh(ticket)
    return get_ticket(session, ticket_id)


# ---------------------------------------------------------------- articles / chunks
def get_article(session: Session, article_id: str) -> ArticleDetail | None:
    article = session.scalar(select(Article).options(selectinload(Article.chunks)).where(Article.id == article_id))
    if article is None:
        return None
    return ArticleDetail(
        id=article.id,
        title=article.title,
        category=article.category,
        tags=list(article.tags),
        applies_to=article.applies_to,
        updated_at=article.updated_at,
        body=article.body,
        chunk_ids=[c.chunk_id for c in article.chunks],
    )


def list_article_index(session: Session) -> list[dict[str, str]]:
    rows = session.execute(select(Article.id, Article.title, Article.category).order_by(Article.id)).all()
    return [{"id": r.id, "title": r.title, "category": r.category} for r in rows]


def load_chunk_records(session: Session) -> list[ChunkRecord]:
    rows = session.execute(
        select(ArticleChunk, Article.tags).join(Article).order_by(ArticleChunk.article_id, ArticleChunk.position)
    ).all()
    return [
        ChunkRecord(
            chunk_id=c.chunk_id,
            article_id=c.article_id,
            position=c.position,
            title=c.title,
            category=c.category,
            text=c.text,
            tags=tuple(tags),
        )
        for c, tags in rows
    ]


# ---------------------------------------------------------------- FTS5 similar-ticket search
def _fts_terms(raw: str) -> list[str]:
    terms: list[str] = []
    for term in _FTS_TERM.findall(raw.lower()):
        if len(term) > 1 and term not in ENGLISH_STOP_WORDS and term not in terms:
            terms.append(term)
    return terms[:_MAX_FTS_TERMS]


def build_fts_query(raw: str) -> str:
    """Turn free text into a safe FTS5 expression: quoted alphanumeric terms joined by OR.

    Quoting every term neutralises FTS5 operators (NEAR, *, ^, column filters, quotes)
    so user text can only ever be matched as words, never parsed as query syntax.
    """
    return " OR ".join(f'"{t}"' for t in _fts_terms(raw))


def search_resolved_tickets(
    session: Session, query: str, *, category: str | None, exclude_ticket_id: str | None, limit: int
) -> tuple[str, list[ResolvedTicketHit]]:
    fts_query = build_fts_query(query)
    if not fts_query:
        return fts_query, []
    terms = _fts_terms(query)
    total = session.scalar(text("SELECT count(*) FROM ticket_search")) or 1
    ubiquitous = {
        stem(t)
        for t in terms
        if (session.scalar(text("SELECT count(*) FROM ticket_search WHERE ticket_search MATCH :t"), {"t": f'"{t}"'}) or 0)
        / total
        > MAX_TERM_DOC_SHARE
    }
    informative = {stem(t) for t in terms} - ubiquitous
    if not informative:  # a query made only of words found in most tickets says nothing specific
        return fts_query, []
    needed = min(MIN_MATCHED_TERMS, len(informative))
    # bm25 column weights: ticket_id (unindexed), title, description, conversation, resolution.
    rows = session.execute(
        text(
            """
            SELECT t.id, t.title, t.category, t.resolution_summary,
                   snippet(ticket_search, -1, '[', ']', '…', 14) AS snip,
                   highlight(ticket_search, 1, '<<', '>>') || ' ' || highlight(ticket_search, 2, '<<', '>>') || ' '
                     || highlight(ticket_search, 3, '<<', '>>') || ' ' || highlight(ticket_search, 4, '<<', '>>') AS marked,
                   bm25(ticket_search, 0.0, 2.0, 1.0, 1.0, 1.5) AS rank
            FROM ticket_search
            JOIN tickets AS t ON t.id = ticket_search.ticket_id
            WHERE ticket_search MATCH :q
              AND t.status = 'resolved'
              AND (:category IS NULL OR t.category = :category)
              AND (:exclude IS NULL OR t.id != :exclude)
            ORDER BY rank
            LIMIT :limit
            """
        ),
        {"q": fts_query, "category": category, "exclude": exclude_ticket_id, "limit": _FETCH_LIMIT},
    ).all()
    hits: list[ResolvedTicketHit] = []
    for r in rows:
        words = sorted({m.lower() for m in _MARK.findall(r.marked)})
        if len({stem(w) for w in words} - ubiquitous) < needed:  # distinct stems: "invoice"/"invoices" once
            continue
        hits.append(
            ResolvedTicketHit(
                ticket_id=r.id,
                title=r.title,
                category=r.category,
                resolution_summary=r.resolution_summary,
                snippet=r.snip,
                matched_terms=words,
                score=round(-float(r.rank), 4),
            )
        )
        if len(hits) == limit:
            break
    return fts_query, hits


def rebuild_ticket_search(session: Session, ticket_ids: Sequence[str] | None = None) -> None:
    """(Re)index ticket text into FTS5. Called by the seed; tickets are otherwise immutable
    in this prototype (only reviewed_at changes, which is not indexed)."""
    stmt = select(Ticket).options(selectinload(Ticket.messages))
    if ticket_ids is not None:
        stmt = stmt.where(Ticket.id.in_(ticket_ids))
        for tid in ticket_ids:
            session.execute(text("DELETE FROM ticket_search WHERE ticket_id = :id"), {"id": tid})
    for t in session.scalars(stmt).all():
        session.execute(
            text(
                "INSERT INTO ticket_search (ticket_id, title, description, conversation, resolution) "
                "VALUES (:id, :title, :description, :conversation, :resolution)"
            ),
            {
                "id": t.id,
                "title": t.title,
                "description": t.description,
                "conversation": "\n".join(m.text for m in t.messages),
                "resolution": t.resolution_summary or "",
            },
        )
