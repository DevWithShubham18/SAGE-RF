from __future__ import annotations

import json
import math
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
)
from fastapi.responses import StreamingResponse
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
from backend.app.reports.pdf_report import (
    generate_analysis_pdf,
)


router = APIRouter(
    prefix="/api",
    tags=["RF Analysis"],
)


# ============================================================
# CONSTANTS
# ============================================================

# Maximum amount of JSON that we allow into SQLite for one
# history record.
#
# This is deliberately much smaller than SQLite's theoretical
# limits. History is for summaries, not raw signal matrices.
MAX_HISTORY_BYTES = 2 * 1024 * 1024

# Frontend numerical limits.
FRONTEND_SPECTRUM_POINTS = 4096
FRONTEND_WATERFALL_ROWS = 256
FRONTEND_WATERFALL_COLUMNS = 512

# History numerical limits.
HISTORY_SPECTRUM_POINTS = 256
HISTORY_WATERFALL_ROWS = 0
HISTORY_WATERFALL_COLUMNS = 0


def _get_max_analysis_samples() -> int | None:
    """Return the optional deployment memory-safety analysis window."""

    raw_value = os.getenv(
        "SAGE_RF_MAX_ANALYSIS_SAMPLES",
        "",
    ).strip()

    if not raw_value:
        return None

    try:
        value = int(raw_value)
    except ValueError as exc:
        raise RuntimeError(
            "SAGE_RF_MAX_ANALYSIS_SAMPLES must be an integer"
        ) from exc

    if value < 4096:
        raise RuntimeError(
            "SAGE_RF_MAX_ANALYSIS_SAMPLES must be at least 4096"
        )

    return value


# ============================================================
# JSON / NUMPY SAFETY
# ============================================================

def _json_safe(value: Any) -> Any:
    """
    Recursively convert NumPy / complex / tuple / array values
    into JSON-safe Python values.

    Complex values are represented by magnitude.

    NaN and infinity are converted to None.
    """

    if value is None:
        return None

    if isinstance(value, bool):
        return value

    if isinstance(value, str):
        return value

    if isinstance(value, int):
        return value

    if isinstance(value, float):
        if not math.isfinite(value):
            return None

        return value

    if isinstance(value, complex):
        magnitude = abs(value)

        if not math.isfinite(magnitude):
            return None

        return float(magnitude)

    # NumPy support.
    try:
        import numpy as np

        if isinstance(value, np.ndarray):
            return _json_safe(
                value.tolist()
            )

        if isinstance(value, np.generic):
            return _json_safe(
                value.item()
            )

    except ImportError:
        pass

    if isinstance(value, dict):
        return {
            str(key): _json_safe(item)
            for key, item in value.items()
        }

    if isinstance(value, (list, tuple)):
        return [
            _json_safe(item)
            for item in value
        ]

    try:
        return str(value)
    except Exception:
        return None


# ============================================================
# NUMERICAL ARRAY HELPERS
# ============================================================

def _downsample_1d(
    values: Any,
    max_points: int = FRONTEND_SPECTRUM_POINTS,
) -> list:
    """
    Reduce a large 1D numerical array.

    This prevents millions of values from being sent to the
    browser.
    """

    try:
        import numpy as np

        array = np.asarray(values)

        if array.size == 0:
            return []

        array = array.reshape(-1)

        if np.iscomplexobj(array):
            array = np.abs(array)

        if array.size <= max_points:
            return _json_safe(
                array
            )

        indices = np.linspace(
            0,
            array.size - 1,
            max_points,
            dtype=int,
        )

        reduced = array[indices]

        return _json_safe(
            reduced
        )

    except Exception:
        return _json_safe(values)


def _compact_waterfall(
    waterfall: Any,
    max_rows: int = FRONTEND_WATERFALL_ROWS,
    max_columns: int = FRONTEND_WATERFALL_COLUMNS,
) -> Any:
    """
    Compact a waterfall matrix for frontend use.

    IMPORTANT:
    This function is only intended for the API response.

    The full waterfall is NEVER stored in SQLite history.
    """

    try:
        import numpy as np

        array = np.asarray(waterfall)

        if array.size == 0:
            return []

        if np.iscomplexobj(array):
            array = np.abs(array)

        if array.ndim == 1:
            return _downsample_1d(
                array,
                max_points=max_columns,
            )

        if array.ndim > 2:
            array = np.squeeze(array)

        if array.ndim != 2:
            return _json_safe(array)

        rows, columns = array.shape

        if rows > max_rows:
            row_indices = np.linspace(
                0,
                rows - 1,
                max_rows,
                dtype=int,
            )

            array = array[row_indices]

        if columns > max_columns:
            column_indices = np.linspace(
                0,
                columns - 1,
                max_columns,
                dtype=int,
            )

            array = array[
                :,
                column_indices,
            ]

        return _json_safe(
            array
        )

    except Exception:
        return _json_safe(waterfall)


# ============================================================
# FRONTEND ANALYSIS COMPACTION
# ============================================================

