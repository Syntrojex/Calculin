/**
 * 3D shapes beyond z = f(x, y) and F(x, y, z) = 0:
 *
 *   (x(t), y(t), z(t))               parametric curve   — helix, trefoil knot…
 *   (x(u,v), y(u,v), z(u,v))         parametric surface — torus, Möbius strip, cone…
 *   z = f(r, θ)                      cylindrical        — z = r², z = sin(r)
 *   r = f(θ, z)                      cylindrical radius — vase / bottle shapes
 *   ρ = f(θ, φ)                      spherical          — spheres, bumpy balls
 *
 * Every form is reduced to (X, Y, Z) functions of one or two parameters.
 */
import { parse, type MathNode } from "mathjs";
import { cleanExpression } from "./expression-clean";
import { realParse } from "./real-parse";
import { checkExpression } from "./input-check";

export type Fn1 = (t: number) => number;
export type Fn2 = (u: number, v: number) => number;

export interface ParamRange { name: string; lo: number; hi: number; angle: boolean }

export interface Param3DSpec {
  kind: "curve" | "surface";
  label: string;
  params: string[];
  /** default range per parameter (the UI lets the person override) */
  defaults: ParamRange[];
  /** build X,Y,Z functions for the given ranges */
  fx: string; fy: string; fz: string;
  note?: string;
  error?: string;
}

const CONSTS = new Set(["pi", "e", "tau", "Infinity", "NaN", "i"]);
const TAU = 2 * Math.PI;

function symbolsOf(node: MathNode): string[] {
  const out = new Set<string>();
  node.traverse((n: MathNode, path: string) => {
    if (n.type !== "SymbolNode" || path === "fn") return;
    const nm = (n as unknown as { name: string }).name;
    if (!CONSTS.has(nm)) out.add(nm);
  });
  return [...out];
}

function splitTop(s: string): string[] {
  const parts: string[] = [];
  let depth = 0, cur = "";
  for (const ch of s) {
    if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) depth--;
    if (depth === 0 && (ch === "," || ch === ";")) { parts.push(cur); cur = ""; } else cur += ch;
  }
  parts.push(cur);
  return parts.map((p) => p.trim());
}

function stripParens(s: string): string {
  let t = s.trim();
  while (t.startsWith("(") && t.endsWith(")")) {
    let depth = 0, wraps = true;
    for (let i = 0; i < t.length; i++) {
      if (t[i] === "(") depth++;
      else if (t[i] === ")") { depth--; if (depth === 0 && i < t.length - 1) { wraps = false; break; } }
    }
    if (!wraps) break;
    t = t.slice(1, -1).trim();
  }
  return t;
}

/** is `name` used inside the argument of a trig function (so it behaves like an angle)? */
function usedAsAngle(exprs: string[], name: string): boolean {
  const re = new RegExp(`(sin|cos|tan|sec|csc|cot)\\s*\\([^()]*(?<![A-Za-z_])${name}(?![A-Za-z_])`, "i");
  return exprs.some((e) => re.test(e)) || ["theta", "phi", "alpha", "beta", "omega"].includes(name);
}

function rangeFor(name: string, exprs: string[], R: number): ParamRange {
  if (usedAsAngle(exprs, name)) return { name, lo: 0, hi: TAU, angle: true };
  return { name, lo: -R, hi: R, angle: false };
}

