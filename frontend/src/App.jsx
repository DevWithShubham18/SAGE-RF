import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Stars } from "@react-three/drei";
import AuthGate from "./auth/AuthGate.jsx";
import { auth } from "./firebase/firebase";
import {
  saveAnalysisHistory,
  loadAnalysisHistory,
} from "./firebase/history";

import {
  Activity,
  Cpu,
  FileSignal,
  Radio,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Upload,
  Waves,
  Zap,
  History,
  Home,
  LayoutDashboard,
  Monitor,
  RefreshCw,
  Clock3,
  Database,
  ChevronRight,
} from "lucide-react";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import "./styles.css";
import Workspace from "./components/workspace/Workspace.jsx";


/* ============================================================
   RF VISUAL CORE
   ============================================================ */

function RFCore() {
  const group = useRef(null);
  const rings = useRef([]);

  const particles = useMemo(() => {
    return Array.from({ length: 180 }, (_, i) => {
      const angle = (i / 180) * Math.PI * 2;
      const radius = 2.4 + Math.random() * 1.4;

      return {
        position: [
          Math.cos(angle) * radius,
          (Math.random() - 0.5) * 1.8,
          Math.sin(angle) * radius,
        ],
        speed: 0.2 + Math.random() * 0.5,
      };
    });
  }, []);

  useFrame((state, delta) => {
    if (!group.current) return;

    group.current.rotation.y += delta * 0.12;

    group.current.rotation.x =
      Math.sin(state.clock.elapsedTime * 0.3) * 0.08;

    rings.current.forEach((ring, index) => {
      if (!ring) return;

      ring.rotation.z += delta * (0.12 + index * 0.04);
      ring.rotation.x += delta * (0.05 + index * 0.02);
    });
  });

  return (
    <group ref={group}>
      <mesh>
        <icosahedronGeometry args={[1.05, 3]} />

        <meshStandardMaterial
          wireframe
          transparent
          opacity={0.55}
          emissive="#6ee7ff"
          emissiveIntensity={1.5}
        />
      </mesh>

      <mesh>
        <sphereGeometry args={[0.42, 32, 32]} />

        <meshStandardMaterial
          emissive="#22d3ee"
          emissiveIntensity={5}
          color="#082f49"
          roughness={0.15}
          metalness={0.8}
        />
      </mesh>

      {[1, 1.45, 1.9].map((scale, index) => (
        <mesh
          key={scale}
          ref={(element) => {
            rings.current[index] = element;
          }}
          scale={scale}
        >
          <torusGeometry args={[1.1, 0.012, 16, 128]} />

          <meshStandardMaterial
            color="#38bdf8"
            emissive="#38bdf8"
            emissiveIntensity={2}
            transparent
            opacity={0.45 - index * 0.08}
          />
        </mesh>
      ))}

      {particles.map((particle, index) => (
        <mesh key={index} position={particle.position}>
          <sphereGeometry args={[0.018, 8, 8]} />
          <meshBasicMaterial color="#67e8f9" />
        </mesh>
      ))}

      <pointLight
        color="#22d3ee"
        intensity={5}
        distance={8}
      />

      <pointLight
        color="#818cf8"
        intensity={3}
        distance={10}
      />
    </group>
  );
}


function RFScene() {
  return (
    <Canvas
      camera={{
        position: [0, 0, 7],
        fov: 45,
      }}
      dpr={[1, 2]}
      gl={{
        antialias: true,
        alpha: true,
      }}
    >
      <ambientLight intensity={0.3} />

      <Stars
        radius={60}
        depth={30}
        count={1000}
        factor={2}
        saturation={0}
        fade
        speed={0.25}
      />

      <Float
        speed={1.2}
        rotationIntensity={0.25}
        floatIntensity={0.6}
      >
        <RFCore />
      </Float>
    </Canvas>
  );
}


/* ============================================================
   SMALL UI COMPONENTS
   ============================================================ */

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}) {
  return (
    <div className="stat-card">
      <div className="stat-icon">
        <Icon size={17} />
      </div>

      <div>
        <div className="stat-label">
          {label}
        </div>

        <div
          className={`stat-value ${
            accent ? "accent" : ""
          }`}
        >
          {value}
        </div>
      </div>
    </div>
  );
}


function SignalBars({ active = true }) {
  return (
    <div
      className={`signal-bars ${
        active ? "active" : ""
      }`}
    >
      {Array.from({ length: 18 }).map((_, index) => (
        <span
          key={index}
          style={{
            animationDelay: `${index * 55}ms`,
            height: `${18 + ((index * 17) % 60)}%`,
          }}
        />
      ))}
    </div>
  );
}


function formatHz(value) {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(Number(value))
  ) {
    return "—";
  }

  const numericValue = Number(value);
  const abs = Math.abs(numericValue);

  if (abs >= 1_000_000) {
    return `${(numericValue / 1_000_000).toFixed(2)} MHz`;
  }

  if (abs >= 1_000) {
    return `${(numericValue / 1_000).toFixed(2)} kHz`;
  }

  return `${numericValue.toFixed(1)} Hz`;
}


/* ============================================================
   GLOBAL LOADING SCREEN
   ============================================================ */

function LoadingScreen({
  message = "PROCESSING SIGNAL",
  detail = "RF INTELLIGENCE ENGINE",
}) {
  return (
    <div className="sage-loading-screen">
      <div className="sage-loading-grid" />

      <div className="sage-loading-content">
        <div className="sage-loading-core">
          <div className="sage-loading-orbit orbit-one" />
          <div className="sage-loading-orbit orbit-two" />
          <div className="sage-loading-orbit orbit-three" />

          <div className="sage-loading-icon">
            <Radio size={31} />
          </div>
        </div>

        <div className="sage-loading-brand">
          SAGE<span>-RF</span>
        </div>

        <div className="sage-loading-title">
          {message}
        </div>

        <div className="sage-loading-subtitle">
          {detail}
        </div>

        <div className="sage-loading-bars">
          {Array.from({ length: 10 }).map((_, index) => (
            <span
              key={index}
              style={{
                animationDelay: `${index * 80}ms`,
              }}
            />
          ))}
        </div>

        <div className="sage-loading-status">
          <span className="status-dot online" />
          <span>SYSTEM ACTIVE</span>
        </div>
      </div>
    </div>
  );
}


