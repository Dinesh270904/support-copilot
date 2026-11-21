"""The eval harness itself: dataset labels are valid and the metric arithmetic is right."""

import pytest

from app import eval as ev

KINDS = {"direct", "paraphrase", "error_code", "inflection", "short", "negative"}


@pytest.fixture(scope="module")
def article_ids() -> set[str]:
    return {c.article_id for c in ev.build_chunks()}


@pytest.mark.parametrize("name", ["tune.json", "holdout.json"])
def test_dataset_labels_are_valid(name: str, article_ids: set[str]) -> None:
    queries = ev.load_queries(ev.EVAL_DIR / name)  # also rejects duplicate ids
    for q in queries:
        assert q.kind in KINDS, q
        assert 3 <= len(q.query) <= 500, q
        if q.expected_article is None:
            assert q.kind == "negative", f"{q.id}: a query with no expected article must be kind=negative"
        else:
            assert q.expected_article in article_ids, q
            assert not q.allowed_articles, f"{q.id}: allowed_articles only applies to negatives"
        assert set(q.allowed_articles) <= article_ids, q


def test_tune_set_covers_every_article_and_has_negatives() -> None:
    queries = ev.load_queries(ev.EVAL_DIR / "tune.json")
    assert {q.expected_article for q in queries if q.expected_article} == {f"KB-0{i}" for i in range(1, 8)}
    assert sum(1 for q in queries if not q.expected_article) >= 8


def test_metric_arithmetic() -> None:
    queries = [
        ev.EvalQuery("a", "q-a", "direct", "KB-01"),  # rank 1
        ev.EvalQuery("b", "q-b", "direct", "KB-02"),  # rank 2
        ev.EvalQuery("c", "q-c", "direct", "KB-03"),  # not retrieved
        ev.EvalQuery("n1", "q-n1", "negative", None),  # nothing returned: correct
        ev.EvalQuery("n2", "q-n2", "negative", None, ("KB-06",)),  # only an allowed article: correct
        ev.EvalQuery("n3", "q-n3", "negative", None),  # returns an article: false positive
    ]
    canned = {
        "q-a": ["KB-01"],
        "q-b": ["KB-05", "KB-02"],
        "q-c": [],
        "q-n1": [],
        "q-n2": ["KB-06"],
        "q-n3": ["KB-04"],
    }
    m = ev.evaluate(queries, lambda q: canned[q])
    assert m.precision_at_1 == pytest.approx(1 / 3)
    assert m.recall_at_3 == pytest.approx(2 / 3)
    assert m.mrr == pytest.approx((1 + 0.5 + 0) / 3)
    assert m.false_positive_rate == pytest.approx(1 / 3)
    assert [x.split()[0] for x in m.misses] == ["c"]
    assert [x.split()[0] for x in m.false_positives] == ["n3"]


def test_metrics_are_none_when_a_class_is_empty() -> None:
    m = ev.evaluate([], lambda q: [])
    assert m.precision_at_1 is None and m.false_positive_rate is None


def test_holdout_is_not_read_by_default_run(capsys: pytest.CaptureFixture[str]) -> None:
    ev.main([])
    assert "== tune" in capsys.readouterr().out


def test_sweep_row_at_the_configured_threshold_matches_the_main_row(capsys: pytest.CaptureFixture[str]) -> None:
    # Regression: the sweep once fell back to a stale default coverage gate and disagreed with the main table.
    ev.main([])
    lines = capsys.readouterr().out.splitlines()
    main_row = next(line for line in lines if line.startswith("tfidf (min_score="))
    sweep_row = next(line for line in lines if line.startswith("0.150"))
    assert main_row.split()[-4:] == sweep_row.split()[-4:]
