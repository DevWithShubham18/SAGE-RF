from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np
from scipy import signal


EPS = 1e-12


@dataclass
class ModulationFeatures:
    """
    Measurable features extracted from a complex baseband signal.

    These features are intentionally separated from the classifier.
    This allows us to later replace the rule-based classifier with
    an ML model without changing the DSP pipeline.
    """

    sample_count: int

    amplitude_mean: float
    amplitude_std: float
    amplitude_cv: float

    phase_mean: float
    phase_std: float

    frequency_mean_hz: float
    frequency_std_hz: float

    instantaneous_frequency_percentiles_hz: dict[str, float]

    iq_mean_real: float
    iq_mean_imag: float
    iq_std_real: float
    iq_std_imag: float

    zero_crossing_rate: float

    spectral_centroid_hz: float
    spectral_bandwidth_hz: float

    constellation_radius_mean: float
    constellation_radius_std: float

    phase_transition_mean_rad: float
    phase_transition_std_rad: float

    fourth_moment_normalized: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "sample_count": self.sample_count,
            "amplitude": {
                "mean": self.amplitude_mean,
                "std": self.amplitude_std,
                "coefficient_of_variation": self.amplitude_cv,
            },
            "phase": {
                "mean_rad": self.phase_mean,
                "std_rad": self.phase_std,
            },
            "instantaneous_frequency": {
                "mean_hz": self.frequency_mean_hz,
                "std_hz": self.frequency_std_hz,
                "percentiles_hz": self.instantaneous_frequency_percentiles_hz,
            },
            "iq": {
                "mean_real": self.iq_mean_real,
                "mean_imag": self.iq_mean_imag,
                "std_real": self.iq_std_real,
                "std_imag": self.iq_std_imag,
            },
            "zero_crossing_rate": self.zero_crossing_rate,
            "spectrum": {
                "centroid_hz": self.spectral_centroid_hz,
                "bandwidth_hz": self.spectral_bandwidth_hz,
            },
            "constellation": {
                "radius_mean": self.constellation_radius_mean,
                "radius_std": self.constellation_radius_std,
            },
            "phase_transitions": {
                "mean_rad": self.phase_transition_mean_rad,
                "std_rad": self.phase_transition_std_rad,
            },
            "higher_order": {
                "fourth_moment_normalized": self.fourth_moment_normalized,
            },
        }


@dataclass
class ModulationClassification:
    """
    Result of the baseline modulation classifier.
    """

    modulation: str
    confidence: float
    evidence: dict[str, Any]
    alternatives: list[dict[str, Any]]

    def to_dict(self) -> dict[str, Any]:
        return {
            "modulation": self.modulation,
            "confidence": self.confidence,
            "evidence": self.evidence,
            "alternatives": self.alternatives,
        }


def _validate_signal(samples: np.ndarray) -> np.ndarray:
    """Validate and normalize input into a finite complex64 vector."""

    x = np.asarray(samples)

    if x.size == 0:
        raise ValueError("Cannot analyze an empty signal.")

    x = np.ravel(x)

    if not np.iscomplexobj(x):
        x = x.astype(np.float64) + 0j

    x = x.astype(np.complex64)

    finite = np.isfinite(x.real) & np.isfinite(x.imag)

    if not np.all(finite):
        x = x[finite]

    if x.size == 0:
        raise ValueError("Signal contains no finite samples.")

    return x


def _safe_std(values: np.ndarray) -> float:
    if values.size < 2:
        return 0.0

    return float(np.std(values))


def _wrapped_phase_difference(phase: np.ndarray) -> np.ndarray:
    """
    Calculate phase differences while wrapping them to [-pi, pi].
    """

    if phase.size < 2:
        return np.empty(0, dtype=np.float64)

    return np.angle(np.exp(1j * np.diff(phase)))


def _instantaneous_frequency(
    samples: np.ndarray,
    sample_rate: float,
) -> np.ndarray:
    """
    Estimate instantaneous frequency from the derivative of
    unwrapped complex phase.
    """

    if sample_rate <= 0:
        raise ValueError("sample_rate must be greater than zero.")

    if samples.size < 2:
        return np.empty(0, dtype=np.float64)

    phase = np.unwrap(np.angle(samples))

    frequency = np.diff(phase) * sample_rate / (2.0 * np.pi)

    return frequency.astype(np.float64)


