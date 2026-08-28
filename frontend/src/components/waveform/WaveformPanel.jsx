import { useEffect, useMemo, useRef, useState } from "react";

const TRACK_LIMIT = 4;

const TRACK_COLORS = [
  "#22d3ee",
  "#a78bfa",
  "#34d399",
  "#f59e0b",
];

function WaveformPanel({
  samples = [],
  duration = 0,
  currentTime = 0,
  onSeek,
  audioUrl = "",
}) {
  const [tracks, setTracks] = useState([]);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(currentTime || 0);
  const [selectedTrack, setSelectedTrack] = useState(null);

  const audioContextRef = useRef(null);
  const sourcesRef = useRef([]);
  const animationRef = useRef(null);
  const startedAtRef = useRef(0);
  const playPositionRef = useRef(0);

  const commonCanvasRef = useRef(null);
  const trackCanvasRefs = useRef([]);

  /*
   * Load the original signal already selected in SAGE-RF.
   */
  useEffect(() => {
    if (!audioUrl) return;

    let cancelled = false;

    async function loadInitialSignal() {
      try {
        const response = await fetch(audioUrl);
        const arrayBuffer = await response.arrayBuffer();

        const AudioContextClass =
          window.AudioContext ||
          window.webkitAudioContext;

        const context = new AudioContextClass();

        const buffer =
          await context.decodeAudioData(arrayBuffer);

        if (cancelled) {
          await context.close();
          return;
        }

        const channelData =
          buffer.getChannelData(0);

        setTracks([
          {
            id: crypto.randomUUID(),
            name: "SIGNAL 01",
            fileName: "Primary recording",
            buffer,
            samples: channelData,
            sampleRate: buffer.sampleRate,
            duration: buffer.duration,
            volume: 1,
            speed: 1,
            detune: 0,
            muted: false,
            solo: false,
            color: TRACK_COLORS[0],
          },
        ]);

        await context.close();
      } catch (error) {
        console.error(
          "Could not decode primary WAV:",
          error
        );
      }
    }

    loadInitialSignal();

    return () => {
      cancelled = true;
    };
  }, [audioUrl]);

  /*
   * If the parent already has decoded samples,
   * use them when there is no primary URL.
   */
  useEffect(() => {
    if (
      audioUrl ||
      !samples?.length ||
      tracks.length
    ) {
      return;
    }

    const AudioContextClass =
      window.AudioContext ||
      window.webkitAudioContext;

    if (!AudioContextClass) return;

    const context = new AudioContextClass();

    const copiedSamples =
      new Float32Array(samples);

    const buffer =
      context.createBuffer(
        1,
        copiedSamples.length,
        48000
      );

    buffer.copyToChannel(
      copiedSamples,
      0
    );

    setTracks([
      {
        id: crypto.randomUUID(),
        name: "SIGNAL 01",
        fileName: "Primary signal",
        buffer,
        samples: copiedSamples,
        sampleRate: 48000,
        duration,
        volume: 1,
        speed: 1,
        detune: 0,
        muted: false,
        solo: false,
        color: TRACK_COLORS[0],
      },
    ]);

    context.close();
  }, [samples, duration, audioUrl, tracks.length]);

  /*
   * Add additional WAV files.
   */
  async function addSignals(event) {
    const files = Array.from(
      event.target.files || []
    );

    if (!files.length) return;

    const remaining =
      TRACK_LIMIT - tracks.length;

    const filesToLoad =
      files.slice(0, remaining);

    const AudioContextClass =
      window.AudioContext ||
      window.webkitAudioContext;

    if (!AudioContextClass) return;

    const context =
      new AudioContextClass();

    const loaded = [];

    try {
      for (const file of filesToLoad) {
        if (!file.type.includes("wav")) {
          continue;
        }

        const arrayBuffer =
          await file.arrayBuffer();

        const buffer =
          await context.decodeAudioData(
            arrayBuffer
          );

        const channel =
          buffer.getChannelData(0);

        const index =
          tracks.length + loaded.length;

        loaded.push({
          id: crypto.randomUUID(),
          name: `SIGNAL ${String(
            index + 1
          ).padStart(2, "0")}`,
          fileName: file.name,
          buffer,
          samples: channel,
          sampleRate:
            buffer.sampleRate,
          duration:
            buffer.duration,
          volume: 1,
          speed: 1,
          detune: 0,
          muted: false,
          solo: false,
          color:
            TRACK_COLORS[
              index %
                TRACK_COLORS.length
            ],
        });
      }

      setTracks((previous) => [
        ...previous,
        ...loaded,
      ]);
    } catch (error) {
      console.error(
        "Could not load signal:",
        error
      );
    } finally {
      await context.close();
      event.target.value = "";
    }
  }

  function updateTrack(id, patch) {
    setTracks((previous) =>
      previous.map((track) =>
        track.id === id
          ? {
              ...track,
              ...patch,
            }
          : track
      )
    );
  }

  function removeTrack(id) {
    stopAll();

    setTracks((previous) =>
      previous.filter(
        (track) => track.id !== id
      )
    );
  }

  /*
   * Which signals should actually reach the mixer?
   */
  const audibleTracks = useMemo(() => {
    const hasSolo =
      tracks.some(
        (track) => track.solo
      );

    return tracks.filter((track) => {
      if (track.muted) return false;

      if (
        hasSolo &&
        !track.solo
      ) {
        return false;
      }

      return true;
    });
  }, [tracks]);

  /*
   * Start all enabled signals at the same timeline position.
   */
  async function playAll() {
    if (!tracks.length) return;

    stopSourcesOnly();

    const AudioContextClass =
      window.AudioContext ||
      window.webkitAudioContext;

    if (!audioContextRef.current) {
      audioContextRef.current =
        new AudioContextClass();
    }

    const context =
      audioContextRef.current;

    await context.resume();

    const startTime =
      context.currentTime;

    const newSources = [];

    for (const track of audibleTracks) {
      if (!track.buffer) continue;

      const source =
        context.createBufferSource();

      const gain =
        context.createGain();

      source.buffer =
        track.buffer;

      /*
       * Speed changes playback rate.
       */
      source.playbackRate.value =
        track.speed;

      /*
       * Frequency/pitch shift.
       *
       * This is expressed in cents:
       * +1200 = one octave up
       * -1200 = one octave down
       */
      source.detune.value =
        track.detune;

      gain.gain.value =
        track.volume;

      source.connect(gain);
      gain.connect(
        context.destination
      );

      const offset =
        Math.max(
          0,
          Math.min(
            time,
            track.duration
          )
        );

      const remaining =
        Math.max(
          0.001,
          (track.duration - offset) /
            Math.max(
              track.speed,
              0.01
            )
        );

      source.start(
        startTime,
        offset,
        remaining
      );

      newSources.push(source);
    }

    sourcesRef.current =
      newSources;

    startedAtRef.current =
      startTime;

    playPositionRef.current =
      time;

    setPlaying(true);

    animatePlayback();
  }

  function animatePlayback() {
    cancelAnimationFrame(
      animationRef.current
    );

    const tick = () => {
      const context =
        audioContextRef.current;

      if (!context || !playingRef()) {
        return;
      }

      const elapsed =
        context.currentTime -
        startedAtRef.current;

      const next =
        playPositionRef.current +
        elapsed;

      const maxDuration =
        tracks.length
          ? Math.max(
              ...tracks.map(
                (track) =>
                  track.duration
              )
            )
          : 0;

      const clamped =
        Math.min(
          next,
          maxDuration
        );

      setTime(clamped);

      if (onSeek) {
        onSeek(clamped);
      }

      if (
        clamped >= maxDuration
      ) {
        stopAll();
        return;
      }

      animationRef.current =
        requestAnimationFrame(
          tick
        );
    };

    animationRef.current =
      requestAnimationFrame(tick);
  }

  /*
   * React state is not safe to read synchronously
   * inside the animation callback, so use this helper.
   */
  function playingRef() {
    return audioContextRef.current &&
      sourcesRef.current.length > 0;
  }

  function stopSourcesOnly() {
    for (const source of sourcesRef.current) {
      try {
        source.stop();
      } catch {
        // already stopped
      }

      try {
        source.disconnect();
      } catch {
        // already disconnected
      }
    }

    sourcesRef.current = [];
  }

  function pauseAll() {
    const context =
      audioContextRef.current;

    if (!context) return;

    const elapsed =
      context.currentTime -
      startedAtRef.current;

    playPositionRef.current =
      Math.max(
        0,
        playPositionRef.current +
          elapsed
      );

    stopSourcesOnly();

    cancelAnimationFrame(
      animationRef.current
    );

    setPlaying(false);
  }

  function stopAll() {
    stopSourcesOnly();

    cancelAnimationFrame(
      animationRef.current
    );

    playPositionRef.current = 0;

    setTime(0);

    if (onSeek) {
      onSeek(0);
    }

    setPlaying(false);
  }

  function seek(value) {
    const maxDuration =
      tracks.length
        ? Math.max(
            ...tracks.map(
              (track) =>
                track.duration
            )
          )
        : duration;

    const next =
      Math.max(
        0,
        Math.min(
          maxDuration,
          Number(value) || 0
        )
      );

    playPositionRef.current =
      next;

    setTime(next);

    if (onSeek) {
      onSeek(next);
    }

    if (playingRef()) {
      playAll();
    }
  }

  /*
   * Draw individual signal waveforms.
   */
  useEffect(() => {
    tracks.forEach(
      (track, index) => {
        const canvas =
          trackCanvasRefs.current[
            index
          ];

        if (!canvas) return;

        drawIndividualWaveform(
          canvas,
          track,
          time
        );
      }
    );
  }, [
    tracks,
    time,
  ]);

  /*
   * Draw the actual mixed/common output.
   */
  useEffect(() => {
    const canvas =
      commonCanvasRef.current;

    if (!canvas) return;

    drawCommonWaveform(
      canvas,
      tracks,
      audibleTracks,
      time
    );
  }, [
    tracks,
    audibleTracks,
    time,
  ]);

  useEffect(() => {
    return () => {
      stopSourcesOnly();

      cancelAnimationFrame(
        animationRef.current
      );

      if (
        audioContextRef.current
      ) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const maxDuration =
    tracks.length
      ? Math.max(
          ...tracks.map(
            (track) =>
              track.duration
          )
        )
      : duration;

  return (
    <section
      className="workspace-panel"
      style={{
        gridColumn:
          "1 / -1",
        overflow:
          "hidden",
      }}
    >
      <div
        style={{
          padding:
            "18px 20px",
          borderBottom:
            "1px solid rgba(148,163,184,.10)",
          display:
            "flex",
          justifyContent:
            "space-between",
          alignItems:
            "center",
          gap: 16,
          flexWrap:
            "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 10,
              letterSpacing:
                "0.18em",
              color:
                "#67e8f9",
              fontWeight: 700,
            }}
          >
            MULTI-SIGNAL TIME DOMAIN
          </div>

          <h3
            style={{
              margin:
                "5px 0 0",
              fontSize: 21,
            }}
          >
            Signal Mixer & Waveform
          </h3>
        </div>

        <div
          style={{
            display:
              "flex",
            alignItems:
              "center",
            gap: 8,
          }}
        >
          <label
            style={{
              padding:
                "9px 13px",
              border:
                "1px solid rgba(34,211,238,.35)",
              borderRadius: 7,
              color:
                "#67e8f9",
              cursor:
                tracks.length >=
                TRACK_LIMIT
                  ? "not-allowed"
                  : "pointer",
              fontSize: 12,
              fontWeight: 700,
              opacity:
                tracks.length >=
                TRACK_LIMIT
                  ? 0.45
                  : 1,
            }}
          >
            + ADD WAV SIGNAL
            <input
              type="file"
              accept=".wav,audio/wav"
              multiple
              hidden
              disabled={
                tracks.length >=
                TRACK_LIMIT
              }
              onChange={
                addSignals
              }
            />
          </label>

          <button
            type="button"
            onClick={
              playing
                ? pauseAll
                : playAll
            }
            style={buttonStyle}
          >
            {playing
              ? "PAUSE ALL"
              : "PLAY ALL"}
          </button>

          <button
            type="button"
            onClick={
              stopAll
            }
            style={
              secondaryButtonStyle
            }
          >
            STOP
          </button>
        </div>
      </div>

      <div
        style={{
          padding:
            "10px 20px",
          display:
            "flex",
          gap: 16,
          alignItems:
            "center",
          borderBottom:
            "1px solid rgba(148,163,184,.08)",
          color:
            "#94a3b8",
          fontFamily:
            "monospace",
          fontSize: 12,
        }}
      >
        <strong
          style={{
            color:
              "#e2e8f0",
          }}
        >
          {formatTime(time)}
        </strong>

        <input
          type="range"
          min="0"
          max={maxDuration || 1}
          step="0.001"
          value={Math.min(
            time,
            maxDuration || 0
          )}
          onChange={(event) =>
            seek(
              event.target.value
            )
          }
          style={{
            flex: 1,
          }}
        />

        <span>
          {formatTime(
            maxDuration
          )}
        </span>
      </div>

      <div
        style={{
          padding:
            "14px 20px 0",
        }}
      >
        {tracks.length === 0 && (
          <div
            style={{
              padding: 40,
              textAlign:
                "center",
              border:
                "1px dashed rgba(103,232,249,.25)",
              borderRadius: 10,
              color:
                "#64748b",
            }}
          >
            Add up to 4 WAV signals
            to build a synchronized
            multi-signal timeline.
          </div>
        )}

        {tracks.map(
          (track, index) => (
            <div
              key={track.id}
              onClick={() =>
                setSelectedTrack(
                  track.id
                )
              }
              style={{
                marginBottom:
                  12,
                padding:
                  "12px",
                border:
                  `1px solid ${
                    selectedTrack ===
                    track.id
                      ? track.color
                      : "rgba(148,163,184,.10)"
                  }`,
                borderRadius:
                  9,
                background:
                  "rgba(2,8,16,.72)",
              }}
            >
              <div
                style={{
                  display:
                    "flex",
                  justifyContent:
                    "space-between",
                  alignItems:
                    "center",
                  gap: 10,
                  marginBottom:
                    8,
                  flexWrap:
                    "wrap",
                }}
              >
                <div
                  style={{
                    display:
                      "flex",
                    alignItems:
                      "center",
                    gap: 9,
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius:
                        "50%",
                      background:
                        track.color,
                      boxShadow:
                        `0 0 10px ${track.color}`,
                    }}
                  />

                  <strong
                    style={{
                      fontSize: 12,
                    }}
                  >
                    {track.name}
                  </strong>

                  <span
                    style={{
                      color:
                        "#64748b",
                      fontSize: 11,
                    }}
                  >
                    {track.fileName}
                  </span>
                </div>

                <div
                  style={{
                    display:
                      "flex",
                    gap: 5,
                  }}
                >
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      updateTrack(
                        track.id,
                        {
                          muted:
                            !track.muted,
                        }
                      );
                    }}
                    style={
                      track.muted
                        ? activeSmallButton
                        : smallButton
                    }
                  >
                    M
                  </button>

                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      updateTrack(
                        track.id,
                        {
                          solo:
                            !track.solo,
                        }
                      );
                    }}
                    style={
                      track.solo
                        ? activeSmallButton
                        : smallButton
                    }
                  >
                    S
                  </button>

                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      removeTrack(
                        track.id
                      );
                    }}
                    style={
                      smallDangerButton
                    }
                  >
                    ×
                  </button>
                </div>
              </div>

              <canvas
                ref={(element) => {
                  trackCanvasRefs.current[
                    index
                  ] = element;
                }}
                style={{
                  width:
                    "100%",
                  height:
                    110,
                  display:
                    "block",
                  borderRadius:
                    6,
                }}
              />

              <div
                style={{
                  display:
                    "grid",
                  gridTemplateColumns:
                    "repeat(3, minmax(150px, 1fr))",
                  gap: 14,
                  marginTop:
                    10,
                }}
              >
                <Control
                  label="VOLUME"
                  value={
                    track.volume
                  }
                  min={0}
                  max={1.5}
                  step={0.01}
                  display={`${Math.round(
                    track.volume *
                      100
                  )}%`}
                  onChange={(value) =>
                    updateTrack(
                      track.id,
                      {
                        volume:
                          value,
                      }
                    )
                  }
                />

                <Control
                  label="SPEED"
                  value={
                    track.speed
                  }
                  min={0.25}
                  max={2}
                  step={0.01}
                  display={`${track.speed.toFixed(
                    2
                  )}×`}
                  onChange={(value) =>
                    updateTrack(
                      track.id,
                      {
                        speed:
                          value,
                      }
                    )
                  }
                />

                <Control
                  label="FREQ / PITCH"
                  value={
                    track.detune
                  }
                  min={-1200}
                  max={1200}
                  step={10}
                  display={`${track.detune} cents`}
                  onChange={(value) =>
                    updateTrack(
                      track.id,
                      {
                        detune:
                          value,
                      }
                    )
                  }
                />
              </div>
            </div>
          )
        )}
      </div>

      {tracks.length > 0 && (
        <div
          style={{
            marginTop:
              6,
            padding:
              "18px 20px 20px",
          }}
        >
          <div
            style={{
              display:
                "flex",
              justifyContent:
                "space-between",
              alignItems:
                "center",
              marginBottom:
                8,
            }}
          >
            <div>
              <div
                style={{
                  color:
                    "#67e8f9",
                  fontSize: 10,
                  letterSpacing:
                    "0.18em",
                  fontWeight: 700,
                }}
              >
                MASTER OUTPUT
              </div>

              <strong
                style={{
                  fontSize: 18,
                }}
              >
                COMMON / MIXED WAVEFORM
              </strong>
            </div>

            <span
              style={{
                color:
                  "#64748b",
                fontSize: 11,
              }}
            >
              {audibleTracks.length}
              {" "}
              active signals
            </span>
          </div>

          <canvas
            ref={
              commonCanvasRef
            }
            style={{
              width:
                "100%",
              height:
                180,
              display:
                "block",
              borderRadius:
                8,
            }}
          />

          <div
            style={{
              display:
                "flex",
              gap: 18,
              marginTop:
                9,
              flexWrap:
                "wrap",
              fontSize: 10,
              fontFamily:
                "monospace",
              color:
                "#64748b",
            }}
          >
            {tracks.map(
              (track) => (
                <span
                  key={track.id}
                  style={{
                    color:
                      track.color,
                  }}
                >
                  ● {track.name}
                </span>
              )
            )}

            <span>
              COMMON OUTPUT =
              SUM OF ACTIVE SIGNALS
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

function Control({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}) {
  return (
    <label
      style={{
        display:
          "grid",
        gap: 5,
        fontSize: 9,
        color:
          "#64748b",
        letterSpacing:
          "0.12em",
      }}
    >
      <span
        style={{
          display:
            "flex",
          justifyContent:
            "space-between",
        }}
      >
        <span>{label}</span>

        <strong
          style={{
            color:
              "#cbd5e1",
            fontFamily:
              "monospace",
            letterSpacing:
              0,
          }}
        >
          {display}
        </strong>
      </span>

      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) =>
          onChange(
            Number(
              event.target.value
            )
          )
        }
      />
    </label>
  );
}

