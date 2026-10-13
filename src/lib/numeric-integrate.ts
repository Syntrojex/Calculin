/**
 * Robust numerical integration for the calculus calculators.
 *
 * Adaptive Gauss–Kronrod (G7/K15) with:
 *  - infinite limits (via x = a + t/(1-t) style substitutions),
 *  - endpoint singularities such as 1/sqrt(x) or ln(x) (GK never evaluates the endpoints),
 *  - removable-point NaNs (nudged),
 *  - detection of divergent / non-convergent integrals, so the UI can say so
 *    honestly instead of printing a meaningless huge number.
 * Also: recognizeConstant() turns a decimal such as 1.5707963267949 back into
 * "π/2" (and similar) when it is a simple closed form.
 */

export type IntegralStatus = "ok" | "diverges" | "undefined" | "noconverge";

export interface NumIntResult {
  value: number;
  error: number;
  status: IntegralStatus;
}

const XGK = [
  0.991455371120812639206854697526329, 0.949107912342758524526189684047851,
  0.864864423359769072789712788640926, 0.741531185599394439863864773280788,
  0.586087235467691130294144838258730, 0.405845151377397166906606412076961,
  0.207784955007898467600689403773245, 0.0,
];
const WGK = [
  0.022935322010529224963732008058970, 0.063092092629978553290700663189204,
  0.104790010322250183839876322541518, 0.140653259715525918745189590510238,
  0.169004726639267902826583426598550, 0.190350578064785409913256402421014,
  0.204432940075298892414161999234649, 0.209482141084727828012999174891714,
];
const WG = [
  0.129484966168869693270611432679082, 0.279705391489276667901467771423780,
  0.381830050505118944950369775488975, 0.417959183673469387755102040816327,
];

type Fn = (x: number) => number;

interface Seg { a: number; b: number; i: number; e: number }

function gk15(f: Fn, a: number, b: number): { i: number; e: number } {
  const c = 0.5 * (a + b);
  const h = 0.5 * (b - a);
  const fc = f(c);
  let resK = fc * WGK[7];
  let resG = fc * WG[3];
  for (let j = 0; j < 7; j++) {
    const dx = h * XGK[j];
    const f1 = f(c - dx);
    const f2 = f(c + dx);
    resK += WGK[j] * (f1 + f2);
    if (j % 2 === 1) resG += WG[(j - 1) / 2] * (f1 + f2);
  }
  const i = resK * h;
  const e = Math.abs((resK - resG) * h);
  return { i, e };
}

/** Wraps f so NaN/±Inf at a node is retried a hair to the side; counts bad evaluations. */
function guarded(f: Fn, stats: { bad: number; total: number; maxAbs?: number; argMax?: number }): Fn {
  return (x: number) => {
    stats.total++;
    let v = NaN;
    try { v = f(x); } catch { v = NaN; }
    if (Number.isFinite(v)) {
      if (Math.abs(v) > (stats.maxAbs ?? 0)) { stats.maxAbs = Math.abs(v); stats.argMax = x; }
      return v;
    }
    const dx = Math.max(Math.abs(x), 1) * 1e-9;
    for (const s of [dx, -dx, 10 * dx, -10 * dx]) {
      try { v = f(x + s); } catch { v = NaN; }
      if (Number.isFinite(v)) return v;
    }
    stats.bad++;
    return 0;
  };
}

interface AdaptiveOut { value: number; error: number; converged: boolean; segs: Seg[] }