def _spectral_features(
    samples: np.ndarray,
    sample_rate: float,
) -> tuple[float, float]:
    """
    Estimate spectral centroid and RMS-like spectral bandwidth.
    """

    if samples.size < 4:
        return 0.0, 0.0

    nperseg = min(4096, samples.size)

    frequencies, psd = signal.welch(
        samples,
        fs=sample_rate,
        nperseg=nperseg,
        return_onesided=False,
        scaling="density",
    )

    frequencies = np.fft.fftshift(frequencies)
    psd = np.fft.fftshift(psd)

    psd = np.maximum(np.asarray(psd, dtype=np.float64), 0.0)

    total_power = float(np.sum(psd))

    if total_power <= EPS:
        return 0.0, 0.0

    centroid = float(np.sum(frequencies * psd) / total_power)

    variance = float(
        np.sum(((frequencies - centroid) ** 2) * psd)
        / total_power
    )

    bandwidth = float(np.sqrt(max(variance, 0.0)))

    return centroid, bandwidth


def _zero_crossing_rate(samples: np.ndarray) -> float:
    """
    Calculate zero-crossing rate of the real component.

    This is not sufficient to identify a modulation by itself,
    but is useful as one feature among many.
    """

    real = np.real(samples)

    if real.size < 2:
        return 0.0

    signs = np.signbit(real)

    crossings = np.count_nonzero(signs[1:] != signs[:-1])

    return float(crossings / (real.size - 1))


def _normalized_fourth_moment(samples: np.ndarray) -> float:
    """
    Calculate a normalized fourth-order complex moment.

    This is useful for distinguishing families of digitally
    modulated signals and can later feed an ML classifier.
    """

    power = np.mean(np.abs(samples) ** 2)

    if power <= EPS:
        return 0.0

    fourth = np.mean(np.abs(samples) ** 4)

    return float(fourth / (power**2 + EPS))


def extract_modulation_features(
    samples: np.ndarray,
    sample_rate: float,
) -> ModulationFeatures:
    """
    Extract modulation-oriented statistical features.

    Parameters
    ----------
    samples:
        Complex baseband samples.

    sample_rate:
        Sampling frequency in Hz.

    Returns
    -------
    ModulationFeatures
        Feature vector suitable for classification.
    """

    if sample_rate <= 0:
        raise ValueError("sample_rate must be greater than zero.")

    x = _validate_signal(samples)

    amplitude = np.abs(x)

    amplitude_mean = float(np.mean(amplitude))
    amplitude_std = _safe_std(amplitude)

    amplitude_cv = float(
        amplitude_std / max(abs(amplitude_mean), EPS)
    )

    phase = np.unwrap(np.angle(x))

    phase_mean = float(np.mean(phase))
    phase_std = _safe_std(phase)

    inst_freq = _instantaneous_frequency(
        x,
        sample_rate,
    )

    if inst_freq.size:
        frequency_mean = float(np.mean(inst_freq))
        frequency_std = _safe_std(inst_freq)

        frequency_percentiles = {
            "p05": float(np.percentile(inst_freq, 5)),
            "p25": float(np.percentile(inst_freq, 25)),
            "p50": float(np.percentile(inst_freq, 50)),
            "p75": float(np.percentile(inst_freq, 75)),
            "p95": float(np.percentile(inst_freq, 95)),
        }
    else:
        frequency_mean = 0.0
        frequency_std = 0.0

        frequency_percentiles = {
            "p05": 0.0,
            "p25": 0.0,
            "p50": 0.0,
            "p75": 0.0,
            "p95": 0.0,
        }

    phase_transitions = _wrapped_phase_difference(
        np.angle(x)
    )

    if phase_transitions.size:
        phase_transition_mean = float(
            np.mean(np.abs(phase_transitions))
        )
        phase_transition_std = _safe_std(
            np.abs(phase_transitions)
        )
    else:
        phase_transition_mean = 0.0
        phase_transition_std = 0.0

    centroid, bandwidth = _spectral_features(
        x,
        sample_rate,
    )

    constellation_radius_mean = float(
        np.mean(amplitude)
    )

    constellation_radius_std = _safe_std(amplitude)

    iq_mean_real = float(np.mean(x.real))
    iq_mean_imag = float(np.mean(x.imag))

    iq_std_real = _safe_std(x.real)
    iq_std_imag = _safe_std(x.imag)

    zcr = _zero_crossing_rate(x)

    fourth_moment = _normalized_fourth_moment(x)

    return ModulationFeatures(
        sample_count=int(x.size),
        amplitude_mean=amplitude_mean,
        amplitude_std=amplitude_std,
        amplitude_cv=amplitude_cv,
        phase_mean=phase_mean,
        phase_std=phase_std,
        frequency_mean_hz=frequency_mean,
        frequency_std_hz=frequency_std,
        instantaneous_frequency_percentiles_hz=frequency_percentiles,
        iq_mean_real=iq_mean_real,
        iq_mean_imag=iq_mean_imag,
        iq_std_real=iq_std_real,
        iq_std_imag=iq_std_imag,
        zero_crossing_rate=zcr,
        spectral_centroid_hz=centroid,
        spectral_bandwidth_hz=bandwidth,
        constellation_radius_mean=constellation_radius_mean,
        constellation_radius_std=constellation_radius_std,
        phase_transition_mean_rad=phase_transition_mean,
        phase_transition_std_rad=phase_transition_std,
        fourth_moment_normalized=fourth_moment,
    )


