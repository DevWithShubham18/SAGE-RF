from dataclasses import dataclass
from pathlib import Path
from typing import Literal
import wave

import numpy as np


SupportedFormat = Literal["wav", "iq"]


@dataclass
class RFSignal:
    """
    Unified representation of a loaded RF signal.

    All downstream DSP components work with this object
    instead of dealing directly with WAV/IQ file formats.
    """

    samples: np.ndarray
    sample_rate: float
    source_format: SupportedFormat
    sample_count: int
    duration_seconds: float


def detect_format(file_path: str | Path) -> SupportedFormat:
    """
    Determine the supported RF input format from the file extension.
    """

    path = Path(file_path)
    extension = path.suffix.lower()

    if extension == ".wav":
        return "wav"

    if extension in {".iq", ".cfile", ".cf32"}:
        return "iq"

    raise ValueError(
        f"Unsupported RF file format: {extension or '<no extension>'}"
    )


def read_iq_file(
    file_path: str | Path,
    sample_rate: float,
    dtype: str = "complex64",
) -> RFSignal:
    """
    Read a raw interleaved complex IQ file.

    The initial reader assumes complex64:
        float32 I
        float32 Q
        float32 I
        float32 Q
        ...

    The sample rate must be supplied separately because raw IQ
    files normally do not contain their own sample-rate metadata.
    """

    path = Path(file_path)

    if not path.exists():
        raise FileNotFoundError(f"IQ file not found: {path}")

    if sample_rate <= 0:
        raise ValueError("sample_rate must be greater than zero")

    if dtype != "complex64":
        raise ValueError(
            "Only complex64 IQ input is supported by this initial reader."
        )

    samples = np.fromfile(path, dtype=np.complex64)

    sample_count = int(samples.size)

    duration_seconds = (
        sample_count / sample_rate
        if sample_count > 0
        else 0.0
    )

    return RFSignal(
        samples=samples,
        sample_rate=float(sample_rate),
        source_format="iq",
        sample_count=sample_count,
        duration_seconds=duration_seconds,
    )


def read_wav_file(file_path: str | Path) -> RFSignal:
    """
    Read a PCM WAV file and return the unified RFSignal object.

    Mono WAV recordings are converted to complex samples with
    zero imaginary component.

    Stereo WAV recordings are interpreted as:
        channel 0 → I
        channel 1 → Q

    This gives us a useful initial convention for RF recordings
    stored as two-channel WAV.
    """

    path = Path(file_path)

    if not path.exists():
        raise FileNotFoundError(f"WAV file not found: {path}")

    with wave.open(str(path), "rb") as wav:
        channels = wav.getnchannels()
        sample_width = wav.getsampwidth()
        sample_rate = wav.getframerate()
        frame_count = wav.getnframes()
        raw_data = wav.readframes(frame_count)

    if sample_width == 1:
        dtype = np.uint8
    elif sample_width == 2:
        dtype = np.int16
    elif sample_width == 4:
        dtype = np.int32
    else:
        raise ValueError(
            f"Unsupported PCM sample width: {sample_width} bytes"
        )

    samples = np.frombuffer(raw_data, dtype=dtype)

    if channels == 1:
        samples = samples.astype(np.float32)

        # Normalize PCM amplitude.
        if np.issubdtype(dtype, np.integer):
            max_value = float(np.iinfo(dtype).max)
            if max_value > 0:
                samples /= max_value

        samples = samples.astype(np.complex64)

    elif channels == 2:
        samples = samples.reshape(-1, 2).astype(np.float32)

        if np.issubdtype(dtype, np.integer):
            max_value = float(np.iinfo(dtype).max)
            if max_value > 0:
                samples /= max_value

        samples = (
            samples[:, 0] + 1j * samples[:, 1]
        ).astype(np.complex64)

    else:
        raise ValueError(
            "Only mono and stereo WAV files are supported."
        )

    sample_count = int(samples.size)

    duration_seconds = (
        sample_count / sample_rate
        if sample_count > 0
        else 0.0
    )

    return RFSignal(
        samples=samples,
        sample_rate=float(sample_rate),
        source_format="wav",
        sample_count=sample_count,
        duration_seconds=duration_seconds,
    )


def load_signal(
    file_path: str | Path,
    iq_sample_rate: float | None = None,
) -> RFSignal:
    """
    Automatically load a supported WAV or IQ file.

    For raw IQ files, iq_sample_rate is required because
    the file itself normally does not contain this metadata.
    """

    source_format = detect_format(file_path)

    if source_format == "wav":
        return read_wav_file(file_path)

    if iq_sample_rate is None:
        raise ValueError(
            "iq_sample_rate is required when loading a raw IQ file."
        )

    return read_iq_file(
        file_path,
        sample_rate=iq_sample_rate,
    )


def get_iq_metadata(samples: np.ndarray) -> dict:
    """
    Calculate basic metadata from complex IQ samples.
    """

    if samples.size == 0:
        return {
            "sample_count": 0,
            "peak_amplitude": 0.0,
            "mean_power": 0.0,
        }

    power = np.abs(samples) ** 2

    return {
        "sample_count": int(samples.size),
        "peak_amplitude": float(np.max(np.abs(samples))),
        "mean_power": float(np.mean(power)),
    }