from __future__ import annotations

import numpy as np

from sage_dsp.core.signal import Signal


EPS = 1e-12


def fft(
    signal: Signal,
    nfft: int | None = None,
) -> dict[str, np.ndarray | float]:
    """
    Compute a centered complex FFT of a baseband signal.

    Returns frequency bins, complex FFT values, magnitude,
    power, power in dB, and the peak frequency.
    """

    x = signal.samples

    if nfft is None:
        nfft = x.size

    if nfft <= 0:
        raise ValueError("nfft must be greater than zero.")

    spectrum = np.fft.fftshift(
        np.fft.fft(x, n=nfft)
    )

    frequencies = np.fft.fftshift(
        np.fft.fftfreq(
            nfft,
            d=1.0 / signal.sample_rate,
        )
    )

    magnitude = np.abs(spectrum)

    power = magnitude ** 2

    power_db = 10.0 * np.log10(
        np.maximum(power, EPS)
    )

    peak_index = int(np.argmax(power))

    return {
        "frequencies_hz": frequencies,
        "spectrum": spectrum,
        "magnitude": magnitude,
        "power": power,
        "power_db": power_db,
        "peak_frequency_hz": float(
            frequencies[peak_index]
        ),
        "peak_power_db": float(
            power_db[peak_index]
        ),
    }
