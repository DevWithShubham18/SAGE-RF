from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker


BASE_DIR = Path(__file__).resolve().parents[3]
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

DATABASE_URL = f"sqlite:///{DATA_DIR / 'sage_rf.db'}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

Base = declarative_base()


def initialize_database(bind=engine) -> None:
    """Create any missing application tables without altering existing data."""

    # Import models here so their table metadata is registered before
    # create_all() runs. The local import also avoids a module-level cycle.
    from backend.app.db import models  # noqa: F401

    Base.metadata.create_all(bind=bind)


def get_db():
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()
