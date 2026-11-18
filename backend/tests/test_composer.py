"""Requirement 2: retrieved evidence appears in the composed answer with citations; low
scoring queries yield insufficient evidence and no fabricated citation."""

import re

from app.composer.knowledge import compose_knowledge_answer
from app.schemas import EvidenceSentence, KnowledgeHit, KnowledgeSearchResult


def _answer(index, query, category=None):
    return compose_knowledge_answer(index.search(query, category=category, min_score=0.15, top_k=3))


def test_answer_quotes_retrieved_sentences_verbatim_with_citations(index):
    result = index.search("CSV export with more than 50,000 rows times out; use a background job", category="exports")
    composed = compose_knowledge_answer(result)
    assert composed.answer_state == "answered"
    retrieved = {h.chunk_id: h.excerpt for h in result.results}
    cited = {c.source_id for c in composed.citations if c.usage == "evidence"}
    assert "KB-04#chunk-1" in cited
    # Every bullet is a verbatim sentence of the chunk it cites — nothing invented.
    bullets = re.findall(r"^- (.+) \[(KB-\d+#chunk-\d+)\]$", composed.answer, flags=re.M)
    assert bullets
    for sentence, chunk_id in bullets:
        assert chunk_id in cited
        assert sentence in retrieved[chunk_id]
    for citation in composed.citations:
        assert citation.source_id in retrieved and citation.excerpt == retrieved[citation.source_id]
        assert citation.score is not None and citation.score_type == "cosine"


def test_low_scoring_query_returns_insufficient_evidence_without_citations(index):
    composed = _answer(index, "What is the office wifi password?")
    assert composed.answer_state == "insufficient_evidence"
    assert composed.citations == []
    assert composed.evidence == []
    assert "KB-" not in composed.answer.replace("KB-05#chunk-2", "")  # only names the rejected candidate


def test_out_of_category_query_returns_insufficient_evidence(index):
    composed = _answer(index, "Configure scheduled SFTP delivery of reports to an external server", "integrations")
    assert composed.answer_state == "insufficient_evidence"
    assert composed.citations == []
    assert "integrations" in composed.answer


def test_coverage_disclaimer_is_insufficient_evidence_and_makes_no_claim(index):
    composed = _answer(index, "Does the product reimburse a bank decline fee?", "billing")
    assert composed.answer_state == "insufficient_evidence"
    assert [(c.source_id, c.usage) for c in composed.citations] == [("KB-06#chunk-2", "coverage_gap")]
    lowered = composed.answer.lower()
    assert "is reimbursed" not in lowered and "not reimbursed" not in lowered


def test_checkout_guidance_keeps_pending_guardrail_and_order(index):
    composed = _answer(index, "PAYMENT_TIMEOUT with a pending authorization; should the customer retry checkout?", "checkout")
    assert composed.answer_state == "answered"
    texts = [q.text for q in composed.evidence]
    pending_rule = next(t for t in texts if "If the payment is pending, do not ask" in t)
    retry_rule = next(t for t in texts if "may retry once" in t)
    assert texts.index(pending_rule) < texts.index(retry_rule), "steps must keep documented order"
    assert "retry while payment is pending" not in composed.answer.lower()


def test_title_only_match_falls_back_to_opening_sentence_with_limitation():
    hit = KnowledgeHit(
        chunk_id="KB-50#chunk-1",
        article_id="KB-50",
        title="Widget setup",
        category="setup",
        excerpt="Open the panel. Press start.",
        score=0.3,
        matched_terms=["widget", "setup"],
        sentences=[EvidenceSentence(position=1, text="Open the panel.", score=0.0),
                   EvidenceSentence(position=2, text="Press start.", score=0.0)],
    )
    result = KnowledgeSearchResult(
        query="widget setup", category=None, top_k=3, min_score=0.15, min_term_coverage=0.5,
        candidates_considered=1, query_terms_in_vocabulary=2, best_score=0.3, results=[hit],
    )
    composed = compose_knowledge_answer(result)
    assert composed.answer_state == "answered"
    assert [q.text for q in composed.evidence] == ["Open the panel."]
    assert any("title/tags" in lim for lim in composed.limitations)
