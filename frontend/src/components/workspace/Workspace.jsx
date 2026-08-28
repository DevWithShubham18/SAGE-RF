import { useEffect, useState } from "react";
import {
  Activity,
  Download,
  FolderOpen,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Square,
  Upload,
  Zap,
  Volume2,
  VolumeX,
  RotateCcw,
  Repeat,
} from "lucide-react";

import SpectrumPanel from "../spectrum/SpectrumPanel";
import WaveformPanel from "../waveform/WaveformPanel";
import WaterfallPanel from "../waterfall/WaterfallPanel";
import SignalMixer from "../mixer/SignalMixer";
import MultiSignalTimeline from "../waveform/MultiSignalTimeline";

function Workspace({
  result,
  audioUrl,
  audioRef,
  waveformSamples = [],
  audioDuration = 0,
  onUpload,
  isPlaying = false,
  onPlayPause,
  onStop,
}) {
  const [activeTool, setActiveTool] = useState("ANALYSIS");

  const signals =
    result?.detections?.candidates || [];

  const samples =
    waveformSamples?.length
      ? waveformSamples
      : result?.samples || [];

  const duration =
    audioDuration ||
    result?.metadata?.duration_seconds ||
    0;

  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [loop, setLoop] = useState(false);

  useEffect(() => {
    const audio = audioRef?.current;

    if (!audio) return;

    const updateTime = () => {
      setCurrentTime(audio.currentTime || 0);
    };

    const handleEnded = () => {
      setCurrentTime(0);
    };

    audio.addEventListener("timeupdate", updateTime);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", updateTime);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [audioRef, audioUrl]);

  useEffect(() => {
    const audio = audioRef?.current;

    if (!audio) return;

    audio.volume = muted ? 0 : volume;
    audio.playbackRate = playbackRate;
    audio.loop = loop;
  }, [audioRef, volume, muted, playbackRate, loop]);

  function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return "00:00.000";

    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const millis = Math.floor((seconds % 1) * 1000);

    return `${String(minutes).padStart(2, "0")}:${String(
      secs
    ).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
  }

  function seekBy(amount) {
    const audio = audioRef?.current;

    if (!audio) return;

    const next = Math.max(
      0,
      Math.min(
        Number.isFinite(audio.duration)
          ? audio.duration
          : duration,
        audio.currentTime + amount
      )
    );

    audio.currentTime = next;
    setCurrentTime(next);
  }

  function seekTo(value) {
    const audio = audioRef?.current;

    if (!audio) return;

    const next = Number(value);

    if (!Number.isFinite(next)) return;

    audio.currentTime = next;
    setCurrentTime(next);
  }

  function stopPlayback() {
    const audio = audioRef?.current;

    if (!audio) return;

    audio.pause();
    audio.currentTime = 0;
    setCurrentTime(0);

    if (onStop) {
      onStop();
    }
  }

  useEffect(() => {
    const handleKeyboard = (event) => {
      const target = event.target;

      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();

        if (onPlayPause) {
          onPlayPause();
        }

        return;
      }

      if (event.code === "ArrowLeft") {
        event.preventDefault();
        seekBy(-5);
        return;
      }

      if (event.code === "ArrowRight") {
        event.preventDefault();
        seekBy(5);
        return;
      }

      if (event.code === "Home") {
        event.preventDefault();
        seekTo(0);
        return;
      }

      if (event.code === "End") {
        event.preventDefault();

        const audio = audioRef?.current;

        if (audio && Number.isFinite(audio.duration)) {
          seekTo(audio.duration);
        }
      }
    };

    window.addEventListener("keydown", handleKeyboard);

    return () => {
      window.removeEventListener("keydown", handleKeyboard);
    };
  }, [onPlayPause, audioRef]);

  return (
    <div className="workspace">
      <audio
        ref={audioRef}
        src={audioUrl || undefined}
        preload="metadata"
        onEnded={() => {
          if (onStop) onStop();
        }}
      />

      <header className="workspace-topbar">
        <div className="workspace-brand">
          <div className="brand-mark">
            <Activity size={18} />
          </div>

          <div>
            <strong>SAGE-RF</strong>
            <span>RF SIGNAL WORKSTATION</span>
          </div>
        </div>

        <div className="workspace-project">
          <span>PROJECT</span>
          <strong>
            {result?.filename || "Untitled Capture"}
          </strong>
        </div>

        <div className="workspace-engine">
          <span className="status-dot" />
          DSP ENGINE ONLINE
        </div>
      </header>

      <div className="workspace-layout">
        <aside className="workspace-sidebar">
          <button
            type="button"
            className="sidebar-button primary"
            onClick={onUpload}
          >
            <Upload size={16} />
            IMPORT SIGNAL
          </button>

          <button type="button" className="sidebar-button">
            <FolderOpen size={16} />
            PROJECTS
          </button>

          <div className="sidebar-section">
            <span>WORKSPACE</span>

            {[
              "ANALYSIS",
              "EDITOR",
              "MIXER",
              "SIGNAL LAB",
            ].map((tool) => (
              <button
                type="button"
                key={tool}
                className={
                  activeTool === tool
                    ? "sidebar-tool active"
                    : "sidebar-tool"
                }
                onClick={() => setActiveTool(tool)}
              >
                <Zap size={13} />
                {tool}
              </button>
            ))}
          </div>

          <div className="sidebar-section">
            <span>SIGNALS</span>

            {signals.length > 0 ? (
              signals.map((signal, index) => (
                <div
                  className="signal-list-item"
                  key={index}
                >
                  <i />
                  <div>
                    <strong>
                      SIGNAL {String(index + 1).padStart(2, "0")}
                    </strong>

                    <span>
                      {signal.modulation ||
                        "Unknown"}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <small className="sidebar-empty">
                No signals detected
              </small>
            )}
          </div>
        </aside>

        <main className="workspace-main">
          <div className="workspace-toolbar professional-transport">
            <div className="transport transport-main">
              <button
                type="button"
                className="transport-button"
                onClick={() => seekBy(-5)}
                title="Back 5 seconds"
              >
                <SkipBack size={17} />
              </button>

              <button
                type="button"
                className="transport-play"
                onClick={onPlayPause}
                title={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? (
                  <Pause size={19} />
                ) : (
                  <Play size={19} />
                )}
              </button>

              <button
                type="button"
                className="transport-button stop-button"
                onClick={stopPlayback}
                title="Stop and return to beginning"
              >
                <Square size={15} />
              </button>

              <button
                type="button"
                className="transport-button"
                onClick={() => seekBy(5)}
                title="Forward 5 seconds"
              >
                <SkipForward size={17} />
              </button>

              <div className="transport-time professional-time">
                <strong>{formatTime(currentTime)}</strong>
                <span>/ {formatTime(duration)}</span>
              </div>
            </div>

            <div className="transport-seek">
              <div className="seek-track">
                <div
                  className="seek-fill"
                  style={{
                    width: `${
                      duration > 0
                        ? Math.min(
                            100,
                            (currentTime / duration) * 100
                          )
                        : 0
                    }%`,
                  }}
                />

                <input
                  type="range"
                  min="0"
                  max={duration || 0}
                  step="0.001"
                  value={Math.min(currentTime, duration || 0)}
                  onChange={(event) =>
                    seekTo(event.target.value)
                  }
                  aria-label="Seek through recording"
                />
              </div>
            </div>

            <div className="transport-controls">
              <button
                type="button"
                className={muted ? "control-button active" : "control-button"}
                onClick={() => setMuted((value) => !value)}
                title={muted ? "Unmute" : "Mute"}
              >
                {muted ? (
                  <VolumeX size={16} />
                ) : (
                  <Volume2 size={16} />
                )}
              </button>

              <div className="volume-control">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={muted ? 0 : volume}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setVolume(value);
                    setMuted(value === 0);
                  }}
                  aria-label="Volume"
                />
              </div>

              <select
                className="speed-select"
                value={playbackRate}
                onChange={(event) =>
                  setPlaybackRate(Number(event.target.value))
                }
                aria-label="Playback speed"
              >
                <option value="0.5">0.5×</option>
                <option value="0.75">0.75×</option>
                <option value="1">1×</option>
                <option value="1.25">1.25×</option>
                <option value="1.5">1.5×</option>
                <option value="2">2×</option>
              </select>

              <button
                type="button"
                className={loop ? "control-button active" : "control-button"}
                onClick={() => setLoop((value) => !value)}
                title={loop ? "Disable loop" : "Enable loop"}
              >
                <Repeat size={16} />
              </button>
            </div>

            <div className="toolbar-actions">
              <button type="button">
                <Download size={15} />
                EXPORT
              </button>

              <button type="button">
                SAVE PROJECT
              </button>
            </div>
          </div>

          <div className="workspace-grid">
            <SpectrumPanel
              spectrum={result?.spectrum}
            />

            <WaterfallPanel
              waterfall={result?.waterfall}
            />
          </div>

          <MultiSignalTimeline />
        </main>
      </div>
    </div>
  );
}

export default Workspace;
