/**
 * Builds the geometric picture for each vector operation. The same scene
 * feeds both the 2D (SVG) and 3D (three.js) diagrams, so the two always
 * agree — tip-to-tail chains, the parallelogram, projection foot-points,
 * angle arcs, the cross-product parallelogram, the parallelepiped …
 */
import type { Vec3 } from "./vector-solver";

export interface SArrow { from: Vec3; vec: Vec3; color: string; label: string; dashed?: boolean; faint?: boolean; width?: number }
export interface SLine { points: Vec3[]; color: string; dashed?: boolean; faint?: boolean }
export interface SPoly { points: Vec3[]; color: string; opacity: number }
export interface SArc { points: Vec3[]; color: string; label?: string }
export interface SLegend { color: string; text: string }
export interface Scene { arrows: SArrow[]; lines: SLine[]; polys: SPoly[]; arcs: SArc[]; legend: SLegend[]; extent: number }

export const COLORS = ["#6366f1", "#f59e0b", "#ec4899", "#8b5cf6", "#14b8a6", "#64748b"];
export const RESULT_COLOR = "#10b981";
const Z: Vec3 = { x: 0, y: 0, z: 0 };

export const vadd = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const vsub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const vscale = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
export const vdot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const vnorm = (a: Vec3): number => Math.sqrt(vdot(a, a));
export const vcross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });

function fmt(n: number): string {
  return String(parseFloat(n.toFixed(4)));
}
function tup(v: Vec3, is3D: boolean): string {
  return is3D ? `⟨${fmt(v.x)}, ${fmt(v.y)}, ${fmt(v.z)}⟩` : `⟨${fmt(v.x)}, ${fmt(v.y)}⟩`;
}

/** Circular arc from direction a to direction b around `center` (shortest way). */
function arcPoints(center: Vec3, a: Vec3, b: Vec3, radius: number): Vec3[] | null {
  const na = vnorm(a), nb = vnorm(b);
  if (na < 1e-9 || nb < 1e-9) return null;
  const ua = vscale(a, 1 / na), ub = vscale(b, 1 / nb);
  const c = Math.max(-1, Math.min(1, vdot(ua, ub)));
  const om = Math.acos(c);
  if (om < 1e-3 || Math.abs(om - Math.PI) < 1e-3) return null;
  const s = Math.sin(om);
  const pts: Vec3[] = [];
  for (let i = 0; i <= 28; i++) {
    const t = i / 28;
    const p = vadd(vscale(ua, Math.sin((1 - t) * om) / s), vscale(ub, Math.sin(t * om) / s));
    pts.push(vadd(center, vscale(p, radius)));
  }
  return pts;
}

export interface SceneInput {
  op: "add" | "subtract" | "scale" | "magnitude" | "unit" | "dot" | "cross" | "angle" | "scalarProj" | "vectorProj" | "triple";
  vectors: Vec3[];
  names: string[];
  k: number;
  is3D: boolean;
  result?: Vec3;
  scalar?: number;
}

