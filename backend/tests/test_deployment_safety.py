from sqlalchemy import create_engine, inspect

from backend.app.api.routes import (
    FRONTEND_WATERFALL_COLUMNS,
    FRONTEND_WATERFALL_ROWS,
    _get_max_analysis_samples,
    _make_frontend_safe_analysis,
)
from backend.app.db.database import initialize_database
from backend.app.io.readers import load_signal


def test_initialize_database_creates_signal_analyses_table(tmp_path):
    database_path = tmp_path / "fresh.db"
    test_engine = create_engine(f"sqlite:///{database_path}")

    initialize_database(bind=test_engine)

    assert "signal_analyses" in inspect(test_engine).get_table_names()


def test_analysis_sample_limit_is_optional(monkeypatch):
    monkeypatch.delenv("SAGE_RF_MAX_ANALYSIS_SAMPLES", raising=False)

    assert _get_max_analysis_samples() is None


def test_analysis_sample_limit_from_environment(monkeypatch):
    monkeypatch.setenv("SAGE_RF_MAX_ANALYSIS_SAMPLES", "524288")

    assert _get_max_analysis_samples() == 524288


def test_iq_loader_respects_analysis_sample_limit(tmp_path):
    import numpy as np

    signal_path = tmp_path / "bounded.iq"
    samples = np.arange(8192, dtype=np.float32).astype(np.complex64)
    samples.tofile(signal_path)

    loaded = load_signal(
        signal_path,
        iq_sample_rate=48000,
        max_samples=4096,
    )

    assert loaded.sample_count == 4096
    np.testing.assert_array_equal(loaded.samples, samples[:4096])


def test_frontend_waterfall_dictionary_is_compacted():
    import numpy as np

    rows = FRONTEND_WATERFALL_ROWS + 20
    columns = FRONTEND_WATERFALL_COLUMNS + 20
    analysis = {
        "spectrum": {},
        "waterfall": {
            "frequencies_hz": np.arange(columns),
            "times_seconds": np.arange(rows),
            "power_db": np.zeros((rows, columns), dtype=np.float32),
            "time_bins": rows,
            "frequency_bins": columns,
        },
    }

    compact = _make_frontend_safe_analysis(analysis)["waterfall"]

    assert compact["time_bins"] == FRONTEND_WATERFALL_ROWS
    assert compact["frequency_bins"] == FRONTEND_WATERFALL_COLUMNS
    assert len(compact["times_seconds"]) == FRONTEND_WATERFALL_ROWS
    assert len(compact["frequencies_hz"]) == FRONTEND_WATERFALL_COLUMNS