function adaptive(f: Fn, a: number, b: number, relTol: number, absTol: number, maxSegs: number): AdaptiveOut {
  const first = gk15(f, a, b);
  const segs: Seg[] = [{ a, b, i: first.i, e: first.e }];
  let total = first.i;
  let err = first.e;
  let guard = 0;
  while (err > Math.max(absTol, relTol * Math.abs(total)) && segs.length < maxSegs && guard++ < maxSegs * 2) {
    let worst = 0;
    for (let k = 1; k < segs.length; k++) if (segs[k].e > segs[worst].e) worst = k;
    const s = segs[worst];
    const m = 0.5 * (s.a + s.b);
    if (m <= s.a || m >= s.b) break;
    const l = gk15(f, s.a, m);
    const r = gk15(f, m, s.b);
    total += l.i + r.i - s.i;
    err += l.e + r.e - s.e;
    segs.splice(worst, 1, { a: s.a, b: m, i: l.i, e: l.e }, { a: m, b: s.b, i: r.i, e: r.e });
  }
  total = segs.reduce((acc, s) => acc + s.i, 0);
  err = segs.reduce((acc, s) => acc + s.e, 0);
  return { value: total, error: err, converged: err <= Math.max(absTol, relTol * Math.abs(total)) * 50, segs };
}

/** Tanh-sinh (double-exponential) quadrature: excellent for endpoint singularities. */
function tanhSinh(f: Fn, a: number, b: number): { value: number; ok: boolean } {
  const c = 0.5 * (a + b);
  const hh = 0.5 * (b - a);
  const T = 3.4;
  let prev = NaN;
  let cur = NaN;
  for (let level = 1; level <= 8; level++) {
    const h = Math.pow(2, -level);
    let sum = 0;
    const n = Math.ceil(T / h);
    for (let j = -n; j <= n; j++) {
      const t = j * h;
      const u = (Math.PI / 2) * Math.sinh(t);
      const ch = Math.cosh(u);
      const w = (Math.PI / 2) * Math.cosh(t) / (ch * ch);
      if (w < 1e-300) continue;
      // Distance to the nearer endpoint computed without cancellation: 1 - tanh|u| = 2/(1+e^{2|u|}).
      const edge = hh * (2 / (1 + Math.exp(2 * Math.abs(u))));
      const x = u < 0 ? a + edge : b - edge;
      if (!(x > a && x < b)) continue;
      const v = f(x);
      if (Number.isFinite(v)) sum += w * v;
    }
    prev = cur;
    cur = sum * h * hh;
    if (level >= 3 && Math.abs(cur - prev) <= 1e-12 * Math.abs(cur) + 1e-14) return { value: cur, ok: true };
  }
  return { value: cur, ok: Math.abs(cur - prev) <= 1e-8 * Math.abs(cur) + 1e-10 };
}

type Behaviour = { kind: "settles" | "diverges" | "noconverge"; value: number };

/** Classifies one-sided sequences: do the integrals over [lo, hi-d_k] settle as d_k → 0? Returns the limit when they do. */
function classifySequence(vals: number[]): { kind: "settles" | "diverges" | "noconverge"; limit: number } {
  const last = vals[vals.length - 1];
  const diffs: number[] = [];
  for (let i = 1; i < vals.length; i++) diffs.push(vals[i] - vals[i - 1]);
  const mag = 1e-9 * (1 + Math.abs(last));
  if (Math.abs(diffs[diffs.length - 1]) < mag && Math.abs(diffs[diffs.length - 2]) < 1e3 * mag) return { kind: "settles", limit: last };
  const sameSign = diffs.every((d) => d > 0) || diffs.every((d) => d < 0);
  if (sameSign) {
    const r1 = Math.abs(diffs[diffs.length - 1] / diffs[diffs.length - 2]);
    const r0 = Math.abs(diffs[diffs.length - 2] / diffs[diffs.length - 3]);
    if (r1 < 0.85 && r0 < 0.85 && Math.abs(r1 - r0) < 0.2) {
      const r = r1;
      return { kind: "settles", limit: last + diffs[diffs.length - 1] * (r / (1 - r)) };
    }
    return { kind: "diverges", limit: last };
  }
  return { kind: "noconverge", limit: last };
}

const EXCLUSIONS = [2, 3, 4, 5, 6, 7, 8];

