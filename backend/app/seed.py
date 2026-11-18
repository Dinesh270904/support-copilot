"""Repeatable setup: migrate, validate the JSON data pack, load SQLite, chunk articles,
populate the FTS5 ticket index, and verify the TF-IDF index builds.

    python -m app.seed            # migrate + reset data to the data pack
    python -m app.seed --check    # only report counts and index stats

The load is idempotent: it replaces tickets/articles/chunks/FTS rows in one transaction,
so re-running always yields the same database. `assistant_runs` (audit log) is kept.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import datetime
from pathlib import Path
from typing import Annotated, Literal

from alembic import command
from alembic.config import Config
from pydantic import AfterValidator, BaseModel, ConfigDict, Field
from sqlalchemy import delete, func, select, text

from app.config import BACKEND_DIR, get_settings
from app.db import make_engine, make_sessionmaker
from app.logging_config import configure_logging
from app.models import Article, ArticleChunk, Ticket, TicketMessage
from app.rag.chunking import chunk_article
from app.repository import load_chunk_records, rebuild_ticket_search
from app.rag.index import TfidfIndex
from app.validation import ARTICLE_ID_PATTERN, CATEGORY_PATTERN, TICKET_ID_PATTERN

log = logging.getLogger("support_copilot.seed")


def _check_ts(value: str) -> str:
    datetime.fromisoformat(value.replace("Z", "+00:00"))  # raises on malformed timestamps
    return value


Timestamp = Annotated[str, AfterValidator(_check_ts)]


class SeedMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    at: Timestamp
    author: Literal["customer", "agent"]
    text: str = Field(min_length=1)


class SeedTicket(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(pattern=TICKET_ID_PATTERN)
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1)
    category: str = Field(pattern=CATEGORY_PATTERN)
    priority: Literal["low", "medium", "high"]
    status: Literal["open", "resolved"]
    created_at: Timestamp
    updated_at: Timestamp
    product_area: str
    messages: list[SeedMessage]
    resolution_summary: str | None = None
    reviewed_at: Timestamp | None = None


class SeedArticle(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(pattern=ARTICLE_ID_PATTERN)
    title: str = Field(min_length=1, max_length=200)
    category: str = Field(pattern=CATEGORY_PATTERN)
    tags: list[str]
    updated_at: Timestamp
    applies_to: str
    body: str = Field(min_length=1)


def load_pack(seed_dir: Path) -> tuple[list[SeedTicket], list[SeedArticle]]:
    tickets = [SeedTicket.model_validate(t) for t in json.loads((seed_dir / "tickets.json").read_text("utf-8"))]
    articles = [
        SeedArticle.model_validate(a) for a in json.loads((seed_dir / "knowledge_articles.json").read_text("utf-8"))
    ]
    for kind, ids in (("ticket", [t.id for t in tickets]), ("article", [a.id for a in articles])):
        dupes = {i for i in ids if ids.count(i) > 1}
        if dupes:
            raise ValueError(f"Duplicate {kind} IDs in data pack: {sorted(dupes)}")
    return tickets, articles


def run_migrations(db_path: Path) -> None:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("sqlalchemy.url", f"sqlite+pysqlite:///{db_path.as_posix()}")
    db_path.parent.mkdir(parents=True, exist_ok=True)
    command.upgrade(cfg, "head")


def seed_database(db_path: Path, seed_dir: Path) -> dict[str, int]:
    tickets, articles = load_pack(seed_dir)
    engine = make_engine(db_path)
    Session = make_sessionmaker(engine)
    with Session.begin() as session:
        session.execute(text("DELETE FROM ticket_search"))
        session.execute(delete(TicketMessage))
        session.execute(delete(Ticket))
        session.execute(delete(ArticleChunk))
        session.execute(delete(Article))

        for t in tickets:
            ticket = Ticket(**t.model_dump(exclude={"messages"}))
            ticket.messages = [
                TicketMessage(position=i, author=m.author, text=m.text, created_at=m.at)
                for i, m in enumerate(t.messages, start=1)
            ]
            session.add(ticket)

        chunk_count = 0
        for a in articles:
            article = Article(**a.model_dump())
            article.chunks = [
                ArticleChunk(
                    chunk_id=c.chunk_id,
                    position=c.position,
                    title=a.title,
                    category=a.category,
                    text=c.text,
                    word_count=c.word_count,
                )
                for c in chunk_article(a.id, a.body)
            ]
            chunk_count += len(article.chunks)
            session.add(article)
        session.flush()
        rebuild_ticket_search(session)

    engine.dispose()
    return {"tickets": len(tickets), "articles": len(articles), "chunks": chunk_count}


def report(db_path: Path) -> dict[str, object]:
    engine = make_engine(db_path, read_only=True)
    Session = make_sessionmaker(engine)
    with Session() as session:
        counts = {
            "tickets": session.scalar(select(func.count()).select_from(Ticket)),
            "resolved_tickets": session.scalar(select(func.count()).select_from(Ticket).where(Ticket.status == "resolved")),
            "articles": session.scalar(select(func.count()).select_from(Article)),
            "chunks": session.scalar(select(func.count()).select_from(ArticleChunk)),
            "fts_rows": session.scalar(text("SELECT count(*) FROM ticket_search")),
        }
        index = TfidfIndex(load_chunk_records(session))
    engine.dispose()
    return {**counts, "tfidf_index": index.stats()}


def main(argv: list[str] | None = None) -> int:
    settings = get_settings()
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--db", type=Path, default=settings.db_path)
    parser.add_argument("--seed-dir", type=Path, default=settings.seed_dir)
    parser.add_argument("--check", action="store_true", help="report counts and index stats only")
    args = parser.parse_args(argv)
    configure_logging(settings.log_level)
    db_path = args.db.resolve()

    if not args.check:
        run_migrations(db_path)
        loaded = seed_database(db_path, args.seed_dir.resolve())
        log.info("Seeded database", extra={"fields": {"db": str(db_path), **loaded}})
    print(json.dumps(report(db_path), indent=2), file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
