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
        np.maximum(
            psd,
            np.finfo(float).tiny,
        )
    )

    return frequencies, psd_db


def compute_spectrogram(
    samples: np.ndarray,
    sample_rate: float,
    nperseg: int = 1024,
    noverlap: int | None = None,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Compute a complex-signal spectrogram.

    Returns:
        frequencies:
            Frequency axis in Hz.

        times:
            Time axis in seconds.

        power_db:
            2D matrix with shape:

                [time, frequency]

            containing spectral power in dB.

    The output is intentionally arranged as time × frequency
    because this is convenient for the frontend waterfall
    renderer and future 3D visualization.
    """

    if samples.size == 0:
        raise ValueError(
            "Cannot compute spectrogram from empty samples."
        )

    if sample_rate <= 0:
        raise ValueError(
            "sample_rate must be greater than zero."
        )

    nperseg = min(
        nperseg,
        samples.size,
    )

    if nperseg < 2:
        raise ValueError(
            "At least two samples are required."
        )

    if noverlap is None:
        noverlap = nperseg // 2

    if noverlap < 0:
        raise ValueError(
            "noverlap cannot be negative."
        )

    if noverlap >= nperseg:
        raise ValueError(
            "noverlap must be smaller than nperseg."
        )

    frequencies, times, spectrogram = signal.stft(
        samples,
        fs=sample_rate,
        nperseg=nperseg,
        noverlap=noverlap,
        return_onesided=False,
        boundary=None,
        padded=False,
    )

    frequencies = np.fft.fftshift(
        frequencies
    )

    spectrogram = np.fft.fftshift(
        spectrogram,
        axes=0,
    )

    power = np.abs(spectrogram) ** 2

    power_db = 10.0 * np.log10(
        np.maximum(
            power,
            np.finfo(float).tiny,
        )
    )

    # Convert from:
    #
    #     frequency × time
    #
    # to:
    #
    #     time × frequency
    #
    # which is easier for frontend consumption.
    power_db = power_db.T

    return (
        frequencies,
        times,
        power_db,
    )


def estimate_noise_floor(
    psd_db: np.ndarray,
) -> float:
    """
    Estimate the noise floor using a robust
    lower-percentile statistic.
    """

    if psd_db.size == 0:
        raise ValueError(
            "Cannot estimate noise floor from empty PSD."
        )

    return float(
        np.percentile(
            psd_db,
            20.0,
        )
    )


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

    if frequencies.size == 0:
        raise ValueError(
            "Frequency array cannot be empty."
        )

    if psd_db.size == 0:
        raise ValueError(
            "PSD array cannot be empty."
        )

    if frequencies.size != psd_db.size:
        raise ValueError(
            "Frequency and PSD arrays must have "
            "the same length."
        )

    peak_index = int(
        np.argmax(psd_db)
    )

    return (
        float(
            frequencies[peak_index]
        ),
        float(
            psd_db[peak_index]
        ),
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
        raise ValueError(
            "Cannot estimate SNR from empty PSD."
        )

    if noise_floor_db is None:
        noise_floor_db = estimate_noise_floor(
            psd_db
        )

    peak_power_db = float(
        np.max(psd_db)
    )

    return float(
        peak_power_db - noise_floor_db
    )


def estimate_occupied_bandwidth(
    frequencies: np.ndarray,
    psd_db: np.ndarray,
    percentage: float = 99.0,
) -> tuple[float, float, float]:
    """
    Estimate occupied bandwidth using cumulative
    spectral power.

    The returned interval contains approximately
    the requested percentage of total spectral power.

    Returns:
        lower_frequency_hz
        upper_frequency_hz
        occupied_bandwidth_hz
    """

    if frequencies.size == 0:
        raise ValueError(
            "Frequency array cannot be empty."
        )

    if psd_db.size == 0:
        raise ValueError(
            "PSD array cannot be empty."
        )

    if frequencies.size != psd_db.size:
        raise ValueError(
            "Frequency and PSD arrays must have "
            "the same length."
        )

    if not 0.0 < percentage < 100.0:
        raise ValueError(
            "percentage must be between 0 and 100."
        )

    power = 10.0 ** (
        psd_db / 10.0
    )

    order = np.argsort(
        frequencies
    )

    sorted_frequencies = frequencies[
        order
    ]

    sorted_power = power[
        order
    ]

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
            * np.diff(
                sorted_frequencies
            )
        )

        cumulative_power[1:] = np.cumsum(
            increments
        )

    total_power = float(
        cumulative_power[-1]
    )

    if total_power <= 0.0:
        raise ValueError(
            "Total spectral power must be "
            "greater than zero."
        )

    cumulative_fraction = (
        cumulative_power
        / total_power
    )

    tail_fraction = (
        (100.0 - percentage)
        / 200.0
    )

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
        max(
            lower_index,
            0,
        ),
        len(sorted_frequencies) - 1,
    )

    upper_index = min(
        max(
            upper_index,
            0,
        ),
        len(sorted_frequencies) - 1,
    )

    lower_frequency_hz = float(
        sorted_frequencies[
            lower_index
        ]
    )

    upper_frequency_hz = float(
        sorted_frequencies[
            upper_index
        ]
    )

    occupied_bandwidth_hz = float(
        max(
            0.0,
            upper_frequency_hz
            - lower_frequency_hz,
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
    Run the SAGE-RF spectral analysis pipeline.
    """

    frequencies, psd_db = compute_psd(
        samples=samples,
        sample_rate=sample_rate,
        nperseg=nperseg,
    )

    noise_floor_db = estimate_noise_floor(
        psd_db
    )

    (
        peak_frequency_hz,
        peak_power_db,
    ) = find_peak_frequency(
        frequencies,
        psd_db,
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
        "peak_frequency_hz":
            peak_frequency_hz,

        "peak_power_db":
            peak_power_db,

        "noise_floor_db":
            noise_floor_db,

        "snr_db":
            snr_db,

        "occupied_bandwidth_hz":
            occupied_bandwidth_hz,

        "occupied_lower_hz":
            occupied_lower_hz,

        "occupied_upper_hz":
            occupied_upper_hz,

        "frequency_min_hz":
            float(
                np.min(frequencies)
            ),

        "frequency_max_hz":
            float(
                np.max(frequencies)
            ),

        "frequency_bins":
            int(
                frequencies.size
            ),

        "frequency_resolution_hz":
            float(
                frequency_resolution_hz
            ),
    }


def analyze_signal(
    samples: np.ndarray,
    sample_rate: float,
    psd_nperseg: int = 1024,
    spectrogram_nperseg: int = 1024,
    spectrogram_overlap: float = 0.5,
) -> dict:
    """
    Run the complete first-generation SAGE-RF
    spectral analysis pipeline.

    Produces both scalar signal features and
    waterfall/spectrogram data.
    """

    if not 0.0 <= spectrogram_overlap < 1.0:
        raise ValueError(
            "spectrogram_overlap must be "
            "between 0 and 1."
        )

    spectrum = analyze_spectrum(
        samples=samples,
        sample_rate=sample_rate,
        nperseg=psd_nperseg,
    )

    overlap_samples = int(
        spectrogram_nperseg
        * spectrogram_overlap
    )

    (
        waterfall_frequencies,
        waterfall_times,
        waterfall_power_db,
    ) = compute_spectrogram(
        samples=samples,
        sample_rate=sample_rate,
        nperseg=spectrogram_nperseg,
        noverlap=overlap_samples,
    )

    return {
        "spectrum": spectrum,

        "waterfall": {
            "frequencies_hz":
                waterfall_frequencies.tolist(),

            "times_seconds":
                waterfall_times.tolist(),

            "power_db":
                waterfall_power_db.tolist(),

            "time_bins":
                int(
                    waterfall_power_db.shape[0]
                ),

            "frequency_bins":
                int(
                    waterfall_power_db.shape[1]
                ),
        },
    }