/** Does shaving a shrinking neighbourhood off `p` make the integral settle (integrable singularity) or run away? */
function singularityBehaviour(f: Fn, lo: number, hi: number, p: number): Behaviour {
  const len = hi - lo;
  const atLo = p <= lo + 1e-12 * len;
  const atHi = p >= hi - 1e-12 * len;
  const piece = (x0: number, x1: number) => (x1 > x0 ? adaptive(f, x0, x1, 1e-9, 1e-12, 400).value : 0);

  if (atLo || atHi) {
    const vals = EXCLUSIONS.map((k) => {
      const d = len * Math.pow(10, -k);
      return atLo ? piece(lo + d, hi) : piece(lo, hi - d);
    });
    const c = classifySequence(vals);
    return { kind: c.kind, value: c.limit };
  }

  // Interior singularity: each side must converge on its own (a symmetric
  // "principal value" is NOT an ordinary integral).
  const leftVals = EXCLUSIONS.map((k) => piece(lo, p - len * Math.pow(10, -k)));
  const rightVals = EXCLUSIONS.map((k) => piece(p + len * Math.pow(10, -k), hi));
  const kl = classifySequence(leftVals);
  const kr = classifySequence(rightVals);
  const value = kl.limit + kr.limit;
  if (kl.kind === "settles" && kr.kind === "settles") return { kind: "settles", value };
  if (kl.kind === "diverges" || kr.kind === "diverges") return { kind: "diverges", value };
  return { kind: "noconverge", value };
}

function finiteInterval(f0: Fn, a: number, b: number, allowTS = true): NumIntResult {
  const stats: { bad: number; total: number; maxAbs?: number; argMax?: number } = { bad: 0, total: 0 };
  const f = guarded(f0, stats);
  const r = adaptive(f, a, b, 1e-11, 1e-13, 1500);
  if (stats.total > 0 && stats.bad / stats.total > 0.4) return { value: NaN, error: Infinity, status: "undefined" };
  // The integrand blew up somewhere: decide honestly whether that singularity is integrable.
  if ((stats.maxAbs ?? 0) > 1e8 && stats.argMax !== undefined) {
    const p0 = stats.argMax;
    const target = p0 - a < (b - a) * 1e-6 ? a : b - p0 < (b - a) * 1e-6 ? b : p0;
    const beh = singularityBehaviour(f, a, b, target);
    if (beh.kind === "settles") return { value: beh.value, error: 1e-7 * (1 + Math.abs(beh.value)), status: "ok" };
    return { value: beh.value, error: Infinity, status: beh.kind };
  }
  if (r.converged) {
    // Endpoint singularities (1/sqrt(1-x^2)) converge slowly; polish with tanh-sinh when it agrees closely.
    const ts = allowTS ? tanhSinh(f, a, b) : { value: NaN, ok: false };
    if (ts.ok && Math.abs(ts.value - r.value) <= 1e-5 * (1 + Math.abs(r.value))) return { value: ts.value, error: Math.abs(ts.value - r.value), status: "ok" };
    return { value: r.value, error: r.error, status: "ok" };
  }

  const ts = allowTS ? tanhSinh(f, a, b) : { value: NaN, ok: false };
  // Not converged — locate the worst-behaved spot and classify it.
  let worst = r.segs[0];
  for (const sg of r.segs) if (sg.e > worst.e) worst = sg;
  const edgeVal = (x: number) => { const v = f(x); return Number.isFinite(v) ? Math.abs(v) : Infinity; };
  const p = edgeVal(worst.a) >= edgeVal(worst.b) ? worst.a : worst.b;
  const target = p - a < (b - a) * 1e-6 ? a : b - p < (b - a) * 1e-6 ? b : p;
  const beh = singularityBehaviour(f, a, b, target);
  if (beh.kind === "settles") {
    const v = ts.ok ? ts.value : beh.value;
    return { value: v, error: 1e-7 * (1 + Math.abs(v)), status: "ok" };
  }
  return { value: beh.value, error: Infinity, status: beh.kind };
}

