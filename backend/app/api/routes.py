from pathlib import Path
from tempfile import NamedTemporaryFile

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from backend.app.analysis.features import analyze_signal
from backend.app.analysis.signal_analysis import analyze_all_detected_signals
from backend.app.dsp.detector import detect_signals
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
    End-to-end RF analysis API.

    Pipeline:
        1. File ingestion
        2. Signal normalization
        3. Spectrum analysis
        4. Waterfall/STFT analysis
        5. RF signal detection
        6. Per-signal frequency isolation
        7. Per-signal metrics
        8. Per-signal modulation classification
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
        # =========================================================
        # 1. Save uploaded file
        # =========================================================
        with NamedTemporaryFile(
            suffix=suffix,
            delete=False,
        ) as temp:
            temp.write(await file.read())
            temporary_path = temp.name

        # =========================================================
        # 2. Load signal
        # =========================================================
        signal = load_signal(
            temporary_path,
            iq_sample_rate=iq_sample_rate,
        )

        samples = signal.samples
        sample_rate = float(signal.sample_rate)

        # =========================================================
        # 3. Build metadata
        # =========================================================
        metadata = {
            "source_format": signal.source_format,
            "sample_rate": sample_rate,
            "sample_count": int(signal.sample_count),
            "duration_seconds": float(
                signal.duration_seconds
            ),
        }

        if samples.size > 0:
            import numpy as np

            amplitudes = np.abs(samples)

            metadata["peak_amplitude"] = float(
                np.max(amplitudes)
            )

            metadata["mean_power"] = float(
                np.mean(amplitudes ** 2)
            )

        # =========================================================
        # 4. Global spectrum + waterfall
        # =========================================================
        analysis = analyze_signal(
            samples,
            sample_rate,
        )

        # =========================================================
        # 5. Detect RF signals
        # =========================================================
        detection = detect_signals(
            samples,
            sample_rate,
        )

        candidates = detection.get(
            "candidates",
            [],
        )

        # =========================================================
        # 6. Analyze every detected signal independently
        # =========================================================
        per_signal = analyze_all_detected_signals(
            samples=samples,
            sample_rate=sample_rate,
            candidates=candidates,
        )

        detailed_signals = per_signal.get(
            "signals",
            [],
        )

        # =========================================================
        # 7. Enrich detector candidates
        #
        # IMPORTANT:
        # The API keeps modulation and modulation_confidence
        # directly on each candidate because this is part of the
        # public candidate response contract.
        # =========================================================
        enriched_candidates = []

        for index, candidate in enumerate(candidates):
            enriched = dict(candidate)

            if index < len(detailed_signals):
                detailed = detailed_signals[index]

                metrics = detailed.get(
                    "metrics",
                    {},
                )

                modulation = detailed.get(
                    "modulation"
                )

                # -------------------------------------------------
                # Detailed metrics
                # -------------------------------------------------
                enriched["metrics"] = metrics

                enriched["samples_analyzed"] = int(
                    detailed.get(
                        "samples_analyzed",
                        0,
                    )
                )

                # -------------------------------------------------
                # Modulation classification
                # -------------------------------------------------
                if modulation is not None:
                    enriched["modulation"] = modulation.get(
                        "modulation"
                    )

                    enriched["modulation_confidence"] = (
                        modulation.get("confidence")
                    )

                    # Preserve complete classification details too.
                    enriched["modulation_analysis"] = modulation
                else:
                    enriched["modulation"] = None
                    enriched["modulation_confidence"] = None

            else:
                enriched["metrics"] = {}
                enriched["samples_analyzed"] = 0
                enriched["modulation"] = None
                enriched["modulation_confidence"] = None
                enriched["modulation_analysis"] = None

            enriched_candidates.append(
                enriched
            )

        # =========================================================
        # 8. Top-level modulation
        #
        # For backward compatibility, expose the first detected
        # signal's modulation classification at the top level.
        # =========================================================
        top_level_modulation = None

        if detailed_signals:
            top_level_modulation = detailed_signals[0].get(
                "modulation"
            )

        # =========================================================
        # 9. Detection response
        # =========================================================
        detections = {
            "candidate_count": len(
                enriched_candidates
            ),
            "candidates": enriched_candidates,
            "signal_count": len(
                detailed_signals
            ),
            "signals": detailed_signals,
        }

        # =========================================================
        # 10. Final response
        # =========================================================
        result = {
            "status": "success",
            "filename": filename,
            "metadata": metadata,
            "parameters": None,

            "spectrum": analysis.get(
                "spectrum"
            ),

            "waterfall": analysis.get(
                "waterfall"
            ),

            "modulation": top_level_modulation,

            "detections": detections,

            "diagnostics": {
                **analysis.get(
                    "diagnostics",
                    {},
                ),

                "signal_detector": (
                    "spectral_threshold_detector"
                ),

                "per_signal_analysis": (
                    "fft_frequency_isolation"
                ),

                "per_signal_modulation": (
                    "explainable_baseline"
                ),
            },

            "errors": [],
        }

        return result

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Signal analysis failed: {exc}",
        ) from exc

    finally:
        # =========================================================
        # 11. Always clean up temporary file
        # =========================================================
        if temporary_path:
            Path(
                temporary_path
            ).unlink(
                missing_ok=True
            )