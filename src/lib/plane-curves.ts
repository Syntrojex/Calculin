/**
 * Everything a 2D graph needs beyond plain y = f(x):
 *
 *   classifyPlaneInput()  reads what the person typed and decides what it is —
 *       y = f(x) · F(x,y) = G(x,y) (circles, ellipses, hearts…) · x = c ·
 *       parametric (x(t), y(t)) · polar r = f(θ) · inequalities y > x²
 *   buildImplicit()       marching squares at screen resolution, poles rejected
 *   buildParametric()     adaptive sampling in t, broken at gaps
 *   buildPolar()          polar → parametric, with an automatic θ-range
 *   fillPredicate()       inequality shading
 *
 * Builders take the current view, so panning/zooming re-traces the curve at
 * the new resolution and it stays sharp at any zoom.
 */
import { parse, type MathNode } from "mathjs";
import { cleanExpression } from "./expression-clean";
import { realParse } from "./real-parse";
import { checkExpression } from "./input-check";

export interface Pt { x: number; y: number }
export interface CurveView { x0: number; x1: number; y0: number; y1: number; plotW: number; plotH: number }
export type Quality = "fast" | "fine";

export type PlaneKind = "explicit" | "implicit" | "parametric" | "polar" | "inequality";
export interface PlaneSpec {
  kind: PlaneKind;
  /** Short readable label for the legend, e.g. "x² + y² = 25". */
  label: string;
  /** explicit: the y = f(x) expression (in x) */
  expr?: string;
  /** implicit / inequality: F(x, y) such that the curve is F = 0 */
  implicit?: string;
  /** inequality operator */
  op?: "<" | "<=" | ">" | ">=";
  /** parametric */
  fx?: string; fy?: string; param?: string;
  /** polar */
  fr?: string;
  error?: string;
}

const CONSTS = new Set(["pi", "e", "tau", "Infinity", "NaN", "i"]);

function symbolsOf(node: MathNode): string[] {
  const out = new Set<string>();
  node.traverse((n: MathNode, path: string) => {
    if (n.type !== "SymbolNode" || path === "fn") return;
    const nm = (n as unknown as { name: string }).name;
    if (!CONSTS.has(nm)) out.add(nm);
  });
  return [...out];
}

function safeParse(src: string): MathNode | null {
  try { return parse(cleanExpression(src)); } catch { return null; }
}

function splitTop(s: string, seps: string[]): string[] {
  const parts: string[] = [];
  let depth = 0, cur = "";
  for (const ch of s) {
    if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) depth--;
    if (depth === 0 && seps.includes(ch)) { parts.push(cur); cur = ""; } else cur += ch;
  }
  parts.push(cur);
  return parts.map((p) => p.trim());
}

