"""Offline retrieval evaluation.

    python -m app.eval                  # tuning set: metrics for each retriever + threshold sweep
    python -m app.eval --verbose        # also list the misses and false positives
    python -m app.eval --holdout        # holdout set only. Run at the start and the end of the
                                        # work, never while tuning.

Retrievers compared (all local, no models, no network):
  tfidf   the shipped `TfidfIndex.search` (cosine + score floor + term-coverage gate)
  fts5    SQLite FTS5 bm25 over the same chunks (porter stemming, >= 2 distinct query terms)
  hybrid  an article is returned only if BOTH tfidf and fts5 return it (tfidf order)

The corpus is built from the seed data pack, not the SQLite file, so results do not depend
on database state. Metrics are computed per *article*: chunk hits are collapsed to the
article's best rank.

  precision@1   positives whose top article is the labelled one
  recall@3      positives whose labelled article is in the top 3 articles
  MRR           mean reciprocal rank of the labelled article (0 when not retrieved)
  FPR           negatives for which any article outside `allowed_articles` is returned
"""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS

from app.config import BACKEND_DIR, get_settings
from app.rag.chunking import chunk_article
from app.rag.index import ChunkRecord, TfidfIndex
from app.seed import load_pack

EVAL_DIR = BACKEND_DIR / "data" / "eval"
SWEEP = (0.05, 0.075, 0.10, 0.125, 0.15, 0.175, 0.20, 0.25, 0.30)

Retriever = Callable[[str], list[str]]  # query -> ranked, de-duplicated article IDs


@dataclass(frozen=True)
class EvalQuery:
    id: str
    query: str
    kind: str
    expected_article: str | None
    allowed_articles: tuple[str, ...] = ()


@dataclass
class Metrics:
    precision_at_1: float | None
    recall_at_3: float | None
    mrr: float | None
    false_positive_rate: float | None
    misses: list[str] = field(default_factory=list)
    false_positives: list[str] = field(default_factory=list)


def load_queries(path: Path) -> list[EvalQuery]:
    raw = json.loads(path.read_text("utf-8"))["queries"]
    queries = [
        EvalQuery(r["id"], r["query"], r["kind"], r["expected_article"], tuple(r.get("allowed_articles", [])))
        for r in raw
    ]
    ids = [q.id for q in queries]
    if len(ids) != len(set(ids)):
        raise ValueError(f"{path.name}: duplicate query ids")
    return queries


def build_chunks() -> list[ChunkRecord]:
    _, articles = load_pack(get_settings().seed_dir)
    return [
        ChunkRecord(c.chunk_id, a.id, c.position, a.title, a.category, c.text, tuple(a.tags))
        for a in articles
        for c in chunk_article(a.id, a.body)
    ]


def _unique(ids: list[str]) -> list[str]:
    return list(dict.fromkeys(ids))


# ----------------------------------------------------------------------- retrievers
def tfidf_retriever(index: TfidfIndex, min_score: float, min_term_coverage: float) -> Retriever:
    def retrieve(query: str) -> list[str]:
        result = index.search(query, top_k=10, min_score=min_score, min_term_coverage=min_term_coverage)
        return _unique([h.article_id for h in result.results])

    return retrieve


class Fts5Chunks:
    """FTS5 bm25 over chunk text (title + tags + text, same as the TF-IDF documents)."""

    def __init__(self, chunks: list[ChunkRecord], min_terms: int = 2):
        self._min_terms = min_terms
        self._db = sqlite3.connect(":memory:")
        self._db.execute("CREATE VIRTUAL TABLE c USING fts5(article_id UNINDEXED, body, tokenize='porter unicode61')")
        self._db.executemany("INSERT INTO c VALUES (?, ?)", [(c.article_id, c.index_text) for c in chunks])

    def __call__(self, query: str) -> list[str]:
        terms = [
            t
            for t in dict.fromkeys(re.findall(r"[a-z0-9]+", query.lower()))
            if len(t) > 1 and t not in ENGLISH_STOP_WORDS
        ]
        if not terms:
            return []
        rows = self._db.execute(
            "SELECT article_id, highlight(c, 1, '<', '>') FROM c WHERE c MATCH ? ORDER BY bm25(c)",
            (" OR ".join(f'"{t}"' for t in terms),),
        ).fetchall()
        # highlight() marks the matched (stemmed) query terms, so count distinct marked words.
        return _unique(
            [aid for aid, hl in rows if len({m.lower() for m in re.findall(r"<([^>]+)>", hl)}) >= self._min_terms]
        )


