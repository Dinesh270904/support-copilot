"""Deterministic, evidence-only answer composition for knowledge search.

Rules (each is covered by tests):
1. No chunk passed retrieval  -> insufficient_evidence, no citations.
2. The single best-supported sentence is a *coverage disclaimer* ("this article does
   not define ...") -> insufficient_evidence. The disclaiming chunk is cited with
   usage=coverage_gap so the agent can see why. This is the case where lexical
   similarity is high precisely because the article names the topic it excludes.
3. Otherwise quote up to N supporting sentences verbatim, each tagged with its chunk ID,
   ordered by article rank, then chunk and sentence position, so procedural steps keep
   their documented order.
4. Guardrails are never dropped: a prohibition sentence ("do not ...", "never ...") in a
   cited article that shares any query term is always included, even beyond N. Missing
   "do not ask for another payment while it is pending" is worse than a longer answer.
   Exception to the term-overlap test: when the question named an article's error code
   (a `matched_identifiers` hit), that article is known to be the relevant one, so all of its
   prohibitions are eligible. An identifier is a single token ("payment_timeout") and shares no
   term with "If the payment is pending, do not ask ...", so overlap alone would drop it.
   Template text never adds domain facts; every factual clause is a quoted sentence.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.composer.types import Citation, Composed, Quote
from app.schemas import KnowledgeHit, KnowledgeSearchResult
from app.validation import is_instruction_like

_DISCLAIMER = re.compile(
    r"\b(?:does|do|did) not (?:define|cover|document|describe|address|apply to)\b"
    r"|\bnot (?:documented|covered|defined|supported)\b"
    r"|\bout of scope\b",
    re.IGNORECASE,
)


_GUARDRAIL = re.compile(r"\b(?:do not|don't|never|must not|should not)\b", re.IGNORECASE)
MAX_GUARDRAILS = 2


def is_guardrail(sentence: str) -> bool:
    return bool(_GUARDRAIL.search(sentence))


def is_coverage_disclaimer(sentence: str) -> bool:
    return bool(_DISCLAIMER.search(sentence))


@dataclass(frozen=True)
class _Candidate:
    hit_rank: int
    hit: KnowledgeHit
    position: int
    text: str
    score: float


def _candidates(result: KnowledgeSearchResult) -> list[_Candidate]:
    return [
        _Candidate(rank, hit, s.position, s.text, s.score)
        for rank, hit in enumerate(result.results)
        for s in hit.sentences
    ]


def _chunk_pos(hit: KnowledgeHit) -> int:
    return int(hit.chunk_id.rsplit("-", 1)[-1])


def _chunk_citation(hit: KnowledgeHit, usage: str) -> Citation:
    return Citation(
        source_id=hit.chunk_id,
        source_type="knowledge_chunk",
        title=hit.title,
        excerpt=hit.excerpt,
        score=hit.score,
        score_type="cosine",
        article_id=hit.article_id,
        matched_terms=hit.matched_terms,
        matched_identifiers=hit.matched_identifiers,
        usage=usage,  # type: ignore[arg-type]
    )


def compose_knowledge_answer(
    result: KnowledgeSearchResult, *, min_sentence_score: float = 0.05, max_sentences: int = 3
) -> Composed:
    if not result.results:
        if result.candidates_considered == 0:
            reason = (
                f"no knowledge articles exist in category '{result.category}'"
                if result.category
                else "the knowledge base is empty"
            )
        elif result.rejected_low_coverage:
            reason = (
                f"the closest chunks ({', '.join(result.rejected_low_coverage)}) share too few query terms "
                f"to count as evidence"
            )
        else:
            reason = (
                f"no chunk reached the minimum similarity of {result.min_score:.2f} "
                f"(best candidate scored {result.best_score:.2f})"
            )
        return Composed(
            answer_state="insufficient_evidence",
            answer=(
                f"Insufficient evidence: {reason}. The knowledge base does not appear to document this, "
                "so no guidance is proposed. Escalate or confirm with the owning team before replying."
            ),
            limitations=["No retrieved source supports an answer; nothing was inferred."],
        )

    ranked = sorted(_candidates(result), key=lambda c: (-c.score, c.hit_rank, c.position))
    best = ranked[0]
    if best.score >= min_sentence_score and is_coverage_disclaimer(best.text):
        return Composed(
            answer_state="insufficient_evidence",
            answer=(
                f"Insufficient evidence to answer confidently. The closest source, “{best.hit.title}” "
                f"[{best.hit.chunk_id}], explicitly does not cover this: “{best.text}” "
                "Do not state a policy on this topic; escalate it for review."
            ),
            citations=[_chunk_citation(best.hit, "coverage_gap")],
            limitations=["The only matching guidance is a statement that the topic is out of scope."],
        )

    limitations: list[str] = []
    warnings: list[str] = []
    selected = [c for c in ranked if c.score >= min_sentence_score and not is_coverage_disclaimer(c.text)]
    if selected:
        cutoff = max(min_sentence_score, selected[0].score * 0.25)
        selected = [c for c in selected if c.score >= cutoff][:max_sentences]
    else:
        # The chunk matched on its title/tags but no single sentence overlaps the query.
        top_hit = result.results[0]
        first = top_hit.sentences[0]
        selected = [_Candidate(0, top_hit, first.position, first.text, first.score)]
        limitations.append(
            f"{top_hit.chunk_id} matched on its article title/tags; no individual sentence matched the query, "
            "so its opening sentence is shown. Verify relevance before using it."
        )

    cited_articles = {c.hit.article_id for c in selected}
    identifier_articles = {h.article_id for h in result.results if h.matched_identifiers}
    chosen = {(c.hit.chunk_id, c.position) for c in selected}
    guardrails = [
        c
        for c in ranked
        if c.hit.article_id in cited_articles
        and (c.hit.chunk_id, c.position) not in chosen
        and (c.score > 0 or c.hit.article_id in identifier_articles)
        and is_guardrail(c.text)
        and not is_coverage_disclaimer(c.text)
    ][:MAX_GUARDRAILS]
    selected += guardrails

    article_rank: dict[str, int] = {}
    for c in sorted(selected, key=lambda c: c.hit_rank):
        article_rank.setdefault(c.hit.article_id, len(article_rank))
    selected.sort(key=lambda c: (article_rank[c.hit.article_id], c.hit.chunk_id.split("#")[0], _chunk_pos(c.hit), c.position))
    lines = [f"- {c.text} [{c.hit.chunk_id}]" for c in selected]
    titles = list(dict.fromkeys(f"“{c.hit.title}” ({c.hit.article_id})" for c in selected))
    answer = f"Documented guidance from {', '.join(titles)}:\n" + "\n".join(lines)

    used = {c.hit.chunk_id for c in selected}
    citations = [_chunk_citation(h, "evidence" if h.chunk_id in used else "retrieved_unused") for h in result.results]

    for c in ranked:
        if c.score >= min_sentence_score and is_coverage_disclaimer(c.text):
            limitations.append(f"{c.hit.chunk_id} notes a scope limit: “{c.text}”")
    if any(is_instruction_like(c.text) for c in selected):
        warnings.append(
            "A quoted evidence sentence contains instruction-like text. It is shown as source data only and "
            "did not change the action or the tools called."
        )
    return Composed(
        answer_state="answered",
        answer=answer,
        citations=citations,
        limitations=limitations,
        warnings=warnings,
        evidence=[Quote(source_id=c.hit.chunk_id, text=c.text) for c in selected],
    )
