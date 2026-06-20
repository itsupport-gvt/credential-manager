"""
database.py – SQLAlchemy engine, session factory, and migration helpers.
"""

from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, Session

from models_db import Base  # noqa: F401 – ensures all ORM models are registered before create_all

# ---------------------------------------------------------------------------
# Database path resolution
# ---------------------------------------------------------------------------

_cred_data_dir = os.environ.get("CRED_DATA_DIR", "")
if _cred_data_dir:
    DB_PATH = str(Path(_cred_data_dir) / "credentials.db")
else:
    _default_dir = Path(__file__).parent / "data"
    _default_dir.mkdir(parents=True, exist_ok=True)
    DB_PATH = str(_default_dir / "credentials.db")

DATABASE_URL = f"sqlite:///{DB_PATH}"

# ---------------------------------------------------------------------------
# Engine & session
# ---------------------------------------------------------------------------

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    """FastAPI dependency – yields a SQLAlchemy session, always closes it."""
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Table creation
# ---------------------------------------------------------------------------

def create_tables(eng=None) -> None:
    """Create all ORM tables if they do not already exist."""
    _engine = eng or engine
    Base.metadata.create_all(bind=_engine)


# ---------------------------------------------------------------------------
# Idempotent migrations
# ---------------------------------------------------------------------------

# Map each model class to a list of (column_name, sql_type, default_clause)
# for columns that may have been added after the initial schema.
_MIGRATIONS: dict[str, list[tuple[str, str, str]]] = {
    "credentials": [
        # Any new columns added in future versions go here.
        # e.g. ("new_column", "VARCHAR", "DEFAULT ''"),
    ],
    "change_log": [],
    "tenants": [],
    "categories": [],
    "users": [],
}


def run_migrations(eng=None) -> None:
    """
    Idempotently add any missing columns to existing tables.
    Safe to call on every startup – skips columns that already exist.
    """
    _engine = eng or engine
    insp = inspect(_engine)

    with _engine.begin() as conn:
        for table_name, columns in _MIGRATIONS.items():
            if not insp.has_table(table_name):
                continue
            existing = {col["name"] for col in insp.get_columns(table_name)}
            for col_name, col_type, col_default in columns:
                if col_name not in existing:
                    ddl = (
                        f"ALTER TABLE {table_name} "
                        f"ADD COLUMN {col_name} {col_type} {col_default}"
                    )
                    conn.execute(text(ddl))

    # Also ensure the ORM-managed schema is fully up-to-date (new tables).
    Base.metadata.create_all(bind=_engine)
