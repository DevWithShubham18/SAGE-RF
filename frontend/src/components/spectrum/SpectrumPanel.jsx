import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

function SpectrumPanel({ spectrum }) {
  const frequencies = spectrum?.frequencies || [];
  const powers = spectrum?.power_db || [];

  const data = frequencies.map((frequency, index) => ({
    frequency,
    power: powers[index] ?? null,
  }));

  return (
    <section className="workspace-panel spectrum-panel">
      <div className="panel-header">
        <div>
          <span className="panel-kicker">SPECTRUM ANALYZER</span>
          <h2>Frequency Domain</h2>
        </div>

        <div className="panel-status">
          <span className="status-dot" />
          LIVE ANALYSIS
        </div>
      </div>

      <div className="spectrum-chart">
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient
                  id="spectrumFill"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopOpacity={0.45}
                  />
                  <stop
                    offset="100%"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>

              <CartesianGrid
                strokeDasharray="3 6"
                opacity={0.12}
              />

              <XAxis
                dataKey="frequency"
                tickFormatter={(value) =>
                  `${(value / 1000).toFixed(1)}k`
                }
                tick={{ fontSize: 11 }}
                minTickGap={40}
              />

              <YAxis
                tick={{ fontSize: 11 }}
                width={50}
              />

              <Tooltip
                formatter={(value) => [
                  `${Number(value).toFixed(2)} dB`,
                  "Power",
                ]}
                labelFormatter={(value) =>
                  `${Number(value).toFixed(2)} Hz`
                }
              />

              <Area
                type="monotone"
                dataKey="power"
                strokeWidth={2}
                fill="url(#spectrumFill)"
                dot={false}
                isAnimationActive
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="empty-panel">
            <span>NO SIGNAL DATA</span>
            <small>
              Upload an IQ or WAV recording to begin analysis.
            </small>
          </div>
        )}
      </div>
    </section>
  );
}

export default SpectrumPanel;