function drawIndividualWaveform(
  canvas,
  track,
  currentTime
) {
  const rect =
    canvas.getBoundingClientRect();

  if (!rect.width) return;

  const dpr =
    window.devicePixelRatio || 1;

  const width =
    rect.width;

  const height =
    110;

  canvas.width =
    width * dpr;

  canvas.height =
    height * dpr;

  const ctx =
    canvas.getContext("2d");

  ctx.setTransform(
    dpr,
    0,
    0,
    dpr,
    0,
    0
  );

  ctx.clearRect(
    0,
    0,
    width,
    height
  );

  drawBackground(
    ctx,
    width,
    height
  );

  const samples =
    track.samples;

  if (!samples?.length) return;

  const center =
    height / 2;

  const points =
    Math.min(
      1800,
      Math.max(
        300,
        Math.floor(width * 2)
      )
    );

  const step =
    samples.length /
    points;

  let peak = 0;

  for (
    let i = 0;
    i < samples.length;
    i += Math.max(
      1,
      Math.floor(
        samples.length /
          4000
      )
    )
  ) {
    peak = Math.max(
      peak,
      Math.abs(samples[i])
    );
  }

  if (!peak) peak = 1;

  const fill =
    ctx.createLinearGradient(
      0,
      0,
      0,
      height
    );

  fill.addColorStop(
    0,
    `${track.color}55`
  );

  fill.addColorStop(
    0.5,
    `${track.color}10`
  );

  fill.addColorStop(
    1,
    `${track.color}03`
  );

  ctx.beginPath();

  for (
    let x = 0;
    x < points;
    x += 1
  ) {
    const start =
      Math.floor(
        x * step
      );

    const end =
      Math.min(
        samples.length,
        Math.max(
          start + 1,
          Math.floor(
            (x + 1) * step
          )
        )
      );

    let max = -Infinity;

    for (
      let i = start;
      i < end;
      i += 1
    ) {
      if (
        samples[i] > max
      ) {
        max =
          samples[i];
      }
    }

    const px =
      (x /
        Math.max(
          points - 1,
          1
        )) *
      width;

    const py =
      center -
      (max / peak) *
        height *
        0.42;

    if (x === 0) {
      ctx.moveTo(
        px,
        py
      );
    } else {
      ctx.lineTo(
        px,
        py
      );
    }
  }

  for (
    let x = points - 1;
    x >= 0;
    x -= 1
  ) {
    const start =
      Math.floor(
        x * step
      );

    const end =
      Math.min(
        samples.length,
        Math.max(
          start + 1,
          Math.floor(
            (x + 1) * step
          )
        )
      );

    let min = Infinity;

    for (
      let i = start;
      i < end;
      i += 1
    ) {
      if (
        samples[i] < min
      ) {
        min =
          samples[i];
      }
    }

    const px =
      (x /
        Math.max(
          points - 1,
          1
        )) *
      width;

    const py =
      center -
      (min / peak) *
        height *
        0.42;

    ctx.lineTo(
      px,
      py
    );
  }

  ctx.closePath();

  ctx.fillStyle =
    fill;

  ctx.fill();

  ctx.beginPath();

  for (
    let x = 0;
    x < points;
    x += 1
  ) {
    const start =
      Math.floor(
        x * step
      );

    const end =
      Math.min(
        samples.length,
        Math.max(
          start + 1,
          Math.floor(
            (x + 1) * step
          )
        )
      );

    let max = -Infinity;

    for (
      let i = start;
      i < end;
      i += 1
    ) {
      max =
        Math.max(
          max,
          samples[i]
        );
    }

    const px =
      (x /
        Math.max(
          points - 1,
          1
        )) *
      width;

    const py =
      center -
      (max / peak) *
        height *
        0.42;

    if (x === 0) {
      ctx.moveTo(
        px,
        py
      );
    } else {
      ctx.lineTo(
        px,
        py
      );
    }
  }

  ctx.strokeStyle =
    track.color;

  ctx.lineWidth = 1.2;

  ctx.stroke();

  /*
   * Current-time marker.
   */
  if (track.duration > 0) {
    const x =
      Math.min(
        1,
        currentTime /
          track.duration
      ) * width;

    ctx.strokeStyle =
      "rgba(255,255,255,.65)";

    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(
      x,
      0
    );
    ctx.lineTo(
      x,
      height
    );
    ctx.stroke();
  }
}

