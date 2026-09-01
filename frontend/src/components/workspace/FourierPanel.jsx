import {
  Activity,
  BarChart3,
  Radio,
  Zap,
} from "lucide-react";

function formatHz(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "—";
  }

  const absolute = Math.abs(number);

  if (absolute >= 1_000_000) {
    return `${(number / 1_000_000).toFixed(2)} MHz`;
  }

  if (absolute >= 1_000) {
    return `${(number / 1_000).toFixed(2)} kHz`;
  }

  return `${number.toFixed(1)} Hz`;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalize(values) {
  if (!values.length) {
    return [];
  }

  const numeric = values.map((value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  });

  const max = Math.max(
    ...numeric.map((value) => Math.abs(value)),
    1
  );

  return numeric.map(
    (value) => value / max
  );
}

function Metric({ label, value }) {
  return (
    <div className="workspace-metric">
      <span>{label}</span>
      <strong title={String(value)}>
        {value}
      </strong>
    </div>
  );
}

export default function FourierPanel({
  fourier = null,
}) {
  const frequencies = safeArray(
    fourier?.frequencies_hz
  );

  const power = safeArray(
    fourier?.power_db
  );

  const peaks = safeArray(
    fourier?.peak_frequencies_hz
  );

  const times = safeArray(
    fourier?.times_seconds
  );

  const hasData =
    frequencies.length > 0 &&
    power.length > 0;

  const chartValues = normalize(
    power.slice(0, 256)
  );

  const chartFrequencies =
    frequencies.slice(
      0,
      chartValues.length
    );

  const latestPeak =
    peaks.length > 0
      ? peaks[peaks.length - 1]
      : null;

  return (
    <section className="workspace-content dsp-fourier-view">
      <div className="workspace-panel dsp-hero-panel">
        <div className="panel-header">
          <div>
            <span className="panel-kicker">
              SAGE DSP / FOURIER DOMAIN
            </span>

            <h3>
              Fourier Spectrum Engine
            </h3>

            <p className="panel-description">
              Block-based FFT analysis from the
              standalone SAGE DSP engine.
            </p>
          </div>

          <span className="live-badge">
            <span />
            DSP ACTIVE
          </span>
        </div>

        <div className="dsp-metric-grid">
          <Metric
            label="FFT SIZE"
            value={
              fourier?.nfft
                ? Number(
                    fourier.nfft
                  ).toLocaleString()
                : "—"
            }
          />

          <Metric
            label="HOP SIZE"
            value={
              fourier?.hop_size
                ? Number(
                    fourier.hop_size
                  ).toLocaleString()
                : "—"
            }
          />

          <Metric
            label="TIME BLOCKS"
            value={times.length}
          />

          <Metric
            label="FREQUENCY BINS"
            value={frequencies.length}
          />

          <Metric
            label="LATEST PEAK"
            value={formatHz(
              latestPeak
            )}
          />

          <Metric
            label="SAMPLE RATE"
            value={
              fourier?.sample_rate
                ? `${Number(
                    fourier.sample_rate
                  ).toLocaleString()} Hz`
                : "—"
            }
          />
        </div>
      </div>

      <div className="workspace-panel">
        <div className="panel-header">
          <div>
            <span className="panel-kicker">
              FREQUENCY DOMAIN
            </span>

            <h3>
              FFT Power Profile
            </h3>
          </div>

          <BarChart3 size={18} />
        </div>

        {hasData ? (
          <div className="dsp-chart">
            {chartValues.map(
              (value, index) => (
                <div
                  className="dsp-chart-bar"
                  key={index}
                  style={{
                    height: `${Math.max(
                      4,
                      value * 100
                    )}%`,
                  }}
                  title={`${formatHz(
                    chartFrequencies[index]
                  )}`}
                />
              )
            )}
          </div>
        ) : (
          <div className="workspace-empty">
            <strong>
              No Fourier data
            </strong>

            <span>
              Run a WAV analysis to populate
              the SAGE DSP Fourier engine.
            </span>
          </div>
        )}
      </div>

      <div className="workspace-panel">
        <div className="panel-header">
          <div>
            <span className="panel-kicker">
              DSP ENGINE
            </span>

            <h3>
              Fourier Processing Status
            </h3>
          </div>

          <Activity size={18} />
        </div>

        <div className="dsp-status-grid">
          <div>
            <Radio size={16} />
            <span>
              BLOCK PROCESSING
            </span>
            <strong>
              ENABLED
            </strong>
          </div>

          <div>
            <Zap size={16} />
            <span>
              FFT TRANSFORM
            </span>
            <strong>
              ACTIVE
            </strong>
          </div>

          <div>
            <Activity size={16} />
            <span>
              ANALYSIS BLOCKS
            </span>
            <strong>
              {times.length}
            </strong>
          </div>
        </div>
      </div>
    </section>
  );
}