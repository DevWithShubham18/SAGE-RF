"""
SAGE-RF signal detection.

Detects candidate RF signals from complex IQ samples using:
    IQ samples
        -> Welch PSD
        -> smoothing
        -> adaptive noise-floor estimation
        -> threshold detection
        -> frequency-region extraction
        -> candidate filtering

The detector intentionally avoids treating the FFT wraparound edges
as independent RF signals.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np
from scipy import signal


@dataclass
class SignalCandidate:
    """A detected RF signal region."""

    lower_frequency_hz: float
    upper_frequency_hz: float
    center_frequency_hz: float
    bandwidth_hz: float
    peak_frequency_hz: float
    peak_power_db: float
    noise_floor_db: float
    snr_db: float
    confidence: float

    def to_dict(self) -> dict[str, Any]:
        """Convert the candidate into a JSON-friendly dictionary."""
        return {
            "lower_frequency_hz": float(self.lower_frequency_hz),
            "upper_frequency_hz": float(self.upper_frequency_hz),
            "center_frequency_hz": float(self.center_frequency_hz),
            "bandwidth_hz": float(self.bandwidth_hz),
            "peak_frequency_hz": float(self.peak_frequency_hz),
            "peak_power_db": float(self.peak_power_db),
            "noise_floor_db": float(self.noise_floor_db),
            "snr_db": float(self.snr_db),
            "confidence": float(self.confidence),
        }


def _validate_inputs(
    samples: np.ndarray,
    sample_rate: float,
) -> np.ndarray:
    """Validate and normalize detector inputs."""

    x = np.asarray(samples)

    if x.ndim != 1:
        raise ValueError("samples must be a one-dimensional array.")

    if x.size == 0:
        raise ValueError("samples must not be empty.")

    if not np.isfinite(sample_rate) or sample_rate <= 0:
        raise ValueError("sample_rate must be greater than zero.")

    x = x.astype(np.complex128, copy=False)

    finite = np.isfinite(x.real) & np.isfinite(x.imag)

    if not np.all(finite):
        x = x[finite]

    if x.size == 0:
        raise ValueError("samples contain no finite values.")

    return x


def _estimate_noise_floor(power_db: np.ndarray) -> float:
    """
    Estimate the noise floor robustly.

    A low percentile is used rather than the absolute minimum because
    the minimum can be unstable for finite-length measurements.
    """

    if power_db.size == 0:
        return -200.0

    finite_power = power_db[np.isfinite(power_db)]

    if finite_power.size == 0:
        return -200.0

    return float(np.percentile(finite_power, 20.0))


def _smooth_power(
    power_db: np.ndarray,
    window_bins: int = 5,
) -> np.ndarray:
    """Apply a simple moving-average smoothing operation."""

    if power_db.size < 3:
        return power_db.copy()

    window_bins = int(window_bins)

    if window_bins <= 1:
        return power_db.copy()

    window_bins = min(window_bins, power_db.size)

    if window_bins % 2 == 0:
        window_bins -= 1

    if window_bins < 3:
        return power_db.copy()

    kernel = np.ones(window_bins, dtype=np.float64) / window_bins

    return np.convolve(
        power_db,
        kernel,
        mode="same",
    )


def _find_regions(
    mask: np.ndarray,
    max_gap_bins: int,
) -> list[tuple[int, int]]:
    """
    Extract contiguous True regions.

    Small False gaps between two True regions are bridged.
    """

    mask = np.asarray(mask, dtype=bool).copy()

    if mask.size == 0:
        return []

    max_gap_bins = max(0, int(max_gap_bins))

    if max_gap_bins > 0:
        false_indices = np.flatnonzero(~mask)

        if false_indices.size:
            run_start = false_indices[0]
            run_end = false_indices[0]

            for index in false_indices[1:]:
                if index == run_end + 1:
                    run_end = index
                    continue

                gap_length = run_end - run_start + 1

                left = run_start - 1
                right = run_end + 1

                if (
                    gap_length <= max_gap_bins
                    and left >= 0
                    and right < mask.size
                    and mask[left]
                    and mask[right]
                ):
                    mask[run_start : run_end + 1] = True

                run_start = index
                run_end = index

            gap_length = run_end - run_start + 1

            left = run_start - 1
            right = run_end + 1

            if (
                gap_length <= max_gap_bins
                and left >= 0
                and right < mask.size
                and mask[left]
                and mask[right]
            ):
                mask[run_start : run_end + 1] = True

    padded = np.concatenate(
        [
            np.array([False]),
            mask,
            np.array([False]),
        ]
    )

    changes = np.diff(padded.astype(np.int8))

    starts = np.flatnonzero(changes == 1)
    ends = np.flatnonzero(changes == -1) - 1

    return [
        (int(start), int(end))
        for start, end in zip(starts, ends)
    ]


def _remove_frequency_edges(
    mask: np.ndarray,
    edge_bins: int,
) -> np.ndarray:
    """
    Remove detections touching the FFT frequency edges.

    For a shifted complex FFT/Welch spectrum, the first and last bins
    represent the negative/positive Nyquist boundary. A strong signal
    crossing that boundary can legitimately appear there, but isolated
    edge detections are usually wraparound artifacts/noise.

    We therefore clear a small edge region before candidate extraction.
    """

    result = np.asarray(mask, dtype=bool).copy()

    edge_bins = max(0, int(edge_bins))

    if edge_bins == 0 or result.size == 0:
        return result

    edge_bins = min(edge_bins, result.size // 2)

    result[:edge_bins] = False
    result[-edge_bins:] = False

    return result


def _calculate_confidence(
    snr_db: float,
    bandwidth_bins: int,
    total_bins: int,
) -> float:
    """Calculate a bounded heuristic confidence score."""

    snr_component = np.clip(
        (snr_db - 3.0) / 30.0,
        0.0,
        1.0,
    )

    width_component = np.clip(
        np.log1p(max(bandwidth_bins, 1))
        / np.log1p(max(total_bins, 2)),
        0.0,
        1.0,
    )

    confidence = (
        0.80 * snr_component
        + 0.20 * width_component
    )

    return float(
        np.clip(
            confidence,
            0.0,
            1.0,
        )
    )


def _next_power_of_two(value: int) -> int:
    """Return the smallest power of two >= value."""

    value = max(1, int(value))

    return 1 << (value - 1).bit_length()


def detect_signals(
    samples: np.ndarray,
    sample_rate: float,
    *,
    threshold_db: float = 8.0,
    min_bandwidth_hz: float | None = None,
    max_gap_hz: float | None = None,
    nperseg: int | None = None,
    edge_guard_hz: float | None = None,
) -> dict[str, Any]:
    """
    Detect candidate RF signals.

    Parameters
    ----------
    samples:
        One-dimensional complex IQ samples.

    sample_rate:
        Sample rate in Hz.

    threshold_db:
        Required signal power above the estimated noise floor.

    min_bandwidth_hz:
        Minimum candidate bandwidth.

    max_gap_hz:
        Maximum gap between above-threshold bins that can be bridged.

    nperseg:
        Welch PSD segment length.

    edge_guard_hz:
        Frequency region removed around the negative and positive
        Nyquist edges.

    Returns
    -------
    dict
        Detection results containing PSD data and signal candidates.
    """

    x = _validate_inputs(
        samples,
        sample_rate,
    )

    if threshold_db <= 0:
        raise ValueError(
            "threshold_db must be greater than zero."
        )

    if (
        min_bandwidth_hz is not None
        and min_bandwidth_hz <= 0
    ):
        raise ValueError(
            "min_bandwidth_hz must be greater than zero."
        )

    if (
        max_gap_hz is not None
        and max_gap_hz < 0
    ):
        raise ValueError(
            "max_gap_hz must not be negative."
        )

    if (
        edge_guard_hz is not None
        and edge_guard_hz < 0
    ):
        raise ValueError(
            "edge_guard_hz must not be negative."
        )

    sample_count = int(x.size)

    # Select a sensible Welch segment size.
    if nperseg is None:
        if sample_count >= 4096:
            nperseg = 1024
        elif sample_count >= 1024:
            nperseg = 512
        elif sample_count >= 256:
            nperseg = 256
        else:
            nperseg = max(
                32,
                _next_power_of_two(sample_count // 2),
            )

    nperseg = min(
        int(nperseg),
        sample_count,
    )

    if nperseg < 8:
        raise ValueError(
            "At least 8 samples are required for signal detection."
        )

    noverlap = nperseg // 2

    frequencies, psd = signal.welch(
        x,
        fs=float(sample_rate),
        window="hann",
        nperseg=nperseg,
        noverlap=noverlap,
        detrend="constant",
        return_onesided=False,
        scaling="density",
    )

    # Shift DC to the center of the spectrum.
    frequencies = np.fft.fftshift(frequencies)
    psd = np.fft.fftshift(psd)

    power_db = 10.0 * np.log10(
        np.maximum(
            psd,
            np.finfo(float).tiny,
        )
    )

    # Reduce individual-bin noise fluctuations.
    power_db = _smooth_power(
        power_db,
        window_bins=5,
    )

    noise_floor_db = _estimate_noise_floor(
        power_db
    )

    threshold_absolute_db = (
        noise_floor_db + float(threshold_db)
    )

    above_threshold = (
        power_db >= threshold_absolute_db
    )

    if frequencies.size > 1:
        frequency_resolution_hz = float(
            abs(
                frequencies[1]
                - frequencies[0]
            )
        )
    else:
        frequency_resolution_hz = float(
            sample_rate
        )

    if min_bandwidth_hz is None:
        min_bandwidth_hz = (
            2.0 * frequency_resolution_hz
        )

    if max_gap_hz is None:
        max_gap_hz = (
            2.0 * frequency_resolution_hz
        )

    if edge_guard_hz is None:
        # Guard approximately two PSD bins at each edge.
        edge_guard_hz = (
            2.0 * frequency_resolution_hz
        )

    min_bandwidth_bins = max(
        1,
        int(
            np.ceil(
                min_bandwidth_hz
                / frequency_resolution_hz
            )
        ),
    )

    max_gap_bins = max(
        0,
        int(
            np.floor(
                max_gap_hz
                / frequency_resolution_hz
            )
        ),
    )

    edge_guard_bins = max(
        1,
        int(
            np.ceil(
                edge_guard_hz
                / frequency_resolution_hz
            )
        ),
    )

    # Suppress isolated detections at the FFT boundaries.
    detection_mask = _remove_frequency_edges(
        above_threshold,
        edge_guard_bins,
    )

    regions = _find_regions(
        detection_mask,
        max_gap_bins=max_gap_bins,
    )

    candidates: list[SignalCandidate] = []

    for start, end in regions:
        width_bins = end - start + 1

        if width_bins < min_bandwidth_bins:
            continue

        region_power = power_db[
            start : end + 1
        ]

        peak_offset = int(
            np.argmax(region_power)
        )

        peak_index = (
            start + peak_offset
        )

        peak_frequency = float(
            frequencies[peak_index]
        )

        peak_power = float(
            power_db[peak_index]
        )

        lower_frequency = float(
            frequencies[start]
        )

        upper_frequency = float(
            frequencies[end]
        )

        bandwidth = max(
            frequency_resolution_hz,
            upper_frequency
            - lower_frequency,
        )

        center_frequency = (
            lower_frequency
            + upper_frequency
        ) / 2.0

        snr_db = (
            peak_power
            - noise_floor_db
        )

        confidence = _calculate_confidence(
            snr_db=snr_db,
            bandwidth_bins=width_bins,
            total_bins=frequencies.size,
        )

        candidates.append(
            SignalCandidate(
                lower_frequency_hz=lower_frequency,
                upper_frequency_hz=upper_frequency,
                center_frequency_hz=center_frequency,
                bandwidth_hz=bandwidth,
                peak_frequency_hz=peak_frequency,
                peak_power_db=peak_power,
                noise_floor_db=noise_floor_db,
                snr_db=float(snr_db),
                confidence=confidence,
            )
        )

    # Strongest signals first.
    candidates.sort(
        key=lambda candidate: candidate.peak_power_db,
        reverse=True,
    )

    return {
        "status": "success",
        "sample_count": sample_count,
        "sample_rate": float(sample_rate),
        "frequency_min_hz": float(
            frequencies.min()
        ),
        "frequency_max_hz": float(
            frequencies.max()
        ),
        "frequency_bins": int(
            frequencies.size
        ),
        "frequency_resolution_hz": (
            frequency_resolution_hz
        ),
        "noise_floor_db": float(
            noise_floor_db
        ),
        "threshold_db": float(
            threshold_db
        ),
        "threshold_absolute_db": float(
            threshold_absolute_db
        ),
        "frequencies_hz": (
            frequencies.tolist()
        ),
        "power_db": (
            power_db.tolist()
        ),
        "candidate_count": len(
            candidates
        ),
        "candidates": [
            candidate.to_dict()
            for candidate in candidates
        ],
        "diagnostics": {
            "algorithm": (
                "welch_psd_threshold_detector"
            ),
            "smoothing": (
                "moving_average"
            ),
            "nperseg": int(nperseg),
            "noverlap": int(noverlap),
            "min_bandwidth_hz": float(
                min_bandwidth_hz
            ),
            "max_gap_hz": float(
                max_gap_hz
            ),
            "edge_guard_hz": float(
                edge_guard_hz
            ),
        },
    }


def detect_signal_regions(
    samples: np.ndarray,
    sample_rate: float,
    **kwargs: Any,
) -> list[dict[str, Any]]:
    """
    Convenience wrapper returning only detected candidates.
    """

    result = detect_signals(
        samples,
        sample_rate,
        **kwargs,
    )

    return result["candidates"]