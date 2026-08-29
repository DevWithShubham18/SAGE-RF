from pathlib import Path
from tempfile import NamedTemporaryFile
import json

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from backend.app.analysis.features import analyze_signal
from backend.app.analysis.signal_analysis import (
    analyze_all_detected_signals,
)
from backend.app.db.database import SessionLocal
from backend.app.db.models import SignalAnalysis
from backend.app.dsp.detector import detect_signals
from backend.app.io.readers import load_signal


router = APIRouter(
    prefix="/api",
    tags=["RF Analysis"],
)


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
# ANALYZE RF FILE
# ============================================================

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
        9. Persist analysis in SQLite history
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
        # =====================================================
        # 1. Save uploaded file temporarily
        # =====================================================

        with NamedTemporaryFile(
            suffix=suffix,
            delete=False,
        ) as temp:
            temp.write(await file.read())
            temporary_path = temp.name

        # =====================================================
        # 2. Load signal
        # =====================================================

        signal = load_signal(
            temporary_path,
            iq_sample_rate=iq_sample_rate,
        )

        samples = signal.samples
        sample_rate = float(signal.sample_rate)

        # =====================================================
        # 3. Metadata
        # =====================================================

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

        # =====================================================
        # 4. Global spectrum + waterfall
        # =====================================================

        analysis = analyze_signal(
            samples,
            sample_rate,
        )

        # =====================================================
        # 5. Detect RF signals
        # =====================================================

        detection = detect_signals(
            samples,
            sample_rate,
        )

        candidates = detection.get(
            "candidates",
            [],
        )

        # =====================================================
        # 6. Analyze every detected signal
        # =====================================================

        per_signal = analyze_all_detected_signals(
            samples=samples,
            sample_rate=sample_rate,
            candidates=candidates,
        )

        detailed_signals = per_signal.get(
            "signals",
            [],
        )

        # =====================================================
        # 7. Enrich candidates
        # =====================================================

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

            enriched_candidates.append(
                enriched
            )

        # =====================================================
        # 8. Top-level modulation
        # =====================================================

        top_level_modulation = None

        if detailed_signals:
            top_level_modulation = detailed_signals[0].get(
                "modulation"
            )

        # =====================================================
        # 9. Detection response
        # =====================================================

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

        # =====================================================
        # 10. Final API response
        # =====================================================

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

        # =====================================================
        # 11. SAVE ANALYSIS TO DATABASE
        # =====================================================

        db: Session = SessionLocal()

        try:
            analysis_record = SignalAnalysis(
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
                    result["spectrum"].get(
                        "snr_db"
                    )
                    if result["spectrum"]
                    else None
                ),
                modulation=(
                    top_level_modulation.get(
                        "modulation"
                    )
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

            db.add(analysis_record)
            db.commit()
            db.refresh(analysis_record)

        except Exception:
            db.rollback()

            # IMPORTANT:
            # Database failure should not break RF analysis.
            #
            # The analysis itself succeeded, so we still return
            # the original analysis response.

        finally:
            db.close()

        # =====================================================
        # 12. Return original API response
        # =====================================================

        return result

    except HTTPException:
        raise

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Signal analysis failed: {exc}",
        ) from exc

    finally:
        # =====================================================
        # 13. Clean temporary file
        # =====================================================

        if temporary_path:
            Path(
                temporary_path
            ).unlink(
                missing_ok=True
            )


# ============================================================
# ANALYSIS HISTORY
# ============================================================

@router.get("/history")
def get_history(
    limit: int = 50,
):
    """
    Return previously analyzed RF recordings.

    This is the first version of the SAGE-RF history/library API.

    Later we will attach Firebase users to these records.
    """

    if limit < 1:
        limit = 1

    if limit > 200:
        limit = 200

    db: Session = SessionLocal()

    try:
        records = (
            db.query(SignalAnalysis)
            .order_by(
                SignalAnalysis.created_at.desc()
            )
            .limit(limit)
            .all()
        )

        history = []

        for record in records:
            history.append(
                {
                    "id": record.id,
                    "filename": record.filename,
                    "source_format": record.source_format,
                    "sample_rate": record.sample_rate,
                    "duration_seconds": (
                        record.duration_seconds
                    ),
                    "peak_frequency_hz": (
                        record.peak_frequency_hz
                    ),
                    "occupied_bandwidth_hz": (
                        record.occupied_bandwidth_hz
                    ),
                    "snr_db": record.snr_db,
                    "modulation": record.modulation,
                    "detection_count": (
                        record.detection_count
                    ),
                    "created_at": (
                        record.created_at.isoformat()
                        if record.created_at
                        else None
                    ),
                }
            )

        return {
            "status": "success",
            "count": len(history),
            "history": history,
        }

    finally:
        db.close()


# ============================================================
# GET ONE HISTORY RECORD
# ============================================================

@router.get("/history/{analysis_id}")
def get_history_item(
    analysis_id: int,
):
    """
    Return the complete stored analysis result.
    """

    db: Session = SessionLocal()

    try:
        record = (
            db.query(SignalAnalysis)
            .filter(
                SignalAnalysis.id == analysis_id
            )
            .first()
        )

        if record is None:
            raise HTTPException(
                status_code=404,
                detail="Analysis record not found.",
            )

        try:
            result = json.loads(
                record.result_json
            )
        except Exception:
            result = {}

        return {
            "status": "success",
            "id": record.id,
            "filename": record.filename,
            "created_at": (
                record.created_at.isoformat()
                if record.created_at
                else None
            ),
            "result": result,
        }

    finally:
        db.close()


# ============================================================
# DELETE HISTORY RECORD
# ============================================================

@router.delete("/history/{analysis_id}")
def delete_history_item(
    analysis_id: int,
):
    """
    Delete one saved analysis from history.
    """

    db: Session = SessionLocal()

    try:
        record = (
            db.query(SignalAnalysis)
            .filter(
                SignalAnalysis.id == analysis_id
            )
            .first()
        )

        if record is None:
            raise HTTPException(
                status_code=404,
                detail="Analysis record not found.",
            )

        db.delete(record)
        db.commit()

        return {
            "status": "success",
            "message": "Analysis deleted.",
            "id": analysis_id,
        }

    except HTTPException:
        raise

    except Exception as exc:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail=f"Unable to delete analysis: {exc}",
        ) from exc

    finally:
        db.close()