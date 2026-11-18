"""Initial schema: tickets, messages, articles, chunks, assistant runs, FTS5 ticket search.

Revision ID: 0001_initial
Revises:
Create Date: 2026-11-18
"""

import sqlalchemy as sa
from alembic import op

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tickets",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("category", sa.String(64), nullable=False),
        sa.Column("priority", sa.String(16), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("product_area", sa.String(64), nullable=False),
        sa.Column("created_at", sa.String(32), nullable=False),
        sa.Column("updated_at", sa.String(32), nullable=False),
        sa.Column("resolution_summary", sa.Text(), nullable=True),
        sa.Column("reviewed_at", sa.String(32), nullable=True),
        sa.CheckConstraint("status IN ('open', 'resolved')", name="ck_tickets_status"),
        sa.CheckConstraint("priority IN ('low', 'medium', 'high')", name="ck_tickets_priority"),
    )
    # Queue filters combine status + priority (+ category); the composite index serves
    # the left-prefix combinations, the single-column one serves category-only filters.
    op.create_index("ix_tickets_status_priority_category", "tickets", ["status", "priority", "category"])
    op.create_index("ix_tickets_category", "tickets", ["category"])
    op.create_index("ix_tickets_updated_at", "tickets", ["updated_at"])

    op.create_table(
        "ticket_messages",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("ticket_id", sa.String(32), sa.ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("author", sa.String(16), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("created_at", sa.String(32), nullable=False),
        sa.UniqueConstraint("ticket_id", "position", name="uq_ticket_messages_ticket_position"),
        sa.CheckConstraint("author IN ('customer', 'agent')", name="ck_ticket_messages_author"),
    )

    op.create_table(
        "articles",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("category", sa.String(64), nullable=False),
        sa.Column("tags", sa.JSON(), nullable=False),
        sa.Column("applies_to", sa.String(64), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.String(32), nullable=False),
    )
    op.create_index("ix_articles_category", "articles", ["category"])

    op.create_table(
        "article_chunks",
        sa.Column("chunk_id", sa.String(48), primary_key=True),
        sa.Column("article_id", sa.String(32), sa.ForeignKey("articles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("category", sa.String(64), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("word_count", sa.Integer(), nullable=False),
        sa.UniqueConstraint("article_id", "position", name="uq_article_chunks_article_position"),
    )
    op.create_index("ix_article_chunks_category", "article_chunks", ["category"])

    op.create_table(
        "assistant_runs",
        sa.Column("run_id", sa.String(32), primary_key=True),
        sa.Column("created_at", sa.String(32), nullable=False),
        sa.Column("action", sa.String(48), nullable=False),
        sa.Column("ticket_id", sa.String(32), nullable=True),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("answer_state", sa.String(32), nullable=True),
        sa.Column("tool_calls", sa.JSON(), nullable=False),
        sa.Column("retrieval_method", sa.String(48), nullable=True),
        sa.Column("source_ids", sa.JSON(), nullable=False),
        sa.Column("query_chars", sa.Integer(), nullable=False),
        sa.Column("duration_ms", sa.Integer(), nullable=False),
        sa.Column("error_code", sa.String(48), nullable=True),
    )
    op.create_index("ix_assistant_runs_created_at", "assistant_runs", ["created_at"])
    op.create_index("ix_assistant_runs_ticket_id", "assistant_runs", ["ticket_id"])

    # Full-text index over ticket text for similar-ticket search. Porter stemming lets
    # "replaced"/"replacing" and "times"/"timed" match. Populated by the seed process.
    op.execute(
        "CREATE VIRTUAL TABLE ticket_search USING fts5("
        "ticket_id UNINDEXED, title, description, conversation, resolution, "
        "tokenize = 'porter unicode61')"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS ticket_search")
    op.drop_table("assistant_runs")
    op.drop_table("article_chunks")
    op.drop_table("articles")
    op.drop_table("ticket_messages")
    op.drop_table("tickets")
