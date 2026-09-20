/**
 * Practice Mode problem bank.
 *
 * Every generator returns a fully self-contained problem: the prompt (which
 * may use `$...$` / `$$...$$` LaTeX), a model answer, an answer checker, and a
 * worked solution whose steps never jump ahead — each algebraic move gets its
 * own step, the same way the calculators present their work.
 *
 * Difficulty is not just "bigger numbers": easy problems drill one rule,
 * medium combines two, and hard problems are full exam questions — multi-part
 * word problems, integration by parts, Gauss-Jordan elimination on a 3×3
 * system, and trigonometric proofs.
 */
import { derivative, parse, simplify } from "mathjs";
import { solveDerivative, solveIndefiniteIntegral, solveDefiniteIntegral } from "./math-solver";
import { normalizeMathInput } from "./text-normalize";

export type Category =
  | "derivative" | "integral" | "limit" | "linear"
  | "quadratic" | "matrix" | "trig" | "word";
export type Difficulty = "easy" | "medium" | "hard";

export interface Problem {
  category: Category;
  /** Question text. May contain `$...$` inline or `$$...$$` display LaTeX. */
  prompt: string;
  correctAnswer: string;
  steps: string[];
  hint?: string;
  /** Short note on what form the answer should take, shown under the input. */
  answerFormat?: string;
  check: (input: string) => boolean;
}

// ── Small utilities ───────────────────────────────────────────────────────────
export function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randNonZero(min: number, max: number): number {
  let n = 0;
  do { n = randInt(min, max); } while (n === 0);
  return n;
}
function pick<T>(arr: T[]): T {
  return arr[randInt(0, arr.length - 1)];
}

/** Strips the things people naturally type around a numeric answer — currency
 *  symbols, thousands separators, a trailing unit ("12.5 cm", "5.236 rad",
 *  "40%") — so a correct answer is not marked wrong over presentation. */
function stripUnits(input: string): string {
  return input
    .replace(/[$£€]/g, "")
    .replace(/(\d),(\d{3})\b/g, "$1$2")
    .replace(/°/g, "")
    .replace(/\b(rad(ians?)?|deg(rees?)?|cm|mm|km|kg|m|L|litres?|liters?|hours?|hrs?|days?|years?|yrs?|units?|sq|square)\b\.?/gi, "")
    .replace(/%/g, "")
    .trim();
}

