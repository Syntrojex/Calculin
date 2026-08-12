import { derivative, parse, simplify, evaluate, type MathNode } from "mathjs";
import { toFraction, formatNumber, type FormatSettings } from "./number-format";

// Default display settings used when a solver is called without explicit
// settings (keeps existing call sites backward-compatible).
const DEFAULT_FORMAT_SETTINGS: FormatSettings = { numberForm: "decimal", decimalPlaces: 4 };

// ── Numeric tolerance constants ───────────────────────────────────────────────
const EPS      = 1e-10;  // near-zero test (e.g. "is this coefficient zero?")
const EPS_TIGHT = 1e-12; // very tight equality (e.g. power = -1 exactly)
const EPS_VERIF = 1e-3;  // antiderivative numeric verification tolerance
const EPS_ROUND = 1e8;   // round-trip factor for display (8 decimal places)
const EPS_SEC   = 1e-6;  // second-derivative sign test for extrema classification
const EPS_DET   = 1e-12; // near-singular determinant threshold
const EPS_NR    = 1e-10; // Newton-Raphson convergence threshold

// ── Properly typed mathjs internal node shapes ────────────────────────────────
// mathjs exports MathNode as an opaque base type; these interfaces describe the
// concrete sub-types we rely on in the integrator so we don't need `as unknown`.
interface OperatorNode extends MathNode {
  type: "OperatorNode";
  fn: string;
  args: MathNode[];
}
interface FunctionNode extends MathNode {
  type: "FunctionNode";
  fn: { name: string };
  args: MathNode[];
}
interface SymbolNode extends MathNode {
  type: "SymbolNode";
  name: string;
}

function asOperator(node: MathNode): OperatorNode | null {
  return node.type === "OperatorNode" ? (node as unknown as OperatorNode) : null;
}
function asFunctionNode(node: MathNode): FunctionNode | null {
  return node.type === "FunctionNode" ? (node as unknown as FunctionNode) : null;
}
function asSymbol(node: MathNode): SymbolNode | null {
  return node.type === "SymbolNode" ? (node as unknown as SymbolNode) : null;
}
// ─────────────────────────────────────────────────────────────────────────────

// ── Input validation helpers ──────────────────────────────────────────────────
// mathjs's parse("") does NOT throw — it silently returns a ConstantNode whose
// value is the literal `undefined`, which then propagates as the string
// "undefined" through every downstream calculation (derivative, integral,
// steps, etc.) instead of surfacing as an error. Every public solve* function
// below calls this guard first so blank/whitespace-only input produces a
// clean, honest error message instead of leaking "undefined"/"NaN"/"Infinity"
// into the UI.
class MathInputError extends Error {}

function assertNonEmptyExpression(expression: string): void {
  if (!expression || !expression.trim()) {
    throw new MathInputError("Please enter an expression.");
  }
}

function assertFiniteBound(value: number, label: string): void {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    throw new MathInputError(`Please enter a valid ${label}.`);
  }
}

/** Wraps a computed numeric result: turns Infinity/-Infinity/NaN (e.g. from
 *  a "1/0"-style expression, or a function that's undefined across the whole
 *  interval) into a clear error instead of displaying the raw special value. */
function assertUsableNumber(value: number, context: string): void {
  if (Number.isNaN(value)) {
    throw new MathInputError(`${context} is undefined for these inputs (not a real number).`);
  }
  if (!Number.isFinite(value)) {
    throw new MathInputError(`${context} diverges to infinity for these inputs.`);
  }
}

/** Friendly errors (empty input, invalid bounds, NaN/Infinity results) are
 *  shown as-is. Everything else (mathjs parser exceptions, etc.) keeps the
 *  "Error: ..." prefix so it's clear it's a raw parsing/syntax failure. */
function describeError(e: unknown): string {
  if (e instanceof MathInputError) return e.message;
  const msg = e instanceof Error ? e.message : "Unknown error";
  if (/complex number/i.test(msg)) {
    return "This expression involves complex (non-real) numbers, which this solver doesn't support — try the Complex Numbers calculator instead.";
  }
  return `Error: ${msg}`;
}
// ─────────────────────────────────────────────────────────────────────────────

export interface MathResult {
  input: string;
  result: string;
  steps: string[];
  error?: string;
  /** Raw numeric value (when the result is a single number) so the UI can apply
   *  the user's Decimal/Fraction/Scientific display settings instead of a fixed format. */
  numericResult?: number;
}

/** True if `variable` appears anywhere in this subtree (used to tell a real
 *  product-of-functions like x·sin(x) apart from a constant coefficient
 *  like 2·x², which only needs the power rule + constant multiple rule). */
function nodeContainsVariable(node: MathNode, variable: string): boolean {
  let found = false;
  node.traverse((n: MathNode) => {
    if (n.type === "SymbolNode" && (n as unknown as { name: string }).name === variable) found = true;
  });
  return found;
}

/** Walks the actual parsed expression tree to determine which differentiation
 *  rules genuinely apply — replaces the old approach of substring-matching
 *  the raw input text (e.g. checking for a bare "*" character), which
 *  couldn't distinguish a real product-of-functions from a plain scalar
 *  coefficient and so flagged "Product Rule may apply" on almost every
 *  polynomial with a coefficient. */
