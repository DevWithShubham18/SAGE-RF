from __future__ import annotations

import numpy as np

from sage_dsp.core.signal import Signal
from sage_dsp.transforms import fft
from sage_dsp.windowing import iter_blocks


def analyze_fourier(
    signal: Signal,
    nfft: int = 4096,
    hop_size: int | None = None,
) -> dict:
    """
    Analyze an entire signal using block-based FFT processing.

    Returns time-aligned frequency-domain data suitable for
    spectrum and waterfall visualizations.
    """

    if nfft <= 0:
        raise ValueError("nfft must be greater than zero.")

    if hop_size is None:
        hop_size = nfft

    if hop_size <= 0:
        raise ValueError("hop_size must be greater than zero.")

    frequency_axis: np.ndarray | None = None

    times: list[float] = []
    spectra: list[np.ndarray] = []
    magnitudes: list[np.ndarray] = []
    powers_db: list[np.ndarray] = []
    peak_frequencies: list[float] = []

    for block in iter_blocks(
        signal,
        block_size=nfft,
        hop_size=hop_size,
    ):
        result = fft(
            block,
            nfft=nfft,
        )

        if frequency_axis is None:
            frequency_axis = np.asarray(
                result["frequencies_hz"]
            )

        times.append(
            float(
                block.metadata["block_start_seconds"]
            )
        )

        spectra.append(
            np.asarray(result["spectrum"])
        )

        magnitudes.append(
            np.asarray(result["magnitude"])
        )

        powers_db.append(
            np.asarray(result["power_db"])
        )

        peak_frequencies.append(
            float(result["peak_frequency_hz"])
        )

    if frequency_axis is None:
        raise ValueError(
            "Signal is shorter than one FFT block."
        )

    return {
        "frequencies_hz": frequency_axis,
        "times_seconds": np.asarray(times),
        "spectrum": np.asarray(spectra),
        "magnitude": np.asarray(magnitudes),
        "power_db": np.asarray(powers_db),
        "peak_frequencies_hz": np.asarray(
            peak_frequencies
        ),
        "sample_rate": signal.sample_rate,
        "nfft": nfft,
        "hop_size": hop_size,
    }