def _make_frontend_safe_analysis(
    analysis: dict,
) -> dict:
    """
    Compact the existing global analysis for browser use.

    Keeps the existing structure while limiting very large
    numerical arrays.
    """

    if not isinstance(
        analysis,
        dict,
    ):
        return {}

    result = dict(analysis)

    # --------------------------------------------------------
    # Spectrum
    # --------------------------------------------------------

    spectrum = result.get(
        "spectrum"
    )

    if isinstance(
        spectrum,
        dict,
    ):
        compact_spectrum = {}

        for key, value in spectrum.items():

            if isinstance(
                value,
                (list, tuple),
            ):
                compact_spectrum[key] = (
                    _downsample_1d(
                        value,
                        FRONTEND_SPECTRUM_POINTS,
                    )
                )

            else:
                compact_spectrum[key] = (
                    _json_safe(value)
                )

        result["spectrum"] = (
            compact_spectrum
        )

    elif isinstance(
        spectrum,
        (list, tuple),
    ):
        result["spectrum"] = (
            _downsample_1d(
                spectrum,
                FRONTEND_SPECTRUM_POINTS,
            )
        )

    elif spectrum is not None:
        result["spectrum"] = (
            _json_safe(spectrum)
        )

    # --------------------------------------------------------
    # Waterfall
    # --------------------------------------------------------

    waterfall = result.get("waterfall")

    if isinstance(waterfall, dict):
        compact_waterfall = dict(waterfall)

        compact_waterfall["frequencies_hz"] = _downsample_1d(
            waterfall.get("frequencies_hz", []),
            FRONTEND_WATERFALL_COLUMNS,
        )
        compact_waterfall["times_seconds"] = _downsample_1d(
            waterfall.get("times_seconds", []),
            FRONTEND_WATERFALL_ROWS,
        )
        compact_waterfall["power_db"] = _compact_waterfall(
            waterfall.get("power_db", []),
            FRONTEND_WATERFALL_ROWS,
            FRONTEND_WATERFALL_COLUMNS,
        )
        compact_waterfall["time_bins"] = len(
            compact_waterfall["power_db"]
        )
        compact_waterfall["frequency_bins"] = (
            len(compact_waterfall["power_db"][0])
            if compact_waterfall["power_db"]
            else 0
        )

        result["waterfall"] = compact_waterfall

    elif waterfall is not None:
        result["waterfall"] = _compact_waterfall(
            waterfall,
            FRONTEND_WATERFALL_ROWS,
            FRONTEND_WATERFALL_COLUMNS,
        )

    # --------------------------------------------------------
    # Final safety
    # --------------------------------------------------------

    return _json_safe(
        result
    )


# ============================================================
# HISTORY-SAFE DETECTION SUMMARY
# ============================================================

def _compact_candidate_for_history(
    candidate: Any,
) -> dict:
    """
    Keep only useful scalar information from a detection.

    We deliberately remove potentially huge nested arrays,
    raw samples, FFT matrices, modulation internals, etc.
    """

    if not isinstance(
        candidate,
        dict,
    ):
        return {
            "value": _json_safe(candidate)
        }

    output = {}

    # Common RF detection fields.
    scalar_keys = [
        "frequency_hz",
        "peak_frequency_hz",
        "center_frequency_hz",
        "bandwidth_hz",
        "occupied_bandwidth_hz",
        "snr_db",
        "power_db",
        "power",
        "noise_floor_db",
        "start_frequency_hz",
        "stop_frequency_hz",
        "lower_frequency_hz",
        "upper_frequency_hz",
        "start_hz",
        "stop_hz",
        "confidence",
        "threshold",
        "samples_analyzed",
        "sample_count",
    ]

    for key in scalar_keys:
        if key in candidate:
            value = candidate.get(key)

            if isinstance(
                value,
                (dict, list, tuple),
            ):
                continue

            output[key] = _json_safe(
                value
            )

    # Modulation is useful for history.
    modulation = candidate.get(
        "modulation"
    )

    if isinstance(
        modulation,
        str,
    ):
        output["modulation"] = modulation

    modulation_confidence = candidate.get(
        "modulation_confidence"
    )

    if not isinstance(
        modulation_confidence,
        (dict, list, tuple),
    ):
        output[
            "modulation_confidence"
        ] = _json_safe(
            modulation_confidence
        )

    # Keep only a small metrics subset.
    metrics = candidate.get(
        "metrics"
    )

    if isinstance(
        metrics,
        dict,
    ):
        compact_metrics = {}

        metric_keys = [
            "snr_db",
            "power_db",
            "mean_power",
            "peak_amplitude",
            "rms",
            "bandwidth_hz",
            "occupied_bandwidth_hz",
            "crest_factor",
            "kurtosis",
            "skewness",
        ]

        for key in metric_keys:
            if key in metrics:
                value = metrics.get(
                    key
                )

                if not isinstance(
                    value,
                    (dict, list, tuple),
                ):
                    compact_metrics[key] = (
                        _json_safe(value)
                    )

        if compact_metrics:
            output["metrics"] = (
                compact_metrics
            )

    return _json_safe(
        output
    )


def _compact_detections_for_history(
    detections: Any,
) -> dict:
    """
    Create a tiny history representation of detections.

    This is intentionally NOT the same structure used by the
    live frontend.
    """

    if not isinstance(
        detections,
        dict,
    ):
        return {}

    candidates = detections.get(
        "candidates",
        [],
    )

    if not isinstance(
        candidates,
        list,
    ):
        candidates = []

    compact_candidates = []

    for candidate in candidates:
        compact_candidates.append(
            _compact_candidate_for_history(
                candidate
            )
        )

    return {
        "candidate_count": int(
            detections.get(
                "candidate_count",
                len(compact_candidates),
            )
            or 0
        ),
        "signal_count": int(
            detections.get(
                "signal_count",
                0,
            )
            or 0
        ),
        "candidates": compact_candidates,
    }


