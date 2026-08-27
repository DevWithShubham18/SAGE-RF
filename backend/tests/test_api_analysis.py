import numpy as np
from fastapi.testclient import TestClient

from backend.app.main import app


def main():
    fs = 48000
    duration = 1.0

    t = np.arange(int(fs * duration)) / fs

    # Synthetic RF signal:
    # Strong 5 kHz carrier
    # Weaker 10 kHz carrier
    signal = (
        0.7 * np.exp(2j * np.pi * 5000 * t)
        + 0.3 * np.exp(2j * np.pi * 10000 * t)
    ).astype(np.complex64)

    test_file = "data/samples/api_test.iq"

    signal.tofile(test_file)

    client = TestClient(app)

    with open(test_file, "rb") as f:
        response = client.post(
            "/api/analyze",
            files={
                "file": (
                    "api_test.iq",
                    f,
                    "application/octet-stream",
                )
            },
            data={
                "iq_sample_rate": str(fs),
            },
        )

    print("HTTP:", response.status_code)
    print("Response:")

    try:
        result = response.json()
        print(result)
    except Exception:
        print(response.text)
        raise SystemExit("API analysis test failed")

    if response.status_code != 200:
        raise SystemExit("API analysis test failed")

    # Basic response validation
    required_keys = [
        "status",
        "filename",
        "metadata",
        "spectrum",
        "waterfall",
        "modulation",
        "detections",
        "diagnostics",
        "errors",
    ]

    for key in required_keys:
        if key not in result:
            raise SystemExit(
                f"API analysis test failed: missing '{key}'"
            )

    # Validate metadata
    assert result["status"] == "success"
    assert result["filename"] == "api_test.iq"
    assert result["metadata"]["sample_rate"] == fs
    assert result["metadata"]["sample_count"] == len(signal)

    # Validate spectrum
    spectrum = result["spectrum"]

    assert spectrum is not None
    assert spectrum["frequency_bins"] > 0
    assert spectrum["peak_frequency_hz"] is not None

    # Validate waterfall
    waterfall = result["waterfall"]

    assert waterfall is not None
    assert waterfall["time_bins"] > 0
    assert waterfall["frequency_bins"] > 0

    # Validate modulation classification
    modulation = result["modulation"]

    assert modulation is not None
    assert "modulation" in modulation
    assert "confidence" in modulation
    assert 0.0 <= modulation["confidence"] <= 1.0

    # Validate RF detections
    detections = result["detections"]

    assert detections is not None
    assert detections["candidate_count"] >= 1
    assert len(detections["candidates"]) >= 1

    first_candidate = detections["candidates"][0]

    candidate_keys = [
        "lower_frequency_hz",
        "upper_frequency_hz",
        "center_frequency_hz",
        "bandwidth_hz",
        "peak_frequency_hz",
        "peak_power_db",
        "noise_floor_db",
        "snr_db",
        "confidence",
        "modulation",
        "modulation_confidence",
    ]

    for key in candidate_keys:
        assert key in first_candidate

    assert first_candidate["snr_db"] > 0
    assert 0.0 <= first_candidate["confidence"] <= 1.0

    if first_candidate["modulation_confidence"] is not None:
        assert 0.0 <= first_candidate["modulation_confidence"] <= 1.0

    # Validate diagnostics
    diagnostics = result["diagnostics"]

    assert diagnostics["signal_detector"] == (
        "spectral_threshold_detector"
    )

    print("\nAPI ANALYSIS TEST: OK")


if __name__ == "__main__":
    main()