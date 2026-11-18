"""Requirement 1: a known query retrieves the expected chunk with a stable article/chunk ID
from the local TF-IDF index; thresholds and category scoping behave as documented."""

import pytest

from app.rag.chunking import chunk_article, split_sentences


def test_known_query_retrieves_expected_chunk_with_stable_id(index):
    result = index.search(
        "lost authenticator after replacing phone; backup code and enroll a new device",
        category="account_access",
        top_k=3,
        min_score=0.15,
    )
    assert result.method == "tfidf_cosine"
    assert result.results, "expected at least one chunk above the threshold"
    top = result.results[0]
    assert (top.chunk_id, top.article_id) == ("KB-03#chunk-1", "KB-03")
    assert top.score >= 0.15
    assert "backup code" in top.excerpt
    assert {"backup", "authenticator"} <= set(top.matched_terms)


def test_scores_are_sorted_and_respect_top_k(index):
    result = index.search("CSV export background job timeout", top_k=1, min_score=0.0)
    assert len(result.results) == 1
    result = index.search("CSV export background job timeout", top_k=5, min_score=0.0)
    scores = [h.score for h in result.results]
    assert scores == sorted(scores, reverse=True)


def test_category_scope_is_applied_before_threshold(index):
    unscoped = index.search("Configure scheduled SFTP delivery of reports to an external server", min_score=0.0)
    scoped = index.search("Configure scheduled SFTP delivery of reports", category="integrations", min_score=0.0)
    assert unscoped.candidates_considered == 14
    assert scoped.candidates_considered == 0 and scoped.results == []
    checkout = index.search("payment timeout", category="checkout", min_score=0.0, top_k=10)
    assert {h.category for h in checkout.results} == {"checkout"}


def test_unrelated_query_rejected_by_threshold_or_coverage_gate(index):
    # "password" alone gives a 0.2+ cosine against KB-05; the term-coverage gate rejects it.
    result = index.search("What is the office wifi password?", min_score=0.15)
    assert result.results == []
    assert result.rejected_low_coverage == ["KB-05#chunk-2"]
    assert result.best_score > 0.15
    # No vocabulary overlap at all.
    assert index.search("zebra quantum lasagna", min_score=0.15).query_terms_in_vocabulary == 0


def test_sentence_scores_use_same_vector_space(index):
    hit = index.search("backup code", category="account_access", min_score=0.0).results[0]
    best = max(hit.sentences, key=lambda s: s.score)
    assert "backup code" in best.text.lower()
    assert all(0.0 <= s.score <= 1.0 for s in hit.sentences)


def test_chunking_keeps_whole_sentences_and_stable_ids():
    body = "One two three. Four five six seven. Eight nine. Ten eleven twelve thirteen."
    chunks = chunk_article("KB-99", body, max_words=6)
    assert [c.chunk_id for c in chunks] == ["KB-99#chunk-1", "KB-99#chunk-2", "KB-99#chunk-3"]
    assert " ".join(c.text for c in chunks) == body
    assert split_sentences(body) == ["One two three.", "Four five six seven.", "Eight nine.", "Ten eleven twelve thirteen."]
    # Re-chunking is deterministic.
    assert chunk_article("KB-99", body, max_words=6) == chunks


# --- error-code identifiers ------------------------------------------------------------
# An UPPER_SNAKE code such as PAYMENT_TIMEOUT is a near-unique identifier, so an exact
# whole-token match in a chunk's text is evidence on its own, even when the sentence around
# it dilutes the cosine below the score floor.


def test_identifier_match_passes_below_the_score_floor(index):
    result = index.search("What does PAYMENT_TIMEOUT mean and how do I resolve it?", min_score=0.15)
    assert result.results, "KB-01 documents this exact error code"
    top = result.results[0]
    assert (top.article_id, top.matched_identifiers) == ("KB-01", ["PAYMENT_TIMEOUT"])
    assert top.score < 0.15, "this query only passes because of the identifier rule"


def test_bare_identifier_is_retrieved(index):
    result = index.search("PAYMENT_TIMEOUT")
    assert [h.article_id for h in result.results][:1] == ["KB-01"]