function stripOuterParens(s: string): string {
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

const tidy = (raw: string) =>
  raw.replace(/[−–—]/g, "-").replace(/≤/g, "<=").replace(/≥/g, ">=").replace(/\s+/g, " ").trim();

/** Decide what kind of 2D object a typed string is. */
export function classifyPlaneInput(raw: string): PlaneSpec {
  const s = tidy(raw);
  if (!s) return { kind: "explicit", label: "", error: "empty" };
  const bad = (msg: string): PlaneSpec => ({ kind: "explicit", label: s, error: msg });
  // look at every comma / "=" / "<" separated piece on its own, so the message can say which part is broken
  const pieces = s.split(/(?:<=|>=|[<>=]|,|;)/).map((t) => t.trim());
  if (pieces.every((t) => t === "")) return bad("Type a function, equation or curve — for example y = x^2, x^2 + y^2 = 25 or r = 1 + cos(theta).");
  const whole = checkExpression(s, { allowComma: true, allowRelation: true });
  if (whole && !/ends with “[=,;<>]”/.test(whole)) return bad(whole);
  if (/[=<>]\s*$/.test(s)) return bad("The right side of the sign is empty — write something after it (for example y = x^2).");
  if (/^\s*[=<>]/.test(s)) return bad("The left side of the sign is empty — write something before it (for example y = x^2).");
  if (/[,;]\s*$|^\s*[,;]/.test(s)) return bad("A comma has nothing before or after it. A parametric curve needs two parts: (cos(t), sin(t)).");

  // ── inequality ──
  const ineq = s.match(/^(.*?)(<=|>=|<|>)(.*)$/);
  if (ineq && !/[<>]/.test(ineq[3].replace(/^=/, ""))) {
    const [, l, op, r] = ineq;
    const L = safeParse(l), R = safeParse(r);
    if (!L || !R) return bad("Couldn't read this inequality — check brackets and operators.");
    const syms = [...new Set([...symbolsOf(L), ...symbolsOf(R)])];
    const extra = syms.filter((v) => v !== "x" && v !== "y");
    if (extra.length) return bad(`Inequalities can only use x and y — found "${extra.join(", ")}".`);
    return { kind: "inequality", label: s.replace("<=", "≤").replace(">=", "≥"), implicit: `(${cleanExpression(l)}) - (${cleanExpression(r)})`, op: op as PlaneSpec["op"] };
  }

  // ── parametric: two top-level parts separated by , or ; ──
  const inner = stripOuterParens(s);
  const commaParts = splitTop(inner, [",", ";"]);
  if (commaParts.length === 3) return bad("Three parts means a 3D curve — use the 3D tab → Parametric.");
  if (commaParts.length === 2 && commaParts.every(Boolean)) {
    const strip = (p: string, name: string) => p.replace(new RegExp(`^${name}\\s*(\\(\\s*[a-z]+\\s*\\))?\\s*=\\s*`, "i"), "");
    const a = strip(commaParts[0], "x"), b = strip(commaParts[1], "y");
    const A = safeParse(a), B = safeParse(b);
    if (!A || !B) return bad("Couldn't read this parametric curve — write it like (cos(t), sin(t)) or x = cos(t), y = sin(t).");
    const syms = [...new Set([...symbolsOf(A), ...symbolsOf(B)])];
    if (syms.includes("x") || syms.includes("y")) return bad("In a parametric curve x and y are the outputs — use a parameter such as t inside: (cos(t), sin(t)).");
    if (syms.length > 1) return bad(`A parametric curve needs ONE parameter (like t) — found ${syms.join(", ")}.`);
    const param = syms[0] ?? "t";
    return { kind: "parametric", label: `(${a}, ${b})`, fx: cleanExpression(a), fy: cleanExpression(b), param };
  }

  // ── equations ──
  const eqParts = s.split("=");
  if (eqParts.length > 2) return bad("Only one \"=\" sign is allowed.");
  if (eqParts.length === 2) {
    const l = eqParts[0].trim(), r = eqParts[1].trim();
    if (!l || !r) return bad("Both sides of the equation need something on them.");
    const L = safeParse(l), R = safeParse(r);
    if (!L || !R) return bad("Couldn't read this equation — check brackets and operators.");
    const lName = l.replace(/\s+/g, "");
    const lIs = (n: string) => new RegExp(`^${n}(\\([a-z]+\\))?$`, "i").test(lName);
    const rName = r.replace(/\s+/g, "");
    const rIs = (n: string) => new RegExp(`^${n}(\\([a-z]+\\))?$`, "i").test(rName);
    const lSyms = symbolsOf(L).filter((v) => !(/^[a-qs-z]\(x\)$/i.test(lName) && v === lName[0])), rSyms = symbolsOf(R);
    const yLike = (n: string) => /^y(\([a-z]+\))?$/i.test(n) || /^[a-qs-z]\(x\)$/i.test(n);
    // polar r = f(θ)
    if (lIs("r") && !rSyms.includes("x") && !rSyms.includes("y") && !rSyms.includes("r") && rSyms.length <= 1) {
      return { kind: "polar", label: `r = ${r}`, fr: cleanExpression(r), param: rSyms[0] ?? "theta" };
    }
    if (rIs("r") && !lSyms.includes("x") && !lSyms.includes("y") && !lSyms.includes("r") && lSyms.length <= 1) {
      return { kind: "polar", label: `r = ${l}`, fr: cleanExpression(l), param: lSyms[0] ?? "theta" };
    }
    const all = [...new Set([...lSyms, ...rSyms])];
    // y = f(x)
    if (yLike(lName) && !rSyms.includes("y") && rSyms.every((v) => v === "x") ) return { kind: "explicit", label: `y = ${r}`, expr: cleanExpression(r) };
    if (yLike(rName) && !lSyms.includes("y") && lSyms.every((v) => v === "x")) return { kind: "explicit", label: `y = ${l}`, expr: cleanExpression(l) };
    // y = f(t) typed with another variable → treat as the x variable
    if (yLike(lName) && rSyms.length === 1 && !["x", "y", "r"].includes(rSyms[0])) return { kind: "explicit", label: `y = ${r}`, expr: cleanExpression(r).replace(new RegExp(`\\b${rSyms[0]}\\b`, "g"), "x") };
    const extra = all.filter((v) => v !== "x" && v !== "y");
    if (extra.length) return bad(`A 2D graph can only use x and y — found "${extra.join(", ")}". (For z, use the 3D tab.)`);
    if (all.length === 0) return bad("There is no x or y in this equation.");
    return { kind: "implicit", label: `${l} = ${r}`, implicit: `(${cleanExpression(l)}) - (${cleanExpression(r)})` };
  }

  // ── bare expression ──
  const E = safeParse(s);
  if (!E) return bad("Couldn't read this — check brackets and operators.");
  const syms = symbolsOf(E);
  if (syms.includes("y")) {
    const extra = syms.filter((v) => v !== "x" && v !== "y");
    if (extra.length) return bad(`A 2D graph can only use x and y — found "${extra.join(", ")}".`);
    return { kind: "implicit", label: `${s} = 0`, implicit: cleanExpression(s) };
  }
  if (syms.length === 1 && syms[0] !== "x") {
    return { kind: "explicit", label: `y = ${s}`, expr: cleanExpression(s).replace(new RegExp(`\\b${syms[0]}\\b`, "g"), "x") };
  }
  if (syms.length > 1) return bad(`A graph of y = f(x) can only use x — found "${syms.join(", ")}".`);
  return { kind: "explicit", label: `y = ${s}`, expr: cleanExpression(s) };
}

// ───────────────────────────── compiling ─────────────────────────────

export function compile2(expr: string, vars: [string, string]): ((x: number, y: number) => number) | null {
  try {
    const code = realParse(expr).compile();
    const scope: Record<string, number> = {};
    return (x: number, y: number) => {
      scope[vars[0]] = x; scope[vars[1]] = y;
      try { const r = code.evaluate(scope); return typeof r === "number" ? r : NaN; } catch { return NaN; }
    };
  } catch { return null; }
}

export function compile1(expr: string, v: string): ((t: number) => number) | null {
  try {
    const code = realParse(expr).compile();
    const scope: Record<string, number> = {};
    return (t: number) => {
      scope[v] = t;
      try { const r = code.evaluate(scope); return typeof r === "number" ? r : NaN; } catch { return NaN; }
    };
  } catch { return null; }
}

// ───────────────────────────── implicit: marching squares ─────────────────────────────

/**
 * Trace F(x, y) = 0 inside the view. Cell size adapts to how fast F evaluates
 * (≈ 40 ms budget while dragging, a fine grid once the view settles). Crossings
 * where F blows up (poles) are rejected by re-evaluating F at the crossing.
 */
export function buildImplicit(F: (x: number, y: number) => number, view: CurveView, quality: Quality = "fine"): Pt[][] {
  const { x0, x1, y0, y1 } = view;
  const maxCells = quality === "fine" ? 420 : 110;
  const cols = Math.max(24, Math.min(maxCells, Math.round(view.plotW / (quality === "fine" ? 2 : 6))));
  const rows = Math.max(24, Math.min(Math.round(maxCells * 0.75), Math.round(view.plotH / (quality === "fine" ? 2 : 6))));
  const dx = (x1 - x0) / cols, dy = (y1 - y0) / rows;
  const W = cols + 1;
  const val = new Float64Array(W * (rows + 1));
  for (let r = 0; r <= rows; r++) {
    const y = y0 + r * dy;
    for (let c = 0; c <= cols; c++) {
      const v = F(x0 + c * dx, y);
      val[r * W + c] = Number.isFinite(v) ? v : NaN;
    }
  }
  // crossing on an edge, cached by edge id (shared by neighbouring cells)
  const cache = new Map<number, Pt | null>();
  const crossing = (id: number, ra: number, ca: number, rb: number, cb: number): Pt | null => {
    if (cache.has(id)) return cache.get(id)!;
    const a = val[ra * W + ca], b = val[rb * W + cb];
    let out: Pt | null = null;
    if (Number.isFinite(a) && Number.isFinite(b) && (a < 0) !== (b < 0)) {
      {
        const pa = { x: x0 + ca * dx, y: y0 + ra * dy }, pb = { x: x0 + cb * dx, y: y0 + rb * dy };
        // a few bisection steps along the edge for an accurate crossing
        let lo = 0, hi = 1, flo = a;
        for (let k = 0; k < 10; k++) {
          const m = 0.5 * (lo + hi);
          const fm = F(pa.x + (pb.x - pa.x) * m, pa.y + (pb.y - pa.y) * m);
          if (!Number.isFinite(fm)) break;
          if ((fm < 0) === (flo < 0)) { lo = m; flo = fm; } else hi = m;
        }
        const t = 0.5 * (lo + hi);
        const p = { x: pa.x + (pb.x - pa.x) * t, y: pa.y + (pb.y - pa.y) * t };
        const fp = F(p.x, p.y);
        // a pole flips sign without ever being near zero
        if (Number.isFinite(fp) && Math.abs(fp) <= 0.35 * Math.max(Math.abs(a), Math.abs(b))) out = p;
      }
    }
    cache.set(id, out);
    return out;
  };
  const hId = (r: number, c: number) => r * cols + c;                    // horizontal edge (r,c)-(r,c+1)
  const vId = (r: number, c: number) => (rows + 1) * cols + r * W + c;   // vertical edge (r,c)-(r+1,c)

  type Edge = { id: number; p: Pt };
  const links = new Map<number, number[]>();
  const pts = new Map<number, Pt>();
  const link = (a: Edge, b: Edge) => {
    pts.set(a.id, a.p); pts.set(b.id, b.p);
    (links.get(a.id) ?? links.set(a.id, []).get(a.id)!).push(b.id);
    (links.get(b.id) ?? links.set(b.id, []).get(b.id)!).push(a.id);
  };

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v00 = val[r * W + c], v10 = val[r * W + c + 1], v01 = val[(r + 1) * W + c], v11 = val[(r + 1) * W + c + 1];
      if (!(Number.isFinite(v00) && Number.isFinite(v10) && Number.isFinite(v01) && Number.isFinite(v11))) continue;
      const s0 = v00 < 0, s1 = v10 < 0, s2 = v11 < 0, s3 = v01 < 0;
      if (s0 === s1 && s1 === s2 && s2 === s3) continue;
      const found: Edge[] = [];
      const eB = crossing(hId(r, c), r, c, r, c + 1);           // bottom (y low)
      const eR = crossing(vId(r, c + 1), r, c + 1, r + 1, c + 1);
      const eT = crossing(hId(r + 1, c), r + 1, c, r + 1, c + 1);
      const eL = crossing(vId(r, c), r, c, r + 1, c);
      const cand: [Pt | null, number][] = [[eB, hId(r, c)], [eR, vId(r, c + 1)], [eT, hId(r + 1, c)], [eL, vId(r, c)]];
      cand.forEach(([p, id]) => { if (p) found.push({ id, p }); });
      if (found.length === 2) link(found[0], found[1]);
      else if (found.length === 4) {
        // saddle: pair by the sign of the cell centre
        const centre = F(x0 + (c + 0.5) * dx, y0 + (r + 0.5) * dy);
        const bl = s0;
        const centreSameAsCorner = Number.isFinite(centre) && (centre < 0) === bl;
        if (centreSameAsCorner) { link(found[0], found[3]); link(found[1], found[2]); } else { link(found[0], found[1]); link(found[2], found[3]); }
      }
    }
  }

  // chain linked crossings into polylines
  const visited = new Set<number>();
  const out: Pt[][] = [];
  const walk = (start: number) => {
    const line: Pt[] = [pts.get(start)!];
    visited.add(start);
    let prev = -1, cur = start;
    for (;;) {
      const nb = (links.get(cur) ?? []).filter((n) => n !== prev && !visited.has(n));
      if (nb.length === 0) {
        // close a loop if the start is adjacent to the last point
        const first = links.get(start) ?? [];
        if (line.length > 2 && first.includes(cur)) line.push(pts.get(start)!);
        break;
      }
      prev = cur; cur = nb[0]; visited.add(cur); line.push(pts.get(cur)!);
    }
    return line;
  };
  for (const [id, nb] of links) if (!visited.has(id) && nb.length === 1) out.push(walk(id));
  for (const [id] of links) if (!visited.has(id)) out.push(walk(id));
  return out.filter((l) => l.length >= 2);
}