function drawCommonWaveform(
  canvas,
  tracks,
  audibleTracks,
  currentTime
) {
  const rect =
    canvas.getBoundingClientRect();

  if (!rect.width) return;

  const dpr =
    window.devicePixelRatio || 1;

  const width =
    rect.width;

  const height =
    180;

  canvas.width =
    width * dpr;

  canvas.height =
    height * dpr;

  const ctx =
    canvas.getContext("2d");

  ctx.setTransform(
    dpr,
    0,
    0,
    dpr,
    0,
    0
  );

  ctx.clearRect(
    0,
    0,
    width,
    height
  );

  drawBackground(
    ctx,
    width,
    height
  );

  if (!audibleTracks.length) {
    ctx.fillStyle =
      "#475569";

    ctx.font =
      "12px monospace";

    ctx.fillText(
      "ALL SIGNALS MUTED",
      16,
      24
    );

    return;
  }

  const maxDuration =
    Math.max(
      ...tracks.map(
        (track) =>
          track.duration
      )
    );

  const points =
    Math.min(
      1600,
      Math.max(
        500,
        Math.floor(width * 1.5)
      )
    );

  const center =
    height / 2;

  /*
   * The common waveform is an actual
   * sample-by-sample sum of the active
   * WAV tracks.
   */
  const mixed =
    new Float32Array(
      points
    );

  let globalPeak = 0;

  for (
    let p = 0;
    p < points;
    p += 1
  ) {
    const timeline =
      (p /
        Math.max(
          points - 1,
          1
        )) *
      maxDuration;

    let sum = 0;

    for (const track of audibleTracks) {
      if (
        timeline >
        track.duration
      ) {
        continue;
      }

      const effectiveRate =
        track.speed *
        Math.pow(
          2,
          track.detune /
            1200
        );

      const sampleIndex =
        Math.floor(
          timeline *
            track.sampleRate *
            effectiveRate
        );

      if (
        sampleIndex >=
        track.samples.length
      ) {
        continue;
      }

      sum +=
        track.samples[
          sampleIndex
        ] *
        track.volume;
    }

    mixed[p] =
      sum;

    globalPeak =
      Math.max(
        globalPeak,
        Math.abs(sum)
      );
  }

  if (!globalPeak) {
    globalPeak = 1;
  }

  /*
   * Common output fill.
   */
  const fill =
    ctx.createLinearGradient(
      0,
      0,
      0,
      height
    );

  fill.addColorStop(
    0,
    "rgba(167,139,250,.35)"
  );

  fill.addColorStop(
    0.5,
    "rgba(34,211,238,.10)"
  );

  fill.addColorStop(
    1,
    "rgba(52,211,153,.05)"
  );

  ctx.beginPath();

  for (
    let i = 0;
    i < points;
    i += 1
  ) {
    const x =
      (i /
        Math.max(
          points - 1,
          1
        )) *
      width;

    const y =
      center -
      (mixed[i] /
        globalPeak) *
        height *
        0.42;

    if (i === 0) {
      ctx.moveTo(
        x,
        y
      );
    } else {
      ctx.lineTo(
        x,
        y
      );
    }
  }

  for (
    let i = points - 1;
    i >= 0;
    i -= 1
  ) {
    const x =
      (i /
        Math.max(
          points - 1,
          1
        )) *
      width;

    const y =
      center -
      (mixed[i] /
        globalPeak) *
        height *
        0.42;

    ctx.lineTo(
      x,
      y
    );
  }

  ctx.closePath();

  ctx.fillStyle =
    fill;

  ctx.fill();

  /*
   * Common output line.
   */
  ctx.beginPath();

  for (
    let i = 0;
    i < points;
    i += 1
  ) {
    const x =
      (i /
        Math.max(
          points - 1,
          1
        )) *
      width;

    const y =
      center -
      (mixed[i] /
        globalPeak) *
        height *
        0.42;

    if (i === 0) {
      ctx.moveTo(
        x,
        y
      );
    } else {
      ctx.lineTo(
        x,
        y
      );
    }
  }

  ctx.strokeStyle =
    "#e879f9";

  ctx.lineWidth = 1.5;

  ctx.stroke();

  /*
   * Current playback position.
   */
  const playheadX =
    maxDuration > 0
      ? Math.min(
          1,
          currentTime /
            maxDuration
        ) * width
      : 0;

  ctx.strokeStyle =
    "#67e8f9";

  ctx.shadowColor =
    "#22d3ee";

  ctx.shadowBlur = 12;

  ctx.lineWidth = 2;

  ctx.beginPath();

  ctx.moveTo(
    playheadX,
    0
  );

  ctx.lineTo(
    playheadX,
    height
  );

  ctx.stroke();

  ctx.shadowBlur = 0;
}

