import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  ChevronRight,
  Clock3,
  Database,
  Download,
  FileAudio,
  FlaskConical,
  FolderOpen,
  Home,
  Info,
  Pause,
  Play,
  Radio,
  Repeat,
  RotateCcw,
  Settings2,
  Signal,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Square,
  Upload,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";

import SpectrumPanel from "../spectrum/SpectrumPanel";
import WaterfallPanel from "../waterfall/WaterfallPanel";
import MultiSignalTimeline from "../waveform/MultiSignalTimeline";

function Workspace({
  result = null,
  audioUrl = "",
  audioRef,
  waveformSamples = [],
  audioDuration = 0,
  onUpload,
  isPlaying = false,
  onPlayPause,
  onStop,
  onHome,
}) {
  /* =========================================================
     STATE
     ========================================================= */

  const [activeTool, setActiveTool] = useState("ANALYSIS");
  const [selectedSignal, setSelectedSignal] = useState(0);

  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [loop, setLoop] = useState(false);

  const [editorZoom, setEditorZoom] = useState(1);
  const [editorOffset, setEditorOffset] = useState(0);

  const [showShortcuts, setShowShortcuts] = useState(false);

  /* =========================================================
     SAFE DATA
     ========================================================= */

  const signals = useMemo(() => {
    const candidates = result?.detections?.candidates;

    return Array.isArray(candidates) ? candidates : [];
  }, [result]);

  const samples = useMemo(() => {
    if (Array.isArray(waveformSamples) && waveformSamples.length > 0) {
      return waveformSamples;
    }

    if (Array.isArray(result?.samples)) {
      return result.samples;
    }

    return [];
  }, [waveformSamples, result]);

  const duration = useMemo(() => {
    const audioValue = Number(audioDuration);

    if (Number.isFinite(audioValue) && audioValue > 0) {
      return audioValue;
    }

    const resultDuration = Number(
      result?.metadata?.duration_seconds
    );

    if (
      Number.isFinite(resultDuration) &&
      resultDuration > 0
    ) {
      return resultDuration;
    }

    return 0;
  }, [audioDuration, result]);

  const selectedCandidate =
    signals[selectedSignal] || null;

  /* =========================================================
     KEEP SELECTED SIGNAL VALID
     ========================================================= */

  useEffect(() => {
    if (signals.length === 0) {
      setSelectedSignal(0);
      return;
    }

    if (selectedSignal >= signals.length) {
      setSelectedSignal(0);
    }
  }, [signals.length, selectedSignal]);

  /* =========================================================
     WAVEFORM DATA
     ========================================================= */

  const waveformPoints = useMemo(() => {
    if (!samples.length) {
      return [];
    }

    const pointCount = 220;

    if (samples.length <= pointCount) {
      const rawPoints = samples.map((value) =>
        Math.abs(Number(value) || 0)
      );

      const maxValue = Math.max(
        ...rawPoints,
        1
      );

      return rawPoints.map(
        (value) => value / maxValue
      );
    }

    const points = [];
    const samplesPerPoint =
      samples.length / pointCount;

    for (
      let index = 0;
      index < pointCount;
      index += 1
    ) {
      const start = Math.floor(
        index * samplesPerPoint
      );

      const end = Math.min(
        samples.length,
        Math.max(
          start + 1,
          Math.floor(
            (index + 1) * samplesPerPoint
          )
        )
      );

      let peak = 0;

      for (
        let sampleIndex = start;
        sampleIndex < end;
        sampleIndex += 1
      ) {
        const value = Math.abs(
          Number(samples[sampleIndex]) || 0
        );

        peak = Math.max(peak, value);
      }

      points.push(peak);
    }

    const maxPeak = Math.max(
      ...points,
      1
    );

    return points.map(
      (value) => value / maxPeak
    );
  }, [samples]);

  /* =========================================================
     AUDIO EVENTS
     ========================================================= */

  useEffect(() => {
    const audio = audioRef?.current;

    if (!audio) {
      return undefined;
    }

    const updateTime = () => {
      const time = Number(audio.currentTime);

      setCurrentTime(
        Number.isFinite(time) && time >= 0
          ? time
          : 0
      );
    };

    const handleLoadedMetadata = () => {
      updateTime();
    };

    const handleDurationChange = () => {
      updateTime();
    };

    const handleEnded = () => {
      if (!audio.loop) {
        setCurrentTime(0);
      }
    };

    audio.addEventListener(
      "timeupdate",
      updateTime
    );

    audio.addEventListener(
      "loadedmetadata",
      handleLoadedMetadata
    );

    audio.addEventListener(
      "durationchange",
      handleDurationChange
    );

    audio.addEventListener(
      "ended",
      handleEnded
    );

    updateTime();

    return () => {
      audio.removeEventListener(
        "timeupdate",
        updateTime
      );

      audio.removeEventListener(
        "loadedmetadata",
        handleLoadedMetadata
      );

      audio.removeEventListener(
        "durationchange",
        handleDurationChange
      );

      audio.removeEventListener(
        "ended",
        handleEnded
      );
    };
  }, [audioRef, audioUrl]);

  /* =========================================================
     AUDIO SETTINGS
     ========================================================= */

  useEffect(() => {
    const audio = audioRef?.current;

    if (!audio) {
      return;
    }

    audio.volume = muted
      ? 0
      : Math.min(1, Math.max(0, volume));

    audio.playbackRate = playbackRate;
    audio.loop = loop;
  }, [
    audioRef,
    volume,
    muted,
    playbackRate,
    loop,
  ]);

  /* =========================================================
     HELPERS
     ========================================================= */

  function formatTime(seconds) {
    const numericValue = Number(seconds);

    if (
      !Number.isFinite(numericValue) ||
      numericValue < 0
    ) {
      return "00:00.000";
    }

    const value = Math.max(
      0,
      numericValue
    );

    const minutes = Math.floor(
      value / 60
    );

    const secs = Math.floor(
      value % 60
    );

    const millis = Math.floor(
      (value % 1) * 1000
    );

    return `${String(minutes).padStart(
      2,
      "0"
    )}:${String(secs).padStart(
      2,
      "0"
    )}.${String(millis).padStart(
      3,
      "0"
    )}`;
  }

  function formatShortTime(seconds) {
    const numericValue = Number(seconds);

    if (
      !Number.isFinite(numericValue) ||
      numericValue < 0
    ) {
      return "00:00";
    }

    const minutes = Math.floor(
      numericValue / 60
    );

    const secs = Math.floor(
      numericValue % 60
    );

    return `${String(minutes).padStart(
      2,
      "0"
    )}:${String(secs).padStart(
      2,
      "0"
    )}`;
  }

  function formatHz(value) {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
      return "—";
    }

    const abs = Math.abs(numericValue);

    if (abs >= 1_000_000) {
      return `${(
        numericValue / 1_000_000
      ).toFixed(2)} MHz`;
    }

    if (abs >= 1_000) {
      return `${(
        numericValue / 1_000
      ).toFixed(2)} kHz`;
    }

    return `${numericValue.toFixed(1)} Hz`;
  }

  function formatNumber(value) {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
      return "—";
    }

    return numericValue.toLocaleString();
  }

  function formatConfidence(value) {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
      return "—";
    }

    const percentage =
      numericValue <= 1
        ? numericValue * 100
        : numericValue;

    return `${Math.max(
      0,
      Math.min(100, percentage)
    ).toFixed(1)}%`;
  }

  /* =========================================================
     PLAYBACK
     ========================================================= */

  function seekBy(amount) {
    const audio = audioRef?.current;

    if (!audio) {
      return;
    }

    const audioDurationValue =
      Number(audio.duration);

    const maxDuration =
      Number.isFinite(
        audioDurationValue
      ) && audioDurationValue > 0
        ? audioDurationValue
        : duration;

    const current =
      Number(audio.currentTime) || 0;

    const next = Math.max(
      0,
      Math.min(
        maxDuration || 0,
        current + amount
      )
    );

    try {
      audio.currentTime = next;
    } catch {
      // Browser may reject seeking before metadata loads.
    }

    setCurrentTime(next);
  }

  function seekTo(value) {
    const audio = audioRef?.current;

    if (!audio) {
      return;
    }

    const requested = Number(value);

    if (!Number.isFinite(requested)) {
      return;
    }

    const audioDurationValue =
      Number(audio.duration);

    const maxDuration =
      Number.isFinite(
        audioDurationValue
      ) && audioDurationValue > 0
        ? audioDurationValue
        : duration;

    const next = Math.max(
      0,
      Math.min(
        requested,
        maxDuration || requested
      )
    );

    try {
      audio.currentTime = next;
    } catch {
      // Ignore browser seek errors.
    }

    setCurrentTime(next);
  }

  function stopPlayback() {
    const audio = audioRef?.current;

    if (audio) {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {
        // Ignore media reset errors.
      }
    }

    setCurrentTime(0);

    if (typeof onStop === "function") {
      onStop();
    }
  }

  function handlePlayPause() {
    if (typeof onPlayPause === "function") {
      onPlayPause();
    }
  }

  /* =========================================================
     HOME
     ========================================================= */

  function goHome() {
    if (typeof onHome === "function") {
      onHome();
      return;
    }

    window.location.reload();
  }

  /* =========================================================
     EXPORT
     ========================================================= */

  function exportAnalysis() {
    try {
      const payload = {
        application: "SAGE-RF",
        version: "1.0",
        exported_at: new Date().toISOString(),

        filename:
          result?.filename ||
          "sage-rf-analysis",

        metadata:
          result?.metadata || {},

        spectrum:
          result?.spectrum || {},

        modulation:
          result?.modulation || {},

        detections:
          result?.detections || {},

        diagnostics:
          result?.diagnostics || {},
      };

      const json = JSON.stringify(
        payload,
        null,
        2
      );

      const blob = new Blob(
        [json],
        {
          type: "application/json",
        }
      );

      const url =
        URL.createObjectURL(blob);

      const anchor =
        document.createElement("a");

      anchor.href = url;

      anchor.download =
        `${sanitizeFilename(
          result?.filename ||
            "sage-rf-analysis"
        )}-analysis.json`;

      document.body.appendChild(anchor);

      anchor.click();

      document.body.removeChild(anchor);

      window.setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 100);
    } catch (error) {
      console.error(
        "SAGE-RF export failed:",
        error
      );
    }
  }

  /* =========================================================
     KEYBOARD SHORTCUTS
     ========================================================= */

  useEffect(() => {
    const handleKeyboard = (event) => {
      const target = event.target;

      const isTyping =
        target instanceof
          HTMLInputElement ||
        target instanceof
          HTMLSelectElement ||
        target instanceof
          HTMLTextAreaElement ||
        target?.isContentEditable;

      if (isTyping) {
        return;
      }

      if (
        event.code === "Space"
      ) {
        event.preventDefault();
        handlePlayPause();
        return;
      }

      if (
        event.code === "ArrowLeft"
      ) {
        event.preventDefault();
        seekBy(-5);
        return;
      }

      if (
        event.code === "ArrowRight"
      ) {
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

        const audio =
          audioRef?.current;

        const audioDurationValue =
          Number(audio?.duration);

        if (
          Number.isFinite(
            audioDurationValue
          ) &&
          audioDurationValue > 0
        ) {
          seekTo(audioDurationValue);
        } else if (duration > 0) {
          seekTo(duration);
        }

        return;
      }

      if (event.key === "?") {
        event.preventDefault();

        setShowShortcuts(
          (value) => !value
        );

        return;
      }

      if (event.key === "1") {
        setActiveTool("ANALYSIS");
        return;
      }

      if (event.key === "2") {
        setActiveTool("EDITOR");
        return;
      }

      if (event.key === "3") {
        setActiveTool("MIXER");
        return;
      }

      if (event.key === "4") {
        setActiveTool("SIGNAL LAB");
        return;
      }

      if (event.key === "5") {
        setActiveTool("PROJECTS");
        return;
      }

      if (event.key === "6") {
        setActiveTool("SETTINGS");
      }
    };

    window.addEventListener(
      "keydown",
      handleKeyboard
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyboard
      );
    };
  }, [
    onPlayPause,
    audioRef,
    duration,
  ]);

  /* =========================================================
     TOOLS
     ========================================================= */

  const tools = [
    {
      id: "ANALYSIS",
      label: "Analysis",
      short: "ANALYSIS",
      icon: BarChart3,
      description:
        "Spectrum, waterfall and signal intelligence",
    },
    {
      id: "EDITOR",
      label: "Editor",
      short: "EDITOR",
      icon: SlidersHorizontal,
      description:
        "Inspect and navigate the recording waveform",
    },
    {
      id: "MIXER",
      label: "Mixer",
      short: "MIXER",
      icon: Radio,
      description:
        "Monitor detected signal channels",
    },
    {
      id: "SIGNAL LAB",
      label: "Signal Lab",
      short: "SIGNAL LAB",
      icon: FlaskConical,
      description:
        "Inspect modulation and DSP evidence",
    },
    {
      id: "PROJECTS",
      label: "Project",
      short: "PROJECTS",
      icon: FolderOpen,
      description:
        "Current capture and analysis summary",
    },
    {
      id: "SETTINGS",
      label: "Settings",
      short: "SETTINGS",
      icon: Settings2,
      description:
        "Workspace and application information",
    },
  ];

  const activeToolInfo =
    tools.find(
      (tool) =>
        tool.id === activeTool
    ) || tools[0];

  const playbackPercentage =
    duration > 0
      ? Math.min(
          100,
          Math.max(
            0,
            (currentTime / duration) *
              100
          )
        )
      : 0;

  const sampleCount =
    result?.metadata?.sample_count ??
    samples.length ??
    0;

  /* =========================================================
     RENDER
     ========================================================= */

  return (
    <div className="workspace">
      {/* =====================================================
          AUDIO ENGINE
          ===================================================== */}

      <audio
        ref={audioRef}
        src={audioUrl || undefined}
        preload="metadata"
        onEnded={() => {
          if (
            typeof onStop ===
            "function"
          ) {
            onStop();
          }
        }}
      />

      {/* =====================================================
          TOP BAR
          ===================================================== */}

      <header className="workspace-topbar">
        <button
          type="button"
          className="workspace-brand"
          onClick={goHome}
          title="Return to SAGE-RF home"
          aria-label="Return to SAGE-RF home"
        >
          <div className="brand-mark">
            <Activity size={18} />
          </div>

          <div className="workspace-brand-text">
            <strong>SAGE-RF</strong>

            <span>
              RF SIGNAL WORKSTATION
            </span>
          </div>
        </button>

        <div className="workspace-project">
          <span>ACTIVE PROJECT</span>

          <strong
            title={
              result?.filename ||
              "Untitled Capture"
            }
          >
            {result?.filename ||
              "Untitled Capture"}
          </strong>
        </div>

        <div
          className="workspace-engine"
          title="Digital signal processing engine"
        >
          <span className="status-dot" />
          <span>DSP ENGINE ONLINE</span>
        </div>

        <div className="workspace-top-actions">
          <button
            type="button"
            className="workspace-icon-button"
            onClick={() =>
              setShowShortcuts(
                (value) => !value
              )
            }
            title="Keyboard shortcuts"
            aria-label="Keyboard shortcuts"
          >
            <Info size={16} />
          </button>

          <button
            type="button"
            className="workspace-home-button"
            onClick={goHome}
            title="Return to SAGE-RF home"
          >
            <Home size={16} />
            <span>HOME</span>
          </button>
        </div>
      </header>

      {/* =====================================================
          SHORTCUT OVERLAY
          ===================================================== */}

      {showShortcuts && (
        <div
          className="workspace-shortcuts"
          role="dialog"
          aria-modal="true"
          aria-label="Keyboard shortcuts"
          onClick={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setShowShortcuts(false);
            }
          }}
        >
          <div className="workspace-shortcuts-card">
            <div className="panel-header">
              <div>
                <span className="panel-kicker">
                  SAGE-RF
                </span>

                <h3>
                  Keyboard Shortcuts
                </h3>
              </div>

              <button
                type="button"
                className="control-button"
                onClick={() =>
                  setShowShortcuts(false)
                }
                aria-label="Close shortcuts"
              >
                ×
              </button>
            </div>

            <div className="shortcut-grid">
              <Shortcut
                keyName="Space"
                label="Play / Pause"
              />

              <Shortcut
                keyName="← / →"
                label="Seek 5 seconds"
              />

              <Shortcut
                keyName="Home"
                label="Go to start"
              />

              <Shortcut
                keyName="End"
                label="Go to end"
              />

              <Shortcut
                keyName="1"
                label="Analysis"
              />

              <Shortcut
                keyName="2"
                label="Editor"
              />

              <Shortcut
                keyName="3"
                label="Mixer"
              />

              <Shortcut
                keyName="4"
                label="Signal Lab"
              />

              <Shortcut
                keyName="5"
                label="Projects"
              />

              <Shortcut
                keyName="6"
                label="Settings"
              />

              <Shortcut
                keyName="?"
                label="Toggle shortcuts"
              />
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
          MAIN LAYOUT
          ===================================================== */}

      <div className="workspace-layout">
        {/* ===================================================
            SIDEBAR
            =================================================== */}

        <aside className="workspace-sidebar">
          <div className="workspace-sidebar-actions">
            <button
              type="button"
              className="sidebar-button primary"
              onClick={onUpload}
            >
              <Upload size={16} />
              <span>IMPORT SIGNAL</span>
            </button>

            <button
              type="button"
              className="sidebar-button"
              onClick={() =>
                setActiveTool("PROJECTS")
              }
            >
              <FolderOpen size={16} />
              <span>PROJECTS</span>
            </button>
          </div>

          <div className="workspace-sidebar-divider" />

          {/* WORKSPACE NAVIGATION */}

          <div className="sidebar-section">
            <span className="sidebar-section-title">
              WORKSPACE
            </span>

            <nav
              className="workspace-tool-nav"
              aria-label="Workspace navigation"
            >
              {tools.map((tool) => {
                const Icon = tool.icon;

                const active =
                  activeTool ===
                  tool.id;

                return (
                  <button
                    type="button"
                    key={tool.id}
                    className={
                      active
                        ? "sidebar-tool active"
                        : "sidebar-tool"
                    }
                    onClick={() =>
                      setActiveTool(
                        tool.id
                      )
                    }
                    title={
                      tool.description
                    }
                    aria-current={
                      active
                        ? "page"
                        : undefined
                    }
                  >
                    <Icon size={14} />

                    <span>
                      {tool.short}
                    </span>

                    {active && (
                      <ChevronRight
                        size={13}
                        className="sidebar-tool-arrow"
                      />
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* DETECTED SIGNALS */}

          <div className="sidebar-section detected-signals-section">
            <div className="sidebar-section-heading">
              <span className="sidebar-section-title">
                DETECTED SIGNALS
              </span>

              {signals.length > 0 && (
                <span className="signal-count">
                  {signals.length}
                </span>
              )}
            </div>

            {signals.length > 0 ? (
              <div className="signal-list">
                {signals.map(
                  (
                    signal,
                    index
                  ) => {
                    const active =
                      selectedSignal ===
                      index;

                    return (
                      <button
                        type="button"
                        key={`${signal?.center_frequency_hz ?? "signal"}-${index}`}
                        className={
                          active
                            ? "signal-list-item active"
                            : "signal-list-item"
                        }
                        onClick={() =>
                          setSelectedSignal(
                            index
                          )
                        }
                        title={`Select Signal ${String(
                          index + 1
                        ).padStart(
                          2,
                          "0"
                        )}`}
                        aria-pressed={
                          active
                        }
                      >
                        <i />

                        <div>
                          <strong>
                            SIGNAL{" "}
                            {String(
                              index + 1
                            ).padStart(
                              2,
                              "0"
                            )}
                          </strong>

                          <span>
                            {signal
                              ?.modulation ||
                              "Unknown"}

                            {" · "}

                            {formatHz(
                              signal?.center_frequency_hz
                            )}
                          </span>
                        </div>
                      </button>
                    );
                  }
                )}
              </div>
            ) : (
              <div className="sidebar-empty">
                No signals detected
              </div>
            )}
          </div>

          {/* ENGINE STATUS */}

          <div className="workspace-sidebar-footer">
            <div>
              <span>ENGINE</span>
              <strong>GNU RADIO</strong>
            </div>

            <div>
              <span>PROCESSING</span>
              <strong>SCIPY DSP</strong>
            </div>

            <div>
              <span>STATUS</span>
              <strong className="online-text">
                ONLINE
              </strong>
            </div>
          </div>
        </aside>

        {/* ===================================================
            MAIN CONTENT
            =================================================== */}

        <main className="workspace-main">
          {/* =================================================
              TRANSPORT BAR
              ================================================= */}

          <section
            className="workspace-toolbar professional-transport"
            aria-label="Audio transport controls"
          >
            <div className="transport transport-main">
              <button
                type="button"
                className="transport-button"
                onClick={() =>
                  seekBy(-5)
                }
                title="Back 5 seconds"
                aria-label="Back 5 seconds"
              >
                <SkipBack size={17} />
              </button>

              <button
                type="button"
                className="transport-play"
                onClick={
                  handlePlayPause
                }
                title={
                  isPlaying
                    ? "Pause"
                    : "Play"
                }
                aria-label={
                  isPlaying
                    ? "Pause"
                    : "Play"
                }
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
                onClick={
                  stopPlayback
                }
                title="Stop"
                aria-label="Stop"
              >
                <Square size={15} />
              </button>

              <button
                type="button"
                className="transport-button"
                onClick={() =>
                  seekBy(5)
                }
                title="Forward 5 seconds"
                aria-label="Forward 5 seconds"
              >
                <SkipForward size={17} />
              </button>

              <div className="transport-time professional-time">
                <strong>
                  {formatTime(
                    currentTime
                  )}
                </strong>

                <span>
                  / {formatTime(duration)}
                </span>
              </div>
            </div>

            <div className="transport-seek">
              <div className="seek-track">
                <div
                  className="seek-fill"
                  style={{
                    width: `${playbackPercentage}%`,
                  }}
                />

                <input
                  type="range"
                  min="0"
                  max={duration || 0}
                  step="0.001"
                  value={Math.min(
                    currentTime,
                    duration || 0
                  )}
                  onChange={(event) =>
                    seekTo(
                      event.target.value
                    )
                  }
                  aria-label="Seek recording"
                  disabled={
                    duration <= 0
                  }
                />
              </div>
            </div>

            <div className="transport-controls">
              <button
                type="button"
                className={
                  muted
                    ? "control-button active"
                    : "control-button"
                }
                onClick={() =>
                  setMuted(
                    (value) =>
                      !value
                  )
                }
                title={
                  muted
                    ? "Unmute"
                    : "Mute"
                }
                aria-label={
                  muted
                    ? "Unmute"
                    : "Mute"
                }
                aria-pressed={muted}
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
                  value={
                    muted
                      ? 0
                      : volume
                  }
                  onChange={(
                    event
                  ) => {
                    const value =
                      Number(
                        event.target
                          .value
                      );

                    setVolume(value);

                    setMuted(
                      value === 0
                    );
                  }}
                  aria-label="Volume"
                />
              </div>

              <select
                className="speed-select"
                value={
                  playbackRate
                }
                onChange={(
                  event
                ) =>
                  setPlaybackRate(
                    Number(
                      event.target
                        .value
                    )
                  )
                }
                aria-label="Playback speed"
              >
                <option value="0.5">
                  0.5×
                </option>

                <option value="0.75">
                  0.75×
                </option>

                <option value="1">
                  1×
                </option>

                <option value="1.25">
                  1.25×
                </option>

                <option value="1.5">
                  1.5×
                </option>

                <option value="2">
                  2×
                </option>
              </select>

              <button
                type="button"
                className={
                  loop
                    ? "control-button active"
                    : "control-button"
                }
                onClick={() =>
                  setLoop(
                    (value) =>
                      !value
                  )
                }
                title={
                  loop
                    ? "Disable loop"
                    : "Enable loop"
                }
                aria-label={
                  loop
                    ? "Disable loop"
                    : "Enable loop"
                }
                aria-pressed={loop}
              >
                <Repeat size={16} />
              </button>
            </div>

            <div className="toolbar-actions">
              <button
                type="button"
                onClick={
                  exportAnalysis
                }
                disabled={!result}
                title={
                  result
                    ? "Export analysis JSON"
                    : "Nothing to export"
                }
              >
                <Download size={15} />
                <span>EXPORT</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  setActiveTool(
                    "PROJECTS"
                  )
                }
              >
                SAVE PROJECT
              </button>
            </div>
          </section>

          {/* =================================================
              VIEW HEADER
              ================================================= */}

          <section className="workspace-view-header">
            <div className="workspace-view-title">
              <span className="workspace-view-kicker">
                {activeToolInfo.short}
              </span>

              <h1>
                {activeTool ===
                  "ANALYSIS" &&
                  "Signal Analysis"}

                {activeTool ===
                  "EDITOR" &&
                  "Signal Editor"}

                {activeTool ===
                  "MIXER" &&
                  "Signal Mixer"}

                {activeTool ===
                  "SIGNAL LAB" &&
                  "Signal Laboratory"}

                {activeTool ===
                  "PROJECTS" &&
                  "Project Overview"}

                {activeTool ===
                  "SETTINGS" &&
                  "Workspace Settings"}
              </h1>

              <p>
                {activeToolInfo.description}
              </p>
            </div>

            <div className="workspace-live-state">
              <span className="status-dot" />
              <span>LIVE WORKSPACE</span>
            </div>
          </section>

          {/* =================================================
              ANALYSIS
              ================================================= */}

          {activeTool ===
            "ANALYSIS" && (
            <div className="workspace-content analysis-view">
              <div className="workspace-grid">
                <SpectrumPanel
                  spectrum={
                    result?.spectrum
                  }
                />

                <WaterfallPanel
                  waterfall={
                    result?.waterfall
                  }
                />
              </div>

              <section className="workspace-panel">
                <div className="panel-header">
                  <div>
                    <span className="panel-kicker">
                      SELECTED SIGNAL
                    </span>

                    <h3>
                      Signal Intelligence
                    </h3>
                  </div>

                  <span className="live-badge">
                    <span />
                    ACTIVE
                  </span>
                </div>

                {selectedCandidate ? (
                  <div className="workspace-intelligence-grid">
                    <Metric
                      label="CENTER FREQUENCY"
                      value={formatHz(
                        selectedCandidate?.center_frequency_hz
                      )}
                    />

                    <Metric
                      label="BANDWIDTH"
                      value={formatHz(
                        selectedCandidate?.bandwidth_hz
                      )}
                    />

                    <Metric
                      label="PEAK"
                      value={formatHz(
                        selectedCandidate?.peak_frequency_hz
                      )}
                    />

                    <Metric
                      label="SNR"
                      value={
                        selectedCandidate
                          ?.snr_db != null
                          ? `${Number(
                              selectedCandidate.snr_db
                            ).toFixed(
                              1
                            )} dB`
                          : "—"
                      }
                    />

                    <Metric
                      label="CONFIDENCE"
                      value={formatConfidence(
                        selectedCandidate?.confidence
                      )}
                    />

                    <Metric
                      label="MODULATION"
                      value={
                        selectedCandidate
                          ?.modulation ||
                        "Unknown"
                      }
                    />
                  </div>
                ) : (
                  <EmptyState
                    title="No signal selected"
                    text="Upload and analyse an RF recording, then select a detected signal from the sidebar."
                  />
                )}
              </section>

              <section className="workspace-panel timeline-panel">
                <MultiSignalTimeline />
              </section>
            </div>
          )}

          {/* =================================================
              EDITOR
              ================================================= */}

          {activeTool ===
            "EDITOR" && (
            <section className="workspace-content workspace-editor">
              <div className="workspace-panel editor-main-panel">
                <div className="panel-header">
                  <div>
                    <span className="panel-kicker">
                      WAVEFORM EDITOR
                    </span>

                    <h3>
                      Recording Timeline
                    </h3>
                  </div>

                  <div className="editor-controls">
                    <button
                      type="button"
                      className="control-button"
                      onClick={() =>
                        setEditorZoom(
                          Math.max(
                            0.5,
                            editorZoom -
                              0.25
                          )
                        )
                      }
                      title="Zoom out"
                      aria-label="Zoom out"
                    >
                      −
                    </button>

                    <span>
                      {Math.round(
                        editorZoom *
                          100
                      )}
                      %
                    </span>

                    <button
                      type="button"
                      className="control-button"
                      onClick={() =>
                        setEditorZoom(
                          Math.min(
                            4,
                            editorZoom +
                              0.25
                          )
                        )
                      }
                      title="Zoom in"
                      aria-label="Zoom in"
                    >
                      +
                    </button>

                    <button
                      type="button"
                      className="control-button"
                      onClick={() => {
                        setEditorZoom(1);
                        setEditorOffset(0);
                      }}
                      title="Reset zoom"
                      aria-label="Reset zoom"
                    >
                      <RotateCcw
                        size={14}
                      />
                    </button>
                  </div>
                </div>

                <div className="editor-ruler">
                  <span>00:00</span>

                  <span>
                    {formatShortTime(
                      duration * 0.25
                    )}
                  </span>

                  <span>
                    {formatShortTime(
                      duration * 0.5
                    )}
                  </span>

                  <span>
                    {formatShortTime(
                      duration * 0.75
                    )}
                  </span>

                  <span>
                    {formatShortTime(
                      duration
                    )}
                  </span>
                </div>

                <div
                  className="waveform-editor"
                  onClick={(event) => {
                    if (
                      duration <= 0
                    ) {
                      return;
                    }

                    const rect =
                      event.currentTarget.getBoundingClientRect();

                    const percentage =
                      (event.clientX -
                        rect.left) /
                      rect.width;

                    seekTo(
                      percentage *
                        duration
                    );
                  }}
                  role="slider"
                  aria-label="Waveform position"
                  aria-valuemin={0}
                  aria-valuemax={
                    duration
                  }
                  aria-valuenow={
                    currentTime
                  }
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (
                      event.key ===
                      "ArrowLeft"
                    ) {
                      event.preventDefault();
                      seekBy(-1);
                    }

                    if (
                      event.key ===
                      "ArrowRight"
                    ) {
                      event.preventDefault();
                      seekBy(1);
                    }
                  }}
                >
                  {waveformPoints.length >
                  0 ? (
                    <div
                      className="waveform-editor-inner"
                      style={{
                        transform: `translateX(${editorOffset}px) scaleX(${editorZoom})`,
                      }}
                    >
                      {waveformPoints.map(
                        (
                          amplitude,
                          index
                        ) => (
                          <span
                            key={
                              index
                            }
                            style={{
                              height: `${Math.max(
                                4,
                                Math.min(
                                  100,
                                  amplitude *
                                    100
                                )
                              )}%`,
                            }}
                          />
                        )
                      )}
                    </div>
                  ) : (
                    <EmptyState
                      title="No waveform available"
                      text="The backend did not return decoded waveform samples for this recording."
                    />
                  )}

                  <div
                    className="editor-playhead"
                    style={{
                      left: `${playbackPercentage}%`,
                    }}
                  />
                </div>

                <div className="editor-footer">
                  <Metric
                    label="SAMPLE COUNT"
                    value={formatNumber(
                      sampleCount
                    )}
                  />

                  <Metric
                    label="SAMPLE RATE"
                    value={
                      result?.metadata
                        ?.sample_rate
                        ? `${formatNumber(
                            result
                              .metadata
                              .sample_rate
                          )} Hz`
                        : "—"
                    }
                  />

                  <Metric
                    label="DURATION"
                    value={formatTime(
                      duration
                    )}
                  />
                </div>
              </div>

              <div className="workspace-panel">
                <div className="panel-header">
                  <div>
                    <span className="panel-kicker">
                      EDIT OPERATIONS
                    </span>

                    <h3>
                      Timeline Tools
                    </h3>
                  </div>
                </div>

                <div className="editor-tool-grid">
                  <button
                    type="button"
                    onClick={() =>
                      seekTo(0)
                    }
                  >
                    <SkipBack size={16} />
                    GO TO START
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      seekTo(
                        duration / 2
                      )
                    }
                    disabled={
                      duration <= 0
                    }
                  >
                    <Zap size={16} />
                    CENTER PLAYHEAD
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setEditorOffset(
                        (value) =>
                          value - 20
                      )
                    }
                  >
                    ZOOM LEFT
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setEditorOffset(
                        (value) =>
                          value + 20
                      )
                    }
                  >
                    ZOOM RIGHT
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* =================================================
              MIXER
              ================================================= */}

          {activeTool ===
            "MIXER" && (
            <section className="workspace-content workspace-mixer">
              <div className="workspace-panel">
                <div className="panel-header">
                  <div>
                    <span className="panel-kicker">
                      SIGNAL ROUTING
                    </span>

                    <h3>
                      Multi-Signal Mixer
                    </h3>
                  </div>

                  <span className="live-badge">
                    <span />
                    DSP READY
                  </span>
                </div>

                {signals.length >
                0 ? (
                  <div className="mixer-signal-list">
                    {signals.map(
                      (
                        signal,
                        index
                      ) => {
                        const confidence =
                          Number(
                            signal?.confidence ??
                              0
                          );

                        const confidencePercentage =
                          confidence <= 1
                            ? confidence *
                              100
                            : confidence;

                        return (
                          <div
                            className="mixer-channel"
                            key={`${signal?.center_frequency_hz ?? "channel"}-${index}`}
                          >
                            <div className="mixer-channel-info">
                              <div className="mixer-channel-icon">
                                <Radio
                                  size={
                                    15
                                  }
                                />
                              </div>

                              <div>
                                <strong>
                                  SIGNAL{" "}
                                  {String(
                                    index +
                                      1
                                  ).padStart(
                                    2,
                                    "0"
                                  )}
                                </strong>

                                <span>
                                  {signal
                                    ?.modulation ||
                                    "Unknown"}{" "}
                                  ·{" "}
                                  {formatHz(
                                    signal?.center_frequency_hz
                                  )}
                                </span>
                              </div>
                            </div>

                            <div className="mixer-meter">
                              <span
                                style={{
                                  width: `${Math.min(
                                    100,
                                    Math.max(
                                      5,
                                      confidencePercentage
                                    )
                                  )}%`,
                                }}
                              />
                            </div>

                            <button
                              type="button"
                              className={
                                selectedSignal ===
                                index
                                  ? "control-button active"
                                  : "control-button"
                              }
                              onClick={() =>
                                setSelectedSignal(
                                  index
                                )
                              }
                              title="Select signal"
                              aria-label={`Select signal ${index + 1}`}
                            >
                              <Settings2
                                size={
                                  15
                                }
                              />
                            </button>
                          </div>
                        );
                      }
                    )}
                  </div>
                ) : (
                  <EmptyState
                    title="No detected signals"
                    text="Run signal analysis to populate mixer channels."
                  />
                )}
              </div>

              <div className="workspace-panel mixer-summary">
                <div className="panel-header">
                  <div>
                    <span className="panel-kicker">
                      OUTPUT BUS
                    </span>

                    <h3>
                      Master Signal
                    </h3>
                  </div>
                </div>

                <div className="master-meter">
                  <span />
                </div>

                <div className="master-stats">
                  <Metric
                    label="ACTIVE CHANNELS"
                    value={
                      signals.length
                    }
                  />

                  <Metric
                    label="OUTPUT"
                    value="PCM / WAV"
                  />

                  <Metric
                    label="SAMPLE RATE"
                    value={
                      result?.metadata
                        ?.sample_rate
                        ? `${formatNumber(
                            result
                              .metadata
                              .sample_rate
                          )} Hz`
                        : "—"
                    }
                  />
                </div>
              </div>
            </section>
          )}

          {/* =================================================
              SIGNAL LAB
              ================================================= */}

          {activeTool ===
            "SIGNAL LAB" && (
            <section className="workspace-content signal-lab-grid">
              <div className="workspace-panel">
                <div className="panel-header">
                  <div>
                    <span className="panel-kicker">
                      SIGNAL LABORATORY
                    </span>

                    <h3>
                      Selected Signal
                    </h3>
                  </div>

                  <FlaskConical
                    size={18}
                  />
                </div>

                {selectedCandidate ? (
                  <>
                    <div className="lab-frequency">
                      <span>
                        CENTER FREQUENCY
                      </span>

                      <strong>
                        {formatHz(
                          selectedCandidate?.center_frequency_hz
                        )}
                      </strong>
                    </div>

                    <div className="lab-grid">
                      <Metric
                        label="BANDWIDTH"
                        value={formatHz(
                          selectedCandidate?.bandwidth_hz
                        )}
                      />

                      <Metric
                        label="PEAK"
                        value={formatHz(
                          selectedCandidate?.peak_frequency_hz
                        )}
                      />

                      <Metric
                        label="SNR"
                        value={
                          selectedCandidate
                            ?.snr_db !=
                          null
                            ? `${Number(
                                selectedCandidate.snr_db
                              ).toFixed(
                                2
                              )} dB`
                            : "—"
                        }
                      />

                      <Metric
                        label="MODULATION"
                        value={
                          selectedCandidate
                            ?.modulation ||
                          "Unknown"
                        }
                      />
                    </div>
                  </>
                ) : (
                  <EmptyState
                    title="Select a signal"
                    text="Choose a detected signal from the sidebar to inspect it."
                  />
                )}
              </div>

              <div className="workspace-panel">
                <div className="panel-header">
                  <div>
                    <span className="panel-kicker">
                      CLASSIFICATION
                    </span>

                    <h3>
                      Modulation Evidence
                    </h3>
                  </div>

                  <Signal size={18} />
                </div>

                {result?.modulation ? (
                  <div className="lab-evidence">
                    <div className="lab-classification">
                      <span>
                        PRIMARY
                        CLASSIFICATION
                      </span>

                      <strong>
                        {result
                          ?.modulation
                          ?.modulation ||
                          "Unknown"}
                      </strong>
                    </div>

                    <div className="lab-confidence">
                      <span>
                        CONFIDENCE
                      </span>

                      <strong>
                        {formatConfidence(
                          result
                            ?.modulation
                            ?.confidence
                        )}
                      </strong>
                    </div>

                    <div className="lab-score-list">
                      <Metric
                        label="PSK SCORE"
                        value={formatScore(
                          result
                            ?.modulation
                            ?.evidence
                            ?.psk_score
                        )}
                      />

                      <Metric
                        label="FSK SCORE"
                        value={formatScore(
                          result
                            ?.modulation
                            ?.evidence
                            ?.fsk_score
                        )}
                      />

                      <Metric
                        label="QAM SCORE"
                        value={formatScore(
                          result
                            ?.modulation
                            ?.evidence
                            ?.qam_score
                        )}
                      />

                      <Metric
                        label="AMPLITUDE CV"
                        value={formatScore(
                          result
                            ?.modulation
                            ?.evidence
                            ?.amplitude_cv,
                          4
                        )}
                      />
                    </div>
                  </div>
                ) : (
                  <EmptyState
                    title="No classification evidence"
                    text="Modulation classification data will appear after analysis."
                  />
                )}
              </div>

              <div className="workspace-panel lab-diagnostics">
                <div className="panel-header">
                  <div>
                    <span className="panel-kicker">
                      DIAGNOSTICS
                    </span>

                    <h3>
                      Processing Pipeline
                    </h3>
                  </div>
                </div>

                <div className="diagnostic-chain">
                  <PipelineStep
                    label="INPUT"
                    icon={
                      <FileAudio
                        size={16}
                      />
                    }
                  />

                  <ChevronRight
                    size={15}
                  />

                  <PipelineStep
                    label="DSP"
                    icon={
                      <Activity
                        size={16}
                      />
                    }
                  />

                  <ChevronRight
                    size={15}
                  />

                  <PipelineStep
                    label="DETECTION"
                    icon={
                      <Signal
                        size={16}
                      />
                    }
                  />

                  <ChevronRight
                    size={15}
                  />

                  <PipelineStep
                    label="CLASSIFICATION"
                    icon={
                      <FlaskConical
                        size={16}
                      />
                    }
                  />
                </div>
              </div>
            </section>
          )}

          {/* =================================================
              PROJECTS
              ================================================= */}

          {activeTool ===
            "PROJECTS" && (
            <section className="workspace-content projects-view">
              <div className="workspace-panel project-hero">
                <div className="project-icon">
                  <FileAudio
                    size={24}
                  />
                </div>

                <div className="project-hero-content">
                  <span className="panel-kicker">
                    ACTIVE CAPTURE
                  </span>

                  <h2
                    title={
                      result?.filename ||
                      "Untitled Capture"
                    }
                  >
                    {result?.filename ||
                      "Untitled Capture"}
                  </h2>

                  <p>
                    Current RF recording
                    loaded into the
                    SAGE-RF
                    workstation.
                  </p>
                </div>

                <button
                  type="button"
                  className="workspace-action-primary"
                  onClick={onUpload}
                >
                  <Upload size={15} />
                  <span>
                    IMPORT ANOTHER
                  </span>
                </button>
              </div>

              <div className="project-info-grid">
                <ProjectInfo
                  icon={Database}
                  label="SOURCE FORMAT"
                  value={
                    result?.metadata
                      ?.source_format ||
                    "—"
                  }
                />

                <ProjectInfo
                  icon={Activity}
                  label="SAMPLE RATE"
                  value={
                    result?.metadata
                      ?.sample_rate
                      ? `${formatNumber(
                          result
                            .metadata
                            .sample_rate
                        )} Hz`
                      : "—"
                  }
                />

                <ProjectInfo
                  icon={Clock3}
                  label="DURATION"
                  value={formatTime(
                    duration
                  )}
                />

                <ProjectInfo
                  icon={Signal}
                  label="SIGNALS"
                  value={
                    result?.detections
                      ?.candidate_count ??
                    signals.length
                  }
                />
              </div>

              <div className="workspace-panel">
                <div className="panel-header">
                  <div>
                    <span className="panel-kicker">
                      PROJECT STATUS
                    </span>

                    <h3>
                      Analysis Summary
                    </h3>
                  </div>

                  <span className="live-badge">
                    <span />
                    LOADED
                  </span>
                </div>

                <div className="project-summary">
                  <Metric
                    label="PEAK FREQUENCY"
                    value={formatHz(
                      result?.spectrum
                        ?.peak_frequency_hz
                    )}
                  />

                  <Metric
                    label="OCCUPIED BANDWIDTH"
                    value={formatHz(
                      result?.spectrum
                        ?.occupied_bandwidth_hz
                    )}
                  />

                  <Metric
                    label="SNR"
                    value={
                      result?.spectrum
                        ?.snr_db !=
                      null
                        ? `${Number(
                            result
                              .spectrum
                              .snr_db
                          ).toFixed(
                            1
                          )} dB`
                        : "—"
                    }
                  />

                  <Metric
                    label="CLASSIFICATION"
                    value={
                      result
                        ?.modulation
                        ?.modulation ||
                      "—"
                    }
                  />
                </div>
              </div>
            </section>
          )}

          {/* =================================================
              SETTINGS
              ================================================= */}

          {activeTool ===
            "SETTINGS" && (
            <section className="workspace-content settings-view">
              <div className="workspace-panel">
                <div className="panel-header">
                  <div>
                    <span className="panel-kicker">
                      WORKSPACE
                    </span>

                    <h3>
                      SAGE-RF Configuration
                    </h3>
                  </div>

                  <Settings2
                    size={18}
                  />
                </div>

                <div className="settings-list">
                  <SettingRow
                    label="DSP ENGINE"
                    value="GNU Radio"
                  />

                  <SettingRow
                    label="DSP PROCESSING"
                    value="SciPy"
                  />

                  <SettingRow
                    label="FRONTEND"
                    value="React + Vite"
                  />

                  <SettingRow
                    label="AUDIO OUTPUT"
                    value="Browser Audio Engine"
                  />

                  <SettingRow
                    label="WORKSPACE STATUS"
                    value="ONLINE"
                  />
                </div>
              </div>

              <div className="workspace-panel">
                <div className="panel-header">
                  <div>
                    <span className="panel-kicker">
                      CURRENT RECORDING
                    </span>

                    <h3>
                      Recording Information
                    </h3>
                  </div>
                </div>

                <div className="project-summary">
                  <Metric
                    label="FILE"
                    value={
                      result?.filename ||
                      "No file"
                    }
                  />

                  <Metric
                    label="SAMPLES"
                    value={formatNumber(
                      sampleCount
                    )}
                  />

                  <Metric
                    label="DURATION"
                    value={formatTime(
                      duration
                    )}
                  />

                  <Metric
                    label="SIGNALS"
                    value={
                      signals.length
                    }
                  />
                </div>
              </div>

              <div className="workspace-panel">
                <div className="panel-header">
                  <div>
                    <span className="panel-kicker">
                      HELP
                    </span>

                    <h3>
                      Keyboard Navigation
                    </h3>
                  </div>
                </div>

                <button
                  type="button"
                  className="workspace-action-primary"
                  onClick={() =>
                    setShowShortcuts(
                      true
                    )
                  }
                >
                  <Info size={15} />
                  <span>
                    VIEW SHORTCUTS
                  </span>
                </button>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

/* ===========================================================
   HELPERS
   =========================================================== */

function sanitizeFilename(filename) {
  return String(filename)
    .replace(
      /[^a-zA-Z0-9._-]+/g,
      "_"
    )
    .replace(
      /^_+|_+$/g,
      ""
    )
    .slice(0, 120) || "sage-rf-analysis";
}

function formatScore(
  value,
  decimals = 3
) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return "0.000";
  }

  return numericValue.toFixed(
    decimals
  );
}