/** ∫_a^b f(x) dx for finite or infinite a, b. */
export function integrate1D(f: Fn, a: number, b: number): NumIntResult {
  if (Number.isNaN(a) || Number.isNaN(b)) return { value: NaN, error: Infinity, status: "undefined" };
  if (a === b) return { value: 0, error: 0, status: "ok" };
  if (a > b) {
    const r = integrate1D(f, b, a);
    return { ...r, value: -r.value };
  }
  const aInf = a === -Infinity;
  const bInf = b === Infinity;
  if (!aInf && !bInf) return finiteInterval(f, a, b);
  if (!aInf && bInf) {
    return finiteInterval((t) => {
      const x = a + t / (1 - t);
      return f(x) / ((1 - t) * (1 - t));
    }, 0, 1, false);
  }
  if (aInf && !bInf) {
    return finiteInterval((t) => {
      const x = b - t / (1 - t);
      return f(x) / ((1 - t) * (1 - t));
    }, 0, 1, false);
  }
  const left = integrate1D(f, -Infinity, 0);
  const right = integrate1D(f, 0, Infinity);
  const bad = [left, right].find((r) => r.status !== "ok");
  if (bad) return { value: left.value + right.value, error: Infinity, status: bad.status };
  return { value: left.value + right.value, error: left.error + right.error, status: "ok" };
}

/** ∫∫ over a region: x from xa to xb, y from ya(x) to yb(x). */
export function integrate2D(
  f: (x: number, y: number) => number,
  xa: number, xb: number,
  ya: (x: number) => number, yb: (x: number) => number,
): NumIntResult {
  let worstStatus: IntegralStatus = "ok";
  const inner = (x: number) => {
    const lo = ya(x);
    const hi = yb(x);
    const r = integrate1D((y) => f(x, y), lo, hi);
    if (r.status !== "ok") worstStatus = r.status;
    return r.value;
  };
  const outer = integrate1D(inner, xa, xb);
  const status: IntegralStatus = outer.status !== "ok" ? outer.status : worstStatus;
  return { value: outer.value, error: outer.error, status };
}

// ── closed-form recognition ───────────────────────────────────────────────────
function gcd(a: number, b: number): number { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a || 1; }

function asSmallRational(v: number, maxDen = 60, tol = 1e-9): [number, number] | null {
  if (!Number.isFinite(v)) return null;
  for (let d = 1; d <= maxDen; d++) {
    const n = Math.round(v * d);
    if (Math.abs(v - n / d) < tol * Math.max(1, Math.abs(v))) {
      const g = gcd(n, d);
      return [n / g, d / g];
    }
  }
  return null;
}

const CONSTS: { tex: string; text: string; val: number }[] = [
  { tex: "\\pi", text: "π", val: Math.PI },
  { tex: "e", text: "e", val: Math.E },
  { tex: "e^{2}", text: "e²", val: Math.E * Math.E },
  { tex: "\\sqrt{e}", text: "√e", val: Math.sqrt(Math.E) },
  { tex: "\\ln 2", text: "ln(2)", val: Math.LN2 },
  { tex: "\\sqrt{2}", text: "√2", val: Math.SQRT2 },
  { tex: "\\sqrt{3}", text: "√3", val: Math.sqrt(3) },
  { tex: "\\sqrt{\\pi}", text: "√π", val: Math.sqrt(Math.PI) },
  { tex: "\\pi^2", text: "π²", val: Math.PI * Math.PI },
  { tex: "\\ln 3", text: "ln(3)", val: Math.log(3) },
  { tex: "\\pi\\sqrt{3}", text: "π√3", val: Math.PI * Math.sqrt(3) },
  { tex: "\\pi\\sqrt{2}", text: "π√2", val: Math.PI * Math.SQRT2 },
];

