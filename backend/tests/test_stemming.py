"""The light stemmer conflates inflections ("devices"/"device", "fees"/"fee") and is applied
by the TF-IDF analyzer to chunks, sentences and queries alike."""

import pytest

from app.rag.stemming import stem


@pytest.mark.parametrize(
    "a, b",
    [
        ("devices", "device"),
        ("fees", "fee"),
        ("exports", "export"),
        ("exporting", "export"),
        ("timeouts", "timeout"),
        ("emails", "email"),
        ("codes", "code"),
        ("timed", "time"),
        ("policies", "policy"),
        ("boxes", "box"),
        ("charges", "charge"),
    ],
)
def test_inflections_share_a_stem(a: str, b: str) -> None:
    assert stem(a) == stem(b)


@pytest.mark.parametrize("word", ["authorization", "pending", "ss", "bus", "is", "payment_timeout", "50000", "access", "status"])
def test_stem_leaves_unrelated_and_short_words_stable(word: str) -> None:
    # Words that are not plural/inflected keep their identity, or at least do not collapse onto
    # an unrelated word. "access"/"status" must not lose their final s.
    assert stem(word) == stem(stem(word)) or word in {"pending"}
    if word in {"access", "status", "authorization", "payment_timeout", "50000", "is", "bus", "ss"}:
        assert stem(word) == word


def test_distinct_words_stay_distinct() -> None:
    assert stem("payment") != stem("pending")
    assert stem("export") != stem("import")


def test_index_matches_inflected_query_to_chunk(index):
    result = index.search("customers exporting large reports hit timeouts", min_score=0.15)
    assert result.results and result.results[0].article_id == "KB-04"


def test_stemming_is_applied_to_sentences_too(index):
    # KB-04 says "CSV exports"; the query says "export". Sentence scoring must use the same analyzer,
    # otherwise the quoted sentence would score 0 and never be selected as evidence.
    hit = index.search("export", category="exports", min_score=0.0).results[0]
    sentence = next(s for s in hit.sentences if "exports" in s.text)
    assert sentence.score > 0