# ============================================================
# HISTORY-SAFE DSP SUMMARY
# ============================================================

def _compact_dsp_for_history(
    dsp_engine: Any,
) -> dict:
    """
    Keep only useful SAGE DSP summary information.

    Never store Fourier matrices or Laplace matrices in SQLite.
    """

    if not isinstance(
        dsp_engine,
        dict,
    ):
        return {}

    output = {
        "status": dsp_engine.get(
            "status"
        ),
        "metadata": _json_safe(
            dsp_engine.get(
                "metadata",
                {},
            )
        ),
    }

    fourier = dsp_engine.get(
        "fourier"
    )

    if isinstance(
        fourier,
        dict,
    ):
        fourier_summary = {
            "sample_rate": _json_safe(
                fourier.get(
                    "sample_rate"
                )
            ),
            "nfft": _json_safe(
                fourier.get(
                    "nfft"
                )
            ),
            "hop_size": _json_safe(
                fourier.get(
                    "hop_size"
                )
            ),
        }

        peaks = fourier.get(
            "peak_frequencies_hz"
        )

        if peaks is not None:
            fourier_summary[
                "peak_frequencies_hz"
            ] = _downsample_1d(
                peaks,
                max_points=32,
            )

        output["fourier"] = (
            fourier_summary
        )

    laplace = dsp_engine.get(
        "laplace"
    )

    if isinstance(
        laplace,
        dict,
    ):
        laplace_summary = {}

        if "peak" in laplace:
            laplace_summary[
                "peak"
            ] = _json_safe(
                laplace.get(
                    "peak"
                )
            )

        if "metadata" in laplace:
            laplace_summary[
                "metadata"
            ] = _json_safe(
                laplace.get(
                    "metadata"
                )
            )

        output["laplace"] = (
            laplace_summary
        )

    return _json_safe(
        output
    )


# ============================================================
# SMALL HISTORY RECORD
# ============================================================

def _make_history_result(
    result: dict,
) -> dict:
    """
    Build the SQLite history payload.

    CRITICAL:

    This function intentionally does NOT copy the complete
    frontend result.

    No waterfall.
    No large FFT matrix.
    No raw samples.
    No large Laplace matrix.

    History stores summaries only.
    """

    metadata = result.get(
        "metadata",
        {},
    )

    parameters = result.get(
        "parameters",
        {},
    )

    diagnostics = result.get(
        "diagnostics",
        {},
    )

    history_result = {
        "status": result.get(
            "status"
        ),

        "filename": result.get(
            "filename"
        ),

        "metadata": _json_safe(
            metadata
        ),

        "parameters": _json_safe(
            parameters
        ),

        "modulation": _json_safe(
            result.get(
                "modulation"
            )
        ),

        "detections": (
            _compact_detections_for_history(
                result.get(
                    "detections",
                    {},
                )
            )
        ),

        "dsp_engine": (
            _compact_dsp_for_history(
                result.get(
                    "dsp_engine",
                    {},
                )
            )
        ),

        "diagnostics": {
            "signal_detector": (
                diagnostics.get(
                    "signal_detector"
                )
            ),
            "per_signal_analysis": (
                diagnostics.get(
                    "per_signal_analysis"
                )
            ),
            "per_signal_modulation": (
                diagnostics.get(
                    "per_signal_modulation"
                )
            ),
            "sage_dsp_engine": (
                diagnostics.get(
                    "sage_dsp_engine"
                )
            ),
        },

        "errors": _json_safe(
            result.get(
                "errors",
                [],
            )
        ),

        "storage_note": (
            "History stores compact analysis "
            "summaries. Large numerical arrays "
            "and waterfall data are excluded."
        ),
    }

    # --------------------------------------------------------
    # Small spectrum preview
    # --------------------------------------------------------

    spectrum = result.get(
        "spectrum"
    )

    if isinstance(
        spectrum,
        dict,
    ):
        spectrum_preview = {}

        # Only retain a few useful spectrum fields.
        preferred_keys = [
            "frequencies_hz",
            "frequency_hz",
            "magnitude",
            "power_db",
            "power",
        ]

        for key in preferred_keys:

            if key not in spectrum:
                continue

            value = spectrum.get(
                key
            )

            if isinstance(
                value,
                (list, tuple),
            ):
                spectrum_preview[key] = (
                    _downsample_1d(
                        value,
                        HISTORY_SPECTRUM_POINTS,
                    )
                )

            else:
                spectrum_preview[key] = (
                    _json_safe(value)
                )

        if spectrum_preview:
            history_result[
                "spectrum_preview"
            ] = spectrum_preview

    elif spectrum is not None:

        history_result[
            "spectrum_preview"
        ] = _downsample_1d(
            spectrum,
            HISTORY_SPECTRUM_POINTS,
        )

    # --------------------------------------------------------
    # Explicitly mark waterfall as omitted
    # --------------------------------------------------------

    history_result[
        "waterfall"
    ] = {
        "stored": False,
        "reason": (
            "Full waterfall is not stored in SQLite."
        ),
    }

    return _json_safe(
        history_result
    )


# ============================================================
# EMERGENCY MINIMAL HISTORY
# ============================================================

