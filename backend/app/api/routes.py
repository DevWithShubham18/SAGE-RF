from pathlib import Path
from tempfile import NamedTemporaryFile

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from backend.app.analysis.features import analyze_signal
from backend.app.dsp.detector import detect_signals
from backend.app.dsp.modulation import analyze_modulation
from backend.app.io.readers import load_signal


router = APIRouter(prefix="/api", tags=["RF Analysis"])


@router.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "SAGE-RF",
        "dsp": "GNU Radio + SciPy",
    }


@router.post("/analyze")
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

    The analysis pipeline performs:
    1. File ingestion
    2. Signal normalization
    3. Spectral analysis
    4. Waterfall/STFT analysis
    5. Modulation classification
    6. RF signal detection
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
        # ---------------------------------------------------------
        # 1. Save uploaded file to a temporary location
        # ---------------------------------------------------------
        with NamedTemporaryFile(
            suffix=suffix,
            delete=False,
        ) as temp:
            temp.write(await file.read())
            temporary_path = temp.name

        # ---------------------------------------------------------
        # 2. Load signal
        # ---------------------------------------------------------
        signal = load_signal(
            temporary_path,
            iq_sample_rate=iq_sample_rate,
        )

        # ---------------------------------------------------------
        # 3. Build signal metadata
        # ---------------------------------------------------------
        metadata = {
            "source_format": signal.source_format,
            "sample_rate": signal.sample_rate,
            "sample_count": signal.sample_count,
            "duration_seconds": signal.duration_seconds,
        }

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

        # ---------------------------------------------------------
        # 4. Spectral + waterfall analysis
        # ---------------------------------------------------------
        analysis = analyze_signal(
            signal.samples,
            signal.sample_rate,
        )

        # ---------------------------------------------------------
        # 5. Modulation classification
        # ---------------------------------------------------------
        modulation = analyze_modulation(
            signal.samples,
            signal.sample_rate,
        )

        modulation_classification = modulation.get(
            "classification"
        )

        # ---------------------------------------------------------
        # 6. RF signal detection
        # ---------------------------------------------------------
        detection = detect_signals(
            signal.samples,
            signal.sample_rate,
        )

        detection_candidates = []

        for candidate in detection.get("candidates", []):
            candidate_result = dict(candidate)

            # -----------------------------------------------------
            # Associate the overall modulation classification with
            # each detected RF candidate.
            #
            # The current baseline classifier operates on the
            # complete uploaded signal, so this is intentionally
            # marked as signal-level modulation evidence.
            # -----------------------------------------------------
            if modulation_classification:
                candidate_result["modulation"] = (
                    modulation_classification.get("modulation")
                )

                candidate_result["modulation_confidence"] = (
                    modulation_classification.get("confidence")
                )

            detection_candidates.append(candidate_result)

        detections = {
            "candidate_count": len(detection_candidates),
            "candidates": detection_candidates,
        }

        # ---------------------------------------------------------
        # 7. Build final API response
        # ---------------------------------------------------------
        result = {
            "status": "success",
            "filename": filename,
            "metadata": metadata,
            "parameters": None,
            "spectrum": analysis.get("spectrum"),
            "waterfall": analysis.get("waterfall"),
            "modulation": modulation_classification,
            "detections": detections,
            "diagnostics": {
                **analysis.get("diagnostics", {}),
                "modulation_classifier": (
                    "explainable_baseline"
                ),
                "signal_detector": (
                    "spectral_threshold_detector"
                ),
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
        # ---------------------------------------------------------
        # 8. Always remove temporary uploaded file
        # ---------------------------------------------------------
        if temporary_path:
            Path(temporary_path).unlink(
                missing_ok=True
            )
