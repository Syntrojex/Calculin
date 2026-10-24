/**
 * Limit engine.
 *
 * 1. A robust numerical estimator decides the TRUTH: it extrapolates the
 *    function towards the target with Richardson/Aitken acceleration,
 *    recognises divergence to ±∞, oscillation and one-sided / undefined
 *    behaviour, and snaps the result to a closed form (π/2, e, 1/2 …).
 * 2. The textbook narration is then chosen to match that truth: direct
 *    substitution, L'Hôpital's rule for 0/0 and ∞/∞, the degree rule for
 *    rational functions at ±∞ — and a table of values when none applies.
 *    A narration is only shown if it agrees with the numerical result.
 */
import { derivative, evaluate, parse as mjParse, simplify, type MathNode } from "mathjs";
import { cleanExpression, cleanVariable, parseNumericInput, findUnknownFunctionNames } from "./expression-clean";
import { exprToLatex } from "./latex";
import { recognizeConstant } from "./numeric-integrate";
import { polyDeg, polyFromNode } from "./math-solver";

export type LimitSide = "two-sided" | "left" | "right";

export interface LimitResult {
  value: string;
  steps: string[];
  error?: string;
  numericValue?: number;
  exactText?: string;
  exactTex?: string;
  /** "finite" | "infinite" (±∞) | "dne" */
  kind?: "finite" | "infinite" | "dne";
  /** Where the variable is heading (finite number, or ±Infinity). */
  approachValue?: number;
  /** The limit as a number (finite or ±Infinity) when it exists. */
  limitValue?: number;
}

type Side = "left" | "right";
type OneSided =
  | { kind: "finite"; value: number; err: number }
  | { kind: "inf"; sign: 1 | -1 }
  | { kind: "oscillates" }
  | { kind: "undefined" };

const KNOWN = new Set(["pi", "e", "tau", "Infinity", "NaN"]);

function symbolsOtherThan(node: MathNode, variable: string): string[] {
  const bad = new Set<string>();
  node.traverse((n: MathNode, path: string) => {
    if (n.type !== "SymbolNode" || path === "fn") return;
    const name = (n as unknown as { name: string }).name;
    if (name !== variable && !KNOWN.has(name)) bad.add(name);
  });
  return [...bad];
}

function compile(node: MathNode, variable: string): (x: number) => number {
  const code = node.compile();
  return (x: number) => {
    try {
      const r = code.evaluate({ [variable]: x });
      return typeof r === "number" ? r : NaN;
    } catch { return NaN; }
  };
}