def _make_emergency_history(
    result: dict,
    final_modulation: Any,
    sage_dsp: dict,
    enriched_candidates: list,
) -> dict:
    """
    Absolute fallback if the normal history payload somehow
    exceeds the storage limit.

    This payload is intentionally tiny.
    """

    candidates = []

    for candidate in enriched_candidates[:20]:
        candidates.append(
            _compact_candidate_for_history(
                candidate
            )
        )

    return _json_safe(
        {
            "status": "success",

            "filename": result.get(
                "filename"
            ),

            "metadata": result.get(
                "metadata",
                {},
            ),

            "modulation": final_modulation,

            "detections": {
                "candidate_count": len(
                    enriched_candidates
                ),
                "candidates": candidates,
            },

            "dsp_engine": (
                _compact_dsp_for_history(
                    sage_dsp
                )
            ),

            "storage_note": (
                "Emergency compact history record. "
                "Large analysis arrays were omitted."
            ),
        }
    )


# ============================================================
# SAGE DSP ENGINE
# ============================================================

def _run_sage_dsp_engine(
    temporary_path: str,
    source_format: str,
    max_samples: int | None = None,
) -> dict:
    """
    Run the standalone SAGE DSP engine.

    Current standalone adapter supports WAV.

    If SAGE DSP fails, the normal SAGE-RF analysis still
    succeeds and the error is returned as structured data.
    """

    if (
        not source_format
        or source_format.lower() != "wav"
    ):
        return {
            "status": "not_run",
            "reason": (
                "SAGE DSP WAV adapter is currently "
                "used for the standalone DSP engine."
            ),
        }

    try:

        # ----------------------------------------------------
        # Locate project root
        # ----------------------------------------------------

        project_root = (
            Path(__file__)
            .resolve()
            .parents[3]
        )

        dsp_engine_path = (
            project_root / "dsp-engine"
        )

        if not dsp_engine_path.exists():
            return {
                "status": "error",
                "error": (
                    "SAGE DSP engine directory not found: "
                    f"{dsp_engine_path}"
                ),
                "error_type": (
                    "FileNotFoundError"
                ),
            }

        # ----------------------------------------------------
        # Add dsp-engine to import path
        # ----------------------------------------------------

        dsp_engine_string = str(
            dsp_engine_path
        )

        if dsp_engine_string not in sys.path:
            sys.path.insert(
                0,
                dsp_engine_string,
            )

        # ----------------------------------------------------
        # Import SAGE DSP
        # ----------------------------------------------------

        from sage_dsp.io.loaders import (
            load_wav_as_signal,
        )

        from sage_dsp.fourier import (
            analyze_fourier,
        )

        from sage_dsp.laplace import (
            analyze_laplace,
        )

        # ----------------------------------------------------
        # Load WAV
        # ----------------------------------------------------

        signal = load_wav_as_signal(
            temporary_path,
            max_samples=max_samples,
        )

        # ----------------------------------------------------
        # Fourier analysis
        # ----------------------------------------------------

        fourier_result = analyze_fourier(
            signal,
            nfft=4096,
            hop_size=2048,
        )

        # ----------------------------------------------------
        # Laplace analysis
        # ----------------------------------------------------

        laplace_sample_count = min(
            int(signal.sample_count),
            4096,
        )

        laplace_signal = (
            signal.__class__(
                signal.samples[
                    :laplace_sample_count
                ],
                signal.sample_rate,
                center_frequency_hz=(
                    signal.center_frequency_hz
                ),
                metadata={
                    **signal.metadata,
                    "source_format": (
                        "wav_window"
                    ),
                    "analysis_window_samples": (
                        laplace_sample_count
                    ),
                },
            )
        )

        laplace_result = analyze_laplace(
            laplace_signal,
            sigma_min=-5.0,
            sigma_max=5.0,
            sigma_points=5,
            frequency_points=128,
        )

        # ----------------------------------------------------
        # Compact Fourier
        # ----------------------------------------------------

        fourier_response = {
            "frequencies_hz": (
                _downsample_1d(
                    fourier_result.get(
                        "frequencies_hz",
                        [],
                    ),
                    max_points=4096,
                )
            ),

            "times_seconds": (
                _downsample_1d(
                    fourier_result.get(
                        "times_seconds",
                        [],
                    ),
                    max_points=2048,
                )
            ),

            "spectrum": (
                _compact_waterfall(
                    fourier_result.get(
                        "spectrum",
                        [],
                    ),
                    max_rows=256,
                    max_columns=512,
                )
            ),

            "magnitude": (
                _compact_waterfall(
                    fourier_result.get(
                        "magnitude",
                        [],
                    ),
                    max_rows=256,
                    max_columns=512,
                )
            ),

            "power_db": (
                _compact_waterfall(
                    fourier_result.get(
                        "power_db",
                        [],
                    ),
                    max_rows=256,
                    max_columns=512,
                )
            ),

            "peak_frequencies_hz": (
                _downsample_1d(
                    fourier_result.get(
                        "peak_frequencies_hz",
                        [],
                    ),
                    max_points=1024,
                )
            ),

            "sample_rate": float(
                fourier_result.get(
                    "sample_rate",
                    signal.sample_rate,
                )
            ),

            "nfft": int(
                fourier_result.get(
                    "nfft",
                    4096,
                )
            ),

            "hop_size": int(
                fourier_result.get(
                    "hop_size",
                    2048,
                )
            ),
        }

        # ----------------------------------------------------
        # Compact Laplace
        # ----------------------------------------------------

        laplace_response = _json_safe(
            {
                "sigma": (
                    laplace_result.get(
                        "sigma"
                    )
                ),

                "frequencies_hz": (
                    laplace_result.get(
                        "frequencies_hz"
                    )
                ),

                "magnitude": (
                    laplace_result.get(
                        "magnitude"
                    )
                ),

                "magnitude_db": (
                    laplace_result.get(
                        "magnitude_db"
                    )
                ),

                "phase_rad": (
                    laplace_result.get(
                        "phase_rad"
                    )
                ),

                "peak": (
                    laplace_result.get(
                        "peak"
                    )
                ),

                "metadata": (
                    laplace_result.get(
                        "metadata"
                    )
                ),
            }
        )

        # ----------------------------------------------------
        # Final SAGE DSP result
        # ----------------------------------------------------

        return _json_safe(
            {
                "status": "success",

                "metadata": {
                    "sample_rate": float(
                        signal.sample_rate
                    ),

                    "sample_count": int(
                        signal.sample_count
                    ),

                    "duration_seconds": float(
                        signal.duration_seconds
                    ),

                    "laplace_samples_analyzed": int(
                        laplace_sample_count
                    ),
                },

                "fourier": (
                    fourier_response
                ),

                "laplace": (
                    laplace_response
                ),
            }
        )

    except Exception as exc:

        return {
            "status": "error",
            "error": str(exc),
            "error_type": type(exc).__name__,
        }