function detectDerivativeRules(node: MathNode, variable: string): string[] {
  const rules = new Set<string>();
  node.traverse((n: MathNode) => {
    if (n.type === "OperatorNode") {
      const op = n as unknown as { op: string; fn: string; args: MathNode[] };
      if (op.op === "^") {
        rules.add("power");
      } else if (op.fn === "multiply" && op.args.length === 2) {
        const [a, b] = op.args;
        if (nodeContainsVariable(a, variable) && nodeContainsVariable(b, variable)) {
          rules.add("product");
        } else {
          rules.add("constant multiple");
        }
      } else if (op.fn === "divide" && op.args.length === 2) {
        if (nodeContainsVariable(op.args[1], variable)) rules.add("quotient");
      } else if ((op.fn === "add" || op.fn === "subtract") && op.args.length === 2) {
        rules.add("sum");
      }
    } else if (n.type === "FunctionNode") {
      const name = (n as unknown as { fn: { name: string } }).fn.name;
      if (name === "sin") rules.add("sin");
      else if (name === "cos") rules.add("cos");
      else if (name === "tan") rules.add("tan");
      else if (name === "log" || name === "ln") rules.add("ln");
      else if (name === "exp") rules.add("exp");
      else if (name === "sqrt") rules.add("sqrt");
    }
  });
  return [...rules];
}

const DERIVATIVE_RULE_TEXT: Record<string, string> = {
  power: "Power Rule: d/dx[xⁿ] = n·xⁿ⁻¹",
  "constant multiple": "Constant Multiple Rule: d/dx[c·f(x)] = c·f'(x)",
  sum: "Sum/Difference Rule: d/dx[f ± g] = f' ± g'",
  product: "Product Rule: d/dx[f·g] = f'·g + f·g'",
  quotient: "Quotient Rule: d/dx[f/g] = (f'·g − f·g') / g²",
  sin: "d/dx[sin(x)] = cos(x)",
  cos: "d/dx[cos(x)] = -sin(x)",
  tan: "d/dx[tan(x)] = sec²(x)",
  ln: "d/dx[ln(x)] = 1/x",
  exp: "d/dx[eˣ] = eˣ",
  sqrt: "d/dx[√x] = 1/(2√x)",
};

// A sensible reading order: structural rules first, then function-specific ones.
const DERIVATIVE_RULE_ORDER = ["power", "constant multiple", "sum", "product", "quotient", "sin", "cos", "tan", "ln", "exp", "sqrt"];

// Derivative solver
export function solveDerivative(
  expression: string,
  variable: string = "x"
): MathResult {
  try {
    assertNonEmptyExpression(expression);
    const node = parse(expression);
    const steps: string[] = [];

    steps.push(`Given: f(${variable}) = ${node.toString()}`);
    steps.push(`Find: f'(${variable})`);

    const deriv = derivative(node, variable);
    const simplified = simplify(deriv);

    // Identify rules actually used, from the real expression tree — not
    // guessed from the raw input text.
    const rulesUsed = detectDerivativeRules(node, variable);
    for (const rule of DERIVATIVE_RULE_ORDER) {
      if (rulesUsed.includes(rule)) steps.push(DERIVATIVE_RULE_TEXT[rule]);
    }

    steps.push(`Derivative = ${deriv.toString()}`);
    steps.push(`Simplified = ${simplified.toString()}`);

    return { input: expression, result: simplified.toString(), steps };
  } catch (e: unknown) {
    return { input: expression, result: "", steps: [], error: describeError(e) };
  }
}

// Nth derivative
export function solveNthDerivative(
  expression: string,
  variable: string = "x",
  order: number = 1
): MathResult {
  try {
    assertNonEmptyExpression(expression);
    if (!Number.isInteger(order) || order < 1) {
      throw new MathInputError("Please enter a whole number order of 1 or higher.");
    }
    const steps: string[] = [];
    let current = parse(expression);
    const ordinalSuffix = (n: number) =>
      n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th";
    steps.push(`Given: f(${variable}) = ${current.toString()}`);
    steps.push(`Find: ${order}${ordinalSuffix(order)} derivative`);

    for (let i = 1; i <= order; i++) {
      const deriv = derivative(current, variable);
      const simplified = simplify(deriv);
      const suffix = ordinalSuffix(i);
      steps.push(`${i}${suffix} derivative = ${simplified.toString()}`);
      current = simplified;
    }

    return { input: expression, result: current.toString(), steps };
  } catch (e: unknown) {
    return { input: expression, result: "", steps: [], error: describeError(e) };
  }
}

