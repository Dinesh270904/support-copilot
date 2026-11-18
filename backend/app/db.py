"""SQLite engine factory.

Two access modes:
- read/write: used by the FastAPI service (mark reviewed, assistant run log) and the seed.
- read-only: used by the MCP server. The file is opened with the SQLite URI flag
  `mode=ro` *and* `PRAGMA query_only=ON`, so even a bug in a tool cannot write.
"""

from __future__ import annotations

from pathlib import Path

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker


def make_engine(db_path: Path, *, read_only: bool = False) -> Engine:
    if read_only:
        if not db_path.exists():
            raise FileNotFoundError(f"Database not found at {db_path}; run the seed first (make setup).")
        url = f"sqlite+pysqlite:///file:{db_path.as_posix()}?mode=ro&uri=true"
    else:
        db_path.parent.mkdir(parents=True, exist_ok=True)
        url = f"sqlite+pysqlite:///{db_path.as_posix()}"

    engine = create_engine(url, connect_args={"check_same_thread": False, "timeout": 5})

    @event.listens_for(engine, "connect")
    def _set_pragmas(dbapi_connection, _record) -> None:  # pragma: no cover - trivial
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA busy_timeout=5000")
        if read_only:
            cursor.execute("PRAGMA query_only=ON")
        cursor.close()

    return engine


def make_sessionmaker(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, expire_on_commit=False)
