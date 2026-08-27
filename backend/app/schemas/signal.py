from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class SignalParameters(BaseModel):
    """Detected or user-supplied RF signal parameters."""

    sampling_frequency: float | None = Field(
        default=None,
        description="Signal sampling frequency in samples/second.",
    )

    center_frequency: float | None = Field(
        default=None,
        description="RF center frequency in Hz.",
    )

    bandwidth: float | None = Field(
        default=None,
        description="Estimated occupied bandwidth in Hz.",
    )

    snr_db: float | None = Field(
        default=None,
        description="Estimated signal-to-noise ratio in dB.",
    )

    modulation: str | None = Field(
        default=None,
        description="Detected modulation type.",
    )

    symbol_rate: float | None = Field(
        default=None,
        description="Estimated symbol rate in symbols/second.",
    )

    fec: str | None = Field(
        default=None,
        description="Detected forward error correction scheme.",
    )

    interleaving: str | None = Field(
        default=None,
        description="Detected interleaving scheme.",
    )

    confidence: float | None = Field(
        default=None,
        ge=0.0,
        le=1.0,
        description="Overall detection confidence.",
    )


class SignalMetadata(BaseModel):
    """Basic information about the uploaded signal."""

    source_format: Literal["iq", "wav"] | None = None

    sample_rate: float | None = None

    sample_count: int = Field(
        default=0,
        ge=0,
    )

    duration_seconds: float = Field(
        default=0.0,
        ge=0.0,
    )

    peak_amplitude: float | None = None

    mean_power: float | None = None


class SpectrumResult(BaseModel):
    """Frequency-domain signal measurements."""

    peak_frequency_hz: float | None = None

    peak_power_db: float | None = None

    noise_floor_db: float | None = None

    snr_db: float | None = None

    occupied_bandwidth_hz: float | None = None

    occupied_lower_hz: float | None = None

    occupied_upper_hz: float | None = None

    frequency_min_hz: float | None = None

    frequency_max_hz: float | None = None

    frequency_bins: int = 0

    frequency_resolution_hz: float | None = None


class WaterfallResult(BaseModel):
    """Time-frequency representation for the frontend."""

    frequencies_hz: list[float] = Field(
        default_factory=list,
    )

    times_seconds: list[float] = Field(
        default_factory=list,
    )

    power_db: list[list[float]] = Field(
        default_factory=list,
    )

    time_bins: int = 0

    frequency_bins: int = 0


class AnalysisResult(BaseModel):
    """Complete SAGE-RF signal analysis result."""

    status: Literal[
        "success",
        "partial",
        "error",
    ] = "success"

    signal_id: str | None = None

    filename: str | None = None

    metadata: SignalMetadata | None = None

    parameters: SignalParameters | None = None

    spectrum: SpectrumResult | None = None

    waterfall: WaterfallResult | None = None

    diagnostics: dict[str, Any] = Field(
        default_factory=dict,
    )

    errors: list[str] = Field(
        default_factory=list,
    )