/** Estimate lim_{h→0+} g(h) for g defined on h>0, by Richardson + Aitken on h = 2^-k. */
function estimateAtZero(g: (h: number) => number): OneSided {
  const ks: number[] = [];
  const vs: number[] = [];
  for (let k = 3; k <= 26; k++) {
    const h = Math.pow(2, -k);
    const v = g(h);
    ks.push(k);
    vs.push(v);
  }
  const nanCount = vs.filter((v) => Number.isNaN(v)).length;
  if (nanCount > vs.length * 0.5) return { kind: "undefined" };

  // divergence: same sign, monotone, and not levelling off
  const tail = vs.slice(-8);
  const sameSign = tail.every((v) => !Number.isNaN(v) && v !== 0 && Math.sign(v) === Math.sign(tail[0]));
  if (sameSign) {
    const mags = tail.map(Math.abs);
    const growing = mags.every((m, i) => i === 0 || m >= mags[i - 1]);
    const fast = mags.every((m, i) => i === 0 || m >= mags[i - 1] * 1.2) && mags[mags.length - 1] > 1e4;
    const incs = mags.slice(1).map((m, i) => m - mags[i]);
    const notShrinking = Number.isFinite(incs[incs.length - 1]) && incs[incs.length - 1] > 0.8 * incs[incs.length - 2] && incs[incs.length - 1] > 0.05;
    if ((fast || (growing && notShrinking && mags[mags.length - 1] > 8)) || mags[mags.length - 1] === Infinity) {
      return { kind: "inf", sign: tail[0] > 0 ? 1 : -1 };
    }
  }

  // Richardson table on h_k = 2^-k  (error expansion in integer powers of h)
  const N = vs.length;
  let best = { value: vs[N - 1], err: Infinity };
  const T: number[][] = [];
  for (let i = 0; i < N; i++) {
    T[i] = [vs[i]];
    for (let j = 1; j <= Math.min(i, 7); j++) {
      const f = Math.pow(2, j);
      T[i][j] = (f * T[i][j - 1] - T[i - 1][j - 1]) / (f - 1);
      const err = Math.abs(T[i][j] - T[i][j - 1]) + Math.abs(T[i][j] - T[i - 1][j - 1]);
      if (Number.isFinite(err) && err < best.err && i >= 4) best = { value: T[i][j], err };
    }
  }
  // Aitken Δ² on the raw tail (handles h^(1/2)-type approach)
  let aitken = { value: NaN, err: Infinity };
  for (let i = 2; i < N - 6; i++) {
    const [a, b, c] = [vs[i], vs[i + 1], vs[i + 2]];
    const d2 = c - 2 * b + a;
    if (Math.abs(d2) < 1e-300) continue;
    const val = c - ((c - b) * (c - b)) / d2;
    const [a2, b2, c2] = [vs[i + 1], vs[i + 2], vs[i + 3]];
    const d22 = c2 - 2 * b2 + a2;
    if (Math.abs(d22) < 1e-300) continue;
    const val2 = c2 - ((c2 - b2) * (c2 - b2)) / d22;
    const err = Math.abs(val - val2);
    if (Number.isFinite(err) && err < aitken.err) aitken = { value: val2, err };
  }
  let est = best;
  if (aitken.err < best.err * 0.5 && Number.isFinite(aitken.value)) est = aitken;

  // the estimate must agree with where the sequence is actually heading
  const last = vs[N - 9] ?? vs[N - 1];
  const scale = 1 + Math.abs(est.value);
  const spread = Math.max(...vs.slice(-14, -4)) - Math.min(...vs.slice(-14, -4));
  if (!Number.isFinite(est.value) || !Number.isFinite(est.err)) return { kind: "oscillates" };
  if (est.err > 1e-5 * scale && spread > 1e-3 * scale) {
    // no convergence: check for oscillation (sign flips of the differences)
    const diffs = vs.slice(-12).map((v, i, arr) => (i ? v - arr[i - 1] : 0)).slice(1);
    const flips = diffs.filter((d, i) => i && Math.sign(d) !== Math.sign(diffs[i - 1])).length;
    if (flips >= 3) return { kind: "oscillates" };
  }
  void last;
  // slowly-decaying-to-zero behaviour (e.g. ln(x)/√x): the extrapolation can land on a tiny non-zero value
  const decay = vs.slice(-8).map(Math.abs);
  const monotoneDown = decay.every((m, i) => i === 0 || m <= decay[i - 1] * 1.0001);
  if (Math.abs(est.value) < 2e-3 && monotoneDown && decay[decay.length - 1] < 5e-2) return { kind: "finite", value: 0, err: decay[decay.length - 1] };
  return { kind: "finite", value: est.value, err: Math.max(est.err, 1e-13 * scale) };
}

function estimateOneSided(f: (x: number) => number, a: number, side: Side): OneSided {
  if (a === Infinity || a === -Infinity) {
    // x → ±∞  ⇔  t = 1/x → 0±
    const sgn = a === Infinity ? 1 : -1;
    return estimateAtZero((t) => f(sgn / t));
  }
  const dir = side === "right" ? 1 : -1;
  return estimateAtZero((h) => f(a + dir * h));
}

function describeSide(r: OneSided): string {
  if (r.kind === "finite") return `${r.value}`;
  if (r.kind === "inf") return r.sign > 0 ? "+∞" : "-∞";
  if (r.kind === "oscillates") return "oscillates";
  return "undefined";
}