/* ============================================================
   GLOBAL NAVIGATION
   ============================================================ */

function GlobalNavigation({
  activePage,
  onNavigate,
  historyCount = 0,
  backendOnline,
}) {
  const items = [
    {
      id: "HOME",
      label: "HOME",
      icon: Home,
    },
    {
      id: "ANALYSIS",
      label: "ANALYSIS",
      icon: LayoutDashboard,
    },
    {
      id: "HISTORY",
      label: "HISTORY",
      icon: History,
    },
    {
      id: "WORKSTATION",
      label: "WORKSTATION",
      icon: Monitor,
    },
  ];

  return (
    <nav className="sage-global-nav">
      <div className="sage-nav-brand">
        <div className="brand-mark">
          <Radio size={18} />
        </div>

        <div>
          <strong>
            SAGE<span>-RF</span>
          </strong>

          <small>
            SIGNAL INTELLIGENCE
          </small>
        </div>
      </div>

      <div className="sage-nav-tabs">
        {items.map((item) => {
          const Icon = item.icon;
          const active = activePage === item.id;

          return (
            <button
              key={item.id}
              type="button"
              className={
                active
                  ? "sage-nav-tab active"
                  : "sage-nav-tab"
              }
              onClick={() => onNavigate(item.id)}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={15} />

              <span>
                {item.label}
              </span>

              {item.id === "HISTORY" &&
                historyCount > 0 && (
                  <b>
                    {historyCount}
                  </b>
                )}
            </button>
          );
        })}
      </div>

      <div className="sage-nav-status">
        <span
          className={`status-dot ${
            backendOnline ? "online" : ""
          }`}
        />

        <span>
          {backendOnline
            ? "ENGINE ONLINE"
            : "ENGINE OFFLINE"}
        </span>
      </div>
    </nav>
  );
}


/* ============================================================
   HISTORY PAGE
   ============================================================ */