export function buildScene(inp: SceneInput): Scene {
  const { op, vectors, names, k, is3D } = inp;
  const sc: Scene = { arrows: [], lines: [], polys: [], arcs: [], legend: [], extent: 1 };
  const ok = vectors.filter((v) => isFinite(v.x) && isFinite(v.y) && isFinite(v.z));
  if (ok.length !== vectors.length || vectors.length === 0) return sc;
  const [u, v, w] = vectors;
  const col = (i: number) => COLORS[i % COLORS.length];
  const arrow = (from: Vec3, vec: Vec3, color: string, label: string, extra: Partial<SArrow> = {}) => sc.arrows.push({ from, vec, color, label, ...extra });
  const legendFor = (i: number) => sc.legend.push({ color: col(i), text: `${names[i]} = ${tup(vectors[i], is3D)}` });
  const addResult = (label: string) => {
    if (inp.result) {
      sc.legend.push({ color: RESULT_COLOR, text: `${label} = ${tup(inp.result, is3D)}` });
    }
  };

  switch (op) {
    case "add": {
      // tip-to-tail chain, then the resultant from the origin
      let tail = Z;
      vectors.forEach((vec, i) => {
        arrow(tail, vec, col(i), names[i]);
        legendFor(i);
        tail = vadd(tail, vec);
      });
      const total = tail;
      arrow(Z, total, RESULT_COLOR, names.slice(0, vectors.length).join("+"), { width: 4 });
      sc.legend.push({ color: RESULT_COLOR, text: `${names.slice(0, vectors.length).join("+")} = ${tup(total, is3D)}` });
      if (vectors.length === 2) {
        // parallelogram rule: the other two sides, dashed
        arrow(Z, v, col(1), "", { dashed: true, faint: true });
        arrow(v, u, col(0), "", { dashed: true, faint: true });
        sc.polys.push({ points: [Z, u, vadd(u, v), v], color: RESULT_COLOR, opacity: 0.07 });
      }
      break;
    }
    case "subtract": {
      const d = vsub(u, v);
      arrow(Z, u, col(0), names[0]); arrow(Z, v, col(1), names[1]);
      arrow(v, d, RESULT_COLOR, `${names[0]}−${names[1]}`, { width: 4 });
      arrow(Z, d, RESULT_COLOR, "", { dashed: true, faint: true });
      sc.lines.push({ points: [u, vadd(v, d)], color: RESULT_COLOR, faint: true, dashed: true });
      legendFor(0); legendFor(1);
      sc.legend.push({ color: RESULT_COLOR, text: `${names[0]}−${names[1]} = ${tup(d, is3D)}  (points from tip of ${names[1]} to tip of ${names[0]})` });
      break;
    }
    case "scale": {
      const r = vscale(u, k);
      arrow(Z, r, RESULT_COLOR, `${fmt(k)}${names[0]}`, { width: 5, faint: true });
      arrow(Z, u, col(0), names[0]);
      legendFor(0);
      sc.legend.push({ color: RESULT_COLOR, text: `${fmt(k)}·${names[0]} = ${tup(r, is3D)}${k < 0 ? "  (direction reversed)" : ""}` });
      break;
    }
    case "magnitude": {
      arrow(Z, u, col(0), names[0]);
      const legs = is3D ? [Z, { x: u.x, y: 0, z: 0 }, { x: u.x, y: u.y, z: 0 }, u] : [Z, { x: u.x, y: 0, z: 0 }, u];
      sc.lines.push({ points: legs, color: col(0), dashed: true, faint: true });
      legendFor(0);
      sc.legend.push({ color: RESULT_COLOR, text: `|${names[0]}| = ${fmt(vnorm(u))}  (length of the arrow)` });
      break;
    }
    case "unit": {
      const n = vnorm(u);
      arrow(Z, u, col(0), names[0]);
      if (n > 1e-12) arrow(Z, vscale(u, 1 / n), RESULT_COLOR, `${names[0]}̂`, { width: 4 });
      const circle: Vec3[] = [];
      for (let i = 0; i <= 72; i++) { const a = (i / 72) * 2 * Math.PI; circle.push({ x: Math.cos(a), y: Math.sin(a), z: 0 }); }
      sc.lines.push({ points: circle, color: "#94a3b8", faint: true, dashed: true });
      legendFor(0);
      if (inp.result) sc.legend.push({ color: RESULT_COLOR, text: `unit vector = ${tup(inp.result, is3D)}  (length 1)` });
      break;
    }
    case "dot":
    case "angle":
    case "scalarProj":
    case "vectorProj": {
      arrow(Z, u, col(0), names[0]); arrow(Z, v, col(1), names[1]);
      legendFor(0); legendFor(1);
      const nv2 = vdot(v, v);
      if (nv2 > 1e-12) {
        const t = vdot(u, v) / nv2;
        const foot = vscale(v, t);
        if (op !== "angle") {
          sc.lines.push({ points: [u, foot], color: "#64748b", dashed: true });
          if (op === "vectorProj") arrow(Z, foot, RESULT_COLOR, `proj`, { width: 4 });
          else arrow(Z, foot, RESULT_COLOR, "", { width: 4, faint: op === "dot" });
          // right-angle marker at the foot
          const dir = vnorm(vsub(u, foot)) > 1e-9 ? vscale(vsub(u, foot), 1 / vnorm(vsub(u, foot))) : null;
          const along = vnorm(v) > 1e-9 ? vscale(v, 1 / vnorm(v)) : null;
          if (dir && along) {
            const s = 0.12 * Math.max(vnorm(u), vnorm(v), 1);
            sc.lines.push({ points: [vsub(foot, vscale(along, t >= 0 ? s : -s)), vadd(vsub(foot, vscale(along, t >= 0 ? s : -s)), vscale(dir, s)), vadd(foot, vscale(dir, s))], color: "#64748b" });
          }
          if (op === "scalarProj") sc.legend.push({ color: RESULT_COLOR, text: `scalar projection = ${fmt(t * vnorm(v))}  (signed length of the green segment)` });
          if (op === "vectorProj" && inp.result) sc.legend.push({ color: RESULT_COLOR, text: `proj = ${tup(inp.result, is3D)}` });
        }
      }
      const r = 0.3 * Math.min(vnorm(u), vnorm(v));
      const pts = r > 0 ? arcPoints(Z, u, v, r) : null;
      if (pts) {
        const deg = (Math.acos(Math.max(-1, Math.min(1, vdot(u, v) / (vnorm(u) * vnorm(v))))) * 180) / Math.PI;
        sc.arcs.push({ points: pts, color: "#ef4444", label: `${fmt(deg)}°` });
      }
      if (op === "dot") sc.legend.push({ color: "#ef4444", text: `${names[0]}·${names[1]} = ${fmt(vdot(u, v))}` });
      if (op === "angle" && inp.scalar !== undefined) sc.legend.push({ color: "#ef4444", text: `θ = ${fmt(inp.scalar)}°` });
      break;
    }
    case "cross": {
      arrow(Z, u, col(0), names[0]); arrow(Z, v, col(1), names[1]);
      sc.polys.push({ points: [Z, u, vadd(u, v), v], color: RESULT_COLOR, opacity: 0.14 });
      sc.lines.push({ points: [u, vadd(u, v), v], color: "#94a3b8", dashed: true, faint: true });
      if (inp.result) arrow(Z, inp.result, RESULT_COLOR, `${names[0]}×${names[1]}`, { width: 4 });
      legendFor(0); legendFor(1);
      if (inp.result) sc.legend.push({ color: RESULT_COLOR, text: `${names[0]}×${names[1]} = ${tup(inp.result, true)}  (⊥ to both; length = parallelogram area ${fmt(vnorm(inp.result))})` });
      break;
    }
    case "triple": {
      if (!w) break;
      arrow(Z, u, col(0), names[0]); arrow(Z, v, col(1), names[1]); arrow(Z, w, col(2), names[2]);
      const uv = vadd(u, v), uw = vadd(u, w), vw = vadd(v, w), all = vadd(uv, w);
      sc.polys.push(
        { points: [Z, u, uv, v], color: RESULT_COLOR, opacity: 0.12 },
        { points: [Z, u, uw, w], color: RESULT_COLOR, opacity: 0.12 },
        { points: [Z, v, vw, w], color: RESULT_COLOR, opacity: 0.12 },
      );
      const edges: [Vec3, Vec3][] = [[u, uv], [v, uv], [u, uw], [w, uw], [v, vw], [w, vw], [uv, all], [uw, all], [vw, all]];
      edges.forEach(([a, b]) => sc.lines.push({ points: [a, b], color: "#94a3b8", dashed: true, faint: true }));
      legendFor(0); legendFor(1); legendFor(2);
      if (inp.scalar !== undefined) sc.legend.push({ color: RESULT_COLOR, text: `${names[0]}·(${names[1]}×${names[2]}) = ${fmt(inp.scalar)}  → volume of the box = ${fmt(Math.abs(inp.scalar))}` });
      break;
    }
  }
  if (op === "unit" || op === "add" || op === "subtract" || op === "scale" || op === "cross") void addResult;

  // extent: the largest coordinate magnitude over everything drawn (2D ignores z)
  let ext = 1;
  const bump = (p: Vec3) => { ext = Math.max(ext, Math.abs(p.x), Math.abs(p.y), is3D ? Math.abs(p.z) : 0); };
  sc.arrows.forEach((a) => { bump(a.from); bump(vadd(a.from, a.vec)); });
  sc.lines.forEach((l) => l.points.forEach(bump));
  sc.polys.forEach((p) => p.points.forEach(bump));
  sc.arcs.forEach((a) => a.points.forEach(bump));
  sc.extent = ext;
  return sc;
}
