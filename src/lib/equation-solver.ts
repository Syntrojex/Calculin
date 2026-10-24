/**
 * General equation solver — the engine behind the Equations calculator.
 *
 * Handles, from one text box:
 *   • polynomial equations of ANY degree (exact rational roots + factoring,
 *     exact quadratic factor, numeric complex roots for what is left)
 *   • rational equations (denominators cleared, extraneous roots rejected)
 *   • everything else in one variable — radicals, |x|, trig, exp, log, mixes —
 *     by a careful numeric scan (sign changes, tangent/double roots, poles
 *     rejected) with every root verified by substitution
 *   • inequalities  (<, >, ≤, ≥) → interval answer
 *   • systems of equations (comma / semicolon / new-line separated) →
 *     exact linear solve with row-reduction steps, numeric Newton otherwise
 *
 * Output uses the same `##Title\n$$latex$$` step format as every other solver.
 */
import { parse, evaluate, type MathNode } from "mathjs";
import { cleanExpression } from "./expression-clean";
import { polyFromNode, rationalFromNode, polyToString } from "./math-solver";
import { exprToLatex } from "./latex";

export interface EqResult {
  roots: string[];
  steps: string[];
  error?: string;
  numericRoots?: number[];
  /** Name of the unknown (defaults to x). */
  variable?: string;
  /** Set when the answer is an interval / set instead of a list of roots. */
  setAnswer?: string;
  /** Expression f(v) such that the equation is f(v) = 0 (used for the root graph). */
  graphExpr?: string;
}

type Fmt = (n: number) => string;
type Poly = number[]; // ascending powers
interface C { re: number; im: number }

const CONSTANTS = new Set(["pi", "e", "tau", "Infinity", "NaN", "i"]);

// ───────────────────────────── small helpers ─────────────────────────────

const clean = (n: number): number => {
  if (Math.abs(n) < 1e-12) return 0;
  const r = Math.round(n * 1e9) / 1e9;
  return Math.abs(r - n) < 1e-11 * Math.max(1, Math.abs(n)) ? r : n;
};
const num = (n: number): string => String(clean(n));

function gcdBig(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a; b = b < 0n ? -b : b;
  while (b) { [a, b] = [b, a % b]; }
  return a;
}
function gcdNum(a: number, b: number): number {
  a = Math.abs(a); b = Math.abs(b);
  while (b) { [a, b] = [b, a % b]; }
  return a;
}

/** Best rational approximation p/q (q ≤ maxDen) or null if x isn't (nearly) rational. */
export function toFrac(x: number, maxDen = 100000): [number, number] | null {
  if (!Number.isFinite(x)) return null;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  let h1 = 1, h0 = 0, k1 = 0, k0 = 1, b = ax;
  for (let i = 0; i < 40; i++) {
    const a = Math.floor(b);
    const h2 = a * h1 + h0, k2 = a * k1 + k0;
    if (k2 > maxDen) break;
    h0 = h1; h1 = h2; k0 = k1; k1 = k2;
    if (Math.abs(ax - h1 / k1) < 1e-11 * Math.max(1, ax)) return [sign * h1, k1];
    const frac = b - a;
    if (frac < 1e-13) break;
    b = 1 / frac;
  }
  return Math.abs(ax - h1 / k1) < 1e-11 * Math.max(1, ax) && k1 <= maxDen && k1 > 0 ? [sign * h1, k1] : null;
}

/** LaTeX for a number: integer, \frac{p}{q} when it is a clean fraction, else decimal. */
export function numTex(x: number): string {
  x = clean(x);
  const f = toFrac(x, 10000);
  if (f && f[1] !== 1) return f[0] < 0 ? `-\\frac{${-f[0]}}{${f[1]}}` : `\\frac{${f[0]}}{${f[1]}}`;
  return String(x);
}

function surd(n: number): { k: number; m: number } {
  let k = 1, m = n;
  for (let p = 2; p * p <= m; p++) {
    while (m % (p * p) === 0) { m /= p * p; k *= p; }
  }
  return { k, m };
}

function cTex(c: C, fmt: Fmt): string {
  const re = Math.abs(c.re) < 1e-10 ? 0 : c.re;
  const im = Math.abs(c.im) < 1e-10 ? 0 : c.im;
  if (im === 0) return fmt(re);
  const imA = Math.abs(im);
  const imS = Math.abs(imA - 1) < 1e-10 ? "" : fmt(imA);
  if (re === 0) return `${im < 0 ? "-" : ""}${imS}i`;
  return `${fmt(re)} ${im < 0 ? "-" : "+"} ${imS}i`;
}

// ──────────────────────────── polynomial utilities ────────────────────────────

function trim(p: Poly): Poly {
  const q = [...p];
  const scale = Math.max(1, ...q.map(Math.abs));
  while (q.length > 1 && Math.abs(q[q.length - 1]) < 1e-12 * scale) q.pop();
  return q;
}
const degOf = (p: Poly) => trim(p).length - 1;

function polyEvalC(p: Poly, z: C): C {
  let r: C = { re: 0, im: 0 };
  for (let i = p.length - 1; i >= 0; i--) {
    r = { re: r.re * z.re - r.im * z.im + p[i], im: r.re * z.im + r.im * z.re };
  }
  return r;
}
function polyDeriv(p: Poly): Poly {
  return p.length <= 1 ? [0] : p.slice(1).map((c, i) => c * (i + 1));
}

function cdiv(a: C, b: C): C {
  const d = b.re * b.re + b.im * b.im;
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
}
function cmul(a: C, b: C): C { return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }; }
function csub(a: C, b: C): C { return { re: a.re - b.re, im: a.im - b.im }; }
const cabs = (a: C) => Math.hypot(a.re, a.im);

/** All complex roots (with multiplicity merged) of a numeric polynomial via Durand–Kerner + Newton polish. */
function numericPolyRoots(pIn: Poly): { z: C; mult: number }[] {
  const p = trim(pIn);
  const n = p.length - 1;
  if (n < 1) return [];
  const lead = p[n];
  const c = p.map((v) => v / lead);
  const r0 = Math.max(0.5, Math.pow(Math.abs(c[0]) || 1, 1 / n));
  let zs: C[] = [];
  let cur: C = { re: 1, im: 0 };
  const seed: C = { re: 0.4, im: 0.9 };
  for (let k = 0; k < n; k++) {
    zs.push({ re: cur.re * r0, im: cur.im * r0 });
    cur = cmul(cur, seed);
  }
  for (let it = 0; it < 2000; it++) {
    let maxDelta = 0;
    const next: C[] = zs.map((z, k) => {
      let denom: C = { re: 1, im: 0 };
      for (let j = 0; j < n; j++) if (j !== k) denom = cmul(denom, csub(z, zs[j]));
      if (cabs(denom) < 1e-300) return z;
      const delta = cdiv(polyEvalC(c, z), denom);
      maxDelta = Math.max(maxDelta, cabs(delta) / (1 + cabs(z)));
      return csub(z, delta);
    });
    zs = next;
    if (maxDelta < 1e-15) break;
  }
  // Newton polish on the square-free-ish polynomial (only helps simple roots)
  const dc = polyDeriv(c);
  zs = zs.map((z) => {
    let w = z;
    for (let i = 0; i < 4; i++) {
      const d = polyEvalC(dc, w);
      if (cabs(d) < 1e-9) break;
      const step = cdiv(polyEvalC(c, w), d);
      const w2 = csub(w, step);
      if (cabs(polyEvalC(c, w2)) <= cabs(polyEvalC(c, w))) w = w2; else break;
    }
    return w;
  });
  // snap tiny imaginary parts, then merge clusters (multiple roots)
  zs = zs.map((z) => (Math.abs(z.im) < 1e-8 * (1 + Math.abs(z.re)) ? { re: z.re, im: 0 } : z));
  const used = new Array(n).fill(false);
  const out: { z: C; mult: number }[] = [];
  for (let i = 0; i < n; i++) {
    if (used[i]) continue;
    let sr = zs[i].re, si = zs[i].im, m = 1;
    used[i] = true;
    for (let j = i + 1; j < n; j++) {
      if (used[j]) continue;
      if (cabs(csub(zs[i], zs[j])) < 1e-4 * (1 + cabs(zs[i]))) { used[j] = true; sr += zs[j].re; si += zs[j].im; m++; }
    }
    let z: C = { re: sr / m, im: si / m };
    if (Math.abs(z.im) < 1e-8 * (1 + Math.abs(z.re))) z = { re: z.re, im: 0 };
    out.push({ z, mult: m });
  }
  return out;
}

