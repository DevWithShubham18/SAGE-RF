import numpy as np

from backend.app.analysis.features import analyze_signal
from backend.app.dsp.engine import run_dsp_self_test
from backend.app.dsp.modulation import analyze_modulation
from backend.app.io.readers import load_signal
from backend.app.schemas.signal import SignalParameters


def test_dsp_runtime():
    result = run_dsp_self_test()

    assert result["status"] == "ok"
    assert result["input_count"] == 3
    assert result["output_count"] == 3


def test_signal_schema():
    signal = SignalParameters(
        sampling_frequency=48000,
        modulation="QPSK",
        confidence=0.94,
    )

    assert signal.sampling_frequency == 48000
    assert signal.modulation == "QPSK"
    assert signal.confidence == 0.94


def test_spectrum_analysis():
    fs = 48000
    n = 48000

    t = np.arange(n) / fs

    signal = np.exp(
        2j * np.pi * 5000 * t
    ).astype(np.complex64)

    result = analyze_signal(signal, fs)

    spectrum = result["spectrum"]

    assert spectrum["frequency_bins"] > 0
    assert spectrum["frequency_resolution_hz"] > 0

    # FFT/Welch binning means the detected peak
    # may not be exactly 5000 Hz.
    assert abs(spectrum["peak_frequency_hz"] - 5000) < 100


def test_waterfall_analysis():
    fs = 48000
    n = 48000

    t = np.arange(n) / fs

    signal = np.where(
        t < 0.5,
        np.exp(2j * np.pi * 5000 * t),
        np.exp(2j * np.pi * 10000 * t),
    ).astype(np.complex64)

    result = analyze_signal(signal, fs)

    waterfall = result["waterfall"]

    assert waterfall["time_bins"] > 0
    assert waterfall["frequency_bins"] > 0

    assert len(waterfall["power_db"]) == waterfall["time_bins"]


def test_modulation_analysis():
    fs = 48000
    n = 48000

    t = np.arange(n) / fs

    signal = np.exp(
        2j * np.pi * 5000 * t
    ).astype(np.complex64)

    result = analyze_modulation(signal, fs)

    classification = result["classification"]

    assert "modulation" in classification
    assert "confidence" in classification
    assert "evidence" in classification

    assert 0.0 <= classification["confidence"] <= 1.0


def test_iq_file_loading(tmp_path):
    samples = np.array(
        [
            1 + 1j,
            2 + 2j,
            3 + 3j,
        ],
        dtype=np.complex64,
    )

    iq_file = tmp_path / "test.iq"
    samples.tofile(iq_file)

    loaded = load_signal(
        str(iq_file),
        iq_sample_rate=48000,
    )

    assert loaded.source_format == "iq"
    assert loaded.sample_rate == 48000
    assert loaded.sample_count == 3

    np.testing.assert_array_equal(
        loaded.samples,
        samples,
    )