// ───────────────────────────── parametric / polar ─────────────────────────────

/** Adaptive polyline of (X(t), Y(t)) for t in [t0, t1]; broken wherever X or Y is undefined or jumps. */
export function buildParametric(X: (t: number) => number, Y: (t: number) => number, t0: number, t1: number, view?: CurveView): Pt[][] {
  const N = 1600;
  const ts: number[] = [], P: (Pt | null)[] = [];
  for (let i = 0; i <= N; i++) {
    const t = t0 + ((t1 - t0) * i) / N;
    const x = X(t), y = Y(t);
    ts.push(t);
    P.push(Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) < 1e9 && Math.abs(y) < 1e9 ? { x, y } : null);
  }
  const xs = P.filter(Boolean).map((p) => p!.x).sort((a, b) => a - b);
  const ys = P.filter(Boolean).map((p) => p!.y).sort((a, b) => a - b);
  if (xs.length < 2) return [];
  const q = (arr: number[], f: number) => arr[Math.min(arr.length - 1, Math.max(0, Math.round(f * (arr.length - 1))))];
  const spanX = Math.max(q(xs, 0.98) - q(xs, 0.02), 1e-9), spanY = Math.max(q(ys, 0.98) - q(ys, 0.02), 1e-9);
  const span = view ? Math.max(view.x1 - view.x0, view.y1 - view.y0) : Math.max(spanX, spanY);
  const tol = span * 0.012;          // finest chord we bother to resolve
  const jump = Math.max(spanX, spanY) * 0.6; // beyond this between adjacent points → a gap, not a curve
  const segs: Pt[][] = [];
  let cur: Pt[] = [];
  const flush = () => { if (cur.length) segs.push(cur); cur = []; };
  let evals = 0;
  const refine = (ta: number, pa: Pt, tb: number, pb: Pt, depth: number) => {
    const d = Math.hypot(pb.x - pa.x, pb.y - pa.y);
    if (d <= tol || depth >= 12 || evals > 60000) { cur.push(pb); return; }
    const tm = 0.5 * (ta + tb);
    const xm = X(tm), ym = Y(tm);
    evals++;
    if (!Number.isFinite(xm) || !Number.isFinite(ym)) { if (d > jump) { flush(); cur.push(pb); } else cur.push(pb); return; }
    const pm = { x: xm, y: ym };
    // midpoint close to the chord → smooth enough
    const chord = Math.abs((pb.x - pa.x) * (pa.y - pm.y) - (pa.x - pm.x) * (pb.y - pa.y)) / (d || 1);
    if (chord <= tol * 0.25) { cur.push(pb); return; }
    refine(ta, pa, tm, pm, depth + 1);
    refine(tm, pm, tb, pb, depth + 1);
  };
  for (let i = 0; i <= N; i++) {
    const p = P[i];
    if (!p) { flush(); continue; }
    if (cur.length === 0) { cur.push(p); continue; }
    const prev = cur[cur.length - 1];
    const d = Math.hypot(p.x - prev.x, p.y - prev.y);
    if (d > jump) { // asymptote-like jump: confirm with the midpoint before breaking
      const tm = 0.5 * (ts[i - 1] + ts[i]);
      const xm = X(tm), ym = Y(tm);
      if (!(Number.isFinite(xm) && Number.isFinite(ym) && Math.hypot(xm - prev.x, ym - prev.y) < d * 0.75)) { flush(); cur.push(p); continue; }
    }
    refine(ts[i - 1], prev, ts[i], p, 0);
  }
  flush();
  return segs.filter((s) => s.length >= 1);
}