// Integer polynomial helpers (BigInt) for the rational-root theorem
function toIntegerPoly(p: Poly): bigint[] | null {
  let lcm = 1;
  for (const v of p) {
    const f = toFrac(v, 100000);
    if (!f) return null;
    lcm = (lcm / gcdNum(lcm, f[1])) * f[1];
    if (lcm > 1e9) return null;
  }
  const out = p.map((v) => BigInt(Math.round(v * lcm)));
  let g = 0n;
  for (const v of out) g = gcdBig(g, v);
  return g > 1n ? out.map((v) => v / g) : out;
}

function divisors(n: bigint): bigint[] {
  const m = Number(n < 0n ? -n : n);
  const ds: number[] = [];
  for (let i = 1; i * i <= m; i++) if (m % i === 0) { ds.push(i); if (i * i !== m) ds.push(m / i); }
  return ds.map((d) => BigInt(d));
}

function bigEvalRatio(a: bigint[], pn: bigint, qd: bigint): bigint {
  // returns q^n * P(p/q) as an integer
  const n = a.length - 1;
  let r = 0n;
  for (let i = n; i >= 0; i--) r = r * pn + a[i] * qd ** BigInt(n - i);
  return r;
}

function deflateBig(a: bigint[], pn: bigint, qd: bigint): bigint[] | null {
  // divide a(x) by (qd*x - pn)
  const n = a.length - 1;
  const quo: bigint[] = new Array(n).fill(0n);
  const w = a.map((v) => v);
  for (let k = n; k >= 1; k--) {
    if (w[k] % qd !== 0n) return null;
    const ck = w[k] / qd;
    quo[k - 1] = ck;
    w[k - 1] += pn * ck;
  }
  return w[0] === 0n ? quo : null;
}

interface PolyRoot { value: C; mult: number; exact?: { p: bigint; q: bigint } }