export function solveLimit(
  exprIn: string,
  variableIn: string,
  approachingIn: string,
  side: LimitSide,
  fmt: (n: number) => string,
): LimitResult {
  try {
    const unknownFns = findUnknownFunctionNames(exprIn);
    if (unknownFns.length) return { value: "", steps: [], error: `Unknown function${unknownFns.length > 1 ? "s" : ""} "${unknownFns.join(", ")}" — supported ones include sin, cos, tan, asin, acos, atan, sinh, cosh, tanh, ln, log, sqrt, abs, exp, floor, ceil.` };
    const expr = cleanExpression(exprIn);
    if (!expr) return { value: "", steps: [], error: "Please enter a function." };
    const variable = cleanVariable(variableIn);
    const trimmed = (approachingIn ?? "").trim();
    if (!trimmed) return { value: "", steps: [], error: "Please enter the value the variable approaches (a number, pi/2, inf, -inf …)." };
    const a = parseNumericInput(trimmed);
    if (Number.isNaN(a)) return { value: "", steps: [], error: `"${approachingIn}" isn't a valid value to approach — use a number, an expression like pi/2, or inf / -inf.` };

    let node: MathNode;
    try { node = mjParse(expr); } catch { return { value: "", steps: [], error: "I couldn't read that function. Please check it for typos and balanced parentheses." }; }
    const extra = symbolsOtherThan(node, variable);
    if (extra.length) return { value: "", steps: [], error: `Unknown symbol${extra.length > 1 ? "s" : ""} "${extra.join(", ")}". The function can only use ${variable} (and constants like pi, e).` };
    if (/[+\-*/^]$/.test(expr.trim())) return { value: "", steps: [], error: "The expression looks incomplete — it ends with an operator." };

    const f = compile(node, variable);
    const atInf = !Number.isFinite(a);
    const effSide: LimitSide = atInf ? "two-sided" : side;
    const aTex = atInf ? (a > 0 ? "\\infty" : "-\\infty") : (/^[-+]?\d+(\.\d+)?$/.test(cleanExpression(trimmed)) ? String(a) : exprToLatex(cleanExpression(trimmed)));
    const sideSuffix = effSide === "left" ? "^-" : effSide === "right" ? "^+" : "";
    const header = `\\lim_{${variable}\\to ${aTex}${sideSuffix}} ${exprToLatex(expr)}`;
    const steps: string[] = [`##Given\n$$${header}$$`];

    const num = (v: number) => (Number.isNaN(v) ? "\\text{undef}" : v === Infinity ? "\\infty" : v === -Infinity ? "-\\infty" : fmt(v).replace(/∞/g, "\\infty"));
    const xv = (v: number) => String(parseFloat(v.toPrecision(10)));
    const table = (label: string, xs: number[], ys: number[]) =>
      `$$\\begin{array}{c|${"c".repeat(xs.length)}} ${label} & ${xs.map(xv).join(" & ")} \\\\ \\hline f(${variable}) & ${ys.map(num).join(" & ")} \\end{array}$$`;
    const lhs = (sg: "-" | "+") => `\\lim_{${variable}\\to ${aTex}^${sg}} f(${variable})`;

    // ── 1. the numerical truth ────────────────────────────────────────────────
    const sides: Side[] = effSide === "two-sided" ? (atInf ? ["right"] : ["left", "right"]) : [effSide];
    const est: Partial<Record<Side, OneSided>> = {};
    for (const sd of sides) est[sd] = estimateOneSided(f, a, sd);
    const L = est.left;
    const R = est.right;
    const only = est[sides[0]]!;

    type Verdict = { kind: "finite"; value: number; err: number } | { kind: "inf"; sign: 1 | -1 } | { kind: "dne"; why: string };
    let verdict: Verdict;
    let oneSidedNote: "left" | "right" | null = null;
    const tolFor = (e: { err: number; value: number }) => Math.max(1e-7, 20 * e.err) * (1 + Math.abs(e.value));
    if (effSide === "two-sided" && !atInf) {
      if (L!.kind === "finite" && R!.kind === "finite") {
        verdict = Math.abs(L!.value - R!.value) <= Math.max(tolFor(L!), tolFor(R!))
          ? { kind: "finite", value: (L!.value + R!.value) / 2, err: Math.max(L!.err, R!.err) }
          : { kind: "dne", why: "differ" };
      } else if (L!.kind === "inf" && R!.kind === "inf") {
        verdict = L!.sign === R!.sign ? { kind: "inf", sign: L!.sign } : { kind: "dne", why: "opposite" };
      } else if ((L!.kind === "undefined") !== (R!.kind === "undefined") && !(L!.kind === "undefined" && R!.kind === "undefined")) {
        // f only exists on one side of a (e.g. x·ln x at 0, x^x at 0): use the side where it is defined
        const ok = (L!.kind === "undefined" ? R! : L!) as OneSided;
        if (ok.kind === "finite") verdict = { kind: "finite", value: ok.value, err: ok.err };
        else if (ok.kind === "inf") verdict = { kind: "inf", sign: ok.sign };
        else verdict = { kind: "dne", why: "oscillates" };
        oneSidedNote = L!.kind === "undefined" ? "right" : "left";
      } else if (L!.kind === "undefined" || R!.kind === "undefined") verdict = { kind: "dne", why: "undefined" };
      else verdict = { kind: "dne", why: L!.kind === "oscillates" || R!.kind === "oscillates" ? "oscillates" : "mixed" };
    } else {
      if (only.kind === "finite") verdict = { kind: "finite", value: only.value, err: only.err };
      else if (only.kind === "inf") verdict = { kind: "inf", sign: only.sign };
      else verdict = { kind: "dne", why: only.kind === "undefined" ? "undefined" : "oscillates" };
    }

    // snap to a clean value
    let value = verdict.kind === "finite" ? verdict.value : NaN;
    let exact: { tex: string; text: string } | null = null;
    if (verdict.kind === "finite") {
      const tol = Math.min(Math.max(verdict.err * 20, 1e-9), 1e-6);
      exact = recognizeConstant(value, tol, 120);
      if (exact) {
        const snapped = Number(evaluateRecognized(exact.text));
        if (Number.isFinite(snapped) && Math.abs(snapped - value) <= tol * (1 + Math.abs(value))) value = snapped;
      }
      if (Math.abs(value) < 1e-9) value = 0;
    }

    // ── 2. choose a narration that matches the truth ──────────────────────────
    const op = unwrap(node);
    const sameValue = (v: number) => verdict.kind === "finite" && Number.isFinite(v) && Math.abs(v - value) <= Math.max(1e-6, tolFor({ err: verdict.err, value }));
    let narrated = false;

    if (!atInf && verdict.kind === "finite") {
      // direct substitution
      let fa = f(a);
      if (!Number.isFinite(fa) && effSide !== "two-sided") fa = NaN;
      const numDen = splitFraction(op);
      if (Number.isFinite(fa) && sameValue(fa)) {
        steps.push(`##Direct Substitution\n$$f(${aTex}) = ${num(fa)}$$`);
        steps.push(`##Continuous at ${variable} = ${aTex}\n$$${header} = f(${aTex}) = ${exact ? exact.tex : num(value)}$$`);
        narrated = true;
      } else if (numDen) {
        const nf = compile(numDen.num, variable);
        const df = compile(numDen.den, variable);
        const n0 = nf(a), d0 = df(a);
        if (Math.abs(n0) < 1e-9 && Math.abs(d0) < 1e-9) {
          steps.push(`##Direct Substitution\n$$\\frac{N(${aTex})}{D(${aTex})} = \\frac{0}{0}\\quad\\text{(indeterminate)}$$`);
          let N = numDen.num, D = numDen.den;
          for (let i = 1; i <= 4; i++) {
            let N1: MathNode, D1: MathNode;
            try { N1 = simplify(derivative(N, variable)); D1 = simplify(derivative(D, variable)); } catch { break; }
            const n1 = compile(N1, variable)(a), d1 = compile(D1, variable)(a);
            steps.push(`##L'Hôpital's Rule${i > 1 ? ` (again)` : ""}\n$$${header.replace(exprToLatex(expr), "")}\\frac{${exprToLatex(N1.toString())}}{${exprToLatex(D1.toString())}}$$\n$$\\frac{${num(n1)}}{${num(d1)}}$$`);
            if (Number.isFinite(n1) && Number.isFinite(d1) && Math.abs(d1) > 1e-9) {
              const lv = n1 / d1;
              if (sameValue(lv)) { steps.push(`##Result\n$$${header} = ${exact ? exact.tex : num(value)}$$`); narrated = true; }
              break;
            }
            if (Math.abs(n1) < 1e-9 && Math.abs(d1) < 1e-9) { N = N1; D = D1; continue; }
            break;
          }
          if (!narrated) steps.length = 1;
        }
      }
    } else if (atInf && verdict.kind !== "dne") {
      const numDen = splitFraction(op);
      const P = numDen ? polyFromNode(numDen.num, variable) : null;
      const Q = numDen ? polyFromNode(numDen.den, variable) : null;
      if (P && Q && polyDeg(Q) >= 0) {
        const dp = polyDeg(P), dq = polyDeg(Q);
        const lp = P[P.length - 1], lq = Q[Q.length - 1];
        const lead = dp < dq ? 0 : dp === dq ? lp / lq : (lp / lq) * (a < 0 && (dp - dq) % 2 === 1 ? -1 : 1) * Infinity;
        steps.push(`##Compare Degrees\n$$\\deg N = ${dp}, \\quad \\deg D = ${dq}$$`);
        if (dp < dq) steps.push(`##Result\n$$\\deg N < \\deg D \\;\\Rightarrow\\; ${header} = 0$$`);
        else if (dp === dq) steps.push(`##Result\n$$${header} = \\frac{${num(lp)}}{${num(lq)}}${Math.abs(lq) !== 1 && exact && exact.tex !== `\\frac{${num(lp)}}{${num(lq)}}` ? ` = ${exact.tex}` : ""}$$`);
        else steps.push(`##Result\n$$\\deg N > \\deg D \\;\\Rightarrow\\; ${header} = ${verdict.kind === "inf" ? (verdict.sign > 0 ? "\\infty" : "-\\infty") : num(lead)}$$`);
        narrated = (dp < dq && value === 0) || (dp === dq && sameValue(lp / lq)) || (dp > dq && verdict.kind === "inf");
        if (!narrated) steps.length = 1;
      }
    }

    if (oneSidedNote && verdict.kind !== "dne") {
      steps.push(`##Domain\n$$f(${variable}) \\text{ is only defined for } ${variable} ${oneSidedNote === "right" ? ">" : "<"} ${aTex}$$\nSo only the ${oneSidedNote}-hand side exists, and the limit is that one-sided value.`);
    }

    // ── 3. fall back to the numeric table ─────────────────────────────────────
    if (!narrated) {
      const deltas = [0.1, 0.01, 0.001, 0.0001, 0.00001];
      if (atInf) {
        const xs = [10, 100, 1000, 1e4, 1e5, 1e6].map((m) => (a > 0 ? m : -m));
        steps.push(`##Numerical Approach\n${table(`${variable} \\to ${aTex}`, xs, xs.map(f))}`);
      } else if (effSide === "two-sided") {
        steps.push(`##Numerical Approach\n${table(`${variable} \\to ${aTex}^-`, deltas.map((d) => a - d), deltas.map((d) => f(a - d)))}\n${table(`${variable} \\to ${aTex}^+`, deltas.map((d) => a + d), deltas.map((d) => f(a + d)))}`);
      } else {
        const dsn = effSide === "left" ? -1 : 1;
        steps.push(`##Numerical Approach\n${table(`${variable} \\to ${aTex}^${effSide === "left" ? "-" : "+"}`, deltas.map((d) => a + dsn * d), deltas.map((d) => f(a + dsn * d)))}`);
      }
    }

    // ── 4. conclusion ─────────────────────────────────────────────────────────
    const infTex = (sg: 1 | -1) => (sg > 0 ? "\\infty" : "-\\infty");
    const sideTex = (r: OneSided | undefined) => (!r ? "" : r.kind === "finite" ? num(r.value) : r.kind === "inf" ? infTex(r.sign) : r.kind === "oscillates" ? "\\text{oscillates}" : "\\text{undefined}");
    let out: LimitResult;
    if (verdict.kind === "finite") {
      if (!narrated) {
        if (effSide === "two-sided" && !atInf) steps.push(`##Conclusion\n$$${lhs("-")} = ${lhs("+")} = ${exact ? exact.tex : num(value)}$$\n$$${header} = ${exact ? exact.tex : num(value)}$$`);
        else steps.push(`##Conclusion\n$$${header} = ${exact ? exact.tex : num(value)}$$`);
      }
      const plain = exact && !/^-?\d+$/.test(exact.text) ? exact : null;
      out = { value: String(value), steps, numericValue: value, kind: "finite", approachValue: a, limitValue: value, exactText: plain?.text, exactTex: plain?.tex };
    } else if (verdict.kind === "inf") {
      if (!narrated) steps.push(`##Conclusion\n$$${header} = ${infTex(verdict.sign)}$$\nThe values grow without bound, so the limit is infinite (it does not exist as a number).`);
      out = { value: verdict.sign > 0 ? "∞" : "-∞", steps, numericValue: verdict.sign * Infinity, kind: "infinite", approachValue: a, limitValue: verdict.sign * Infinity };
    } else {
      if (verdict.why === "differ" || verdict.why === "opposite" || verdict.why === "mixed") {
        steps.push(`##Conclusion\n$$${lhs("-")} = ${sideTex(L)} \\neq ${sideTex(R)} = ${lhs("+")}$$\n$$${header} = \\text{DNE}$$`);
      } else if (verdict.why === "undefined") {
        steps.push(`##Conclusion\n$$${lhs("-")} = ${sideTex(L)}, \\qquad ${lhs("+")} = ${sideTex(R)}$$\n$$${header} = \\text{DNE}$$\nThe function isn't defined (as a real number) on one side of ${variable} = ${aTex}.`);
      } else {
        steps.push(`##Conclusion\n$$${header} = \\text{DNE}$$\nThe values keep oscillating instead of settling on one number.`);
      }
      void describeSide;
      out = { value: "DNE", steps, kind: "dne", approachValue: a };
    }
    return out;
  } catch (e: unknown) {
    return { value: "", steps: [], error: e instanceof Error ? e.message : "Couldn't evaluate this limit." };
  }
}

function unwrap(n: MathNode): MathNode {
  let x = n;
  while (x.type === "ParenthesisNode") x = (x as unknown as { content: MathNode }).content;
  return x;
}

function splitFraction(n: MathNode): { num: MathNode; den: MathNode } | null {
  const x = unwrap(n);
  if (x.type === "OperatorNode" && (x as unknown as { fn: string }).fn === "divide") {
    const args = (x as unknown as { args: MathNode[] }).args;
    return { num: unwrap(args[0]), den: unwrap(args[1]) };
  }
  return null;
}

function evaluateRecognized(text: string): number {
  try {
    return Number(evaluate(text.replace(/π/g, "pi").replace(/√/g, "sqrt").replace(/ln\(/g, "log(").replace(/(\d)(pi|e|sqrt|log)/g, "$1*$2")));
  } catch { return NaN; }
}
