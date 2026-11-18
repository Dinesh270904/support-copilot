"""Local sparse-vector retrieval: scikit-learn TF-IDF + cosine similarity.

Pipeline
1. Chunks (stored in SQLite by the seed) are loaded with article ID, title, category, tags.
2. Each chunk is indexed as "title. tags. chunk text" so article-level vocabulary (e.g.
   "MFA", "background job") helps rank every chunk of that article. The *excerpt* that
   gets cited is the raw chunk text only.
   Every word is passed through a light suffix normaliser (app/rag/stemming.py).
3. The query is transformed into the same vector space; scores are cosine similarities.
4. Category scoping removes out-of-scope chunks *before* thresholding and top-k.
5. Two gates decide relevance:
   - cosine >= `min_score`, and
   - query-term coverage: the chunk must contain >= 2 distinct query terms, or at least
     `min_term_coverage` (0.6) of them. Anything above 0.5 behaves the same on this corpus:
     the fraction only matters when exactly one term matched, and then it passes only for a
     one-term query. At 0.5, "How do I delete my account?" (1 of its 2 terms) slipped through. Cosine on short texts is inflated by a single rare
     shared term (an unrelated "office wifi password" question scores 0.22 against the
     notification article because of "password"); the coverage gate rejects those.
   - exception: an error-code identifier. An UPPER_SNAKE token in the query (PAYMENT_TIMEOUT)
     that appears verbatim, as a whole token, in a chunk's text makes that chunk evidence on
     its own. Such a token is near-unique, so an exact match is stronger evidence than any
     cosine: "What does PAYMENT_TIMEOUT mean and how do I resolve it?" scores only 0.10
     against the article written for that error. The hit reports `matched_identifiers`.
   The best score in scope is reported so an insufficient-evidence answer can say how
   close the nearest candidate was.
6. Each surviving chunk's sentences are scored in the same space so the composer can
   quote the specific sentences that support the answer.

The index is in-memory and rebuilt from SQLite whenever the MCP server starts
(milliseconds for this corpus). `python -m app.seed --check` rebuilds it and prints stats.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

import re

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from app.rag.chunking import split_sentences
from app.rag.stemming import stem
from app.schemas import EvidenceSentence, KnowledgeHit, KnowledgeSearchResult

METHOD = "tfidf_cosine"

# Error codes such as PAYMENT_TIMEOUT: upper-case, at least one underscore. Case-sensitive on
# purpose, so ordinary words ("payment_timeout" in prose, "Timeout") are not treated as codes.
_IDENTIFIER = re.compile(r"\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b")


def _contains_token(text: str, token: str) -> bool:
    """Whole-token match: PAYMENT_TIMEOUT must not match inside PAYMENT_TIMEOUT_EXTRA."""
    return re.search(rf"(?<![A-Za-z0-9_]){re.escape(token)}(?![A-Za-z0-9_])", text) is not None


@dataclass(frozen=True)
class ChunkRecord:
    chunk_id: str
    article_id: str
    position: int
    title: str
    category: str
    text: str
    tags: tuple[str, ...] = ()

    @property
    def index_text(self) -> str:
        return f"{self.title}. {' '.join(self.tags)}. {self.text}"


def _make_vectorizer() -> TfidfVectorizer:
    # sklearn's own analyzer lower-cases, tokenises, drops English stop words and builds the
    # 1-2-grams; we then stem every word of every n-gram. Because the stemming lives in the
    # analyzer, chunks, sentences and queries are all normalised identically.
    base = TfidfVectorizer(lowercase=True, stop_words="english", ngram_range=(1, 2)).build_analyzer()

    def analyze(text: str) -> list[str]:
        return [" ".join(stem(w) for w in gram.split(" ")) for gram in base(text)]

    return TfidfVectorizer(
        analyzer=analyze,  # bigrams reward phrase matches like "backup code", "payment timeout"
        sublinear_tf=True,  # damp repeated terms in a chunk
        norm="l2",
    )


class TfidfIndex:
    def __init__(self, chunks: list[ChunkRecord]):
        self._chunks = list(chunks)
        self._vectorizer = _make_vectorizer()
        self._built_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        if self._chunks:
            self._matrix = self._vectorizer.fit_transform([c.index_text for c in self._chunks])
        else:
            self._matrix = None
        self._categories = np.array([c.category for c in self._chunks], dtype=object)
        self._analyzer = self._vectorizer.build_analyzer()
        self._chunk_terms = [self._unigrams(c.index_text) for c in self._chunks]

    def stats(self) -> dict[str, object]:
        return {
            "method": METHOD,
            "chunks": len(self._chunks),
            "articles": len({c.article_id for c in self._chunks}),
            "vocabulary_size": len(self._vectorizer.vocabulary_) if self._matrix is not None else 0,
            "ngram_range": [1, 2],
            "built_at": self._built_at,
        }

    def search(
        self,
        query: str,
        *,
        category: str | None = None,
        top_k: int = 3,
        min_score: float = 0.15,
        min_term_coverage: float = 0.6,
    ) -> KnowledgeSearchResult:
        empty = KnowledgeSearchResult(
            query=query,
            category=category,
            top_k=top_k,
            min_score=min_score,
            min_term_coverage=min_term_coverage,
            candidates_considered=0,
            query_terms_in_vocabulary=0,
            best_score=0.0,
            results=[],
        )
        if self._matrix is None:
            return empty

        query_vec = self._vectorizer.transform([query])
        in_scope = np.ones(len(self._chunks), dtype=bool) if category is None else (self._categories == category)
        candidates = int(in_scope.sum())
        empty.candidates_considered = candidates
        empty.query_terms_in_vocabulary = int(query_vec.nnz)
        if candidates == 0 or query_vec.nnz == 0:
            return empty

        scores = cosine_similarity(query_vec, self._matrix).ravel()
        scores[~in_scope] = -1.0
        order = np.argsort(-scores, kind="stable")
        best = float(scores[order[0]])

        query_terms = self._unigrams(query)
        identifiers = list(dict.fromkeys(_IDENTIFIER.findall(query)))
        hits: list[KnowledgeHit] = []
        rejected: list[str] = []
        for idx in order:
            if len(hits) >= top_k or not in_scope[idx]:
                break  # `order` is by descending score and out-of-scope chunks sit at -1
            score = float(scores[idx])
            chunk = self._chunks[idx]
            found = [i for i in identifiers if _contains_token(chunk.text, i)]
            if not found:
                if score < min_score:
                    if identifiers:
                        continue  # a lower-scored chunk may still carry the identifier: keep scanning
                    break  # no identifier in the query: nothing below the floor can qualify
                matched_n = len(query_terms & self._chunk_terms[idx])
                if matched_n < 2 and (matched_n / len(query_terms) if query_terms else 0.0) < min_term_coverage:
                    rejected.append(chunk.chunk_id)
                    continue
            matched = sorted(query_terms & self._chunk_terms[idx])
            hits.append(
                KnowledgeHit(
                    chunk_id=chunk.chunk_id,
                    article_id=chunk.article_id,
                    title=chunk.title,
                    category=chunk.category,
                    excerpt=chunk.text,
                    score=round(score, 4),
                    matched_terms=matched,
                    matched_identifiers=found,
                    sentences=self._score_sentences(query_vec, chunk.text),
                )
            )
        return empty.model_copy(
            update={"best_score": round(max(best, 0.0), 4), "results": hits, "rejected_low_coverage": rejected}
        )

    def _unigrams(self, text: str) -> set[str]:
        return {t for t in self._analyzer(text) if " " not in t}

    def _score_sentences(self, query_vec, text: str) -> list[EvidenceSentence]:
        sentences = split_sentences(text)
        sims = cosine_similarity(query_vec, self._vectorizer.transform(sentences)).ravel()
        return [
            EvidenceSentence(position=i, text=s, score=round(float(sim), 4))
            for i, (s, sim) in enumerate(zip(sentences, sims), start=1)
        ]
