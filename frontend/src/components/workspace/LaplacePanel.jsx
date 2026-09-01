import {
  Activity,
  FlaskConical,
  Radio,
  Waves,
} from "lucide-react";

function formatHz(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "—";
  }

  const absolute = Math.abs(number);

  if (absolute >= 1_000_000) {
    return `${(
      number / 1_000_000
    ).toFixed(2)} MHz`;
  }

  if (absolute >= 1_000) {
    return `${(
      number / 1_000
    ).toFixed(2)} kHz`;
  }

  return `${number.toFixed(1)} Hz`;
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

function getMagnitude(
  laplace,
  row,
  column
) {
  const values =
    laplace?.magnitude_db;

  if (
    !Array.isArray(values) ||
    !Array.isArray(values[row])
  ) {
    return 0;
  }

  const value = Number(
    values[row][column]
  );

  return Number.isFinite(value)
    ? value
    : 0;
}

export default function LaplacePanel({
  laplace = null,
}) {
  const sigma =
    Array.isArray(laplace?.sigma)
      ? laplace.sigma
      : [];

  const frequencies =
    Array.isArray(
      laplace?.frequencies_hz
    )
      ? laplace.frequencies_hz
      : [];

  const peak =
    laplace?.peak || null;

  const hasData =
    sigma.length > 0 &&
    frequencies.length > 0;

  const columns = Math.min(
    frequencies.length,
    64
  );

  const rows = Math.min(
    sigma.length,
    16
  );

  return (
    <section className="workspace-content dsp-laplace-view">
      <div className="workspace-panel dsp-hero-panel">
        <div className="panel-header">
          <div>
            <span className="panel-kicker">
              SAGE DSP / COMPLEX DOMAIN
            </span>

            <h3>
              Laplace Domain Analysis
            </h3>

            <p className="panel-description">
              Complex-domain analysis across
              sigma and frequency.
            </p>
          </div>

          <FlaskConical size={19} />
        </div>

        <div className="dsp-metric-grid">
          <Metric
            label="SIGMA POINTS"
            value={sigma.length}
          />

          <Metric
            label="FREQUENCY POINTS"
            value={frequencies.length}
          />

          <Metric
            label="SIGMA RANGE"
            value={
              sigma.length
                ? `${sigma[0]} → ${
                    sigma[sigma.length - 1]
                  }`
                : "—"
            }
          />

          <Metric
            label="FREQUENCY RANGE"
            value={
              frequencies.length
                ? `${formatHz(
                    frequencies[0]
                  )} → ${formatHz(
                    frequencies[
                      frequencies.length - 1
                    ]
                  )}`
                : "—"
            }
          />

          <Metric
            label="PEAK SIGMA"
            value={
              peak?.sigma ?? "—"
            }
          />

          <Metric
            label="PEAK FREQUENCY"
            value={formatHz(
              peak?.frequency_hz
            )}
          />
        </div>
      </div>

      <div className="workspace-panel">
        <div className="panel-header">
          <div>
            <span className="panel-kicker">
              COMPLEX TRANSFORM
            </span>

            <h3>
              Sigma / Frequency Map
            </h3>
          </div>

          <Waves size={18} />
        </div>

        {hasData ? (
          <div
            className="laplace-grid"
            style={{
              gridTemplateColumns: `repeat(${columns}, 1fr)`,
            }}
          >
            {Array.from({
              length: rows,
            }).map((_, row) =>
              Array.from({
                length: columns,
              }).map((__, column) => {
                const value =
                  getMagnitude(
                    laplace,
                    row,
                    column
                  );

                const normalized =
                  Math.max(
                    0,
                    Math.min(
                      1,
                      (value + 100) /
                        100
                    )
                  );

                return (
                  <div
                    key={`${row}-${column}`}
                    className="laplace-cell"
                    style={{
                      opacity:
                        0.15 +
                        normalized *
                          0.85,
                    }}
                    title={`σ ${
                      sigma[row]
                    } · ${formatHz(
                      frequencies[
                        column
                      ]
                    )} · ${value.toFixed(
                      1
                    )} dB`}
                  />
                );
              })
            )}
          </div>
        ) : (
          <div className="workspace-empty">
            <strong>
              No Laplace data
            </strong>

            <span>
              Run a WAV analysis to populate
              the SAGE DSP Laplace engine.
            </span>
          </div>
        )}
      </div>

      <div className="workspace-panel">
        <div className="panel-header">
          <div>
            <span className="panel-kicker">
              TRANSFORM PEAK
            </span>

            <h3>
              Dominant Complex Component
            </h3>
          </div>

          <Activity size={18} />
        </div>

        <div className="dsp-status-grid">
          <div>
            <Radio size={16} />
            <span>SIGMA</span>
            <strong>
              {peak?.sigma ?? "—"}
            </strong>
          </div>

          <div>
            <Waves size={16} />
            <span>FREQUENCY</span>
            <strong>
              {formatHz(
                peak?.frequency_hz
              )}
            </strong>
          </div>

          <div>
            <FlaskConical size={16} />
            <span>MAGNITUDE</span>
            <strong>
              {peak?.magnitude_db != null
                ? `${Number(
                    peak.magnitude_db
                  ).toFixed(2)} dB`
                : "—"}
            </strong>
          </div>
        </div>
      </div>
    </section>
  );
}