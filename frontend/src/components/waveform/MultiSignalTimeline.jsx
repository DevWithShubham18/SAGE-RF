import { useEffect, useMemo, useRef, useState } from "react";
import {
  Upload,
  Play,
  Pause,
  Square,
  Volume2,
  VolumeX,
  Headphones,
  X,
} from "lucide-react";

const TRACK_LIMIT = 4;
const WAVE_POINTS = 1600;

const TRACK_COLORS = [
  "#67e8f9",
  "#a78bfa",
  "#f59e0b",
  "#4ade80",
];

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "00:00.000";
  }

  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.floor((seconds % 1) * 1000);

  return `${String(minutes).padStart(2, "0")}:${String(
    secs
  ).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

function buildEnvelope(samples, points = WAVE_POINTS) {
  if (!samples?.length) return [];

  const count = Math.min(points, samples.length);
  const step = samples.length / count;

  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor(index * step);

    const end = Math.min(
      samples.length,
      Math.max(
        start + 1,
        Math.floor((index + 1) * step)
      )
    );

    let min = Infinity;
    let max = -Infinity;
    let energy = 0;

    for (let i = start; i < end; i += 1) {
      const value = Number(samples[i]) || 0;

      min = Math.min(min, value);
      max = Math.max(max, value);
      energy += value * value;
    }

    const size = Math.max(1, end - start);

    return {
      min: Number.isFinite(min) ? min : 0,
      max: Number.isFinite(max) ? max : 0,
      rms: Math.sqrt(energy / size),
    };
  });
}

/* =========================================================
   TRACK WAVEFORM
========================================================= */

function TrackWaveform({
  track,
  currentTime,
  playing,
  onSeek,
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;

    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");

    if (!ctx) return;

    let frame = null;

    const draw = () => {
      const rect = container.getBoundingClientRect();

      if (!rect.width || !rect.height) return;

      const dpr = window.devicePixelRatio || 1;

      const targetWidth = Math.floor(rect.width * dpr);
      const targetHeight = Math.floor(rect.height * dpr);

      if (
        canvas.width !== targetWidth ||
        canvas.height !== targetHeight
      ) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const width = rect.width;
      const height = rect.height;
      const center = height / 2;

      ctx.clearRect(0, 0, width, height);

      /*
       * Background
       */
      ctx.fillStyle = "#020810";
      ctx.fillRect(0, 0, width, height);

      /*
       * Vertical technical grid
       */
      ctx.strokeStyle = "rgba(148,163,184,.07)";
      ctx.lineWidth = 1;

      for (let x = 0; x < width; x += 80) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, height);
        ctx.stroke();
      }

      /*
       * Horizontal technical grid
       */
      for (let y = 0; y <= height; y += 20) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(width, y + 0.5);
        ctx.stroke();
      }

      /*
       * Center line
       */
      ctx.strokeStyle = "rgba(148,163,184,.18)";
      ctx.beginPath();
      ctx.moveTo(0, center);
      ctx.lineTo(width, center);
      ctx.stroke();

      const waveform = track.waveform || [];

      if (!waveform.length) {
        drawPlayhead(
          ctx,
          width / 2,
          height,
          track.color
        );

        if (playing) {
          frame = requestAnimationFrame(draw);
        }

        return;
      }

      /*
       * Find amplitude
       */
      let maxAmplitude = 0;

      for (const point of waveform) {
        maxAmplitude = Math.max(
          maxAmplitude,
          Math.abs(point.min),
          Math.abs(point.max)
        );
      }

      maxAmplitude = Math.max(
        maxAmplitude,
        0.0001
      );

      /*
       * Fixed playhead in the center.
       */
      const playheadX = width / 2;

      /*
       * Waveform scroll speed.
       */
      const pixelsPerSecond = Math.max(
        80,
        Math.min(
          260,
          width /
            Math.max(
              track.duration || 1,
              4
            )
        )
      );

      /*
       * Convert waveform samples to screen positions.
       */
      const waveformPoints = [];

      for (
        let index = 0;
        index < waveform.length;
        index += 1
      ) {
        const time =
          track.duration > 0
            ? (index /
                Math.max(
                  1,
                  waveform.length - 1
                )) *
              track.duration
            : 0;

        const x =
          playheadX +
          (time - currentTime) *
            pixelsPerSecond;

        waveformPoints.push({
          x,
          point: waveform[index],
        });
      }

      /*
       * Filled waveform.
       */
      ctx.beginPath();

      let started = false;

      for (const { x, point } of waveformPoints) {
        if (
          x < -20 ||
          x > width + 20
        ) {
          continue;
        }

        const y =
          center -
          (point.max / maxAmplitude) *
            (height * 0.4);

        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }

      for (
        let index =
          waveformPoints.length - 1;
        index >= 0;
        index -= 1
      ) {
        const { x, point } =
          waveformPoints[index];

        if (
          x < -20 ||
          x > width + 20
        ) {
          continue;
        }

        const y =
          center -
          (point.min / maxAmplitude) *
            (height * 0.4);

        ctx.lineTo(x, y);
      }

      if (started) {
        ctx.closePath();

        ctx.fillStyle =
          `${track.color}18`;

        ctx.fill();
      }

      /*
       * Upper waveform.
       */
      ctx.beginPath();

      started = false;

      for (const { x, point } of waveformPoints) {
        if (
          x < -20 ||
          x > width + 20
        ) {
          continue;
        }

        const y =
          center -
          (point.max / maxAmplitude) *
            (height * 0.4);

        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.strokeStyle =
        track.color;

      ctx.lineWidth = 1.5;

      if (started) {
        ctx.stroke();
      }

      /*
       * Lower waveform.
       */
      ctx.beginPath();

      started = false;

      for (const { x, point } of waveformPoints) {
        if (
          x < -20 ||
          x > width + 20
        ) {
          continue;
        }

        const y =
          center -
          (point.min / maxAmplitude) *
            (height * 0.4);

        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.strokeStyle =
        `${track.color}88`;

      ctx.lineWidth = 1;

      if (started) {
        ctx.stroke();
      }

      /*
       * Center playhead.
       */
      drawPlayhead(
        ctx,
        playheadX,
        height,
        track.color
      );

      /*
       * Animate only while actually playing.
       */
      if (playing) {
        frame =
          requestAnimationFrame(draw);
      }
    };

    draw();

    const observer =
      new ResizeObserver(draw);

    observer.observe(container);

    return () => {
      observer.disconnect();

      if (frame) {
        cancelAnimationFrame(frame);
      }
    };
  }, [
    track,
    currentTime,
    playing,
  ]);

  function seek(event) {
    const rect =
      containerRef.current?.getBoundingClientRect();

    if (!rect || !track.duration) {
      return;
    }

    const center =
      rect.width / 2;

    const pixelsPerSecond =
      Math.max(
        80,
        Math.min(
          260,
          rect.width /
            Math.max(
              track.duration,
              4
            )
        )
      );

    const delta =
      (event.clientX -
        rect.left -
        center) /
      pixelsPerSecond;

    const nextTime =
      currentTime + delta;

    onSeek(
      Math.max(
        0,
        Math.min(
          track.duration,
          nextTime
        )
      )
    );
  }

  return (
    <div
      ref={containerRef}
      className="multi-track-waveform"
      onPointerDown={seek}
    >
      <canvas ref={canvasRef} />
    </div>
  );
}

function drawPlayhead(
  ctx,
  x,
  height,
  trackColor
) {
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, height);
  ctx.stroke();

  ctx.fillStyle = trackColor;

  ctx.beginPath();
  ctx.moveTo(x - 5, 0);
  ctx.lineTo(x + 5, 0);
  ctx.lineTo(x, 7);
  ctx.closePath();
  ctx.fill();
}

/* =========================================================
   COMMON WAVEFORM
========================================================= */

function CommonWaveform({
  tracks,
  duration,
  currentTime,
  playing,
  onSeek,
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  const common = useMemo(() => {
    if (!tracks.length) {
      return [];
    }

    const output = [];

    for (
      let i = 0;
      i < WAVE_POINTS;
      i += 1
    ) {
      let min = 0;
      let max = 0;

      for (const track of tracks) {
        if (track.muted) {
          continue;
        }

        const waveform =
          track.waveform;

        if (!waveform?.length) {
          continue;
        }

        const index =
          Math.floor(
            (i / WAVE_POINTS) *
              waveform.length
          );

        const point =
          waveform[
            Math.min(
              index,
              waveform.length - 1
            )
          ];

        if (!point) {
          continue;
        }

        min +=
          point.min *
          track.volume;

        max +=
          point.max *
          track.volume;
      }

      output.push({
        min,
        max,
      });
    }

    return output;
  }, [tracks]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container =
      containerRef.current;

    if (!canvas || !container) {
      return;
    }

    const ctx =
      canvas.getContext("2d");

    if (!ctx) {
      return;
    }

    let frame = null;

    const draw = () => {
      const rect =
        container.getBoundingClientRect();

      if (!rect.width || !rect.height) {
        return;
      }

      const dpr =
        window.devicePixelRatio || 1;

      const targetWidth =
        Math.floor(
          rect.width * dpr
        );

      const targetHeight =
        Math.floor(
          rect.height * dpr
        );

      if (
        canvas.width !==
          targetWidth ||
        canvas.height !==
          targetHeight
      ) {
        canvas.width =
          targetWidth;

        canvas.height =
          targetHeight;
      }

      ctx.setTransform(
        dpr,
        0,
        0,
        dpr,
        0,
        0
      );

      const width = rect.width;
      const height = rect.height;
      const center = height / 2;

      ctx.clearRect(
        0,
        0,
        width,
        height
      );

      ctx.fillStyle =
        "#03070d";

      ctx.fillRect(
        0,
        0,
        width,
        height
      );

      /*
       * Grid.
       */
      ctx.strokeStyle =
        "rgba(148,163,184,.10)";

      ctx.lineWidth = 1;

      for (
        let x = 0;
        x < width;
        x += 80
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

      ctx.strokeStyle =
        "rgba(148,163,184,.20)";

      ctx.beginPath();
      ctx.moveTo(
        0,
        center
      );
      ctx.lineTo(
        width,
        center
      );
      ctx.stroke();

      if (common.length) {
        let maxAmplitude = 0;

        for (const point of common) {
          maxAmplitude =
            Math.max(
              maxAmplitude,
              Math.abs(
                point.min
              ),
              Math.abs(
                point.max
              )
            );
        }

        maxAmplitude =
          Math.max(
            maxAmplitude,
            0.0001
          );

        /*
         * Filled common waveform.
         */
        ctx.beginPath();

        common.forEach(
          (point, index) => {
            const x =
              (index /
                Math.max(
                  1,
                  common.length - 1
                )) *
              width;

            const y =
              center -
              (point.max /
                maxAmplitude) *
                (height * 0.42);

            if (index === 0) {
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
        );

        for (
          let i =
            common.length - 1;
          i >= 0;
          i -= 1
        ) {
          const point =
            common[i];

          const x =
            (i /
              Math.max(
                1,
                common.length - 1
              )) *
            width;

          const y =
            center -
            (point.min /
              maxAmplitude) *
              (height * 0.42);

          ctx.lineTo(
            x,
            y
          );
        }

        ctx.closePath();

        ctx.fillStyle =
          "rgba(248,250,252,.08)";

        ctx.fill();

        /*
         * Common waveform line.
         */
        ctx.beginPath();

        common.forEach(
          (point, index) => {
            const x =
              (index /
                Math.max(
                  1,
                  common.length - 1
                )) *
              width;

            const y =
              center -
              (point.max /
                maxAmplitude) *
                (height * 0.42);

            if (index === 0) {
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
        );

        ctx.strokeStyle =
          "#f8fafc";

        ctx.lineWidth = 1.5;

        ctx.stroke();
      }

      /*
       * Common playhead.
       */
      const progress =
        duration > 0
          ? Math.max(
              0,
              Math.min(
                1,
                currentTime /
                  duration
              )
            )
          : 0;

      const playheadX =
        progress * width;

      ctx.strokeStyle =
        "#ffffff";

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

      ctx.fillStyle =
        "#ffffff";

      ctx.beginPath();

      ctx.moveTo(
        playheadX - 5,
        0
      );

      ctx.lineTo(
        playheadX + 5,
        0
      );

      ctx.lineTo(
        playheadX,
        7
      );

      ctx.closePath();

      ctx.fill();

      if (playing) {
        frame =
          requestAnimationFrame(
            draw
          );
      }
    };

    draw();

    const observer =
      new ResizeObserver(draw);

    observer.observe(container);

    return () => {
      observer.disconnect();

      if (frame) {
        cancelAnimationFrame(
          frame
        );
      }
    };
  }, [
    common,
    currentTime,
    duration,
    playing,
  ]);

  function seek(event) {
    const rect =
      containerRef.current?.getBoundingClientRect();

    if (!rect || !duration) {
      return;
    }

    const ratio =
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
      ratio * duration
    );
  }

  return (
    <div
      ref={containerRef}
      className="multi-common-waveform"
      onPointerDown={seek}
    >
      <canvas ref={canvasRef} />
    </div>
  );
}

/* =========================================================
   MAIN COMPONENT
========================================================= */

function MultiSignalTimeline() {
  const [tracks, setTracks] =
    useState([]);

  const [playing, setPlaying] =
    useState(false);

  const [commonTime, setCommonTime] =
    useState(0);

  /*
   * Web Audio.
   */
  const audioContextRef =
    useRef(null);

  /*
   * Currently playing AudioBufferSourceNode
   * for every track.
   */
  const sourceRefs =
    useRef({});

  /*
   * GainNode for every track.
   */
  const gainRefs =
    useRef({});

  /*
   * Audio playback bookkeeping.
   */
  const playbackRefs =
    useRef({});

  /*
   * Animation.
   */
  const animationRef =
    useRef(null);

  /*
   * Protect against stale state
   * when importing multiple tracks.
   */
  const tracksRef =
    useRef([]);

  useEffect(() => {
    tracksRef.current =
      tracks;
  }, [tracks]);

  /*
   * Maximum duration.
   */
  const maxDuration =
    useMemo(
      () =>
        tracks.reduce(
          (max, track) =>
            Math.max(
              max,
              track.duration || 0
            ),
          0
        ),
      [tracks]
    );

  /* =======================================================
     AUDIO CONTEXT
  ======================================================= */

  function getAudioContext() {
    if (
      !audioContextRef.current
    ) {
      const AudioContextClass =
        window.AudioContext ||
        window.webkitAudioContext;

      if (!AudioContextClass) {
        throw new Error(
          "Web Audio API is not supported by this browser."
        );
      }

      audioContextRef.current =
        new AudioContextClass();
    }

    return audioContextRef.current;
  }

  /* =======================================================
     CREATE TRACK AUDIO GRAPH
  ======================================================= */

  function ensureGainNode(track) {
    const context =
      getAudioContext();

    if (
      gainRefs.current[track.id]
    ) {
      return gainRefs.current[
        track.id
      ];
    }

    const gain =
      context.createGain();

    gain.gain.value =
      track.muted
        ? 0
        : track.volume;

    gain.connect(
      context.destination
    );

    gainRefs.current[
      track.id
    ] = gain;

    return gain;
  }

  /* =======================================================
     START ONE TRACK
  ======================================================= */

  function startTrack(
    track,
    offset = 0
  ) {
    const context =
      getAudioContext();

    if (!track.audioBuffer) {
      return null;
    }

    /*
     * Stop an old source first.
     */
    stopTrackSource(
      track.id
    );

    const source =
      context.createBufferSource();

    source.buffer =
      track.audioBuffer;

    /*
     * SPEED.
     */
    source.playbackRate.value =
      track.speed;

    /*
     * REAL PITCH CONTROL.
     *
     * 100 cents = 1 semitone.
     */
    source.detune.value =
      track.frequency * 100;

    const gain =
      ensureGainNode(track);

    source.connect(gain);

    const safeOffset =
      Math.max(
        0,
        Math.min(
          track.duration,
          offset
        )
      );

    const startedAt =
      context.currentTime;

    source.start(
      0,
      safeOffset
    );

    sourceRefs.current[
      track.id
    ] = source;

    playbackRefs.current[
      track.id
    ] = {
      startedAt,
      offset: safeOffset,
    };

    source.onended = () => {
      /*
       * Only clear if this is still
       * the active source.
       */
      if (
        sourceRefs.current[
          track.id
        ] === source
      ) {
        delete sourceRefs.current[
          track.id
        ];

        delete playbackRefs.current[
          track.id
        ];

        setTracks(
          (previous) =>
            previous.map(
              (item) =>
                item.id ===
                track.id
                  ? {
                      ...item,
                      currentTime:
                        item.duration,
                    }
                  : item
            )
        );
      }
    };

    return source;
  }

  /* =======================================================
     STOP ONE SOURCE
  ======================================================= */

  function stopTrackSource(id) {
    const source =
      sourceRefs.current[id];

    if (source) {
      try {
        source.onended = null;
        source.stop();
      } catch {
        /*
         * Source may already be stopped.
         */
      }
    }

    delete sourceRefs.current[
      id
    ];

    delete playbackRefs.current[
      id
    ];
  }

  /* =======================================================
     GET CURRENT TRACK TIME
  ======================================================= */

  function getTrackCurrentTime(
    track
  ) {
    const context =
      audioContextRef.current;

    const playback =
      playbackRefs.current[
        track.id
      ];

    if (
      !playing ||
      !context ||
      !playback
    ) {
      return (
        track.currentTime || 0
      );
    }

    const elapsed =
      context.currentTime -
      playback.startedAt;

    const current =
      playback.offset +
      elapsed *
        track.speed;

    return Math.max(
      0,
      Math.min(
        track.duration,
        current
      )
    );
  }

  /* =======================================================
     COMMON PLAYBACK CLOCK
  ======================================================= */

  useEffect(() => {
    if (!playing) {
      if (animationRef.current) {
        cancelAnimationFrame(
          animationRef.current
        );

        animationRef.current =
          null;
      }

      return undefined;
    }

    let stopped = false;

    const update = () => {
      if (stopped) {
        return;
      }

      const currentTracks =
        tracksRef.current;

      let masterTime = 0;

      /*
       * Prefer the longest-running
       * active track for the common
       * timeline.
       */
      for (const track of currentTracks) {
        if (track.muted) {
          continue;
        }

        const time =
          getTrackCurrentTime(
            track
          );

        masterTime =
          Math.max(
            masterTime,
            time
          );
      }

      setCommonTime(
        Math.min(
          masterTime,
          maxDuration || masterTime
        )
      );

      setTracks(
        (previous) =>
          previous.map(
            (track) => ({
              ...track,
              currentTime:
                getTrackCurrentTime(
                  track
                ),
            })
          )
      );

      /*
       * Automatically stop once
       * everything has finished.
       */
      const activeTracks =
        currentTracks.filter(
          (track) =>
            !track.muted
        );

      if (
        activeTracks.length &&
        activeTracks.every(
          (track) =>
            getTrackCurrentTime(
              track
            ) >=
            track.duration - 0.01
        )
      ) {
        stopAll();
        return;
      }

      animationRef.current =
        requestAnimationFrame(
          update
        );
    };

    animationRef.current =
      requestAnimationFrame(
        update
      );

    return () => {
      stopped = true;

      if (animationRef.current) {
        cancelAnimationFrame(
          animationRef.current
        );

        animationRef.current =
          null;
      }
    };
  }, [
    playing,
    maxDuration,
  ]);

  /* =======================================================
     IMPORT WAV FILES
  ======================================================= */

  async function importSignals(
    event
  ) {
    const selectedFiles =
      Array.from(
        event.target.files || []
      );

    if (!selectedFiles.length) {
      return;
    }

    const availableSlots =
      Math.max(
        0,
        TRACK_LIMIT -
          tracksRef.current.length
      );

    const files =
      selectedFiles.slice(
        0,
        availableSlots
      );

    if (!files.length) {
      event.target.value = "";
      return;
    }

    try {
      const context =
        getAudioContext();

      const newTracks = [];

      for (
        let index = 0;
        index < files.length;
        index += 1
      ) {
        const file =
          files[index];

        try {
          const arrayBuffer =
            await file.arrayBuffer();

          const audioBuffer =
            await context.decodeAudioData(
              arrayBuffer
            );

          const channelCount =
            audioBuffer.numberOfChannels;

          const samples =
            new Float32Array(
              audioBuffer.length
            );

          /*
           * Downmix all channels
           * into one mono waveform.
           */
          const channelData =
            [];

          for (
            let channel = 0;
            channel <
            channelCount;
            channel += 1
          ) {
            channelData.push(
              audioBuffer.getChannelData(
                channel
              )
            );
          }

          for (
            let i = 0;
            i <
            audioBuffer.length;
            i += 1
          ) {
            let value = 0;

            for (
              let channel = 0;
              channel <
              channelCount;
              channel += 1
            ) {
              value +=
                channelData[
                  channel
                ][i];
            }

            samples[i] =
              value /
              Math.max(
                1,
                channelCount
              );
          }

          const id =
            `${Date.now()}-${index}-${Math.random()
              .toString(36)
              .slice(2)}`;

          const url =
            URL.createObjectURL(
              file
            );

          const existingCount =
            tracksRef.current.length +
            newTracks.length;

          newTracks.push({
            id,
            file,
            name: file.name,
            url,

            /*
             * Keep the actual decoded
             * AudioBuffer for Web Audio.
             */
            audioBuffer,

            duration:
              audioBuffer.duration,

            samples,

            waveform:
              buildEnvelope(
                samples
              ),

            volume: 1,
            speed: 1,
            frequency: 0,

            muted: false,
            solo: false,

            color:
              TRACK_COLORS[
                existingCount %
                  TRACK_COLORS.length
              ],

            currentTime: 0,
          });
        } catch (error) {
          console.error(
            "Failed to decode",
            file.name,
            error
          );
        }
      }

      setTracks(
        (previous) =>
          [
            ...previous,
            ...newTracks,
          ].slice(
            0,
            TRACK_LIMIT
          )
      );
    } catch (error) {
      console.error(
        "Audio context initialization failed",
        error
      );
    }

    /*
     * Allows selecting the same file
     * again later.
     */
    event.target.value = "";
  }

  /* =======================================================
     SOLO LOGIC
  ======================================================= */

  function hasSoloTrack(
    trackList
  ) {
    return trackList.some(
      (track) => track.solo
    );
  }

  function isTrackAudible(
    track,
    trackList
  ) {
    if (track.muted) {
      return false;
    }

    const hasSolo =
      hasSoloTrack(trackList);

    if (hasSolo) {
      return track.solo;
    }

    return true;
  }

  function applyTrackGain(
    track,
    trackList = tracksRef.current
  ) {
    const gain =
      gainRefs.current[
        track.id
      ];

    if (!gain) {
      return;
    }

    gain.gain.value =
      isTrackAudible(
        track,
        trackList
      )
        ? track.volume
        : 0;
  }

  /* =======================================================
     UPDATE TRACK
  ======================================================= */

  function updateTrack(
    id,
    patch
  ) {
    setTracks(
      (previous) => {
        const next =
          previous.map(
            (track) =>
              track.id === id
                ? {
                    ...track,
                    ...patch,
                  }
                : track
          );

        /*
         * Update every gain because
         * changing SOLO affects all
         * channels.
         */
        for (const track of next) {
          applyTrackGain(
            track,
            next
          );
        }

        /*
         * Apply playback parameters
         * to a currently playing source.
         */
        const updated =
          next.find(
            (track) =>
              track.id === id
          );

        const source =
          sourceRefs.current[id];

        if (
          updated &&
          source
        ) {
          if (
            patch.speed !==
            undefined
          ) {
            source.playbackRate.setValueAtTime(
              updated.speed,
              getAudioContext()
                .currentTime
            );
          }

          if (
            patch.frequency !==
            undefined
          ) {
            source.detune.setValueAtTime(
              updated.frequency *
                100,
              getAudioContext()
                .currentTime
            );
          }
        }

        return next;
      }
    );
  }

  /* =======================================================
     SEEK ONE TRACK
  ======================================================= */

  function seekTrack(
    id,
    value
  ) {
    const track =
      tracksRef.current.find(
        (item) =>
          item.id === id
      );

    if (!track) {
      return;
    }

    const nextTime =
      Math.max(
        0,
        Math.min(
          track.duration,
          value
        )
      );

    if (playing) {
      /*
       * Restart this source from
       * the new offset.
       */
      startTrack(
        {
          ...track,
          currentTime:
            nextTime,
        },
        nextTime
      );
    }

    setTracks(
      (previous) =>
        previous.map(
          (item) =>
            item.id === id
              ? {
                  ...item,
                  currentTime:
                    nextTime,
                }
              : item
        )
    );

    /*
     * Keep the common timeline
     * aligned when appropriate.
     */
    setCommonTime(
      nextTime
    );
  }

  /* =======================================================
     SEEK COMMON TIMELINE
  ======================================================= */

  function seekCommon(
    value
  ) {
    const nextTime =
      Math.max(
        0,
        Math.min(
          maxDuration,
          value
        )
      );

    /*
     * Stop all current sources.
     */
    for (const track of tracksRef.current) {
      stopTrackSource(
        track.id
      );
    }

    /*
     * Restart audible tracks
     * from the selected position.
     */
    if (playing) {
      const currentTracks =
        tracksRef.current;

      const soloExists =
        hasSoloTrack(
          currentTracks
        );

      for (const track of currentTracks) {
        const audible =
          !track.muted &&
          (!soloExists ||
            track.solo);

        if (!audible) {
          continue;
        }

        const offset =
          Math.min(
            nextTime,
            track.duration
          );

        startTrack(
          track,
          offset
        );
      }
    }

    setTracks(
      (previous) =>
        previous.map(
          (track) => ({
            ...track,
            currentTime:
              Math.min(
                nextTime,
                track.duration
              ),
          })
        )
    );

    setCommonTime(
      nextTime
    );
  }

  /* =======================================================
     PLAY ALL
  ======================================================= */

  async function playAll() {
    if (!tracksRef.current.length) {
      return;
    }

    try {
      const context =
        getAudioContext();

      if (
        context.state ===
        "suspended"
      ) {
        await context.resume();
      }

      /*
       * Stop existing sources
       * before starting again.
       */
      for (
        const track of
        tracksRef.current
      ) {
        stopTrackSource(
          track.id
        );
      }

      const currentTracks =
        tracksRef.current;

      const soloExists =
        hasSoloTrack(
          currentTracks
        );

      let startedAny = false;

      for (
        const track of
        currentTracks
      ) {
        const audible =
          !track.muted &&
          (!soloExists ||
            track.solo);

        if (!audible) {
          continue;
        }

        let offset =
          track.currentTime || 0;

        /*
         * If common time is further
         * along, use it.
         */
        if (
          commonTime > 0 &&
          commonTime <
            track.duration
        ) {
          offset =
            commonTime;
        }

        if (
          offset >=
          track.duration
        ) {
          offset = 0;
        }

        startTrack(
          track,
          offset
        );

        startedAny = true;
      }

      if (!startedAny) {
        return;
      }

      setPlaying(true);
    } catch (error) {
      console.error(
        "Multi-signal playback failed",
        error
      );
    }
  }

  /* =======================================================
     PAUSE ALL
  ======================================================= */

  function pauseAll() {
    const updated =
      tracksRef.current.map(
        (track) => ({
          ...track,
          currentTime:
            getTrackCurrentTime(
              track
            ),
        })
      );

    /*
     * Save current positions
     * before stopping sources.
     */
    tracksRef.current =
      updated;

    for (
      const track of updated
    ) {
      stopTrackSource(
        track.id
      );
    }

    setTracks(
      updated
    );

    setPlaying(false);
  }

  /* =======================================================
     STOP ALL
  ======================================================= */

  function stopAll() {
    for (
      const track of
      tracksRef.current
    ) {
      stopTrackSource(
        track.id
      );
    }

    const reset =
      tracksRef.current.map(
        (track) => ({
          ...track,
          currentTime: 0,
        })
      );

    tracksRef.current =
      reset;

    setTracks(
      reset
    );

    setCommonTime(
      0
    );

    setPlaying(false);
  }

  /* =======================================================
     REMOVE TRACK
  ======================================================= */

  function removeTrack(
    id
  ) {
    stopTrackSource(id);

    const gain =
      gainRefs.current[id];

    if (gain) {
      try {
        gain.disconnect();
      } catch {
        /*
         * Already disconnected.
         */
      }
    }

    delete gainRefs.current[
      id
    ];

    setTracks(
      (previous) => {
        const track =
          previous.find(
            (item) =>
              item.id === id
          );

        if (track?.url) {
          URL.revokeObjectURL(
            track.url
          );
        }

        const next =
          previous.filter(
            (item) =>
              item.id !== id
          );

        tracksRef.current =
          next;

        return next;
      }
    );
  }

  /* =======================================================
     CLEANUP ON UNMOUNT
  ======================================================= */

  useEffect(() => {
    return () => {
      if (
        animationRef.current
      ) {
        cancelAnimationFrame(
          animationRef.current
        );
      }

      for (
        const id of Object.keys(
          sourceRefs.current
        )
      ) {
        stopTrackSource(id);
      }

      for (
        const track of
        tracksRef.current
      ) {
        if (track.url) {
          URL.revokeObjectURL(
            track.url
          );
        }
      }

      const context =
        audioContextRef.current;

      if (context) {
        context.close().catch(
          () => {}
        );
      }
    };
  }, []);

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <section className="workspace-panel multi-signal-panel">
      <div className="panel-header">
        <div>
          <span className="panel-kicker">
            MULTI SIGNAL ENGINE
          </span>

          <h2>
            Signal Timeline
          </h2>
        </div>

        <label className="multi-import-button">
          <Upload size={15} />

          IMPORT SIGNALS

          <input
            type="file"
            accept="audio/wav,audio/x-wav,.wav"
            multiple
            hidden
            onChange={
              importSignals
            }
          />
        </label>
      </div>

      <div className="multi-transport">
        <button
          type="button"
          onClick={
            playing
              ? pauseAll
              : playAll
          }
          disabled={
            !tracks.length
          }
        >
          {playing ? (
            <Pause size={16} />
          ) : (
            <Play size={16} />
          )}

          {playing
            ? "PAUSE ALL"
            : "PLAY ALL"}
        </button>

        <button
          type="button"
          onClick={
            stopAll
          }
          disabled={
            !tracks.length
          }
        >
          <Square size={14} />

          STOP
        </button>

        <strong>
          {formatTime(
            commonTime
          )}
        </strong>

        <span>
          /{" "}
          {formatTime(
            maxDuration
          )}
        </span>
      </div>

      <div className="multi-track-list">
        {tracks.length === 0 ? (
          <div className="multi-empty">
            <Upload size={28} />

            <strong>
              IMPORT 2–4 WAV SIGNALS
            </strong>

            <span>
              Each recording gets
              an independent
              waveform, transport
              and mixer controls.
            </span>
          </div>
        ) : (
          tracks.map(
            (
              track,
              index
            ) => (
              <div
                className="signal-track"
                key={track.id}
                style={{
                  "--track-color":
                    track.color,
                }}
              >
                <div className="track-header">
                  <div
                    className="track-color"
                    style={{
                      background:
                        track.color,
                    }}
                  />

                  <strong>
                    CH{" "}
                    {String(
                      index + 1
                    ).padStart(
                      2,
                      "0"
                    )}
                  </strong>

                  <span className="track-name">
                    {track.name}
                  </span>

                  <span>
                    {formatTime(
                      track.currentTime
                    )}
                  </span>

                  <button
                    type="button"
                    onClick={() =>
                      updateTrack(
                        track.id,
                        {
                          muted:
                            !track.muted,
                        }
                      )
                    }
                  >
                    {track.muted ? (
                      <VolumeX
                        size={15}
                      />
                    ) : (
                      <Volume2
                        size={15}
                      />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      updateTrack(
                        track.id,
                        {
                          solo:
                            !track.solo,
                        }
                      )
                    }
                    className={
                      track.solo
                        ? "track-active-button"
                        : ""
                    }
                  >
                    <Headphones
                      size={14}
                    />

                    SOLO
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      removeTrack(
                        track.id
                      )
                    }
                  >
                    <X size={14} />
                  </button>
                </div>

                <TrackWaveform
                  track={track}
                  currentTime={
                    track.currentTime
                  }
                  playing={playing}
                  onSeek={(value) =>
                    seekTrack(
                      track.id,
                      value
                    )
                  }
                />

                <div className="track-controls">
                  {/* VOLUME */}
                  <label>
                    <span>
                      VOLUME

                      <b>
                        {Math.round(
                          track.volume *
                            100
                        )}
                        %
                      </b>
                    </span>

                    <input
                      type="range"
                      min="0"
                      max="1"
                      step=".01"
                      value={
                        track.volume
                      }
                      onChange={(
                        event
                      ) =>
                        updateTrack(
                          track.id,
                          {
                            volume:
                              Number(
                                event
                                  .target
                                  .value
                              ),
                          }
                        )
                      }
                    />
                  </label>

                  {/* SPEED */}
                  <label>
                    <span>
                      SPEED

                      <b>
                        {track.speed.toFixed(
                          2
                        )}
                        ×
                      </b>
                    </span>

                    <input
                      type="range"
                      min=".5"
                      max="2"
                      step=".01"
                      value={
                        track.speed
                      }
                      onChange={(
                        event
                      ) =>
                        updateTrack(
                          track.id,
                          {
                            speed:
                              Number(
                                event
                                  .target
                                  .value
                              ),
                          }
                        )
                      }
                    />
                  </label>

                  {/* REAL PITCH */}
                  <label>
                    <span>
                      FREQ / PITCH

                      <b>
                        {track.frequency >
                        0
                          ? "+"
                          : ""}
                        {
                          track.frequency
                        }{" "}
                        st
                      </b>
                    </span>

                    <input
                      type="range"
                      min="-12"
                      max="12"
                      step="1"
                      value={
                        track.frequency
                      }
                      onChange={(
                        event
                      ) =>
                        updateTrack(
                          track.id,
                          {
                            frequency:
                              Number(
                                event
                                  .target
                                  .value
                              ),
                          }
                        )
                      }
                    />
                  </label>
                </div>
              </div>
            )
          )
        )}
      </div>

      {tracks.length > 0 && (
        <div className="common-output">
          <div className="common-output-header">
            <div>
              <span className="panel-kicker">
                MASTER BUS
              </span>

              <strong>
                COMMON OUTPUT
              </strong>
            </div>

            <span>
              {tracks.length}{" "}
              SIGNALS MIXED
            </span>
          </div>

          <CommonWaveform
            tracks={tracks}
            duration={
              maxDuration
            }
            currentTime={
              commonTime
            }
            playing={playing}
            onSeek={
              seekCommon
            }
          />

          <div className="common-timeline">
            <span>
              00:00.000
            </span>

            <input
              type="range"
              min="0"
              max={
                maxDuration || 0
              }
              step=".001"
              value={Math.min(
                commonTime,
                maxDuration || 0
              )}
              onChange={(
                event
              ) =>
                seekCommon(
                  Number(
                    event.target
                      .value
                  )
                )
              }
            />

            <span>
              {formatTime(
                maxDuration
              )}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

export default MultiSignalTimeline;