import json
from pathlib import Path
from tempfile import NamedTemporaryFile

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from backend.app.analysis.features import analyze_signal
from backend.app.analysis.signal_analysis import analyze_all_detected_signals
from backend.app.db.database import get_db
from backend.app.db.models import SignalAnalysis
from backend.app.dsp.detector import detect_signals
from backend.app.io.readers import load_signal


router = APIRouter(prefix="/api", tags=["RF Analysis"])


# ============================================================
# HEALTH
# ============================================================

@router.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "SAGE-RF",
        "dsp": "GNU Radio + SciPy",
        "database": "SQLite",
    }


# ============================================================
# ANALYZE SIGNAL
# ============================================================

@router.post("/analyze")
async def analyze_file(
    file: UploadFile = File(...),
    iq_sample_rate: float | None = Form(None),
    db: Session = Depends(get_db),
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
        9. Save analysis to SQLite history
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
        # ========================================================
        # 1. Save uploaded file temporarily
        # ========================================================

        with NamedTemporaryFile(
            suffix=suffix,
            delete=False,
        ) as temp:
            temp.write(await file.read())
            temporary_path = temp.name

        # ========================================================
        # 2. Load signal
        # ========================================================

        signal = load_signal(
            temporary_path,
            iq_sample_rate=iq_sample_rate,
        )

        samples = signal.samples
        sample_rate = float(signal.sample_rate)

        # ========================================================
        # 3. Build metadata
        # ========================================================

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

        # ========================================================
        # 4. Global spectrum + waterfall
        # ========================================================

        analysis = analyze_signal(
            samples,
            sample_rate,
        )

        # ========================================================
        # 5. Detect RF signals
        # ========================================================

        detection = detect_signals(
            samples,
            sample_rate,
        )

        candidates = detection.get(
            "candidates",
            [],
        )

        # ========================================================
        # 6. Analyze every detected signal independently
        # ========================================================

        per_signal = analyze_all_detected_signals(
            samples=samples,
            sample_rate=sample_rate,
            candidates=candidates,
        )

        detailed_signals = per_signal.get(
            "signals",
            [],
        )

        # ========================================================
        # 7. Enrich detector candidates
        # ========================================================

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
                    "modulation",
                )

                enriched["metrics"] = metrics

                enriched["samples_analyzed"] = int(
                    detailed.get(
                        "samples_analyzed",
                        0,
                    )
                )

                if modulation is not None:
                    enriched["modulation"] = modulation.get(
                        "modulation"
                    )

                    enriched["modulation_confidence"] = (
                        modulation.get("confidence")
                    )

                    enriched["modulation_analysis"] = (
                        modulation
                    )

                else:
                    enriched["modulation"] = None
                    enriched["modulation_confidence"] = None
                    enriched["modulation_analysis"] = None

            else:
                enriched["metrics"] = {}
                enriched["samples_analyzed"] = 0
                enriched["modulation"] = None
                enriched["modulation_confidence"] = None
                enriched["modulation_analysis"] = None

            enriched_candidates.append(enriched)

        # ========================================================
        # 8. Top-level modulation
        # ========================================================

        top_level_modulation = None

        if detailed_signals:
            top_level_modulation = detailed_signals[0].get(
                "modulation"
            )

        # ========================================================
        # 9. Detection response
        # ========================================================

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

        # ========================================================
        # 10. Final response
        # ========================================================

        result = {
            "status": "success",
            "filename": filename,
            "metadata": metadata,
            "parameters": {
                "iq_sample_rate": iq_sample_rate,
            },
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

        # ========================================================
        # 11. Save analysis to SQLite history
        # ========================================================

        history_row = SignalAnalysis(
            filename=filename,
            source_format=signal.source_format,
            sample_rate=int(sample_rate),
            duration_seconds=float(
                signal.duration_seconds
            ),
            peak_frequency_hz=(
                result["spectrum"].get(
                    "peak_frequency_hz"
                )
                if result["spectrum"]
                else None
            ),
            occupied_bandwidth_hz=(
                result["spectrum"].get(
                    "occupied_bandwidth_hz"
                )
                if result["spectrum"]
                else None
            ),
            snr_db=(
                result["spectrum"].get("snr_db")
                if result["spectrum"]
                else None
            ),
            modulation=(
                top_level_modulation.get("modulation")
                if top_level_modulation
                else None
            ),
            detection_count=len(
                enriched_candidates
            ),
            result_json=json.dumps(
                result,
                default=str,
            ),
        )

        db.add(history_row)
        db.commit()
        db.refresh(history_row)

        # Expose the database ID to the frontend.
        result["history_id"] = history_row.id
        result["created_at"] = (
            history_row.created_at.isoformat()
        )

        return result

    except HTTPException:
        raise

    except Exception as exc:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail=f"Signal analysis failed: {exc}",
        ) from exc

    finally:
        # ========================================================
        # 12. Always clean up temporary file
        # ========================================================

        if temporary_path:
            Path(
                temporary_path
            ).unlink(
                missing_ok=True
            )


# ============================================================
# HISTORY
# ============================================================

@router.get("/history")
def get_history(
    db: Session = Depends(get_db),
):
    """
    Return saved RF analyses.

    Newest analyses are returned first.
    """

    rows = (
        db.query(SignalAnalysis)
        .order_by(
            SignalAnalysis.created_at.desc()
        )
        .all()
    )

    history = []

    for row in rows:
        history.append(
            {
                "id": row.id,
                "filename": row.filename,
                "source_format": row.source_format,
                "sample_rate": row.sample_rate,
                "duration_seconds": row.duration_seconds,
                "peak_frequency_hz": (
                    row.peak_frequency_hz
                ),
                "occupied_bandwidth_hz": (
                    row.occupied_bandwidth_hz
                ),
                "snr_db": row.snr_db,
                "modulation": row.modulation,
                "detection_count": (
                    row.detection_count
                ),
                "created_at": (
                    row.created_at.isoformat()
                ),
            }
        )

    return {
        "status": "success",
        "count": len(history),
        "history": history,
    }


# ============================================================
# GET ONE HISTORY ITEM
# ============================================================

@router.get("/history/{analysis_id}")
def get_history_item(
    analysis_id: int,
    db: Session = Depends(get_db),
):
    """
    Return the complete saved analysis.
    """

    row = (
        db.query(SignalAnalysis)
        .filter(
            SignalAnalysis.id == analysis_id
        )
        .first()
    )

    if row is None:
        raise HTTPException(
            status_code=404,
            detail="Analysis history item not found.",
        )

    try:
        result = json.loads(
            row.result_json
        )
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=500,
            detail="Saved analysis data is invalid.",
        )

    result["history_id"] = row.id
    result["created_at"] = (
        row.created_at.isoformat()
    )

    return {
        "status": "success",
        "analysis": result,
    }