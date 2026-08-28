import { useState } from "react";
import {
  Volume2,
  VolumeX,
  Radio,
  SlidersHorizontal,
} from "lucide-react";

function SignalChannel({ signal, index }) {
  const [gain, setGain] = useState(0);
  const [frequencyShift, setFrequencyShift] = useState(0);
  const [muted, setMuted] = useState(false);
  const [solo, setSolo] = useState(false);

  const candidate = signal?.candidate || signal || {};
  const modulation = signal?.modulation || {};

  const frequency =
    candidate.center_frequency_hz ??
    candidate.peak_frequency_hz ??
    0;

  const bandwidth = candidate.bandwidth_hz ?? 0;
  const snr = candidate.snr_db ?? 0;

  const modulationName =
    modulation.modulation ||
    candidate.modulation ||
    "Unknown";

  const confidence =
    modulation.confidence ??
    candidate.modulation_confidence ??
    null;

  return (
    <div className={`mixer-channel ${muted ? "is-muted" : ""}`}>
      <div className="channel-top">
        <div className="channel-number">
          CH {String(index + 1).padStart(2, "0")}
        </div>

        <div className="channel-actions">
          <button
            type="button"
            className={muted ? "active" : ""}
            onClick={() => setMuted((value) => !value)}
            title="Mute"
          >
            {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>

          <button
            type="button"
            className={solo ? "active" : ""}
            onClick={() => setSolo((value) => !value)}
            title="Solo"
          >
            S
          </button>
        </div>
      </div>

      <div className="channel-identity">
        <Radio size={15} />

        <div>
          <strong>{modulationName}</strong>
          <span>
            {(frequency / 1000).toFixed(3)} kHz
          </span>
        </div>
      </div>

      <div className="channel-meter">
        <div className="meter-fill" />
        <div className="meter-fill secondary" />
      </div>

      <label>
        <span>
          GAIN
          <strong>{gain > 0 ? "+" : ""}
            {gain} dB
          </strong>
        </span>

        <input
          type="range"
          min="-30"
          max="30"
          step="1"
          value={gain}
          onChange={(event) =>
            setGain(Number(event.target.value))
          }
        />
      </label>

      <label>
        <span>
          FREQ SHIFT
          <strong>
            {frequencyShift > 0 ? "+" : ""}
            {frequencyShift} Hz
          </strong>
        </span>

        <input
          type="range"
          min="-5000"
          max="5000"
          step="10"
          value={frequencyShift}
          onChange={(event) =>
            setFrequencyShift(
              Number(event.target.value)
            )
          }
        />
      </label>

      <div className="channel-stats">
        <div>
          <span>SNR</span>
          <strong>
            {Number(snr).toFixed(1)} dB
          </strong>
        </div>

        <div>
          <span>BW</span>
          <strong>
            {(Number(bandwidth) / 1000).toFixed(2)} kHz
          </strong>
        </div>

        <div>
          <span>CONF</span>
          <strong>
            {confidence != null
              ? `${(Number(confidence) * 100).toFixed(0)}%`
              : "—"}
          </strong>
        </div>
      </div>
    </div>
  );
}

function SignalMixer({ signals = [] }) {
  return (
    <section className="workspace-panel mixer-panel">
      <div className="panel-header">
        <div>
          <span className="panel-kicker">
            SIGNAL CONTROL
          </span>

          <h2>RF Mixer</h2>
        </div>

        <div className="panel-status">
          <SlidersHorizontal size={15} />
          {signals.length} CHANNELS
        </div>
      </div>

      {signals.length > 0 ? (
        <div className="mixer-console">
          {signals.map((signal, index) => (
            <SignalChannel
              key={index}
              signal={signal}
              index={index}
            />
          ))}
        </div>
      ) : (
        <div className="empty-panel">
          <Radio size={24} />

          <span>
            NO DETECTED SIGNALS
          </span>

          <small>
            Analyze a recording to populate the mixer.
          </small>
        </div>
      )}
    </section>
  );
}

export default SignalMixer;