function drawBackground(
  ctx,
  width,
  height
) {
  const background =
    ctx.createLinearGradient(
      0,
      0,
      0,
      height
    );

  background.addColorStop(
    0,
    "#07131d"
  );

  background.addColorStop(
    0.5,
    "#02070d"
  );

  background.addColorStop(
    1,
    "#07131d"
  );

  ctx.fillStyle =
    background;

  ctx.fillRect(
    0,
    0,
    width,
    height
  );

  ctx.strokeStyle =
    "rgba(100,150,175,.10)";

  ctx.lineWidth = 1;

  for (
    let x = 0;
    x <= width;
    x += 64
  ) {
    ctx.beginPath();

    ctx.moveTo(
      x + 0.5,
      0
    );

    ctx.lineTo(
      x + 0.5,
      height
    );

    ctx.stroke();
  }

  for (
    let y =
      height / 2 - 60;
    y <=
      height / 2 + 60;
    y += 20
  ) {
    ctx.beginPath();

    ctx.moveTo(
      0,
      y + 0.5
    );

    ctx.lineTo(
      width,
      y + 0.5
    );

    ctx.stroke();
  }

  ctx.strokeStyle =
    "rgba(148,163,184,.25)";

  ctx.beginPath();

  ctx.moveTo(
    0,
    height / 2
  );

  ctx.lineTo(
    width,
    height / 2
  );

  ctx.stroke();
}