def test_unknown_identifier_is_still_insufficient_evidence(index):
    assert index.search("What is ERR_FOO_BAR?").results == []


def test_identifier_must_be_a_whole_token_in_scope_and_in_chunk_text(index):
    assert index.search("PAYMENT_TIMEOUT_EXTRA").results == []  # not a prefix/substring match
    assert index.search("PAYMENT_TIMEOUT", category="account_access").results == []  # scope applies first
    # Matched only through the chunk *text*: no hit may claim an identifier its excerpt lacks.
    for hit in index.search("PAYMENT_TIMEOUT pending payment", top_k=10).results:
        assert all(i in hit.excerpt for i in hit.matched_identifiers)


def test_ordinary_hits_have_no_matched_identifiers(index):
    hit = index.search("backup code", category="account_access").results[0]
    assert hit.matched_identifiers == []


# --- term-coverage gate -----------------------------------------------------------------
# A chunk needs >= 2 distinct query terms. The fractional coverage floor (default 0.6) only
# decides single-match cases, where it passes only a one-term query. "delete my account" has two
# terms and "account" alone matches KB-03, so it must be rejected; short queries must survive.


def test_one_of_two_query_terms_is_not_evidence(index):
    result = index.search("How do I delete my account?")
    assert result.results == []
    assert result.rejected_low_coverage, "the near-miss is reported so the answer can explain the rejection"


def test_short_queries_still_retrieve(index):
    assert index.search("export timed out").results[0].article_id == "KB-04"
    assert index.search("MFA backup code").results[0].article_id == "KB-03"


def test_ambiguous_single_term_query_checkout_scope(index):
    # "timeout" is a tag of both KB-01 (checkout) and KB-04 (exports); the ticket's category scope
    # (which the UI defaults to) must resolve it.
    checkout = index.search("timeout", category="checkout", top_k=3)
    assert checkout.results[0].article_id == "KB-01"
    assert "KB-04" not in {h.article_id for h in checkout.results}


@pytest.mark.xfail(
    strict=True,
    reason="KNOWN GAP: a one-term query gives KB-04 only 0.09-0.10 cosine, under the 0.15 floor, so unscoped "
    "'timeout' returns KB-01 only and exports-scoped 'timeout' returns nothing. A one-term query can carry "
    "only a small share of a chunk vector. Fixing it needs a floor policy for one-term queries; see README limitations.",
)
def test_ambiguous_single_term_query_surfaces_both_articles_and_exports_scope(index):
    unscoped = index.search("timeout", top_k=3)
    assert {"KB-01", "KB-04"} <= {h.article_id for h in unscoped.results}
    exports = index.search("timeout", category="exports", top_k=3)
    assert exports.results[0].article_id == "KB-04"
    assert "KB-01" not in {h.article_id for h in exports.results}


# --- matched_terms are words, not stems -------------------------------------------------
# The stemmer is an internal index detail ("code" -> "cod"); the API and UI show the original words.


def test_matched_terms_are_surface_words_from_the_chunk(index):
    hit = index.search("backup code authenticator", category="account_access").results[0]
    assert hit.matched_terms == ["authenticator", "backup", "code"]  # not "cod"


def test_every_matched_term_is_a_real_word_of_the_chunk(index):
    import re

    from app.eval import build_chunks

    indexed = {c.chunk_id: set(re.findall(r"\w\w+", c.index_text.lower())) for c in build_chunks()}  # title+tags+text
    queries = [
        "customers exporting large reports hit timeouts",
        "how to handle a device replacement and the invoices after a plan change",
        "PAYMENT_TIMEOUT pending authorizations",
        "emails not arriving, check spam folders",
    ]
    for q in queries:
        for hit in index.search(q, top_k=10, min_score=0.0).results:
            assert hit.matched_terms and set(hit.matched_terms) <= indexed[hit.chunk_id], (q, hit.chunk_id, hit.matched_terms)


def test_surface_word_comes_from_the_chunk_text_not_the_query(index):
    # The query says "exporting"; KB-04#chunk-1's own text says "exports", so that is the word shown.
    hit = next(h for h in index.search("exporting", category="exports", min_score=0.0).results if h.chunk_id == "KB-04#chunk-1")
    assert hit.matched_terms == ["exports"]
