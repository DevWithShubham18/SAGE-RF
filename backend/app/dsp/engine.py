from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

import numpy as np

from gnuradio import blocks, gr


# ============================================================
# SAGE DSP ENGINE PATH
# ============================================================

PROJECT_ROOT = Path(__file__).resolve().parents[3]
DSP_ENGINE_PATH = PROJECT_ROOT / "dsp-engine"

if str(DSP_ENGINE_PATH) not in sys.path:
    sys.path.insert(0, str(DSP_ENGINE_PATH))


from sage_dsp.core.signal import Signal
from sage_dsp.fourier import analyze_fourier
from sage_dsp.io.loaders import load_wav_as_signal
from sage_dsp.laplace import analyze_laplace


# ============================================================
# GNU RADIO SELF TEST
# ============================================================

def run_dsp_self_test() -> dict:
    """
    Run a small GNU Radio flowgraph entirely in memory.

    This is a development self-test.
    It does not require an SDR device or RF hardware.
    """

    input_samples = [
        1 + 1j,
        2 + 2j,
        3 + 3j,
    ]

    flowgraph = gr.top_block()

    source = blocks.vector_source_c(
        input_samples,
        repeat=False,
    )

    sink = blocks.vector_sink_c()

    flowgraph.connect(source, sink)

    flowgraph.run()

    output_samples = sink.data()

    return {
        "status": "ok",
        "input_count": len(input_samples),
        "output_count": len(output_samples),
        "samples": [
            {
                "real": float(sample.real),
                "imag": float(sample.imag),
            }
            for sample in output_samples
        ],
    }


# ============================================================
# DSP ENGINE TEST
# ============================================================

def run_sage_dsp_test() -> dict[str, Any]:
    """
    Run a small in-memory SAGE DSP test.

    Tests:
        Signal
        Fourier analysis
        Laplace analysis
    """

    sample_rate = 1_000_000.0
    frequency = 100_000.0
    sample_count = 4096

    time = np.arange(
        sample_count,
        dtype=np.float64,
    ) / sample_rate

    samples = np.exp(
        2j * np.pi * frequency * time
    )

    signal = Signal(
        samples=samples,
        sample_rate=sample_rate,
        metadata={
            "source": "synthetic_test",
        },
    )

    fourier = analyze_fourier(
        signal,
        nfft=4096,
        hop_size=4096,
    )

    laplace = analyze_laplace(
        signal,
        sigma_min=-5.0,
        sigma_max=5.0,
        sigma_points=5,
        frequency_points=128,
    )

    return {
        "status": "ok",
        "sample_rate": signal.sample_rate,
        "sample_count": signal.sample_count,
        "duration_seconds": signal.duration_seconds,
        "power": signal.power,
        "fourier": {
            "frequency_bins": len(
                fourier["frequencies_hz"]
            ),
            "time_blocks": len(
                fourier["times_seconds"]
            ),
            "peak_frequency_hz": float(
                fourier[
                    "peak_frequencies_hz"
                ][0]
            ),
        },
        "laplace": {
            "sigma_points": len(
                laplace["sigma"]
            ),
            "frequency_points": len(
                laplace["frequencies_hz"]
            ),
            "peak": laplace["peak"],
        },
    }


# ============================================================
# WAV DSP ANALYSIS
# ============================================================

def analyze_wav_with_sage_dsp(
    path: str | Path,
    nfft: int = 4096,
    hop_size: int | None = None,
    analysis_samples: int = 4096,
) -> dict[str, Any]:
    """
    Analyze a WAV file using the SAGE DSP engine.

    WAV audio is converted into the common Signal
    representation and then processed by the Fourier
    and Laplace analysis stages.

    analysis_samples limits the Laplace calculation
    because the direct Laplace implementation is
    computationally expensive for long recordings.
    """

    wav_signal = load_wav_as_signal(
        path
    )

    # --------------------------------------------------------
    # Fourier analysis on the complete WAV
    # --------------------------------------------------------

    fourier = analyze_fourier(
        wav_signal,
        nfft=nfft,
        hop_size=hop_size,
    )

    # --------------------------------------------------------
    # Laplace analysis on a bounded window
    # --------------------------------------------------------

    window_size = min(
        analysis_samples,
        wav_signal.sample_count,
    )

    window_signal = Signal(
        samples=wav_signal.samples[
            :window_size
        ],
        sample_rate=wav_signal.sample_rate,
        center_frequency_hz=(
            wav_signal.center_frequency_hz
        ),
        metadata={
            **wav_signal.metadata,
            "source_format": "wav_window",
            "analysis_window_samples": window_size,
        },
    )

    laplace = analyze_laplace(
        window_signal,
        sigma_min=-5.0,
        sigma_max=5.0,
        sigma_points=5,
        frequency_points=128,
    )

    return {
        "metadata": {
            "filename": wav_signal.metadata.get(
                "filename"
            ),
            "source_format": wav_signal.metadata.get(
                "source_format"
            ),
            "sample_rate": float(
                wav_signal.sample_rate
            ),
            "sample_count": int(
                wav_signal.sample_count
            ),
            "duration_seconds": float(
                wav_signal.duration_seconds
            ),
            "power": float(
                wav_signal.power
            ),
        },

        "fourier": {
            "frequencies_hz": (
                fourier[
                    "frequencies_hz"
                ].tolist()
            ),
            "times_seconds": (
                fourier[
                    "times_seconds"
                ].tolist()
            ),
            "power_db": (
                fourier[
                    "power_db"
                ].tolist()
            ),
            "magnitude": (
                fourier[
                    "magnitude"
                ].tolist()
            ),
            "peak_frequencies_hz": (
                fourier[
                    "peak_frequencies_hz"
                ].tolist()
            ),
            "sample_rate": float(
                fourier["sample_rate"]
            ),
            "nfft": int(
                fourier["nfft"]
            ),
            "hop_size": int(
                fourier["hop_size"]
            ),
        },

        "laplace": laplace,

        "diagnostics": {
            "engine": "sage_dsp",
            "fourier_analysis": (
                "block_fft"
            ),
            "laplace_analysis": (
                "sampled_complex_laplace"
            ),
            "laplace_samples_analyzed": (
                int(window_size)
            ),
        },
    }