function solvePolynomial(p0: Poly, steps: string[], fmt: Fmt, v: string): PolyRoot[] {
  let p = trim(p0);
  const roots: PolyRoot[] = [];

  // factor out x^k
  let zeroMult = 0;
  while (p.length > 1 && Math.abs(p[0]) < 1e-12 * Math.max(1, ...p.map(Math.abs))) { p = p.slice(1); zeroMult++; }
  if (zeroMult) {
    roots.push({ value: { re: 0, im: 0 }, mult: zeroMult, exact: { p: 0n, q: 1n } });
    steps.push(`##Factor Out ${v}\n$$${v}^{${zeroMult === 1 ? "" : zeroMult}}\\,(\\dots) = 0 \\;\\Rightarrow\\; ${v} = 0${zeroMult > 1 ? ` \\text{ (multiplicity ${zeroMult})}` : ""}$$`);
  }
  if (p.length <= 1) return roots;

  // rational-root theorem on the integer-scaled polynomial
  let ip = toIntegerPoly(p);
  const foundRational: { p: bigint; q: bigint; mult: number }[] = [];
  if (ip && ip.length > 2) {
    const lead = ip[ip.length - 1];
    const trail = ip[0];
    const ps = divisors(trail), qs = divisors(lead);
    if (ps.length * qs.length <= 60000) {
      const cands = new Map<string, [bigint, bigint]>();
      for (const pp of ps) for (const qq of qs) {
        if (gcdBig(pp, qq) !== 1n) continue;
        cands.set(`${pp}/${qq}`, [pp, qq]); cands.set(`-${pp}/${qq}`, [-pp, qq]);
      }
      let progress = true;
      while (progress && ip && ip.length > 2) {
        progress = false;
        for (const [pp, qq] of cands.values()) {
          if (bigEvalRatio(ip, pp, qq) === 0n) {
            const d = deflateBig(ip, pp, qq);
            if (!d) continue;
            const ex = foundRational.find((r) => r.p === pp && r.q === qq);
            if (ex) ex.mult++; else foundRational.push({ p: pp, q: qq, mult: 1 });
            ip = d; progress = true; break;
          }
        }
      }
    }
  }
  if (foundRational.length) {
    const cand = `\\pm\\frac{\\text{factors of } ${toIntegerPoly(p)![0] < 0n ? -toIntegerPoly(p)![0] : toIntegerPoly(p)![0]}}{\\text{factors of } ${toIntegerPoly(p)![toIntegerPoly(p)!.length - 1] < 0n ? -toIntegerPoly(p)![toIntegerPoly(p)!.length - 1] : toIntegerPoly(p)![toIntegerPoly(p)!.length - 1]}}`;
    steps.push(`##Rational Root Theorem\n$$${v} = ${cand}$$`);
    const tests = foundRational.map((r) => {
      const val = Number(r.p) / Number(r.q);
      return `${v} = ${numTex(val)}${r.mult > 1 ? ` \\text{ (multiplicity ${r.mult})}` : ""}`;
    });
    steps.push(`##Roots Found By Testing\n$$${tests.join(", \\qquad ")}$$`);
    const factors = foundRational.map((r) => {
      const root = Number(r.p) / Number(r.q);
      const fac = r.q === 1n ? `(${v} ${r.p < 0n ? "+" : "-"} ${(r.p < 0n ? -r.p : r.p).toString()})` : `(${r.q}${v} ${r.p < 0n ? "+" : "-"} ${(r.p < 0n ? -r.p : r.p).toString()})`;
      return r.mult > 1 ? `${fac}^{${r.mult}}` : fac;
      void root;
    });
    const restDeg = ip ? ip.length - 1 : 0;
    const restTex = ip && restDeg >= 1 ? `\\left(${exprToLatex(polyToString(ip.map(Number), v))}\\right)` : "";
    steps.push(`##Factor\n$$${factors.join("")}${restTex} = 0$$`);
    for (const r of foundRational) roots.push({ value: { re: Number(r.p) / Number(r.q), im: 0 }, mult: r.mult, exact: { p: r.p, q: r.q } });
  }
  const rest: Poly = foundRational.length && ip ? ip.map(Number) : p;
  const restDeg = degOf(rest);
  if (restDeg <= 0) return roots;

  // biquadratic hint  a x^4 + b x^2 + c
  if (restDeg === 4 && Math.abs(rest[1]) < 1e-12 && Math.abs(rest[3]) < 1e-12) {
    steps.push(`##Substitute $u = ${v}^2$\n$$${num(rest[4])}u^2 + ${num(rest[2])}u + ${num(rest[0])} = 0$$`);
  }

  if (restDeg === 2) {
    const [c0, b0, a0] = rest;
    const D = b0 * b0 - 4 * a0 * c0;
    const ints = toIntegerPoly(rest);
    steps.push(`##Quadratic Formula\n$$${v} = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}, \\qquad a=${num(a0)},\\; b=${num(b0)},\\; c=${num(c0)}$$`);
    steps.push(`##Discriminant\n$$D = (${num(b0)})^2 - 4(${num(a0)})(${num(c0)}) = ${num(D)}$$`);
    if (ints && Number.isInteger(D) === false) { /* fractional coefficients: numeric path below */ }
    if (ints) {
      const A = Number(ints[2]), B = Number(ints[1]), Cc = Number(ints[0]);
      const Di = B * B - 4 * A * Cc;
      if (Di >= 0) {
        const s = surd(Di);
        if (s.m === 1) {
          // perfect square → rational (would have been found already, but keep safe)
        } else {
          const g = gcdNum(gcdNum(B, s.k), 2 * A);
          const sgn = 2 * A < 0 ? -1 : 1;
          const bb = (-B / g) * sgn, kk = (s.k / g) * sgn, dd = (Math.abs(2 * A) / g);
          const head = bb === 0 ? "" : `${bb}`;
          const sq = `${Math.abs(kk) === 1 ? "" : Math.abs(kk)}\\sqrt{${s.m}}`;
          steps.push(`##Exact Roots\n$$${v} = \\frac{${head}\\pm ${sq}}{${dd}}$$`);
        }
      } else {
        const s = surd(-Di);
        const g = gcdNum(gcdNum(B, s.k), 2 * A);
        const sgn = 2 * A < 0 ? -1 : 1;
        const bb = (-B / g) * sgn, kk = (s.k / g) * sgn, dd = (Math.abs(2 * A) / g);
        const head = bb === 0 ? "" : `${bb}`;
        const sq = s.m === 1 ? `${Math.abs(kk) === 1 ? "" : Math.abs(kk)}i` : `${Math.abs(kk) === 1 ? "" : Math.abs(kk)}i\\sqrt{${s.m}}`;
        steps.push(`##Exact Roots ($D<0$)\n$$${v} = \\frac{${head}\\pm ${sq}}{${dd}}$$`);
      }
    }
    if (D >= -1e-12) {
      const sd = Math.sqrt(Math.max(0, D));
      if (Math.abs(D) < 1e-12) roots.push({ value: { re: -b0 / (2 * a0), im: 0 }, mult: 2 });
      else {
        roots.push({ value: { re: (-b0 + sd) / (2 * a0), im: 0 }, mult: 1 });
        roots.push({ value: { re: (-b0 - sd) / (2 * a0), im: 0 }, mult: 1 });
      }
    } else {
      const sd = Math.sqrt(-D);
      roots.push({ value: { re: -b0 / (2 * a0), im: sd / (2 * a0) }, mult: 1 });
      roots.push({ value: { re: -b0 / (2 * a0), im: -sd / (2 * a0) }, mult: 1 });
    }
    return roots;
  }

  if (restDeg === 1) {
    roots.push({ value: { re: -rest[0] / rest[1], im: 0 }, mult: 1 });
    return roots;
  }

  // degree ≥ 3 with no more rational roots → numeric
  const nr = numericPolyRoots(rest);
  steps.push(`##Remaining Factor (degree ${restDeg})\n$$${exprToLatex(polyToString(rest, v))} = 0$$\n\nNo more rational roots — solved numerically (Durand–Kerner, polished by Newton).`);
  for (const r of nr) roots.push({ value: r.z, mult: r.mult });
  return roots;
}

// ──────────────────────────── numeric root scanner ────────────────────────────

type NumFn = (x: number) => number;

function makeFn(node: MathNode, v: string): NumFn {
  const code = node.compile();
  const scope: Record<string, number> = {};
  return (x: number) => {
    scope[v] = x;
    try {
      const r = code.evaluate(scope);
      return typeof r === "number" ? r : NaN;
    } catch { return NaN; }
  };
}

function gridPoints(): number[] {
  const xs: number[] = [];
  const add = (lo: number, hi: number, step: number) => { for (let x = lo; x < hi - 1e-12; x += step) xs.push(Math.round(x * 1e9) / 1e9); };
  add(-1000, -100, 0.4);
  add(-100, -10, 0.04);
  add(-10, 10, 0.004);
  add(10, 100, 0.04);
  add(100, 1000, 0.4);
  xs.push(1000);
  return xs;
}

function scanRoots(f: NumFn): { roots: number[]; intervals: [number, number][] } {
  const xs = gridPoints();
  const ys = xs.map(f);
  const roots: number[] = [];
  const intervals: [number, number][] = [];
  const push = (r: number) => { if (!roots.some((q) => Math.abs(q - r) < 1e-7 * Math.max(1, Math.abs(r)))) roots.push(r); };

  // plateau of exact zeros → interval
  let i = 0;
  while (i < xs.length) {
    if (ys[i] === 0) {
      let j = i;
      while (j + 1 < xs.length && ys[j + 1] === 0) j++;
      if (j - i >= 3) intervals.push([xs[i], xs[j]]);
      else for (let k = i; k <= j; k++) push(xs[k]);
      i = j + 1;
    } else i++;
  }

  for (let k = 0; k < xs.length - 1; k++) {
    const a = ys[k], b = ys[k + 1];
    if (!Number.isFinite(a) || !Number.isFinite(b) || a === 0 || b === 0) continue;
    if ((a < 0) !== (b < 0)) {
      let l = xs[k], r = xs[k + 1], fl = a;
      for (let it = 0; it < 100; it++) {
        const m = 0.5 * (l + r);
        const fm = f(m);
        if (!Number.isFinite(fm)) break;
        if (fm === 0) { l = r = m; break; }
        if ((fm < 0) === (fl < 0)) { l = m; fl = fm; } else r = m;
        if (r - l < 1e-15 * Math.max(1, Math.abs(m))) break;
      }
      const x = 0.5 * (l + r);
      const fx = f(x);
      if (Number.isFinite(fx) && Math.abs(fx) <= Math.max(1e-12, 1e-7 * Math.max(Math.abs(a), Math.abs(b)))) push(x);
    }
  }

  // tangent (even-multiplicity) roots: local minimum of |f| with no sign change
  for (let k = 1; k < xs.length - 1; k++) {
    const a = ys[k - 1], b = ys[k], c = ys[k + 1];
    if (![a, b, c].every(Number.isFinite) || b === 0) continue;
    if (!((a < 0) === (b < 0) && (c < 0) === (b < 0))) continue;
    if (!(Math.abs(b) <= Math.abs(a) && Math.abs(b) <= Math.abs(c))) continue;
    let lo = xs[k - 1], hi = xs[k + 1];
    const g = (x: number) => Math.abs(f(x));
    const phi = (Math.sqrt(5) - 1) / 2;
    let x1 = hi - phi * (hi - lo), x2 = lo + phi * (hi - lo);
    let g1 = g(x1), g2 = g(x2);
    for (let it = 0; it < 120; it++) {
      if (g1 < g2) { hi = x2; x2 = x1; g2 = g1; x1 = hi - phi * (hi - lo); g1 = g(x1); }
      else { lo = x1; x1 = x2; g1 = g2; x2 = lo + phi * (hi - lo); g2 = g(x2); }
    }
    const xm = 0.5 * (lo + hi), gm = g(xm);
    if (Number.isFinite(gm) && gm <= 1e-8 * Math.max(Math.abs(a), Math.abs(c))) push(xm);
  }

  roots.sort((p, q) => p - q);
  return { roots, intervals };
}

