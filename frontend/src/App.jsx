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
  Clock3,
  Database,
  RefreshCw,
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


function RFCore() {
  const group = useRef();
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

      ring.rotation.z +=
        delta * (0.12 + index * 0.04);

      ring.rotation.x +=
        delta * (0.05 + index * 0.02);
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
          <torusGeometry
            args={[1.1, 0.012, 16, 128]}
          />

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
        <mesh
          key={index}
          position={particle.position}
        >
          <sphereGeometry
            args={[0.018, 8, 8]}
          />

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
      {Array.from({ length: 18 }).map(
        (_, index) => (
          <span
            key={index}
            style={{
              animationDelay: `${index * 55}ms`,
              height: `${
                18 + ((index * 17) % 60)
              }%`,
            }}
          />
        )
      )}
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


function formatHistoryDate(value) {
  if (!value) {
    return "Unknown date";
  }

  try {
    let date;

    if (
      typeof value === "object" &&
      typeof value.toDate === "function"
    ) {
      date = value.toDate();
    } else {
      date = new Date(value);
    }

    if (Number.isNaN(date.getTime())) {
      return "Unknown date";
    }

    return date.toLocaleString();
  } catch {
    return "Unknown date";
  }
}


function getHistoryModulation(record) {
  return (
    record?.modulation?.name ||
    "Unknown"
  );
}


function App({ user }) {
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] =
    useState(false);
  const [historyError, setHistoryError] =
    useState("");

  const [file, setFile] = useState(null);

  const [sampleRate, setSampleRate] =
    useState("48000");

  const [loading, setLoading] =
    useState(false);

  const [result, setResult] =
    useState(null);

  const [error, setError] =
    useState("");

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

  const audioRef = useRef(null);
  const fileInput = useRef(null);


  /*
   * LOAD FIREBASE ANALYSIS HISTORY
   *
   * Each authenticated user gets their own
   * users/{uid}/analyses collection.
   */
  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      if (!user) {
        setHistory([]);
        setHistoryError("");
        setHistoryLoading(false);
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
            historyLoadError?.message ||
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


  /*
   * SCROLL PROGRESS
   */
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


  /*
   * BACKEND HEALTH CHECK
   */
  useEffect(() => {
    let cancelled = false;

    fetch("/api/health")
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            "Backend health check failed."
          );
        }

        return response.json();
      })
      .then(() => {
        if (!cancelled) {
          setBackendOnline(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBackendOnline(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);


  /*
   * CREATE LOCAL AUDIO URL + DECODE WAV
   */
  useEffect(() => {
    if (!file) {
      setAudioUrl("");
      setWaveformSamples([]);
      setAudioDuration(0);
      return undefined;
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

        setWaveformSamples(
          samples
        );

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

        if (!cancelled) {
          setWaveformSamples([]);
          setAudioDuration(0);
        }
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


  /*
   * DISPLAY SPECTRUM DATA
   */
  const spectrumData = useMemo(() => {
    const spectrum =
      result?.spectrum;

    if (!spectrum) {
      return [];
    }

    const center =
      Number(
        spectrum.peak_frequency_hz
      ) || 0;

    const bandwidth =
      Number(
        spectrum.occupied_bandwidth_hz
      ) || 1000;

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
            frequency - center
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
          Math.sin(index * 1.7) *
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


  /*
   * ANALYZE SIGNAL
   */
  async function analyzeSignal() {
    if (!file) {
      setError(
        "Please select an RF recording first."
      );
      return;
    }

    setLoading(true);
    setError("");

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
       * The backend requires:
       *
       * Authorization: Bearer <Firebase ID token>
       */
      const currentUser =
        auth.currentUser;

      if (!currentUser) {
        throw new Error(
          "You must be signed in to analyze a signal."
        );
      }

      /*
       * Force-refreshing is not necessary for
       * normal requests. Firebase automatically
       * refreshes the token when required.
       */
      const idToken =
        await currentUser.getIdToken();

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

      let data = null;

      try {
        data =
          await response.json();
      } catch {
        throw new Error(
          "The analysis server returned an invalid response."
        );
      }

      if (!response.ok) {
        throw new Error(
          data?.detail ||
            "RF analysis failed."
        );
      }

      /*
       * Show analysis immediately.
       */
      setResult(data);


      /*
       * SAVE ANALYSIS HISTORY
       *
       * Firestore path:
       *
       * users/{uid}/analyses/{analysisId}
       */
      try {
        const historyUser =
          auth.currentUser;

        if (historyUser) {
          const historyId =
            await saveAnalysisHistory(
              historyUser,
              file,
              data
            );

          console.log(
            "SAGE-RF history saved:",
            historyId
          );


          /*
           * Immediately update the UI instead
           * of waiting for another login.
           */
          const newHistoryRecord = {
            id: historyId,

            filename:
              file.name,

            fileSize:
              file.size,

            fileType:
              file.type ||
              "unknown",

            uploadedAt:
              new Date(),

            metadata: {
              sourceFormat:
                data.metadata
                  ?.source_format ||
                "",

              sampleRate:
                data.metadata
                  ?.sample_rate ||
                null,

              duration:
                data.metadata
                  ?.duration_seconds ||
                null,

              sampleCount:
                data.metadata
                  ?.sample_count ||
                null,

              meanPower:
                data.metadata
                  ?.mean_power ||
                null,
            },

            spectrum: {
              peakFrequency:
                data.spectrum
                  ?.peak_frequency_hz ||
                null,

              occupiedBandwidth:
                data.spectrum
                  ?.occupied_bandwidth_hz ||
                null,

              snr:
                data.spectrum
                  ?.snr_db ||
                null,
            },

            modulation: {
              name:
                data.modulation
                  ?.modulation ||
                null,

              confidence:
                data.modulation
                  ?.confidence ||
                null,
            },

            detectionCount:
              data.detections
                ?.candidate_count ||
              0,
          };

          setHistory(
            (previousHistory) => [
              newHistoryRecord,
              ...previousHistory,
            ]
          );

          setHistoryError("");
        } else {
          console.warn(
            "No authenticated Firebase user. History was not saved."
          );
        }
      } catch (historySaveError) {
        /*
         * History failure should NOT make the
         * actual RF analysis fail.
         */
        console.error(
          "SAGE-RF history save failed:",
          historySaveError
        );

        setHistoryError(
          historySaveError?.message ||
            "Analysis completed, but history could not be saved."
        );
      }
    } catch (err) {
      console.error(
        "SAGE-RF analysis failed:",
        err
      );

      setError(
        err?.message ||
          "Unable to analyze signal."
      );
    } finally {
      setLoading(false);
    }
  }


  /*
   * PLAY / PAUSE
   */
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


  /*
   * STOP PLAYBACK
   */
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


  const detections =
    result?.detections?.candidates ||
    [];

  const modulation =
    result?.modulation;


  /*
   * WORKSTATION
   */
  if (
    workspaceOpen &&
    result
  ) {
    return (
      <Workspace
        result={result}
        sourceFile={file}
        audioUrl={audioUrl}
        audioRef={audioRef}
        waveformSamples={
          waveformSamples
        }
        audioDuration={
          audioDuration
        }
        isPlaying={
          isPlaying
        }
        onPlayPause={
          togglePlayback
        }
        onStop={
          stopPlayback
        }
        onUpload={() =>
          fileInput.current?.click()
        }
      />
    );
  }


  return (
    <div className="app-shell">
      <div className="noise-layer" />

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


        <section className="workspace">
          <div className="section-heading">
            <div>
              <div className="eyebrow">
                <span />
                SIGNAL WORKSPACE
              </div>

              <h2>
                Analyze an RF recording
              </h2>
            </div>

            <div className="engine-pill">
              <Activity size={15} />
              GNU RADIO / SCIPY PIPELINE
            </div>
          </div>


          <div className="upload-panel">
            <input
              ref={fileInput}
              type="file"
              accept=".iq,.wav"
              hidden
              onChange={(event) => {
                setFile(
                  event.target.files?.[0] ||
                    null
                );

                setError("");
                setResult(null);
              }}
            />


            <button
              type="button"
              className={`drop-zone ${
                file
                  ? "selected"
                  : ""
              }`}
              onClick={() =>
                fileInput.current?.click()
              }
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
                    ).toFixed(
                      2
                    )} MB · Ready for analysis`
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
                    value={
                      sampleRate
                    }
                    onChange={(
                      event
                    ) =>
                      setSampleRate(
                        event.target
                          .value
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
                disabled={
                  !file ||
                  loading
                }
                onClick={
                  analyzeSignal
                }
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
                  onClick={() => {
                    setFile(null);
                    setResult(null);
                    setError("");

                    if (fileInput.current) {
                      fileInput.current.value =
                        "";
                    }
                  }}
                >
                  CLEAR
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


        {/*
         * ANALYSIS HISTORY
         *
         * This is intentionally outside the
         * current result section so the user's
         * previous analyses remain visible
         * after a new login.
         */}
        <section className="results-section history-section">
          <div className="section-heading">
            <div>
              <div className="eyebrow">
                <span />
                FIREBASE ARCHIVE
              </div>

              <h2>
                Analysis history
              </h2>
            </div>

            <div className="engine-pill">
              <Database size={15} />
              {user
                ? "USER HISTORY"
                : "AUTHENTICATION REQUIRED"}
            </div>
          </div>


          <div className="glass-panel">
            {historyLoading ? (
              <div className="empty-state">
                <RefreshCw
                  size={18}
                  className="spin"
                />

                <span>
                  Loading analysis history...
                </span>
              </div>
            ) : historyError ? (
              <div className="error-box">
                <strong>
                  History error
                </strong>

                <span>
                  {historyError}
                </span>
              </div>
            ) : history.length === 0 ? (
              <div className="empty-state">
                <Clock3 size={20} />

                <span>
                  No saved analyses yet.
                </span>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>
                        SIGNAL
                      </th>
                      <th>
                        FORMAT
                      </th>
                      <th>
                        SAMPLE RATE
                      </th>
                      <th>
                        MODULATION
                      </th>
                      <th>
                        PEAK
                      </th>
                      <th>
                        SNR
                      </th>
                      <th>
                        DETECTIONS
                      </th>
                      <th>
                        SAVED
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {history.map(
                      (
                        record,
                        index
                      ) => (
                        <tr
                          key={
                            record.id ||
                            `${record.filename}-${index}`
                          }
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
                            <strong>
                              {record.filename ||
                                "Untitled signal"}
                            </strong>
                          </td>

                          <td>
                            {record.metadata
                              ?.sourceFormat ||
                              record.fileType ||
                              "—"}
                          </td>

                          <td>
                            {record.metadata
                              ?.sampleRate !=
                            null
                              ? `${Number(
                                  record.metadata
                                    .sampleRate
                                ).toLocaleString()} Hz`
                              : "—"}
                          </td>

                          <td>
                            <span className="modulation-badge">
                              {getHistoryModulation(
                                record
                              )}
                            </span>
                          </td>

                          <td>
                            {formatHz(
                              record.spectrum
                                ?.peakFrequency
                            )}
                          </td>

                          <td className="positive">
                            {record.spectrum
                              ?.snr != null
                              ? `${Number(
                                  record.spectrum
                                    .snr
                                ).toFixed(
                                  1
                                )} dB`
                              : "—"}
                          </td>

                          <td>
                            {record.detectionCount ??
                              0}
                          </td>

                          <td>
                            {formatHistoryDate(
                              record.uploadedAt
                            )}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>


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
              </div>


              <div className="results-actions">
                <div className="success-pill">
                  <ShieldCheck size={15} />
                  ANALYSIS VERIFIED
                </div>


                <button
                  type="button"
                  className="workspace-launch-button"
                  onClick={() =>
                    setWorkspaceOpen(
                      true
                    )
                  }
                >
                  <Sparkles size={15} />
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
                ).toFixed(
                  3
                )} s`}
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
                      data={
                        spectrumData
                      }
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
                            stopOpacity={
                              0.45
                            }
                          />

                          <stop
                            offset="100%"
                            stopColor="#22d3ee"
                            stopOpacity={
                              0
                            }
                          />
                        </linearGradient>
                      </defs>


                      <CartesianGrid
                        stroke="rgba(148,163,184,0.09)"
                        vertical={
                          false
                        }
                      />


                      <XAxis
                        dataKey="frequency"
                        tickFormatter={
                          formatHz
                        }
                        stroke="#64748b"
                        tick={{
                          fontSize: 10,
                        }}
                      />


                      <YAxis
                        hide
                        domain={[
                          0,
                          1.1,
                        ]}
                      />


                      <Tooltip
                        formatter={(
                          value
                        ) =>
                          `${(
                            Number(
                              value
                            ) *
                            100
                          ).toFixed(
                            1
                          )}%`
                        }
                        labelFormatter={(
                          value
                        ) =>
                          formatHz(
                            Number(
                              value
                            )
                          )
                        }
                        contentStyle={{
                          background:
                            "#07101d",
                          border:
                            "1px solid rgba(148,163,184,0.18)",
                          borderRadius:
                            12,
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
                            result
                              .spectrum
                              .snr_db
                          ).toFixed(
                            1
                          )} dB`
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
                          {
                            modulation.modulation
                          }
                        </strong>
                      </div>

                      <div className="confidence">
                        {(
                          Number(
                            modulation.confidence
                          ) *
                          100
                        ).toFixed(
                          1
                        )}

                        <small>
                          %
                        </small>
                      </div>
                    </div>


                    <div className="confidence-track">
                      <span
                        style={{
                          width: `${
                            Number(
                              modulation.confidence
                            ) *
                            100
                          }%`,
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
                          ).toFixed(
                            3
                          )}
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
                          ).toFixed(
                            3
                          )}
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
                          ).toFixed(
                            3
                          )}
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
                          ).toFixed(
                            4
                          )}
                        </strong>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="empty-state">
                    No modulation classification available.
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
                                index +
                                  1
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
                              candidate.snr_db
                            ).toFixed(
                              1
                            )}{" "}
                            dB
                          </td>


                          <td>
                            <span className="confidence-badge">
                              {(
                                Number(
                                  candidate.confidence
                                ) *
                                100
                              ).toFixed(
                                1
                              )}
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


                    {detections.length ===
                      0 && (
                      <tr>
                        <td colSpan="7">
                          <div className="empty-state">
                            No RF candidates detected.
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
                          result
                            .metadata
                            .mean_power
                        ).toFixed(
                          6
                        )
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
    </div>
  );
}


/*
 * FIREBASE AUTHENTICATION WRAPPER
 *
 * AuthGate supplies the currently authenticated
 * Firebase user to App.
 */
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