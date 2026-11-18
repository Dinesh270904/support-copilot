"""Sentence-aware article chunking.

Articles are short operational procedures (4-5 sentences). Chunks are built by
greedily packing whole sentences up to `max_words`, so a chunk never cuts a step in
half and every evidence sentence the composer quotes exists verbatim in exactly one
chunk. No overlap: overlap helps recall for long prose, but here it would only
duplicate citations; sentence-level evidence selection covers boundary cases.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# Split after . ! ? when followed by whitespace and an upper-case letter, digit or quote.
_SENTENCE_BOUNDARY = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9\"'“])")

DEFAULT_MAX_WORDS = 45


def split_sentences(text: str) -> list[str]:
    return [s.strip() for s in _SENTENCE_BOUNDARY.split(text.strip()) if s.strip()]


@dataclass(frozen=True)
class Chunk:
    chunk_id: str
    article_id: str
    position: int  # 1-based
    text: str
    word_count: int


def chunk_id_for(article_id: str, position: int) -> str:
    return f"{article_id}#chunk-{position}"


def chunk_article(article_id: str, body: str, max_words: int = DEFAULT_MAX_WORDS) -> list[Chunk]:
    chunks: list[Chunk] = []
    current: list[str] = []
    current_words = 0

    def flush() -> None:
        nonlocal current, current_words
        if current:
            position = len(chunks) + 1
            text = " ".join(current)
            chunks.append(Chunk(chunk_id_for(article_id, position), article_id, position, text, current_words))
            current, current_words = [], 0

    for sentence in split_sentences(body):
        words = len(sentence.split())
        if current and current_words + words > max_words:
            flush()
        current.append(sentence)
        current_words += words
    flush()
    return chunks