function parseNumberAnswer(input: string): number | null {
  try {
    const v = parse(normalizeMathInput(stripUnits(input.trim()))).evaluate();
    return typeof v === "number" && isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

function numericallyClose(a: number, b: number, tol = 1e-2): boolean {
  return Math.abs(a - b) <= Math.max(tol, Math.abs(b) * tol);
}

/** Accepts any algebraically equivalent expression by sampling several points. */
function expressionsAgree(userInput: string, trueExpr: string, points = [0.43, 1.17, -0.71, 2.13, -1.62]): boolean {
  try {
    const userFn = parse(normalizeMathInput(userInput)).compile();
    const trueFn = parse(trueExpr).compile();
    let compared = 0;
    for (const x of points) {
      const a = trueFn.evaluate({ x });
      const b = userFn.evaluate({ x });
      if (typeof a !== "number" || typeof b !== "number" || !isFinite(a) || !isFinite(b)) continue;
      if (!numericallyClose(b, a, 1e-3)) return false;
      compared++;
    }
    return compared >= 3;
  } catch {
    return false;
  }
}

/** Checks an antiderivative answer by differentiating it back. */
function antiderivativeMatches(userInput: string, integrand: string): boolean {
  try {
    const cleaned = userInput.replace(/\+\s*C\b/i, "").trim() || "0";
    const back = derivative(parse(normalizeMathInput(cleaned)), "x").compile();
    const f = parse(integrand).compile();
    const pts = [0.37, 0.92, -0.58, 1.64];
    let compared = 0;
    for (const x of pts) {
      const a = f.evaluate({ x });
      const b = back.evaluate({ x });
      if (typeof a !== "number" || typeof b !== "number" || !isFinite(a) || !isFinite(b)) continue;
      if (!numericallyClose(b, a, 1e-3)) return false;
      compared++;
    }
    return compared >= 3;
  } catch {
    return false;
  }
}

/** Pulls every number out of a free-form answer like "x = 30, 150". */
function numbersIn(input: string): number[] {
  return input
    .split(/[,;]|\band\b|\s+/i)
    .map((s) => stripUnits(s.replace(/^[a-z]\s*=\s*/i, "")))
    .filter(Boolean)
    .map(parseNumberAnswer)
    .filter((v): v is number => v !== null);
}

function matchesSet(input: string, expected: number[], tol = 1e-2): boolean {
  const got = numbersIn(input);
  if (got.length < expected.length) return false;
  return expected.every((e) => got.some((g) => numericallyClose(g, e, tol)));
}

function fmt(n: number): string {
  const r = Math.round(n * 1e6) / 1e6;
  return Number.isInteger(r) ? r.toString() : r.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

function signed(n: number): string {
  return n >= 0 ? `+ ${n}` : `- ${Math.abs(n)}`;
}

/** "3x^2 - 5x + 2" from coefficient list (highest power first). */
function polyString(coeffs: number[]): string {
  const deg = coeffs.length - 1;
  let out = "";
  coeffs.forEach((c, i) => {
    if (c === 0) return;
    const p = deg - i;
    const mag = Math.abs(c);
    const body = p === 0 ? `${mag}` : p === 1 ? `${mag === 1 ? "" : mag}x` : `${mag === 1 ? "" : mag}x^${p}`;
    if (out === "") out += c < 0 ? `-${body}` : body;
    else out += c < 0 ? ` - ${body}` : ` + ${body}`;
  });
  return out || "0";
}

function step(header: string, body: string): string {
  return `##${header}\n${body}`;
}
function eq(latex: string): string {
  return `$$${latex}$$`;
}


// Surface details are randomised too, so repeated visits to the same template
// still read as a different question rather than "the same problem with new
// numbers".
const PEOPLE = ["Ayesha", "Bilal", "Hira", "Usman", "Zara", "Daniyal", "Fatima", "Hamza", "Sana", "Imran"];
const SHOPS = ["a bookshop", "an electronics store", "a sports shop", "a furniture outlet", "a bakery"];
const ITEMS = ["a laptop", "a bicycle", "a jacket", "a phone", "a guitar", "a camera", "a desk"];
const VEHICLES = ["a car", "a bus", "a train", "a motorbike", "a ferry"];
const CITIES = ["Lahore", "Karachi", "Islamabad", "Multan", "Peshawar", "Quetta", "Faisalabad"];
const CONTAINERS = ["a water tank", "a swimming pool", "a fuel drum", "a reservoir", "a storage tank"];

// ── Matrix helpers (shared by the matrix problems) ────────────────────────────
type Matrix = number[][];

function matrixLatex(m: Matrix): string {
  return `\\begin{bmatrix}${m.map((r) => r.map((v) => fmt(v)).join("&")).join("\\\\")}\\end{bmatrix}`;
}

function augmentedLatex(m: Matrix, splitAt: number): string {
  const cols = `${"c".repeat(splitAt)}|${"c".repeat((m[0]?.length ?? 0) - splitAt)}`;
  return `\\left[\\begin{array}{${cols}}${m.map((r) => r.map((v) => fmt(v)).join("&")).join("\\\\")}\\end{array}\\right]`;
}

function clone(m: Matrix): Matrix {
  return m.map((r) => [...r]);
}

/** Gauss-Jordan elimination that records EVERY row operation as its own step. */
function rrefWithSteps(matrix: Matrix, steps: string[], splitAt?: number): { rref: Matrix; rank: number } {
  const m = clone(matrix);
  const rows = m.length;
  const cols = m[0].length;
  const show = () => (splitAt === undefined ? matrixLatex(m) : augmentedLatex(m, splitAt));
  let pivotRow = 0;
  let rank = 0;

  for (let col = 0; col < cols && pivotRow < rows; col++) {
    // 1. find a usable pivot
    let sel = -1;
    for (let r = pivotRow; r < rows; r++) {
      if (Math.abs(m[r][col]) > 1e-10) { sel = r; break; }
    }
    if (sel === -1) {
      steps.push(step(`Column ${col + 1}: No Pivot`, `Every entry from row ${pivotRow + 1} downward in column ${col + 1} is $0$, so this column has no pivot — move to the next column without changing the matrix.`));
      continue;
    }
    if (sel !== pivotRow) {
      [m[pivotRow], m[sel]] = [m[sel], m[pivotRow]];
      steps.push(step("Swap Rows", `Row ${pivotRow + 1} has a $0$ in the pivot position, so swap it with row ${sel + 1}:\n${eq(`R_{${pivotRow + 1}} \\leftrightarrow R_{${sel + 1}}`)}\n${eq(show())}`));
    }
    // 2. scale the pivot to 1
    const pivot = m[pivotRow][col];
    if (Math.abs(pivot - 1) > 1e-10) {
      for (let c = 0; c < cols; c++) m[pivotRow][c] /= pivot;
      steps.push(step("Make the Pivot 1", `Divide row ${pivotRow + 1} by its leading entry $${fmt(pivot)}$:\n${eq(`R_{${pivotRow + 1}} \\to \\frac{1}{${fmt(pivot)}}R_{${pivotRow + 1}}`)}\n${eq(show())}`));
    }
    // 3. clear the rest of the column, one row at a time
    for (let r = 0; r < rows; r++) {
      if (r === pivotRow) continue;
      const factor = m[r][col];
      if (Math.abs(factor) < 1e-10) continue;
      for (let c = 0; c < cols; c++) m[r][c] -= factor * m[pivotRow][c];
      steps.push(step(`Clear Column ${col + 1} in Row ${r + 1}`, `${eq(`R_{${r + 1}} \\to R_{${r + 1}} ${factor > 0 ? "-" : "+"} ${fmt(Math.abs(factor))}\\,R_{${pivotRow + 1}}`)}\n${eq(show())}`));
    }
    pivotRow++;
    rank++;
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) if (Math.abs(m[r][c]) < 1e-10) m[r][c] = 0;
  }
  return { rref: m, rank };
}

function det3(m: Matrix): number {
  return (
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  );
}

// ── Derivatives ───────────────────────────────────────────────────────────────
function genDerivative(diff: Difficulty): Problem {
  if (diff === "easy") {
    const a = randNonZero(2, 9), n = randInt(2, 4), b = randNonZero(2, 9), c = randInt(-9, 9);
    const expr = `${a}x^${n} ${signed(b)}x ${signed(c)}`.replace(/\+ -/g, "- ");
    const clean = expr.replace(/\s/g, "").replace(/(\d)x/g, "$1*x");
    const answer = derivative(clean, "x").toString();
    return {
      category: "derivative",
      prompt: `Differentiate with respect to $x$:\n$$f(x) = ${expr.replace(/\*/g, "")}$$`,
      correctAnswer: answer,
      hint: "Power rule, term by term: d/dx[xⁿ] = n·xⁿ⁻¹, and the derivative of a constant is 0.",
      answerFormat: "an expression in x, e.g. 6x^2 - 4",
      steps: solveDerivative(clean, "x").steps,
      check: (input) => expressionsAgree(input, clean ? derivative(clean, "x").toString() : answer),
    };
  }

  if (diff === "medium") {
    const kind = pick(["product", "chain", "quotient"] as const);
    const a = randNonZero(2, 6), b = randNonZero(2, 5);
    let expr: string;
    let hint: string;
    if (kind === "product") {
      expr = `${a}*x^2*${pick(["sin", "cos"])}(${b}x)`;
      hint = "Product rule: (uv)' = u'v + uv' — and the second factor also needs the chain rule.";
    } else if (kind === "chain") {
      expr = `${pick(["sin", "cos", "exp"])}(${a}*x^2 ${signed(b)})`.replace(/\+ -/g, "- ");
      hint = "Chain rule: differentiate the outer function, then multiply by the derivative of the inside.";
    } else {
      expr = `(${a}x ${signed(b)})/(x^2 + ${randInt(1, 5)})`.replace(/\+ -/g, "- ");
      hint = "Quotient rule: (u/v)' = (u'v − uv')/v².";
    }
    const norm = expr.replace(/(\d)x/g, "$1*x");
    const answer = derivative(norm, "x").toString();
    return {
      category: "derivative",
      prompt: `Differentiate with respect to $x$:\n$$f(x) = ${expr.replace(/\*/g, "")}$$`,
      correctAnswer: answer,
      hint,
      answerFormat: "any equivalent form is accepted",
      steps: solveDerivative(norm, "x").steps,
      check: (input) => expressionsAgree(input, answer),
    };
  }

  // Hard: a full exam-style question — differentiate a composite product, then
  // evaluate the derivative at a point.
  const a = randNonZero(2, 5), b = randInt(2, 4), c = randNonZero(2, 6);
  const shape = pick(["prod-exp", "quotient-trig", "log-product"] as const);
  let expr: string, pretty: string, hint: string;
  if (shape === "prod-exp") {
    expr = `${a}*x^${b}*exp(${c}*x)`;
    pretty = `${a}x^${b}e^{${c}x}`;
    hint = "Product rule with the chain rule on e^(cx).";
  } else if (shape === "quotient-trig") {
    expr = `sin(${c}*x)/(x^${b} + ${a})`;
    pretty = `\\frac{\\sin(${c}x)}{x^{${b}} + ${a}}`;
    hint = "Quotient rule, and the numerator needs the chain rule.";
  } else {
    expr = `x^${b}*log(${c}*x)`;
    pretty = `x^{${b}}\\ln(${c}x)`;
    hint = "Product rule; remember d/dx[ln(cx)] = 1/x.";
  }
  const answer = derivative(expr, "x").toString();
  const point = pick([1, 2, 0.5]);
  const value = parse(answer).compile().evaluate({ x: point }) as number;
  const steps = solveDerivative(expr, "x").steps.slice();
  steps.push(step("Substitute the Given Point", `Now evaluate the derivative at $x = ${point}$:\n${eq(`f'(${point}) = ${fmt(value)}`)}`));

  return {
    category: "derivative",
    prompt: `Given $$f(x) = ${pretty}$$ find $f'(x)$, then evaluate $f'(${point})$.\n\nEnter the **numerical value** of $f'(${point})$, rounded to 3 decimal places.`,
    correctAnswer: fmt(value),
    hint,
    answerFormat: "a number, e.g. 12.5",
    steps,
    check: (input) => {
      const v = parseNumberAnswer(input);
      return v !== null && numericallyClose(v, value, 5e-3);
    },
  };
}

// ── Integrals ─────────────────────────────────────────────────────────────────
function genIntegral(diff: Difficulty): Problem {
  if (diff === "easy") {
    const a = randNonZero(2, 9), n = randInt(1, 3);
    const expr = `${a}*x^${n}`;
    return {
      category: "integral",
      prompt: `Evaluate the indefinite integral:\n$$\\int ${a}x${n === 1 ? "" : `^{${n}}`}\\,dx$$`,
      correctAnswer: `${a}x^${n + 1}/${n + 1} + C`,
      hint: "Power rule: ∫xⁿ dx = xⁿ⁺¹/(n+1) + C.",
      answerFormat: "an expression in x (+ C optional)",
      steps: solveIndefiniteIntegral(expr, "x").steps,
      check: (input) => antiderivativeMatches(input, expr),
    };
  }

  if (diff === "medium") {
    const a = randNonZero(2, 7), b = randNonZero(2, 4);
    const shape = pick(["trig", "exp", "poly", "reciprocal"] as const);
    const trigFn = pick(["sin", "cos"] as const);
    const c = randInt(1, 6);
    const d = randInt(1, 8);
    const expr =
      shape === "trig" ? `${a}*${trigFn}(${b}*x)`
      : shape === "exp" ? `${a}*exp(${b}*x)`
      : shape === "reciprocal" ? `${a}/(${b}*x + ${c})`
      : `${a}*x^3 ${signed(b)}*x^2 + ${d}`;
    // LaTeX is built explicitly per shape rather than string-patched, so the
    // question always renders as a properly typeset integral.
    const latex =
      shape === "trig" ? `${a}\\${trigFn}(${b}x)`
      : shape === "exp" ? `${a}e^{${b}x}`
      : shape === "reciprocal" ? `\\frac{${a}}{${b}x + ${c}}`
      : `${a}x^{3} ${signed(b)}x^{2} + ${d}`;
    const solved = solveIndefiniteIntegral(expr, "x");
    return {
      category: "integral",
      prompt: `Evaluate the indefinite integral:\n$$\\int ${latex}\\,dx$$`,
      correctAnswer: solved.result,
      hint: shape === "reciprocal" ? "\u222b1/(ax+b) dx = ln|ax+b|/a + C." : "Handle the constant multiple first, then apply the standard rule with the chain-rule factor.",
      answerFormat: "an expression in x (+ C optional)",
      steps: solved.steps,
      check: (input) => antiderivativeMatches(input, expr),
    };
  }

  // Hard: u-substitution, integration by parts, or a definite integral.
  const shape = pick(["usub", "parts", "definite"] as const);
  if (shape === "usub") {
    const a = randNonZero(2, 6), fn = pick(["sin", "cos"] as const);
    const expr = `${a}*x*${fn}(x^2)`;
    const r = solveIndefiniteIntegral(expr, "x");
    return {
      category: "integral",
      prompt: `Evaluate using a suitable substitution:\n$$\\int ${a}x\\,\\${fn}\\!\\left(x^{2}\\right)dx$$`,
      correctAnswer: r.result,
      hint: "Let u = x². Then du = 2x dx, so x dx = du/2.",
      answerFormat: "an expression in x (+ C optional)",
      steps: r.steps,
      check: (input) => antiderivativeMatches(input, expr),
    };
  }
  if (shape === "parts") {
    const a = randNonZero(2, 5);
    const kind = pick(["exp", "sin", "cos", "log"] as const);
    const expr = kind === "log" ? `x^2*log(x)` : `${a}*x*${kind === "exp" ? "exp(x)" : `${kind}(x)`}`;
    const pretty = kind === "log" ? `x^{2}\\ln(x)` : `${a}x\\,${kind === "exp" ? "e^{x}" : `\\${kind}(x)`}`;
    const r = solveIndefiniteIntegral(expr, "x");
    return {
      category: "integral",
      prompt: `Evaluate using integration by parts:\n$$\\int ${pretty}\\,dx$$`,
      correctAnswer: r.result,
      hint: "∫u dv = uv − ∫v du. By LIATE, pick u as the logarithm if there is one, otherwise the polynomial.",
      answerFormat: "an expression in x (+ C optional)",
      steps: r.steps,
      check: (input) => antiderivativeMatches(input, expr),
    };
  }
  const a = randInt(2, 5), upper = randInt(2, 4);
  const bCoef = randInt(1, 6);
  const expr = `${a}*x^2 + ${bCoef}*x`;
  const r = solveDefiniteIntegral(expr, "x", 0, upper);
  const value = parseFloat(r.result);
  return {
    category: "integral",
    prompt: `Evaluate the definite integral:\n$$\\int_{0}^{${upper}} \\left(${a}x^{2} + ${bCoef}x\\right)dx$$`,
    correctAnswer: r.result,
    hint: "Find the antiderivative first, then apply F(b) − F(a).",
    answerFormat: "a number",
    steps: r.steps,
    check: (input) => {
      const v = parseNumberAnswer(input);
      return v !== null && numericallyClose(v, value, 1e-3);
    },
  };
}

// ── Limits ────────────────────────────────────────────────────────────────────
function genLimit(diff: Difficulty): Problem {
  if (diff === "easy") {
    const a = randInt(1, 5), b = randNonZero(2, 6), c = randInt(-6, 6), at = randInt(1, 4);
    const value = a * at * at + b * at + c;
    return {
      category: "limit",
      prompt: `Evaluate the limit:\n$$\\lim_{x\\to ${at}} \\left(${polyString([a, b, c])}\\right)$$`,
      correctAnswer: `${value}`,
      hint: "Polynomials are continuous everywhere — substitute directly.",
      answerFormat: "a number",
      steps: [
        step("Check for an Indeterminate Form", `A polynomial is continuous at every real number, so substituting $x = ${at}$ cannot produce $\\frac{0}{0}$ — direct substitution is valid here.`),
        step("Substitute x = " + at, eq(`${a}(${at})^2 ${signed(b)}(${at}) ${signed(c)}`)),
        step("Evaluate Each Term", eq(`${a * at * at} ${signed(b * at)} ${signed(c)}`)),
        step("Add the Terms", eq(`\\lim_{x\\to ${at}}\\left(${polyString([a, b, c])}\\right) = ${value}`)),
      ],
      check: (input) => { const v = parseNumberAnswer(input); return v !== null && numericallyClose(v, value, 1e-4); },
    };
  }

  if (diff === "medium") {
    const r = randInt(2, 7), other = randInt(1, 8);
    // (x² - (r+other)x + r·other)/(x - r)  →  x - other  at x = r
    const value = r - other;
    const num = `x^2 ${signed(-(r + other))}x ${signed(r * other)}`.replace(/\+ -/g, "- ");
    return {
      category: "limit",
      prompt: `Evaluate the limit:\n$$\\lim_{x\\to ${r}} \\frac{${num}}{x - ${r}}$$`,
      correctAnswer: `${value}`,
      hint: "Substitution gives 0/0 — factor the numerator and cancel the common factor first.",
      answerFormat: "a number",
      steps: [
        step("Try Direct Substitution", `Substituting $x = ${r}$ gives\n${eq(`\\frac{${r * r} ${signed(-(r + other) * r)} ${signed(r * other)}}{${r} - ${r}} = \\frac{0}{0}`)}\nThis is an indeterminate form, so the limit is not yet decided — the expression must be simplified.`),
        step("Factor the Numerator", `The numerator factors using its roots $x = ${r}$ and $x = ${other}$:\n${eq(`${num} = (x - ${r})(x - ${other})`)}`),
        step("Cancel the Common Factor", `For $x \\neq ${r}$ the factor $(x-${r})$ cancels top and bottom:\n${eq(`\\frac{(x - ${r})(x - ${other})}{x - ${r}} = x - ${other}`)}`),
        step("Why Cancelling Is Allowed", `A limit as $x\\to ${r}$ only looks at values NEAR $${r}$, never at $x=${r}$ itself — so dividing by $(x-${r})$ is legitimate here.`),
        step("Substitute Again", eq(`\\lim_{x\\to ${r}}(x - ${other}) = ${r} - ${other} = ${value}`)),
      ],
      check: (input) => { const v = parseNumberAnswer(input); return v !== null && numericallyClose(v, value, 1e-4); },
    };
  }

  // Hard: L'Hôpital on a trig/exponential form, or a limit at infinity.
  if (Math.random() < 0.5) {
    const a = randInt(2, 7), b = randInt(2, 7);
    const value = a / b;
    return {
      category: "limit",
      prompt: `Evaluate the limit:\n$$\\lim_{x\\to 0} \\frac{\\sin(${a}x)}{\\tan(${b}x)}$$`,
      correctAnswer: fmt(value),
      hint: "Both numerator and denominator → 0. Apply L'Hôpital's rule, or use sin(u) ≈ u and tan(u) ≈ u for small u.",
      answerFormat: "a number or exact fraction",
      steps: [
        step("Check the Form", `As $x\\to0$: $\\sin(${a}x)\\to0$ and $\\tan(${b}x)\\to0$, so this is the indeterminate form $\\frac{0}{0}$ and L'Hôpital's rule applies.`),
        step("Differentiate the Numerator", eq(`\\frac{d}{dx}\\left[\\sin(${a}x)\\right] = ${a}\\cos(${a}x)`)),
        step("Differentiate the Denominator", eq(`\\frac{d}{dx}\\left[\\tan(${b}x)\\right] = ${b}\\sec^{2}(${b}x)`)),
        step("Form the New Quotient", eq(`\\lim_{x\\to0}\\frac{${a}\\cos(${a}x)}{${b}\\sec^{2}(${b}x)}`)),
        step("Substitute x = 0", `$\\cos(0) = 1$ and $\\sec(0) = 1$, so:\n${eq(`\\frac{${a}\\cdot 1}{${b}\\cdot 1} = \\frac{${a}}{${b}}`)}`),
        step("Final Answer", eq(`\\lim_{x\\to0}\\frac{\\sin(${a}x)}{\\tan(${b}x)} = \\frac{${a}}{${b}} = ${fmt(value)}`)),
      ],
      check: (input) => { const v = parseNumberAnswer(input); return v !== null && numericallyClose(v, value, 1e-3); },
    };
  }

  const a = randInt(2, 9), b = randInt(2, 9), c = randInt(1, 9), d = randInt(1, 9);
  const value = a / b;
  return {
    category: "limit",
    prompt: `Evaluate the limit:\n$$\\lim_{x\\to\\infty} \\frac{${a}x^{2} + ${c}x - 4}{${b}x^{2} - ${d}x + 7}$$`,
    correctAnswer: fmt(value),
    hint: "Divide every term by the highest power of x that appears, then let x → ∞.",
    answerFormat: "a number or exact fraction",
    steps: [
      step("Identify the Form", `Both the numerator and the denominator grow without bound, giving the indeterminate form $\\frac{\\infty}{\\infty}$ — so the limit cannot be read off directly.`),
      step("Divide Every Term by x²", `$x^2$ is the highest power present. Dividing top and bottom by it does not change the value of the fraction:\n${eq(`\\frac{${a} + \\dfrac{${c}}{x} - \\dfrac{4}{x^{2}}}{${b} - \\dfrac{${d}}{x} + \\dfrac{7}{x^{2}}}`)}`),
      step("Apply the Basic Infinity Limits", `Each term of the form $\\frac{k}{x}$ or $\\frac{k}{x^{2}}$ tends to $0$ as $x\\to\\infty$.`),
      step("Substitute the Limits", eq(`\\frac{${a} + 0 - 0}{${b} - 0 + 0} = \\frac{${a}}{${b}}`)),
      step("Final Answer", eq(`\\lim_{x\\to\\infty}\\frac{${a}x^{2} + ${c}x - 4}{${b}x^{2} - ${d}x + 7} = \\frac{${a}}{${b}} = ${fmt(value)}`)),
    ],
    check: (input) => { const v = parseNumberAnswer(input); return v !== null && numericallyClose(v, value, 1e-3); },
  };
}

// ── Linear equations ──────────────────────────────────────────────────────────
function genLinear(diff: Difficulty): Problem {
  if (diff === "hard") {
    // A system of two equations — solved by elimination, every step shown.
    const x0 = randInt(-6, 6), y0 = randInt(-6, 6);
    const a1 = randNonZero(2, 6), b1 = randNonZero(2, 6);
    const a2 = randNonZero(2, 6), b2 = randNonZero(2, 6);
    if (a1 * b2 - a2 * b1 === 0) return genLinear("hard");
    const c1 = a1 * x0 + b1 * y0;
    const c2 = a2 * x0 + b2 * y0;
    const lcmA = (a1 * a2) / gcd(Math.abs(a1), Math.abs(a2));
    const m1 = lcmA / a1, m2 = lcmA / a2;
    const yCoef = m1 * b1 - m2 * b2;
    const rhs = m1 * c1 - m2 * c2;

    return {
      category: "linear",
      prompt: `Solve the system of equations for $x$ and $y$:\n$$${a1}x ${signed(b1)}y = ${c1}$$$$${a2}x ${signed(b2)}y = ${c2}$$\nEnter both values, e.g. "x = 2, y = -3".`,
      correctAnswer: `x = ${x0}, y = ${y0}`,
      hint: "Scale both equations so the x-coefficients match, subtract to eliminate x, then back-substitute.",
      answerFormat: "two numbers, e.g. x = 2, y = -3",
      steps: [
        step("Label the Equations", `${eq(`(1)\\quad ${a1}x ${signed(b1)}y = ${c1}`)}${eq(`(2)\\quad ${a2}x ${signed(b2)}y = ${c2}`)}`),
        step("Make the x-Coefficients Match", `The least common multiple of $${Math.abs(a1)}$ and $${Math.abs(a2)}$ is $${Math.abs(lcmA)}$. Multiply equation (1) by $${m1}$ and equation (2) by $${m2}$:`),
        step("Scale Equation (1)", eq(`${m1}\\times(1):\\quad ${lcmA}x ${signed(m1 * b1)}y = ${m1 * c1}`)),
        step("Scale Equation (2)", eq(`${m2}\\times(2):\\quad ${lcmA}x ${signed(m2 * b2)}y = ${m2 * c2}`)),
        step("Subtract to Eliminate x", `Subtracting the second scaled equation from the first removes the $x$ term entirely:\n${eq(`(${m1 * b1} - (${m2 * b2}))y = ${m1 * c1} - (${m2 * c2})`)}\n${eq(`${yCoef}y = ${rhs}`)}`),
        step("Solve for y", eq(`y = \\frac{${rhs}}{${yCoef}} = ${y0}`)),
        step("Back-Substitute into Equation (1)", eq(`${a1}x ${signed(b1)}(${y0}) = ${c1}`)),
        step("Isolate the x Term", eq(`${a1}x = ${c1} - (${b1 * y0}) = ${c1 - b1 * y0}`)),
        step("Solve for x", eq(`x = \\frac{${c1 - b1 * y0}}{${a1}} = ${x0}`)),
        step("Check in Equation (2)", `Substituting both values back:\n${eq(`${a2}(${x0}) ${signed(b2)}(${y0}) = ${c2}`)}\nThe original equation holds, so the solution is confirmed.`),
      ],
      check: (input) => matchesSet(input, [x0, y0], 1e-3),
    };
  }

  const range = diff === "easy" ? 9 : 15;
  const a = randNonZero(2, 9);
  const x0 = randInt(-range, range);
  const b = randInt(-range, range);
  const d = diff === "easy" ? 0 : randNonZero(2, 5);
  const c = a * x0 + b;
  const rhsConst = c - d * x0;
  const lhs = `${a}x ${signed(b)}`;
  const rhs = d === 0 ? `${c}` : `${d}x ${signed(rhsConst)}`;

  const steps = [
    step("Write the Equation", eq(`${lhs} = ${rhs}`)),
  ];
  if (d !== 0) {
    steps.push(step("Collect the x-Terms on One Side", `Subtract $${d}x$ from both sides:\n${eq(`${a}x - ${d}x ${signed(b)} = ${rhsConst}`)}\n${eq(`${a - d}x ${signed(b)} = ${rhsConst}`)}`));
  }
  const leftCoef = a - d;
  const constTerm = b;
  const target = d === 0 ? c : rhsConst;
  steps.push(step("Move the Constant Across", `Subtract $${constTerm}$ from both sides (add if it is negative):\n${eq(`${leftCoef}x = ${target} - (${constTerm}) = ${target - constTerm}`)}`));
  steps.push(step("Divide by the Coefficient of x", eq(`x = \\frac{${target - constTerm}}{${leftCoef}} = ${x0}`)));
  steps.push(step("Verify", `Substitute $x = ${x0}$ back into the left side:\n${eq(`${a}(${x0}) ${signed(b)} = ${a * x0 + b}`)}\nand into the right side:\n${eq(`${d === 0 ? c : `${d}(${x0}) ${signed(rhsConst)} = ${d * x0 + rhsConst}`}`)}\nBoth sides agree, so the solution is correct.`));

  return {
    category: "linear",
    prompt: `Solve for $x$:\n$$${lhs} = ${rhs}$$`,
    correctAnswer: `${x0}`,
    hint: "Get every x-term on one side and every constant on the other, then divide.",
    answerFormat: "a number",
    steps,
    check: (input) => { const v = parseNumberAnswer(input); return v !== null && numericallyClose(v, x0, 1e-4); },
  };
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

// ── Quadratic equations ───────────────────────────────────────────────────────
function genQuadratic(diff: Difficulty): Problem {
  const range = diff === "easy" ? 6 : diff === "medium" ? 9 : 12;
  const p = randNonZero(-range, range);
  const q = randNonZero(-range, range);
  const leading = diff === "hard" ? pick([2, 3, 2]) : 1;
  const b = -leading * (p + q);
  const c = leading * p * q;
  const eqStr = `${leading === 1 ? "" : leading}x^2 ${signed(b)}x ${signed(c)} = 0`;
  const disc = b * b - 4 * leading * c;

  const steps = [
    step("Identify the Coefficients", `Comparing with the standard form $ax^{2}+bx+c=0$:\n${eq(`a = ${leading},\\quad b = ${b},\\quad c = ${c}`)}`),
    step("Compute the Discriminant", `${eq(`D = b^{2} - 4ac = (${b})^{2} - 4(${leading})(${c})`)}${eq(`D = ${b * b} - ${4 * leading * c} = ${disc}`)}`),
    step("Interpret the Discriminant", `$D = ${disc} > 0$, so the equation has two distinct real roots.`),
    step("Write the Quadratic Formula", eq(`x = \\frac{-b \\pm \\sqrt{D}}{2a}`)),
    step("Substitute the Values", eq(`x = \\frac{-(${b}) \\pm \\sqrt{${disc}}}{2(${leading})} = \\frac{${-b} \\pm ${fmt(Math.sqrt(disc))}}{${2 * leading}}`)),
    step("First Root", eq(`x_{1} = \\frac{${-b} + ${fmt(Math.sqrt(disc))}}{${2 * leading}} = ${fmt(Math.max(p, q))}`)),
    step("Second Root", eq(`x_{2} = \\frac{${-b} - ${fmt(Math.sqrt(disc))}}{${2 * leading}} = ${fmt(Math.min(p, q))}`)),
    step("Check with Vieta's Formulas", `Sum of roots should be $-\\frac{b}{a} = ${fmt(-b / leading)}$, and indeed $${p} + ${q} = ${p + q}$.\nProduct should be $\\frac{c}{a} = ${fmt(c / leading)}$, and indeed $(${p})(${q}) = ${p * q}$.`),
  ];

  return {
    category: "quadratic",
    prompt: `Solve the quadratic equation:\n$$${eqStr}$$\nEnter both roots, separated by a comma.`,
    correctAnswer: `x = ${p}, x = ${q}`,
    hint: leading === 1 ? "Try factoring into (x − p)(x − q) = 0, or use the quadratic formula." : "Use the quadratic formula x = (−b ± √(b²−4ac)) / 2a.",
    answerFormat: "two numbers, e.g. 2, -3",
    steps,
    check: (input) => matchesSet(input, [p, q], 1e-3),
  };
}

// ── Matrices ──────────────────────────────────────────────────────────────────
function genMatrix(diff: Difficulty): Problem {
  if (diff === "easy") {
    const m: Matrix = [[randNonZero(-9, 9), randNonZero(-9, 9)], [randNonZero(-9, 9), randNonZero(-9, 9)]];
    const d = m[0][0] * m[1][1] - m[0][1] * m[1][0];
    return {
      category: "matrix",
      prompt: `Find the determinant of\n$$A = ${matrixLatex(m)}$$`,
      correctAnswer: `${d}`,
      hint: "For a 2×2 matrix, det = ad − bc.",
      answerFormat: "a number",
      steps: [
        step("Write the Formula", `For $A = \\begin{bmatrix}a&b\\\\c&d\\end{bmatrix}$, the determinant is the difference of the diagonal products:\n${eq(`\\det(A) = ad - bc`)}`),
        step("Identify the Entries", eq(`a = ${m[0][0]},\\quad b = ${m[0][1]},\\quad c = ${m[1][0]},\\quad d = ${m[1][1]}`)),
        step("Multiply the Main Diagonal", eq(`ad = (${m[0][0]})(${m[1][1]}) = ${m[0][0] * m[1][1]}`)),
        step("Multiply the Anti-Diagonal", eq(`bc = (${m[0][1]})(${m[1][0]}) = ${m[0][1] * m[1][0]}`)),
        step("Subtract", eq(`\\det(A) = ${m[0][0] * m[1][1]} - (${m[0][1] * m[1][0]}) = ${d}`)),
      ],
      check: (input) => { const v = parseNumberAnswer(input); return v !== null && numericallyClose(v, d, 1e-4); },
    };
  }

  if (diff === "medium") {
    const m: Matrix = [0, 1, 2].map(() => [randInt(-5, 5), randInt(-5, 5), randInt(-5, 5)]);
    if (Math.abs(det3(m)) < 1e-9) return genMatrix("medium");
    const d = det3(m);
    const minors = [
      m[1][1] * m[2][2] - m[1][2] * m[2][1],
      m[1][0] * m[2][2] - m[1][2] * m[2][0],
      m[1][0] * m[2][1] - m[1][1] * m[2][0],
    ];
    return {
      category: "matrix",
      prompt: `Find the determinant of the 3×3 matrix by cofactor expansion along the first row:\n$$A = ${matrixLatex(m)}$$`,
      correctAnswer: `${d}`,
      hint: "det(A) = a₁₁M₁₁ − a₁₂M₁₂ + a₁₃M₁₃, where each Mᵢⱼ is a 2×2 determinant.",
      answerFormat: "a number",
      steps: [
        step("Set Up the Expansion", `Expanding along row 1, each entry is multiplied by the determinant of the 2×2 matrix left after deleting its row and column, with alternating signs $(+,-,+)$:\n${eq(`\\det(A) = a_{11}M_{11} - a_{12}M_{12} + a_{13}M_{13}`)}`),
        step("Minor M₁₁ (delete row 1, column 1)", eq(`M_{11} = \\det${matrixLatex([[m[1][1], m[1][2]], [m[2][1], m[2][2]]])} = (${m[1][1]})(${m[2][2]}) - (${m[1][2]})(${m[2][1]}) = ${minors[0]}`)),
        step("Minor M₁₂ (delete row 1, column 2)", eq(`M_{12} = \\det${matrixLatex([[m[1][0], m[1][2]], [m[2][0], m[2][2]]])} = (${m[1][0]})(${m[2][2]}) - (${m[1][2]})(${m[2][0]}) = ${minors[1]}`)),
        step("Minor M₁₃ (delete row 1, column 3)", eq(`M_{13} = \\det${matrixLatex([[m[1][0], m[1][1]], [m[2][0], m[2][1]]])} = (${m[1][0]})(${m[2][1]}) - (${m[1][1]})(${m[2][0]}) = ${minors[2]}`)),
        step("Substitute the Minors", eq(`\\det(A) = (${m[0][0]})(${minors[0]}) - (${m[0][1]})(${minors[1]}) + (${m[0][2]})(${minors[2]})`)),
        step("Multiply Each Term", eq(`= ${m[0][0] * minors[0]} - (${m[0][1] * minors[1]}) + (${m[0][2] * minors[2]})`)),
        step("Add the Terms", eq(`\\det(A) = ${d}`)),
      ],
      check: (input) => { const v = parseNumberAnswer(input); return v !== null && numericallyClose(v, d, 1e-4); },
    };
  }

  // Hard: full Gauss-Jordan reduction of a 3×3 system (or the rank of a 3×4
  // matrix), with every single row operation written out.
  if (Math.random() < 0.6) {
    const x0 = randInt(-4, 4), y0 = randInt(-4, 4), z0 = randInt(-4, 4);
    const A: Matrix = [0, 1, 2].map(() => [randNonZero(-4, 4), randNonZero(-4, 4), randNonZero(-4, 4)]);
    if (Math.abs(det3(A)) < 1e-9) return genMatrix("hard");
    const aug: Matrix = A.map((r) => [...r, r[0] * x0 + r[1] * y0 + r[2] * z0]);

    const steps: string[] = [
      step("Write the Augmented Matrix", `Put the coefficients on the left of the bar and the constants on the right:\n${eq(augmentedLatex(aug, 3))}`),
      step("Plan: Gauss-Jordan Elimination", `Reduce the left block to the identity matrix. Every row operation is applied to the WHOLE row, constants included — when the left half becomes $I$, the right half is the solution.`),
    ];
    const { rref } = rrefWithSteps(aug, steps, 3);
    steps.push(step("Read Off the Solution", `The left block is now the identity matrix, so each row states one variable directly:\n${eq(`x = ${fmt(rref[0][3])},\\quad y = ${fmt(rref[1][3])},\\quad z = ${fmt(rref[2][3])}`)}`));
    steps.push(step("Verify in the First Equation", eq(`${A[0][0]}(${x0}) ${signed(A[0][1])}(${y0}) ${signed(A[0][2])}(${z0}) = ${aug[0][3]}`)));

    return {
      category: "matrix",
      prompt: `Solve the system using Gauss-Jordan elimination (reduce the augmented matrix to RREF):\n$$${A[0][0]}x ${signed(A[0][1])}y ${signed(A[0][2])}z = ${aug[0][3]}$$$$${A[1][0]}x ${signed(A[1][1])}y ${signed(A[1][2])}z = ${aug[1][3]}$$$$${A[2][0]}x ${signed(A[2][1])}y ${signed(A[2][2])}z = ${aug[2][3]}$$\nEnter all three values, e.g. "x = 1, y = -2, z = 3".`,
      correctAnswer: `x = ${x0}, y = ${y0}, z = ${z0}`,
      hint: "Get a 1 in the first pivot, clear the rest of column 1, then repeat for columns 2 and 3 — clearing above the pivot as well as below.",
      answerFormat: "three numbers, e.g. x = 1, y = -2, z = 3",
      steps,
      check: (input) => matchesSet(input, [x0, y0, z0], 1e-3),
    };
  }

  // Rank of a 3×4 matrix with a deliberately dependent row.
  const r1 = [randNonZero(-4, 4), randNonZero(-4, 4), randInt(-4, 4), randInt(-4, 4)];
  const r2 = [randNonZero(-4, 4), randInt(-4, 4), randNonZero(-4, 4), randInt(-4, 4)];
  const k = pick([2, -1, 3]);
  const r3 = r1.map((v, i) => k * v + r2[i]); // guaranteed dependent → rank 2
  const M: Matrix = [r1, r2, r3];
  const steps: string[] = [
    step("What Rank Means", `The rank is the number of non-zero rows once the matrix is fully row-reduced — that is, how many of its rows carry genuinely independent information.`),
    step("Start", eq(matrixLatex(M))),
  ];
  const { rank } = rrefWithSteps(M, steps);
  steps.push(step("Count the Non-Zero Rows", `After reduction, $${rank}$ row${rank === 1 ? "" : "s"} remain non-zero, so the rank is $${rank}$. (Row 3 was $${k}$ times row 1 plus row 2, so it carried no new information and reduced to a zero row.)`));

  return {
    category: "matrix",
    prompt: `Reduce to reduced row echelon form (RREF) and state the rank of\n$$A = ${matrixLatex(M)}$$`,
    correctAnswer: `${rank}`,
    hint: "Row-reduce fully, then count the rows that are not entirely zero.",
    answerFormat: "a number (the rank)",
    steps,
    check: (input) => { const v = parseNumberAnswer(input); return v !== null && numericallyClose(v, rank, 1e-6); },
  };
}

// ── Trigonometry ──────────────────────────────────────────────────────────────
const EXACT_ANGLES: {
  deg: number; sin: string; cos: string; tan: string;
  sinP: string; cosP: string; tanP: string;
  sinV: number; cosV: number; tanV: number;
}[] = [
  { deg: 30, sin: "\\frac{1}{2}", cos: "\\frac{\\sqrt{3}}{2}", tan: "\\frac{1}{\\sqrt{3}}", sinP: "1/2", cosP: "\u221a3/2", tanP: "1/\u221a3", sinV: 0.5, cosV: Math.sqrt(3) / 2, tanV: 1 / Math.sqrt(3) },
  { deg: 45, sin: "\\frac{1}{\\sqrt{2}}", cos: "\\frac{1}{\\sqrt{2}}", tan: "1", sinP: "1/\u221a2", cosP: "1/\u221a2", tanP: "1", sinV: Math.SQRT1_2, cosV: Math.SQRT1_2, tanV: 1 },
  { deg: 60, sin: "\\frac{\\sqrt{3}}{2}", cos: "\\frac{1}{2}", tan: "\\sqrt{3}", sinP: "\u221a3/2", cosP: "1/2", tanP: "\u221a3", sinV: Math.sqrt(3) / 2, cosV: 0.5, tanV: Math.sqrt(3) },
];

function genTrig(diff: Difficulty): Problem {
  if (diff === "easy") {
    const which = pick(["value", "convert", "pythag"] as const);
    if (which === "value") {
      const a = pick(EXACT_ANGLES);
      const fn = pick(["sin", "cos", "tan"] as const);
      const value = fn === "sin" ? a.sinV : fn === "cos" ? a.cosV : a.tanV;
      const exact = fn === "sin" ? a.sin : fn === "cos" ? a.cos : a.tan;
      const plain = fn === "sin" ? a.sinP : fn === "cos" ? a.cosP : a.tanP;
      return {
        category: "trig",
        prompt: `Evaluate exactly:\n$$\\${fn}(${a.deg}°)$$`,
        correctAnswer: `${plain} ≈ ${fmt(value)}`,
        hint: "Use the standard 30–60–90 and 45–45–90 triangles.",
        answerFormat: "a number (decimal is fine)",
        steps: [
          step("Recall the Standard Triangle", a.deg === 45
            ? `A 45–45–90 triangle has legs $1, 1$ and hypotenuse $\\sqrt{2}$.`
            : `A 30–60–90 triangle has sides $1$ (opposite $30°$), $\\sqrt{3}$ (opposite $60°$), and hypotenuse $2$.`),
          step("Apply the Definition", `${fn === "sin" ? "$\\sin\\theta = \\frac{\\text{opposite}}{\\text{hypotenuse}}$" : fn === "cos" ? "$\\cos\\theta = \\frac{\\text{adjacent}}{\\text{hypotenuse}}$" : "$\\tan\\theta = \\frac{\\text{opposite}}{\\text{adjacent}}$"}`),
          step("Read Off the Value", eq(`\\${fn}(${a.deg}°) = ${exact}`)),
          step("As a Decimal", eq(`\\${fn}(${a.deg}°) \\approx ${fmt(value)}`)),
        ],
        check: (input) => { const v = parseNumberAnswer(input); return v !== null && numericallyClose(v, value, 5e-3); },
      };
    }
    if (which === "convert") {
      const deg = pick([30, 45, 60, 120, 135, 150, 210, 240, 300, 330]);
      const rad = (deg * Math.PI) / 180;
      return {
        category: "trig",
        prompt: `Convert $${deg}°$ to radians. Give your answer as a decimal (or as a multiple of π).`,
        correctAnswer: `${fmt(rad)} rad`,
        hint: "Multiply by π/180.",
        answerFormat: "a number, e.g. 2.094 or 2pi/3",
        steps: [
          step("Write the Conversion Factor", `A full turn is $360° = 2\\pi$ radians, so $1° = \\frac{\\pi}{180}$ radians.`),
          step("Multiply", eq(`${deg}° \\times \\frac{\\pi}{180} = \\frac{${deg}\\pi}{180}`)),
          step("Simplify the Fraction", eq(`\\frac{${deg}\\pi}{180} = \\frac{${deg / gcd(deg, 180)}\\pi}{${180 / gcd(deg, 180)}}`)),
          step("As a Decimal", eq(`\\approx ${fmt(rad)}\\text{ rad}`)),
        ],
        check: (input) => { const v = parseNumberAnswer(input); return v !== null && numericallyClose(v, rad, 5e-3); },
      };
    }
    const [o, a2, h] = pick([[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25]]);
    const value = o / h;
    return {
      category: "trig",
      prompt: `A right triangle has legs of length $${o}$ and $${a2}$, with hypotenuse $${h}$. Find $\\sin\\theta$ for the angle $\\theta$ opposite the side of length $${o}$.`,
      correctAnswer: `${o}/${h} ≈ ${fmt(value)}`,
      hint: "sin = opposite / hypotenuse.",
      answerFormat: "a number or fraction",
      steps: [
        step("Confirm the Right Triangle", eq(`${o}^{2} + ${a2}^{2} = ${o * o} + ${a2 * a2} = ${h * h} = ${h}^{2}\\quad\\checkmark`)),
        step("Identify the Sides", `Relative to $\\theta$: opposite $= ${o}$, adjacent $= ${a2}$, hypotenuse $= ${h}$.`),
        step("Apply the Definition", eq(`\\sin\\theta = \\frac{\\text{opposite}}{\\text{hypotenuse}} = \\frac{${o}}{${h}}`)),
        step("As a Decimal", eq(`\\sin\\theta = ${fmt(value)}`)),
      ],
      check: (input) => { const v = parseNumberAnswer(input); return v !== null && numericallyClose(v, value, 5e-3); },
    };
  }

  if (diff === "medium") {
    const which = pick(["ratio", "solve", "identity-value"] as const);
    if (which === "ratio") {
      const [o, a2, h] = pick([[3, 4, 5], [5, 12, 13], [8, 15, 17]]);
      const target = pick(["cos", "tan"] as const);
      const value = target === "cos" ? a2 / h : o / a2;
      return {
        category: "trig",
        prompt: `Given that $\\sin\\theta = \\dfrac{${o}}{${h}}$ and $\\theta$ lies in the first quadrant, find $\\${target}\\theta$.`,
        correctAnswer: fmt(value),
        hint: "Use sin²θ + cos²θ = 1 to get the missing ratio, keeping signs appropriate to the quadrant.",
        answerFormat: "a number or fraction",
        steps: [
          step("Use the Pythagorean Identity", eq(`\\sin^{2}\\theta + \\cos^{2}\\theta = 1`)),
          step("Substitute the Known Ratio", eq(`\\left(\\frac{${o}}{${h}}\\right)^{2} + \\cos^{2}\\theta = 1`)),
          step("Simplify the Square", eq(`\\frac{${o * o}}{${h * h}} + \\cos^{2}\\theta = 1`)),
          step("Isolate cos²θ", eq(`\\cos^{2}\\theta = 1 - \\frac{${o * o}}{${h * h}} = \\frac{${h * h - o * o}}{${h * h}}`)),
          step("Take the Square Root", `In the first quadrant cosine is positive, so take the positive root:\n${eq(`\\cos\\theta = \\frac{${a2}}{${h}}`)}`),
          ...(target === "tan" ? [step("Form the Tangent", eq(`\\tan\\theta = \\frac{\\sin\\theta}{\\cos\\theta} = \\frac{${o}/${h}}{${a2}/${h}} = \\frac{${o}}{${a2}}`))] : []),
          step("Final Value", eq(`\\${target}\\theta = ${fmt(value)}`)),
        ],
        check: (input) => { const v = parseNumberAnswer(input); return v !== null && numericallyClose(v, value, 5e-3); },
      };
    }
    if (which === "solve") {
      const a = pick(EXACT_ANGLES);
      const solutions = [a.deg, 180 - a.deg];
      return {
        category: "trig",
        prompt: `Solve for $\\theta$ in the interval $0° \\le \\theta < 360°$:\n$$\\sin\\theta = ${a.sin}$$\nEnter all solutions in degrees, separated by commas.`,
        correctAnswer: solutions.map((d2) => `${d2}°`).join(", "),
        hint: "Find the reference angle first, then use the quadrants where sine is positive (I and II).",
        answerFormat: "angles in degrees, e.g. 30, 150",
        steps: [
          step("Find the Reference Angle", `Ignoring sign, $\\sin^{-1}\\left(${a.sin}\\right) = ${a.deg}°$ — this is the reference angle.`),
          step("Decide the Quadrants", `The value is positive, and sine is positive in quadrant I and quadrant II (ASTC), so there are two solutions in one full turn.`),
          step("Quadrant I Solution", eq(`\\theta = ${a.deg}°`)),
          step("Quadrant II Solution", eq(`\\theta = 180° - ${a.deg}° = ${180 - a.deg}°`)),
          step("Check Both", `$\\sin(${a.deg}°) = ${fmt(a.sinV)}$ and $\\sin(${180 - a.deg}°) = ${fmt(a.sinV)}$ — both match.`),
          step("General Solution (for reference)", eq(`\\theta = ${a.deg}° + 360°n \\quad\\text{or}\\quad \\theta = ${180 - a.deg}° + 360°n,\\; n\\in\\mathbb{Z}`)),
        ],
        check: (input) => matchesSet(input, solutions, 0.5),
      };
    }
    const a = pick(EXACT_ANGLES);
    const value = 2 * a.sinV * a.cosV;
    return {
      category: "trig",
      prompt: `Use the double-angle formula to evaluate:\n$$\\sin(2 \\times ${a.deg}°)$$`,
      correctAnswer: fmt(value),
      hint: "sin(2θ) = 2 sinθ cosθ.",
      answerFormat: "a number",
      steps: [
        step("State the Formula", eq(`\\sin(2\\theta) = 2\\sin\\theta\\cos\\theta`)),
        step("Write the Known Values", eq(`\\sin(${a.deg}°) = ${a.sin},\\qquad \\cos(${a.deg}°) = ${a.cos}`)),
        step("Substitute", eq(`\\sin(${2 * a.deg}°) = 2\\left(${a.sin}\\right)\\left(${a.cos}\\right)`)),
        step("Multiply Out", eq(`= ${fmt(value)}`)),
        step("Sanity Check", `$${2 * a.deg}°$ ${2 * a.deg > 90 ? "lies in quadrant II, where sine is still positive" : "lies in quadrant I, where sine is positive"} — the sign of the answer is consistent.`),
      ],
      check: (input) => { const v = parseNumberAnswer(input); return v !== null && numericallyClose(v, value, 5e-3); },
    };
  }

  // Hard: identity proofs, exact values via sum formulas, quadratic trig
  // equations, and the law of cosines.
  const which = pick(["proof", "sum-formula", "quadratic-eq", "law-of-cosines"] as const);

  if (which === "proof") {
    const variant = pick([0, 1, 2] as const);
    if (variant === 0) {
      return {
        category: "trig",
        prompt: `Prove the identity\n$$\\frac{1 - \\cos^{2}x}{\\sin x\\,\\cos x} = \\tan x$$\nWork the left-hand side down to a single trigonometric function, and enter that function as your answer.`,
        correctAnswer: "tan(x)",
        hint: "Start from sin²x + cos²x = 1.",
        answerFormat: "a single function, e.g. tan(x)",
        steps: [
          step("Start from the Left-Hand Side", eq(`\\text{LHS} = \\frac{1 - \\cos^{2}x}{\\sin x\\,\\cos x}`)),
          step("Apply the Pythagorean Identity", `Since $\\sin^{2}x + \\cos^{2}x = 1$, rearranging gives $1 - \\cos^{2}x = \\sin^{2}x$:\n${eq(`= \\frac{\\sin^{2}x}{\\sin x\\,\\cos x}`)}`),
          step("Cancel One Factor of sin x", `Both top and bottom share a factor $\\sin x$ (valid wherever $\\sin x \\neq 0$):\n${eq(`= \\frac{\\sin x}{\\cos x}`)}`),
          step("Recognize the Quotient Identity", eq(`\\frac{\\sin x}{\\cos x} = \\tan x`)),
          step("Conclude", `LHS $= \\tan x =$ RHS, so the identity holds for all $x$ where $\\sin x\\cos x \\neq 0$. $\\blacksquare$`),
        ],
        check: (input) => expressionsAgree(input, "tan(x)", [0.4, 0.9, 1.3, -0.6, 2.2]),
      };
    }
    if (variant === 1) {
      return {
        category: "trig",
        prompt: `Prove the identity\n$$\\frac{\\sin x}{1 + \\cos x} + \\frac{1 + \\cos x}{\\sin x} = 2\\csc x$$\nSimplify the left-hand side to a single term and enter it (use 1/sin(x) for csc).`,
        correctAnswer: "2/sin(x)",
        hint: "Put both fractions over a common denominator, then use sin²x + cos²x = 1.",
        answerFormat: "a single expression, e.g. 2/sin(x)",
        steps: [
          step("Start from the Left-Hand Side", eq(`\\text{LHS} = \\frac{\\sin x}{1 + \\cos x} + \\frac{1 + \\cos x}{\\sin x}`)),
          step("Take a Common Denominator", `The common denominator is $\\sin x\\,(1+\\cos x)$:\n${eq(`= \\frac{\\sin^{2}x + (1 + \\cos x)^{2}}{\\sin x\\,(1 + \\cos x)}`)}`),
          step("Expand the Square", eq(`(1 + \\cos x)^{2} = 1 + 2\\cos x + \\cos^{2}x`)),
          step("Substitute the Expansion", eq(`= \\frac{\\sin^{2}x + 1 + 2\\cos x + \\cos^{2}x}{\\sin x\\,(1 + \\cos x)}`)),
          step("Use the Pythagorean Identity", `Group $\\sin^{2}x + \\cos^{2}x = 1$:\n${eq(`= \\frac{1 + 1 + 2\\cos x}{\\sin x\\,(1 + \\cos x)} = \\frac{2 + 2\\cos x}{\\sin x\\,(1 + \\cos x)}`)}`),
          step("Factor the Numerator", eq(`= \\frac{2(1 + \\cos x)}{\\sin x\\,(1 + \\cos x)}`)),
          step("Cancel the Common Factor", `Cancel $(1+\\cos x)$, valid wherever $\\cos x \\neq -1$:\n${eq(`= \\frac{2}{\\sin x} = 2\\csc x`)}`),
          step("Conclude", `LHS $= 2\\csc x =$ RHS. $\\blacksquare$`),
        ],
        check: (input) => expressionsAgree(input, "2/sin(x)", [0.5, 1.1, 2.0, -0.8, 2.6]),
      };
    }
    return {
      category: "trig",
      prompt: `Prove the identity\n$$\\frac{\\cos x}{1 - \\sin x} = \\sec x + \\tan x$$\nSimplify the left-hand side and enter the equivalent expression (use 1/cos(x) for sec).`,
      correctAnswer: "1/cos(x) + tan(x)",
      hint: "Multiply top and bottom by the conjugate (1 + sin x).",
      answerFormat: "an expression in x, e.g. 1/cos(x)+tan(x)",
      steps: [
        step("Start from the Left-Hand Side", eq(`\\text{LHS} = \\frac{\\cos x}{1 - \\sin x}`)),
        step("Multiply by the Conjugate", `Multiplying top and bottom by $(1 + \\sin x)$ changes nothing but the form:\n${eq(`= \\frac{\\cos x\\,(1 + \\sin x)}{(1 - \\sin x)(1 + \\sin x)}`)}`),
        step("Expand the Denominator", `This is a difference of squares:\n${eq(`(1 - \\sin x)(1 + \\sin x) = 1 - \\sin^{2}x`)}`),
        step("Apply the Pythagorean Identity", eq(`1 - \\sin^{2}x = \\cos^{2}x`)),
        step("Substitute Back", eq(`= \\frac{\\cos x\\,(1 + \\sin x)}{\\cos^{2}x}`)),
        step("Cancel One Factor of cos x", eq(`= \\frac{1 + \\sin x}{\\cos x}`)),
        step("Split the Fraction", eq(`= \\frac{1}{\\cos x} + \\frac{\\sin x}{\\cos x} = \\sec x + \\tan x`)),
        step("Conclude", `LHS $= \\sec x + \\tan x =$ RHS. $\\blacksquare$`),
      ],
      check: (input) => expressionsAgree(input, "1/cos(x) + tan(x)", [0.4, 1.0, 2.0, -0.7, 2.5]),
    };
  }

  if (which === "sum-formula") {
    const target = pick([75, 15, 105] as const);
    const value = target === 75 ? Math.cos((75 * Math.PI) / 180) : target === 15 ? Math.cos((15 * Math.PI) / 180) : Math.cos((105 * Math.PI) / 180);
    const parts = target === 75 ? [45, 30] : target === 15 ? [45, 30] : [60, 45];
    const op = target === 15 ? "-" : "+";
    return {
      category: "trig",
      prompt: `Find the exact value of $\\cos(${target}°)$ using the ${op === "+" ? "sum" : "difference"} formula, then give its decimal value to 4 places.`,
      correctAnswer: fmt(value),
      hint: `Write ${target}° as ${parts[0]}° ${op} ${parts[1]}° and use cos(A ± B) = cosA cosB ∓ sinA sinB.`,
      answerFormat: "a number, e.g. 0.2588",
      steps: [
        step("Split the Angle", eq(`${target}° = ${parts[0]}° ${op} ${parts[1]}°`)),
        step("State the Formula", eq(`\\cos(A ${op} B) = \\cos A\\cos B ${op === "+" ? "-" : "+"} \\sin A\\sin B`)),
        step("Write the Known Exact Values", eq(`\\cos ${parts[0]}° = ${parts[0] === 45 ? "\\tfrac{1}{\\sqrt2}" : "\\tfrac{1}{2}"},\\; \\sin ${parts[0]}° = ${parts[0] === 45 ? "\\tfrac{1}{\\sqrt2}" : "\\tfrac{\\sqrt3}{2}"},\\; \\cos ${parts[1]}° = ${parts[1] === 30 ? "\\tfrac{\\sqrt3}{2}" : "\\tfrac{1}{\\sqrt2}"},\\; \\sin ${parts[1]}° = ${parts[1] === 30 ? "\\tfrac{1}{2}" : "\\tfrac{1}{\\sqrt2}"}`)),
        step("Substitute into the Formula", eq(`\\cos(${target}°) = \\cos ${parts[0]}°\\cos ${parts[1]}° ${op === "+" ? "-" : "+"} \\sin ${parts[0]}°\\sin ${parts[1]}°`)),
        step("Multiply Each Product", `Carrying out both products and combining over a common denominator gives the exact surd form.`),
        step("Decimal Value", eq(`\\cos(${target}°) \\approx ${fmt(value)}`)),
        step("Sanity Check", `$${target}°$ is in quadrant ${target < 90 ? "I, where cosine is positive" : "II, where cosine is negative"} — matching the sign of the answer.`),
      ],
      check: (input) => { const v = parseNumberAnswer(input); return v !== null && numericallyClose(v, value, 5e-3); },
    };
  }

  if (which === "quadratic-eq") {
    // 2sin²θ − 3sinθ + 1 = 0 → sinθ = 1/2 or 1 → θ = 30°, 150°, 90°
    const solutions = [30, 90, 150];
    return {
      category: "trig",
      prompt: `Solve for $\\theta$ in $0° \\le \\theta < 360°$:\n$$2\\sin^{2}\\theta - 3\\sin\\theta + 1 = 0$$\nEnter all solutions in degrees, separated by commas.`,
      correctAnswer: "30°, 90°, 150°",
      hint: "Substitute s = sinθ to get a quadratic in s, solve it, then find every angle for each value of s.",
      answerFormat: "angles in degrees, e.g. 30, 90, 150",
      steps: [
        step("Substitute to Make It a Quadratic", `Let $s = \\sin\\theta$. The equation becomes an ordinary quadratic:\n${eq(`2s^{2} - 3s + 1 = 0`)}`),
        step("Factor the Quadratic", eq(`2s^{2} - 3s + 1 = (2s - 1)(s - 1) = 0`)),
        step("Solve for s", eq(`s = \\tfrac{1}{2} \\quad\\text{or}\\quad s = 1`)),
        step("Return to θ — First Case", `$\\sin\\theta = \\tfrac{1}{2}$ has reference angle $30°$, and sine is positive in quadrants I and II:\n${eq(`\\theta = 30° \\quad\\text{or}\\quad \\theta = 180° - 30° = 150°`)}`),
        step("Return to θ — Second Case", `$\\sin\\theta = 1$ happens at exactly one angle in a full turn:\n${eq(`\\theta = 90°`)}`),
        step("Check the Interval", `All three angles $30°, 90°, 150°$ lie in $[0°, 360°)$, so all are kept.`),
        step("Verify One Solution", eq(`2\\sin^{2}(30°) - 3\\sin(30°) + 1 = 2\\left(\\tfrac14\\right) - \\tfrac32 + 1 = 0\\quad\\checkmark`)),
      ],
      check: (input) => matchesSet(input, solutions, 0.5),
    };
  }

  const a = randInt(4, 12), b = randInt(4, 12), C = pick([60, 120, 45]);
  const cSq = a * a + b * b - 2 * a * b * Math.cos((C * Math.PI) / 180);
  const c = Math.sqrt(cSq);
  return {
    category: "trig",
    prompt: `In triangle $ABC$, $a = ${a}$, $b = ${b}$, and the included angle $C = ${C}°$. Find the length of side $c$, correct to 3 decimal places.`,
    correctAnswer: fmt(c),
    hint: "Law of cosines: c² = a² + b² − 2ab·cos C.",
    answerFormat: "a number",
    steps: [
      step("State the Law of Cosines", `The included angle sits between the two known sides, which is exactly when the law of cosines applies:\n${eq(`c^{2} = a^{2} + b^{2} - 2ab\\cos C`)}`),
      step("Substitute the Given Values", eq(`c^{2} = ${a}^{2} + ${b}^{2} - 2(${a})(${b})\\cos(${C}°)`)),
      step("Square the Sides", eq(`c^{2} = ${a * a} + ${b * b} - ${2 * a * b}\\cos(${C}°)`)),
      step("Evaluate the Cosine", eq(`\\cos(${C}°) = ${fmt(Math.cos((C * Math.PI) / 180))}`)),
      step("Multiply Out", eq(`c^{2} = ${a * a + b * b} - (${fmt(2 * a * b * Math.cos((C * Math.PI) / 180))}) = ${fmt(cSq)}`)),
      step("Take the Square Root", `Length is positive, so take the positive root:\n${eq(`c = \\sqrt{${fmt(cSq)}} = ${fmt(c)}`)}`),
      step("Sanity Check", `${C > 90 ? `Since $C > 90°$, side $c$ should be longer than both $a$ and $b$ — and $${fmt(c)}$ is.` : `Since $C < 90°$, side $c$ should be shorter than $a + b = ${a + b}$ — and $${fmt(c)}$ is.`}`),
    ],
    check: (input) => { const v = parseNumberAnswer(input); return v !== null && numericallyClose(v, c, 5e-3); },
  };
}

// ── Word problems ─────────────────────────────────────────────────────────────
function genWord(diff: Difficulty): Problem {
  if (diff === "hard") return pick(HARD_WORD)(diff);
  return pick(diff === "easy" ? EASY_WORD : MEDIUM_WORD)(diff);
}

const EASY_WORD: ((d: Difficulty) => Problem)[] = [
  () => {
    const l = randInt(4, 20), w = randInt(3, 18);
    const area = l * w, per = 2 * (l + w);
    return {
      category: "word",
      prompt: `A rectangular garden is ${l} m long and ${w} m wide. What is its area, in square metres?`,
      correctAnswer: `${area}`,
      hint: "Area of a rectangle = length × width.",
      answerFormat: "a number",
      steps: [
        step("Write the Formula", eq(`A = l \\times w`)),
        step("Substitute the Given Values", eq(`A = ${l} \\times ${w}`)),
        step("Multiply", eq(`A = ${area}\\text{ m}^{2}`)),
        step("Related Result", `For reference, its perimeter would be $2(${l}+${w}) = ${per}$ m.`),
      ],
      check: (i) => { const v = parseNumberAnswer(i); return v !== null && numericallyClose(v, area, 1e-3); },
    };
  },
  () => {
    const v = randInt(30, 110), t = randInt(2, 6);
    const d = v * t;
    return {
      category: "word",
      prompt: `A car travels at a constant speed of ${v} km/h for ${t} hours. How far does it travel, in km?`,
      correctAnswer: `${d}`,
      hint: "Distance = speed × time.",
      answerFormat: "a number",
      steps: [
        step("Write the Formula", eq(`d = v \\times t`)),
        step("Substitute", eq(`d = ${v} \\times ${t}`)),
        step("Multiply", eq(`d = ${d}\\text{ km}`)),
      ],
      check: (i) => { const x = parseNumberAnswer(i); return x !== null && numericallyClose(x, d, 1e-3); },
    };
  },
  () => {
    const price = randInt(200, 2000), disc = randInt(5, 40);
    const off = (price * disc) / 100, final = price - off;
    return {
      category: "word",
      prompt: `A jacket costs $${price}. It is on sale with a ${disc}% discount. What is the sale price, in dollars?`,
      correctAnswer: `${final}`,
      hint: "Find the discount amount first, then subtract it from the original price.",
      answerFormat: "a number",
      steps: [
        step("Find the Discount Amount", eq(`${price} \\times \\frac{${disc}}{100} = ${off}`)),
        step("Subtract from the Original Price", eq(`${price} - ${off} = ${final}`)),
        step("Alternative One-Step Method", `Paying $(100 - ${disc})\\% = ${100 - disc}\\%$ of the price gives the same result:\n${eq(`${price}\\times${(100 - disc) / 100} = ${final}`)}`),
      ],
      check: (i) => { const x = parseNumberAnswer(i); return x !== null && numericallyClose(x, final, 1e-2); },
    };
  },
  () => {
    const b = randInt(4, 20), h = randInt(4, 20);
    const area = 0.5 * b * h;
    return {
      category: "word",
      prompt: `A triangular flag has a base of ${b} cm and a height of ${h} cm. What is its area, in cm²?`,
      correctAnswer: `${area}`,
      hint: "Area of a triangle = ½ × base × height.",
      answerFormat: "a number",
      steps: [
        step("Write the Formula", eq(`A = \\tfrac{1}{2}\\,b\\,h`)),
        step("Substitute", eq(`A = \\tfrac{1}{2}\\times ${b}\\times ${h}`)),
        step("Multiply the Base and Height", eq(`${b}\\times${h} = ${b * h}`)),
        step("Halve the Product", eq(`A = \\frac{${b * h}}{2} = ${area}\\text{ cm}^{2}`)),
      ],
      check: (i) => { const x = parseNumberAnswer(i); return x !== null && numericallyClose(x, area, 1e-3); },
    };
  },
  () => {
    const who = pick(PEOPLE), item = pick(ITEMS).replace(/^an? /, "");
    const unit = randInt(15, 90), qty = randInt(3, 12);
    return {
      category: "word",
      prompt: `${who} buys ${qty} of the same ${item} at $${unit} each. What is the total cost, in dollars?`,
      correctAnswer: `${unit * qty}`,
      hint: "Total = price per item × number of items.",
      answerFormat: "a number",
      steps: [
        step("Write the Relationship", eq(`\\text{total} = \\text{unit price} \\times \\text{quantity}`)),
        step("Substitute the Given Values", eq(`${unit} \\times ${qty}`)),
        step("Multiply", eq(`= ${unit * qty}\\text{ dollars}`)),
      ],
      check: (i) => { const x = parseNumberAnswer(i); return x !== null && numericallyClose(x, unit * qty, 1e-3); },
    };
  },
  () => {
    const total = randInt(20, 60), pct = pick([10, 20, 25, 40, 50, 75]);
    const part = (total * pct) / 100;
    const who = pick(PEOPLE);
    return {
      category: "word",
      prompt: `${who} answered ${pct}% of the ${total} questions on a test correctly. How many questions were correct?`,
      correctAnswer: `${part}`,
      hint: "A percentage is a fraction out of 100 — multiply the total by pct/100.",
      answerFormat: "a number",
      steps: [
        step("Turn the Percentage into a Fraction", eq(`${pct}\\% = \\frac{${pct}}{100}`)),
        step("Multiply by the Total", eq(`\\frac{${pct}}{100} \\times ${total}`)),
        step("Evaluate", eq(`= ${part}\\text{ questions}`)),
      ],
      check: (i) => { const x = parseNumberAnswer(i); return x !== null && numericallyClose(x, part, 1e-3); },
    };
  },
  () => {
    const c = pick(CONTAINERS), rate = randInt(4, 25), mins = randInt(5, 40);
    const vol = rate * mins;
    return {
      category: "word",
      prompt: `${c.charAt(0).toUpperCase() + c.slice(1)} fills at a steady ${rate} litres per minute for ${mins} minutes. How many litres does it hold at the end?`,
      correctAnswer: `${vol}`,
      hint: "Volume = rate × time.",
      answerFormat: "a number of litres",
      steps: [
        step("Identify the Rate and the Time", `The rate is $${rate}$ litres per minute and the time is $${mins}$ minutes.`),
        step("Multiply Them", eq(`${rate} \\times ${mins} = ${vol}\\text{ litres}`)),
      ],
      check: (i) => { const x = parseNumberAnswer(i); return x !== null && numericallyClose(x, vol, 1e-3); },
    };
  },
  () => {
    const nums = Array.from({ length: 5 }, () => randInt(10, 90));
    const sum = nums.reduce((a, b) => a + b, 0);
    const mean = sum / nums.length;
    return {
      category: "word",
      prompt: `Find the mean of these five values:\\n$$${nums.join(",\\\\; ")}$$`,
      correctAnswer: fmt(mean),
      hint: "Mean = sum of the values ÷ how many there are.",
      answerFormat: "a number",
      steps: [
        step("Add the Values", eq(`${nums.join(" + ")} = ${sum}`)),
        step("Divide by How Many There Are", eq(`\\frac{${sum}}{5} = ${fmt(mean)}`)),
      ],
      check: (i) => { const x = parseNumberAnswer(i); return x !== null && numericallyClose(x, mean, 1e-3); },
    };
  },
];

const MEDIUM_WORD: ((d: Difficulty) => Problem)[] = [
  () => {
    const p = randInt(500, 8000), r = randInt(3, 12), t = randInt(2, 6);
    const si = (p * r * t) / 100;
    return {
      category: "word",
      prompt: `$${p} is invested at a simple interest rate of ${r}% per year for ${t} years. How much interest is earned, in dollars?`,
      correctAnswer: `${si}`,
      hint: "Simple interest = P × R × T / 100.",
      answerFormat: "a number",
      steps: [
        step("Write the Formula", eq(`SI = \\frac{P \\times R \\times T}{100}`)),
        step("Substitute the Values", eq(`SI = \\frac{${p} \\times ${r} \\times ${t}}{100}`)),
        step("Multiply the Numerator", eq(`${p} \\times ${r} = ${p * r},\\qquad ${p * r} \\times ${t} = ${p * r * t}`)),
        step("Divide by 100", eq(`SI = \\frac{${p * r * t}}{100} = ${si}`)),
      ],
      check: (i) => { const x = parseNumberAnswer(i); return x !== null && numericallyClose(x, si, 1e-2); },
    };
  },
  () => {
    const a = randInt(2, 9), b = randInt(2, 9);
    const combined = Math.round((1 / (1 / a + 1 / b)) * 1000) / 1000;
    return {
      category: "word",
      prompt: `Pipe A fills a tank in ${a} hours on its own; pipe B fills the same tank in ${b} hours on its own. Working together, how many hours do they take? Round to 3 decimal places.`,
      correctAnswer: `${combined}`,
      hint: "Add the rates, not the times: 1/A + 1/B = 1/T.",
      answerFormat: "a number",
      steps: [
        step("Convert Times into Rates", `In one hour, pipe A fills $\\frac{1}{${a}}$ of the tank and pipe B fills $\\frac{1}{${b}}$.`),
        step("Add the Rates", eq(`\\text{combined rate} = \\frac{1}{${a}} + \\frac{1}{${b}} = \\frac{${b} + ${a}}{${a * b}} = \\frac{${a + b}}{${a * b}}`)),
        step("Invert to Get the Time", `Time is the reciprocal of rate:\n${eq(`T = \\frac{${a * b}}{${a + b}}`)}`),
        step("Evaluate", eq(`T = ${combined}\\text{ hours}`)),
        step("Sanity Check", `The answer must be shorter than either pipe alone ($${Math.min(a, b)}$ h) — and $${combined} < ${Math.min(a, b)}$. ✓`),
      ],
      check: (i) => { const x = parseNumberAnswer(i); return x !== null && numericallyClose(x, combined, 0.02); },
    };
  },
  () => {
    const p = randInt(1000, 9000), r = randInt(4, 12), t = randInt(2, 5);
    const amount = Math.round(p * Math.pow(1 + r / 100, t) * 100) / 100;
    return {
      category: "word",
      prompt: `$${p} is invested at ${r}% annual compound interest for ${t} years. What is the total amount at the end? Round to 2 decimal places.`,
      correctAnswer: `${amount}`,
      hint: "A = P(1 + r/100)^t.",
      answerFormat: "a number",
      steps: [
        step("Write the Formula", eq(`A = P\\left(1 + \\frac{r}{100}\\right)^{t}`)),
        step("Compute the Growth Factor", eq(`1 + \\frac{${r}}{100} = ${1 + r / 100}`)),
        step("Raise to the Power of t", eq(`(${1 + r / 100})^{${t}} = ${fmt(Math.pow(1 + r / 100, t))}`)),
        step("Multiply by the Principal", eq(`A = ${p} \\times ${fmt(Math.pow(1 + r / 100, t))} = ${amount}`)),
        step("Compare with Simple Interest", `Simple interest would have given $${p} + \\frac{${p}\\times${r}\\times${t}}{100} = ${p + (p * r * t) / 100}$ — compounding earns more.`),
      ],
      check: (i) => { const x = parseNumberAnswer(i); return x !== null && numericallyClose(x, amount, 1); },
    };
  },
  () => {
    const v1 = randInt(20, 50), c1 = randInt(10, 40), v2 = randInt(20, 50), c2 = randInt(10, 40);
    const mixed = Math.round(((v1 * c1 + v2 * c2) / (v1 + v2)) * 100) / 100;
    return {
      category: "word",
      prompt: `${v1} L of a ${c1}% acid solution is mixed with ${v2} L of a ${c2}% acid solution. What is the acid concentration of the mixture, as a percentage? Round to 2 decimal places.`,
      correctAnswer: `${mixed}`,
      hint: "Total acid ÷ total volume × 100.",
      answerFormat: "a number (percent)",
      steps: [
        step("Acid in the First Solution", eq(`${v1} \\times \\frac{${c1}}{100} = ${(v1 * c1) / 100}\\text{ L}`)),
        step("Acid in the Second Solution", eq(`${v2} \\times \\frac{${c2}}{100} = ${(v2 * c2) / 100}\\text{ L}`)),
        step("Total Acid", eq(`${(v1 * c1) / 100} + ${(v2 * c2) / 100} = ${(v1 * c1 + v2 * c2) / 100}\\text{ L}`)),
        step("Total Volume", eq(`${v1} + ${v2} = ${v1 + v2}\\text{ L}`)),
        step("Concentration of the Mixture", eq(`\\frac{${(v1 * c1 + v2 * c2) / 100}}{${v1 + v2}} \\times 100 = ${mixed}\\%`)),
        step("Sanity Check", `The result lies between $${Math.min(c1, c2)}\\%$ and $${Math.max(c1, c2)}\\%$, as any mixture must. ✓`),
      ],
      check: (i) => { const x = parseNumberAnswer(i); return x !== null && numericallyClose(x, mixed, 0.1); },
    };
  },
  () => {
    const who = pick(PEOPLE), from = pick(CITIES);
    let to = pick(CITIES);
    if (to === from) to = CITIES[(CITIES.indexOf(from) + 3) % CITIES.length];
    const d = randInt(120, 600), v1 = randInt(50, 90), stop = randInt(20, 60);
    const drive = d / v1;
    const total = Math.round((drive + stop / 60) * 1000) / 1000;
    return {
      category: "word",
      prompt: `${who} drives the ${d} km from ${from} to ${to} at an average of ${v1} km/h, stopping for ${stop} minutes along the way. How long does the whole journey take, in hours? Round to 3 decimal places.`,
      correctAnswer: `${total}`,
      hint: "Driving time = distance ÷ speed; convert the break into hours before adding it on.",
      answerFormat: "a number of hours",
      steps: [
        step("Driving Time", eq(`t = \\frac{${d}}{${v1}} = ${fmt(drive)}\\text{ hours}`)),
        step("Convert the Break into Hours", eq(`${stop}\\text{ min} = \\frac{${stop}}{60} = ${fmt(stop / 60)}\\text{ hours}`)),
        step("Add the Two Parts", eq(`${fmt(drive)} + ${fmt(stop / 60)} = ${total}\\text{ hours}`)),
      ],
      check: (i) => { const x = parseNumberAnswer(i); return x !== null && numericallyClose(x, total, 0.02); },
    };
  },
  () => {
    const shop = pick(SHOPS), item = pick(ITEMS);
    const cost = randInt(200, 3000), profitPct = randInt(10, 45);
    const profit = (cost * profitPct) / 100;
    const sale = cost + profit;
    return {
      category: "word",
      prompt: `${shop.charAt(0).toUpperCase() + shop.slice(1)} buys ${item} for $${cost} and sells it at a ${profitPct}% profit. What is the selling price, in dollars?`,
      correctAnswer: fmt(sale),
      hint: "Selling price = cost + profit, where profit is a percentage OF THE COST.",
      answerFormat: "a number",
      steps: [
        step("Find the Profit Amount", eq(`${cost} \\times \\frac{${profitPct}}{100} = ${fmt(profit)}`)),
        step("Add It to the Cost", eq(`${cost} + ${fmt(profit)} = ${fmt(sale)}`)),
        step("One-Step Check", eq(`${cost} \\times ${1 + profitPct / 100} = ${fmt(sale)}`)),
      ],
      check: (i) => { const x = parseNumberAnswer(i); return x !== null && numericallyClose(x, sale, 0.5); },
    };
  },
  () => {
    const a = randInt(2, 9), d = randInt(2, 9), n = randInt(8, 25);
    const term = a + (n - 1) * d;
    const sum = (n * (a + term)) / 2;
    return {
      category: "word",
      prompt: `An arithmetic sequence starts at ${a} and increases by ${d} each time. What is the sum of its first ${n} terms?`,
      correctAnswer: `${sum}`,
      hint: "First find the last term, then use Sₙ = n/2 × (first + last).",
      answerFormat: "a number",
      steps: [
        step("Identify a, d and n", eq(`a = ${a},\\quad d = ${d},\\quad n = ${n}`)),
        step("Find the Last Term", eq(`a_{${n}} = a + (n-1)d = ${a} + ${n - 1}\\times${d} = ${term}`)),
        step("Write the Sum Formula", eq(`S_n = \\frac{n}{2}\\left(a + a_n\\right)`)),
        step("Substitute", eq(`S_{${n}} = \\frac{${n}}{2}\\left(${a} + ${term}\\right)`)),
        step("Evaluate", eq(`S_{${n}} = ${sum}`)),
      ],
      check: (i) => { const x = parseNumberAnswer(i); return x !== null && numericallyClose(x, sum, 1e-3); },
    };
  },
  () => {
    const r = randInt(2, 4), a = randInt(2, 6), n = randInt(5, 9);
    const power = Math.pow(r, n - 1);
    const term = a * power;
    return {
      category: "word",
      prompt: `A geometric sequence starts at ${a}, and each term is ${r} times the one before it. What is the ${n}th term?`,
      correctAnswer: `${term}`,
      hint: "aₙ = a·r^(n−1) — the exponent is one LESS than the term number.",
      answerFormat: "a number",
      steps: [
        step("Write the Formula", eq(`a_n = a\\,r^{\\,n-1}`)),
        step("Substitute", eq(`a_{${n}} = ${a}\\times ${r}^{${n - 1}}`)),
        step("Evaluate the Power", eq(`${r}^{${n - 1}} = ${power}`)),
        step("Multiply", eq(`a_{${n}} = ${a}\\times ${power} = ${term}`)),
      ],
      check: (i) => { const x = parseNumberAnswer(i); return x !== null && numericallyClose(x, term, 1e-3); },
    };
  },
];

const HARD_WORD: ((d: Difficulty) => Problem)[] = [
  () => {
    // Two trains, staggered start — long multi-part reasoning.
    const v1 = randInt(50, 80), v2 = randInt(60, 100), head = randInt(1, 3), gap = randInt(200, 600);
    const closing = v1 + v2;
    const remaining = gap - v1 * head;
    const meetAfter = remaining / closing;
    const total = Math.round((head + meetAfter) * 1000) / 1000;
    return {
      category: "word",
      prompt: `Two towns are ${gap} km apart. A train leaves town A towards town B at ${v1} km/h. ${head} hour${head === 1 ? "" : "s"} later, a second train leaves town B towards town A at ${v2} km/h.\n\nHow many hours after the FIRST train departs do the two trains meet? Round to 3 decimal places.`,
      correctAnswer: `${total}`,
      hint: "Work out how far the first train has already travelled before the second starts, then divide the remaining gap by the combined speed.",
      answerFormat: "a number of hours",
      steps: [
        step("Distance Covered Before the Second Train Starts", `In the first $${head}$ hour${head === 1 ? "" : "s"}, train 1 alone covers:\n${eq(`${v1} \\times ${head} = ${v1 * head}\\text{ km}`)}`),
        step("Remaining Gap", eq(`${gap} - ${v1 * head} = ${remaining}\\text{ km}`)),
        step("Combined Closing Speed", `Moving towards each other, the gap shrinks at the sum of the speeds:\n${eq(`${v1} + ${v2} = ${closing}\\text{ km/h}`)}`),
        step("Time to Close the Remaining Gap", eq(`t = \\frac{${remaining}}{${closing}} = ${fmt(meetAfter)}\\text{ hours}`)),
        step("Total Time from the First Departure", `Add back the head start:\n${eq(`${head} + ${fmt(meetAfter)} = ${total}\\text{ hours}`)}`),
        step("Check the Distances", `Train 1 travels $${v1}\\times${total} \\approx ${fmt(v1 * total)}$ km and train 2 travels $${v2}\\times${fmt(meetAfter)} \\approx ${fmt(v2 * meetAfter)}$ km. These add to about $${fmt(v1 * total + v2 * meetAfter)}$ km $= ${gap}$ km. ✓`),
      ],
      check: (i) => { const x = parseNumberAnswer(i); return x !== null && numericallyClose(x, total, 0.02); },
    };
  },
  () => {
    // Mixture: how much pure acid to ADD to reach a target concentration.
    const vol = randInt(20, 60), c0 = randInt(10, 30), target = randInt(40, 60);
    const acid0 = (vol * c0) / 100;
    const add = (vol * (target - c0)) / (100 - target);
    const addR = Math.round(add * 1000) / 1000;
    return {
      category: "word",
      prompt: `A tank holds ${vol} L of a ${c0}% acid solution. How many litres of PURE acid must be added so that the mixture becomes ${target}% acid? Round to 3 decimal places.`,
      correctAnswer: `${addR}`,
      hint: "Let x be the litres added. Acid becomes (initial acid + x); volume becomes (initial volume + x).",
      answerFormat: "a number of litres",
      steps: [
        step("Acid Present at the Start", eq(`${vol} \\times \\frac{${c0}}{100} = ${fmt(acid0)}\\text{ L of acid}`)),
        step("Define the Unknown", `Let $x$ be the litres of pure acid added. Pure acid is $100\\%$ acid, so it adds $x$ litres of acid AND $x$ litres of volume.`),
        step("Express the New Amounts", eq(`\\text{acid} = ${fmt(acid0)} + x, \\qquad \\text{volume} = ${vol} + x`)),
        step("Set Up the Concentration Equation", eq(`\\frac{${fmt(acid0)} + x}{${vol} + x} = \\frac{${target}}{100}`)),
        step("Cross-Multiply", eq(`100\\left(${fmt(acid0)} + x\\right) = ${target}\\left(${vol} + x\\right)`)),
        step("Expand Both Sides", eq(`${fmt(100 * acid0)} + 100x = ${target * vol} + ${target}x`)),
        step("Collect the x-Terms", eq(`100x - ${target}x = ${target * vol} - ${fmt(100 * acid0)}`)),
        step("Simplify", eq(`${100 - target}x = ${fmt(target * vol - 100 * acid0)}`)),
        step("Solve for x", eq(`x = \\frac{${fmt(target * vol - 100 * acid0)}}{${100 - target}} = ${addR}\\text{ L}`)),
        step("Verify", `New acid $= ${fmt(acid0 + add)}$ L in $${fmt(vol + add)}$ L of solution, which is $${fmt(((acid0 + add) / (vol + add)) * 100)}\\%$. ✓`),
      ],
      check: (i) => { const x = parseNumberAnswer(i); return x !== null && numericallyClose(x, addR, 0.02); },
    };
  },
  () => {
    // Optimisation: maximum area of a rectangle with fixed fencing, one side a wall.
    const fence = randInt(40, 200) * 2;
    const width = fence / 4;          // x = L/4 maximises area with a wall
    const area = 2 * width * width;
    return {
      category: "word",
      prompt: `A farmer has ${fence} m of fencing and wants to enclose a rectangular field, using a long straight wall as one entire side (so only three sides need fencing).\n\nWhat is the LARGEST area, in m², that can be enclosed?`,
      correctAnswer: `${area}`,
      hint: "Let x be each of the two sides perpendicular to the wall; the remaining side is (total − 2x). Maximise A(x).",
      answerFormat: "a number (area in m²)",
      steps: [
        step("Set Up the Variables", `Let $x$ be the length of each side perpendicular to the wall. Those two sides use $2x$ of the fencing, so the side parallel to the wall is $${fence} - 2x$.`),
        step("Write the Area Function", eq(`A(x) = x\\left(${fence} - 2x\\right) = ${fence}x - 2x^{2}`)),
        step("Differentiate", `This is a downward parabola, so its maximum is where the derivative is zero:\n${eq(`A'(x) = ${fence} - 4x`)}`),
        step("Set the Derivative to Zero", eq(`${fence} - 4x = 0`)),
        step("Solve for x", eq(`x = \\frac{${fence}}{4} = ${width}\\text{ m}`)),
        step("Confirm It Is a Maximum", `$A''(x) = -4 < 0$ everywhere, so this critical point is indeed a maximum.`),
        step("Find the Other Side", eq(`${fence} - 2(${width}) = ${fence - 2 * width}\\text{ m}`)),
        step("Compute the Maximum Area", eq(`A = ${width} \\times ${fence - 2 * width} = ${area}\\text{ m}^{2}`)),
      ],
      check: (i) => { const x = parseNumberAnswer(i); return x !== null && numericallyClose(x, area, 1e-2); },
    };
  },
  () => {
    // Three-part work rate with someone leaving partway.
    const a = randInt(4, 10), b = randInt(5, 12), worked = randInt(1, 3);
    const rateA = 1 / a, rateB = 1 / b;
    const done = (rateA + rateB) * worked;
    const remainingTime = (1 - done) / rateB;
    const total = Math.round((worked + remainingTime) * 1000) / 1000;
    return {
      category: "word",
      prompt: `Worker A can finish a job alone in ${a} days; worker B can finish the same job alone in ${b} days. They start together, but after ${worked} day${worked === 1 ? "" : "s"} worker A leaves and B finishes the job alone.\n\nHow many days in total does the job take? Round to 3 decimal places.`,
      correctAnswer: `${total}`,
      hint: "Work out the fraction completed while both work, then divide what's left by B's daily rate.",
      answerFormat: "a number of days",
      steps: [
        step("Write Each Worker's Daily Rate", eq(`\\text{A} = \\frac{1}{${a}}\\text{ job/day},\\qquad \\text{B} = \\frac{1}{${b}}\\text{ job/day}`)),
        step("Combined Rate While Both Work", eq(`\\frac{1}{${a}} + \\frac{1}{${b}} = \\frac{${b} + ${a}}{${a * b}} = ${fmt(rateA + rateB)}\\text{ job/day}`)),
        step("Fraction Completed in the First Phase", eq(`${fmt(rateA + rateB)} \\times ${worked} = ${fmt(done)}\\text{ of the job}`)),
        step("Fraction Still Remaining", eq(`1 - ${fmt(done)} = ${fmt(1 - done)}`)),
        step("Time for B to Finish Alone", eq(`\\frac{${fmt(1 - done)}}{1/${b}} = ${fmt(1 - done)} \\times ${b} = ${fmt(remainingTime)}\\text{ days}`)),
        step("Total Time", eq(`${worked} + ${fmt(remainingTime)} = ${total}\\text{ days}`)),
        step("Sanity Check", `The total is longer than if both had stayed for the whole job, but shorter than B working alone for $${b}$ days. ✓`),
      ],
      check: (i) => { const x = parseNumberAnswer(i); return x !== null && numericallyClose(x, total, 0.02); },
    };
  },
  () => {
    // Compound interest solved for time (logarithms).
    const p = randInt(1000, 5000), r = randInt(5, 15), mult = pick([2, 3]);
    const years = Math.log(mult) / Math.log(1 + r / 100);
    const yr = Math.round(years * 1000) / 1000;
    return {
      category: "word",
      prompt: `$${p} is invested at ${r}% annual compound interest. How many years does it take for the investment to grow to ${mult} times its original value? Round to 3 decimal places.`,
      correctAnswer: `${yr}`,
      hint: "Set P(1 + r/100)^t = kP, cancel P, then take logarithms of both sides.",
      answerFormat: "a number of years",
      steps: [
        step("Write the Compound Interest Equation", eq(`P\\left(1 + \\frac{r}{100}\\right)^{t} = ${mult}P`)),
        step("Cancel the Principal", `$P$ appears on both sides, so the answer does not depend on how much was invested:\n${eq(`\\left(1 + \\frac{${r}}{100}\\right)^{t} = ${mult}`)}`),
        step("Compute the Growth Factor", eq(`1 + \\frac{${r}}{100} = ${1 + r / 100}`)),
        step("Take Logarithms of Both Sides", eq(`t\\,\\ln(${1 + r / 100}) = \\ln(${mult})`)),
        step("Isolate t", eq(`t = \\frac{\\ln(${mult})}{\\ln(${1 + r / 100})}`)),
        step("Evaluate the Logarithms", eq(`t = \\frac{${fmt(Math.log(mult))}}{${fmt(Math.log(1 + r / 100))}} = ${yr}\\text{ years}`)),
        step("Interpret the Result", `After about $${yr}$ years the balance grows to ${mult} times the original amount — from ${p} to ${p * mult} dollars.`),
      ],
      check: (i) => { const x = parseNumberAnswer(i); return x !== null && numericallyClose(x, yr, 0.02); },
    };
  },
  () => {
    // Composite geometry: rectangle + semicircle, perimeter and area.
    const w = randInt(6, 20), h = randInt(4, 15);
    const r = w / 2;
    const area = w * h + (Math.PI * r * r) / 2;
    const areaR = Math.round(area * 1000) / 1000;
    return {
      category: "word",
      prompt: `A window is shaped as a rectangle ${w} m wide and ${h} m tall, topped by a semicircle whose diameter is the width of the rectangle.\n\nFind the TOTAL area of the window, in m². Round to 3 decimal places.`,
      correctAnswer: `${areaR}`,
      hint: "Split it into a rectangle and a half-circle, and add the two areas.",
      answerFormat: "a number (area in m²)",
      steps: [
        step("Split the Shape", `The window is a rectangle with a semicircle on top. Compute each area separately, then add them.`),
        step("Area of the Rectangle", eq(`A_{1} = ${w} \\times ${h} = ${w * h}\\text{ m}^{2}`)),
        step("Radius of the Semicircle", `The diameter equals the rectangle's width, so:\n${eq(`r = \\frac{${w}}{2} = ${r}\\text{ m}`)}`),
        step("Area of a Full Circle of That Radius", eq(`\\pi r^{2} = \\pi(${r})^{2} = ${fmt(Math.PI * r * r)}\\text{ m}^{2}`)),
        step("Halve It for the Semicircle", eq(`A_{2} = \\frac{${fmt(Math.PI * r * r)}}{2} = ${fmt((Math.PI * r * r) / 2)}\\text{ m}^{2}`)),
        step("Add the Two Areas", eq(`A = ${w * h} + ${fmt((Math.PI * r * r) / 2)} = ${areaR}\\text{ m}^{2}`)),
      ],
      check: (i) => { const x = parseNumberAnswer(i); return x !== null && numericallyClose(x, areaR, 0.05); },
    };
  },
  () => {
    const who = pick(PEOPLE), v = pick(VEHICLES).replace(/^an? /, "");
    const d = randInt(180, 720), slower = randInt(40, 70), faster = slower + randInt(10, 30);
    const tSlow = d / slower, tFast = d / faster;
    const saved = Math.round((tSlow - tFast) * 60);
    return {
      category: "word",
      prompt: `${who} travels ${d} km by ${v}. At ${slower} km/h the trip takes a certain time; at ${faster} km/h it takes less.\\n\\nHow many MINUTES are saved by travelling at the faster speed? Round to the nearest minute.`,
      correctAnswer: `${saved}`,
      hint: "Find each journey time separately, subtract, then convert the difference from hours into minutes.",
      answerFormat: "a number of minutes",
      steps: [
        step("Time at the Slower Speed", eq(`t_1 = \\frac{${d}}{${slower}} = ${fmt(tSlow)}\\text{ hours}`)),
        step("Time at the Faster Speed", eq(`t_2 = \\frac{${d}}{${faster}} = ${fmt(tFast)}\\text{ hours}`)),
        step("Difference in Hours", eq(`t_1 - t_2 = ${fmt(tSlow - tFast)}\\text{ hours}`)),
        step("Convert to Minutes", eq(`${fmt(tSlow - tFast)} \\times 60 \\approx ${saved}\\text{ minutes}`)),
        step("Sanity Check", `Travelling faster must save time, and the saving has to be smaller than the whole journey — both hold here.`),
      ],
      check: (i) => { const x = parseNumberAnswer(i); return x !== null && numericallyClose(x, saved, 1.5); },
    };
  },
  () => {
    const p = randInt(2000, 9000), r = randInt(6, 18), n = pick([2, 4, 12]), t = randInt(2, 5);
    const perPeriod = r / (100 * n);
    const growth = Math.pow(1 + perPeriod, n * t);
    const amount = Math.round(p * growth * 100) / 100;
    const yearly = p * Math.pow(1 + r / 100, t);
    const label = n === 2 ? "half-yearly" : n === 4 ? "quarterly" : "monthly";
    return {
      category: "word",
      prompt: `$${p} is invested at a nominal ${r}% per year, compounded ${label}, for ${t} years.\\n\\nWhat is the final amount? Round to 2 decimal places.`,
      correctAnswer: `${amount}`,
      hint: "A = P(1 + r/(100n))^(nt), where n is the number of compounding periods per year.",
      answerFormat: "a number",
      steps: [
        step("Write the General Formula", eq(`A = P\\left(1 + \\frac{r}{100n}\\right)^{nt}`)),
        step("Find the Rate per Period", eq(`\\frac{${r}}{100 \\times ${n}} = ${fmt(perPeriod)}`)),
        step("Count the Periods", eq(`n\\,t = ${n}\\times${t} = ${n * t}\\text{ periods}`)),
        step("Compute the Growth Factor", eq(`(1 + ${fmt(perPeriod)})^{${n * t}} = ${fmt(growth)}`)),
        step("Multiply by the Principal", eq(`A = ${p} \\times ${fmt(growth)} = ${amount}`)),
        step("Compare with Annual Compounding", `Compounded just once a year the same investment would reach only $${fmt(yearly)}$ — compounding more often earns more.`),
      ],
      check: (i) => { const x = parseNumberAnswer(i); return x !== null && numericallyClose(x, amount, 2); },
    };
  },
  () => {
    const base = randInt(6, 20), h0 = randInt(10, 30), drop = randInt(1, 4);
    const r0 = base / 2;
    const v0 = (Math.PI * r0 * r0 * h0) / 3;
    const h1 = h0 - drop;
    const r1 = (r0 * h1) / h0;
    const v1 = (Math.PI * r1 * r1 * h1) / 3;
    const lost = Math.round((v0 - v1) * 1000) / 1000;
    return {
      category: "word",
      prompt: `A cone-shaped tank stands point-down. It is ${h0} cm deep, ${base} cm across at the top, and full to the brim.\\n\\nThe water level then drops by ${drop} cm. How many cm³ of water were lost? Round to 3 decimal places.`,
      correctAnswer: `${lost}`,
      hint: "As the level falls the surface radius shrinks in the same proportion — use similar triangles before applying V = ⅓πr²h.",
      answerFormat: "a number (cm³)",
      steps: [
        step("Radius at the Top", eq(`r_0 = \\frac{${base}}{2} = ${fmt(r0)}\\text{ cm}`)),
        step("Volume When Full", eq(`V_0 = \\tfrac{1}{3}\\pi r_0^{2} h_0 = \\tfrac{1}{3}\\pi(${fmt(r0)})^{2}(${h0}) = ${fmt(v0)}\\text{ cm}^3`)),
        step("New Depth", eq(`h_1 = ${h0} - ${drop} = ${h1}\\text{ cm}`)),
        step("New Radius by Similar Triangles", `The cone tapers uniformly, so radius and depth keep the same ratio:\\n${eq(`\\frac{r_1}{h_1} = \\frac{r_0}{h_0} \\;\\Rightarrow\\; r_1 = \\frac{${fmt(r0)}\\times ${h1}}{${h0}} = ${fmt(r1)}\\text{ cm}`)}`),
        step("Volume Remaining", eq(`V_1 = \\tfrac{1}{3}\\pi(${fmt(r1)})^{2}(${h1}) = ${fmt(v1)}\\text{ cm}^3`)),
        step("Water Lost", eq(`V_0 - V_1 = ${fmt(v0)} - ${fmt(v1)} = ${lost}\\text{ cm}^3`)),
      ],
      check: (i) => { const x = parseNumberAnswer(i); return x !== null && numericallyClose(x, lost, 0.05); },
    };
  },
  () => {
    const who = pick(PEOPLE);
    const [big, small] = pick([[500, 100], [1000, 500], [100, 50]]);
    const bigCount = randInt(4, 15), smallCount = randInt(4, 15);
    const totalNotes = bigCount + smallCount;
    const totalValue = big * bigCount + small * smallCount;
    return {
      category: "word",
      prompt: `${who} has ${totalNotes} banknotes, each one either a ${big}-rupee note or a ${small}-rupee note, worth ${totalValue} rupees altogether.\\n\\nHow many ${big}-rupee notes does ${who} have?`,
      correctAnswer: `${bigCount}`,
      hint: "Let x be the number of large notes and y the small ones: one equation counts the notes, the other adds up their value.",
      answerFormat: "a number of notes",
      steps: [
        step("Define the Unknowns", `Let $x$ be the number of ${big}-rupee notes and $y$ the number of ${small}-rupee notes.`),
        step("Equation from the Count", eq(`x + y = ${totalNotes}`)),
        step("Equation from the Value", eq(`${big}x + ${small}y = ${totalValue}`)),
        step("Express y in Terms of x", eq(`y = ${totalNotes} - x`)),
        step("Substitute into the Value Equation", eq(`${big}x + ${small}(${totalNotes} - x) = ${totalValue}`)),
        step("Expand the Bracket", eq(`${big}x + ${small * totalNotes} - ${small}x = ${totalValue}`)),
        step("Collect the x-Terms", eq(`${big - small}x = ${totalValue} - ${small * totalNotes} = ${totalValue - small * totalNotes}`)),
        step("Solve for x", eq(`x = \\frac{${totalValue - small * totalNotes}}{${big - small}} = ${bigCount}`)),
        step("Find y and Check", eq(`y = ${totalNotes} - ${bigCount} = ${smallCount},\\qquad ${big}(${bigCount}) + ${small}(${smallCount}) = ${totalValue}\\;\\checkmark`)),
      ],
      check: (i) => { const v = parseNumberAnswer(i); return v !== null && numericallyClose(v, bigCount, 1e-3); },
    };
  },
];

// ── Public API ────────────────────────────────────────────────────────────────
export const GENERATORS: Record<Category, (diff: Difficulty) => Problem> = {
  derivative: genDerivative,
  integral: genIntegral,
  limit: genLimit,
  linear: genLinear,
  quadratic: genQuadratic,
  matrix: genMatrix,
  trig: genTrig,
  word: genWord,
};

export const CATEGORY_LABELS: Record<Category, string> = {
  derivative: "Derivatives",
  integral: "Integrals",
  limit: "Limits",
  linear: "Linear Equations",
  quadratic: "Quadratics",
  matrix: "Matrices",
  trig: "Trigonometry",
  word: "Word Problems",
};

export const ALL_CATEGORIES: Category[] = [
  "derivative", "integral", "limit", "linear", "quadratic", "matrix", "trig", "word",
];

/** Builds one problem, retrying a couple of times if a generator throws. */
export function generateProblem(category: Category | "mixed", difficulty: Difficulty): Problem {
  for (let attempt = 0; attempt < 4; attempt++) {
    const cat: Category = category === "mixed" ? pick(ALL_CATEGORIES) : category;
    try {
      const p = GENERATORS[cat](difficulty);
      if (p.steps.length > 0) return p;
    } catch {
      // try again with a fresh random draw
    }
  }
  return genLinear(difficulty);
}

// `simplify` is imported for its side-effect-free use in future generators;
// referencing it here keeps the import honest under noUnusedLocals.
void simplify;