// ──────────────────────────── parsing ────────────────────────────

function freeSymbols(node: MathNode): string[] {
  const out = new Set<string>();
  node.traverse((n: MathNode, path: string) => {
    if (n.type !== "SymbolNode" || path === "fn") return;
    const name = (n as unknown as { name: string }).name;
    if (!CONSTANTS.has(name)) out.add(name);
  });
  return [...out];
}

function splitTopLevel(s: string, seps: string[]): string[] {
  const parts: string[] = [];
  let depth = 0, cur = "";
  for (const ch of s) {
    if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) depth--;
    if (depth === 0 && seps.includes(ch)) { parts.push(cur); cur = ""; } else cur += ch;
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function tidy(raw: string): string {
  return raw
    .replace(/[−–—]/g, "-")
    .replace(/≤/g, "<=").replace(/≥/g, ">=").replace(/≠/g, "!=")
    .replace(/\s+/g, " ")
    .trim();
}

function prepSide(raw: string): string {
  const s = cleanExpression(raw);
  return s;
}

function fmtSet(v: number, fmt: Fmt): string { return fmt(v); }

// ──────────────────────────── single equation ────────────────────────────

function dedupeRoots(vals: number[], tol = 1e-8): number[] {
  const out: number[] = [];
  for (const v of vals) if (!out.some((q) => Math.abs(q - v) <= tol * Math.max(1, Math.abs(v)))) out.push(v);
  return out;
}

function buildAnswer(real: number[], complex: C[], v: string, fmt: Fmt, steps: string[], graphExpr: string, extra: { intervals?: [number, number][]; note?: string } = {}): EqResult {
  const labels: string[] = [];
  real.forEach((r) => labels.push(fmt(r)));
  complex.forEach((z) => labels.push(cTex(z, fmt)));
  const tex = [
    ...real.map((r) => `${v} = ${numTex(r)}${Math.abs(clean(r) - r) < 1e-12 && toFrac(r, 10000) ? "" : ` \\approx ${fmt(r)}`}`),
    ...complex.map((z) => `${v} = ${cTex(z, fmt)}`),
  ];
  if (extra.intervals) for (const [a, b] of extra.intervals) tex.push(`${v} \\in [${fmt(a)},\\, ${fmt(b)}]`);
  steps.push(`##${labels.length === 1 && !extra.intervals?.length ? "Solution" : "Solutions"}\n$$${tex.join(", \\quad ")}$$${extra.note ? `\n\n${extra.note}` : ""}`);
  return {
    roots: [...labels, ...(extra.intervals ?? []).map(([a, b]) => `${v} ∈ [${fmt(a)}, ${fmt(b)}]`)],
    steps,
    numericRoots: complex.length === 0 && !(extra.intervals?.length) ? real : undefined,
    variable: v,
    graphExpr,
  };
}

function trigGeneral(L: MathNode, R: MathNode, v: string, steps: string[], fmt: Fmt): boolean {
  const asTrig = (n: MathNode): { fn: string; arg: MathNode } | null => {
    let x = n;
    while (x.type === "ParenthesisNode") x = (x as unknown as { content: MathNode }).content;
    if (x.type !== "FunctionNode") return null;
    const fnode = x as unknown as { fn: { name: string }; args: MathNode[] };
    if (!["sin", "cos", "tan"].includes(fnode.fn.name) || fnode.args.length !== 1) return null;
    return { fn: fnode.fn.name, arg: fnode.args[0] };
  };
  let t = asTrig(L), other = R;
  if (!t) { t = asTrig(R); other = L; }
  if (!t) return false;
  if (freeSymbols(other).length) return false;
  const lin = polyFromNode(t.arg, v);
  if (!lin || lin.length !== 2 || Math.abs(lin[1]) < 1e-12) return false;
  let c: number;
  try { c = evaluate(other.toString()) as number; } catch { return false; }
  if (typeof c !== "number" || !Number.isFinite(c)) return false;
  const [b, a] = lin; // arg = a*v + b
  const argTex = exprToLatex(t.arg.toString());
  const sol = (theta: string) => `\\frac{${theta}${b === 0 ? "" : ` ${b < 0 ? "+" : "-"} ${Math.abs(clean(b))}`}}{${num(a)}}`;
  if (t.fn === "sin") {
    if (Math.abs(c) > 1 + 1e-12) { steps.push(`##No Real Solution\n$$|\\sin\\theta| \\le 1 \\quad\\text{but}\\quad \\sin(${argTex}) = ${num(c)}$$`); return true; }
    const th = Math.asin(Math.max(-1, Math.min(1, c)));
    steps.push(`##Take the Inverse Sine\n$$${argTex} = \\arcsin(${num(c)}) + 2\\pi k \\quad\\text{or}\\quad ${argTex} = \\pi - \\arcsin(${num(c)}) + 2\\pi k, \\qquad k\\in\\mathbb{Z}$$`);
    steps.push(`##General Solution\n$$${v} = ${sol(`${fmt(th)} + 2\\pi k`)} \\quad\\text{or}\\quad ${v} = ${sol(`${fmt(Math.PI - th)} + 2\\pi k`)}$$`);
  } else if (t.fn === "cos") {
    if (Math.abs(c) > 1 + 1e-12) { steps.push(`##No Real Solution\n$$|\\cos\\theta| \\le 1 \\quad\\text{but}\\quad \\cos(${argTex}) = ${num(c)}$$`); return true; }
    const th = Math.acos(Math.max(-1, Math.min(1, c)));
    steps.push(`##Take the Inverse Cosine\n$$${argTex} = \\pm\\arccos(${num(c)}) + 2\\pi k, \\qquad k\\in\\mathbb{Z}$$`);
    steps.push(`##General Solution\n$$${v} = ${sol(`${fmt(th)} + 2\\pi k`)} \\quad\\text{or}\\quad ${v} = ${sol(`${fmt(-th)} + 2\\pi k`)}$$`);
  } else {
    const th = Math.atan(c);
    steps.push(`##Take the Inverse Tangent\n$$${argTex} = \\arctan(${num(c)}) + \\pi k, \\qquad k\\in\\mathbb{Z}$$`);
    steps.push(`##General Solution\n$$${v} = ${sol(`${fmt(th)} + \\pi k`)}$$`);
  }
  return false;
}

export function solveEquation(input: string, fmt: Fmt, forcedVar?: string): EqResult {
  try {
    const s = tidy(input);
    if (!s) return { roots: [], steps: [], error: "Type an equation first, for example x^2 - 5x + 6 = 0." };
    const sides = s.split("=");
    if (sides.length > 2) return { roots: [], steps: [], error: "Only one \"=\" sign is allowed in a single equation." };
    const Ls = prepSide(sides[0]);
    const Rs = sides.length === 2 ? prepSide(sides[1]) : "0";
    if (!Ls || !Rs) return { roots: [], steps: [], error: "Both sides of the equation need something on them (e.g. 2x + 3 = 7)." };

    let L: MathNode, R: MathNode;
    try { L = parse(Ls); R = parse(Rs); } catch (e) {
      return { roots: [], steps: [], error: `Couldn't read this equation — check brackets and operators. (${e instanceof Error ? e.message : "syntax error"})` };
    }
    const syms = [...new Set([...freeSymbols(L), ...freeSymbols(R)])];
    if (syms.length > 1 && !forcedVar) {
      return { roots: [], steps: [], error: `This equation has several unknowns (${syms.join(", ")}). Solve one at a time with the others given numbers, or write a system separated by commas (e.g. x + y = 5, x - y = 1).` };
    }
    const v = forcedVar ?? syms[0] ?? "x";
    const diffNode = parse(`(${Ls}) - (${Rs})`);
    const givenTex = `${exprToLatex(Ls)} = ${exprToLatex(Rs)}`;
    const steps: string[] = [`##Given\n$$${givenTex}$$`];
    const graphExpr = `(${Ls}) - (${Rs})`;

    if (syms.length === 0) {
      const val = evaluate(graphExpr) as number;
      if (typeof val === "number" && Math.abs(val) < 1e-9) {
        steps.push(`##Check\n$$${givenTex}$$ is always true — there is no unknown.`);
        return { roots: ["True for every value"], steps, setAnswer: "all", variable: v };
      }
      return { roots: [], steps, error: "This statement is false — it has no unknown and the two sides are not equal." };
    }

    // ── polynomial / rational route ──
    const rat = rationalFromNode(diffNode, v);
    if (rat) {
      const P = trim(rat.P), Q = trim(rat.Q);
      const hasDen = Q.length > 1;
      steps.push(`##Rearrange\n$$${exprToLatex(polyToString(rat.P.length ? P : [0], v))}${hasDen ? `\\;\\Big/\\; \\left(${exprToLatex(polyToString(Q, v))}\\right)` : ""} = 0$$`);
      if (hasDen) steps.push(`##Clear Denominators\n$$${exprToLatex(polyToString(P, v))} = 0, \\qquad \\text{with } ${exprToLatex(polyToString(Q, v))} \\ne 0$$`);

      if (P.length === 1) {
        if (Math.abs(P[0]) < 1e-12) {
          const excl = hasDen ? numericPolyRoots(Q).filter((r) => r.z.im === 0).map((r) => r.z.re) : [];
          steps.push(`##Identity\n$$0 = 0 \\;\\Rightarrow\\; ${v} \\in \\mathbb{R}${excl.length ? `\\setminus\\{${excl.map((e) => numTex(e)).join(", ")}\\}` : ""}$$`);
          return { roots: ["All real numbers" + (excl.length ? ` except ${excl.map((e) => fmt(e)).join(", ")}` : "")], steps, setAnswer: "all", variable: v, graphExpr };
        }
        steps.push(`##Contradiction\n$$${numTex(P[0])} = 0 \\;\\Rightarrow\\; \\text{no solution}$$`);
        return { roots: [], steps, error: "No solution", variable: v, graphExpr };
      }

      if (P.length - 1 > 60) return { roots: [], steps, error: "Degree too high (over 60) to solve reliably." };
      if (P.length === 2) {
        // linear — straightforward steps
        steps.push(`##Solve for ${v}\n$$${v} = \\frac{-(${numTex(P[0])})}{${numTex(P[1])}} = ${numTex(-P[0] / P[1])}$$`);
      }
      const pr = P.length === 2 ? [{ value: { re: -P[0] / P[1], im: 0 }, mult: 1 } as PolyRoot] : solvePolynomial(P, steps, fmt, v);

      // expand multiplicities for display, reject poles
      const kept: PolyRoot[] = [];
      const rejected: string[] = [];
      for (const r of pr) {
        if (hasDen) {
          const qv = polyEvalC(Q, r.value);
          if (cabs(qv) < 1e-8 * (1 + Math.max(...Q.map(Math.abs)))) { rejected.push(cTex(r.value, fmt)); continue; }
        }
        kept.push(r);
      }
      if (rejected.length) steps.push(`##Reject Extraneous\n$$${v} = ${rejected.join(", ")} \\text{ makes a denominator } 0 \\;\\Rightarrow\\; \\text{not allowed}$$`);
      const real = kept.filter((r) => r.value.im === 0).map((r) => clean(r.value.re)).sort((a, b) => a - b);
      const cplx = kept.filter((r) => r.value.im !== 0).map((r) => r.value);
      // keep one of each conjugate pair visible
      if (!real.length && !cplx.length) return { roots: [], steps, error: "No solution", variable: v, graphExpr };
      const multNote = kept.some((r) => r.mult > 1) ? "Repeated roots: " + kept.filter((r) => r.mult > 1).map((r) => `${cTex(r.value, fmt)} (×${r.mult})`).join(", ") : undefined;
      const res = buildAnswer(dedupeRoots(real), cplx, v, fmt, steps, graphExpr, { note: multNote });
      if (!real.length) res.numericRoots = undefined;
      return res;
    }

    // ── trig closed forms ──
    let trigDone = false;
    try { trigDone = trigGeneral(L, R, v, steps, fmt); } catch { /* fall through */ }
    if (trigDone) return { roots: [], steps, error: "No real solution", variable: v, graphExpr };

    // ── numeric route ──
    steps.push(`##Method\nNot a polynomial equation — solved numerically: scan $f(${v}) = ${exprToLatex(Ls)} - (${exprToLatex(Rs)})$ for sign changes on $[-1000, 1000]$, refine each by bisection, reject poles, and verify by substitution.`);
    const f = makeFn(diffNode, v);
    const lf = makeFn(L, v), rf = makeFn(R, v);
    const { roots: raw, intervals } = scanRoots(f);
    const verified = raw.filter((x) => {
      const a = lf(x), b = rf(x);
      return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-6 * (1 + Math.abs(a) + Math.abs(b));
    });
    if (!verified.length && !intervals.length) {
      steps.push(`##Result\nNo real solution found for ${v} in $[-1000, 1000]$ (the two sides never meet there).`);
      return { roots: [], steps, error: "No real solution found.", variable: v, graphExpr };
    }
    // closest to zero first, cap long (periodic) lists
    const MAX = 16;
    let shown = verified;
    let note: string | undefined;
    if (verified.length > MAX) {
      shown = [...verified].sort((a, b) => Math.abs(a) - Math.abs(b)).slice(0, MAX).sort((a, b) => a - b);
      note = `${verified.length} solutions in $[-1000, 1000]$ — the equation is periodic or oscillating, so there are infinitely many. Showing the ${MAX} nearest to 0.`;
    } else if (/\b(sin|cos|tan|cot|sec|csc)\b/.test(Ls + Rs) && verified.length) {
      note = "Trigonometric equations repeat: these are the solutions in $[-1000, 1000]$ — add multiples of the period for the others.";
    }
    for (const x of shown.slice(0, 3)) {
      steps.push(`##Check ${v} = ${fmt(x)}\n$$\\text{LHS} = ${fmt(lf(x))}, \\qquad \\text{RHS} = ${fmt(rf(x))}$$`);
    }
    return buildAnswer(shown, [], v, fmt, steps, graphExpr, { intervals, note });
  } catch (e) {
    return { roots: [], steps: [], error: e instanceof Error ? e.message : "Couldn't solve this equation." };
  }
}

// ──────────────────────────── inequalities ────────────────────────────

export function solveInequality(input: string, fmt: Fmt): EqResult {
  try {
    const s = tidy(input);
    const m = s.match(/^(.*?)(<=|>=|<|>)(.*)$/);
    if (!m) return { roots: [], steps: [], error: "No inequality sign found." };
    const [, lhsRaw, op, rhsRaw] = m;
    if (/[<>]/.test(rhsRaw.replace(/^=/, ""))) return { roots: [], steps: [], error: "Only one inequality sign is supported (a < b), not chained ones like a < b < c." };
    const Ls = prepSide(lhsRaw), Rs = prepSide(rhsRaw);
    if (!Ls || !Rs) return { roots: [], steps: [], error: "Both sides of the inequality need something on them." };
    const L = parse(Ls), R = parse(Rs);
    const syms = [...new Set([...freeSymbols(L), ...freeSymbols(R)])];
    if (syms.length !== 1) return { roots: [], steps: [], error: syms.length ? `Inequalities with several unknowns (${syms.join(", ")}) can't be solved on a number line — keep just one.` : "There is no unknown in this inequality." };
    const v = syms[0];
    const diff = parse(`(${Ls}) - (${Rs})`);
    const f = makeFn(diff, v);
    const strict = op === "<" || op === ">";
    const wantPositive = op === ">" || op === ">=";
    const sym = op.replace("<=", "≤").replace(">=", "≥");
    const steps: string[] = [`##Given\n$$${exprToLatex(Ls)} ${op === "<=" ? "\\le" : op === ">=" ? "\\ge" : op} ${exprToLatex(Rs)}$$`];
    steps.push(`##Move Everything to One Side\n$$f(${v}) = ${exprToLatex(`(${Ls}) - (${Rs})`)} ${sym === "<" || sym === "≤" ? (strict ? "< 0" : "\\le 0") : strict ? "> 0" : "\\ge 0"}$$`);

    // critical points: roots of f and poles/domain edges
    let crit: number[] = [];
    const rat = rationalFromNode(diff, v);
    let polesExact: number[] = [];
    if (rat) {
      const P = trim(rat.P), Q = trim(rat.Q);
      if (P.length > 1) crit.push(...numericPolyRoots(P).filter((r) => r.z.im === 0).map((r) => clean(r.z.re)));
      if (Q.length > 1) polesExact = numericPolyRoots(Q).filter((r) => r.z.im === 0).map((r) => clean(r.z.re));
      if (P.length === 1 && Math.abs(P[0]) < 1e-12) crit = [];
    } else {
      crit.push(...scanRoots(f).roots);
    }
    // numeric poles / domain edges: where f flips between finite and non-finite, or blows up
    const xs = gridPoints();
    const edge: number[] = [];
    if (!rat) {
      let prev = f(xs[0]);
      for (let k = 1; k < xs.length; k++) {
        const cur = f(xs[k]);
        if (Number.isFinite(prev) !== Number.isFinite(cur)) {
          let l = xs[k - 1], r = xs[k];
          const lf = Number.isFinite(prev);
          for (let it = 0; it < 80; it++) { const mid = (l + r) / 2; if (Number.isFinite(f(mid)) === lf) l = mid; else r = mid; }
          edge.push((l + r) / 2);
        }
        prev = cur;
      }
    }
    const holds = (x: number) => {
      const y = f(x);
      if (!Number.isFinite(y)) return false;
      return wantPositive ? y > 0 : y < 0;
    };
    const rootsSet = dedupeRoots(crit.sort((a, b) => a - b));
    const poles = dedupeRoots([...polesExact, ...edge].sort((a, b) => a - b));
    const all = dedupeRoots([...rootsSet, ...poles].sort((a, b) => a - b));
    steps.push(`##Critical Points\n$$${all.length ? all.map((c) => `${v} = ${numTex(c)}${toFrac(c, 10000) ? "" : ` \\approx ${fmt(c)}`}`).join(", \\quad ") : "\\text{none}"}$$\nThe sign of $f$ can only change at a root or at a point where $f$ is undefined.`);

    const pts = [-Infinity, ...all, Infinity];
    const segs: { lo: number; hi: number; ok: boolean; sample: number }[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const lo = pts[i], hi = pts[i + 1];
      const sample = lo === -Infinity && hi === Infinity ? 0 : lo === -Infinity ? hi - 1 : hi === Infinity ? lo + 1 : (lo + hi) / 2;
      segs.push({ lo, hi, ok: holds(sample), sample });
    }
    const rowsTex = segs.map((sg) => `\\text{test } ${v}=${fmt(sg.sample)}:\\; f = ${fmt(f(sg.sample))} \\Rightarrow ${sg.ok ? "\\checkmark" : "\\times"}`);
    steps.push(`##Test Each Interval\n$$\\begin{array}{l}${rowsTex.join("\\\\")}\\end{array}$$`);

    const isRoot = (x: number) => rootsSet.some((r) => Math.abs(r - x) < 1e-9 * Math.max(1, Math.abs(x))) && !poles.some((p) => Math.abs(p - x) < 1e-9 * Math.max(1, Math.abs(x)));
    // merge adjacent ok segments, allowing a boundary root when non-strict
    const intervals: { lo: number; hi: number; loIn: boolean; hiIn: boolean }[] = [];
    segs.forEach((sg, idx) => {
      if (sg.ok) {
        const last = intervals[intervals.length - 1];
        const touches = last && last.hi === sg.lo;
        if (touches && !strict && isRoot(sg.lo)) { last.hi = sg.hi; last.hiIn = false; }
        else intervals.push({ lo: sg.lo, hi: sg.hi, loIn: !strict && sg.lo !== -Infinity && isRoot(sg.lo), hiIn: !strict && sg.hi !== Infinity && isRoot(sg.hi) });
      }
      void idx;
    });
    // isolated roots satisfy a non-strict inequality even when neighbours fail
    const isolated: number[] = [];
    if (!strict) for (const r of rootsSet) {
      if (!isRoot(r)) continue;
      if (!intervals.some((iv) => (r > iv.lo || (r === iv.lo && iv.loIn)) && (r < iv.hi || (r === iv.hi && iv.hiIn)))) isolated.push(r);
    }
    const b = (x: number) => (x === -Infinity ? "-\\infty" : x === Infinity ? "\\infty" : numTex(x));
    const parts = [
      ...intervals.map((iv) => `${iv.loIn ? "[" : "("}${b(iv.lo)},\\, ${b(iv.hi)}${iv.hiIn ? "]" : ")"}`),
      ...(isolated.length ? [`\\{${isolated.map(numTex).join(", ")}\\}`] : []),
    ];
    // merge duplicate touching intervals like (a,b) ∪ (b,c) stays — correct (b excluded)
    const texAns = parts.length ? parts.join(" \\cup ") : "\\varnothing";
    steps.push(`##Solution Set\n$$${v} \\in ${texAns}$$`);
    const plain = parts.length
      ? [
          ...intervals.map((iv) => `${iv.loIn ? "[" : "("}${iv.lo === -Infinity ? "-∞" : fmt(iv.lo)}, ${iv.hi === Infinity ? "∞" : fmt(iv.hi)}${iv.hiIn ? "]" : ")"}`),
          ...(isolated.length ? [`{${isolated.map((x) => fmt(x)).join(", ")}}`] : []),
        ].join(" ∪ ")
      : "No solution";
    return { roots: [plain], steps, setAnswer: plain, variable: v, graphExpr: `(${Ls}) - (${Rs})`, error: parts.length ? undefined : "No solution" };
  } catch (e) {
    return { roots: [], steps: [], error: e instanceof Error ? e.message : "Couldn't solve this inequality." };
  }
}

// ──────────────────────────── systems ────────────────────────────

interface Frac { n: bigint; d: bigint }
const fr = (n: bigint, d: bigint = 1n): Frac => {
  if (d < 0n) { n = -n; d = -d; }
  const g = gcdBig(n, d) || 1n;
  return { n: n / g, d: d / g };
};
const fSub = (a: Frac, b: Frac) => fr(a.n * b.d - b.n * a.d, a.d * b.d);
const fMul = (a: Frac, b: Frac) => fr(a.n * b.n, a.d * b.d);
const fDiv = (a: Frac, b: Frac) => fr(a.n * b.d, a.d * b.n);
const fZero = (a: Frac) => a.n === 0n;
const fTex = (a: Frac) => (a.d === 1n ? `${a.n}` : a.n < 0n ? `-\\frac{${-a.n}}{${a.d}}` : `\\frac{${a.n}}{${a.d}}`);
const fNum = (a: Frac) => Number(a.n) / Number(a.d);
function numToFrac(x: number): Frac | null {
  const f = toFrac(x, 1000000);
  return f ? fr(BigInt(f[0]), BigInt(f[1])) : null;
}

export function solveSystem(parts: string[], fmt: Fmt): EqResult {
  try {
    const eqs = parts.map((p) => {
      const t = tidy(p).split("=");
      if (t.length !== 2) throw new Error(`"${p}" needs exactly one "=" sign.`);
      return { L: prepSide(t[0]), R: prepSide(t[1]) };
    });
    const nodes = eqs.map((e) => ({ L: parse(e.L), R: parse(e.R) }));
    const vars = [...new Set(nodes.flatMap((n) => [...freeSymbols(n.L), ...freeSymbols(n.R)]))].sort();
    if (vars.length === 0) return { roots: [], steps: [], error: "There are no unknowns in this system." };
    if (vars.length > 6) return { roots: [], steps: [], error: "Up to 6 unknowns are supported in a system." };
    const fns = nodes.map((n) => {
      const code = parse(`(${n.L.toString()}) - (${n.R.toString()})`).compile();
      return (vals: number[]) => {
        const sc: Record<string, number> = {};
        vars.forEach((v, i) => { sc[v] = vals[i]; });
        try { const r = code.evaluate(sc); return typeof r === "number" ? r : NaN; } catch { return NaN; }
      };
    });
    const steps: string[] = [`##Given\n$$\\begin{cases}${eqs.map((e) => `${exprToLatex(e.L)} = ${exprToLatex(e.R)}`).join("\\\\")}\\end{cases}$$`];
    steps.push(`##Unknowns\n$$${vars.join(", \\; ")}$$`);

    // linearity test
    const zero = vars.map(() => 0);
    const coeff: number[][] = [];
    const rhs: number[] = [];
    let linear = true;
    for (const f of fns) {
      const f0 = f(zero);
      if (!Number.isFinite(f0)) { linear = false; break; }
      const row = vars.map((_, j) => { const e = zero.slice(); e[j] = 1; return f(e) - f0; });
      const probes = [vars.map((_, i) => 1.7 + i * 0.9), vars.map((_, i) => -2.3 + i * 1.1), vars.map((_, i) => 0.6 - i * 0.4)];
      for (const pr of probes) {
        const pred = f0 + row.reduce((acc, a, j) => acc + a * pr[j], 0);
        const act = f(pr);
        if (!Number.isFinite(act) || Math.abs(act - pred) > 1e-7 * (1 + Math.abs(act))) { linear = false; break; }
      }
      if (!linear) break;
      coeff.push(row); rhs.push(-f0);
    }

    if (linear) {
      const m: Frac[][] = [];
      for (let i = 0; i < coeff.length; i++) {
        const row: Frac[] = [];
        for (const v of [...coeff[i], rhs[i]]) {
          const q = numToFrac(clean(v));
          if (!q) { linear = false; break; }
          row.push(q);
        }
        if (!linear) break;
        m.push(row);
      }
      if (linear) return solveLinearFrac(m, vars, steps, fmt);
      // fall through to float elimination is unnecessary; use numeric Newton below
    }

    // nonlinear: multi-start Newton
    steps.push(`##Method\nThe system is not linear — solved numerically with Newton's method from many starting points (solutions are approximate).`);
    const nv = vars.length, ne = fns.length;
    const F = (x: number[]) => fns.map((f) => f(x));
    const found: number[][] = [];
    const rand = (() => { let s = 12345; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; })();
    const solveLin = (A: number[][], b: number[]): number[] | null => {
      const n = A.length, mcols = A[0].length;
      const M = A.map((r, i) => [...r, b[i]]);
      const where = new Array(mcols).fill(-1);
      let row = 0;
      for (let col = 0; col < mcols && row < n; col++) {
        let piv = row;
        for (let r = row + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
        if (Math.abs(M[piv][col]) < 1e-12) continue;
        [M[row], M[piv]] = [M[piv], M[row]];
        for (let r = 0; r < n; r++) if (r !== row) {
          const fct = M[r][col] / M[row][col];
          for (let c2 = col; c2 <= mcols; c2++) M[r][c2] -= fct * M[row][c2];
        }
        where[col] = row; row++;
      }
      if (where.some((w) => w === -1)) return null;
      return where.map((w, c2) => M[w][mcols] / M[w][c2]);
    };
    for (let trial = 0; trial < 400 && found.length < 24; trial++) {
      let x = vars.map(() => (rand() - 0.5) * (trial < 200 ? 20 : 200));
      let ok = false;
      for (let it = 0; it < 80; it++) {
        const fx = F(x);
        if (!fx.every(Number.isFinite)) break;
        const norm = Math.hypot(...fx);
        if (norm < 1e-13) { ok = true; break; }
        const J = fns.map((f, i) => x.map((_, j) => {
          const h = 1e-6 * Math.max(1, Math.abs(x[j]));
          const xp = x.slice(); xp[j] += h; const xm = x.slice(); xm[j] -= h;
          return (f(xp) - f(xm)) / (2 * h);
        }));
        let dx: number[] | null;
        if (ne === nv) dx = solveLin(J, fx.map((v) => -v));
        else {
          // least squares: (JᵀJ) dx = -Jᵀ f
          const JT = x.map((_, j) => J.map((r) => r[j]));
          const JTJ = JT.map((r1) => JT.map((r2) => r1.reduce((a, v, k) => a + v * r2[k], 0)));
          dx = solveLin(JTJ, JT.map((r) => -r.reduce((a, v, k) => a + v * fx[k], 0)));
        }
        if (!dx || !dx.every(Number.isFinite)) break;
        let t = 1;
        for (let ls = 0; ls < 20; ls++) {
          const xn = x.map((xi, i) => xi + t * dx![i]);
          const fn = F(xn);
          if (fn.every(Number.isFinite) && Math.hypot(...fn) < norm) { x = xn; break; }
          t /= 2;
          if (ls === 19) x = x.map((xi, i) => xi + t * dx![i]);
        }
      }
      if (ok || Math.hypot(...F(x)) < 1e-9) {
        if (!found.some((s) => s.every((v, i) => Math.abs(v - x[i]) < 1e-6 * (1 + Math.abs(v))))) found.push(x);
      }
    }
    if (!found.length) return { roots: [], steps, error: "No real solution found for this system (it may have only complex solutions, or none)." };
    found.sort((a, b) => a[0] - b[0]);
    const tex = found.map((s, k) => `\\text{(${k + 1}) } ${vars.map((v, i) => `${v} = ${fmt(s[i])}`).join(",\\; ")}`);
    steps.push(`##Solutions\n$$\\begin{array}{l}${tex.join("\\\\")}\\end{array}$$`);
    return { roots: found.map((s) => vars.map((v, i) => `${v} = ${fmt(s[i])}`).join(", ")), steps, setAnswer: "system" };
  } catch (e) {
    return { roots: [], steps: [], error: e instanceof Error ? e.message : "Couldn't solve this system." };
  }
}

function matTex(m: Frac[][], nv: number): string {
  const body = m.map((r) => r.map(fTex).join(" & ")).join("\\\\");
  return `\\left[\\begin{array}{${"c".repeat(nv)}|c}${body}\\end{array}\\right]`;
}

function solveLinearFrac(m: Frac[][], vars: string[], steps: string[], fmt: Fmt): EqResult {
  const nv = vars.length, ne = m.length;
  steps.push(`##Augmented Matrix\n$$${matTex(m, nv)}$$`);
  const pivCols: number[] = [];
  let row = 0;
  for (let col = 0; col < nv && row < ne; col++) {
    let piv = -1;
    for (let r = row; r < ne; r++) if (!fZero(m[r][col])) { piv = r; break; }
    if (piv === -1) continue;
    if (piv !== row) { [m[row], m[piv]] = [m[piv], m[row]]; steps.push(`##Swap Rows\n$R_{${row + 1}} \\leftrightarrow R_{${piv + 1}}$\n$$${matTex(m, nv)}$$`); }
    const p = m[row][col];
    if (!(p.n === 1n && p.d === 1n)) {
      m[row] = m[row].map((v) => fDiv(v, p));
      steps.push(`##Scale Row ${row + 1}\n$$R_{${row + 1}} \\to \\frac{1}{${fTex(p)}}R_{${row + 1}}$$\n$$${matTex(m, nv)}$$`);
    }
    for (let r = 0; r < ne; r++) {
      if (r === row || fZero(m[r][col])) continue;
      const fct = m[r][col];
      m[r] = m[r].map((v, c2) => fSub(v, fMul(fct, m[row][c2])));
      steps.push(`##Eliminate ${vars[col]} from Row ${r + 1}\n$$R_{${r + 1}} \\to R_{${r + 1}} - (${fTex(fct)})R_{${row + 1}}$$\n$$${matTex(m, nv)}$$`);
    }
    pivCols.push(col); row++;
  }
  // inconsistent?
  for (let r = 0; r < ne; r++) {
    if (m[r].slice(0, nv).every(fZero) && !fZero(m[r][nv])) {
      steps.push(`##Inconsistent\n$$0 = ${fTex(m[r][nv])} \\;\\Rightarrow\\; \\text{no solution}$$`);
      return { roots: [], steps, error: "No solution — the equations contradict each other." };
    }
  }
  const free = vars.map((_, i) => i).filter((i) => !pivCols.includes(i));
  if (free.length === 0) {
    const sol = vars.map((_, i) => m[pivCols.indexOf(i)][nv]);
    steps.push(`##Solution\n$$${vars.map((v, i) => `${v} = ${fTex(sol[i])}`).join(",\\quad ")}$$`);
    return { roots: vars.map((v, i) => `${v} = ${fmt(fNum(sol[i]))}`), steps, numericRoots: sol.map(fNum), setAnswer: "system" };
  }
  // infinitely many solutions → parametric
  const names = free.map((i) => vars[i]);
  const expr = vars.map((v, i) => {
    if (free.includes(i)) return `${v} = ${v}\\; \\text{(free)}`;
    const r = m[pivCols.indexOf(i)];
    const tex = fTex(r[nv]);
    const first = fZero(r[nv]);
    let out = first ? "" : tex;
    for (const j of free) {
      if (fZero(r[j])) continue;
      const c = fMul(r[j], fr(-1n));
      const sign = c.n < 0n ? "-" : "+";
      const abs = c.n < 0n ? fr(-c.n, c.d) : c;
      const coef = abs.n === 1n && abs.d === 1n ? "" : `${fTex(abs)}`;
      out += out === "" ? `${sign === "-" ? "-" : ""}${coef}${vars[j]}` : ` ${sign} ${coef}${vars[j]}`;
    }
    return `${v} = ${out || "0"}`;
  });
  steps.push(`##Infinitely Many Solutions\n$$${expr.join(",\\quad ")}$$\nFree variable${names.length > 1 ? "s" : ""}: $${names.join(", ")}$ can be any real number.`);
  return { roots: expr.map((e) => e.replace(/\\text\{\(free\)\}/g, "(free)").replace(/\\frac\{(-?\d+)\}\{(\d+)\}/g, "$1/$2").replace(/\\; /g, " ")), steps, setAnswer: "system-param" };
}

// ──────────────────────────── dispatcher ────────────────────────────

export function solveAny(input: string, fmt: Fmt): EqResult {
  const s = tidy(input.replace(/\n/g, ";"));
  if (!s) return { roots: [], steps: [], error: "Type an equation first, for example x^2 - 5x + 6 = 0." };
  if (/<=|>=|!=|[<>]/.test(s)) {
    if (s.includes("!=")) return { roots: [], steps: [], error: "\"≠\" isn't supported — solve the equation and exclude its solutions." };
    return solveInequality(s, fmt);
  }
  const parts = splitTopLevel(s, [";", ","]);
  if (parts.length >= 2 && parts.every((p) => p.includes("="))) return solveSystem(parts, fmt);
  if (parts.length >= 2) return { roots: [], steps: [], error: "Every part of a system needs an \"=\" sign — write each equation like x + y = 5." };
  return solveEquation(s, fmt);
}

export { fmtSet as _fmtSet };