# ============================================================
# HEALTH
# ============================================================

@router.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "SAGE-RF",
        "dsp": "GNU Radio + SciPy + SAGE DSP",
        "database": "SQLite",
        "authentication": "Firebase",
    }


# ============================================================
# ANALYZE FILE
# ============================================================

@router.post("/analyze")
async def analyze_file(
    file: UploadFile = File(...),
    iq_sample_rate: float | None = Form(None),
    current_user: dict = Depends(
        get_current_user
    ),
    db: Session = Depends(
        get_db
    ),
):
    """
    Authenticated end-to-end RF analysis.

    Supports:
        .iq
        .wav

    Pipeline:

        Upload
          ↓
        Signal loader
          ↓
        Global analysis
          ↓
        RF detector
          ↓
        Per-signal analysis
          ↓
        Modulation estimation
          ↓
        SAGE DSP Fourier
          ↓
        SAGE DSP Laplace
          ↓
        Frontend-safe response
          ↓
        Compact SQLite history

    IMPORTANT:

    SQLite receives only a compact history summary.
    """

    # ========================================================
    # 1. Validate file
    # ========================================================

    filename = file.filename or ""

    suffix = Path(
        filename
    ).suffix.lower()

    if suffix not in {
        ".iq",
        ".wav",
    }:
        raise HTTPException(
            status_code=400,
            detail=(
                "Unsupported file format. "
                "Use .iq or .wav"
            ),
        )

    # ========================================================
    # 2. Validate Firebase user
    # ========================================================

    user_id = current_user.get(
        "uid"
    )

    if not user_id:
        raise HTTPException(
            status_code=401,
            detail=(
                "Firebase token does not contain a UID"
            ),
        )

    temporary_path: str | None = None
    max_analysis_samples = _get_max_analysis_samples()

    try:

        # ====================================================
        # 3. Save upload temporarily
        # ====================================================

        with NamedTemporaryFile(
            suffix=suffix,
            delete=False,
        ) as temp:

            while True:
                chunk = await file.read(
                    1024 * 1024
                )

                if not chunk:
                    break

                temp.write(chunk)

            temporary_path = temp.name

        # ====================================================
        # 4. Load signal
        # ====================================================

        signal = load_signal(
            temporary_path,
            iq_sample_rate=iq_sample_rate,
            max_samples=max_analysis_samples,
        )

        samples = signal.samples

        sample_rate = float(
            signal.sample_rate
        )

        # ====================================================
        # 5. Metadata
        # ====================================================

        metadata = {
            "source_format": (
                signal.source_format
            ),

            "sample_rate": sample_rate,

            "sample_count": int(
                signal.sample_count
            ),

            "duration_seconds": float(
                signal.duration_seconds
            ),
        }

        if max_analysis_samples is not None:
            metadata[
                "analysis_sample_limit"
            ] = max_analysis_samples

            metadata[
                "analysis_window_limited"
            ] = bool(
                signal.sample_count
                >= max_analysis_samples
            )

        # ====================================================
        # 6. Amplitude / power statistics
        # ====================================================

        if samples.size > 0:

            import numpy as np

            amplitudes = np.abs(
                samples
            )

            metadata[
                "peak_amplitude"
            ] = float(
                np.max(
                    amplitudes
                )
            )

            metadata[
                "mean_power"
            ] = float(
                np.mean(
                    amplitudes ** 2
                )
            )

            metadata[
                "rms_amplitude"
            ] = float(
                np.sqrt(
                    np.mean(
                        amplitudes ** 2
                    )
                )
            )

        # ====================================================
        # 7. Existing global analysis
        # ====================================================

        analysis = analyze_signal(
            samples,
            sample_rate,
        )

        # ====================================================
        # Compact global analysis for browser.
        # ====================================================

        analysis = (
            _make_frontend_safe_analysis(
                analysis
            )
        )

        # ====================================================
        # 8. RF detection
        # ====================================================

        detection = detect_signals(
            samples,
            sample_rate,
        )

        candidates = detection.get(
            "candidates",
            [],
        )

        if not isinstance(
            candidates,
            list,
        ):
            candidates = []

        # ====================================================
        # 9. Per-signal analysis
        # ====================================================

        per_signal = (
            analyze_all_detected_signals(
                samples=samples,
                sample_rate=sample_rate,
                candidates=candidates,
            )
        )

        detailed_signals = (
            per_signal.get(
                "signals",
                [],
            )
        )

        if not isinstance(
            detailed_signals,
            list,
        ):
            detailed_signals = []

        # ====================================================
        # Convert per-signal analysis to JSON-safe values.
        # ====================================================

        detailed_signals = _json_safe(
            detailed_signals
        )

        # ====================================================
        # 10. Enrich candidates
        # ====================================================

        enriched_candidates = []

        for index, candidate in enumerate(
            candidates
        ):

            if not isinstance(
                candidate,
                dict,
            ):
                candidate = {
                    "value": _json_safe(
                        candidate
                    )
                }

            enriched = dict(
                candidate
            )

            if index < len(
                detailed_signals
            ):

                detailed = (
                    detailed_signals[
                        index
                    ]
                )

                if not isinstance(
                    detailed,
                    dict,
                ):
                    detailed = {}

                metrics = detailed.get(
                    "metrics",
                    {},
                )

                modulation = detailed.get(
                    "modulation"
                )

                enriched[
                    "metrics"
                ] = _json_safe(
                    metrics
                )

                try:

                    enriched[
                        "samples_analyzed"
                    ] = int(
                        detailed.get(
                            "samples_analyzed",
                            0,
                        )
                        or 0
                    )

                except Exception:

                    enriched[
                        "samples_analyzed"
                    ] = 0

                if isinstance(
                    modulation,
                    dict,
                ):

                    enriched[
                        "modulation"
                    ] = modulation.get(
                        "modulation"
                    )

                    enriched[
                        "modulation_confidence"
                    ] = modulation.get(
                        "confidence"
                    )

                    # Keep the detailed modulation
                    # object for the live UI.
                    enriched[
                        "modulation_analysis"
                    ] = _json_safe(
                        modulation
                    )

                elif isinstance(
                    modulation,
                    str,
                ):

                    enriched[
                        "modulation"
                    ] = modulation

                    enriched[
                        "modulation_confidence"
                    ] = None

                    enriched[
                        "modulation_analysis"
                    ] = {
                        "modulation": modulation
                    }

                else:

                    enriched[
                        "modulation"
                    ] = None

                    enriched[
                        "modulation_confidence"
                    ] = None

                    enriched[
                        "modulation_analysis"
                    ] = None

            else:

                enriched[
                    "metrics"
                ] = {}

                enriched[
                    "samples_analyzed"
                ] = 0

                enriched[
                    "modulation"
                ] = None

                enriched[
                    "modulation_confidence"
                ] = None

                enriched[
                    "modulation_analysis"
                ] = None

            enriched_candidates.append(
                _json_safe(
                    enriched
                )
            )

        # ====================================================
        # 11. Top-level modulation
        # ====================================================

        top_level_modulation = None

        if detailed_signals:

            first_detailed = (
                detailed_signals[0]
            )

            if isinstance(
                first_detailed,
                dict,
            ):

                top_level_modulation = (
                    first_detailed.get(
                        "modulation"
                    )
                )

        # ====================================================
        # 12. Detection response for frontend
        # ====================================================

        detections = {
            "candidate_count": len(
                enriched_candidates
            ),

            "candidates": (
                enriched_candidates
            ),

            "signal_count": len(
                detailed_signals
            ),

            "signals": (
                detailed_signals
            ),
        }

        # ====================================================
        # 13. SAGE DSP ENGINE
        # ====================================================

        sage_dsp = (
            _run_sage_dsp_engine(
                temporary_path=(
                    temporary_path
                ),
                source_format=(
                    signal.source_format
                ),
                max_samples=(
                    max_analysis_samples
                ),
            )
        )

        # ====================================================
        # 14. Final frontend result
        # ====================================================

        result = {
            "status": "success",

            "filename": filename,

            "metadata": metadata,

            "parameters": {
                "iq_sample_rate": (
                    iq_sample_rate
                ),
            },

            "spectrum": (
                analysis.get(
                    "spectrum"
                )
            ),

            "waterfall": (
                analysis.get(
                    "waterfall"
                )
            ),

            "modulation": (
                top_level_modulation
            ),

            "detections": detections,

            # NEW:
            # This is where the UI gets the SAGE DSP engine.
            "dsp_engine": sage_dsp,

            "diagnostics": {
                **(
                    analysis.get(
                        "diagnostics",
                        {},
                    )
                    if isinstance(
                        analysis,
                        dict,
                    )
                    else {}
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

                "sage_dsp_engine": (
                    sage_dsp.get(
                        "status"
                    )
                ),
            },

            "errors": [],
        }

        # ====================================================
        # 15. Final JSON safety
        # ====================================================

        result = _json_safe(
            result
        )

        # ====================================================
        # 16. First detection
        # ====================================================

        first_candidate = (
            enriched_candidates[0]
            if enriched_candidates
            else {}
        )

        if not isinstance(
            first_candidate,
            dict,
        ):
            first_candidate = {}

        peak_frequency_hz = (
            first_candidate.get(
                "peak_frequency_hz"
            )
        )

        if peak_frequency_hz is None:
            peak_frequency_hz = (
                first_candidate.get(
                    "frequency_hz"
                )
            )

        occupied_bandwidth_hz = (
            first_candidate.get(
                "bandwidth_hz"
            )
        )

        if occupied_bandwidth_hz is None:
            occupied_bandwidth_hz = (
                first_candidate.get(
                    "occupied_bandwidth_hz"
                )
            )

        snr_db = (
            first_candidate.get(
                "snr_db"
            )
        )

        # ====================================================
        # 17. Determine modulation
        # ====================================================

        candidate_modulation = (
            first_candidate.get(
                "modulation"
            )
        )

        if candidate_modulation:

            final_modulation = (
                candidate_modulation
            )

        elif isinstance(
            top_level_modulation,
            dict,
        ):

            final_modulation = (
                top_level_modulation.get(
                    "modulation"
                )
            )

        elif isinstance(
            top_level_modulation,
            str,
        ):

            final_modulation = (
                top_level_modulation
            )

        else:

            final_modulation = None

        # ====================================================
        # 18. COMPACT HISTORY
        # ====================================================

        history_result = (
            _make_history_result(
                result
            )
        )

        result_json = json.dumps(
            history_result,
            ensure_ascii=False,
            separators=(
                ",",
                ":",
            ),
            allow_nan=False,
        )

        # ====================================================
        # 19. HARD SIZE PROTECTION
        # ====================================================

        result_size = len(
            result_json.encode(
                "utf-8"
            )
        )

        if result_size > MAX_HISTORY_BYTES:

            history_result = (
                _make_emergency_history(
                    result=result,
                    final_modulation=(
                        final_modulation
                    ),
                    sage_dsp=sage_dsp,
                    enriched_candidates=(
                        enriched_candidates
                    ),
                )
            )

            result_json = json.dumps(
                history_result,
                ensure_ascii=False,
                separators=(
                    ",",
                    ":",
                ),
                allow_nan=False,
            )

        # ====================================================
        # 20. ABSOLUTE FINAL DATABASE SIZE CHECK
        # ====================================================

        final_history_bytes = len(
            result_json.encode(
                "utf-8"
            )
        )

        if (
            final_history_bytes
            > MAX_HISTORY_BYTES
        ):

            # This payload contains only the essential
            # database fields.
            result_json = json.dumps(
                {
                    "status": "success",
                    "filename": filename,
                    "metadata": {
                        "source_format": (
                            signal.source_format
                        ),
                        "sample_rate": (
                            sample_rate
                        ),
                        "sample_count": int(
                            signal.sample_count
                        ),
                        "duration_seconds": float(
                            signal.duration_seconds
                        ),
                    },
                    "modulation": (
                        final_modulation
                    ),
                    "detection_count": len(
                        enriched_candidates
                    ),
                    "dsp_engine": {
                        "status": (
                            sage_dsp.get(
                                "status"
                            )
                        ),
                        "metadata": (
                            sage_dsp.get(
                                "metadata",
                                {},
                            )
                        ),
                        "fourier": {
                            "peak_frequencies_hz": (
                                _downsample_1d(
                                    sage_dsp.get(
                                        "fourier",
                                        {},
                                    ).get(
                                        "peak_frequencies_hz",
                                        [],
                                    )
                                    if isinstance(
                                        sage_dsp.get(
                                            "fourier"
                                        ),
                                        dict,
                                    )
                                    else [],
                                    16,
                                )
                            )
                        },
                        "laplace": {
                            "peak": (
                                sage_dsp.get(
                                    "laplace",
                                    {},
                                ).get(
                                    "peak"
                                )
                                if isinstance(
                                    sage_dsp.get(
                                        "laplace"
                                    ),
                                    dict,
                                )
                                else None
                            )
                        },
                    },
                    "storage_note": (
                        "Minimal history record."
                    ),
                },
                ensure_ascii=False,
                separators=(
                    ",",
                    ":",
                ),
                allow_nan=False,
            )

        # ====================================================
        # 21. Create database record
        # ====================================================

        history_record = SignalAnalysis(
            user_id=user_id,

            filename=filename,

            source_format=(
                signal.source_format
            ),

            sample_rate=int(
                sample_rate
            ),

            duration_seconds=float(
                signal.duration_seconds
            ),

            peak_frequency_hz=(
                peak_frequency_hz
            ),

            occupied_bandwidth_hz=(
                occupied_bandwidth_hz
            ),

            snr_db=snr_db,

            modulation=(
                final_modulation
            ),

            detection_count=len(
                enriched_candidates
            ),

            result_json=result_json,

            created_at=datetime.now(
                timezone.utc
            ),
        )

        # ====================================================
        # 22. Commit database
        # ====================================================

        db.add(
            history_record
        )

        db.commit()

        db.refresh(
            history_record
        )

        # ====================================================
        # 23. Add history metadata
        # ====================================================

        result[
            "history_id"
        ] = history_record.id

        result[
            "created_at"
        ] = (
            history_record.created_at.isoformat()
        )

        return result

    # ========================================================
    # HTTP exceptions
    # ========================================================

    except HTTPException:
        raise

    # ========================================================
    # Unexpected errors
    # ========================================================

    except Exception as exc:

        db.rollback()

        raise HTTPException(
            status_code=500,
            detail=(
                "Signal analysis failed: "
                f"{exc}"
            ),
        ) from exc

    # ========================================================
    # Cleanup temporary upload
    # ========================================================

    finally:

        if temporary_path:

            Path(
                temporary_path
            ).unlink(
                missing_ok=True
            )


# ============================================================
# HISTORY LIST
# ============================================================

@router.get("/history")
def get_history(
    current_user: dict = Depends(
        get_current_user
    ),
    db: Session = Depends(
        get_db
    ),
):
    """
    Return analysis history for the authenticated user.
    """

    user_id = current_user.get(
        "uid"
    )

    if not user_id:
        raise HTTPException(
            status_code=401,
            detail=(
                "Firebase token does not contain a UID"
            ),
        )

    rows = (
        db.query(
            SignalAnalysis
        )
        .filter(
            SignalAnalysis.user_id
            == user_id
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

                "filename": (
                    row.filename
                ),

                "source_format": (
                    row.source_format
                ),

                "sample_rate": (
                    row.sample_rate
                ),

                "duration_seconds": (
                    row.duration_seconds
                ),

                "peak_frequency_hz": (
                    row.peak_frequency_hz
                ),

                "occupied_bandwidth_hz": (
                    row.occupied_bandwidth_hz
                ),

                "snr_db": (
                    row.snr_db
                ),

                "modulation": (
                    row.modulation
                ),

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
# SINGLE HISTORY ITEM
# ============================================================

@router.get(
    "/history/{analysis_id}"
)
def get_history_item(
    analysis_id: int,
    current_user: dict = Depends(
        get_current_user
    ),
    db: Session = Depends(
        get_db
    ),
):
    """
    Return one analysis belonging to the authenticated user.
    """

    user_id = current_user.get(
        "uid"
    )

    if not user_id:
        raise HTTPException(
            status_code=401,
            detail=(
                "Firebase token does not contain a UID"
            ),
        )

    row = (
        db.query(
            SignalAnalysis
        )
        .filter(
            SignalAnalysis.id
            == analysis_id,

            SignalAnalysis.user_id
            == user_id,
        )
        .first()
    )

    if row is None:
        raise HTTPException(
            status_code=404,
            detail="Analysis not found",
        )

    try:

        result = json.loads(
            row.result_json
        )

    except (
        json.JSONDecodeError,
        TypeError,
    ):

        result = {}

    result = _json_safe(
        result
    )

    result[
        "history_id"
    ] = row.id

    result[
        "created_at"
    ] = (
        row.created_at.isoformat()
    )

    return result


# ============================================================
# PDF REPORT
# ============================================================

@router.get(
    "/report/{analysis_id}"
)
def generate_report(
    analysis_id: int,
    current_user: dict = Depends(
        get_current_user
    ),
    db: Session = Depends(
        get_db
    ),
):
    """
    Generate a PDF report for an existing analysis.

    The report uses the compact history result stored in SQLite.

    It does NOT rerun the DSP pipeline.
    """

    # ========================================================
    # 1. Validate user
    # ========================================================

    user_id = current_user.get(
        "uid"
    )

    if not user_id:
        raise HTTPException(
            status_code=401,
            detail=(
                "Firebase token does not contain a UID"
            ),
        )

    # ========================================================
    # 2. Find analysis
    # ========================================================

    row = (
        db.query(
            SignalAnalysis
        )
        .filter(
            SignalAnalysis.id
            == analysis_id,

            SignalAnalysis.user_id
            == user_id,
        )
        .first()
    )

    if row is None:
        raise HTTPException(
            status_code=404,
            detail="Analysis not found",
        )

    # ========================================================
    # 3. Load result
    # ========================================================

    try:

        result = json.loads(
            row.result_json
        )

    except (
        json.JSONDecodeError,
        TypeError,
    ) as exc:

        raise HTTPException(
            status_code=500,
            detail=(
                "Stored analysis result is invalid "
                "and cannot be converted to PDF."
            ),
        ) from exc

    # ========================================================
    # 4. JSON safety
    # ========================================================

    result = _json_safe(
        result
    )

    result[
        "history_id"
    ] = row.id

    result[
        "created_at"
    ] = (
        row.created_at.isoformat()
    )

    # ========================================================
    # 5. PDF compatibility
    # ========================================================

    # History intentionally stores spectrum under
    # spectrum_preview.
    #
    # Older PDF code may expect "spectrum".
    #
    if (
        "spectrum" not in result
        and "spectrum_preview" in result
    ):

        result[
            "spectrum"
        ] = result[
            "spectrum_preview"
        ]

    # ========================================================
    # 6. Generate PDF
    # ========================================================

    try:

        pdf_buffer = (
            generate_analysis_pdf(
                result
            )
        )

    except Exception as exc:

        raise HTTPException(
            status_code=500,
            detail=(
                "PDF report generation failed: "
                f"{exc}"
            ),
        ) from exc

    # ========================================================
    # 7. Safe filename
    # ========================================================

    original_filename = (
        row.filename
        or "analysis"
    )

    report_stem = Path(
        original_filename
    ).stem

    safe_stem = "".join(
        character
        if (
            character.isalnum()
            or character in {
                "-",
                "_",
                ".",
            }
        )
        else "_"
        for character in report_stem
    )

    if not safe_stem:
        safe_stem = "analysis"

    pdf_filename = (
        f"SAGE-RF_Report_{safe_stem}.pdf"
    )

    # ========================================================
    # 8. Return PDF
    # ========================================================

    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": (
                f'attachment; filename="{pdf_filename}"'
            )
        },
    )
