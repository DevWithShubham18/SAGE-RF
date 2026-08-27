from __future__ import annotations

import wave
from dataclasses import dataclass
from pathlib import Path

import numpy as np


SUPPORTED_FORMATS = {".iq", ".wav"}


@dataclass
class LoadedSignal:
    """Normalized signal representation used by the SAGE-RF pipeline."""

    samples: np.ndarray
    sample_rate: float
    source_format: str
    sample_count: int
    duration_seconds: float
    peak_amplitude: float
    mean_power: float
    filename: str | None = None


def _validate_sample_limit(max_samples: int | None) -> None:
    if max_samples is not None and max_samples <= 0:
        raise ValueError("max_samples must be greater than zero")


def read_iq_file(
    path: str | Path,
    max_samples: int | None = None,
) -> np.ndarray:
    """
    Read interleaved float32 complex IQ data.

    Expected layout:

        I0, Q0, I1, Q1, ...

    The returned array is complex64.
    """

    file_path = Path(path)

    if not file_path.exists():
        raise FileNotFoundError(f"IQ file not found: {file_path}")

    _validate_sample_limit(max_samples)

    raw = np.fromfile(file_path, dtype=np.float32)

    if raw.size == 0:
        raise ValueError("IQ file is empty")

    if raw.size % 2 != 0:
        raise ValueError(
            "IQ file contains an odd number of float32 values; "
            "expected interleaved I/Q pairs."
        )

    if max_samples is not None:
        raw = raw[: max_samples * 2]

    i = raw[0::2]
    q = raw[1::2]

    return (i + 1j * q).astype(np.complex64)


def read_wav_file(
    path: str | Path,
    max_samples: int | None = None,
) -> tuple[np.ndarray, int]:
    """
    Read a WAV file and normalize it to complex64.

    Mono WAV:
        real samples -> complex(real, 0)

    Stereo WAV:
        channel 0 -> I
        channel 1 -> Q

    This lets the rest of the DSP pipeline work with one
    unified complex representation.
    """

    file_path = Path(path)

    if not file_path.exists():
        raise FileNotFoundError(f"WAV file not found: {file_path}")

    _validate_sample_limit(max_samples)

    with wave.open(str(file_path), "rb") as wav:
        channels = wav.getnchannels()
        sample_width = wav.getsampwidth()
        sample_rate = wav.getframerate()
        frame_count = wav.getnframes()

        if channels not in (1, 2):
            raise ValueError(
                f"Unsupported WAV channel count: {channels}. "
                "Only mono and stereo are supported."
            )

        if sample_width not in (1, 2, 3, 4):
            raise ValueError(
                f"Unsupported WAV sample width: {sample_width} bytes."
            )

        frames_to_read = frame_count

        if max_samples is not None:
            frames_to_read = min(frame_count, max_samples)

        raw = wav.readframes(frames_to_read)

    if sample_width == 1:
        # WAV 8-bit PCM is unsigned.
        data = np.frombuffer(raw, dtype=np.uint8).astype(np.float32)
        data = (data - 128.0) / 128.0

    elif sample_width == 2:
        data = np.frombuffer(raw, dtype=np.int16).astype(np.float32)
        data /= 32768.0

    elif sample_width == 3:
        # 24-bit little-endian PCM.
        bytes_data = np.frombuffer(raw, dtype=np.uint8)

        if bytes_data.size % 3 != 0:
            raise ValueError("Invalid 24-bit WAV data length.")

        triplets = bytes_data.reshape(-1, 3)

        values = (
            triplets[:, 0].astype(np.int32)
            | (triplets[:, 1].astype(np.int32) << 8)
            | (triplets[:, 2].astype(np.int32) << 16)
        )

        # Sign extension.
        negative = values & 0x800000
        values[negative != 0] -= 1 << 24

        data = values.astype(np.float32) / 8388608.0

    else:
        data = np.frombuffer(raw, dtype=np.int32).astype(np.float32)
        data /= 2147483648.0

    if channels == 1:
        samples = data.astype(np.complex64)

    else:
        if data.size % 2 != 0:
            raise ValueError("Stereo WAV contains incomplete I/Q frame.")

        i = data[0::2]
        q = data[1::2]

        samples = (i + 1j * q).astype(np.complex64)

    if samples.size == 0:
        raise ValueError("WAV file contains no samples.")

    return samples, sample_rate


def get_iq_metadata(samples: np.ndarray) -> dict:
    """Calculate basic signal statistics."""

    x = np.asarray(samples)

    if x.size == 0:
        raise ValueError("Cannot calculate metadata for empty signal.")

    amplitude = np.abs(x)

    return {
        "sample_count": int(x.size),
        "peak_amplitude": float(np.max(amplitude)),
        "mean_power": float(np.mean(amplitude**2)),
    }


def load_signal(
    path: str | Path,
    iq_sample_rate: float | None = None,
    max_samples: int | None = None,
) -> LoadedSignal:
    """
    Unified signal loader for .IQ and .WAV files.

    Parameters
    ----------
    path:
        Input file.

    iq_sample_rate:
        Required for raw IQ files because raw IQ files do not
        inherently contain their sampling frequency.

    max_samples:
        Optional safety/performance limit.
    """

    file_path = Path(path)

    if not file_path.exists():
        raise FileNotFoundError(f"Signal file not found: {file_path}")

    suffix = file_path.suffix.lower()

    if suffix not in SUPPORTED_FORMATS:
        raise ValueError(
            f"Unsupported signal format '{suffix}'. "
            f"Supported formats: {sorted(SUPPORTED_FORMATS)}"
        )

    if suffix == ".iq":
        if iq_sample_rate is None:
            raise ValueError(
                "iq_sample_rate is required when loading a raw IQ file."
            )

        if iq_sample_rate <= 0:
            raise ValueError("iq_sample_rate must be greater than zero.")

        samples = read_iq_file(
            file_path,
            max_samples=max_samples,
        )

        sample_rate = float(iq_sample_rate)
        source_format = "iq"

    else:
        samples, wav_sample_rate = read_wav_file(
            file_path,
            max_samples=max_samples,
        )

        sample_rate = float(wav_sample_rate)
        source_format = "wav"

    metadata = get_iq_metadata(samples)

    sample_count = metadata["sample_count"]

    return LoadedSignal(
        samples=samples,
        sample_rate=sample_rate,
        source_format=source_format,
        sample_count=sample_count,
        duration_seconds=float(sample_count / sample_rate),
        peak_amplitude=metadata["peak_amplitude"],
        mean_power=metadata["mean_power"],
        filename=file_path.name,
    )