import json
from datetime import datetime, timezone
from pathlib import Path
from tempfile import NamedTemporaryFile

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    Header,
    HTTPException,
    UploadFile,
)
from sqlalchemy.orm import Session

from backend.app.analysis.features import analyze_signal
from backend.app.analysis.signal_analysis import (
    analyze_all_detected_signals,
)
from backend.app.auth.dependencies import get_current_user
from backend.app.db.database import get_db
from backend.app.db.models import SignalAnalysis
from backend.app.dsp.detector import detect_signals
from backend.app.io.readers import load_signal


router = APIRouter(
    prefix="/api",
    tags=["RF Analysis"],
)


@router.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "SAGE-RF",
        "dsp": "GNU Radio + SciPy",
        "database": "SQLite",
        "authentication": "Firebase",
    }


@router.post("/analyze")
async def analyze_file(
    file: UploadFile = File(...),
    iq_sample_rate: float | None = Form(None),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Authenticated end-to-end RF analysis API.

    The Firebase UID is attached to every saved analysis.
    """

    filename = file.filename or ""
    suffix = Path(filename).suffix.lower()

    if suffix not in {".iq", ".wav"}:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file format. Use .iq or .wav",
        )

    user_id = current_user.get("uid")

    if not user_id:
        raise HTTPException(
            status_code=401,
            detail="Firebase token does not contain a UID",
        )

    temporary_path = None

    try:
        # =========================================================
        # 1. Save uploaded file temporarily
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
        # 3. Metadata
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
        # 6. Analyze detected signals independently
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
        # 7. Enrich candidates
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

                enriched["metrics"] = metrics

                enriched["samples_analyzed"] = int(
                    detailed.get(
                        "samples_analyzed",
                        0,
                    )
                )

                if modulation is not None:
                    enriched["modulation"] = (
                        modulation.get("modulation")
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

        # =========================================================
        # 8. Top-level modulation
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
        # 10. Final analysis result
        # =========================================================
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

        # =========================================================
        # 11. Save authenticated history record
        # =========================================================
        first_candidate = (
            enriched_candidates[0]
            if enriched_candidates
            else {}
        )

        first_metrics = first_candidate.get(
            "metrics",
            {},
        )

        history_record = SignalAnalysis(
            user_id=user_id,
            filename=filename,
            source_format=signal.source_format,
            sample_rate=int(sample_rate),
            duration_seconds=float(
                signal.duration_seconds
            ),
            peak_frequency_hz=first_candidate.get(
                "peak_frequency_hz"
            ),
            occupied_bandwidth_hz=first_candidate.get(
                "bandwidth_hz"
            ),
            snr_db=first_candidate.get(
                "snr_db"
            ),
            modulation=(
                first_candidate.get("modulation")
                or (
                    top_level_modulation.get(
                        "modulation"
                    )
                    if top_level_modulation
                    else None
                )
            ),
            detection_count=len(
                enriched_candidates
            ),
            result_json=json.dumps(
                result,
                default=str,
            ),
            created_at=datetime.now(
                timezone.utc
            ),
        )

        db.add(history_record)
        db.commit()
        db.refresh(history_record)

        result["history_id"] = history_record.id
        result["created_at"] = (
            history_record.created_at.isoformat()
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
        # =========================================================
        # 12. Clean up temporary file
        # =========================================================
        if temporary_path:
            Path(
                temporary_path
            ).unlink(
                missing_ok=True
            )


@router.get("/history")
def get_history(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Return analysis history belonging only to the
    currently authenticated Firebase user.
    """

    user_id = current_user.get("uid")

    if not user_id:
        raise HTTPException(
            status_code=401,
            detail="Firebase token does not contain a UID",
        )

    rows = (
        db.query(SignalAnalysis)
        .filter(
            SignalAnalysis.user_id == user_id
        )
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
                "peak_frequency_hz": row.peak_frequency_hz,
                "occupied_bandwidth_hz": (
                    row.occupied_bandwidth_hz
                ),
                "snr_db": row.snr_db,
                "modulation": row.modulation,
                "detection_count": row.detection_count,
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


@router.get("/history/{analysis_id}")
def get_history_item(
    analysis_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Return one analysis only if it belongs to
    the currently authenticated Firebase user.
    """

    user_id = current_user.get("uid")

    if not user_id:
        raise HTTPException(
            status_code=401,
            detail="Firebase token does not contain a UID",
        )

    row = (
        db.query(SignalAnalysis)
        .filter(
            SignalAnalysis.id == analysis_id,
            SignalAnalysis.user_id == user_id,
        )
        .first()
    )

    if row is None:
        raise HTTPException(
            status_code=404,
            detail="Analysis not found",
        )

    try:
        result = json.loads(row.result_json)
    except json.JSONDecodeError:
        result = {}

    result["history_id"] = row.id
    result["created_at"] = (
        row.created_at.isoformat()
    )

    return result