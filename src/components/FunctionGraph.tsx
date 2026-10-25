import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Minus, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cleanVariable } from "@/lib/expression-clean";
import { realParse } from "@/lib/real-parse";
import { downloadCanvasPNG, slugifyForFilename } from "@/lib/canvas-export";
import type { CurveView, Quality } from "@/lib/plane-curves";

/**
 * An interactive function plot that samples the function itself at pixel
 * resolution, so any function draws correctly at any zoom level:
 *  - vertical asymptotes (1/x, tan x) are detected, the curve is broken there and a dashed line is drawn,
 *  - jump discontinuities (floor, piecewise) are never joined by a false vertical line,
 *  - domain edges (sqrt, ln) are traced right up to the boundary,
 *  - the y-axis auto-fits to the *typical* values so a pole can't flatten the whole curve,
 *  - drag to pan, Ctrl/⌘+scroll, pinch or the buttons to zoom, double-click to reset, hover to read values.
 */
export interface PlotSeries {
  /** Expression in `variable` (cleaned and compiled internally). */
  expr?: string;
  /** Alternative to expr — any numeric function (NaN = undefined here). */
  fn?: (x: number) => number;
  label?: string;
  color?: string;
  dashed?: boolean;
  /** Only draw inside [lo, hi]. */
  domain?: [number, number];
}
/** A curve that is not y = f(x): implicit, parametric, polar, an inequality region… Rebuilt for every view so it stays sharp. */
export interface PlotCurve {
  id: string;
  label?: string;
  color?: string;
  dashed?: boolean;
  /** Polylines in data coordinates for the current view. */
  build?: (view: CurveView, quality: Quality) => { x: number; y: number }[][];
  /** Shade every point where this is true (inequalities). */
  fill?: (x: number, y: number) => boolean;
  /** [x0, x1, y0, y1] used to frame a graph that has no y = f(x) series. */
  bounds?: [number, number, number, number];
}
export interface PlotShade { seriesIndex: number; from: number; to: number }
export interface PlotMarker { x: number; y: number; filled?: boolean; label?: string; color?: string }
export interface PlotLine { value: number; label?: string; color?: string; dashed?: boolean }

interface Props {
  series: PlotSeries[];
  variable?: string;
  xRange?: [number, number];
  yRange?: [number, number];
  shades?: PlotShade[];
  markers?: PlotMarker[];
  vlines?: PlotLine[];
  hlines?: PlotLine[];
  height?: number;
  title?: string;
  downloadFilename?: string;
  showDownload?: boolean;
  curves?: PlotCurve[];
  /** Frame the view around the curves' own bounds (curve-only graphs) instead of xRange. */
  fit?: boolean;
  /** Keep 1 unit on x the same length as 1 unit on y (circles stay round). Used when there is no y = f(x). */
  equalAspect?: boolean;
}

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6"];

interface View { x0: number; x1: number; y0?: number; y1?: number }
type Pt = { x: number; y: number };
interface Sampled { segments: Pt[][]; asymptotes: number[]; ys: number[] }

function makeEvaluator(s: PlotSeries, variable: string): ((x: number) => number) | null {
  let f: ((x: number) => number) | null = null;
  if (s.fn) f = s.fn;
  else if (s.expr && s.expr.trim()) {
    try {
      const code = realParse(s.expr).compile();
      const scope: Record<string, number> = {};
      f = (x: number) => {
        scope[variable] = x;
        try {
          const v = code.evaluate(scope);
          return typeof v === "number" ? v : NaN;
        } catch { return NaN; }
      };
    } catch { return null; }
  }
  if (!f) return null;
  const base = f;
  const d = s.domain;
  return d ? (x) => (x < d[0] || x > d[1] ? NaN : base(x)) : base;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[i];
}

