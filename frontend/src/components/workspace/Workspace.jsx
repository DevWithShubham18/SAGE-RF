import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { auth } from "../../firebase/firebase";

import {
  Activity,
  BarChart3,
  ChevronRight,
  Clock3,
  Cpu,
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
  Waves,
} from "lucide-react";

import SpectrumPanel from "../spectrum/SpectrumPanel";
import WaterfallPanel from "../waterfall/WaterfallPanel";
import MultiSignalTimeline from "../waveform/MultiSignalTimeline";


/* ============================================================
   WORKSPACE
   ============================================================ */

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

  const localAudioRef = useRef(null);

  /* ==========================================================
     AUDIO
     ========================================================== */

  const getAudioElement = useCallback(() => {
    return audioRef?.current || localAudioRef.current || null;
  }, [audioRef]);

  const audio = getAudioElement();

  /* ==========================================================
     SAFE DATA
     ========================================================== */

  const signals = useMemo(() => {
    const candidates = result?.detections?.candidates;

    return Array.isArray(candidates)
      ? candidates
      : [];
  }, [result]);

  const samples = useMemo(() => {
    if (
      Array.isArray(waveformSamples) &&
      waveformSamples.length
    ) {
      return waveformSamples;
    }

    if (Array.isArray(result?.samples)) {
      return result.samples;
    }

    return [];
  }, [waveformSamples, result]);

  const duration = useMemo(() => {
    const explicitDuration = Number(audioDuration);

    if (
      Number.isFinite(explicitDuration) &&
      explicitDuration > 0
    ) {
      return explicitDuration;
    }

    const metadataDuration = Number(
      result?.metadata?.duration_seconds
    );

    if (
      Number.isFinite(metadataDuration) &&
      metadataDuration > 0
    ) {
      return metadataDuration;
    }

    const mediaDuration = Number(
      audio?.duration
    );

    if (
      Number.isFinite(mediaDuration) &&
      mediaDuration > 0
    ) {
      return mediaDuration;
    }

    return 0;
  }, [
    audioDuration,
    result,
    audio,
  ]);

  const selectedCandidate =
    signals[selectedSignal] || null;

  /* ==========================================================
     SAGE DSP
     ========================================================== */

  const sageDsp =
    result?.dsp_engine || null;

  const fourier =
    sageDsp?.fourier || null;

  const laplace =
    sageDsp?.laplace || null;

  const dspStatus =
    sageDsp?.status || "not_run";

  /* ==========================================================
     KEEP SIGNAL SELECTION VALID
     ========================================================== */

  useEffect(() => {
    if (!signals.length) {
      setSelectedSignal(0);
      return;
    }

    if (
      selectedSignal < 0 ||
      selectedSignal >= signals.length
    ) {
      setSelectedSignal(0);
    }
  }, [
    signals.length,
    selectedSignal,
  ]);

  /* ==========================================================
     WAVEFORM DATA
     ========================================================== */

  const waveformPoints = useMemo(() => {
    return buildWaveformPoints(
      samples,
      420
    );
  }, [samples]);

  /* ==========================================================
     AUDIO EVENTS
     ========================================================== */

  useEffect(() => {
    const element = getAudioElement();

    if (!element) {
      return undefined;
    }

    const update = () => {
      const value =
        Number(element.currentTime);

      setCurrentTime(
        Number.isFinite(value)
          ? Math.max(0, value)
          : 0
      );
    };

    const reset = () => {
      update();
    };

    element.addEventListener(
      "timeupdate",
      update
    );

    element.addEventListener(
      "loadedmetadata",
      update
    );

    element.addEventListener(
      "durationchange",
      update
    );

    element.addEventListener(
      "seeking",
      update
    );

    element.addEventListener(
      "seeked",
      update
    );

    element.addEventListener(
      "ended",
      reset
    );

    update();

    return () => {
      element.removeEventListener(
        "timeupdate",
        update
      );

      element.removeEventListener(
        "loadedmetadata",
        update
      );

      element.removeEventListener(
        "durationchange",
        update
      );

      element.removeEventListener(
        "seeking",
        update
      );

      element.removeEventListener(
        "seeked",
        update
      );

      element.removeEventListener(
        "ended",
        reset
      );
    };
  }, [
    getAudioElement,
    audioUrl,
  ]);

  /* ==========================================================
     AUDIO SETTINGS
     ========================================================== */

  useEffect(() => {
    const element = getAudioElement();

    if (!element) {
      return;
    }

    try {
      element.volume = muted
        ? 0
        : Math.min(
            1,
            Math.max(
              0,
              Number(volume) || 0
            )
          );

      element.muted = Boolean(muted);

      element.playbackRate =
        Number(playbackRate) || 1;

      element.loop = Boolean(loop);
    } catch {
      // Browser media can reject property updates
      // while the media element is transitioning.
    }
  }, [
    getAudioElement,
    volume,
    muted,
    playbackRate,
    loop,
  ]);

  /* ==========================================================
     FORMATTING
     ========================================================== */

  function formatTime(value) {
    const n = Number(value);

    if (
      !Number.isFinite(n) ||
      n < 0
    ) {
      return "00:00.000";
    }

    const minutes =
      Math.floor(n / 60);

    const seconds =
      Math.floor(n % 60);

    const millis =
      Math.floor(
        (n % 1) * 1000
      );

    return (
      `${String(minutes).padStart(2, "0")}:` +
      `${String(seconds).padStart(2, "0")}.` +
      `${String(millis).padStart(3, "0")}`
    );
  }

  function formatShortTime(value) {
    const n = Number(value);

    if (
      !Number.isFinite(n) ||
      n < 0
    ) {
      return "00:00";
    }

    return (
      `${String(
        Math.floor(n / 60)
      ).padStart(2, "0")}:` +
      `${String(
        Math.floor(n % 60)
      ).padStart(2, "0")}`
    );
  }

  function formatNumber(value) {
    const n = Number(value);

    if (!Number.isFinite(n)) {
      return "—";
    }

    return n.toLocaleString();
  }

  function formatHz(value) {
    const n = Number(value);

    if (!Number.isFinite(n)) {
      return "—";
    }

    const abs = Math.abs(n);

    if (abs >= 1000000) {
      return `${(
        n / 1000000
      ).toFixed(2)} MHz`;
    }

    if (abs >= 1000) {
      return `${(
        n / 1000
      ).toFixed(2)} kHz`;
    }

    return `${n.toFixed(1)} Hz`;
  }

  function formatDb(value) {
    const n = Number(value);

    if (!Number.isFinite(n)) {
      return "—";
    }

    return `${n.toFixed(2)} dB`;
  }

  function formatConfidence(value) {
    const n = Number(value);

    if (!Number.isFinite(n)) {
      return "—";
    }

    const percentage =
      n <= 1
        ? n * 100
        : n;

    return `${Math.max(
      0,
      Math.min(
        100,
        percentage
      )
    ).toFixed(1)}%`;
  }

  function formatSigma(value) {
    const n = Number(value);

    return Number.isFinite(n)
      ? n.toFixed(2)
      : "—";
  }

  function formatScore(value) {
    const n = Number(value);

    return Number.isFinite(n)
      ? n.toFixed(3)
      : "—";
  }

  /* ==========================================================
     PLAYBACK
     ========================================================== */

  const seekTo = useCallback(
    (value) => {
      const element =
        getAudioElement();

      if (!element) {
        return;
      }

      const requested =
        Number(value);

      if (
        !Number.isFinite(requested)
      ) {
        return;
      }

      const mediaDuration =
        Number(element.duration);

      const max =
        Number.isFinite(
          mediaDuration
        ) &&
        mediaDuration > 0
          ? mediaDuration
          : duration;

      const next =
        max > 0
          ? Math.max(
              0,
              Math.min(
                requested,
                max
              )
            )
          : Math.max(
              0,
              requested
            );

      try {
        element.currentTime =
          next;
      } catch {
        // Ignore seek errors before metadata is ready.
      }

      setCurrentTime(next);
    },
    [
      getAudioElement,
      duration,
    ]
  );

  const seekBy = useCallback(
    (seconds) => {
      seekTo(
        currentTime +
          Number(seconds)
      );
    },
    [
      currentTime,
      seekTo,
    ]
  );

  const stopPlayback = useCallback(
    () => {
      const element =
        getAudioElement();

      if (element) {
        try {
          element.pause();
          element.currentTime = 0;
        } catch {
          // Ignore browser media reset errors.
        }
      }

      setCurrentTime(0);

      if (
        typeof onStop ===
        "function"
      ) {
        onStop();
      }
    },
    [
      getAudioElement,
      onStop,
    ]
  );

  /*
   * Important:
   *
   * The workspace now controls the actual <audio> element.
   * If a parent onPlayPause handler also exists, we call it
   * only when there is no locally controllable media element.
   *
   * This prevents the common "play -> immediately pause"
   * double-toggle bug.
   */
  const playPause = useCallback(
    async () => {
      const element =
        getAudioElement();

      if (!element) {
        if (
          typeof onPlayPause ===
          "function"
        ) {
          onPlayPause();
        }

        return;
      }

      try {
        if (element.paused) {
          await element.play();
        } else {
          element.pause();
        }
      } catch (error) {
        console.warn(
          "SAGE-RF playback error:",
          error
        );

        /*
         * Browser autoplay policy may block playback.
         * Keep compatibility with the existing parent
         * playback handler as a fallback.
         */
        if (
          typeof onPlayPause ===
          "function"
        ) {
          onPlayPause();
        }
      }
    },
    [
      getAudioElement,
      onPlayPause,
    ]
  );

  /* ==========================================================
     HOME
     ========================================================== */

  function goHome() {
    if (
      typeof onHome ===
      "function"
    ) {
      onHome();
      return;
    }

    window.location.reload();
  }

  /* ==========================================================
     EXPORT
     ========================================================== */

  function exportAnalysis() {
    if (!result) {
      return;
    }

    try {
      const payload = {
        application:
          "SAGE-RF",

        exported_at:
          new Date().toISOString(),

        filename:
          result.filename ||
          "sage-rf-analysis",

        metadata:
          result.metadata || {},

        spectrum:
          result.spectrum || {},

        waterfall:
          result.waterfall || {},

        modulation:
          result.modulation || null,

        detections:
          result.detections || {},

        dsp_engine:
          result.dsp_engine || {},

        diagnostics:
          result.diagnostics || {},
      };

      const blob =
        new Blob(
          [
            JSON.stringify(
              payload,
              null,
              2
            ),
          ],
          {
            type:
              "application/json",
          }
        );

      const url =
        URL.createObjectURL(
          blob
        );

      const anchor =
        document.createElement(
          "a"
        );

      anchor.href = url;

      anchor.download =
        `${sanitizeFilename(
          result.filename ||
            "sage-rf-analysis"
        )}-analysis.json`;

      document.body.appendChild(
        anchor
      );

      anchor.click();

      anchor.remove();

      window.setTimeout(
        () =>
          URL.revokeObjectURL(
            url
          ),
        250
      );
    } catch (error) {
      console.error(
        "SAGE-RF export failed:",
        error
      );
    }
  }

  /* ==========================================================
     PDF REPORT
     ========================================================== */

  async function openReport() {
    const id = result?.history_id;

    if (!id) {
      console.warn(
        "SAGE-RF PDF report: no history ID available."
      );
      return;
    }

    const currentUser = auth.currentUser;

    if (!currentUser) {
      console.error(
        "SAGE-RF PDF report: no authenticated Firebase user."
      );
      return;
    }

    /*
     * Open a blank tab immediately from the click event.
     * This prevents Chrome/Safari popup blocking while we
     * asynchronously obtain the Firebase ID token and PDF.
     */
    const reportWindow = window.open(
      "",
      "_blank"
    );

    try {
      /*
       * Get the current Firebase ID token.
       * Firebase refreshes it automatically when necessary.
       */
      const idToken =
        await currentUser.getIdToken();

      const reportUrl =
        `/api/report/${encodeURIComponent(
          id
        )}`;

      /*
       * IMPORTANT:
       *
       * The old implementation used window.open(reportUrl),
       * which sent NO Authorization header.
       *
       * The report endpoint requires:
       * Authorization: Bearer <Firebase ID token>
       */
      const response =
        await fetch(reportUrl, {
          method: "GET",
          headers: {
            Authorization:
              `Bearer ${idToken}`,
            Accept: "application/pdf",
          },
        });

      if (!response.ok) {
        let detail =
          `PDF report request failed (${response.status}).`;

        try {
          const errorData =
            await response.json();

          if (errorData?.detail) {
            detail = errorData.detail;
          }
        } catch {
          /* Response was not JSON. */
        }

        throw new Error(detail);
      }

      /*
       * The backend returns the generated ReportLab PDF as
       * binary data.
       */
      const blob =
        await response.blob();

      if (!blob || blob.size === 0) {
        throw new Error(
          "The PDF report was empty."
        );
      }

      /*
       * Create a local browser URL for the authenticated PDF.
       */
      const pdfUrl =
        URL.createObjectURL(blob);

      if (reportWindow) {
        reportWindow.location.href =
          pdfUrl;
      } else {
        /* Popup was blocked: use the current tab. */
        window.location.href =
          pdfUrl;
      }

      /*
       * Give the browser time to consume the blob URL before
       * releasing it.
       */
      window.setTimeout(() => {
        URL.revokeObjectURL(pdfUrl);
      }, 60_000);

      console.log(
        "SAGE-RF PDF report generated:",
        {
          historyId: id,
          sizeBytes: blob.size,
        }
      );
    } catch (error) {
      console.error(
        "SAGE-RF PDF report failed:",
        error
      );

      /* Don't leave a blank tab behind if generation failed. */
      if (reportWindow) {
        try {
          reportWindow.close();
        } catch {
          // Ignore browser restrictions.
        }
      }
    }
  }

  /* ==========================================================
     KEYBOARD SHORTCUTS
     ========================================================== */

  useEffect(() => {
    function handleKeyboard(
      event
    ) {
      const target =
        event.target;

      const typing =
        target instanceof
          window.HTMLInputElement ||
        target instanceof
          window.HTMLSelectElement ||
        target instanceof
          window.HTMLTextAreaElement ||
        target?.isContentEditable;

      if (typing) {
        return;
      }

      if (
        event.code ===
        "Space"
      ) {
        event.preventDefault();

        playPause();

        return;
      }

      if (
        event.code ===
        "ArrowLeft"
      ) {
        event.preventDefault();

        seekBy(-5);

        return;
      }

      if (
        event.code ===
        "ArrowRight"
      ) {
        event.preventDefault();

        seekBy(5);

        return;
      }

      if (
        event.key === "?"
      ) {
        event.preventDefault();

        setShowShortcuts(
          (value) => !value
        );

        return;
      }

      const map = {
        1: "ANALYSIS",
        2: "EDITOR",
        3: "MIXER",
        4: "SIGNAL LAB",
        5: "FOURIER",
        6: "LAPLACE",
        7: "PROJECTS",
        8: "SETTINGS",
      };

      if (map[event.key]) {
        setActiveTool(
          map[event.key]
        );
      }
    }

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
    playPause,
    seekBy,
  ]);

  /* ==========================================================
     NAVIGATION
     ========================================================== */

  const tools = [
    {
      id: "ANALYSIS",
      label: "Analysis",
      icon: BarChart3,
      description:
        "Spectrum, waterfall and signal intelligence",
    },
    {
      id: "EDITOR",
      label: "Editor",
      icon: SlidersHorizontal,
      description:
        "Inspect and navigate the recording waveform",
    },
    {
      id: "MIXER",
      label: "Mixer",
      icon: Radio,
      description:
        "Monitor detected signal channels",
    },
    {
      id: "SIGNAL LAB",
      label: "Signal Lab",
      icon: FlaskConical,
      description:
        "Inspect modulation and DSP evidence",
    },
    {
      id: "FOURIER",
      label: "Fourier",
      icon: Waves,
      description:
        "SAGE DSP FFT frequency-domain analysis",
    },
    {
      id: "LAPLACE",
      label: "Laplace",
      icon: Cpu,
      description:
        "SAGE DSP complex-domain analysis",
    },
    {
      id: "PROJECTS",
      label: "Project",
      icon: FolderOpen,
      description:
        "Current capture and analysis summary",
    },
    {
      id: "SETTINGS",
      label: "Settings",
      icon: Settings2,
      description:
        "Workspace configuration",
    },
  ];

  const activeToolInfo =
    tools.find(
      (item) =>
        item.id ===
        activeTool
    ) || tools[0];

  const playbackPercentage =
    duration > 0
      ? Math.min(
          100,
          Math.max(
            0,
            (currentTime /
              duration) *
              100
          )
        )
      : 0;

  const sampleCount =
    result?.metadata
      ?.sample_count ??
    samples.length ??
    0;

  /* ==========================================================
     RENDER
     ========================================================== */

  return (
    <div className="workspace">

      {/* ======================================================
          AUDIO ENGINE
          ====================================================== */}

      <audio
        ref={(node) => {
          localAudioRef.current =
            node;
        }}
        src={
          audioUrl ||
          undefined
        }
        preload="metadata"
        onLoadedMetadata={(event) => {
          const value =
            Number(
              event.currentTarget
                .duration
            );

          if (
            Number.isFinite(value) &&
            value > 0
          ) {
            setCurrentTime(
              Math.min(
                currentTime,
                value
              )
            );
          }
        }}
        onTimeUpdate={(event) => {
          const value =
            Number(
              event.currentTarget
                .currentTime
            );

          if (
            Number.isFinite(value)
          ) {
            setCurrentTime(
              Math.max(
                0,
                value
              )
            );
          }
        }}
        onEnded={() => {
          setCurrentTime(0);

          if (
            typeof onStop ===
            "function" &&
            !loop
          ) {
            onStop();
          }
        }}
      />

      {/* ======================================================
          TOP BAR
          ====================================================== */}

      <header className="workspace-topbar">

        <button
          type="button"
          className="workspace-brand"
          onClick={goHome}
          title="Return to SAGE-RF home"
        >
          <div className="brand-mark">
            <Activity
              size={18}
            />
          </div>

          <div className="workspace-brand-text">
            <strong>
              SAGE-RF
            </strong>

            <span>
              RF SIGNAL WORKSTATION
            </span>
          </div>
        </button>

        <div className="workspace-project">
          <span>
            ACTIVE PROJECT
          </span>

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

          <span>
            SAGE DSP{" "}
            {dspStatus ===
            "success"
              ? "ONLINE"
              : "READY"}
          </span>
        </div>

        <div className="workspace-top-actions">

          {result?.history_id && (
            <button
              type="button"
              className="workspace-icon-button"
              onClick={
                openReport
              }
              title="Open PDF report"
              aria-label="Open PDF report"
            >
              <FileAudio
                size={16}
              />
            </button>
          )}

          <button
            type="button"
            className="workspace-icon-button"
            onClick={() =>
              setShowShortcuts(
                (value) =>
                  !value
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
            title="Return home"
          >
            <Home size={16} />
            HOME
          </button>

        </div>
      </header>

      {/* ======================================================
          SHORTCUT MODAL
          ====================================================== */}

      {showShortcuts && (
        <div
          className="workspace-shortcuts"
          onClick={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setShowShortcuts(
                false
              );
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
                  setShowShortcuts(
                    false
                  )
                }
                title="Close shortcuts"
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
                label="Fourier"
              />

              <Shortcut
                keyName="6"
                label="Laplace"
              />

              <Shortcut
                keyName="7"
                label="Projects"
              />

              <Shortcut
                keyName="8"
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

      {/* ======================================================
          MAIN LAYOUT
          ====================================================== */}

      <div className="workspace-layout">

        {/* ====================================================
            SIDEBAR
            ==================================================== */}

        <aside className="workspace-sidebar">

          <div className="workspace-sidebar-actions">

            <button
              type="button"
              className="sidebar-button primary"
              onClick={() => {
                if (
                  typeof onUpload ===
                  "function"
                ) {
                  onUpload();
                }
              }}
            >
              <Upload size={16} />
              IMPORT SIGNAL
            </button>

            <button
              type="button"
              className="sidebar-button"
              onClick={() =>
                setActiveTool(
                  "PROJECTS"
                )
              }
            >
              <FolderOpen
                size={16}
              />
              PROJECTS
            </button>

          </div>

          <div className="workspace-sidebar-divider" />

          <div className="sidebar-section">

            <span className="sidebar-section-title">
              WORKSPACE
            </span>

            <nav className="workspace-tool-nav">

              {tools.map(
                (tool) => {
                  const Icon =
                    tool.icon;

                  const active =
                    activeTool ===
                    tool.id;

                  return (
                    <button
                      key={
                        tool.id
                      }
                      type="button"
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
                      <Icon
                        size={14}
                      />

                      <span>
                        {tool.label.toUpperCase()}
                      </span>

                      {active && (
                        <ChevronRight
                          size={
                            13
                          }
                        />
                      )}
                    </button>
                  );
                }
              )}

            </nav>
          </div>

          {/* DETECTED SIGNALS */}

          <div className="sidebar-section">

            <div className="sidebar-section-heading">

              <span className="sidebar-section-title">
                DETECTED SIGNALS
              </span>

              {signals.length >
                0 && (
                <span className="signal-count">
                  {
                    signals.length
                  }
                </span>
              )}

            </div>

            {signals.length >
            0 ? (
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
                        key={`${index}-${signal?.center_frequency_hz}`}
                        type="button"
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
                        title={`Select signal ${
                          index + 1
                        }`}
                      >
                        <i />

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
                            {signal?.modulation ||
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

          {/* ENGINE */}

          <div className="workspace-sidebar-footer">

            <div>
              <span>
                ENGINE
              </span>

              <strong>
                GNU RADIO
              </strong>
            </div>

            <div>
              <span>
                PROCESSING
              </span>

              <strong>
                SAGE DSP
              </strong>
            </div>

            <div>
              <span>
                STATUS
              </span>

              <strong className="online-text">
                {dspStatus ===
                "success"
                  ? "ONLINE"
                  : "READY"}
              </strong>
            </div>

          </div>

        </aside>

        {/* ====================================================
            MAIN
            ==================================================== */}

        <main className="workspace-main">

          {/* ==================================================
              TRANSPORT
              ================================================== */}

          <section className="workspace-toolbar professional-transport">

            <div className="transport transport-main">

              <button
                type="button"
                className="transport-button"
                onClick={() =>
                  seekBy(-5)
                }
                title="Seek backward 5 seconds"
                aria-label="Seek backward 5 seconds"
              >
                <SkipBack
                  size={17}
                />
              </button>

              <button
                type="button"
                className="transport-play"
                onClick={
                  playPause
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
                  <Pause
                    size={19}
                  />
                ) : (
                  <Play
                    size={19}
                  />
                )}
              </button>

              <button
                type="button"
                className="transport-button"
                onClick={
                  stopPlayback
                }
                title="Stop and return to beginning"
                aria-label="Stop"
              >
                <Square
                  size={15}
                />
              </button>

              <button
                type="button"
                className="transport-button"
                onClick={() =>
                  seekBy(5)
                }
                title="Seek forward 5 seconds"
                aria-label="Seek forward 5 seconds"
              >
                <SkipForward
                  size={17}
                />
              </button>

              <div className="transport-time">

                <strong>
                  {formatTime(
                    currentTime
                  )}
                </strong>

                <span>
                  /{" "}
                  {formatTime(
                    duration
                  )}
                </span>

              </div>

            </div>

            <div className="transport-seek">

              <div className="seek-track">

                <div
                  className="seek-fill"
                  style={{
                    width:
                      `${playbackPercentage}%`,
                  }}
                />

                <input
                  type="range"
                  min="0"
                  max={
                    duration ||
                    0
                  }
                  step="0.001"
                  value={
                    duration > 0
                      ? Math.min(
                          currentTime,
                          duration
                        )
                      : 0
                  }
                  onChange={(
                    event
                  ) =>
                    seekTo(
                      event
                        .target
                        .value
                    )
                  }
                  disabled={
                    duration <= 0
                  }
                  aria-label="Playback position"
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
              >
                {muted ? (
                  <VolumeX
                    size={16}
                  />
                ) : (
                  <Volume2
                    size={16}
                  />
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
                        event
                          .target
                          .value
                      );

                    setVolume(
                      value
                    );

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
                      event
                        .target
                        .value
                    )
                  )
                }
                title="Playback speed"
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
              >
                <Repeat
                  size={16}
                />
              </button>

            </div>

            <div className="toolbar-actions">

              <button
                type="button"
                onClick={
                  exportAnalysis
                }
                disabled={
                  !result
                }
                title="Export analysis JSON"
              >
                <Download
                  size={15}
                />
                EXPORT
              </button>

              {result?.history_id && (
                <button
                  type="button"
                  onClick={
                    openReport
                  }
                  title="Open PDF report"
                >
                  PDF REPORT
                </button>
              )}

            </div>

          </section>

          {/* ==================================================
              HEADER
              ================================================== */}

          <section className="workspace-view-header">

            <div className="workspace-view-title">

              <span className="workspace-view-kicker">
                {activeToolInfo.label.toUpperCase()}
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
                  "FOURIER" &&
                  "Fourier Analysis"}

                {activeTool ===
                  "LAPLACE" &&
                  "Laplace Analysis"}

                {activeTool ===
                  "PROJECTS" &&
                  "Project Overview"}

                {activeTool ===
                  "SETTINGS" &&
                  "Workspace Settings"}
              </h1>

              <p>
                {
                  activeToolInfo.description
                }
              </p>

            </div>

            <div className="workspace-live-state">
              <span className="status-dot" />

              {dspStatus ===
              "success"
                ? "DSP ONLINE"
                : "WORKSPACE READY"}
            </div>

          </section>

          {/* ==================================================
              ANALYSIS
              ================================================== */}

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

                <PanelHeader
                  kicker="SELECTED SIGNAL"
                  title="Signal Intelligence"
                  icon={
                    <Signal
                      size={18}
                    />
                  }
                />

                {selectedCandidate ? (
                  <div className="workspace-intelligence-grid">

                    <Metric
                      label="CENTER FREQUENCY"
                      value={formatHz(
                        selectedCandidate.center_frequency_hz
                      )}
                    />

                    <Metric
                      label="BANDWIDTH"
                      value={formatHz(
                        selectedCandidate.bandwidth_hz
                      )}
                    />

                    <Metric
                      label="PEAK"
                      value={formatHz(
                        selectedCandidate.peak_frequency_hz
                      )}
                    />

                    <Metric
                      label="SNR"
                      value={formatDb(
                        selectedCandidate.snr_db
                      )}
                    />

                    <Metric
                      label="CONFIDENCE"
                      value={formatConfidence(
                        selectedCandidate.confidence
                      )}
                    />

                    <Metric
                      label="MODULATION"
                      value={
                        selectedCandidate.modulation ||
                        "Unknown"
                      }
                    />

                  </div>
                ) : (
                  <EmptyState
                    title="No signal selected"
                    text="Upload and analyse an RF recording, then select a detected signal."
                  />
                )}

              </section>

              <section className="workspace-panel timeline-panel">

                <PanelHeader
                  kicker="SIGNAL TIMELINE"
                  title="Multi-Signal Timeline"
                  icon={
                    <Activity
                      size={18}
                    />
                  }
                />

                <MultiSignalTimeline />

              </section>

            </div>
          )}

          {/* ==================================================
              EDITOR
              ================================================== */}

          {activeTool ===
            "EDITOR" && (
            <section className="workspace-content workspace-editor">

              <div className="workspace-panel editor-main-panel">

                <PanelHeader
                  kicker="WAVEFORM EDITOR"
                  title="Recording Timeline"
                />

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
                  >
                    +
                  </button>

                  <button
                    type="button"
                    className="control-button"
                    onClick={() => {
                      setEditorZoom(
                        1
                      );

                      setEditorOffset(
                        0
                      );
                    }}
                    title="Reset editor view"
                  >
                    <RotateCcw
                      size={14}
                    />
                  </button>

                </div>

                <div className="editor-ruler">

                  <span>
                    00:00
                  </span>

                  <span>
                    {formatShortTime(
                      duration *
                        0.25
                    )}
                  </span>

                  <span>
                    {formatShortTime(
                      duration *
                        0.5
                    )}
                  </span>

                  <span>
                    {formatShortTime(
                      duration *
                        0.75
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
                  onClick={(
                    event
                  ) => {
                    if (!duration) {
                      return;
                    }

                    const rect =
                      event.currentTarget.getBoundingClientRect();

                    const percentage =
                      Math.max(
                        0,
                        Math.min(
                          1,
                          (event.clientX -
                            rect.left) /
                            rect.width
                        )
                      );

                    seekTo(
                      percentage *
                        duration
                    );
                  }}
                  role="slider"
                  tabIndex={0}
                  aria-label="Recording waveform"
                  aria-valuemin={0}
                  aria-valuemax={
                    duration
                  }
                  aria-valuenow={
                    currentTime
                  }
                  onKeyDown={(
                    event
                  ) => {
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

                  {waveformPoints.length ? (
                    <WaveformBars
                      points={
                        waveformPoints
                      }
                      zoom={
                        editorZoom
                      }
                      offset={
                        editorOffset
                      }
                    />
                  ) : (
                    <EmptyState
                      title="No waveform available"
                      text="Waveform samples are not available for this recording."
                    />
                  )}

                  <div
                    className="editor-playhead"
                    style={{
                      left:
                        `${playbackPercentage}%`,
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
                            result.metadata.sample_rate
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

                <PanelHeader
                  kicker="EDITOR TOOLS"
                  title="Timeline Controls"
                />

                <div className="editor-tool-grid">

                  <button
                    type="button"
                    onClick={() =>
                      seekTo(0)
                    }
                  >
                    <SkipBack
                      size={16}
                    />
                    GO TO START
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      seekTo(
                        duration /
                          2
                      )
                    }
                    disabled={
                      !duration
                    }
                  >
                    CENTER PLAYHEAD
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setEditorOffset(
                        (
                          value
                        ) =>
                          value -
                          25
                      )
                    }
                  >
                    PAN LEFT
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setEditorOffset(
                        (
                          value
                        ) =>
                          value +
                          25
                      )
                    }
                  >
                    PAN RIGHT
                  </button>

                </div>

              </div>

            </section>
          )}

          {/* ==================================================
              MIXER
              ================================================== */}

          {activeTool ===
            "MIXER" && (
            <section className="workspace-content workspace-mixer">

              <div className="workspace-panel">

                <PanelHeader
                  kicker="SIGNAL ROUTING"
                  title="Multi-Signal Mixer"
                  icon={
                    <Radio
                      size={18}
                    />
                  }
                />

                {signals.length ? (
                  <div className="mixer-signal-list">

                    {signals.map(
                      (
                        signal,
                        index
                      ) => {
                        const confidence =
                          Number(
                            signal?.confidence
                          );

                        const percent =
                          Number.isFinite(
                            confidence
                          )
                            ? confidence <=
                              1
                              ? confidence *
                                100
                              : confidence
                            : 0;

                        return (
                          <div
                            className="mixer-channel"
                            key={`${index}-${signal?.center_frequency_hz}`}
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
                                  {signal?.modulation ||
                                    "Unknown"}
                                  {" · "}
                                  {formatHz(
                                    signal?.center_frequency_hz
                                  )}
                                </span>
                              </div>

                            </div>

                            <div className="mixer-meter">
                              <span
                                style={{
                                  width:
                                    `${Math.max(
                                      3,
                                      Math.min(
                                        100,
                                        percent
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
                              title={`Select signal ${
                                index + 1
                              }`}
                              aria-label={`Select signal ${
                                index + 1
                              }`}
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
                    text="Run analysis to populate mixer channels."
                  />
                )}

              </div>

              <div className="workspace-panel">

                <PanelHeader
                  kicker="OUTPUT BUS"
                  title="Master Signal"
                />

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
                            result.metadata.sample_rate
                          )} Hz`
                        : "—"
                    }
                  />

                </div>

              </div>

            </section>
          )}

          {/* ==================================================
              SIGNAL LAB
              ================================================== */}

          {activeTool ===
            "SIGNAL LAB" && (
            <section className="workspace-content signal-lab-grid">

              <div className="workspace-panel">

                <PanelHeader
                  kicker="SIGNAL LABORATORY"
                  title="Selected Signal"
                  icon={
                    <FlaskConical
                      size={18}
                    />
                  }
                />

                {selectedCandidate ? (
                  <>

                    <div className="lab-frequency">

                      <span>
                        CENTER FREQUENCY
                      </span>

                      <strong>
                        {formatHz(
                          selectedCandidate.center_frequency_hz
                        )}
                      </strong>

                    </div>

                    <div className="lab-grid">

                      <Metric
                        label="BANDWIDTH"
                        value={formatHz(
                          selectedCandidate.bandwidth_hz
                        )}
                      />

                      <Metric
                        label="PEAK"
                        value={formatHz(
                          selectedCandidate.peak_frequency_hz
                        )}
                      />

                      <Metric
                        label="SNR"
                        value={formatDb(
                          selectedCandidate.snr_db
                        )}
                      />

                      <Metric
                        label="MODULATION"
                        value={
                          selectedCandidate.modulation ||
                          "Unknown"
                        }
                      />

                    </div>

                  </>
                ) : (
                  <EmptyState
                    title="Select a signal"
                    text="Choose a detected signal from the sidebar."
                  />
                )}

              </div>

              <div className="workspace-panel">

                <PanelHeader
                  kicker="CLASSIFICATION"
                  title="Modulation Evidence"
                  icon={
                    <Signal
                      size={18}
                    />
                  }
                />

                {result?.modulation ? (
                  <div className="lab-evidence">

                    <div className="lab-classification">

                      <span>
                        PRIMARY CLASSIFICATION
                      </span>

                      <strong>
                        {result.modulation.modulation ||
                          "Unknown"}
                      </strong>

                    </div>

                    <div className="lab-confidence">

                      <span>
                        CONFIDENCE
                      </span>

                      <strong>
                        {formatConfidence(
                          result.modulation.confidence
                        )}
                      </strong>

                    </div>

                    <div className="lab-score-list">

                      <Metric
                        label="PSK SCORE"
                        value={formatScore(
                          result
                            .modulation
                            ?.evidence
                            ?.psk_score
                        )}
                      />

                      <Metric
                        label="FSK SCORE"
                        value={formatScore(
                          result
                            .modulation
                            ?.evidence
                            ?.fsk_score
                        )}
                      />

                      <Metric
                        label="QAM SCORE"
                        value={formatScore(
                          result
                            .modulation
                            ?.evidence
                            ?.qam_score
                        )}
                      />

                      <Metric
                        label="AMPLITUDE CV"
                        value={formatScore(
                          result
                            .modulation
                            ?.evidence
                            ?.amplitude_cv
                        )}
                      />

                    </div>

                  </div>
                ) : (
                  <EmptyState
                    title="No classification evidence"
                    text="Classification data will appear after analysis."
                  />
                )}

              </div>

              <div className="workspace-panel">

                <PanelHeader
                  kicker="DIAGNOSTICS"
                  title="Processing Pipeline"
                />

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
                    label="SAGE DSP"
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

          {/* ==================================================
              FOURIER
              ================================================== */}

          {activeTool ===
            "FOURIER" && (
            <section className="workspace-content dsp-analysis-view">

              <div className="workspace-panel dsp-hero-panel">

                <PanelHeader
                  kicker="SAGE DSP"
                  title="Fourier Domain Analysis"
                  icon={
                    <Waves
                      size={18}
                    />
                  }
                />

                {/* RECORDING WAVEFORM */}

                <DspWaveformPanel
                  title="SOURCE RECORDING WAVEFORM"
                  kicker="TIME DOMAIN"
                  points={
                    waveformPoints
                  }
                  currentTime={
                    currentTime
                  }
                  duration={
                    duration
                  }
                  onSeek={
                    seekTo
                  }
                />

                {fourier ? (
                  <>

                    <div className="workspace-intelligence-grid">

                      <Metric
                        label="SAMPLE RATE"
                        value={
                          fourier.sample_rate
                            ? `${formatNumber(
                                fourier.sample_rate
                              )} Hz`
                            : "—"
                        }
                      />

                      <Metric
                        label="FFT SIZE"
                        value={
                          fourier.nfft ??
                          "—"
                        }
                      />

                      <Metric
                        label="HOP SIZE"
                        value={
                          fourier.hop_size ??
                          "—"
                        }
                      />

                      <Metric
                        label="FREQUENCY BINS"
                        value={formatNumber(
                          fourier.frequencies_hz
                            ?.length
                        )}
                      />

                      <Metric
                        label="TIME BLOCKS"
                        value={formatNumber(
                          fourier.times_seconds
                            ?.length
                        )}
                      />

                      <Metric
                        label="FIRST PEAK"
                        value={formatHz(
                          fourier
                            .peak_frequencies_hz
                            ?.[
                              0
                            ]
                        )}
                      />

                    </div>

                    <DspVisualization
                      title="FFT PEAK TRACK"
                      values={
                        fourier.peak_frequencies_hz
                      }
                      formatter={
                        formatHz
                      }
                    />

                    <DspVisualization
                      title="FFT POWER TRACE"
                      values={
                        Array.isArray(
                          fourier.power_db
                        )
                          ? flattenForChart(
                              fourier.power_db
                            )
                          : []
                      }
                      formatter={
                        formatDb
                      }
                    />

                  </>
                ) : (
                  <EmptyState
                    title="Fourier analysis unavailable"
                    text="Upload a WAV recording and run analysis."
                  />
                )}

              </div>

              <div className="workspace-panel">

                <PanelHeader
                  kicker="FREQUENCY DOMAIN"
                  title="FFT Processing Summary"
                  icon={
                    <Activity
                      size={18}
                    />
                  }
                />

                {fourier ? (
                  <div className="dsp-table">

                    <DspRow
                      label="FFT bins"
                      value={formatNumber(
                        fourier
                          .frequencies_hz
                          ?.length
                      )}
                    />

                    <DspRow
                      label="Time blocks"
                      value={formatNumber(
                        fourier
                          .times_seconds
                          ?.length
                      )}
                    />

                    <DspRow
                      label="FFT size"
                      value={
                        fourier.nfft ??
                        "—"
                      }
                    />

                    <DspRow
                      label="Hop size"
                      value={
                        fourier.hop_size ??
                        "—"
                      }
                    />

                    <DspRow
                      label="Sample rate"
                      value={
                        fourier.sample_rate
                          ? `${formatNumber(
                              fourier.sample_rate
                            )} Hz`
                          : "—"
                      }
                    />

                  </div>
                ) : (
                  <EmptyState
                    title="No Fourier result"
                    text="No SAGE DSP Fourier result is attached."
                  />
                )}

              </div>

              <div className="workspace-panel">

                <PanelHeader
                  kicker="FOURIER INTERACTION"
                  title="Playback Navigation"
                  icon={
                    <Radio
                      size={18}
                    />
                  }
                />

                <div className="dsp-action-grid">

                  <button
                    type="button"
                    onClick={() =>
                      seekTo(0)
                    }
                  >
                    <SkipBack
                      size={15}
                    />
                    START
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      seekBy(-5)
                    }
                  >
                    −5 SEC
                  </button>

                  <button
                    type="button"
                    onClick={
                      playPause
                    }
                  >
                    {isPlaying ? (
                      <>
                        <Pause
                          size={15}
                        />
                        PAUSE
                      </>
                    ) : (
                      <>
                        <Play
                          size={15}
                        />
                        PLAY
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      seekBy(5)
                    }
                  >
                    +5 SEC
                  </button>

                </div>

              </div>

            </section>
          )}

          {/* ==================================================
              LAPLACE
              ================================================== */}

          {activeTool ===
            "LAPLACE" && (
            <section className="workspace-content dsp-analysis-view">

              <div className="workspace-panel dsp-hero-panel">

                <PanelHeader
                  kicker="SAGE DSP"
                  title="Laplace Domain Analysis"
                  icon={
                    <Cpu
                      size={18}
                    />
                  }
                />

                {/* RECORDING WAVEFORM */}

                <DspWaveformPanel
                  title="SOURCE RECORDING WAVEFORM"
                  kicker="TIME DOMAIN"
                  points={
                    waveformPoints
                  }
                  currentTime={
                    currentTime
                  }
                  duration={
                    duration
                  }
                  onSeek={
                    seekTo
                  }
                />

                {laplace ? (
                  <>

                    <div className="workspace-intelligence-grid">

                      <Metric
                        label="SIGMA POINTS"
                        value={formatNumber(
                          laplace
                            .sigma
                            ?.length
                        )}
                      />

                      <Metric
                        label="FREQUENCY POINTS"
                        value={formatNumber(
                          laplace
                            .frequencies_hz
                            ?.length
                        )}
                      />

                      <Metric
                        label="SAMPLES ANALYZED"
                        value={formatNumber(
                          laplace
                            .metadata
                            ?.sample_count
                        )}
                      />

                      <Metric
                        label="SIGMA MIN"
                        value={formatSigma(
                          laplace
                            .metadata
                            ?.sigma_min
                        )}
                      />

                      <Metric
                        label="SIGMA MAX"
                        value={formatSigma(
                          laplace
                            .metadata
                            ?.sigma_max
                        )}
                      />

                      <Metric
                        label="SAMPLE RATE"
                        value={
                          laplace
                            .metadata
                            ?.sample_rate
                            ? `${formatNumber(
                                laplace.metadata.sample_rate
                              )} Hz`
                            : "—"
                        }
                      />

                    </div>

                    <div className="dsp-highlight-grid">

                      <div className="dsp-highlight-card">

                        <span>
                          PEAK FREQUENCY
                        </span>

                        <strong>
                          {formatHz(
                            laplace
                              .peak
                              ?.frequency_hz
                          )}
                        </strong>

                      </div>

                      <div className="dsp-highlight-card">

                        <span>
                          PEAK SIGMA
                        </span>

                        <strong>
                          {formatSigma(
                            laplace
                              .peak
                              ?.sigma
                          )}
                        </strong>

                      </div>

                      <div className="dsp-highlight-card">

                        <span>
                          PEAK MAGNITUDE
                        </span>

                        <strong>
                          {formatDb(
                            laplace
                              .peak
                              ?.magnitude_db
                          )}
                        </strong>

                      </div>

                    </div>

                    <DspVisualization
                      title="LAPLACE MAGNITUDE"
                      values={
                        laplace.magnitude_db
                      }
                      formatter={
                        formatDb
                      }
                    />

                  </>
                ) : (
                  <EmptyState
                    title="Laplace analysis unavailable"
                    text="Upload a WAV recording and run analysis."
                  />
                )}

              </div>

              <div className="workspace-panel">

                <PanelHeader
                  kicker="COMPLEX DOMAIN"
                  title="Laplace Grid"
                  icon={
                    <Cpu
                      size={18}
                    />
                  }
                />

                {laplace ? (
                  <div className="dsp-table">

                    <DspRow
                      label="Sigma range"
                      value={
                        `${formatSigma(
                          laplace
                            .metadata
                            ?.sigma_min
                        )} → ${formatSigma(
                          laplace
                            .metadata
                            ?.sigma_max
                        )}`
                      }
                    />

                    <DspRow
                      label="Sigma points"
                      value={formatNumber(
                        laplace
                          .sigma
                          ?.length
                      )}
                    />

                    <DspRow
                      label="Frequency points"
                      value={formatNumber(
                        laplace
                          .frequencies_hz
                          ?.length
                      )}
                    />

                    <DspRow
                      label="Peak frequency"
                      value={formatHz(
                        laplace
                          .peak
                          ?.frequency_hz
                      )}
                    />

                    <DspRow
                      label="Peak sigma"
                      value={formatSigma(
                        laplace
                          .peak
                          ?.sigma
                      )}
                    />

                    <DspRow
                      label="Peak magnitude"
                      value={formatDb(
                        laplace
                          .peak
                          ?.magnitude_db
                      )}
                    />

                  </div>
                ) : (
                  <EmptyState
                    title="No Laplace result"
                    text="No SAGE DSP Laplace result is attached."
                  />
                )}

              </div>

              <div className="workspace-panel">

                <PanelHeader
                  kicker="LAPLACE INTERACTION"
                  title="Playback Navigation"
                  icon={
                    <Radio
                      size={18}
                    />
                  }
                />

                <div className="dsp-action-grid">

                  <button
                    type="button"
                    onClick={() =>
                      seekTo(0)
                    }
                  >
                    <SkipBack
                      size={15}
                    />
                    START
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      seekBy(-5)
                    }
                  >
                    −5 SEC
                  </button>

                  <button
                    type="button"
                    onClick={
                      playPause
                    }
                  >
                    {isPlaying ? (
                      <>
                        <Pause
                          size={15}
                        />
                        PAUSE
                      </>
                    ) : (
                      <>
                        <Play
                          size={15}
                        />
                        PLAY
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      seekBy(5)
                    }
                  >
                    +5 SEC
                  </button>

                </div>

              </div>

              <div className="workspace-panel">

                <PanelHeader
                  kicker="ANALYSIS NOTE"
                  title="Interpretation"
                  icon={
                    <Info
                      size={18}
                    />
                  }
                />

                <div className="workspace-note">

                  <p>
                    The SAGE DSP Laplace
                    stage evaluates the
                    sampled signal over
                    a complex
                    sigma/frequency grid.
                  </p>

                  <p>
                    Large recordings use
                    a limited analysis
                    window for the
                    Laplace calculation
                    to keep the
                    workstation
                    responsive.
                  </p>

                  <p>
                    Fourier analysis
                    continues across
                    overlapping blocks
                    of the recording.
                  </p>

                </div>

              </div>

            </section>
          )}

          {/* ==================================================
              PROJECTS
              ================================================== */}

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

                  <h2>
                    {result?.filename ||
                      "Untitled Capture"}
                  </h2>

                  <p>
                    Current recording
                    loaded into the
                    SAGE-RF workstation.
                  </p>

                </div>

                <button
                  type="button"
                  className="workspace-action-primary"
                  onClick={() => {
                    if (
                      typeof onUpload ===
                      "function"
                    ) {
                      onUpload();
                    }
                  }}
                >
                  <Upload
                    size={15}
                  />
                  IMPORT ANOTHER
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
                          result.metadata.sample_rate
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

                <PanelHeader
                  kicker="ANALYSIS SUMMARY"
                  title="Current Recording"
                />

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
                    value={formatDb(
                      result?.spectrum
                        ?.snr_db
                    )}
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

              <div className="workspace-panel">

                <PanelHeader
                  kicker="SAGE DSP"
                  title="DSP Engine Status"
                  icon={
                    <Cpu
                      size={18}
                    />
                  }
                />

                <div className="project-summary">

                  <Metric
                    label="ENGINE STATUS"
                    value={dspStatus.toUpperCase()}
                  />

                  <Metric
                    label="FOURIER"
                    value={
                      fourier
                        ? "READY"
                        : "—"
                    }
                  />

                  <Metric
                    label="LAPLACE"
                    value={
                      laplace
                        ? "READY"
                        : "—"
                    }
                  />

                  <Metric
                    label="SAMPLES ANALYZED"
                    value={formatNumber(
                      sageDsp
                        ?.metadata
                        ?.sample_count ??
                        sampleCount
                    )}
                  />

                </div>

              </div>

            </section>
          )}

          {/* ==================================================
              SETTINGS
              ================================================== */}

          {activeTool ===
            "SETTINGS" && (
            <section className="workspace-content settings-view">

              <div className="workspace-panel">

                <PanelHeader
                  kicker="WORKSPACE"
                  title="SAGE-RF Configuration"
                  icon={
                    <Settings2
                      size={18}
                    />
                  }
                />

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
                    label="SAGE DSP"
                    value={
                      dspStatus ===
                      "success"
                        ? "ONLINE"
                        : "READY"
                    }
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
                    label="WORKSPACE"
                    value="ONLINE"
                  />

                </div>

              </div>

              <div className="workspace-panel">

                <PanelHeader
                  kicker="CURRENT RECORDING"
                  title="Recording Information"
                />

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

                <PanelHeader
                  kicker="SAGE DSP"
                  title="Processing Configuration"
                  icon={
                    <Cpu
                      size={18}
                    />
                  }
                />

                <div className="settings-list">

                  <SettingRow
                    label="FOURIER FFT"
                    value={
                      fourier?.nfft ??
                      "4096"
                    }
                  />

                  <SettingRow
                    label="FOURIER HOP"
                    value={
                      fourier?.hop_size ??
                      "2048"
                    }
                  />

                  <SettingRow
                    label="LAPLACE SIGMA"
                    value={
                      laplace
                        ? `${formatSigma(
                            laplace
                              .metadata
                              ?.sigma_min
                          )} → ${formatSigma(
                            laplace
                              .metadata
                              ?.sigma_max
                          )}`
                        : "-5 → 5"
                    }
                  />

                  <SettingRow
                    label="LAPLACE FREQUENCY GRID"
                    value={
                      laplace
                        ? `${formatNumber(
                            laplace
                              .frequencies_hz
                              ?.length
                          )} points`
                        : "128 points"
                    }
                  />

                </div>

              </div>

              <div className="workspace-panel">

                <PanelHeader
                  kicker="HELP"
                  title="Keyboard Navigation"
                />

                <button
                  type="button"
                  className="workspace-action-primary"
                  onClick={() =>
                    setShowShortcuts(
                      true
                    )
                  }
                >
                  <Info
                    size={15}
                  />
                  VIEW SHORTCUTS
                </button>

              </div>

            </section>
          )}

        </main>
      </div>
    </div>
  );
}


/* ============================================================
   WAVEFORM BARS
   ============================================================ */

function WaveformBars({
  points = [],
  zoom = 1,
  offset = 0,
}) {
  if (!points.length) {
    return null;
  }

  return (
    <div
      className="waveform-editor-inner"
      style={{
        transform:
          `translateX(${offset}px) scaleX(${zoom})`,
      }}
    >
      {points.map(
        (
          amplitude,
          index
        ) => (
          <span
            key={index}
            style={{
              height:
                `${Math.max(
                  4,
                  amplitude *
                    100
                )}%`,
            }}
          />
        )
      )}
    </div>
  );
}


/* ============================================================
   DSP WAVEFORM PANEL
   ============================================================ */

function DspWaveformPanel({
  title,
  kicker,
  points = [],
  currentTime = 0,
  duration = 0,
  onSeek,
}) {
  const percentage =
    duration > 0
      ? Math.min(
          100,
          Math.max(
            0,
            (currentTime /
              duration) *
              100
          )
        )
      : 0;

  function handleClick(
    event
  ) {
    if (
      !duration ||
      typeof onSeek !==
        "function"
    ) {
      return;
    }

    const rect =
      event.currentTarget.getBoundingClientRect();

    const fraction =
      Math.max(
        0,
        Math.min(
          1,
          (event.clientX -
            rect.left) /
            rect.width
        )
      );

    onSeek(
      fraction *
        duration
    );
  }

  return (
    <div className="workspace-panel dsp-source-waveform">

      <div className="panel-header">

        <div>
          <span className="panel-kicker">
            {kicker}
          </span>

          <h3>
            {title}
          </h3>
        </div>

        <span className="dsp-chart-range">
          {formatWaveformTime(
            currentTime
          )}{" "}
          /{" "}
          {formatWaveformTime(
            duration
          )}
        </span>

      </div>

      <div
        className="dsp-source-waveform-canvas"
        onClick={
          handleClick
        }
        role="slider"
        tabIndex={0}
        aria-label={title}
        aria-valuemin={0}
        aria-valuemax={
          duration
        }
        aria-valuenow={
          currentTime
        }
        onKeyDown={(
          event
        ) => {
          if (
            event.key ===
            "ArrowLeft"
          ) {
            event.preventDefault();

            if (
              typeof onSeek ===
              "function"
            ) {
              onSeek(
                Math.max(
                  0,
                  currentTime -
                    1
                )
              );
            }
          }

          if (
            event.key ===
            "ArrowRight"
          ) {
            event.preventDefault();

            if (
              typeof onSeek ===
              "function"
            ) {
              onSeek(
                Math.min(
                  duration,
                  currentTime +
                    1
                )
              );
            }
          }
        }}
      >

        {points.length ? (
          <svg
            viewBox="0 0 1000 220"
            preserveAspectRatio="none"
            role="img"
            aria-label="Source recording waveform"
          >
            <line
              x1="0"
              y1="110"
              x2="1000"
              y2="110"
              className="dsp-chart-grid-line"
            />

            <polyline
              points={createWaveformSvgPoints(
                points,
                1000,
                220
              )}
              fill="none"
              className="dsp-chart-line"
            />

            <line
              x1={
                percentage * 10
              }
              y1="0"
              x2={
                percentage * 10
              }
              y2="220"
              className="dsp-waveform-playhead"
            />
          </svg>
        ) : (
          <EmptyState
            title="No waveform available"
            text="The source recording waveform is not available."
          />
        )}

      </div>

    </div>
  );
}


/* ============================================================
   COMPONENTS
   ============================================================ */

function PanelHeader({
  kicker,
  title,
  icon,
}) {
  return (
    <div className="panel-header">

      <div>
        <span className="panel-kicker">
          {kicker}
        </span>

        <h3>
          {title}
        </h3>
      </div>

      {icon}

    </div>
  );
}


function Metric({
  label,
  value,
}) {
  return (
    <div className="workspace-metric">

      <span>
        {label}
      </span>

      <strong
        title={String(
          value
        )}
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
        <Icon
          size={17}
        />
      </div>

      <div>

        <span>
          {label}
        </span>

        <strong
          title={String(
            value
          )}
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

      <strong>
        {title}
      </strong>

      <span>
        {text}
      </span>

    </div>
  );
}


function Shortcut({
  keyName,
  label,
}) {
  return (
    <div className="shortcut-row">

      <kbd>
        {keyName}
      </kbd>

      <span>
        {label}
      </span>

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

      <span>
        {label}
      </span>

    </div>
  );
}


function SettingRow({
  label,
  value,
}) {
  return (
    <div className="setting-row">

      <span>
        {label}
      </span>

      <strong>
        {value}
      </strong>

    </div>
  );
}


function DspRow({
  label,
  value,
}) {
  return (
    <div className="dsp-table-row">

      <span>
        {label}
      </span>

      <strong>
        {value}
      </strong>

    </div>
  );
}


/* ============================================================
   DSP VISUALIZATION
   ============================================================ */

function DspVisualization({
  title,
  values,
  formatter,
}) {
  const data = useMemo(
    () =>
      flattenForChart(
        values
      ).slice(0, 400),
    [values]
  );

  if (!data.length) {
    return (
      <div className="workspace-panel">

        <div className="panel-header">

          <div>
            <span className="panel-kicker">
              SAGE DSP
            </span>

            <h3>
              {title}
            </h3>
          </div>

        </div>

        <EmptyState
          title="No visualization data"
          text="The current DSP result does not contain a plottable trace."
        />

      </div>
    );
  }

  const width = 900;
  const height = 230;

  const min =
    Math.min(...data);

  const rawMax =
    Math.max(...data);

  const max =
    rawMax === min
      ? min + 1
      : rawMax;

  const points = data
    .map(
      (
        value,
        index
      ) => {
        const x =
          data.length === 1
            ? width / 2
            : (index /
                (data.length -
                  1)) *
              width;

        const y =
          height -
          ((value - min) /
            (max - min)) *
            (height - 20) -
          10;

        return `${x},${y}`;
      }
    )
    .join(" ");

  const safeFormatter =
    typeof formatter ===
    "function"
      ? formatter
      : (value) =>
          String(value);

  return (
    <div className="workspace-panel dsp-chart-panel">

      <div className="panel-header">

        <div>
          <span className="panel-kicker">
            SAGE DSP
          </span>

          <h3>
            {title}
          </h3>
        </div>

        <span className="dsp-chart-range">
          {safeFormatter(
            min
          )}{" "}
          →{" "}
          {safeFormatter(
            max
          )}
        </span>

      </div>

      <div className="dsp-svg-chart">

        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={title}
        >

          <line
            x1="0"
            y1={
              height / 2
            }
            x2={width}
            y2={
              height / 2
            }
            className="dsp-chart-grid-line"
          />

          <polyline
            points={points}
            fill="none"
            className="dsp-chart-line"
          />

        </svg>

      </div>

    </div>
  );
}


/* ============================================================
   DATA HELPERS
   ============================================================ */

function getSampleMagnitude(
  value
) {
  if (
    typeof value ===
      "object" &&
    value !== null
  ) {
    const real =
      Number(
        value.real || 0
      );

    const imag =
      Number(
        value.imag || 0
      );

    return Math.sqrt(
      real * real +
        imag * imag
    );
  }

  return Math.abs(
    Number(value) || 0
  );
}


function buildWaveformPoints(
  source,
  count = 260
) {
  if (
    !Array.isArray(source) ||
    !source.length
  ) {
    return [];
  }

  const values =
    source.map(
      getSampleMagnitude
    );

  if (
    values.length <= count
  ) {
    const max =
      Math.max(
        ...values,
        1
      );

    return values.map(
      (value) =>
        value / max
    );
  }

  const points = [];

  const step =
    values.length /
    count;

  for (
    let i = 0;
    i < count;
    i += 1
  ) {
    const start =
      Math.floor(
        i * step
      );

    const end =
      Math.min(
        values.length,
        Math.max(
          start + 1,
          Math.floor(
            (i + 1) *
              step
          )
        )
      );

    let peak = 0;

    for (
      let j = start;
      j < end;
      j += 1
    ) {
      peak = Math.max(
        peak,
        values[j]
      );
    }

    points.push(
      peak
    );
  }

  const max =
    Math.max(
      ...points,
      1
    );

  return points.map(
    (value) =>
      value / max
  );
}


function createWaveformSvgPoints(
  points,
  width,
  height
) {
  if (!points.length) {
    return "";
  }

  const center =
    height / 2;

  const amplitude =
    height * 0.42;

  return points
    .map(
      (
        value,
        index
      ) => {
        const x =
          points.length ===
          1
            ? width / 2
            : (index /
                (points.length -
                  1)) *
              width;

        const normalized =
          Math.max(
            -1,
            Math.min(
              1,
              Number(value) ||
                0
            )
          );

        const y =
          center -
          normalized *
            amplitude;

        return `${x},${y}`;
      }
    )
    .join(" ");
}


function flattenForChart(
  value
) {
  if (
    !Array.isArray(value)
  ) {
    return [];
  }

  const output = [];

  function visit(item) {
    if (
      Array.isArray(item)
    ) {
      item.forEach(
        visit
      );

      return;
    }

    if (
      typeof item ===
        "object" &&
      item !== null
    ) {
      if (
        Number.isFinite(
          Number(
            item.real
          )
        )
      ) {
        const real =
          Number(
            item.real
          );

        const imag =
          Number(
            item.imag || 0
          );

        output.push(
          Math.sqrt(
            real * real +
              imag * imag
          )
        );

        return;
      }

      /*
       * Some DSP backends can return objects containing
       * a direct numeric value. Support that without
       * changing the existing result contract.
       */
      if (
        Number.isFinite(
          Number(
            item.value
          )
        )
      ) {
        output.push(
          Number(
            item.value
          )
        );
      }

      return;
    }

    const number =
      Number(item);

    if (
      Number.isFinite(
        number
      )
    ) {
      output.push(
        number
      );
    }
  }

  visit(value);

  return output;
}


function formatWaveformTime(
  value
) {
  const n =
    Number(value);

  if (
    !Number.isFinite(n) ||
    n < 0
  ) {
    return "00:00.000";
  }

  const minutes =
    Math.floor(
      n / 60
    );

  const seconds =
    Math.floor(
      n % 60
    );

  const millis =
    Math.floor(
      (n % 1) * 1000
    );

  return (
    `${String(
      minutes
    ).padStart(
      2,
      "0"
    )}:` +
    `${String(
      seconds
    ).padStart(
      2,
      "0"
    )}.` +
    `${String(
      millis
    ).padStart(
      3,
      "0"
    )}`
  );
}


function sanitizeFilename(
  filename
) {
  return String(
    filename
  )
    .replace(
      /[^a-zA-Z0-9._-]+/g,
      "_"
    )
    .replace(
      /^_+|_+$/g,
      ""
    )
    .slice(
      0,
      120
    ) ||
    "sage-rf-analysis";
}


export default Workspace;