export function classify3D(raw: string, R = 5): Param3DSpec {
  const s = raw.replace(/[−–—]/g, "-").replace(/\s+/g, " ").trim();
  const fail = (error: string): Param3DSpec => ({ kind: "curve", label: s, params: [], defaults: [], fx: "", fy: "", fz: "", error });
  if (!s) return fail("Type a shape first, for example (cos(t), sin(t), t).");
  const whole = checkExpression(s, { allowComma: true, allowRelation: false });
  if (whole) return fail(whole);
  if (/,\s*$|^\s*,|,\s*,/.test(s)) return fail("A comma has nothing before or after it — a 3D curve needs three parts: (x(t), y(t), z(t)).");

  // ── (X, Y, Z) ──
  const parts = splitTop(stripParens(s));
  if (parts.length === 3 && parts.every(Boolean)) {
    const strip = (p: string, n: string) => p.replace(new RegExp(`^${n}\\s*(\\(\\s*[a-z, ]+\\s*\\))?\\s*=\\s*`, "i"), "");
    const [a, b, c] = [strip(parts[0], "x"), strip(parts[1], "y"), strip(parts[2], "z")];
    let nodes: MathNode[];
    try { nodes = [a, b, c].map((p) => parse(cleanExpression(p))); } catch { return fail("Couldn't read this — write it like (cos(t), sin(t), t) with commas between the three parts."); }
    const syms = [...new Set(nodes.flatMap(symbolsOf))];
    if (syms.some((v) => ["x", "y", "z"].includes(v))) return fail("In a parametric shape x, y, z are the OUTPUTS — build them from parameters such as t, or u and v: (u*cos(v), u*sin(v), u).");
    if (syms.length === 0) return fail("Use at least one parameter (like t) inside the three parts.");
    if (syms.length > 2) return fail(`A parametric shape has one parameter (curve) or two (surface) — found ${syms.length}: ${syms.join(", ")}.`);
    const ex = [a, b, c].map((e) => cleanExpression(e));
    const ordered = syms.length === 2 ? [...syms].sort((p, q) => p.localeCompare(q)) : syms;
    return {
      kind: syms.length === 1 ? "curve" : "surface",
      label: `(${a}, ${b}, ${c})`,
      params: ordered,
      defaults: ordered.map((n) => rangeFor(n, ex, R)),
      fx: ex[0], fy: ex[1], fz: ex[2],
    };
  }
  if (parts.length > 1) return fail("A 3D parametric shape needs exactly three parts: (x(t), y(t), z(t)).");

  // ── equations ──
  const eq = s.split("=");
  if (eq.length === 2) {
    const l = eq[0].trim(), r = eq[1].trim();
    const lName = l.replace(/\s+/g, "").toLowerCase();
    let rhs: MathNode;
    try { rhs = parse(cleanExpression(r)); } catch { return fail("Couldn't read the right-hand side of this equation."); }
    const syms = symbolsOf(rhs);
    const rhsExpr = cleanExpression(r);
    const only = (...allowed: string[]) => syms.every((v) => allowed.includes(v));
    // z = f(r, θ)
    if (/^z(\(.*\))?$/.test(lName) && syms.some((v) => ["r", "theta", "t"].includes(v)) && !syms.some((v) => v === "x" || v === "y") && only("r", "theta", "t")) {
      const ang = syms.includes("theta") ? "theta" : syms.includes("t") ? "t" : "theta";
      return {
        kind: "surface", label: `z = ${r}`, params: ["r", ang],
        defaults: [{ name: "r", lo: 0, hi: R, angle: false }, { name: ang, lo: 0, hi: TAU, angle: true }],
        fx: `r*cos(${ang})`, fy: `r*sin(${ang})`, fz: rhsExpr, note: "cylindrical coordinates: x = r cos θ, y = r sin θ",
      };
    }
    // ρ = f(θ, φ)
    if (/^(rho|ρ|p)(\(.*\))?$/.test(lName) && only("theta", "phi")) {
      const body = `(${rhsExpr})`;
      return {
        kind: "surface", label: `ρ = ${r}`, params: ["phi", "theta"],
        defaults: [{ name: "phi", lo: 0, hi: Math.PI, angle: true }, { name: "theta", lo: 0, hi: TAU, angle: true }],
        fx: `${body}*sin(phi)*cos(theta)`, fy: `${body}*sin(phi)*sin(theta)`, fz: `${body}*cos(phi)`,
        note: "spherical coordinates: ρ is the distance from the origin, φ the angle from the z-axis, θ around it",
      };
    }
    // r = f(θ, z)
    if (/^r(\(.*\))?$/.test(lName) && only("theta", "z")) {
      const body = `(${rhsExpr})`;
      return {
        kind: "surface", label: `r = ${r}`, params: ["theta", "z"],
        defaults: [{ name: "theta", lo: 0, hi: TAU, angle: true }, { name: "z", lo: -R, hi: R, angle: false }],
        fx: `${body}*cos(theta)`, fy: `${body}*sin(theta)`, fz: "z", note: "cylindrical radius r = f(θ, z)",
      };
    }
    return fail("For equations in x, y, z use the Implicit tab. Here you can type z = f(r, theta), rho = f(theta, phi), r = f(theta, z), or three parts (x(t), y(t), z(t)).");
  }
  return fail("Write it as (x(t), y(t), z(t)) for a curve, (x(u,v), y(u,v), z(u,v)) for a surface, or z = f(r, theta) / rho = f(theta, phi).");
}

// ───────────────────────────── building ─────────────────────────────

function compileN(expr: string, names: string[]): ((...a: number[]) => number) | null {
  try {
    const code = realParse(expr).compile();
    const scope: Record<string, number> = {};
    return (...a: number[]) => {
      names.forEach((n, i) => { scope[n] = a[i]; });
      try { const v = code.evaluate(scope); return typeof v === "number" ? v : NaN; } catch { return NaN; }
    };
  } catch { return null; }
}

export interface CurveData { kind: "curve"; segments: [number, number, number][][] }
export interface SurfaceData { kind: "surface"; nu: number; nv: number; pts: ([number, number, number] | null)[] }
export type ShapeData = CurveData | SurfaceData;