export function sampleFunction(f: (x: number) => number, x0: number, x1: number, widthPx: number): Sampled {
  const n = Math.min(3200, Math.max(320, Math.round(widthPx * 1.6)));
  const xs: number[] = [];
  const ys: number[] = [];
  const infAt = new Set<number>();
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    xs.push(x);
    const y = f(x);
    if (Math.abs(y) === Infinity) infAt.add(i);
    ys.push(Number.isFinite(y) ? y : NaN);
  }
  const finite = ys.filter(Number.isFinite).sort((a, b) => a - b);
  if (finite.length === 0) return { segments: [], asymptotes: [], ys: [] };
  const q1 = percentile(finite, 0.05);
  const q2 = percentile(finite, 0.95);
  const span = Math.max(q2 - q1, 1e-9 * (1 + Math.abs(q1) + Math.abs(q2)));
  const ref = Math.max(span, 1);
  const thr = Math.max(0.55 * span, 1e-12);
  const minDx = (x1 - x0) / (widthPx * 10);

  const segments: Pt[][] = [];
  const asymCandidates: { x: number; mag: number }[] = [];
  let cur: Pt[] = [];
  const flush = () => { if (cur.length > 0) segments.push(cur); cur = []; };
  let evals = 0;
  const MAX_EVALS = 30000;

  // locate the edge of the domain between a finite x and a non-finite x
  const edge = (xf: number, xn: number): Pt | null => {
    let a = xf, b = xn;
    for (let k = 0; k < 40; k++) {
      const m = 0.5 * (a + b);
      const ym = f(m);
      evals++;
      if (Number.isFinite(ym)) a = m; else b = m;
    }
    const ya = f(a);
    return Number.isFinite(ya) ? { x: a, y: ya } : null;
  };

  const addInterval = (xa: number, ya: number, xb: number, yb: number, depth: number) => {
    const dy = Math.abs(yb - ya);
    if (dy <= thr || evals > MAX_EVALS) { cur.push({ x: xb, y: yb }); return; }
    if (xb - xa <= minDx || depth >= 18) {
      // Pixel-scale step that is still big. Steep-but-continuous (the midpoint sits near the chord)
      // is joined; a true jump or pole is broken.
      const xm = 0.5 * (xa + xb);
      const ym = f(xm);
      evals++;
      const nearChord = Number.isFinite(ym) && Math.abs(ym - 0.5 * (ya + yb)) < 0.3 * dy;
      if (nearChord) { cur.push({ x: xb, y: yb }); return; }
      // pole test: magnitude grows towards the break from BOTH sides
      const far = 6 * minDx;
      const yl = f(xa - far), yr = f(xb + far);
      evals += 2;
      const growsLeft = Number.isFinite(yl) && Math.abs(ya) > 1.4 * Math.abs(yl) && Math.abs(ya) > 1.5 * ref;
      const growsRight = Number.isFinite(yr) && Math.abs(yb) > 1.4 * Math.abs(yr) && Math.abs(yb) > 1.5 * ref;
      const signFlipBig = Math.sign(ya) !== Math.sign(yb) && Math.min(Math.abs(ya), Math.abs(yb)) > 2 * ref;
      if ((growsLeft && growsRight) || signFlipBig) asymCandidates.push({ x: xm, mag: Math.abs(ya) + Math.abs(yb) });
      flush();
      cur.push({ x: xb, y: yb });
      return;
    }
    const xm = 0.5 * (xa + xb);
    const ym = f(xm);
    evals++;
    if (!Number.isFinite(ym)) {
      const e1 = edge(xa, xm);
      if (e1) cur.push(e1);
      flush();
      const e2 = edge(xb, xm);
      cur = e2 ? [e2, { x: xb, y: yb }] : [{ x: xb, y: yb }];
      return;
    }
    addInterval(xa, ya, xm, ym, depth + 1);
    addInterval(xm, ym, xb, yb, depth + 1);
  };

  for (let i = 0; i <= n; i++) {
    const y = ys[i];
    if (!Number.isFinite(y)) {
      // f(x0) = ±Infinity exactly at a sample (1/0): a vertical asymptote, not a domain hole
      if (infAt.has(i) && i > 0 && i < n && Number.isFinite(ys[i - 1]) && Number.isFinite(ys[i + 1])) asymCandidates.push({ x: xs[i], mag: Infinity });
      if (cur.length > 0) {
        const e = edge(cur[cur.length - 1].x, xs[i]);
        if (e && e.x > cur[cur.length - 1].x) cur.push(e);
        flush();
      }
      continue;
    }
    if (cur.length === 0) {
      if (i > 0 && !Number.isFinite(ys[i - 1])) {
        const e = edge(xs[i], xs[i - 1]);
        if (e && e.x < xs[i]) cur.push(e);
      }
      cur.push({ x: xs[i], y });
      continue;
    }
    const prev = cur[cur.length - 1];
    addInterval(prev.x, prev.y, xs[i], y, 0);
  }
  flush();
  // cluster hits belonging to one pole; keep the strongest (closest to the pole)
  asymCandidates.sort((a, b) => a.x - b.x);
  const merged: { x: number; mag: number }[] = [];
  for (const c of asymCandidates) {
    const last = merged[merged.length - 1];
    if (last && c.x - last.x < (x1 - x0) * 0.02) { if (c.mag > last.mag) merged[merged.length - 1] = c; }
    else merged.push(c);
  }
  return { segments, asymptotes: merged.map((m) => m.x), ys: finite };
}