/* ===========================================================
   REUSABLE COMPONENTS
   =========================================================== */

function Metric({
  label,
  value,
}) {
  return (
    <div className="workspace-metric">
      <span>{label}</span>

      <strong
        title={String(value)}
      >
        {value}
      </strong>
    </div>
  );
}

function ProjectInfo({
  icon: Icon,
  label,
  value,
}) {
  return (
    <div className="project-info-card">
      <div className="project-info-icon">
        <Icon size={17} />
      </div>

      <div>
        <span>{label}</span>

        <strong
          title={String(value)}
        >
          {value}
        </strong>
      </div>
    </div>
  );
}

function EmptyState({
  title,
  text,
}) {
  return (
    <div className="workspace-empty">
      <strong>{title}</strong>

      <span>{text}</span>
    </div>
  );
}

function Shortcut({
  keyName,
  label,
}) {
  return (
    <div className="shortcut-row">
      <kbd>{keyName}</kbd>

      <span>{label}</span>
    </div>
  );
}

function PipelineStep({
  icon,
  label,
}) {
  return (
    <div className="pipeline-step">
      {icon}

      <span>{label}</span>
    </div>
  );
}

function SettingRow({
  label,
  value,
}) {
  return (
    <div className="setting-row">
      <span>{label}</span>

      <strong>{value}</strong>
    </div>
  );
}

export default Workspace;