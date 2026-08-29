from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.db.database import Base


class SignalAnalysis(Base):
    __tablename__ = "signal_analyses"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    # Firebase Authentication UID
    user_id: Mapped[str] = mapped_column(
        String(128),
        index=True,
        nullable=False,
    )

    filename: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    source_format: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )

    sample_rate: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    duration_seconds: Mapped[float | None] = mapped_column(
        nullable=True,
    )

    peak_frequency_hz: Mapped[float | None] = mapped_column(
        nullable=True,
    )

    occupied_bandwidth_hz: Mapped[float | None] = mapped_column(
        nullable=True,
    )

    snr_db: Mapped[float | None] = mapped_column(
        nullable=True,
    )

    modulation: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )

    detection_count: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    result_json: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )