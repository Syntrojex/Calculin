/**
 * Shared helpers for every graph in the app:
 *  - makeEvaluator(): compile an expression once → fast numeric function
 *  - findRoots() / findIntersections(): zero crossings that ignore poles
 *  - explainBadExpression(): turns "why can't this be plotted" into a clear message
 *  - validate2D / validateSurface / validateImplicitSurface: a plot is only drawn if the
 *    function really has real values in the window — otherwise the user gets a proper
 *    explanation instead of an empty or misleading picture.
 */
import { evaluate as mjEvaluate, parse as mjParse, type MathNode } from "mathjs";
import { cleanExpression, cleanVariable, findUnknownFunctionNames } from "./expression-clean";
import { realParse } from "./real-parse";
import { checkExpression } from "./input-check";

export type NumFn = (x: number) => number;

const CONSTANTS = new Set(["pi", "e", "tau", "Infinity", "NaN"]);

/** Names of functions in the parse tree that mathjs does not know. */
function unknownFunctions(node: MathNode): string[] {
  const names = new Set<string>();
  node.traverse((n: MathNode) => {
    if (n.type === "FunctionNode") {
      const fn = (n as unknown as { fn: { name?: string } }).fn;
      if (fn?.name) names.add(fn.name);
    }
  });
  const bad: string[] = [];
  for (const nm of names) {
    try {
      const v = mjEvaluate(nm);
      if (typeof v !== "function") bad.push(nm);
    } catch { bad.push(nm); }
  }
  return bad;
}

function freeSymbols(node: MathNode): string[] {
  const out = new Set<string>();
  node.traverse((n: MathNode, path: string) => {
    if (n.type !== "SymbolNode" || path === "fn") return;
    const name = (n as unknown as { name: string }).name;
    if (!CONSTANTS.has(name)) out.add(name);
  });
  return [...out];
}

/** Compile `expr` into a numeric function of the given variables (non-real → NaN). */
export function makeEvaluatorN(expr: string, vars: string[]): ((...xs: number[]) => number) | null {
  try {
    const code = realParse(expr).compile();
    const scope: Record<string, number> = {};
    return (...xs: number[]) => {
      vars.forEach((v, i) => { scope[v] = xs[i]; });
      try {
        const r = code.evaluate(scope);
        return typeof r === "number" ? r : NaN;
      } catch { return NaN; }
    };
  } catch { return null; }
}

export function makeEvaluator(expr: string, variable: string): NumFn | null {
  const f = makeEvaluatorN(expr, [cleanVariable(variable)]);
  return f ? (x) => f(x) : null;
}

/** Zeros of f on [lo, hi]. Sign changes across a pole (1/x at 0, tan) are NOT zeros. */
export function findRoots(f: NumFn, lo: number, hi: number, samples = 2400): number[] {
  if (!(hi > lo)) return [];
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i <= samples; i++) {
    const x = lo + ((hi - lo) * i) / samples;
    xs.push(x);
    ys.push(f(x));
  }
  const finite = ys.filter(Number.isFinite).map(Math.abs).sort((a, b) => a - b);
  const typical = finite.length ? finite[Math.floor(finite.length * 0.5)] : 1;
  const scale = Math.max(typical, 1e-9);
  const roots: number[] = [];
  const push = (r: number) => { if (!roots.some((q) => Math.abs(q - r) < (hi - lo) * 1e-6)) roots.push(r); };
  for (let i = 0; i < samples; i++) {
    const a = ys[i], b = ys[i + 1];
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    if (a === 0) { push(xs[i]); continue; }
    if ((a < 0 && b > 0) || (a > 0 && b < 0)) {
      let l = xs[i], r = xs[i + 1], fl = a;
      for (let k = 0; k < 60; k++) {
        const m = 0.5 * (l + r);
        const fm = f(m);
        if (!Number.isFinite(fm)) break;
        if ((fm < 0) === (fl < 0)) { l = m; fl = fm; } else r = m;
      }
      const x = 0.5 * (l + r);
      const fx = f(x);
      // a real root has |f| tiny at the bracket; a pole keeps |f| large
      if (Number.isFinite(fx) && Math.abs(fx) <= 1e-6 * (1 + scale) + 1e-9) push(x);
    }
  }
  const last = ys[samples];
  if (last === 0) push(xs[samples]);
  return roots.sort((p, q) => p - q);
}

export function findIntersections(f: NumFn, g: NumFn, lo: number, hi: number): { x: number; y: number }[] {
  const d: NumFn = (x) => f(x) - g(x);
  return findRoots(d, lo, hi).map((x) => ({ x, y: f(x) })).filter((p) => Number.isFinite(p.y));
}

// ── explanations ──────────────────────────────────────────────────────────────

function syntaxProblem(raw: string): string | null {
  const s = raw.trim();
  if (!s) return "Type a function first (for example x^2, sin(x) or 1/x).";
  let depth = 0;
  for (const ch of s) {
    if (ch === "(") depth++;
    else if (ch === ")") { depth--; if (depth < 0) return "There is a closing bracket ) with no matching opening bracket (."; }
  }
  if (depth > 0) return "A bracket ( is never closed — add the missing ).";
  return null;
}

/** null if the string is a readable expression whose only free symbol(s) are `allowed` (+ constants). */
export function explainBadExpression(raw: string, allowed: string[], what = "graph"): { node: MathNode | null; message: string | null; expr: string } {
  { const typed = checkExpression(raw, { what: "a function" }); if (typed) return { node: null, message: typed, expr: "" }; }
  const early = syntaxProblem(raw);
  if (early) return { node: null, message: early, expr: raw };
  const unknownRaw = findUnknownFunctionNames(raw);
  if (unknownRaw.length) {
    return { node: null, message: `Unknown function${unknownRaw.length > 1 ? "s" : ""} "${unknownRaw.join(", ")}" — supported ones include sin, cos, tan, asin, acos, atan, sinh, cosh, tanh, ln, log, sqrt, abs, exp, floor, ceil.`, expr: raw };
  }
  const expr = cleanExpression(raw);
  if (!expr) return { node: null, message: "Type a function first (for example x^2, sin(x) or 1/x).", expr };
  if (/[+\-*/^]$/.test(expr.trim())) return { node: null, message: "The expression ends with an operator — it looks unfinished.", expr };
  if (/[*/^]\s*[*/^]/.test(expr)) return { node: null, message: "Two operators are in a row (like ** or /*) — check the expression.", expr };
  let node: MathNode;
  try { node = mjParse(expr); } catch {
    return { node: null, message: "I couldn't read that expression — check brackets, operators and spelling (e.g. x^2, 2*x + 1, sin(x)).", expr };
  }
  const badFns = unknownFunctions(node);
  if (badFns.length) {
    return { node, message: `Unknown function${badFns.length > 1 ? "s" : ""} "${badFns.join(", ")}" — supported ones include sin, cos, tan, asin, acos, atan, sinh, cosh, tanh, ln, log, sqrt, abs, exp, floor, ceil.`, expr };
  }
  const extra = freeSymbols(node).filter((s) => !allowed.includes(s));
  if (extra.length) {
    const polarHint = what === "surface" && extra.some((v) => ["r", "theta", "rho", "phi", "t", "u", "v"].includes(v))
      ? " For r, θ, ρ, φ or parameters like t, u, v, use the Parametric / Polar tab." : "";
    return { node, message: `This ${what} can only use ${allowed.join(", ")} (and constants like pi, e), but it also contains "${extra.join(", ")}".${polarHint}`, expr };
  }
  return { node, message: null, expr };
}

interface Tally { finite: number; nan: number; complex: number; inf: number; total: number; min: number; max: number }

function describeEmpty(t: Tally, region: string): string {
  if (t.complex > 0 && t.finite === 0) return `This function has no real values ${region} — it only produces complex numbers there (for example sqrt or ln of a negative number). Try a different range or a different function.`;
  if (t.inf > 0 && t.finite === 0) return `This function is infinite or undefined everywhere ${region} (for example a division by zero). Try a different function.`;
  return `This function has no real values ${region}. Try a different range or check the formula.`;
}

