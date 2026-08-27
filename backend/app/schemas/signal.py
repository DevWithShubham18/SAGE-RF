from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class SignalParameters(BaseModel):
    sampling_frequency: Optional[float] = None
    center_frequency: Optional[float] = None
    bandwidth: Optional[float] = None
    snr_db: Optional[float] = None
    modulation: Optional[str] = None
    symbol_rate: Optional[float] = None
    fec: Optional[str] = None
    interleaving: Optional[str] = None
    confidence: Optional[float] = Field(default=None, ge=0.0, le=1.0)


class SignalMetadata(BaseModel):
    source_format: str
    sample_rate: float
    sample_count: int
    duration_seconds: float
    peak_amplitude: Optional[float] = None
    mean_power: Optional[float] = None


class SpectrumResult(BaseModel):
    peak_frequency_hz: Optional[float] = None
    peak_power_db: Optional[float] = None
    noise_floor_db: Optional[float] = None
    snr_db: Optional[float] = None

    occupied_bandwidth_hz: Optional[float] = None
    occupied_lower_hz: Optional[float] = None
    occupied_upper_hz: Optional[float] = None

    frequency_min_hz: Optional[float] = None
    frequency_max_hz: Optional[float] = None
    frequency_bins: int = 0
    frequency_resolution_hz: Optional[float] = None


class WaterfallResult(BaseModel):
    frequencies_hz: List[float] = Field(default_factory=list)
    times_seconds: List[float] = Field(default_factory=list)
    power_db: List[List[float]] = Field(default_factory=list)

    time_bins: int = 0
    frequency_bins: int = 0


class ModulationAlternative(BaseModel):
    modulation: str
    score: float


class ModulationEvidence(BaseModel):
    classifier: str
    psk_score: float
    fsk_score: float
    qam_score: float
    amplitude_cv: float
    frequency_std_hz: float
    phase_transition_std_rad: float


class ModulationClassification(BaseModel):
    modulation: str
    confidence: float = Field(ge=0.0, le=1.0)
    evidence: ModulationEvidence
    alternatives: List[ModulationAlternative] = Field(default_factory=list)


class AnalysisResult(BaseModel):
    status: str = "success"

    signal_id: Optional[str] = None
    filename: Optional[str] = None

    metadata: SignalMetadata
    parameters: Optional[SignalParameters] = None

    spectrum: Optional[SpectrumResult] = None
    waterfall: Optional[WaterfallResult] = None
    modulation: Optional[ModulationClassification] = None

    diagnostics: Dict[str, Any] = Field(default_factory=dict)
    errors: List[str] = Field(default_factory=list)