/** Smallest θ-period (a multiple of π) after which r(θ) retraces the same points, else 4π. */
export function autoPolarRange(R: (t: number) => number): [number, number] {
  const pt = (t: number): Pt | null => { const r = R(t); return Number.isFinite(r) ? { x: r * Math.cos(t), y: r * Math.sin(t) } : null; };
  const probes = [0.37, 1.11, 2.03, 2.9, 4.2, 5.5];
  for (const k of [2, 4, 6, 8, 10, 12, 16, 20, 24]) {
    const P = k * Math.PI;
    let ok = true, any = false;
    for (const t of probes) {
      const a = pt(t), b = pt(t + P);
      if (!a || !b) { continue; }
      any = true;
      if (Math.hypot(a.x - b.x, a.y - b.y) > 1e-6 * (1 + Math.hypot(a.x, a.y))) { ok = false; break; }
    }
    if (ok && any) return [0, P];
  }
  return [0, 4 * Math.PI];
}

export function buildPolar(R: (t: number) => number, t0: number, t1: number, view?: CurveView): Pt[][] {
  return buildParametric((t) => { const r = R(t); return r * Math.cos(t); }, (t) => { const r = R(t); return r * Math.sin(t); }, t0, t1, view);
}

/** Bounding box (2nd–98th percentile, padded) of a set of polylines — used to frame curve-only graphs. */
export function boundsOf(segs: Pt[][]): [number, number, number, number] | null {
  const xs: number[] = [], ys: number[] = [];
  segs.forEach((s) => s.forEach((p) => { xs.push(p.x); ys.push(p.y); }));
  if (xs.length < 2) return null;
  xs.sort((a, b) => a - b); ys.sort((a, b) => a - b);
  const q = (arr: number[], f: number) => arr[Math.min(arr.length - 1, Math.max(0, Math.round(f * (arr.length - 1))))];
  let x0 = q(xs, 0.0), x1 = q(xs, 1), y0 = q(ys, 0.0), y1 = q(ys, 1);
  // huge outliers (asymptote-like branches) shouldn't blow the frame up
  const sx = q(xs, 0.98) - q(xs, 0.02), sy = q(ys, 0.98) - q(ys, 0.02);
  if (x1 - x0 > 8 * Math.max(sx, 1e-9)) { x0 = q(xs, 0.02); x1 = q(xs, 0.98); }
  if (y1 - y0 > 8 * Math.max(sy, 1e-9)) { y0 = q(ys, 0.02); y1 = q(ys, 0.98); }
  return [x0, x1, y0, y1];
}

/** Does the point satisfy the inequality F(x,y) op 0? */
export function inequalityHolds(F: (x: number, y: number) => number, op: NonNullable<PlaneSpec["op"]>): (x: number, y: number) => boolean {
  return (x, y) => {
    const v = F(x, y);
    if (!Number.isFinite(v)) return false;
    return op === "<" ? v < 0 : op === "<=" ? v <= 0 : op === ">" ? v > 0 : v >= 0;
  };
}
