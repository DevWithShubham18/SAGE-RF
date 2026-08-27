from __future__ import annotations

from typing import Any, Dict

import numpy as np

from backend.app.dsp.modulation import analyze_modulation


def extract_signal_segment(
    samples: np.ndarray,
    sample_rate: float,
    lower_frequency_hz: float,
    upper_frequency_hz: float,
) -> np.ndarray:
    """
    Extract a frequency-isolated approximation of a detected RF signal.

    This uses FFT-domain masking so each detected candidate can be
    analyzed independently.
    """

    x = np.asarray(samples, dtype=np.complex64)

    if x.size == 0:
        return x

    spectrum = np.fft.fftshift(np.fft.fft(x))
    frequencies = np.fft.fftshift(
        np.fft.fftfreq(x.size, d=1.0 / sample_rate)
    )

    mask = (
        (frequencies >= lower_frequency_hz)
        & (frequencies <= upper_frequency_hz)
    )

    filtered_spectrum = np.where(mask, spectrum, 0.0)

    segment = np.fft.ifft(np.fft.ifftshift(filtered_spectrum))

    return segment.astype(np.complex64)


def calculate_signal_metrics(
    samples: np.ndarray,
    sample_rate: float,
) -> Dict[str, float]:
    """
    Calculate basic metrics for an isolated RF signal.
    """

    x = np.asarray(samples)

    if x.size == 0:
        return {
            "sample_count": 0,
            "duration_seconds": 0.0,
            "peak_amplitude": 0.0,
            "mean_power": 0.0,
            "rms_amplitude": 0.0,
        }

    amplitudes = np.abs(x)

    mean_power = float(np.mean(amplitudes**2))
    rms = float(np.sqrt(mean_power))

    return {
        "sample_count": int(x.size),
        "duration_seconds": float(x.size / sample_rate),
        "peak_amplitude": float(np.max(amplitudes)),
        "mean_power": mean_power,
        "rms_amplitude": rms,
    }


def analyze_detected_signal(
    samples: np.ndarray,
    sample_rate: float,
    candidate: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Perform detailed analysis on one detected RF candidate.

    The candidate is frequency-isolated and then passed through the
    modulation classifier.
    """

    lower = float(candidate["lower_frequency_hz"])
    upper = float(candidate["upper_frequency_hz"])

    isolated = extract_signal_segment(
        samples=samples,
        sample_rate=sample_rate,
        lower_frequency_hz=lower,
        upper_frequency_hz=upper,
    )

    metrics = calculate_signal_metrics(
        isolated,
        sample_rate,
    )

    modulation_result = analyze_modulation(
        isolated,
        sample_rate,
    )

    classification = modulation_result["classification"]

    return {
        "candidate": candidate,
        "metrics": metrics,
        "modulation": classification,
        "samples_analyzed": int(isolated.size),
    }


def analyze_all_detected_signals(
    samples: np.ndarray,
    sample_rate: float,
    candidates: list[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Analyze every detected RF candidate independently.
    """

    results = []

    for index, candidate in enumerate(candidates, start=1):
        analysis = analyze_detected_signal(
            samples=samples,
            sample_rate=sample_rate,
            candidate=candidate,
        )

        analysis["signal_index"] = index

        results.append(analysis)

    return {
        "signal_count": len(results),
        "signals": results,
    }