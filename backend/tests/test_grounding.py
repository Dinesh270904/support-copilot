"""Grounding property over every tuning query: an answer never says anything the knowledge base did not say.

- every bullet of an answered response is a verbatim sentence of the chunk it cites, and that chunk was retrieved;
- an insufficient-evidence response cites nothing except a coverage-gap source.

The holdout set is deliberately not read here (see test_eval.py).
"""

from __future__ import annotations

import re

import pytest

from app.composer.knowledge import compose_knowledge_answer
from app.eval import EVAL_DIR, build_chunks, load_queries

QUERIES = load_queries(EVAL_DIR / "tune.json")
CHUNK_TEXT = {c.chunk_id: c.text for c in build_chunks()}
BULLET = re.compile(r"^- (?P<text>.+) \[(?P<chunk>KB-\d+#chunk-\d+)\]$")


@pytest.mark.parametrize("query", QUERIES, ids=[q.id for q in QUERIES])
def test_answer_is_quoted_from_cited_chunks_or_cites_nothing(index, query):
    result = index.search(query.query)
    composed = compose_knowledge_answer(result)
    retrieved = {h.chunk_id for h in result.results}

    if composed.answer_state == "answered":
        bullets = composed.answer.splitlines()[1:]  # line 0 is the "Documented guidance from ..." header
        assert bullets, "an answered response must quote at least one sentence"
        for line in bullets:
            match = BULLET.match(line)
            assert match, f"not a quoted bullet: {line!r}"
            assert match["chunk"] in retrieved
            assert match["text"] in CHUNK_TEXT[match["chunk"]], f"not verbatim from {match['chunk']}: {line!r}"
    else:
        assert composed.answer_state == "insufficient_evidence"
        assert all(c.usage == "coverage_gap" for c in composed.citations)


def test_the_tune_set_exercises_both_outcomes(index):
    states = {compose_knowledge_answer(index.search(q.query)).answer_state for q in QUERIES}
    assert states == {"answered", "insufficient_evidence"}