function formatTime(seconds) {
  if (
    !Number.isFinite(
      seconds
    )
  ) {
    return "00:00.000";
  }

  const minutes =
    Math.floor(
      seconds / 60
    );

  const secs =
    Math.floor(
      seconds % 60
    );

  const millis =
    Math.floor(
      (seconds % 1) * 1000
    );

  return `${String(
    minutes
  ).padStart(
    2,
    "0"
  )}:${String(
    secs
  ).padStart(
    2,
    "0"
  )}.${String(
    millis
  ).padStart(
    3,
    "0"
  )}`;
}

const buttonStyle = {
  background:
    "rgba(34,211,238,.12)",
  border:
    "1px solid rgba(34,211,238,.35)",
  color:
    "#67e8f9",
  borderRadius: 7,
  padding:
    "9px 13px",
  fontSize: 11,
  fontWeight: 700,
};

const secondaryButtonStyle = {
  ...buttonStyle,
  color:
    "#cbd5e1",
  borderColor:
    "rgba(148,163,184,.25)",
  background:
    "rgba(148,163,184,.06)",
};

const smallButton = {
  width: 28,
  height: 26,
  border:
    "1px solid rgba(148,163,184,.20)",
  background:
    "rgba(148,163,184,.06)",
  color:
    "#94a3b8",
  borderRadius: 5,
  fontSize: 10,
  fontWeight: 700,
};

const activeSmallButton = {
  ...smallButton,
  color:
    "#67e8f9",
  borderColor:
    "rgba(34,211,238,.5)",
  background:
    "rgba(34,211,238,.12)",
};

const smallDangerButton = {
  ...smallButton,
  color:
    "#fb7185",
};

export default WaveformPanel;