function ratTex(n: number, d: number): string { return d === 1 ? `${n}` : n < 0 ? `-\\frac{${-n}}{${d}}` : `\\frac{${n}}{${d}}`; }
function ratText(n: number, d: number): string { return d === 1 ? `${n}` : `${n}/${d}`; }

function termTex(n: number, d: number, k: { tex: string }): string {
  const sign = n < 0 ? "-" : "";
  const an = Math.abs(n);
  const num = an === 1 ? k.tex : `${an}${k.tex.startsWith("\\") || k.tex === "e" ? "" : ""}${k.tex}`;
  return d === 1 ? `${sign}${num}` : `${sign}\\frac{${num}}{${d}}`;
}
function termText(n: number, d: number, k: { text: string }): string {
  const sign = n < 0 ? "-" : "";
  const an = Math.abs(n);
  const num = an === 1 ? k.text : `${an}${k.text}`;
  return d === 1 ? `${sign}${num}` : `${sign}${num}/${d}`;
}

/** If `v` is a simple closed form (rational, rational·π, a + b·π, …) return it. */
export function recognizeConstant(v: number, tol = 1e-9, maxDen = 720): { tex: string; text: string } | null {
  if (!Number.isFinite(v)) return null;
  if (Math.abs(v) < Math.max(1e-12, tol * 1e-3)) return { tex: "0", text: "0" };
  const r = asSmallRational(v, maxDen, tol);
  if (r) return { tex: ratTex(r[0], r[1]), text: ratText(r[0], r[1]) };
  // e^(p/q)  (e.g. the limit (1+3/x)^(2x) = e^6)
  if (v > 0) {
    const lg = Math.log(v);
    const q = asSmallRational(lg, 4, Math.max(tol, 1e-10));
    if (q && q[0] !== 0 && Math.abs(q[0]) <= 24) {
      const [p, d] = q;
      if (p === 1 && d === 1) return { tex: "e", text: "e" };
      const exp = d === 1 ? `${p}` : `\\frac{${p}}{${d}}`;
      return { tex: `e^{${exp}}`, text: `e^(${d === 1 ? p : `${p}/${d}`})` };
    }
  }
  // pure multiples first
  for (const k of CONSTS) {
    const q = asSmallRational(v / k.val, 72, tol);
    if (q) return { tex: termTex(q[0], q[1], k), text: termText(q[0], q[1], k) };
    const inv = asSmallRational(v * k.val, 72, tol);
    if (inv && (k.tex === "\\pi" || k.tex === "e")) {
      const [n, d] = inv;
      const sign = n < 0 ? "-" : "";
      const num = Math.abs(n);
      return { tex: `${sign}\\frac{${num === 1 ? 1 : num}}{${d === 1 ? "" : d}${k.tex}}`, text: `${sign}${num}/(${d === 1 ? "" : d}${k.text})` };
    }
  }
  // a + b·K with small rationals
  for (const k of CONSTS.slice(0, 5)) {
    for (let d = 1; d <= 12; d++) {
      for (let nb = -48; nb <= 48; nb++) {
        if (nb === 0) continue;
        const a = v - (nb / d) * k.val;
        const ra = asSmallRational(a, 24, Math.min(tol, 1e-10));
        if (ra && ra[1] <= 24 && Math.abs(ra[0]) <= 200) {
          const g = gcd(nb, d);
          const bn = nb / g;
          const bd = d / g;
          const bTex = termTex(bn, bd, k);
          const bText = termText(bn, bd, k);
          const aTex = ratTex(ra[0], ra[1]);
          const aText = ratText(ra[0], ra[1]);
          if (ra[0] === 0) return { tex: bTex, text: bText };
          return {
            tex: bn < 0 ? `${aTex} - ${bTex.slice(1)}` : `${aTex} + ${bTex}`,
            text: bn < 0 ? `${aText} - ${bText.slice(1)}` : `${aText} + ${bText}`,
          };
        }
      }
    }
  }
  return null;
}