function tally(f: (...xs: number[]) => number, raw: (...xs: number[]) => unknown, points: number[][]): Tally {
  void f;
  const t: Tally = { finite: 0, nan: 0, complex: 0, inf: 0, total: 0, min: Infinity, max: -Infinity };
  for (const p of points) {
    t.total++;
    let v: unknown;
    try { v = raw(...p); } catch { t.nan++; continue; }
    if (typeof v === "number") {
      if (Number.isFinite(v)) { t.finite++; t.min = Math.min(t.min, v); t.max = Math.max(t.max, v); }
      else if (Number.isNaN(v)) t.nan++;
      else t.inf++;
    } else if (v && typeof v === "object") t.complex++;
    else t.nan++;
  }
  return t;
}

function rawEvaluator(expr: string, vars: string[]): (...xs: number[]) => unknown {
  const code = mjParse(expr).compile();
  const scope: Record<string, number> = {};
  return (...xs: number[]) => { vars.forEach((v, i) => { scope[v] = xs[i]; }); return code.evaluate(scope); };
}

function checkRange(lo: number, hi: number): string | null {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return "The range must be real numbers.";
  if (Math.abs(lo) > 1e9 || Math.abs(hi) > 1e9) return "That range is too large to draw — keep it within ±1,000,000,000.";
  return null;
}

/** y = f(x). Returns an explanation if it can't be plotted over [lo, hi], else null. */
export function validate2D(raw: string, variable: string, lo: number, hi: number): string | null {
  const v = cleanVariable(variable);
  const r = checkRange(lo, hi);
  if (r) return r;
  const { message, expr } = explainBadExpression(raw, [v], "graph");
  if (message) return message;
  const ev = rawEvaluator(expr, [v]);
  const pts: number[][] = [];
  for (let i = 0; i <= 400; i++) pts.push([lo + ((hi - lo) * i) / 400]);
  const t = tally(() => 0, ev, pts);
  if (t.finite === 0) return describeEmpty(t, `between ${fmt(lo)} and ${fmt(hi)}`);
  return null;
}

/** z = f(x, y) over [-R, R]². */
export function validateSurface(raw: string, range: number): string | null {
  const r = checkRange(-range, range);
  if (r) return r;
  const { message, expr } = explainBadExpression(raw, ["x", "y"], "surface");
  if (message) return message;
  const ev = rawEvaluator(expr, ["x", "y"]);
  const pts: number[][] = [];
  const N = 24;
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) pts.push([-range + (2 * range * i) / N, -range + (2 * range * j) / N]);
  const t = tally(() => 0, ev, pts);
  if (t.finite === 0) return describeEmpty(t, `on [−${fmt(range)}, ${fmt(range)}] × [−${fmt(range)}, ${fmt(range)}]`);
  if (t.max - t.min < 1e-12 && t.finite > 0 && !/[xy]/.test(expr)) return null;
  return null;
}

/** F(x, y, z) = 0 over [-R, R]³: must be real and actually cross zero to show a surface. */
export function validateImplicitSurface(raw: string, vars: string[], range: number): string | null {
  const r = checkRange(-range, range);
  if (r) return r;
  const { message, expr } = explainBadExpression(raw, vars, "surface");
  if (message) return message;
  const ev = rawEvaluator(expr, vars);
  const pts: number[][] = [];
  const N = 22;
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) for (let k = 0; k <= N; k++) {
    pts.push([-range + (2 * range * i) / N, -range + (2 * range * j) / N, -range + (2 * range * k) / N]);
  }
  const t = tally(() => 0, ev, pts);
  if (t.finite === 0) return describeEmpty(t, `inside the box [−${fmt(range)}, ${fmt(range)}]³`);
  if (!(t.min <= 0 && t.max >= 0)) {
    return `The equation never holds inside the box [−${fmt(range)}, ${fmt(range)}]³ — the expression stays ${t.min > 0 ? "positive" : "negative"} there, so there is no surface to draw. Try a larger range or check the equation.`;
  }
  return null;
}

function fmt(n: number): string {
  return String(parseFloat(n.toPrecision(6)));
}