def hybrid_retriever(primary: Retriever, secondary: Retriever) -> Retriever:
    def retrieve(query: str) -> list[str]:
        agreed = set(secondary(query))
        return [a for a in primary(query) if a in agreed]

    return retrieve


# -------------------------------------------------------------------------- metrics
def evaluate(queries: list[EvalQuery], retrieve: Retriever) -> Metrics:
    positives = [q for q in queries if q.expected_article]
    negatives = [q for q in queries if not q.expected_article]
    top1 = recall3 = 0
    rr = 0.0
    misses: list[str] = []
    for q in positives:
        ranked = retrieve(q.query)
        if ranked[:1] == [q.expected_article]:
            top1 += 1
        if q.expected_article in ranked[:3]:
            recall3 += 1
        if q.expected_article in ranked:
            rr += 1 / (ranked.index(q.expected_article) + 1)
        else:
            misses.append(f"{q.id} {q.query[:60]}")
    false_pos: list[str] = []
    for q in negatives:
        if [a for a in retrieve(q.query) if a not in q.allowed_articles]:
            false_pos.append(f"{q.id} {q.query[:60]}")
    n, m = len(positives), len(negatives)
    return Metrics(
        precision_at_1=top1 / n if n else None,
        recall_at_3=recall3 / n if n else None,
        mrr=rr / n if n else None,
        false_positive_rate=len(false_pos) / m if m else None,
        misses=misses,
        false_positives=false_pos,
    )


def _fmt(value: float | None) -> str:
    return "  n/a" if value is None else f"{value:.3f}"


def _row(label: str, m: Metrics) -> str:
    return (
        f"{label:<34} {_fmt(m.precision_at_1)}  {_fmt(m.recall_at_3)}  {_fmt(m.mrr)}  {_fmt(m.false_positive_rate)}"
    )


def report(name: str, queries: list[EvalQuery], chunks: list[ChunkRecord], *, verbose: bool, sweep: bool) -> None:
    settings = get_settings()
    pos = sum(1 for q in queries if q.expected_article)
    print(f"\n== {name}: {len(queries)} queries ({pos} positive, {len(queries) - pos} negative)")
    if not queries:
        print("   (no queries yet)")
        return
    tfidf = tfidf_retriever(TfidfIndex(chunks), settings.rag_min_score, settings.rag_min_term_coverage)
    fts5 = Fts5Chunks(chunks)
    rows = [
        (f"tfidf (min_score={settings.rag_min_score})", tfidf),
        ("fts5 bm25 (>=2 terms)", fts5),
        ("hybrid (tfidf AND fts5)", hybrid_retriever(tfidf, fts5)),
    ]
    print(f"{'retriever':<34} {'P@1':>5}  {'R@3':>5}  {'MRR':>5}  {'FPR':>5}")
    for label, retriever in rows:
        metrics = evaluate(queries, retriever)
        print(_row(label, metrics))
        if verbose:
            for line in metrics.misses:
                print(f"      miss: {line}")
            for line in metrics.false_positives:
                print(f"      false positive: {line}")
    # Per-kind breakdown: totals hide where lexical retrieval is weak (paraphrase) or strong.
    print("\nper kind (n = queries of that kind):")
    print(f"{'retriever / kind':<34} {'P@1':>5}  {'R@3':>5}  {'MRR':>5}  {'FPR':>5}")
    for label, retriever in rows:
        for kind in sorted({q.kind for q in queries}):
            group = [q for q in queries if q.kind == kind]
            print(_row(f"{label.split(' ')[0]} / {kind} (n={len(group)})", evaluate(group, retriever)))
    if sweep:
        index = TfidfIndex(chunks)
        print("\ntfidf min_score sweep (term-coverage gate on):")
        print(f"{'min_score':<34} {'P@1':>5}  {'R@3':>5}  {'MRR':>5}  {'FPR':>5}")
        for threshold in SWEEP:
            print(_row(f"{threshold:.3f}", evaluate(queries, tfidf_retriever(index, threshold, settings.rag_min_term_coverage))))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--holdout", action="store_true", help="report the holdout set only (baseline / final)")
    parser.add_argument("--verbose", action="store_true", help="list misses and false positives")
    args = parser.parse_args(argv)
    chunks = build_chunks()
    if args.holdout:
        report("holdout", load_queries(EVAL_DIR / "holdout.json"), chunks, verbose=args.verbose, sweep=False)
    else:
        report("tune", load_queries(EVAL_DIR / "tune.json"), chunks, verbose=args.verbose, sweep=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