export function buildShape(spec: Param3DSpec, ranges: [number, number][], quality = 1): { data?: ShapeData; error?: string } {
  const names = spec.params;
  const X = compileN(spec.fx, names), Y = compileN(spec.fy, names), Z = compileN(spec.fz, names);
  if (!X || !Y || !Z) return { error: "Couldn't read one of the three parts." };
  const ok = (v: number) => Number.isFinite(v) && Math.abs(v) < 1e7;
  if (spec.kind === "curve") {
    const [t0, t1] = ranges[0];
    const N = Math.round(1200 * quality);
    const raw: ([number, number, number] | null)[] = [];
    for (let i = 0; i <= N; i++) {
      const t = t0 + ((t1 - t0) * i) / N;
      const x = X(t), y = Y(t), z = Z(t);
      raw.push(ok(x) && ok(y) && ok(z) ? [x, y, z] : null);
    }
    // robust size of the curve, so a pole (tan) breaks the line instead of drawing a giant jump
    const coords: number[] = [];
    raw.forEach((p) => p && coords.push(Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2])));
    coords.sort((a, b) => a - b);
    const span = Math.max(coords[Math.min(coords.length - 1, Math.floor(coords.length * 0.97))] ?? 1, 1e-9);
    const segments: [number, number, number][][] = [];
    let cur: [number, number, number][] = [];
    for (const p of raw) {
      if (!p) { if (cur.length > 1) segments.push(cur); cur = []; continue; }
      const prev = cur[cur.length - 1];
      if (prev && Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]) > span * 0.9) { if (cur.length > 1) segments.push(cur); cur = []; }
      cur.push(p);
    }
    if (cur.length > 1) segments.push(cur);
    if (!segments.length) return { error: "This curve has no real points for that parameter range." };
    return { data: { kind: "curve", segments } };
  }
  const [u0, u1] = ranges[0], [v0, v1] = ranges[1];
  const nu = Math.round(90 * quality), nv = Math.round(90 * quality);
  const pts: ([number, number, number] | null)[] = [];
  let valid = 0;
  for (let i = 0; i <= nu; i++) {
    const u = u0 + ((u1 - u0) * i) / nu;
    for (let j = 0; j <= nv; j++) {
      const v = v0 + ((v1 - v0) * j) / nv;
      const x = X(u, v), y = Y(u, v), z = Z(u, v);
      if (ok(x) && ok(y) && ok(z)) { pts.push([x, y, z]); valid++; } else pts.push(null);
    }
  }
  if (valid < 4) return { error: "This surface has no real points for those parameter ranges." };
  return { data: { kind: "surface", nu, nv, pts } };
}

/** Uniform scale + the extent used for axes: shapes keep their true proportions. */
export function fitScale(data: ShapeData, range: number): { scale: number; extent: number } {
  const vals: number[] = [];
  if (data.kind === "curve") data.segments.forEach((s) => s.forEach((p) => vals.push(Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2]))));
  else data.pts.forEach((p) => p && vals.push(Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2])));
  vals.sort((a, b) => a - b);
  // ignore a few wild outliers (poles) when sizing the picture
  const q = vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.995))] ?? 1;
  const extent = Math.max(q, 1e-9);
  return { scale: (range * 0.9) / extent, extent };
}


export function colormap(t: number): [number, number, number] {
  const stops: [number, [number, number, number]][] = [
    [0.0, [0.16, 0.07, 0.55]], [0.2, [0.1, 0.45, 0.85]], [0.4, [0.05, 0.75, 0.7]],
    [0.6, [0.35, 0.85, 0.25]], [0.78, [0.97, 0.78, 0.1]], [0.9, [0.95, 0.45, 0.08]], [1.0, [0.85, 0.1, 0.2]],
  ];
  const x = Math.max(0, Math.min(1, t));
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i], [t1, c1] = stops[i + 1];
    if (x >= t0 && x <= t1) { const f = (x - t0) / (t1 - t0 || 1); return [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f]; }
  }
  return stops[stops.length - 1][1];
}

/** Triangle mesh for a parametric surface in scene coordinates (math z → scene up). Pole/seam triangles that stretch across the scene are dropped. */
export function meshFromSurface(data: SurfaceData, scale: number, range: number): { positions: number[]; colors: number[]; indices: number[] } {
  const { nu, nv, pts } = data;
  const W = nv + 1;
  const positions: number[] = [], colors: number[] = [];
  const valid: boolean[] = [];
  const zs = pts.filter(Boolean).map((p) => p![2]).sort((a, b) => a - b);
  const zLo = zs[Math.floor(zs.length * 0.01)] ?? 0, zHi = zs[Math.floor(zs.length * 0.99)] ?? 1;
  pts.forEach((p) => {
    if (!p) { positions.push(0, 0, 0); colors.push(0, 0, 0); valid.push(false); return; }
    positions.push(p[0] * scale, p[2] * scale, p[1] * scale);
    const [r, g, b] = colormap(zHi > zLo ? (p[2] - zLo) / (zHi - zLo) : 0.5);
    colors.push(r, g, b);
    valid.push(true);
  });
  const indices: number[] = [];
  const maxEdge = range * 1.2;
  const far = (a: number, b: number) => Math.hypot(positions[a * 3] - positions[b * 3], positions[a * 3 + 1] - positions[b * 3 + 1], positions[a * 3 + 2] - positions[b * 3 + 2]) > maxEdge;
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = i * W + j, b = a + 1, c = a + W, d = c + 1;
      if (valid[a] && valid[c] && valid[b] && !far(a, c) && !far(a, b) && !far(b, c)) indices.push(a, c, b);
      if (valid[b] && valid[c] && valid[d] && !far(b, c) && !far(b, d) && !far(c, d)) indices.push(b, c, d);
    }
  }
  return { positions, colors, indices };
}