def _clamp_confidence(value: float) -> float:
    return float(np.clip(value, 0.0, 1.0))


def _score_psk(features: ModulationFeatures) -> dict[str, float]:
    """
    Score PSK-like behavior.

    Constant-envelope signals with relatively small amplitude
    variation are strong PSK candidates.
    """

    amplitude_score = float(
        np.clip(1.0 - features.amplitude_cv * 4.0, 0.0, 1.0)
    )

    return {
        "amplitude_stability": amplitude_score,
    }


def _score_fsk(
    features: ModulationFeatures,
) -> dict[str, float]:
    """
    Score FSK-like behavior.

    FSK tends to preserve amplitude while producing
    meaningful instantaneous-frequency variation.
    """

    amplitude_score = float(
        np.clip(1.0 - features.amplitude_cv * 4.0, 0.0, 1.0)
    )

    frequency_variation = features.frequency_std_hz

    # Normalize frequency variation relative to a broad
    # practical scale. This is deliberately conservative.
    frequency_score = float(
        np.clip(frequency_variation / 1000.0, 0.0, 1.0)
    )

    return {
        "amplitude_stability": amplitude_score,
        "frequency_variation": frequency_score,
    }


def _score_qam(
    features: ModulationFeatures,
) -> dict[str, float]:
    """
    Score QAM-like behavior.

    QAM normally exhibits more amplitude variation than
    constant-envelope PSK/FSK signals.
    """

    amplitude_variation = float(
        np.clip(features.amplitude_cv * 4.0, 0.0, 1.0)
    )

    return {
        "amplitude_variation": amplitude_variation,
    }


def classify_modulation(
    features: ModulationFeatures,
) -> ModulationClassification:
    """
    Explainable baseline modulation classifier.

    This is intentionally NOT presented as a production-grade
    universal modulation classifier. It provides a deterministic
    baseline that can later be replaced or augmented by an ML
    classifier trained on real RF datasets.
    """

    psk = _score_psk(features)
    fsk = _score_fsk(features)
    qam = _score_qam(features)

    psk_score = psk["amplitude_stability"]

    fsk_score = (
        0.55 * fsk["amplitude_stability"]
        + 0.45 * fsk["frequency_variation"]
    )

    qam_score = qam["amplitude_variation"]

    scores = {
        "PSK-like": psk_score,
        "FSK-like": fsk_score,
        "QAM-like": qam_score,
    }

    ranked = sorted(
        scores.items(),
        key=lambda item: item[1],
        reverse=True,
    )

    best_label, best_score = ranked[0]

    second_score = ranked[1][1]

    # Penalize ambiguous classifications.
    margin = max(best_score - second_score, 0.0)

    confidence = _clamp_confidence(
        0.55 * best_score + 0.45 * margin
    )

    evidence: dict[str, Any] = {
        "classifier": "explainable_baseline",
        "psk_score": psk_score,
        "fsk_score": fsk_score,
        "qam_score": qam_score,
        "amplitude_cv": features.amplitude_cv,
        "frequency_std_hz": features.frequency_std_hz,
        "phase_transition_std_rad": features.phase_transition_std_rad,
    }

    alternatives = [
        {
            "modulation": label,
            "score": float(score),
        }
        for label, score in ranked[1:]
    ]

    return ModulationClassification(
        modulation=best_label,
        confidence=confidence,
        evidence=evidence,
        alternatives=alternatives,
    )


def analyze_modulation(
    samples: np.ndarray,
    sample_rate: float,
) -> dict[str, Any]:
    """
    Complete modulation-analysis stage.

    Returns both the raw feature vector and the classification
    result so the frontend can display the reasoning behind the
    prediction.
    """

    features = extract_modulation_features(
        samples,
        sample_rate,
    )

    classification = classify_modulation(features)

    return {
        "classification": classification.to_dict(),
        "features": features.to_dict(),
    }