from typing import Optional

from pydantic import BaseModel, Field


class SignalParameters(BaseModel):
    """Parameters extracted from an RF signal."""

    sampling_frequency: Optional[float] = Field(
        default=None,
        description="Sample rate in samples per second.",
    )

    center_frequency: Optional[float] = Field(
        default=None,
        description="Signal center frequency in Hz.",
    )

    bandwidth: Optional[float] = Field(
        default=None,
        description="Estimated occupied bandwidth in Hz.",
    )

    snr_db: Optional[float] = Field(
        default=None,
        description="Estimated signal-to-noise ratio in dB.",
    )

    modulation: Optional[str] = Field(
        default=None,
        description="Detected modulation type.",
    )

    symbol_rate: Optional[float] = Field(
        default=None,
        description="Estimated symbol rate in symbols per second.",
    )

    fec: Optional[str] = Field(
        default=None,
        description="Detected forward error correction scheme.",
    )

    interleaving: Optional[str] = Field(
        default=None,
        description="Detected interleaving scheme.",
    )

    confidence: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=1.0,
        description="Overall parameter detection confidence.",
    )


class SignalAnalysisResult(BaseModel):
    """Complete result returned by the SAGE-RF analysis pipeline."""

    signal_id: str = Field(
        description="Unique identifier for the analyzed signal.",
    )

    source_format: str = Field(
        description="Input format, such as WAV or IQ.",
    )

    duration_seconds: Optional[float] = Field(
        default=None,
        ge=0.0,
        description="Duration of the analyzed recording.",
    )

    sample_count: Optional[int] = Field(
        default=None,
        ge=0,
        description="Number of samples analyzed.",
    )

    parameters: SignalParameters

    processing_status: str = Field(
        default="completed",
        description="Current processing state.",
    )