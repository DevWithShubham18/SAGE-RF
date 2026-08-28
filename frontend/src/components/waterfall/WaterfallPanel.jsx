import { useEffect, useRef } from "react";

function WaterfallPanel({ waterfall }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const container = canvas.parentElement;
    const width = container?.clientWidth || 900;
    const height = 280;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      return;
    }

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const rows =
      waterfall?.power_db ||
      waterfall?.values ||
      waterfall?.data ||
      [];

    if (!Array.isArray(rows) || rows.length === 0) {
      ctx.fillStyle = "rgba(160, 180, 205, 0.65)";
      ctx.font = "12px system-ui";
      ctx.fillText(
        "WATERFALL DATA AVAILABLE AFTER ANALYSIS",
        20,
        height / 2
      );
      return;
    }

    const rowCount = rows.length;
    const rowHeight = height / rowCount;

    rows.forEach((row, rowIndex) => {
      if (!Array.isArray(row) || row.length === 0) {
        return;
      }

      const cellWidth = width / row.length;

      row.forEach((value, columnIndex) => {
        const numericValue = Number(value);

        if (!Number.isFinite(numericValue)) {
          return;
        }

        const normalized = Math.max(
          0,
          Math.min(
            1,
            (numericValue + 120) / 120
          )
        );

        const hue = 190 + normalized * 150;
        const lightness = 18 + normalized * 52;

        ctx.fillStyle = `hsl(${hue}, 85%, ${lightness}%)`;

        ctx.fillRect(
          columnIndex * cellWidth,
          rowIndex * rowHeight,
          Math.ceil(cellWidth) + 1,
          Math.ceil(rowHeight) + 1
        );
      });
    });

    // Frequency grid
    ctx.strokeStyle = "rgba(150, 190, 220, 0.10)";
    ctx.lineWidth = 1;

    for (let i = 1; i < 10; i += 1) {
      const x = (width / 10) * i;

      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    for (let i = 1; i < 8; i += 1) {
      const y = (height / 8) * i;

      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }, [waterfall]);

  return (
    <section className="workspace-panel waterfall-panel">
      <div className="panel-header">
        <div>
          <span className="panel-kicker">
            SPECTRAL HISTORY
          </span>

          <h2>Waterfall</h2>
        </div>

        <div className="panel-status">
          <span className="status-dot" />
          TIME / FREQUENCY
        </div>
      </div>

      <div className="waterfall-stage">
        <canvas ref={canvasRef} />
      </div>

      <div className="waterfall-axis">
        <span>LOW FREQUENCY</span>
        <span>TIME ↓</span>
        <span>HIGH FREQUENCY</span>
      </div>
    </section>
  );
}

export default WaterfallPanel;
