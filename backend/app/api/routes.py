from __future__ import annotations

import tempfile
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from backend.app.analysis.features import analyze_signal
from backend.app.io.readers import load_signal
from backend.app.schemas.signal import (
    AnalysisResult,
    SignalMetadata,
    SignalParameters,
    SpectrumResult,
    WaterfallResult,
)


router = APIRouter(
    prefix="/api",
    tags=["RF Analysis"],
)


MAX_UPLOAD_SIZE = 100 * 1024 * 1024


@router.get("/health")
def health() -> dict:
    """
    Basic backend health check.
    """

    return {
        "status": "ok",
        "service": "SAGE-RF",
        "dsp": "GNU Radio + SciPy",
    }


@router.post(
    "/analyze",
    response_model=AnalysisResult,
)
async def analyze_upload(
    file: UploadFile = File(...),
    iq_sample_rate: float | None = Form(
        default=None,
    ),
    max_samples: int | None = Form(
        default=None,
    ),
) -> AnalysisResult:
    """
    Upload an IQ or WAV recording and run
    the SAGE-RF spectral analysis pipeline.
    """

    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="Uploaded file must have a filename.",
        )

    filename = Path(
        file.filename
    ).name

    suffix = Path(
        filename
    ).suffix.lower()

    if suffix not in {".iq", ".wav"}:
        raise HTTPException(
            status_code=400,
            detail=(
                "Unsupported file format. "
                "SAGE-RF currently accepts .iq and .wav files."
            ),
        )

    signal_id = str(uuid4())

    temporary_path: Path | None = None

    try:
        with tempfile.NamedTemporaryFile(
            suffix=suffix,
            delete=False,
        ) as temporary_file:

            temporary_path = Path(
                temporary_file.name
            )

            total_bytes = 0

            while True:
                chunk = await file.read(1024 * 1024)

                if not chunk:
                    break

                total_bytes += len(chunk)

                if total_bytes > MAX_UPLOAD_SIZE:
                    raise HTTPException(
                        status_code=413,
                        detail=(
                            "File is too large. "
                            "Maximum upload size is 100 MB."
                        ),
                    )

                temporary_file.write(chunk)

        loaded = load_signal(
            temporary_path,
            iq_sample_rate=iq_sample_rate,
            max_samples=max_samples,
        )

        metadata = SignalMetadata(
            source_format=loaded.source_format,
            sample_rate=loaded.sample_rate,
            sample_count=loaded.sample_count,
            duration_seconds=loaded.duration_seconds,
            peak_amplitude=loaded.peak_amplitude,
            mean_power=loaded.mean_power,
        )

        analysis = analyze_signal(
            samples=loaded.samples,
            sample_rate=loaded.sample_rate,
        )

        spectrum = SpectrumResult(
            **analysis["spectrum"]
        )

        waterfall = WaterfallResult(
            **analysis["waterfall"]
        )

        parameters = SignalParameters(
            sampling_frequency=loaded.sample_rate,
            bandwidth=(
                analysis["spectrum"]
                ["occupied_bandwidth_hz"]
            ),
            snr_db=(
                analysis["spectrum"]
                ["snr_db"]
            ),
        )

        return AnalysisResult(
            status="success",
            signal_id=signal_id,
            filename=filename,
            metadata=metadata,
            parameters=parameters,
            spectrum=spectrum,
            waterfall=waterfall,
            diagnostics={
                "pipeline": [
                    "file_ingestion",
                    "signal_normalization",
                    "welch_psd",
                    "spectral_feature_extraction",
                    "stft_waterfall",
                ],
                "backend": "FastAPI",
                "dsp_engine": "GNU Radio + SciPy",
            },
        )

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Signal analysis failed: {exc}",
        ) from exc

    finally:
        if temporary_path is not None:
            temporary_path.unlink(
                missing_ok=True
            )

        await file.close()