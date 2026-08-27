from __future__ import annotations

import numpy as np
from scipy import signal


def compute_psd(
    samples: np.ndarray,
    sample_rate: float,
    nperseg: int = 1024,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Compute a Welch power spectral density estimate.

    Returns:
        frequencies: Frequency bins in Hz.
        psd_db: Power spectral density in dB.
    """

    if samples.size == 0:
        raise ValueError("Cannot compute PSD from empty samples.")

    if sample_rate <= 0:
        raise ValueError("sample_rate must be greater than zero.")

    nperseg = min(nperseg, samples.size)

    if nperseg < 2:
        raise ValueError("At least two samples are required.")

    frequencies, psd = signal.welch(
        samples,
        fs=sample_rate,
        nperseg=nperseg,
        return_onesided=False,
        scaling="density",
    )

    frequencies = np.fft.fftshift(frequencies)
    psd = np.fft.fftshift(psd)

    psd_db = 10.0 * np.log10(
        np.maximum(psd, np.finfo(float).tiny)
    )

    return frequencies, psd_db


def estimate_noise_floor(psd_db: np.ndarray) -> float:
    """
    Estimate the noise floor using a robust lower-percentile
    statistic.
    """

    if psd_db.size == 0:
        raise ValueError("Cannot estimate noise floor from empty PSD.")

    return float(np.percentile(psd_db, 20.0))


def find_peak_frequency(
    frequencies: np.ndarray,
    psd_db: np.ndarray,
) -> tuple[float, float]:
    """
    Find the strongest spectral component.

    Returns:
        peak_frequency_hz
        peak_power_db
    """

    if frequencies.size == 0 or psd_db.size == 0:
        raise ValueError(
            "Frequency and PSD arrays cannot be empty."
        )

    if frequencies.size != psd_db.size:
        raise ValueError(
            "Frequency and PSD arrays must have the same length."
        )

    peak_index = int(np.argmax(psd_db))

    return (
        float(frequencies[peak_index]),
        float(psd_db[peak_index]),
    )


def estimate_snr(
    psd_db: np.ndarray,
    noise_floor_db: float | None = None,
) -> float:
    """
    Estimate SNR from the strongest spectral component
    relative to the estimated noise floor.
    """

    if psd_db.size == 0:
        raise ValueError("Cannot estimate SNR from empty PSD.")

    if noise_floor_db is None:
        noise_floor_db = estimate_noise_floor(psd_db)

    peak_power_db = float(np.max(psd_db))

    return float(peak_power_db - noise_floor_db)


def estimate_occupied_bandwidth(
    frequencies: np.ndarray,
    psd_db: np.ndarray,
    percentage: float = 99.0,
) -> tuple[float, float, float]:
    """
    Estimate occupied bandwidth using cumulative spectral power.

    The returned interval contains approximately the requested
    percentage of the total spectral power.

    Returns:
        lower_frequency_hz
        upper_frequency_hz
        occupied_bandwidth_hz
    """

    if frequencies.size == 0 or psd_db.size == 0:
        raise ValueError(
            "Frequency and PSD arrays cannot be empty."
        )

    if frequencies.size != psd_db.size:
        raise ValueError(
            "Frequency and PSD arrays must have the same length."
        )

    if not 0.0 < percentage < 100.0:
        raise ValueError(
            "percentage must be between 0 and 100."
        )

    # Convert PSD from dB back to linear power density.
    power = 10.0 ** (psd_db / 10.0)

    # Sort frequencies so cumulative integration is meaningful.
    order = np.argsort(frequencies)

    sorted_frequencies = frequencies[order]
    sorted_power = power[order]

    # Use trapezoidal integration for a better approximation
    # of spectral power.
    cumulative_power = np.zeros_like(
        sorted_power,
        dtype=np.float64,
    )

    if sorted_power.size > 1:
        increments = (
            0.5
            * (
                sorted_power[:-1]
                + sorted_power[1:]
            )
            * np.diff(sorted_frequencies)
        )

        cumulative_power[1:] = np.cumsum(increments)

    total_power = float(cumulative_power[-1])

    if total_power <= 0.0:
        raise ValueError(
            "Total spectral power must be greater than zero."
        )

    cumulative_fraction = cumulative_power / total_power

    tail_fraction = (100.0 - percentage) / 200.0

    lower_index = int(
        np.searchsorted(
            cumulative_fraction,
            tail_fraction,
        )
    )

    upper_index = int(
        np.searchsorted(
            cumulative_fraction,
            1.0 - tail_fraction,
        )
    )

    lower_index = min(
        max(lower_index, 0),
        len(sorted_frequencies) - 1,
    )

    upper_index = min(
        max(upper_index, 0),
        len(sorted_frequencies) - 1,
    )

    lower_frequency_hz = float(
        sorted_frequencies[lower_index]
    )

    upper_frequency_hz = float(
        sorted_frequencies[upper_index]
    )

    occupied_bandwidth_hz = float(
        max(
            0.0,
            upper_frequency_hz - lower_frequency_hz,
        )
    )

    return (
        lower_frequency_hz,
        upper_frequency_hz,
        occupied_bandwidth_hz,
    )


def analyze_spectrum(
    samples: np.ndarray,
    sample_rate: float,
    nperseg: int = 1024,
) -> dict:
    """
    Run the initial SAGE-RF spectral analysis pipeline.

    Current outputs include:

        - peak frequency
        - peak spectral power
        - estimated noise floor
        - estimated SNR
        - occupied bandwidth
        - occupied frequency range
        - frequency resolution metadata
    """

    frequencies, psd_db = compute_psd(
        samples=samples,
        sample_rate=sample_rate,
        nperseg=nperseg,
    )

    noise_floor_db = estimate_noise_floor(
        psd_db
    )

    peak_frequency_hz, peak_power_db = (
        find_peak_frequency(
            frequencies,
            psd_db,
        )
    )

    snr_db = estimate_snr(
        psd_db,
        noise_floor_db=noise_floor_db,
    )

    (
        occupied_lower_hz,
        occupied_upper_hz,
        occupied_bandwidth_hz,
    ) = estimate_occupied_bandwidth(
        frequencies,
        psd_db,
        percentage=99.0,
    )

    frequency_resolution_hz = (
        sample_rate / nperseg
    )

    return {
        "peak_frequency_hz": peak_frequency_hz,
        "peak_power_db": peak_power_db,
        "noise_floor_db": noise_floor_db,
        "snr_db": snr_db,
        "occupied_bandwidth_hz": occupied_bandwidth_hz,
        "occupied_lower_hz": occupied_lower_hz,
        "occupied_upper_hz": occupied_upper_hz,
        "frequency_min_hz": float(
            np.min(frequencies)
        ),
        "frequency_max_hz": float(
            np.max(frequencies)
        ),
        "frequency_bins": int(
            frequencies.size
        ),
        "frequency_resolution_hz": float(
            frequency_resolution_hz
        ),
    }