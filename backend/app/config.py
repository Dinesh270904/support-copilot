"""Runtime configuration, read from environment variables with safe local defaults.

No setting is a secret and none is required: the app runs offline with defaults.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent


def _env_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    return float(raw) if raw not in (None, "") else default


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    return int(raw) if raw not in (None, "") else default


@dataclass(frozen=True)
class Settings:
    db_path: Path
    seed_dir: Path
    # Retrieval. The threshold was calibrated against data/seed/expected_cases.json;
    # see README "Threshold choice" for the measured score distribution.
    rag_min_score: float = 0.15
    rag_min_term_coverage: float = 0.6
    rag_default_top_k: int = 3
    rag_max_top_k: int = 10
    # Sentence-level evidence selection inside retrieved chunks.
    evidence_min_sentence_score: float = 0.05
    evidence_max_sentences: int = 3
    # MCP client behaviour.
    mcp_startup_timeout_s: float = 30.0
    mcp_call_timeout_s: float = 15.0
    # API input limits.
    max_query_chars: int = 500
    cors_origins: tuple[str, ...] = field(default_factory=tuple)
    log_level: str = "INFO"

    @property
    def db_url(self) -> str:
        return f"sqlite+pysqlite:///{self.db_path}"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    db_path = Path(os.environ.get("SUPPORT_COPILOT_DB", BACKEND_DIR / "data" / "support.db")).resolve()
    seed_dir = Path(os.environ.get("SUPPORT_COPILOT_SEED_DIR", BACKEND_DIR / "data" / "seed")).resolve()
    origins = os.environ.get("SUPPORT_COPILOT_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
    return Settings(
        db_path=db_path,
        seed_dir=seed_dir,
        rag_min_score=_env_float("SUPPORT_COPILOT_RAG_MIN_SCORE", 0.15),
        rag_min_term_coverage=_env_float("SUPPORT_COPILOT_RAG_MIN_TERM_COVERAGE", 0.6),
        rag_default_top_k=_env_int("SUPPORT_COPILOT_RAG_TOP_K", 3),
        mcp_startup_timeout_s=_env_float("SUPPORT_COPILOT_MCP_STARTUP_TIMEOUT", 30.0),
        mcp_call_timeout_s=_env_float("SUPPORT_COPILOT_MCP_CALL_TIMEOUT", 15.0),
        cors_origins=tuple(o.strip() for o in origins.split(",") if o.strip()),
        log_level=os.environ.get("SUPPORT_COPILOT_LOG_LEVEL", "INFO").upper(),
    )
