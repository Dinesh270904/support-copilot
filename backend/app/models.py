"""Relational schema (SQLAlchemy 2.0 ORM). The Alembic migration is the source of truth
for DDL; these models mirror it. The FTS5 table `ticket_search` is created in the
migration only, because FTS5 virtual tables are not expressible as ORM tables.

Timestamps are stored as ISO-8601 UTC strings (`2026-11-12T09:15:00Z`): they sort
lexicographically, keep the `Z` suffix that SQLite DateTime would drop, and match the
fixed seed data exactly.
"""

from __future__ import annotations

from sqlalchemy import JSON, CheckConstraint, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

TICKET_STATUSES = ("open", "resolved")
TICKET_PRIORITIES = ("low", "medium", "high")
MESSAGE_AUTHORS = ("customer", "agent")


def _in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


class Base(DeclarativeBase):
    pass


class Ticket(Base):
    __tablename__ = "tickets"
    __table_args__ = (
        CheckConstraint(_in("status", TICKET_STATUSES), name="ck_tickets_status"),
        CheckConstraint(_in("priority", TICKET_PRIORITIES), name="ck_tickets_priority"),
        Index("ix_tickets_status_priority_category", "status", "priority", "category"),
        Index("ix_tickets_category", "category"),
        Index("ix_tickets_updated_at", "updated_at"),
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(64))
    priority: Mapped[str] = mapped_column(String(16))
    status: Mapped[str] = mapped_column(String(16))
    product_area: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[str] = mapped_column(String(32))
    updated_at: Mapped[str] = mapped_column(String(32))
    resolution_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_at: Mapped[str | None] = mapped_column(String(32), nullable=True)

    messages: Mapped[list[TicketMessage]] = relationship(
        back_populates="ticket", order_by="TicketMessage.position", cascade="all, delete-orphan"
    )


class TicketMessage(Base):
    __tablename__ = "ticket_messages"
    __table_args__ = (
        UniqueConstraint("ticket_id", "position", name="uq_ticket_messages_ticket_position"),
        CheckConstraint(_in("author", MESSAGE_AUTHORS), name="ck_ticket_messages_author"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ticket_id: Mapped[str] = mapped_column(ForeignKey("tickets.id", ondelete="CASCADE"))
    position: Mapped[int] = mapped_column(Integer)
    author: Mapped[str] = mapped_column(String(16))
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[str] = mapped_column(String(32))

    ticket: Mapped[Ticket] = relationship(back_populates="messages")


class Article(Base):
    __tablename__ = "articles"
    __table_args__ = (Index("ix_articles_category", "category"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    category: Mapped[str] = mapped_column(String(64))
    tags: Mapped[list[str]] = mapped_column(JSON)
    applies_to: Mapped[str] = mapped_column(String(64))
    body: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[str] = mapped_column(String(32))

    chunks: Mapped[list[ArticleChunk]] = relationship(
        back_populates="article", order_by="ArticleChunk.position", cascade="all, delete-orphan"
    )


class ArticleChunk(Base):
    """A retrieval unit. Title/category are denormalised so a chunk is self-describing
    in search results and citations without a join."""

    __tablename__ = "article_chunks"
    __table_args__ = (
        UniqueConstraint("article_id", "position", name="uq_article_chunks_article_position"),
        Index("ix_article_chunks_category", "category"),
    )

    chunk_id: Mapped[str] = mapped_column(String(48), primary_key=True)  # e.g. KB-03#chunk-1
    article_id: Mapped[str] = mapped_column(ForeignKey("articles.id", ondelete="CASCADE"))
    position: Mapped[int] = mapped_column(Integer)  # 1-based
    title: Mapped[str] = mapped_column(String(200))
    category: Mapped[str] = mapped_column(String(64))
    text: Mapped[str] = mapped_column(Text)
    word_count: Mapped[int] = mapped_column(Integer)

    article: Mapped[Article] = relationship(back_populates="chunks")


class AssistantRun(Base):
    """Audit/diagnostic record of one assistant action. Deliberately stores no ticket
    text and no query text — only its length — to avoid copying customer content."""

    __tablename__ = "assistant_runs"
    __table_args__ = (
        Index("ix_assistant_runs_created_at", "created_at"),
        Index("ix_assistant_runs_ticket_id", "ticket_id"),
    )

    run_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    created_at: Mapped[str] = mapped_column(String(32))
    action: Mapped[str] = mapped_column(String(48))
    ticket_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    status: Mapped[str] = mapped_column(String(16))  # success | error
    answer_state: Mapped[str | None] = mapped_column(String(32), nullable=True)
    tool_calls: Mapped[list[str]] = mapped_column(JSON)
    retrieval_method: Mapped[str | None] = mapped_column(String(48), nullable=True)
    source_ids: Mapped[list[str]] = mapped_column(JSON)
    query_chars: Mapped[int] = mapped_column(Integer)
    duration_ms: Mapped[int] = mapped_column(Integer)
    error_code: Mapped[str | None] = mapped_column(String(48), nullable=True)
