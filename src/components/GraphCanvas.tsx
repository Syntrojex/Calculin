import { useRef, useEffect, useCallback } from "react";

export interface GraphSeries {
  expr: string;
  points: { x: number; y: number }[];
  /** CSS color (resolved var or hex). If omitted, picked from the theme chart palette by index. */
  color?: string;
  /** "line" connects points as a function curve (default). "scatter" draws independent dots — use for implicit curves like circles where one x maps to multiple y. */
  mode?: "line" | "scatter";
}

interface GraphCanvasProps {
  series: GraphSeries[];
  xMin: number;
  xMax: number;
  height?: number;
  /** Optional single-line title override; otherwise a legend is shown for 2+ series. */
  title?: string;
  /** Override the auto-computed y-range (useful for implicit/square aspect plots). */
  yMin?: number;
  yMax?: number;
  /** Extra highlighted points drawn on top (e.g. intersection points between compared functions). */
  markers?: { x: number; y: number }[];
}

const FALLBACK_VARS = ["--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5"];

export function GraphCanvas({ series, xMin, xMax, height = 420, title, yMin: yMinProp, yMax: yMaxProp, markers }: GraphCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || series.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const pad = 50;
    const legendPad = series.length > 1 ? 28 : 0;

    const isDark = document.documentElement.classList.contains("dark");
    const computed = getComputedStyle(document.documentElement);
    const resolveVar = (v: string) => computed.getPropertyValue(v).trim();

    // Compute combined y range across all series (unless explicitly overridden)
    const allYs = series.flatMap((s) => s.points.map((p) => p.y));
    let yMin = yMinProp ?? (allYs.length ? Math.min(...allYs) : -1);
    let yMax = yMaxProp ?? (allYs.length ? Math.max(...allYs) : 1);
    if (yMinProp === undefined || yMaxProp === undefined) {
      const yRange = yMax - yMin || 1;
      yMin -= yRange * 0.1;
      yMax += yRange * 0.1;
    }

    // Background
    ctx.fillStyle = isDark ? "#1a1a2e" : "#fafafe";
    ctx.fillRect(0, 0, w, h);

    const toCanvasX = (x: number) => pad + ((x - xMin) / (xMax - xMin)) * (w - 2 * pad);
    const toCanvasY = (y: number) =>
      h - pad - ((y - yMin) / (yMax - yMin)) * (h - 2 * pad - legendPad) - legendPad;

    // Grid lines
    ctx.strokeStyle = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
    ctx.lineWidth = 1;
    const xStep = niceStep(xMax - xMin, 8);
    const yStep = niceStep(yMax - yMin, 6);

    ctx.font = "11px system-ui";
    ctx.fillStyle = isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)";
    ctx.textAlign = "center";

    for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax; x += xStep) {
      const cx = toCanvasX(x);
      ctx.beginPath();
      ctx.moveTo(cx, pad + legendPad);
      ctx.lineTo(cx, h - pad);
      ctx.stroke();
      ctx.fillText(formatNum(x), cx, h - pad + 16);
    }

    ctx.textAlign = "right";
    for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMax; y += yStep) {
      const cy = toCanvasY(y);
      ctx.beginPath();
      ctx.moveTo(pad, cy);
      ctx.lineTo(w - pad, cy);
      ctx.stroke();
      ctx.fillText(formatNum(y), pad - 8, cy + 4);
    }

    // Axes
    ctx.strokeStyle = isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.25)";
    ctx.lineWidth = 1.5;
    if (yMin <= 0 && yMax >= 0) {
      const y0 = toCanvasY(0);
      ctx.beginPath();
      ctx.moveTo(pad, y0);
      ctx.lineTo(w - pad, y0);
      ctx.stroke();
    }
    if (xMin <= 0 && xMax >= 0) {
      const x0 = toCanvasX(0);
      ctx.beginPath();
      ctx.moveTo(x0, pad + legendPad);
      ctx.lineTo(x0, h - pad);
      ctx.stroke();
    }

    // Plot each series
    series.forEach((s, idx) => {
      const color = s.color || resolveVar(FALLBACK_VARS[idx % FALLBACK_VARS.length]) || "#6d4aff";

      if (s.mode === "scatter") {
        ctx.fillStyle = color;
        for (const p of s.points) {
          const cx = toCanvasX(p.x);
          const cy = toCanvasY(p.y);
          if (cx < pad || cx > w - pad || cy < pad + legendPad || cy > h - pad) continue;
          ctx.beginPath();
          ctx.arc(cx, cy, 2, 0, Math.PI * 2);
          ctx.fill();
        }
        return;
      }

      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();

      let started = false;
      for (let i = 0; i < s.points.length; i++) {
        const cx = toCanvasX(s.points[i].x);
        const cy = toCanvasY(s.points[i].y);

        if (cx < pad || cx > w - pad || cy < pad + legendPad || cy > h - pad) {
          started = false;
          continue;
        }

        if (started && i > 0) {
          const prevCy = toCanvasY(s.points[i - 1].y);
          if (Math.abs(cy - prevCy) > (h - 2 * pad) * 0.8) {
            started = false;
          }
        }

        if (!started) {
          ctx.moveTo(cx, cy);
          started = true;
        } else {
          ctx.lineTo(cx, cy);
        }
      }
      ctx.stroke();
    });

    // Highlight markers (e.g. intersection points)
    if (markers && markers.length > 0) {
      const isDarkLocal = isDark;
      for (const m of markers) {
        const cx = toCanvasX(m.x);
        const cy = toCanvasY(m.y);
        if (cx < pad || cx > w - pad || cy < pad + legendPad || cy > h - pad) continue;
        ctx.beginPath();
        ctx.arc(cx, cy, 5, 0, Math.PI * 2);
        ctx.fillStyle = isDarkLocal ? "#fff" : "#fff";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = isDarkLocal ? "#f43f5e" : "#e11d48";
        ctx.stroke();
      }
    }

    // Title / Legend
    if (series.length === 1 || title) {
      ctx.fillStyle = isDark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.6)";
      ctx.font = "13px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(title ?? `f(x) = ${series[0].expr}`, w / 2, 24);
    } else if (series.length > 1) {
      // Legend row
      let lx = pad;
      const ly = 20;
      ctx.font = "12px system-ui";
      ctx.textAlign = "left";
      series.forEach((s, idx) => {
        const color = s.color || resolveVar(FALLBACK_VARS[idx % FALLBACK_VARS.length]) || "#6d4aff";
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(lx, ly - 7, 14, 8, 3);
        ctx.fill();
        ctx.fillStyle = isDark ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.7)";
        const label = `f${idx + 1}(x) = ${s.expr}`;
        ctx.fillText(label, lx + 20, ly);
        lx += ctx.measureText(label).width + 40;
      });
    }
  }, [series, xMin, xMax, title, yMinProp, yMaxProp, markers]);

  useEffect(() => {
    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full rounded-xl border border-border"
      style={{ height }}
    />
  );
}

function niceStep(range: number, maxTicks: number): number {
  const rough = range / maxTicks;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const frac = rough / pow;
  let nice: number;
  if (frac <= 1.5) nice = 1;
  else if (frac <= 3) nice = 2;
  else if (frac <= 7) nice = 5;
  else nice = 10;
  return nice * pow;
}

function formatNum(n: number): string {
  if (Math.abs(n) < 1e-10) return "0";
  if (Math.abs(n) >= 1000) return n.toFixed(0);
  if (Math.abs(n) >= 1) return n.toFixed(1);
  return n.toFixed(2);
}
