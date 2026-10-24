/**
 * Extra matrix operations: trace, scalar multiple, integer power, adjugate,
 * eigenvalues / eigenvectors, and a general A·x = b solver (unique / infinite / none).
 * Every function returns LaTeX steps in the shared `##Title\n$$…$$` format.
 */
import { numTex, rootsOfPolynomial, toFrac } from "./equation-solver";

export type Mat = number[][];
type Fmt = (n: number) => string;

const clean = (v: number) => (Math.abs(v) < 1e-10 ? 0 : Math.round(v * 1e10) / 1e10);

export function matTex(m: Mat): string {
  return `\\begin{bmatrix}${m.map((r) => r.map((v) => numTex(v)).join(" & ")).join("\\\\")}\\end{bmatrix}`;
}

export interface MatOut { text: string; matrix?: Mat; steps: string[] }

const sq = (a: Mat) => { if (a.length !== a[0].length) throw new Error("This operation needs a square matrix (same number of rows and columns)."); };
const mul = (a: Mat, b: Mat): Mat => a.map((r) => b[0].map((_, j) => r.reduce((s, v, k) => s + v * b[k][j], 0)));
const identity = (n: number): Mat => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));

export function det(a: Mat): number {
  const n = a.length;
  const m = a.map((r) => [...r]);
  let d = 1;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    if (Math.abs(m[p][c]) < 1e-14) return 0;
    if (p !== c) { [m[p], m[c]] = [m[c], m[p]]; d = -d; }
    d *= m[c][c];
    for (let r = c + 1; r < n; r++) { const f = m[r][c] / m[c][c]; for (let k = c; k < n; k++) m[r][k] -= f * m[c][k]; }
  }
  return clean(d);
}

export function trace(a: Mat, fmt: Fmt): MatOut {
  sq(a);
  const t = a.reduce((s, r, i) => s + r[i], 0);
  return {
    text: `trace(A) = ${fmt(clean(t))}`,
    steps: [
      `##Given\n$$A = ${matTex(a)}$$`,
      `##Trace = Sum of the Diagonal\n$$\\operatorname{tr}(A) = ${a.map((r, i) => numTex(r[i])).join(" + ")} = ${numTex(clean(t))}$$`,
    ],
  };
}

export function scalarMultiple(a: Mat, k: number): MatOut {
  const r = a.map((row) => row.map((v) => clean(v * k)));
  return {
    text: "",
    matrix: r,
    steps: [`##Given\n$$A = ${matTex(a)}, \\quad k = ${numTex(k)}$$`, `##Multiply Every Entry by $k$\n$$kA = ${matTex(r)}$$`],
  };
}

export function matrixPower(a: Mat, n: number): MatOut {
  sq(a);
  if (!Number.isInteger(n)) throw new Error("The power must be a whole number (0, 1, 2, 3 … or negative for the inverse).");
  if (Math.abs(n) > 30) throw new Error("Use a power between -30 and 30.");
  const size = a.length;
  let base = a.map((r) => [...r]);
  const steps: string[] = [`##Given\n$$A = ${matTex(a)}, \\quad n = ${n}$$`];
  if (n < 0) {
    if (det(a) === 0) throw new Error("A is singular, so A⁻¹ (and negative powers) don't exist.");
    base = invert(a);
    steps.push(`##Negative Power\n$$A^{${n}} = (A^{-1})^{${-n}}, \\qquad A^{-1} = ${matTex(base)}$$`);
  }
  let result = identity(size);
  const e = Math.abs(n);
  for (let i = 1; i <= e; i++) {
    result = mul(result, base).map((r) => r.map(clean));
    if (e <= 6 || i === e) steps.push(`##$${n < 0 ? "A^{-1}" : "A"}^{${i}}$\n$$${matTex(result)}$$`);
  }
  if (e === 0) steps.push(`##Zero Power\n$$A^0 = I$$\n$$${matTex(result)}$$`);
  return { text: "", matrix: result, steps };
}

