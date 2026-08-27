from pathlib import Path
from tempfile import NamedTemporaryFile

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from backend.app.analysis.features import analyze_signal
from backend.app.dsp.modulation import analyze_modulation
from backend.app.io.readers import load_signal
from backend.app.schemas.signal import AnalysisResult


router = APIRouter(prefix="/api", tags=["RF Analysis"])


@router.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "SAGE-RF",
        "dsp": "GNU Radio + SciPy",
    }


@router.post("/analyze", response_model=AnalysisResult)
async def analyze_file(
    file: UploadFile = File(...),
    iq_sample_rate: float | None = Form(None),
):
    """
    Analyze an uploaded RF signal.

    Supported formats:
    - .iq: raw complex64 IQ samples
    - .wav: WAV signal files

    Raw IQ files require iq_sample_rate.
    """

    filename = file.filename or ""
    suffix = Path(filename).suffix.lower()

    if suffix not in {".iq", ".wav"}:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file format. Use .iq or .wav",
        )

    temporary_path = None

    try:
        # Save uploaded file to a temporary file.
        with NamedTemporaryFile(
            suffix=suffix,
            delete=False,
        ) as temp:
            temp.write(await file.read())
            temporary_path = temp.name

        # Load the signal.
        signal = load_signal(
            temporary_path,
            iq_sample_rate=iq_sample_rate,
        )

        # Build metadata from LoadedSignal.
        metadata = {
            "source_format": signal.source_format,
            "sample_rate": signal.sample_rate,
            "sample_count": signal.sample_count,
            "duration_seconds": signal.duration_seconds,
        }

        # Add optional signal statistics when available.
        if hasattr(signal, "samples"):
            samples = signal.samples

            if len(samples) > 0:
                import numpy as np

                amplitudes = np.abs(samples)

                metadata["peak_amplitude"] = float(
                    np.max(amplitudes)
                )

                metadata["mean_power"] = float(
                    np.mean(amplitudes ** 2)
                )

        # Run spectral analysis and waterfall analysis.
        analysis = analyze_signal(
            signal.samples,
            signal.sample_rate,
        )

        # Run modulation classification.
        modulation = analyze_modulation(
            signal.samples,
            signal.sample_rate,
        )

        # Build final API response.
        result = {
            "status": "success",
            "filename": filename,
            "metadata": metadata,
            "parameters": None,
            "spectrum": analysis["spectrum"],
            "waterfall": analysis["waterfall"],
            "modulation": modulation["classification"],
            "diagnostics": {
                **analysis.get("diagnostics", {}),
                "modulation_classifier": "explainable_baseline",
            },
            "errors": [],
        }

        return result

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Signal analysis failed: {exc}",
        ) from exc

    finally:
        # Always remove the temporary uploaded file.
        if temporary_path:
            Path(temporary_path).unlink(missing_ok=True)