// Numerical integration using Simpson's rule
export function solveDefiniteIntegral(
  expression: string,
  variable: string = "x",
  lower: number,
  upper: number,
  n: number = 1000,
  settings: FormatSettings = DEFAULT_FORMAT_SETTINGS
): MathResult {
  try {
    assertNonEmptyExpression(expression);
    assertFiniteBound(lower, "lower bound");
    assertFiniteBound(upper, "upper bound");

    const steps: string[] = [];
    steps.push(`Given: ∫ from ${lower} to ${upper} of (${expression}) d${variable}`);

    if (n % 2 !== 0) n++;
    const h = (upper - lower) / n;

    let sum = 0;
    const scope: Record<string, number> = {};

    for (let i = 0; i <= n; i++) {
      const xi = lower + i * h;
      scope[variable] = xi;
      const fxi = evaluate(expression, scope) as number;
      if (i === 0 || i === n) sum += fxi;
      else if (i % 2 === 0) sum += 2 * fxi;
      else sum += 4 * fxi;
    }

    const result = (h / 3) * sum;
    assertUsableNumber(result, "This integral");

    steps.push(`Method: Simpson's Rule (${n} intervals)`);
    steps.push(`Step size h = (${upper} - ${lower}) / ${n} = ${h.toFixed(6)}`);
    steps.push(`Apply: (h/3) × [f(a) + 4·f(x₁) + 2·f(x₂) + ... + f(b)]`);

    const rounded = Math.round(result * EPS_ROUND) / EPS_ROUND;
    if (Math.abs(result - Math.round(result)) < EPS) {
      steps.push(`Result = ${formatNumber(Math.round(result), settings)} (exact)`);
    } else {
      const frac = toFraction(result, 1000);
      const isNiceFraction = frac.includes("/") && Math.abs(evaluateFractionString(frac) - result) < 1e-5;
      steps.push(`Result ≈ ${formatNumber(rounded, settings)}${isNiceFraction ? `  (= ${frac})` : ""}`);
    }

    return { input: expression, result: rounded.toString(), steps, numericResult: rounded };
  } catch (e: unknown) {
    return { input: expression, result: "", steps: [], error: describeError(e) };
  }
}

function evaluateFractionString(frac: string): number {
  try {
    const parts = frac.trim().split(" ");
    if (parts.length === 2) {
      const whole = parseFloat(parts[0]);
      const [n, d] = parts[1].split("/").map(Number);
      return whole + n / d;
    }
    if (frac.includes("/")) {
      const [n, d] = frac.split("/").map(Number);
      return n / d;
    }
    return parseFloat(frac);
  } catch {
    return NaN;
  }
}

