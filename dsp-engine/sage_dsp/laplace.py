from __future__ import annotations

from typing import Any

import numpy as np

from .core.signal import Signal


def analyze_laplace(
    signal: Signal,
    sigma_min: float = -500.0,
    sigma_max: float = 500.0,
    sigma_points: int = 41,
    frequency_points: int = 256,
) -> dict[str, Any]:
    """
    Analyze a sampled signal over a complex Laplace/Z-transform grid.

    For a sampled signal x[n], we evaluate:

        X(sigma, f) = sum x[n] * exp(-(sigma + j*2*pi*f) * n/fs)

    The frequency axis is limited to the Nyquist interval.

    This is intended as an analysis/visualization stage for SAGE-RF,
    not as a replacement for a continuous-time Laplace transform.
    """

    if signal.sample_count == 0:
        raise ValueError("Cannot analyze an empty signal.")

    if signal.sample_rate <= 0:
        raise ValueError("sample_rate must be greater than zero.")

    if sigma_min > sigma_max:
        raise ValueError("sigma_min must not exceed sigma_max.")

    if sigma_points < 2:
        raise ValueError("sigma_points must be at least 2.")

    if frequency_points < 2:
        raise ValueError("frequency_points must be at least 2.")

    x = np.asarray(signal.samples, dtype=np.complex128)

    # Keep the calculation bounded for large audio files.
    # The caller can choose a smaller analysis window if required.
    n = np.arange(x.size, dtype=np.float64)
    time = n / float(signal.sample_rate)

    frequencies = np.linspace(
        -signal.sample_rate / 2.0,
        signal.sample_rate / 2.0,
        frequency_points,
        endpoint=False,
    )

    sigmas = np.linspace(
        sigma_min,
        sigma_max,
        sigma_points,
    )

    magnitude = np.empty(
        (sigma_points, frequency_points),
        dtype=np.float64,
    )

    phase = np.empty_like(magnitude)

    # Normalize time so the exponential is evaluated in seconds.
    # For long recordings, large positive/negative sigma values
    # can overflow. Clip the real exponent to a safe numerical range.
    for row, sigma in enumerate(sigmas):
        exponent_real = np.clip(
            -sigma * time,
            -700.0,
            700.0,
        )

        envelope = np.exp(exponent_real)

        for column, frequency in enumerate(frequencies):
            kernel = envelope * np.exp(
                -1j * 2.0 * np.pi * frequency * time
            )

            value = np.sum(x * kernel)

            magnitude[row, column] = np.abs(value)
            phase[row, column] = np.angle(value)

    magnitude_db = 20.0 * np.log10(
        np.maximum(magnitude, np.finfo(float).tiny)
    )

    peak_index = np.unravel_index(
        int(np.argmax(magnitude)),
        magnitude.shape,
    )

    peak_sigma = float(sigmas[peak_index[0]])
    peak_frequency = float(frequencies[peak_index[1]])

    return {
        "sigma": sigmas.tolist(),
        "frequencies_hz": frequencies.tolist(),
        "magnitude": magnitude.tolist(),
        "magnitude_db": magnitude_db.tolist(),
        "phase_rad": phase.tolist(),
        "peak": {
            "sigma": peak_sigma,
            "frequency_hz": peak_frequency,
            "magnitude": float(magnitude[peak_index]),
            "magnitude_db": float(magnitude_db[peak_index]),
        },
        "metadata": {
            "sample_rate": float(signal.sample_rate),
            "sample_count": int(signal.sample_count),
            "duration_seconds": float(signal.duration_seconds),
            "sigma_min": float(sigma_min),
            "sigma_max": float(sigma_max),
            "sigma_points": int(sigma_points),
            "frequency_points": int(frequency_points),
        },
    }
