from __future__ import annotations

import sys
from pathlib import Path

from sage_dsp.core.signal import Signal


def load_wav_as_signal(
    path: str | Path,
    max_samples: int | None = None,
) -> Signal:
    """
    Load a WAV file using SAGE-RF's existing backend loader
    and convert it into the DSP engine Signal representation.
    """

    project_root = Path(__file__).resolve().parents[3]

    if str(project_root) not in sys.path:
        sys.path.insert(0, str(project_root))

    from backend.app.io.readers import load_signal

    loaded = load_signal(
        path,
        max_samples=max_samples,
    )

    return Signal(
        samples=loaded.samples,
        sample_rate=loaded.sample_rate,
        metadata={
            "source_format": loaded.source_format,
            "filename": loaded.filename,
            "duration_seconds": loaded.duration_seconds,
        },
    )