function niceStep(range: number, target = 8): number {
  const raw = range / target;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
}

function fmtTick(v: number, step: number): string {
  if (Math.abs(v) < step * 1e-9) return "0";
  const a = Math.abs(v);
  if (a >= 1e6 || a < 1e-4) return v.toExponential(1).replace("e+", "e");
  const digits = Math.min(8, Math.max(0, -Math.floor(Math.log10(step) + 1e-9)));
  return v.toFixed(digits).replace(/\.?0+$/, (m) => (m.startsWith(".") ? "" : m));
}

export function FunctionGraph({
  series, variable = "x", xRange, yRange, shades, markers, vlines, hlines, height = 360, title, downloadFilename, showDownload = true, curves, equalAspect = false, fit = false,
}: Props) {
  const [quality, setQuality] = useState<Quality>("fine");
  const settleTimer = useRef<number | null>(null);
  const settleSoon = () => { if (settleTimer.current) window.clearTimeout(settleTimer.current); settleTimer.current = window.setTimeout(() => setQuality("fine"), 160); };
  const v = cleanVariable(variable);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(600);
  const [override, setOverride] = useState<View | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ pointers: Map<number, { x: number; y: number }>; last?: { x: number; y: number }; startDist?: number; moved: number } | null>(null);

  const evals = useMemo(() => series.map((s) => makeEvaluator(s, v)), [series, v]);

  // default x-window: explicit range, else wrap the points of interest, else [-10, 10]
  const padL = 54, padR = 14, padT = 14, padB = 30;
  const defaultX = useMemo<[number, number]>(() => {
    if (fit && curves?.length && curves.every((c) => c.bounds)) {
      const bs = curves.map((c) => c.bounds!);
      const bx0 = Math.min(...bs.map((b) => b[0])), bx1 = Math.max(...bs.map((b) => b[1]));
      const by0 = Math.min(...bs.map((b) => b[2])), by1 = Math.max(...bs.map((b) => b[3]));
      const pw = Math.max(100, width - padL - padR), ph = Math.max(60, height - padT - padB);
      const scale = Math.max((bx1 - bx0) / pw, (by1 - by0) / ph, 1e-9) * 1.18;
      const cx = (bx0 + bx1) / 2;
      return [cx - (scale * pw) / 2, cx + (scale * pw) / 2];
    }
    if (xRange && xRange[1] > xRange[0]) return xRange;
    const hints: number[] = [];
    shades?.forEach((s) => hints.push(s.from, s.to));
    markers?.forEach((m) => hints.push(m.x));
    vlines?.forEach((l) => hints.push(l.value));
    const fin = hints.filter(Number.isFinite);
    if (fin.length === 0) return [-10, 10];
    const lo = Math.min(...fin), hi = Math.max(...fin);
    const span = hi - lo;
    if (span === 0) return [lo - 5, hi + 5];
    return [lo - span * 0.35 - 0.5, hi + span * 0.35 + 0.5];
  }, [xRange, shades, markers, vlines, fit, curves, width, height]);

  const signature = useMemo(
    () => JSON.stringify([series.map((s) => [s.expr, s.label, s.domain, s.fn ? "fn" : ""]), xRange, yRange, shades, markers?.map((m) => [m.x, m.y]), vlines?.map((l) => l.value), v, curves?.map((c) => c.id)]),
    [series, xRange, yRange, shades, markers, vlines, v, curves],
  );
  useEffect(() => { setOverride(null); setHoverX(null); }, [signature]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(240, Math.floor(el.clientWidth))));
    ro.observe(el);
    setWidth(Math.max(240, Math.floor(el.clientWidth)));
    return () => ro.disconnect();
  }, []);


  /** Everything that depends on the view: samples + resolved y-range. */
  const frame = useMemo(() => {
    const x0 = override?.x0 ?? defaultX[0];
    const x1 = override?.x1 ?? defaultX[1];
    const plotW = Math.max(100, width - padL - padR);
    const sampled = evals.map((f) => (f ? sampleFunction(f, x0, x1, plotW) : null));
    let y0: number, y1: number;
    const userY = override?.y0 !== undefined && override?.y1 !== undefined ? [override.y0, override.y1] : yRange;
    if (userY && userY[1] > userY[0]) {
      [y0, y1] = userY as [number, number];
    } else {
      const all: number[] = [];
      sampled.forEach((sm) => sm && all.push(...sm.ys));
      all.sort((a, b) => a - b);
      let lo = all.length ? percentile(all, 0.015) : -5;
      let hi = all.length ? percentile(all, 0.985) : 5;
      markers?.forEach((m) => { if (Number.isFinite(m.y) && m.x >= x0 && m.x <= x1) { lo = Math.min(lo, m.y); hi = Math.max(hi, m.y); } });
      hlines?.forEach((l) => { if (Number.isFinite(l.value)) { lo = Math.min(lo, l.value); hi = Math.max(hi, l.value); } });
      if (shades?.length) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
      if (!(hi - lo > 1e-12 * (1 + Math.abs(hi) + Math.abs(lo)))) { const c = Number.isFinite(lo) ? lo : 0; lo = c - 1; hi = c + 1; }
      // pull zero into view when it's nearby (axes read better)
      if (lo > 0 && lo < 0.7 * hi) lo = 0;
      if (hi < 0 && hi > 0.7 * lo) hi = 0;
      const pad = (hi - lo) * 0.12;
      y0 = lo - pad; y1 = hi + pad;
      const noExplicit = all.length === 0;
      if (noExplicit && curves?.length) {
        const bs = curves.map((c) => c.bounds).filter(Boolean) as [number, number, number, number][];
        const yc = bs.length ? (Math.min(...bs.map((b) => b[2])) + Math.max(...bs.map((b) => b[3]))) / 2 : 0;
        if (equalAspect) {
          const half = ((x1 - x0) * Math.max(60, height - padT - padB)) / plotW / 2;
          y0 = yc - half; y1 = yc + half;
        } else if (bs.length) {
          const lo2 = Math.min(...bs.map((b) => b[2])), hi2 = Math.max(...bs.map((b) => b[3]));
          const pd = Math.max(hi2 - lo2, 1e-6) * 0.12;
          y0 = lo2 - pd; y1 = hi2 + pd;
        }
      }
    }
    const plotHpx = Math.max(60, height - padT - padB);
    const curveSegs = (curves ?? []).map((c) => (c.build ? c.build({ x0, x1, y0, y1, plotW, plotH: plotHpx }, quality) : []));
    return { x0, x1, y0, y1, sampled, plotW, curveSegs };
  }, [override, defaultX, evals, width, yRange, markers, hlines, shades, curves, equalAspect, quality, height]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const dark = document.documentElement.classList.contains("dark");
    const text = dark ? "#cbd5e1" : "#475569";
    const gridC = dark ? "rgba(148,163,184,0.16)" : "rgba(100,116,139,0.18)";
    const axisC = dark ? "rgba(226,232,240,0.55)" : "rgba(15,23,42,0.55)";

    const { x0, x1, y0, y1, sampled } = frame;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;
    const sx = (x: number) => padL + ((x - x0) / (x1 - x0)) * plotW;
    const sy = (y: number) => padT + (1 - (y - y0) / (y1 - y0)) * plotH;
    const clampY = (py: number) => Math.max(-1e5, Math.min(1e5, py));

    ctx.clearRect(0, 0, width, height);
    ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";

    // grid + tick labels
    const xs = niceStep(x1 - x0), ys = niceStep(y1 - y0, 6);
    ctx.lineWidth = 1;
    ctx.textBaseline = "top";
    ctx.textAlign = "center";
    for (let gx = Math.ceil(x0 / xs) * xs; gx <= x1 + xs * 1e-9; gx += xs) {
      const px = sx(gx);
      ctx.strokeStyle = gridC; ctx.beginPath(); ctx.moveTo(px, padT); ctx.lineTo(px, padT + plotH); ctx.stroke();
      ctx.fillStyle = text; ctx.fillText(fmtTick(gx, xs), px, padT + plotH + 6);
    }
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    for (let gy = Math.ceil(y0 / ys) * ys; gy <= y1 + ys * 1e-9; gy += ys) {
      const py = sy(gy);
      ctx.strokeStyle = gridC; ctx.beginPath(); ctx.moveTo(padL, py); ctx.lineTo(padL + plotW, py); ctx.stroke();
      ctx.fillStyle = text; ctx.fillText(fmtTick(gy, ys), padL - 7, py);
    }
    // axes
    ctx.strokeStyle = axisC; ctx.lineWidth = 1.4;
    if (y0 <= 0 && y1 >= 0) { ctx.beginPath(); ctx.moveTo(padL, sy(0)); ctx.lineTo(padL + plotW, sy(0)); ctx.stroke(); }
    if (x0 <= 0 && x1 >= 0) { ctx.beginPath(); ctx.moveTo(sx(0), padT); ctx.lineTo(sx(0), padT + plotH); ctx.stroke(); }
    ctx.strokeStyle = gridC; ctx.strokeRect(padL, padT, plotW, plotH);

    // everything below is clipped to the plot area
    ctx.save();
    ctx.beginPath(); ctx.rect(padL, padT, plotW, plotH); ctx.clip();

    // shaded areas
    shades?.forEach((sh) => {
      const f = evals[sh.seriesIndex];
      if (!f) return;
      const a = Math.max(Math.min(sh.from, sh.to), x0 - (x1 - x0));
      const b = Math.min(Math.max(sh.from, sh.to), x1 + (x1 - x0));
      if (!(b > a)) return;
      const N = 500;
      const pts: Pt[] = [];
      for (let i = 0; i <= N; i++) {
        const x = a + ((b - a) * i) / N;
        const y = f(x);
        if (Number.isFinite(y) && Math.abs(y) < 1e7) pts.push({ x, y });
      }
      if (pts.length < 2) return;
      const zero = sy(0);
      const path = () => {
        ctx.beginPath();
        ctx.moveTo(sx(pts[0].x), zero);
        pts.forEach((p) => ctx.lineTo(sx(p.x), clampY(sy(p.y))));
        ctx.lineTo(sx(pts[pts.length - 1].x), zero);
        ctx.closePath();
      };
      ctx.save(); ctx.beginPath(); ctx.rect(padL, padT, plotW, Math.max(0, zero - padT)); ctx.clip(); path(); ctx.fillStyle = "rgba(16,185,129,0.28)"; ctx.fill(); ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.rect(padL, zero, plotW, Math.max(0, padT + plotH - zero)); ctx.clip(); path(); ctx.fillStyle = "rgba(239,68,68,0.26)"; ctx.fill(); ctx.restore();
      [a, b].forEach((x) => { ctx.strokeStyle = "rgba(16,185,129,0.8)"; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(sx(x), padT); ctx.lineTo(sx(x), padT + plotH); ctx.stroke(); ctx.setLineDash([]); });
    });

    // inequality regions (below the curves so the boundary stays crisp)
    (curves ?? []).forEach((c, ci) => {
      if (!c.fill) return;
      const color = c.color ?? COLORS[(series.length + ci) % COLORS.length];
      const step = quality === "fine" ? 4 : 8;
      ctx.fillStyle = color + "40";
      for (let px = padL; px < padL + plotW; px += step) {
        for (let py = padT; py < padT + plotH; py += step) {
          const x = x0 + ((px + step / 2 - padL) / plotW) * (x1 - x0);
          const y = y1 - ((py + step / 2 - padT) / plotH) * (y1 - y0);
          if (c.fill(x, y)) ctx.fillRect(px, py, step, step);
        }
      }
    });

    // user lines
    const drawLine = (l: PlotLine, vertical: boolean) => {
      ctx.strokeStyle = l.color ?? "rgba(245,158,11,0.9)"; ctx.lineWidth = 1.4;
      ctx.setLineDash(l.dashed === false ? [] : [6, 4]);
      ctx.beginPath();
      if (vertical) { ctx.moveTo(sx(l.value), padT); ctx.lineTo(sx(l.value), padT + plotH); }
      else { ctx.moveTo(padL, sy(l.value)); ctx.lineTo(padL + plotW, sy(l.value)); }
      ctx.stroke(); ctx.setLineDash([]);
      if (l.label) { ctx.fillStyle = l.color ?? "rgba(217,119,6,1)"; ctx.textAlign = vertical ? "left" : "right"; ctx.textBaseline = vertical ? "top" : "bottom"; ctx.fillText(l.label, vertical ? sx(l.value) + 4 : padL + plotW - 4, vertical ? padT + 3 : sy(l.value) - 3); }
    };
    vlines?.forEach((l) => Number.isFinite(l.value) && drawLine(l, true));
    hlines?.forEach((l) => Number.isFinite(l.value) && drawLine(l, false));

    // curves
    series.forEach((s, i) => {
      const sm = sampled[i];
      if (!sm) return;
      const color = s.color ?? COLORS[i % COLORS.length];
      // asymptotes first
      ctx.strokeStyle = dark ? "rgba(148,163,184,0.55)" : "rgba(100,116,139,0.6)"; ctx.lineWidth = 1; ctx.setLineDash([5, 5]);
      sm.asymptotes.forEach((ax) => { ctx.beginPath(); ctx.moveTo(sx(ax), padT); ctx.lineTo(sx(ax), padT + plotH); ctx.stroke(); });
      ctx.setLineDash(s.dashed ? [7, 5] : []);
      ctx.strokeStyle = color; ctx.lineWidth = 2.3; ctx.lineJoin = "round"; ctx.lineCap = "round";
      sm.segments.forEach((seg) => {
        if (seg.length === 1) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(sx(seg[0].x), clampY(sy(seg[0].y)), 2.4, 0, Math.PI * 2); ctx.fill(); return; }
        ctx.beginPath();
        seg.forEach((p, k) => { const px = sx(p.x), py = clampY(sy(p.y)); if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); });
        ctx.stroke();
      });
      ctx.setLineDash([]);
    });

    // non-function curves (implicit / parametric / polar / inequality boundaries)
    (curves ?? []).forEach((c, ci) => {
      const segs = frame.curveSegs[ci];
      if (!segs || segs.length === 0) return;
      const color = c.color ?? COLORS[(series.length + ci) % COLORS.length];
      ctx.strokeStyle = color; ctx.lineWidth = 2.3; ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.setLineDash(c.dashed ? [7, 5] : []);
      segs.forEach((seg) => {
        if (seg.length === 1) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(sx(seg[0].x), clampY(sy(seg[0].y)), 2.4, 0, Math.PI * 2); ctx.fill(); return; }
        ctx.beginPath();
        seg.forEach((p, k) => { const px = sx(p.x), py = clampY(sy(p.y)); if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); });
        ctx.stroke();
      });
      ctx.setLineDash([]);
    });

    // markers
    markers?.forEach((m) => {
      if (!Number.isFinite(m.x) || !Number.isFinite(m.y)) return;
      const px = sx(m.x), py = sy(m.y);
      const c = m.color ?? "#ef4444";
      ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fillStyle = m.filled ? c : (dark ? "#0b1020" : "#ffffff"); ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = c; ctx.stroke();
      if (m.label) { ctx.fillStyle = text; ctx.textAlign = "left"; ctx.textBaseline = "bottom"; ctx.fillText(m.label, px + 8, py - 6); }
    });

    // hover crosshair
    if (hoverX !== null && hoverX >= x0 && hoverX <= x1) {
      ctx.strokeStyle = dark ? "rgba(226,232,240,0.35)" : "rgba(15,23,42,0.3)"; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(sx(hoverX), padT); ctx.lineTo(sx(hoverX), padT + plotH); ctx.stroke(); ctx.setLineDash([]);
      series.forEach((s, i) => {
        const f = evals[i]; if (!f) return;
        const y = f(hoverX);
        if (Number.isFinite(y)) { ctx.beginPath(); ctx.arc(sx(hoverX), clampY(sy(y)), 4, 0, Math.PI * 2); ctx.fillStyle = s.color ?? COLORS[i % COLORS.length]; ctx.fill(); }
      });
    }
    ctx.restore();

    // legend
    const labelled = [
      ...series.map((s, i) => ({ s: { label: s.label, color: s.color, dashed: s.dashed }, i })),
      ...(curves ?? []).map((c, ci) => ({ s: { label: c.label, color: c.color, dashed: c.dashed }, i: series.length + ci })),
    ].filter(({ s }) => s.label);
    if (labelled.length > 0 && (labelled.length > 1 || title === undefined)) {
      ctx.font = "12px ui-sans-serif, system-ui, sans-serif";
      let lx = padL + 10;
      const ly = padT + 12;
      labelled.forEach(({ s, i }) => {
        const c = s.color ?? COLORS[i % COLORS.length];
        const w = ctx.measureText(s.label!).width;
        ctx.fillStyle = dark ? "rgba(11,16,32,0.7)" : "rgba(255,255,255,0.75)"; ctx.fillRect(lx - 4, ly - 9, w + 30, 18);
        ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.setLineDash(s.dashed ? [5, 3] : []); ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + 14, ly); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = text; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(s.label!, lx + 19, ly);
        lx += w + 38;
      });
    }
  }, [frame, width, height, series, evals, shades, markers, vlines, hlines, hoverX, title, curves, quality]);

  useEffect(() => { draw(); }, [draw]);
  useEffect(() => {
    const mo = new MutationObserver(() => draw());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, [draw]);

  // ── interaction ────────────────────────────────────────────────────────────
  const toData = (clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const plotW = rect.width - padL - padR;
    const plotH = rect.height - padT - padB;
    return {
      x: frame.x0 + ((clientX - rect.left - padL) / plotW) * (frame.x1 - frame.x0),
      y: frame.y1 - ((clientY - rect.top - padT) / plotH) * (frame.y1 - frame.y0),
      plotW, plotH,
    };
  };

  const zoomAbout = (cx: number, cy: number, factor: number) => {
    const nx0 = cx - (cx - frame.x0) * factor;
    const nx1 = cx + (frame.x1 - cx) * factor;
    if (nx1 - nx0 < 1e-9 || nx1 - nx0 > 1e9) return;
    const keepY = override?.y0 !== undefined;
    const ny0 = cy - (cy - frame.y0) * factor;
    const ny1 = cy + (frame.y1 - cy) * factor;
    setOverride({ x0: nx0, x1: nx1, y0: keepY || factor !== 1 ? ny0 : undefined, y1: keepY || factor !== 1 ? ny1 : undefined });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    if (!drag.current) drag.current = { pointers: new Map(), moved: 0 };
    drag.current.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    drag.current.last = { x: e.clientX, y: e.clientY };
    if (drag.current.pointers.size === 2) {
      const [a, b] = [...drag.current.pointers.values()];
      drag.current.startDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const p = toData(e.clientX, e.clientY);
    if (!d || d.pointers.size === 0) {
      setHoverX(p.x);
      const rect = canvasRef.current!.getBoundingClientRect();
      setHoverPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      return;
    }
    d.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (curves?.length) { setQuality("fast"); settleSoon(); }
    if (d.pointers.size === 2 && d.startDist) {
      const [a, b] = [...d.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const factor = d.startDist / Math.max(dist, 1);
      const mid = toData((a.x + b.x) / 2, (a.y + b.y) / 2);
      d.startDist = dist;
      zoomAbout(mid.x, mid.y, factor);
      return;
    }
    if (d.last) {
      const dx = e.clientX - d.last.x;
      const dy = e.clientY - d.last.y;
      d.moved += Math.abs(dx) + Math.abs(dy);
      const ux = (frame.x1 - frame.x0) / p.plotW;
      const uy = (frame.y1 - frame.y0) / p.plotH;
      const verticalIntent = Math.abs(dy) > 3 || override?.y0 !== undefined;
      setOverride({
        x0: frame.x0 - dx * ux, x1: frame.x1 - dx * ux,
        y0: verticalIntent ? frame.y0 + dy * uy : undefined,
        y1: verticalIntent ? frame.y1 + dy * uy : undefined,
      });
      d.last = { x: e.clientX, y: e.clientY };
      setHoverX(null);
      setHoverPos(null);
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    d.pointers.delete(e.pointerId);
    d.startDist = undefined;
    if (d.pointers.size === 0) drag.current = null;
  };

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return; // plain scrolling keeps scrolling the page
      e.preventDefault();
      if (curves?.length) { setQuality("fast"); settleSoon(); }
      const rect = el.getBoundingClientRect();
      const plotW = rect.width - padL - padR;
      const plotH = rect.height - padT - padB;
      const cx = frame.x0 + ((e.clientX - rect.left - padL) / plotW) * (frame.x1 - frame.x0);
      const cy = frame.y1 - ((e.clientY - rect.top - padT) / plotH) * (frame.y1 - frame.y0);
      zoomAbout(cx, cy, Math.pow(1.0018, e.deltaY));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  const centre = () => ({ x: (frame.x0 + frame.x1) / 2, y: (frame.y0 + frame.y1) / 2 });
  const name = downloadFilename ?? slugifyForFilename(series[0]?.label ?? series[0]?.expr ?? "graph");

  return (
    <div ref={wrapRef} className="relative w-full select-none">
      <div className="absolute right-2 top-2 z-10 flex gap-1">
        <Button type="button" variant="outline" size="icon" className="h-7 w-7 bg-background/80" onClick={() => zoomAbout(centre().x, centre().y, 0.7)} aria-label="Zoom in"><Plus className="h-3.5 w-3.5" /></Button>
        <Button type="button" variant="outline" size="icon" className="h-7 w-7 bg-background/80" onClick={() => zoomAbout(centre().x, centre().y, 1.4)} aria-label="Zoom out"><Minus className="h-3.5 w-3.5" /></Button>
        <Button type="button" variant="outline" size="icon" className="h-7 w-7 bg-background/80" onClick={() => setOverride(null)} aria-label="Reset view"><RotateCcw className="h-3.5 w-3.5" /></Button>
        {showDownload && (
          <Button type="button" variant="outline" size="icon" className="h-7 w-7 bg-background/80" onClick={() => canvasRef.current && downloadCanvasPNG(canvasRef.current, name)} aria-label="Download graph as PNG"><Camera className="h-3.5 w-3.5" /></Button>
        )}
      </div>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={title ?? `Graph of ${series.map((s) => s.label ?? s.expr).filter(Boolean).join(", ")}`}
        className="block w-full touch-none cursor-crosshair rounded-md"
        style={{ height }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => { if (!drag.current) { setHoverX(null); setHoverPos(null); } }}
        onDoubleClick={() => setOverride(null)}
      />
      {hoverX !== null && hoverPos && (
        <div
          className="pointer-events-none absolute z-20 rounded-md bg-background/95 px-2 py-1 text-[11px] font-mono leading-tight text-muted-foreground shadow-md ring-1 ring-border"
          style={{
            left: hoverPos.x + (hoverPos.x > width * 0.6 ? -14 : 14),
            top: hoverPos.y + (hoverPos.y > height * 0.62 ? -14 : 14),
            transform: `translate(${hoverPos.x > width * 0.6 ? "-100%" : "0"}, ${hoverPos.y > height * 0.62 ? "-100%" : "0"})`,
          }}
        >
          <div className="text-foreground">{v} = {fmtTick(hoverX, niceStep(frame.x1 - frame.x0, 200))}</div>
          {series.map((s, i) => {
            const f = evals[i];
            if (!f) return null;
            const y = f(hoverX);
            return (
              <div key={i} style={{ color: s.color ?? COLORS[i % COLORS.length] }}>
                {s.label ?? "f"} = {Number.isFinite(y) ? fmtTick(y, niceStep(frame.y1 - frame.y0, 2000)) : "undefined"}
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-1 text-center text-[10.5px] text-muted-foreground">Drag to pan · Ctrl/⌘ + scroll, pinch or ± to zoom · double-click to reset</p>
    </div>
  );
}