export function invert(a: Mat): Mat {
  const n = a.length;
  const m = a.map((r, i) => [...r, ...identity(n)[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    if (Math.abs(m[p][c]) < 1e-12) throw new Error("Matrix is singular.");
    [m[p], m[c]] = [m[c], m[p]];
    const pv = m[c][c];
    m[c] = m[c].map((v) => v / pv);
    for (let r = 0; r < n; r++) if (r !== c) { const f = m[r][c]; m[r] = m[r].map((v, k) => v - f * m[c][k]); }
  }
  return m.map((r) => r.slice(n).map(clean));
}

export function adjugate(a: Mat): MatOut {
  sq(a);
  const n = a.length;
  const minor = (r: number, c: number) => a.filter((_, i) => i !== r).map((row) => row.filter((_, j) => j !== c));
  const cof: Mat = a.map((_, i) => a.map((_, j) => (n === 1 ? 1 : clean(((i + j) % 2 === 0 ? 1 : -1) * det(minor(i, j))))));
  const adj = cof[0].map((_, j) => cof.map((r) => r[j]));
  return {
    text: "",
    matrix: adj,
    steps: [
      `##Given\n$$A = ${matTex(a)}$$`,
      `##Cofactor Matrix\n$$C_{ij} = (-1)^{i+j}\\,M_{ij} \\;\\Rightarrow\\; C = ${matTex(cof)}$$`,
      `##Adjugate = Transpose of the Cofactors\n$$\\operatorname{adj}(A) = C^{T} = ${matTex(adj)}$$`,
      `##Useful Check\n$$A\\cdot\\operatorname{adj}(A) = \\det(A)\\,I, \\qquad \\det(A) = ${numTex(det(a))}$$`,
    ],
  };
}

// ── eigen ────────────────────────────────────────────────────────────────────

/** Characteristic polynomial coefficients (ascending, in λ) of det(λI − A), by Faddeev–LeVerrier. */
function charPoly(a: Mat): number[] {
  const n = a.length;
  const coeffs: number[] = new Array(n + 1).fill(0);
  coeffs[n] = 1;
  let M: Mat = identity(n).map((r) => r.map(() => 0));
  const I = identity(n);
  for (let k = 1; k <= n; k++) {
    M = mul(a, M).map((r, i) => r.map((v, j) => v + coeffs[n - k + 1] * I[i][j]));
    const AM = mul(a, M);
    const tr = AM.reduce((s, r, i) => s + r[i], 0);
    coeffs[n - k] = -tr / k;
  }
  return coeffs.map(clean);
}

function nullspace(m: Mat): number[][] {
  const rows = m.length, cols = m[0].length;
  const a = m.map((r) => [...r]);
  const scale = Math.max(1, ...a.flat().map(Math.abs));
  const pivots: number[] = [];
  let row = 0;
  for (let c = 0; c < cols && row < rows; c++) {
    let p = row;
    for (let r = row + 1; r < rows; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    if (Math.abs(a[p][c]) < 1e-8 * scale) continue;
    [a[row], a[p]] = [a[p], a[row]];
    const pv = a[row][c];
    a[row] = a[row].map((v) => v / pv);
    for (let r = 0; r < rows; r++) if (r !== row) { const f = a[r][c]; a[r] = a[r].map((v, k) => v - f * a[row][k]); }
    pivots.push(c); row++;
  }
  const free = Array.from({ length: cols }, (_, i) => i).filter((i) => !pivots.includes(i));
  return free.map((f) => {
    const v = new Array(cols).fill(0);
    v[f] = 1;
    pivots.forEach((pc, r) => { v[pc] = -a[r][f]; });
    // clear denominators so the vector is pretty when it is rational
    const fr = v.map((x) => toFrac(clean(x), 1000));
    if (fr.every(Boolean)) {
      let l = 1;
      fr.forEach((q) => { const d = q![1]; l = (l * d) / gcd(l, d); });
      const sc = v.map((x) => clean(x * l));
      const g = sc.reduce((acc, x) => gcd(acc, Math.abs(x)), 0) || 1;
      return sc.map((x) => clean(x / g));
    }
    return v.map(clean);
  });
}
const gcd = (a: number, b: number): number => { a = Math.round(a); b = Math.round(b); while (b) { [a, b] = [b, a % b]; } return Math.abs(a); };

export function eigen(a: Mat, fmt: Fmt): MatOut {
  sq(a);
  const n = a.length;
  if (n > 5) throw new Error("Eigenvalues are supported up to 5×5.");
  const cp = charPoly(a);
  const polyTex = cp.map((c, i) => ({ c, i })).reverse().filter((t) => t.c !== 0)
    .map((t, idx) => { const sign = t.c < 0 ? "-" : idx === 0 ? "" : "+"; const abs = Math.abs(t.c); const co = abs === 1 && t.i > 0 ? "" : numTex(abs); const lam = t.i === 0 ? "" : t.i === 1 ? "\\lambda" : `\\lambda^{${t.i}}`; return `${sign}${co}${lam}`; }).join(" ");
  const steps: string[] = [`##Given\n$$A = ${matTex(a)}$$`];
  steps.push(`##Characteristic Equation\n$$\\det(A - \\lambda I) = 0 \\;\\Rightarrow\\; ${polyTex} = 0$$`);
  const roots = rootsOfPolynomial(cp);
  const lines: string[] = [];
  const evTex: string[] = [];
  roots.forEach((r) => {
    const complex = Math.abs(r.im) > 1e-9;
    const lam = complex ? `${fmt(r.re)} ${r.im < 0 ? "-" : "+"} ${fmt(Math.abs(r.im))}i` : fmt(r.re);
    evTex.push(`\\lambda = ${lam}${r.mult > 1 ? `\\ (\\times ${r.mult})` : ""}`);
    lines.push(`λ = ${lam}${r.mult > 1 ? ` (multiplicity ${r.mult})` : ""}`);
  });
  steps.push(`##Eigenvalues\n$$${evTex.join(",\\quad ")}$$`);
  const vecLines: string[] = [];
  roots.filter((r) => Math.abs(r.im) <= 1e-9).forEach((r) => {
    const shifted = a.map((row, i) => row.map((v, j) => v - (i === j ? r.re : 0)));
    const basis = nullspace(shifted);
    if (!basis.length) return;
    steps.push(`##Eigenvectors for $\\lambda = ${numTex(r.re)}$\n$$(A - ${numTex(r.re)}I)\\,\\vec{v} = \\vec{0}, \\qquad A - ${numTex(r.re)}I = ${matTex(shifted.map((rr) => rr.map(clean)))}$$\n$$${basis.map((v) => `\\vec{v} = \\begin{bmatrix}${v.map((x) => numTex(x)).join("\\\\")}\\end{bmatrix}`).join(",\\qquad ")}$$`);
    basis.forEach((v) => vecLines.push(`v for λ=${fmt(r.re)}: (${v.map((x) => fmt(x)).join(", ")})`));
  });
  if (roots.some((r) => Math.abs(r.im) > 1e-9)) steps.push(`##Complex Eigenvalues\nThe complex eigenvalues come in conjugate pairs; their eigenvectors are complex too and are not shown.`);
  const sum = roots.reduce((s, r) => s + r.re * r.mult, 0);
  steps.push(`##Quick Check\n$$\\textstyle\\sum\\lambda = \\operatorname{tr}(A) = ${numTex(clean(a.reduce((s, r, i) => s + r[i], 0)))}, \\qquad \\prod\\lambda = \\det(A) = ${numTex(det(a))}$$`);
  void sum;
  return { text: [...lines, ...vecLines].join("\n"), steps };
}

// ── general A x = b ──────────────────────────────────────────────────────────

export function solveSystemGeneral(a: Mat, b: number[], fmt: Fmt): MatOut {
  const rows = a.length, cols = a[0].length;
  const m = a.map((r, i) => [...r, b[i]]);
  const steps: string[] = [`##System\n$$A\\vec{x} = \\vec{b}, \\qquad A = ${matTex(a)}, \\quad \\vec{b} = ${matTex(b.map((v) => [v]))}$$`, `##Augmented Matrix\n$$[A \\mid b] = ${matTex(m)}$$`];
  const pivots: number[] = [];
  let row = 0;
  for (let c = 0; c < cols && row < rows; c++) {
    let p = row;
    for (let r = row + 1; r < rows; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    if (Math.abs(m[p][c]) < 1e-10) continue;
    if (p !== row) { [m[p], m[row]] = [m[row], m[p]]; steps.push(`##Swap $R_{${row + 1}} \\leftrightarrow R_{${p + 1}}$\n$$${matTex(m.map((r) => r.map(clean)))}$$`); }
    const pv = m[row][c];
    if (Math.abs(pv - 1) > 1e-12) { m[row] = m[row].map((v) => v / pv); steps.push(`##$R_{${row + 1}} \\to \\frac{1}{${numTex(pv)}}R_{${row + 1}}$\n$$${matTex(m.map((r) => r.map(clean)))}$$`); }
    for (let r = 0; r < rows; r++) if (r !== row && Math.abs(m[r][c]) > 1e-12) {
      const f = m[r][c];
      m[r] = m[r].map((v, k) => v - f * m[row][k]);
      steps.push(`##$R_{${r + 1}} \\to R_{${r + 1}} - (${numTex(clean(f))})R_{${row + 1}}$\n$$${matTex(m.map((x) => x.map(clean)))}$$`);
    }
    pivots.push(c); row++;
  }
  for (let r = 0; r < rows; r++) {
    if (m[r].slice(0, cols).every((v) => Math.abs(v) < 1e-10) && Math.abs(m[r][cols]) > 1e-9) {
      steps.push(`##Inconsistent\n$$0 = ${numTex(clean(m[r][cols]))} \\;\\Rightarrow\\; \\text{no solution}$$`);
      return { text: "No solution (the system is inconsistent)", steps };
    }
  }
  const free = Array.from({ length: cols }, (_, i) => i).filter((i) => !pivots.includes(i));
  if (!free.length) {
    const x = pivots.map((_, r) => clean(m[r][cols]));
    steps.push(`##Unique Solution\n$$${x.map((v, i) => `x_{${i + 1}} = ${numTex(v)}`).join(",\\quad ")}$$`);
    return { text: x.map((v, i) => `x${i + 1} = ${fmt(v)}`).join("\n"), steps };
  }
  const lines = Array.from({ length: cols }, (_, i) => {
    if (free.includes(i)) return `x${i + 1} = free`;
    const r = pivots.indexOf(i);
    let out = fmt(clean(m[r][cols]));
    for (const f of free) { const c = clean(-m[r][f]); if (c !== 0) out += ` ${c < 0 ? "-" : "+"} ${Math.abs(c) === 1 ? "" : fmt(Math.abs(c)) + "·"}x${f + 1}`; }
    return `x${i + 1} = ${out}`;
  });
  steps.push(`##Infinitely Many Solutions\nFree variable${free.length > 1 ? "s" : ""}: ${free.map((f) => `$x_{${f + 1}}$`).join(", ")} (any real number).\n$$\\operatorname{rank}(A) = ${pivots.length} < ${cols}$$`);
  return { text: lines.join("\n"), steps };
}