// Double integral using Simpson's rule on both variables
export function solveDoubleIntegral(
  expression: string,
  varX: string,
  varY: string,
  xLower: number,
  xUpper: number,
  yLower: number,
  yUpper: number,
  n: number = 100,
  settings: FormatSettings = DEFAULT_FORMAT_SETTINGS
): MathResult {
  try {
    assertNonEmptyExpression(expression);
    assertFiniteBound(xLower, `${varX || "x"} lower bound`);
    assertFiniteBound(xUpper, `${varX || "x"} upper bound`);
    assertFiniteBound(yLower, `${varY || "y"} lower bound`);
    assertFiniteBound(yUpper, `${varY || "y"} upper bound`);
    if (!varX.trim() || !varY.trim()) {
      throw new MathInputError("Please enter both variable names.");
    }
    if (varX.trim() === varY.trim()) {
      throw new MathInputError("The two variables must be different (e.g. x and y).");
    }

    const steps: string[] = [];
    steps.push(`Given: ∬ (${expression}) d${varY} d${varX}`);
    steps.push(`${varX}: [${xLower}, ${xUpper}],  ${varY}: [${yLower}, ${yUpper}]`);

    if (n % 2 !== 0) n++;
    const hx = (xUpper - xLower) / n;
    const hy = (yUpper - yLower) / n;

    let totalSum = 0;
    const scope: Record<string, number> = {};

    for (let i = 0; i <= n; i++) {
      const xi = xLower + i * hx;
      scope[varX] = xi;
      const wx = i === 0 || i === n ? 1 : i % 2 === 0 ? 2 : 4;

      for (let j = 0; j <= n; j++) {
        const yj = yLower + j * hy;
        scope[varY] = yj;
        const wy = j === 0 || j === n ? 1 : j % 2 === 0 ? 2 : 4;

        const fval = evaluate(expression, scope) as number;
        totalSum += wx * wy * fval;
      }
    }

    const result = (hx * hy / 9) * totalSum;
    assertUsableNumber(result, "This double integral");
    const rounded = Math.round(result * EPS_ROUND) / EPS_ROUND;

    steps.push(`Method: Double Simpson's Rule (${n}×${n} grid)`);
    steps.push(`hx = ${hx.toFixed(6)}, hy = ${hy.toFixed(6)}`);
    steps.push(`Result ≈ ${formatNumber(rounded, settings)}`);

    return { input: expression, result: rounded.toString(), steps, numericResult: rounded };
  } catch (e: unknown) {
    return { input: expression, result: "", steps: [], error: describeError(e) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Recursive symbolic indefinite integrator.
// Handles: sums/differences (term-by-term), constant multiples, power rule
// (with linear substitution ax+b), basic trig/exp/log/sqrt, and reciprocal
// forms. Falls back gracefully (returns null) for terms it can't solve, and
// the caller reports those terms honestly instead of pretending.
// ─────────────────────────────────────────────────────────────────────────────

type IntegralPiece = { antiderivative: string; rule: string } | null;

function isConstantExpr(node: MathNode, variable: string): boolean {
  return !node.toString().includes(variable);
}

// Detects expr as (coefficient * variable + constant), e.g. "2*x + 3" → {a:2, b:3}
// Used for chain-rule-by-inspection on linear arguments like sin(2x+1).
function tryLinear(node: MathNode, variable: string): { a: number; b: number } | null {
  try {
    const simplified = simplify(node);
    const str = simplified.toString();
    // Try evaluating derivative — if constant, it's linear (or constant) in `variable`.
    const d = simplify(derivative(simplified, variable));
    if (!isConstantExpr(d, variable)) return null;
    const a = d.evaluate ? d.evaluate() : evaluate(d.toString());
    const b = evaluate(str, { [variable]: 0 });
    if (typeof a !== "number" || typeof b !== "number" || !isFinite(a) || !isFinite(b)) return null;
    return { a, b };
  } catch {
    return null;
  }
}

function fmtNum(n: number): string {
  const r = Math.round(n * EPS_ROUND) / EPS_ROUND;
  return r.toString();
}

function wrapLinearArg(a: number, b: number, variable: string): string {
  if (a === 1 && b === 0) return variable;
  const bx = b === 0 ? "" : b > 0 ? ` + ${fmtNum(b)}` : ` - ${fmtNum(Math.abs(b))}`;
  const ax = a === 1 ? variable : `${fmtNum(a)}*${variable}`;
  return `${ax}${bx}`;
}

function integrateNode(node: MathNode, variable: string, steps: string[]): IntegralPiece {
  const str = node.toString();

  // Constant (no variable present)
  if (isConstantExpr(node, variable)) {
    // "1/0"-style terms simplify to a literal Infinity/NaN/undefined node —
    // treat those as unsolvable rather than writing "Infinity * x + C" or
    // "(undefined)*x + C" into the result.
    if (str === "undefined" || str === "Infinity" || str === "-Infinity" || str === "NaN") {
      return null;
    }
    const k = str === "0" ? "0" : str;
    steps.push(`∫ (${k}) d${variable} = (${k})·${variable}   [constant rule]`);
    return { antiderivative: k === "0" ? "0" : `(${k})*${variable}`, rule: "constant rule" };
  }

  // Sum / Difference: integrate term by term
  if (asOperator(node)?.fn === "add") {
    const args = asOperator(node)!.args;
    const parts: string[] = [];
    for (const arg of args) {
      const piece = integrateNode(arg, variable, steps);
      if (!piece) return null;
      parts.push(piece.antiderivative);
    }
    return { antiderivative: parts.join(" + ").replace(/\+ -/g, "- "), rule: "sum rule" };
  }
  if (asOperator(node)?.fn === "subtract") {
    const args = asOperator(node)!.args;
    const left = integrateNode(args[0], variable, steps);
    const right = integrateNode(args[1], variable, steps);
    if (!left || !right) return null;
    return { antiderivative: `${left.antiderivative} - (${right.antiderivative})`, rule: "difference rule" };
  }
  // Unary minus: -f(x)
  if (asOperator(node)?.fn === "unaryMinus") {
    const arg = asOperator(node)!.args[0];
    const piece = integrateNode(arg, variable, steps);
    if (!piece) return null;
    return { antiderivative: `-(${piece.antiderivative})`, rule: "constant-multiple rule (k=-1)" };
  }

  // Multiplication: pull out constant factor → c · ∫f(x)dx
  if (asOperator(node)?.fn === "multiply") {
    const args = asOperator(node)!.args;
    if (args.length === 2) {
      const [lhs, rhs] = args;
      if (isConstantExpr(lhs, variable)) {
        const piece = integrateNode(rhs, variable, steps);
        if (!piece) return null;
        steps.push(`Constant Multiple Rule: pull out (${lhs.toString()})`);
        return { antiderivative: `(${lhs.toString()})*(${piece.antiderivative})`, rule: "constant multiple rule" };
      }
      if (isConstantExpr(rhs, variable)) {
        const piece = integrateNode(lhs, variable, steps);
        if (!piece) return null;
        steps.push(`Constant Multiple Rule: pull out (${rhs.toString()})`);
        return { antiderivative: `(${rhs.toString()})*(${piece.antiderivative})`, rule: "constant multiple rule" };
      }
    }
    return null; // general product rule (integration by parts) not attempted
  }

  // Division: f(x)/c where c is constant
  if (asOperator(node)?.fn === "divide") {
    const args = asOperator(node)!.args;
    const [num, denom] = args;
    if (isConstantExpr(denom, variable)) {
      const piece = integrateNode(num, variable, steps);
      if (!piece) return null;
      return { antiderivative: `(${piece.antiderivative})/(${denom.toString()})`, rule: "constant divisor" };
    }
    // 1/(ax+b) → ln|ax+b| / a
    if (isConstantExpr(num, variable)) {
      const lin = tryLinear(denom, variable);
      if (lin && lin.a !== 0) {
        const argStr = wrapLinearArg(lin.a, lin.b, variable);
        steps.push(`∫ 1/(${denom.toString()}) d${variable} = ln|${denom.toString()}| / ${fmtNum(lin.a)}   [reciprocal rule]`);
        return { antiderivative: `(${num.toString()})*log(abs(${argStr}))/(${fmtNum(lin.a)})`, rule: "reciprocal/log rule" };
      }
    }
    return null;
  }

  // Power: variable^n  or  (linear)^n
  if (asOperator(node)?.fn === "pow") {
    const [base, exp] = asOperator(node)!.args;
    if (isConstantExpr(exp, variable)) {
      const n = evaluate(exp.toString());
      if (typeof n === "number") {
        const lin = tryLinear(base, variable);
        if (lin) {
          if (Math.abs(n + 1) < EPS_TIGHT) {
            // n = -1 → ln form
            const argStr = wrapLinearArg(lin.a, lin.b, variable);
            steps.push(`Power Rule (n = -1): ∫ (${base.toString()})⁻¹ d${variable} = ln|${base.toString()}| / a`);
            return { antiderivative: `log(abs(${argStr}))/(${fmtNum(lin.a)})`, rule: "power rule (n=-1, log form)" };
          }
          const newExp = n + 1;
          const argStr = wrapLinearArg(lin.a, lin.b, variable);
          steps.push(`Power Rule: ∫ ${base.toString()}^${n} d${variable} = ${base.toString()}^${newExp} / (${newExp}·a),  a = ${fmtNum(lin.a)}`);
          return {
            antiderivative: `(${argStr})^${fmtNum(newExp)}/(${fmtNum(newExp)}*${fmtNum(lin.a)})`,
            rule: "power rule (with linear substitution)",
          };
        }
      }
    }
    // a^x form (constant base, variable exponent)
    if (isConstantExpr(base, variable)) {
      const lin = tryLinear(exp, variable);
      if (lin) {
        const baseVal = evaluate(base.toString());
        if (typeof baseVal === "number" && baseVal > 0 && baseVal !== 1) {
          const argStr = wrapLinearArg(lin.a, lin.b, variable);
          steps.push(`∫ ${base.toString()}^(${exp.toString()}) d${variable} = ${base.toString()}^(${exp.toString()}) / (a·ln(${base.toString()}))`);
          return {
            antiderivative: `(${base.toString()})^(${argStr})/((${fmtNum(lin.a)})*log(${base.toString()}))`,
            rule: "exponential rule (base a)",
          };
        }
      }
    }
    return null;
  }

  // Function calls: sin, cos, tan, exp, log/ln, sqrt — with linear-argument substitution
  if (asFunctionNode(node)) {
    const fnNode = asFunctionNode(node)!;
    const fname = fnNode.fn.name;
    const arg = fnNode.args[0];
    const lin = arg ? tryLinear(arg, variable) : null;

    if (lin && lin.a !== 0) {
      const u = wrapLinearArg(lin.a, lin.b, variable);
      const a = fmtNum(lin.a);
      switch (fname) {
        case "sin":
          steps.push(`∫ sin(u) du = -cos(u),  u = ${u}, du = ${a}·d${variable}`);
          return { antiderivative: `-cos(${u})/(${a})`, rule: "trig rule (sin, linear sub)" };
        case "cos":
          steps.push(`∫ cos(u) du = sin(u),  u = ${u}, du = ${a}·d${variable}`);
          return { antiderivative: `sin(${u})/(${a})`, rule: "trig rule (cos, linear sub)" };
        case "tan":
          steps.push(`∫ tan(u) du = -ln|cos(u)|,  u = ${u}`);
          return { antiderivative: `-log(abs(cos(${u})))/(${a})`, rule: "trig rule (tan, linear sub)" };
        case "sec":
          steps.push(`∫ sec(u) du = ln|sec(u)+tan(u)|,  u = ${u}`);
          return { antiderivative: `log(abs(sec(${u})+tan(${u})))/(${a})`, rule: "trig rule (sec, linear sub)" };
        case "exp":
          steps.push(`∫ e^u du = e^u,  u = ${u}`);
          return { antiderivative: `exp(${u})/(${a})`, rule: "exponential rule (e^x, linear sub)" };
        case "log": {
          // natural log: ∫ ln(u) du = u·ln(u) - u  (for u = x exactly; only handle a=1,b=0 cleanly,
          // else fall back since ∫ln(ax+b)dx needs the (u/a)(ln u - 1) form)
          steps.push(`∫ ln(u) du = u·ln(u) - u,  u = ${u}`);
          return { antiderivative: `((${u})*log(${u}) - (${u}))/(${a})`, rule: "log rule (∫ln u du = u ln u - u)" };
        }
        case "sqrt": {
          // ∫√(ax+b) dx = (2/(3a))·(ax+b)^(3/2)
          steps.push(`∫ √u du = (2/3)·u^(3/2),  u = ${u}`);
          return { antiderivative: `(2/3)*(${u})^(3/2)/(${a})`, rule: "power rule (sqrt, linear sub)" };
        }
        default:
          return null;
      }
    }
    return null;
  }

  // Bare variable: ∫x dx = x²/2
  if (asSymbol(node) && str === variable) {
    steps.push(`Power Rule (n=1): ∫ ${variable} d${variable} = ${variable}²/2`);
    return { antiderivative: `${variable}^2/2`, rule: "power rule (n=1)" };
  }

  return null;
}

export function solveIndefiniteIntegral(
  expression: string,
  variable: string = "x"
): MathResult {
  try {
    assertNonEmptyExpression(expression);
    const steps: string[] = [];
    steps.push(`Given: ∫ (${expression}) d${variable}`);

    const node = simplify(parse(expression));
    const piece = integrateNode(node, variable, steps);

    if (!piece) {
      steps.push(`This integral needs advanced techniques (e.g. integration by parts,`);
      steps.push(`partial fractions, or trig substitution) not covered by this solver.`);
      steps.push(`Tip: use Definite Integration for a numerical answer instead.`);
      return {
        input: expression,
        result: "Cannot solve symbolically — try Definite Integration",
        steps,
        error: undefined,
      };
    }

    // Simplify the resulting antiderivative for a clean display
    let finalStr: string;
    try {
      finalStr = simplify(parse(piece.antiderivative)).toString();
    } catch {
      finalStr = piece.antiderivative;
    }

    steps.push(`Result = ${finalStr} + C`);

    // Sanity check: numerically verify d/dx[F(x)] ≈ f(x) at a few sample points
    try {
      const fNode = node;
      const FNode = parse(finalStr);
      const FDeriv = simplify(derivative(FNode, variable));
      const testPoints = [0.3, 1.1, 2.7, -1.4];
      let allMatch = true;
      for (const t of testPoints) {
        const scope = { [variable]: t };
        const fv = evaluate(fNode.toString(), scope);
        const Fv = evaluate(FDeriv.toString(), scope);
        if (typeof fv === "number" && typeof Fv === "number" && isFinite(fv) && isFinite(Fv)) {
          if (Math.abs(fv - Fv) > Math.max(EPS_VERIF, Math.abs(fv) * EPS_VERIF)) { allMatch = false; break; }
        }
      }
      if (!allMatch) {
        steps.push(`⚠ Verification check did not match cleanly — double-check this result, or use Definite Integration.`);
      }
    } catch {
      // skip verification silently if it fails to evaluate (e.g. domain issues)
    }

    return { input: expression, result: `${finalStr} + C`, steps };
  } catch (e: unknown) {
    return { input: expression, result: "", steps: [], error: describeError(e) };
  }
}

// Partial derivative w.r.t. one variable (treats others as constants)
export function solvePartialDerivative(
  expression: string,
  variable: string,
  allVars: string[] = ["x", "y"]
): MathResult {
  try {
    assertNonEmptyExpression(expression);
    const steps: string[] = [];
    const others = allVars.filter(v => v !== variable);
    const node = parse(expression);

    steps.push(`Given: f(${allVars.join(", ")}) = ${node.toString()}`);
    steps.push(`Find: ∂f/∂${variable}`);
    if (others.length)
      steps.push(`Treat ${others.join(", ")} as constant${others.length > 1 ? "s" : ""}`);

    const deriv = derivative(node, variable);
    const simplified = simplify(deriv);

    steps.push(`Differentiate term by term w.r.t. ${variable}`);
    steps.push(`∂f/∂${variable} = ${simplified.toString()}`);

    return { input: expression, result: simplified.toString(), steps };
  } catch (e: unknown) {
    return { input: expression, result: "", steps: [], error: describeError(e) };
  }
}

// Local maxima / minima for single-variable f(x) — solves f'(x)=0 numerically
export function solveExtrema1D(
  expression: string,
  variable: string = "x",
  xMin: number = -20,
  xMax: number = 20,
  settings: FormatSettings = DEFAULT_FORMAT_SETTINGS
): MathResult {
  try {
    assertNonEmptyExpression(expression);
    assertFiniteBound(xMin, "range minimum");
    assertFiniteBound(xMax, "range maximum");
    if (xMin >= xMax) {
      throw new MathInputError("The range minimum must be less than the range maximum.");
    }
    const steps: string[] = [];
    const f = parse(expression);
    const fp = simplify(derivative(f, variable));
    const fpp = simplify(derivative(fp, variable));

    steps.push(`Given: f(${variable}) = ${f.toString()}`);
    steps.push(`Step 1: Find f'(${variable}) and set = 0`);
    steps.push(`f'(${variable}) = ${fp.toString()}`);
    steps.push(`Step 2: Find f''(${variable}) for second-derivative test`);
    steps.push(`f''(${variable}) = ${fpp.toString()}`);
    steps.push(`Step 3: Scan for sign changes of f' on [${xMin}, ${xMax}]`);

    const scope: Record<string, number> = {};
    const evalAt = (node: MathNode, x: number) => {
      scope[variable] = x;
      return node.evaluate(scope) as number;
    };

    // Find roots of f' by sign-change + bisection
    const N = 4000;
    const h = (xMax - xMin) / N;
    const roots: number[] = [];
    let prevX = xMin;
    let prevY = evalAt(fp, prevX);
    for (let i = 1; i <= N; i++) {
      const x = xMin + i * h;
      const y = evalAt(fp, x);
      if (isFinite(prevY) && isFinite(y) && prevY * y < 0) {
        // bisection
        let a = prevX, b = x, fa = prevY;
        for (let k = 0; k < 60; k++) {
          const m = (a + b) / 2;
          const fm = evalAt(fp, m);
          if (fa * fm < 0) b = m; else { a = m; fa = fm; }
        }
        const root = (a + b) / 2;
        if (!roots.some(r => Math.abs(r - root) < 1e-4)) roots.push(root);
      } else if (Math.abs(y) < 1e-9) {
        if (!roots.some(r => Math.abs(r - x) < 1e-4)) roots.push(x);
      }
      prevX = x; prevY = y;
    }

    if (!roots.length) {
      steps.push(`No critical points found on [${xMin}, ${xMax}]`);
      return { input: expression, result: "No local extrema in range", steps };
    }

    const labels: string[] = [];
    for (const r of roots) {
      const fv = evalAt(f, r);
      const sec = evalAt(fpp, r);
      const xR = Math.round(r * 10000) / 10000;
      const fR = Math.round(fv * 10000) / 10000;
      const xRf = formatNumber(xR, settings);
      const fRf = formatNumber(fR, settings);
      let kind = "saddle/inflection";
      if (sec > EPS_SEC) kind = "Local Minimum";
      else if (sec < -EPS_SEC) kind = "Local Maximum";
      steps.push(`Critical point ${variable} = ${xRf}: f''(${xRf}) = ${Math.round(sec * 10000) / 10000} → ${kind}`);
      steps.push(`  → f(${xRf}) = ${fRf}`);
      labels.push(`${kind} at (${xRf}, ${fRf})`);
    }

    return { input: expression, result: labels.join("; "), steps };
  } catch (e: unknown) {
    return { input: expression, result: "", steps: [], error: describeError(e) };
  }
}

// Local extrema for two-variable f(x,y): solve fx=0, fy=0 then Hessian test
export function solveExtrema2D(
  expression: string,
  varX: string = "x",
  varY: string = "y",
  range: number = 10,
  settings: FormatSettings = DEFAULT_FORMAT_SETTINGS
): MathResult {
  try {
    assertNonEmptyExpression(expression);
    assertFiniteBound(range, "search range");
    if (range <= 0) {
      throw new MathInputError("Please enter a positive search range.");
    }
    if (!varX.trim() || !varY.trim()) {
      throw new MathInputError("Please enter both variable names.");
    }
    if (varX.trim() === varY.trim()) {
      throw new MathInputError("The two variables must be different (e.g. x and y).");
    }
    const steps: string[] = [];
    const f = parse(expression);
    const fx = simplify(derivative(f, varX));
    const fy = simplify(derivative(f, varY));
    const fxx = simplify(derivative(fx, varX));
    const fyy = simplify(derivative(fy, varY));
    const fxy = simplify(derivative(fx, varY));

    steps.push(`Given: f(${varX}, ${varY}) = ${f.toString()}`);
    steps.push(`Step 1: Compute partial derivatives`);
    steps.push(`f_${varX} = ${fx.toString()}`);
    steps.push(`f_${varY} = ${fy.toString()}`);
    steps.push(`Step 2: Solve system f_${varX} = 0, f_${varY} = 0`);
    steps.push(`Step 3: Hessian D = f_${varX}${varX}·f_${varY}${varY} − (f_${varX}${varY})²`);
    steps.push(`f_${varX}${varX} = ${fxx.toString()}, f_${varY}${varY} = ${fyy.toString()}, f_${varX}${varY} = ${fxy.toString()}`);

    const scope: Record<string, number> = {};
    const evalAt = (node: MathNode, x: number, y: number) => {
      scope[varX] = x; scope[varY] = y;
      return node.evaluate(scope) as number;
    };

    // Grid search for (x,y) where |fx| and |fy| are both small, then refine via Newton
    const N = 80;
    const step = (2 * range) / N;
    const candidates: { x: number; y: number }[] = [];
    for (let i = 0; i <= N; i++) {
      for (let j = 0; j <= N; j++) {
        const x = -range + i * step;
        const y = -range + j * step;
        const a = evalAt(fx, x, y);
        const b = evalAt(fy, x, y);
        if (isFinite(a) && isFinite(b) && Math.abs(a) < 0.5 && Math.abs(b) < 0.5) {
          candidates.push({ x, y });
        }
      }
    }

    // Refine with Newton's method
    const refined: { x: number; y: number }[] = [];
    for (const c of candidates) {
      let x = c.x, y = c.y;
      let ok = true;
      for (let k = 0; k < 50; k++) {
        const a = evalAt(fx, x, y);
        const b = evalAt(fy, x, y);
        const A = evalAt(fxx, x, y);
        const B = evalAt(fxy, x, y);
        const C = evalAt(fyy, x, y);
        const det = A * C - B * B;
        if (!isFinite(det) || Math.abs(det) < EPS_DET) { ok = false; break; }
        const dx = (C * a - B * b) / det;
        const dy = (-B * a + A * b) / det;
        x -= dx; y -= dy;
        if (Math.abs(dx) + Math.abs(dy) < EPS_NR) break;
      }
      if (!ok) continue;
      const a = evalAt(fx, x, y);
      const b = evalAt(fy, x, y);
      if (Math.abs(a) > 1e-4 || Math.abs(b) > 1e-4) continue;
      if (!refined.some(r => Math.abs(r.x - x) < EPS_VERIF && Math.abs(r.y - y) < EPS_VERIF)) {
        refined.push({ x, y });
      }
    }

    if (!refined.length) {
      steps.push(`No critical points found in [-${range}, ${range}]²`);
      return { input: expression, result: "No critical points", steps };
    }

    const labels: string[] = [];
    for (const p of refined) {
      const A = evalAt(fxx, p.x, p.y);
      const C = evalAt(fyy, p.x, p.y);
      const B = evalAt(fxy, p.x, p.y);
      const D = A * C - B * B;
      const fv = evalAt(f, p.x, p.y);
      let kind = "Inconclusive";
      if (D > EPS_SEC && A > 0) kind = "Local Minimum";
      else if (D > EPS_SEC && A < 0) kind = "Local Maximum";
      else if (D < -EPS_SEC) kind = "Saddle Point";
      const xR = Math.round(p.x * 10000) / 10000;
      const yR = Math.round(p.y * 10000) / 10000;
      const fR = Math.round(fv * 10000) / 10000;
      const dR = Math.round(D * 10000) / 10000;
      const xRf = formatNumber(xR, settings);
      const yRf = formatNumber(yR, settings);
      const fRf = formatNumber(fR, settings);
      steps.push(`Critical point (${xRf}, ${yRf}): D = ${dR}, f_${varX}${varX} = ${Math.round(A * 10000) / 10000} → ${kind}`);
      steps.push(`  → f(${xRf}, ${yRf}) = ${fRf}`);
      labels.push(`${kind} at (${xRf}, ${yRf}, ${fRf})`);
    }

    return { input: expression, result: labels.join("; "), steps };
  } catch (e: unknown) {
    return { input: expression, result: "", steps: [], error: describeError(e) };
  }
}

// Generate points for graphing
export function generateGraphPoints(
  expression: string,
  variable: string = "x",
  xMin: number = -10,
  xMax: number = 10,
  numPoints: number = 800
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  const step = (xMax - xMin) / numPoints;
  const scope: Record<string, number> = {};
  // Adaptive rounding: preserve enough precision based on step size
  const precision = Math.max(3, Math.ceil(-Math.log10(step)) + 2);
  const roundFactor = Math.pow(10, precision);

  for (let i = 0; i <= numPoints; i++) {
    const x = xMin + i * step;
    scope[variable] = x;
    try {
      const y = evaluate(expression, scope) as number;
      if (isFinite(y) && Math.abs(y) < 1e8) {
        points.push({
          x: Math.round(x * roundFactor) / roundFactor,
          y: Math.round(y * roundFactor) / roundFactor,
        });
      }
    } catch {
      // Skip invalid points (singularities etc.)
    }
  }

  return points;
}

/**
 * Approximate an implicit 2-variable curve F(x,y) = 0 (e.g. "x^2 + y^2 - 25",
 * already rearranged so RHS is 0) by scanning a grid and marking cells where
 * the function changes sign — a lightweight "marching squares" approach.
 * Works for curves that aren't simple functions y = f(x), e.g. circles.
 */
export function generateImplicitPoints2D(
  expr: string,
  varX: string,
  varY: string,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
  resolution: number = 140
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  const compiled = (() => {
    try {
      return parse(expr).compile();
    } catch {
      return null;
    }
  })();
  if (!compiled) return points;

  const xStep = (xMax - xMin) / resolution;
  const yStep = (yMax - yMin) / resolution;

  // Precompute a grid of values
  const grid: number[][] = [];
  for (let i = 0; i <= resolution; i++) {
    const row: number[] = [];
    const x = xMin + i * xStep;
    for (let j = 0; j <= resolution; j++) {
      const y = yMin + j * yStep;
      let v: number;
      try {
        const r = compiled.evaluate({ [varX]: x, [varY]: y });
        v = typeof r === "number" && isFinite(r) ? r : NaN;
      } catch {
        v = NaN;
      }
      row.push(v);
    }
    grid.push(row);
  }

  // For each cell, if corners have mixed sign, the zero-contour passes through it
  for (let i = 0; i < resolution; i++) {
    for (let j = 0; j < resolution; j++) {
      const v00 = grid[i][j], v10 = grid[i + 1][j], v01 = grid[i][j + 1], v11 = grid[i + 1][j + 1];
      if ([v00, v10, v01, v11].some((v) => Number.isNaN(v))) continue;
      const signs = [v00, v10, v01, v11].map((v) => v >= 0);
      const mixed = signs.some((s) => s !== signs[0]);
      if (mixed) {
        const x = xMin + (i + 0.5) * xStep;
        const y = yMin + (j + 0.5) * yStep;
        points.push({ x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 });
      }
    }
  }

  return points;
}