function HistoryPage({
  history,
  loading,
  error,
  onRefresh,
  onHome,
  onOpenAnalysis,
}) {
  return (
    <div className="sage-page">
      <div className="sage-page-header">
        <div>
          <div className="eyebrow">
            <span />
            SIGNAL ARCHIVE
          </div>

          <h1>
            Analysis history
          </h1>

          <p>
            Your previously analyzed RF
            recordings are stored securely
            under your Firebase account.
          </p>
        </div>

        <div className="sage-page-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={onRefresh}
            disabled={loading}
          >
            <RefreshCw
              size={15}
              className={loading ? "sage-spin" : ""}
            />

            REFRESH
          </button>

          <button
            type="button"
            className="primary-button"
            onClick={onHome}
          >
            <Home size={15} />
            HOME
          </button>
        </div>
      </div>

      {error && (
        <div className="error-box">
          <strong>
            History error
          </strong>

          <span>
            {error}
          </span>
        </div>
      )}

      {loading ? (
        <div className="history-loading">
          <div className="history-loading-icon">
            <Database size={23} />
          </div>

          <strong>
            LOADING SIGNAL HISTORY
          </strong>

          <span>
            Retrieving your analysis archive...
          </span>

          <div className="history-loading-bar">
            <span />
          </div>
        </div>
      ) : history.length === 0 ? (
        <div className="history-empty">
          <div className="history-empty-icon">
            <History size={30} />
          </div>

          <h3>
            No analysis history yet
          </h3>

          <p>
            Analyze an RF recording and
            your result will automatically
            appear here.
          </p>

          <button
            type="button"
            className="primary-button"
            onClick={onHome}
          >
            <Upload size={16} />
            ANALYZE A SIGNAL
          </button>
        </div>
      ) : (
        <div className="history-grid">
          {history.map((record) => {
            const uploaded =
              record.uploadedAt?.toDate
                ? record.uploadedAt.toDate()
                : null;

            const metadata =
              record.metadata || {};

            const spectrum =
              record.spectrum || {};

            const modulation =
              record.modulation || {};

            return (
              <article
                className="history-card"
                key={record.id}
              >
                <div className="history-card-top">
                  <div className="history-file-icon">
                    <FileSignal size={19} />
                  </div>

                  <div className="history-file-info">
                    <strong>
                      {record.filename ||
                        "Untitled signal"}
                    </strong>

                    <span>
                      {record.fileType ||
                        "RF recording"}
                    </span>
                  </div>

                  <span className="history-card-status">
                    VERIFIED
                  </span>
                </div>

                <div className="history-time">
                  <Clock3 size={13} />

                  {uploaded
                    ? uploaded.toLocaleString()
                    : "Recently analyzed"}
                </div>

                <div className="history-metrics">
                  <div>
                    <span>
                      SAMPLE RATE
                    </span>

                    <strong>
                      {metadata.sampleRate != null
                        ? `${Number(
                            metadata.sampleRate
                          ).toLocaleString()} Hz`
                        : "—"}
                    </strong>
                  </div>

                  <div>
                    <span>
                      DURATION
                    </span>

                    <strong>
                      {metadata.duration != null
                        ? `${Number(
                            metadata.duration
                          ).toFixed(3)} s`
                        : "—"}
                    </strong>
                  </div>

                  <div>
                    <span>
                      SIGNALS
                    </span>

                    <strong>
                      {record.detectionCount ??
                        record.detections
                          ?.candidate_count ??
                        0}
                    </strong>
                  </div>

                  <div>
                    <span>
                      SNR
                    </span>

                    <strong>
                      {spectrum.snr != null
                        ? `${Number(
                            spectrum.snr
                          ).toFixed(1)} dB`
                        : "—"}
                    </strong>
                  </div>
                </div>

                <div className="history-card-footer">
                  <div className="history-modulation">
                    <span>
                      MODULATION
                    </span>

                    <strong>
                      {modulation.modulation ||
                        modulation.name ||
                        "UNCLASSIFIED"}
                    </strong>
                  </div>

                  <button
                    type="button"
                    className="history-open-button"
                    onClick={() =>
                      onOpenAnalysis(record)
                    }
                  >
                    VIEW
                    <ChevronRight size={15} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}


/* ============================================================
   APP
   ============================================================ */

function App({ user }) {
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] =
    useState(false);
  const [historyError, setHistoryError] =
    useState("");

  const [activePage, setActivePage] =
    useState("HOME");

  const [file, setFile] = useState(null);
  const [sampleRate, setSampleRate] =
    useState("48000");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const [backendOnline, setBackendOnline] =
    useState(false);

  const [workspaceOpen, setWorkspaceOpen] =
    useState(false);

  const [isPlaying, setIsPlaying] =
    useState(false);

  const [audioUrl, setAudioUrl] =
    useState("");

  const [waveformSamples, setWaveformSamples] =
    useState([]);

  const [audioDuration, setAudioDuration] =
    useState(0);

  const [
    showLoadingScreen,
    setShowLoadingScreen,
  ] = useState(false);

  const [
    loadingMessage,
    setLoadingMessage,
  ] = useState("");

  const audioRef = useRef(null);
  const fileInput = useRef(null);


  /* ==========================================================
     FILE SELECTION
     ========================================================== */

  function handleFileSelect(event) {
    const selectedFile =
      event.target.files?.[0] || null;

    if (!selectedFile) {
      return;
    }

    setFile(selectedFile);
    setError("");
    setResult(null);
    setWorkspaceOpen(false);
    setActivePage("HOME");
    setIsPlaying(false);

    /*
     * Allows selecting the same file again
     * after clearing it.
     */
    event.target.value = "";
  }


  function openFilePicker() {
    fileInput.current?.click();
  }


  function clearSelectedFile() {
    setFile(null);
    setResult(null);
    setError("");
    setWorkspaceOpen(false);
    setActivePage("HOME");
    setIsPlaying(false);
    setAudioUrl("");
    setWaveformSamples([]);
    setAudioDuration(0);
  }


  /* ==========================================================
     LOAD FIREBASE HISTORY
     ========================================================== */

  async function refreshHistory() {
    if (!user) {
      setHistory([]);
      return;
    }

    setHistoryLoading(true);
    setHistoryError("");

    try {
      const records =
        await loadAnalysisHistory(user);

      setHistory(records);

      console.log(
        "SAGE-RF history loaded:",
        records.length
      );
    } catch (historyLoadError) {
      console.error(
        "SAGE-RF history load failed:",
        historyLoadError
      );

      setHistoryError(
        historyLoadError.message ||
          "Unable to load analysis history."
      );
    } finally {
      setHistoryLoading(false);
    }
  }


  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      if (!user) {
        setHistory([]);
        return;
      }

      setHistoryLoading(true);
      setHistoryError("");

      try {
        const records =
          await loadAnalysisHistory(user);

        if (!cancelled) {
          setHistory(records);

          console.log(
            "SAGE-RF history loaded:",
            records.length
          );
        }
      } catch (historyLoadError) {
        console.error(
          "SAGE-RF history load failed:",
          historyLoadError
        );

        if (!cancelled) {
          setHistoryError(
            historyLoadError.message ||
              "Unable to load analysis history."
          );
        }
      } finally {
        if (!cancelled) {
          setHistoryLoading(false);
        }
      }
    }

    loadHistory();

    return () => {
      cancelled = true;
    };
  }, [user]);


  /* ==========================================================
     SCROLL PROGRESS
     ========================================================== */

  useEffect(() => {
    const updateScrollProgress = () => {
      const maxScroll =
        document.documentElement.scrollHeight -
        window.innerHeight;

      const progress =
        maxScroll > 0
          ? Math.min(
              window.scrollY / maxScroll,
              1
            )
          : 0;

      document.documentElement.style.setProperty(
        "--scroll-progress",
        progress.toFixed(4)
      );
    };

    updateScrollProgress();

    window.addEventListener(
      "scroll",
      updateScrollProgress,
      {
        passive: true,
      }
    );

    window.addEventListener(
      "resize",
      updateScrollProgress
    );

    return () => {
      window.removeEventListener(
        "scroll",
        updateScrollProgress
      );

      window.removeEventListener(
        "resize",
        updateScrollProgress
      );
    };
  }, []);


  /* ==========================================================
     BACKEND HEALTH
     ========================================================== */

  useEffect(() => {
    let cancelled = false;

    async function checkBackend() {
      try {
        const response =
          await fetch("/api/health");

        if (!response.ok) {
          throw new Error();
        }

        await response.json();

        if (!cancelled) {
          setBackendOnline(true);
        }
      } catch {
        if (!cancelled) {
          setBackendOnline(false);
        }
      }
    }

    checkBackend();

    const interval =
      window.setInterval(
        checkBackend,
        15000
      );

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);


  /* ==========================================================
     AUDIO / WAV PROCESSING
     ========================================================== */

  useEffect(() => {
    if (!file) {
      setAudioUrl("");
      setWaveformSamples([]);
      setAudioDuration(0);
      return;
    }

    const isIQ =
      file.name
        .toLowerCase()
        .endsWith(".iq");

    /*
     * IQ files are raw complex samples,
     * not browser-playable audio.
     *
     * Do not send IQ data through
     * AudioContext.decodeAudioData().
     *
     * The backend/workstation is responsible
     * for IQ visualization.
     */
    if (isIQ) {
      setAudioUrl("");
      setWaveformSamples([]);
      setAudioDuration(0);
      return;
    }

    const url =
      URL.createObjectURL(file);

    setAudioUrl(url);

    let cancelled = false;

    async function decodeAudio() {
      let context = null;

      try {
        const AudioContextClass =
          window.AudioContext ||
          window.webkitAudioContext;

        if (!AudioContextClass) {
          throw new Error(
            "Web Audio API is not supported."
          );
        }

        context =
          new AudioContextClass();

        const buffer =
          await file.arrayBuffer();

        const audioBuffer =
          await context.decodeAudioData(
            buffer
          );

        if (cancelled) {
          return;
        }

        const channelCount =
          audioBuffer.numberOfChannels;

        const sampleCount =
          audioBuffer.length;

        setAudioDuration(
          audioBuffer.duration
        );

        const channels = [];

        for (
          let channel = 0;
          channel < channelCount;
          channel += 1
        ) {
          channels.push(
            audioBuffer.getChannelData(
              channel
            )
          );
        }

        const samples =
          new Float32Array(
            sampleCount
          );

        for (
          let i = 0;
          i < sampleCount;
          i += 1
        ) {
          let value = 0;

          for (
            let channel = 0;
            channel < channelCount;
            channel += 1
          ) {
            value +=
              channels[channel][i];
          }

          samples[i] =
            value /
            Math.max(
              channelCount,
              1
            );
        }

        setWaveformSamples(samples);

        console.log(
          "SAGE-RF WAV decoded:",
          {
            duration:
              audioBuffer.duration,
            sampleRate:
              audioBuffer.sampleRate,
            channels:
              channelCount,
            samples:
              sampleCount,
          }
        );
      } catch (decodeError) {
        console.error(
          "SAGE-RF WAV decode failed:",
          decodeError
        );

        setWaveformSamples([]);
        setAudioDuration(0);
      } finally {
        if (context) {
          try {
            await context.close();
          } catch {
            // Already closed.
          }
        }
      }
    }

    decodeAudio();

    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [file]);


  /* ==========================================================
     SPECTRUM DISPLAY DATA
     ========================================================== */

  const spectrumData = useMemo(() => {
    const spectrum =
      result?.spectrum;

    if (!spectrum) {
      return [];
    }

    const center =
      spectrum.peak_frequency_hz ??
      0;

    const bandwidth =
      spectrum.occupied_bandwidth_hz ??
      1000;

    return Array.from(
      { length: 80 },
      (_, index) => {
        const progress =
          index / 79;

        const frequency =
          center -
          bandwidth * 1.5 +
          progress *
            bandwidth *
            3;

        const distance =
          Math.abs(
            frequency -
              center
          );

        const peak =
          Math.max(
            0,
            1 -
              distance /
                Math.max(
                  bandwidth,
                  1
                )
          );

        const noise =
          0.08 +
          Math.sin(
            index * 1.7
          ) *
            0.025;

        return {
          frequency,
          power:
            noise +
            peak * 0.88,
        };
      }
    );
  }, [result]);


  /* ==========================================================
     NAVIGATION
     ========================================================== */

  function navigateTo(page) {
    if (page === "WORKSTATION") {
      if (!result) {
        setActivePage("HOME");
        return;
      }

      setShowLoadingScreen(true);
      setLoadingMessage(
        "INITIALIZING WORKSTATION"
      );

      window.setTimeout(() => {
        setWorkspaceOpen(true);
        setActivePage("WORKSTATION");
        setShowLoadingScreen(false);
      }, 900);

      return;
    }

    if (page === "ANALYSIS" && !result) {
      setActivePage("HOME");
      return;
    }

    if (page === "HISTORY") {
      setWorkspaceOpen(false);
      setActivePage("HISTORY");
      return;
    }

    if (page === "HOME") {
      setWorkspaceOpen(false);
    }

    setActivePage(page);
  }


  /* ==========================================================
     OPEN HISTORY RECORD
     ========================================================== */

  function openHistoryRecord(record) {
    if (!record) {
      return;
    }

    if (!record.result) {
      console.error(
        "SAGE-RF history record does not contain saved analysis result:",
        record
      );

      return;
    }

    setResult(record.result);
    setActivePage("HOME");

    console.log(
      "SAGE-RF historical analysis opened:",
      record.filename || "signal"
    );
  }


  /* ==========================================================
     ANALYZE SIGNAL
     ========================================================== */

  async function analyzeSignal() {
    if (!file) {
      return;
    }

    setLoading(true);
    setError("");

    setShowLoadingScreen(true);
    setLoadingMessage(
      "ANALYZING SIGNAL"
    );

    try {
      const formData =
        new FormData();

      formData.append(
        "file",
        file
      );

      if (
        file.name
          .toLowerCase()
          .endsWith(".iq")
      ) {
        formData.append(
          "iq_sample_rate",
          sampleRate
        );
      }

      /*
       * Firebase authentication.
       *
       * The backend expects:
       *
       * Authorization:
       * Bearer <Firebase ID token>
       */

      const currentUser =
        auth.currentUser;

      if (!currentUser) {
        throw new Error(
          "You must be signed in to analyze a signal."
        );
      }

      setLoadingMessage(
        "AUTHENTICATING SIGNAL SESSION"
      );

      const idToken =
        await currentUser.getIdToken();

      setLoadingMessage(
        "PROCESSING RF DATA"
      );

      const response =
        await fetch(
          "/api/analyze",
          {
            method: "POST",

            headers: {
              Authorization:
                `Bearer ${idToken}`,
            },

            body: formData,
          }
        );

      let data;

      try {
        data = await response.json();
      } catch {
        throw new Error(
          "The analysis engine returned an invalid response."
        );
      }

      if (!response.ok) {
        throw new Error(
          data.detail ||
            "RF analysis failed."
        );
      }

      setLoadingMessage(
        "FINALIZING SIGNAL INTELLIGENCE"
      );

      setResult(data);
      setActivePage("ANALYSIS");
      

      /*
       * Save analysis to Firebase history.
       *
       * A history-save failure must NOT
       * destroy a successful RF analysis.
       */

      try {
        const authenticatedUser =
          auth.currentUser;

        if (authenticatedUser) {
          const historyId =
            await saveAnalysisHistory(
              authenticatedUser,
              file,
              data
            );

          console.log(
            "SAGE-RF history saved:",
            historyId
          );

          /*
           * Refresh visible history
           * after a successful save.
           */

          try {
            const updatedHistory =
              await loadAnalysisHistory(
                authenticatedUser
              );

            setHistory(
              updatedHistory
            );
          } catch (refreshError) {
            console.warn(
              "SAGE-RF history refresh failed:",
              refreshError
            );
          }
        } else {
          console.warn(
            "No authenticated Firebase user. History was not saved."
          );
        }
      } catch (historyError) {
        console.error(
          "SAGE-RF history save failed:",
          historyError
        );

        /*
         * Do not show this as the main
         * analysis error because the RF
         * analysis itself succeeded.
         */
      }
    } catch (err) {
      console.error(
        "SAGE-RF analysis failed:",
        err
      );

      setError(
        err.message ||
          "Unable to analyze signal."
      );
    } finally {
      setLoading(false);

      window.setTimeout(() => {
        setShowLoadingScreen(false);
      }, 500);
    }
  }


  /* ==========================================================
     PLAYBACK
     ========================================================== */

  async function togglePlayback() {
    const audio =
      audioRef.current;

    if (!audio) {
      return;
    }

    try {
      if (audio.paused) {
        await audio.play();
        setIsPlaying(true);
      } else {
        audio.pause();
        setIsPlaying(false);
      }
    } catch (playbackError) {
      console.error(
        "Audio playback failed:",
        playbackError
      );

      setError(
        "This file cannot be played directly by the browser."
      );

      setIsPlaying(false);
    }
  }


  function stopPlayback() {
    const audio =
      audioRef.current;

    if (!audio) {
      return;
    }

    audio.pause();
    audio.currentTime = 0;
    setIsPlaying(false);
  }


  /* ==========================================================
     RESULT DATA
     ========================================================== */

  const detections =
    result?.detections?.candidates ||
    [];

  const modulation =
    result?.modulation;


  /* ==========================================================
     GLOBAL LOADING SCREEN
     ========================================================== */

  if (showLoadingScreen) {
    return (
      <LoadingScreen
        message={
          loadingMessage ||
          "PROCESSING SIGNAL"
        }
        detail={
          loading
            ? "RF ANALYSIS ENGINE"
            : "SIGNAL WORKSTATION"
        }
      />
    );
  }


  /* ==========================================================
     WORKSTATION
     ========================================================== */

  if (
    workspaceOpen &&
    result
  ) {
    return (
      <div className="sage-workstation-shell">
        <div className="sage-workstation-nav">
          <button
            type="button"
            className="sage-workstation-home"
            onClick={() => {
              setWorkspaceOpen(false);
              setActivePage("HOME");
            }}
          >
            <Home size={15} />
            HOME
          </button>

          <button
            type="button"
            className="sage-workstation-nav-item"
            onClick={() =>
              setActivePage("ANALYSIS")
            }
          >
            <LayoutDashboard size={15} />
            ANALYSIS
          </button>

          <button
            type="button"
            className="sage-workstation-nav-item active"
            aria-current="page"
          >
            <Monitor size={15} />
            WORKSTATION
          </button>

          <button
            type="button"
            className="sage-workstation-nav-item"
            onClick={() => {
              setWorkspaceOpen(false);
              setActivePage("HISTORY");
            }}
          >
            <History size={15} />
            HISTORY
          </button>

          <div className="sage-workstation-nav-spacer" />

          <span className="sage-workstation-file">
            {result.filename ||
              "UNTITLED CAPTURE"}
          </span>
        </div>

        <Workspace
          result={result}
          sourceFile={file}
          audioUrl={audioUrl}
          audioRef={audioRef}
          waveformSamples={waveformSamples}
          audioDuration={audioDuration}
          isPlaying={isPlaying}
          onPlayPause={togglePlayback}
          onStop={stopPlayback}
          onUpload={openFilePicker}
          onHome={() => {
            setWorkspaceOpen(false);
            setActivePage("HOME");
          }}
        />
      </div>
    );
  }


  /* ==========================================================
     HISTORY PAGE
     ========================================================== */

  if (
    activePage === "HISTORY"
  ) {
    return (
      <div className="app-shell sage-app-page-shell">
        <GlobalNavigation
          activePage={activePage}
          onNavigate={navigateTo}
          historyCount={history.length}
          backendOnline={backendOnline}
        />

        <HistoryPage
          history={history}
          loading={historyLoading}
          error={historyError}
          onRefresh={refreshHistory}
          onHome={() =>
            navigateTo("HOME")
          }
          onOpenAnalysis={openHistoryRecord}
        />

        <footer>
          <div>
            SAGE-RF / SIGNAL INTELLIGENCE
          </div>

          <div>
            RF ANALYSIS ENGINE v1.0
          </div>
        </footer>

        <input
          ref={fileInput}
          type="file"
          accept=".iq,.wav"
          hidden
          onChange={handleFileSelect}
        />
      </div>
    );
  }


  /* ==========================================================
     MAIN APPLICATION
     ========================================================== */

  return (
    <div className="app-shell">
      <div className="noise-layer" />

      <GlobalNavigation
        activePage={activePage}
        onNavigate={navigateTo}
        historyCount={history.length}
        backendOnline={backendOnline}
      />

      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <Radio size={20} />
          </div>

          <div>
            <div className="brand-name">
              SAGE<span>-RF</span>
            </div>

            <div className="brand-subtitle">
              RF INTELLIGENCE PLATFORM
            </div>
          </div>
        </div>

        <div className="topbar-status">
          <span
            className={`status-dot ${
              backendOnline
                ? "online"
                : ""
            }`}
          />

          {backendOnline
            ? "ANALYSIS ENGINE ONLINE"
            : "CONNECTING TO ENGINE"}
        </div>
      </header>


      <main>
        {/* =====================================================
            HERO
            ===================================================== */}

        <section className="hero cinematic-hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span />
              NEXT-GENERATION SIGNAL INTELLIGENCE
            </div>

            <h1>
              See the
              <br />

              <span className="gradient-text">
                invisible spectrum.
              </span>
            </h1>

            <p>
              Upload raw RF recordings and
              transform complex signal data
              into actionable intelligence.
            </p>

            <div className="hero-chips">
              <span>
                <Zap size={13} />
                REAL-TIME DSP
              </span>

              <span>
                <ScanSearch size={13} />
                SIGNAL DETECTION
              </span>

              <span>
                <Cpu size={13} />
                MODULATION AI
              </span>
            </div>

            <div className="hero-navigation-cards">
              <button
                type="button"
                onClick={() =>
                  navigateTo("HISTORY")
                }
              >
                <History size={17} />

                <span>
                  <strong>
                    ANALYSIS HISTORY
                  </strong>

                  <small>
                    {history.length} stored
                    analysis
                    {history.length === 1
                      ? ""
                      : "es"}
                  </small>
                </span>

                <ChevronRight size={16} />
              </button>

              {result && (
                <button
                  type="button"
                  onClick={() =>
                    navigateTo("WORKSTATION")
                  }
                >
                  <Monitor size={17} />

                  <span>
                    <strong>
                      OPEN WORKSTATION
                    </strong>

                    <small>
                      Inspect the active
                      signal
                    </small>
                  </span>

                  <ChevronRight size={16} />
                </button>
              )}
            </div>
          </div>


          <div className="hero-visual cinematic-visual">
            <div className="orb-glow" />

            <RFScene />

            <div className="visual-readout readout-top">
              <span>
                SPECTRUM ENGINE
              </span>

              <strong>
                ACTIVE
              </strong>
            </div>

            <div className="visual-readout readout-bottom">
              <span>
                DSP CORE
              </span>

              <strong>
                SCANNING
              </strong>
            </div>
          </div>
        </section>


        {/* =====================================================
            QUICK APP NAVIGATION
            ===================================================== */}

        <section className="sage-home-tabs">
          <button
            type="button"
            className="active"
            onClick={() =>
              navigateTo("HOME")
            }
          >
            <Home size={16} />
            HOME
          </button>

          <button
            type="button"
            onClick={() =>
              result
                ? navigateTo("ANALYSIS")
                : document
                    .getElementById(
                      "signal-upload"
                    )
                    ?.scrollIntoView({
                      behavior: "smooth",
                    })
            }
          >
            <LayoutDashboard size={16} />
            ANALYSIS
          </button>

          <button
            type="button"
            onClick={() =>
              navigateTo("HISTORY")
            }
          >
            <History size={16} />
            HISTORY

            {history.length > 0 && (
              <span>
                {history.length}
              </span>
            )}
          </button>

          <button
            type="button"
            disabled={!result}
            onClick={() =>
              navigateTo("WORKSTATION")
            }
          >
            <Monitor size={16} />
            WORKSTATION
          </button>
        </section>


        {/* =====================================================
            UPLOAD / ANALYSIS WORKSPACE
            ===================================================== */}

        <section
          className="workspace"
          id="signal-upload"
        >
          <div className="section-heading">
            <div>
              <div className="eyebrow">
                <span />
                SIGNAL WORKSPACE
              </div>

              <h2>
                Analyze an RF recording
              </h2>

              <p className="section-heading-description">
                Process IQ or WAV recordings
                through the authenticated
                SAGE-RF DSP pipeline.
              </p>
            </div>

            <div className="engine-pill">
              <Activity size={15} />
              GNU RADIO / SCIPY PIPELINE
            </div>
          </div>


          <div className="upload-panel">
            <button
              type="button"
              className={`drop-zone ${
                file ? "selected" : ""
              }`}
              onClick={openFilePicker}
            >
              <div className="upload-icon">
                {file ? (
                  <FileSignal size={28} />
                ) : (
                  <Upload size={28} />
                )}
              </div>

              <div className="upload-title">
                {file
                  ? file.name
                  : "Drop an RF recording here"}
              </div>

              <div className="upload-description">
                {file
                  ? `${(
                      file.size /
                      1024 /
                      1024
                    ).toFixed(2)} MB · Ready for analysis`
                  : "or click to browse · .IQ and .WAV supported"}
              </div>

              <div className="upload-line">
                <span />
              </div>
            </button>


            {file?.name
              .toLowerCase()
              .endsWith(".iq") && (
              <div className="input-row">
                <label>
                  IQ SAMPLE RATE

                  <input
                    type="number"
                    min="1"
                    value={sampleRate}
                    onChange={(event) =>
                      setSampleRate(
                        event.target.value
                      )
                    }
                  />
                </label>

                <div className="format-info">
                  <span>
                    FORMAT
                  </span>

                  <strong>
                    COMPLEX64 IQ
                  </strong>
                </div>
              </div>
            )}


            <div className="action-row">
              <button
                type="button"
                className="primary-button"
                disabled={!file || loading}
                onClick={analyzeSignal}
              >
                {loading ? (
                  <>
                    <span className="spinner" />
                    ANALYZING SIGNAL...
                  </>
                ) : (
                  <>
                    <Sparkles size={17} />
                    ANALYZE SIGNAL
                  </>
                )}
              </button>


              {file && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={clearSelectedFile}
                >
                  CLEAR
                </button>
              )}


              {result && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    navigateTo("WORKSTATION")
                  }
                >
                  <Monitor size={15} />
                  OPEN WORKSTATION
                </button>
              )}
            </div>


            {error && (
              <div className="error-box">
                <strong>
                  Analysis error
                </strong>

                <span>
                  {error}
                </span>
              </div>
            )}
          </div>
        </section>


        {/* =====================================================
            RESULTS
            ===================================================== */}

        {result && (
          <section className="results-section">
            <div className="section-heading">
              <div>
                <div className="eyebrow">
                  <span />
                  ANALYSIS COMPLETE
                </div>

                <h2>
                  Signal intelligence
                </h2>

                <p className="section-heading-description">
                  Analysis completed successfully
                  and stored in your personal
                  signal archive.
                </p>
              </div>


              <div className="results-actions">
                <div className="success-pill">
                  <ShieldCheck size={15} />
                  ANALYSIS VERIFIED
                </div>


                <button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    navigateTo("HISTORY")
                  }
                >
                  <History size={15} />
                  HISTORY
                </button>


                <button
                  type="button"
                  className="workspace-launch-button"
                  onClick={() =>
                    navigateTo("WORKSTATION")
                  }
                >
                  <Monitor size={15} />
                  OPEN WORKSTATION
                </button>
              </div>
            </div>


            <div className="stats-grid">
              <StatCard
                icon={Waves}
                label="SAMPLE RATE"
                value={`${Number(
                  result.metadata
                    ?.sample_rate ||
                    0
                ).toLocaleString()} Hz`}
              />

              <StatCard
                icon={Activity}
                label="DURATION"
                value={`${Number(
                  result.metadata
                    ?.duration_seconds ||
                    0
                ).toFixed(3)} s`}
              />

              <StatCard
                icon={Radio}
                label="SIGNALS DETECTED"
                value={
                  result.detections
                    ?.candidate_count ??
                  0
                }
                accent
              />

              <StatCard
                icon={ScanSearch}
                label="PEAK FREQUENCY"
                value={formatHz(
                  result.spectrum
                    ?.peak_frequency_hz
                )}
              />
            </div>


            <div className="analysis-grid">
              <div className="glass-panel spectrum-panel">
                <div className="panel-header">
                  <div>
                    <span className="panel-kicker">
                      FREQUENCY DOMAIN
                    </span>

                    <h3>
                      Signal Spectrum
                    </h3>
                  </div>

                  <span className="live-badge">
                    <span />
                    LIVE ANALYSIS
                  </span>
                </div>


                <div className="chart-wrap">
                  <ResponsiveContainer
                    width="100%"
                    height="100%"
                  >
                    <AreaChart
                      data={spectrumData}
                    >
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
                            stopColor="#22d3ee"
                            stopOpacity={0.45}
                          />

                          <stop
                            offset="100%"
                            stopColor="#22d3ee"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>


                      <CartesianGrid
                        stroke="rgba(148,163,184,0.09)"
                        vertical={false}
                      />


                      <XAxis
                        dataKey="frequency"
                        tickFormatter={formatHz}
                        stroke="#64748b"
                        tick={{
                          fontSize: 10,
                        }}
                      />


                      <YAxis
                        hide
                        domain={[0, 1.1]}
                      />


                      <Tooltip
                        formatter={(value) =>
                          `${(
                            Number(value) *
                            100
                          ).toFixed(1)}%`
                        }
                        labelFormatter={(value) =>
                          formatHz(
                            Number(value)
                          )
                        }
                        contentStyle={{
                          background:
                            "#07101d",
                          border:
                            "1px solid rgba(148,163,184,0.18)",
                          borderRadius: 12,
                        }}
                      />


                      <Area
                        type="monotone"
                        dataKey="power"
                        stroke="#67e8f9"
                        strokeWidth={2}
                        fill="url(#spectrumFill)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>


                <div className="spectrum-footer">
                  <div>
                    <span>
                      PEAK
                    </span>

                    <strong>
                      {formatHz(
                        result.spectrum
                          ?.peak_frequency_hz
                      )}
                    </strong>
                  </div>


                  <div>
                    <span>
                      SNR
                    </span>

                    <strong>
                      {result.spectrum
                        ?.snr_db != null
                        ? `${Number(
                            result.spectrum.snr_db
                          ).toFixed(1)} dB`
                        : "—"}
                    </strong>
                  </div>


                  <div>
                    <span>
                      OCCUPIED BW
                    </span>

                    <strong>
                      {formatHz(
                        result.spectrum
                          ?.occupied_bandwidth_hz
                      )}
                    </strong>
                  </div>
                </div>
              </div>


              <div className="glass-panel modulation-panel">
                <div className="panel-header">
                  <div>
                    <span className="panel-kicker">
                      CLASSIFICATION ENGINE
                    </span>

                    <h3>
                      Modulation Intelligence
                    </h3>
                  </div>
                </div>


                {modulation ? (
                  <>
                    <div className="classification">
                      <div className="classification-orb">
                        <Sparkles size={27} />
                      </div>

                      <div>
                        <span>
                          PRIMARY CLASSIFICATION
                        </span>

                        <strong>
                          {modulation.modulation}
                        </strong>
                      </div>

                      <div className="confidence">
                        {(
                          Number(
                            modulation.confidence
                          ) *
                          100
                        ).toFixed(1)}

                        <small>
                          %
                        </small>
                      </div>
                    </div>


                    <div className="confidence-track">
                      <span
                        style={{
                          width: `${Math.min(
                            100,
                            Math.max(
                              0,
                              Number(
                                modulation.confidence
                              ) * 100
                            )
                          )}%`,
                        }}
                      />
                    </div>


                    <div className="evidence-grid">
                      <div>
                        <span>
                          PSK SCORE
                        </span>

                        <strong>
                          {Number(
                            modulation
                              .evidence
                              ?.psk_score ||
                              0
                          ).toFixed(3)}
                        </strong>
                      </div>


                      <div>
                        <span>
                          FSK SCORE
                        </span>

                        <strong>
                          {Number(
                            modulation
                              .evidence
                              ?.fsk_score ||
                              0
                          ).toFixed(3)}
                        </strong>
                      </div>


                      <div>
                        <span>
                          QAM SCORE
                        </span>

                        <strong>
                          {Number(
                            modulation
                              .evidence
                              ?.qam_score ||
                              0
                          ).toFixed(3)}
                        </strong>
                      </div>


                      <div>
                        <span>
                          AMPLITUDE CV
                        </span>

                        <strong>
                          {Number(
                            modulation
                              .evidence
                              ?.amplitude_cv ||
                              0
                          ).toFixed(4)}
                        </strong>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="empty-state">
                    No modulation classification
                    available.
                  </div>
                )}
              </div>
            </div>


            <div className="glass-panel detection-panel">
              <div className="panel-header">
                <div>
                  <span className="panel-kicker">
                    SPECTRAL DETECTOR
                  </span>

                  <h3>
                    Detected RF Signals
                  </h3>
                </div>

                <span className="count-pill">
                  {detections.length}{" "}
                  CANDIDATE
                  {detections.length === 1
                    ? ""
                    : "S"}
                </span>
              </div>


              <div className="mini-signal-visual">
                <SignalBars />
              </div>


              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>

                      <th>
                        CENTER FREQUENCY
                      </th>

                      <th>
                        BANDWIDTH
                      </th>

                      <th>
                        PEAK
                      </th>

                      <th>
                        SNR
                      </th>

                      <th>
                        CONFIDENCE
                      </th>

                      <th>
                        MODULATION
                      </th>
                    </tr>
                  </thead>


                  <tbody>
                    {detections.map(
                      (
                        candidate,
                        index
                      ) => (
                        <tr
                          key={`${candidate.center_frequency_hz}-${index}`}
                        >
                          <td>
                            <span className="row-index">
                              {String(
                                index + 1
                              ).padStart(
                                2,
                                "0"
                              )}
                            </span>
                          </td>


                          <td>
                            {formatHz(
                              candidate.center_frequency_hz
                            )}
                          </td>


                          <td>
                            {formatHz(
                              candidate.bandwidth_hz
                            )}
                          </td>


                          <td>
                            {formatHz(
                              candidate.peak_frequency_hz
                            )}
                          </td>


                          <td className="positive">
                            {Number(
                              candidate.snr_db ||
                                0
                            ).toFixed(1)}{" "}
                            dB
                          </td>


                          <td>
                            <span className="confidence-badge">
                              {(
                                Number(
                                  candidate.confidence ||
                                    0
                                ) *
                                100
                              ).toFixed(1)}
                              %
                            </span>
                          </td>


                          <td>
                            <span className="modulation-badge">
                              {candidate.modulation ||
                                "—"}
                            </span>
                          </td>
                        </tr>
                      )
                    )}


                    {detections.length === 0 && (
                      <tr>
                        <td colSpan="7">
                          <div className="empty-state">
                            No RF candidates
                            detected.
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>


            <div className="glass-panel telemetry-panel">
              <div>
                <span className="panel-kicker">
                  SIGNAL TELEMETRY
                </span>

                <h3>
                  System diagnostics
                </h3>
              </div>


              <div className="telemetry-grid">
                <div>
                  <span>
                    INPUT FORMAT
                  </span>

                  <strong>
                    {result.metadata
                      ?.source_format ||
                      "—"}
                  </strong>
                </div>


                <div>
                  <span>
                    SAMPLE COUNT
                  </span>

                  <strong>
                    {Number(
                      result.metadata
                        ?.sample_count ||
                        0
                    ).toLocaleString()}
                  </strong>
                </div>


                <div>
                  <span>
                    MEAN POWER
                  </span>

                  <strong>
                    {result.metadata
                      ?.mean_power !=
                    null
                      ? Number(
                          result.metadata
                            .mean_power
                        ).toFixed(6)
                      : "—"}
                  </strong>
                </div>


                <div>
                  <span>
                    DETECTOR
                  </span>

                  <strong>
                    {result.diagnostics
                      ?.signal_detector ||
                      "SPECTRAL"}
                  </strong>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>


      <footer>
        <div>
          SAGE-RF / SIGNAL INTELLIGENCE
        </div>

        <div>
          RF ANALYSIS ENGINE v1.0
        </div>
      </footer>


      {/* ========================================================
          SINGLE GLOBAL FILE INPUT
          ======================================================== */}

      <input
        ref={fileInput}
        type="file"
        accept=".iq,.wav"
        hidden
        onChange={handleFileSelect}
      />
    </div>
  );
}


/* ============================================================
   FIREBASE AUTH WRAPPER
   ============================================================ */

function AppWithAuth() {
  return (
    <AuthGate>
      {(user) => (
        <App user={user} />
      )}
    </AuthGate>
  );
}


export default AppWithAuth;
