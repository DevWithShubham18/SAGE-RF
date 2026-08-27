import numpy as np
from fastapi.testclient import TestClient

from backend.app.main import app


def main():
    fs = 48000
    duration = 1.0

    t = np.arange(int(fs * duration)) / fs

    # Synthetic complex RF signal:
    # 5 kHz carrier + 10 kHz carrier
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
        print(response.json())
    except Exception:
        print(response.text)

    if response.status_code != 200:
        raise SystemExit("API analysis test failed")

    print("\nAPI ANALYSIS TEST: OK")


if __name__ == "__main__":
    main()
