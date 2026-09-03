import {
  derivative, parse as _mathjsParse, simplify, evaluate as _mathjsEvaluate, type MathNode,
} from "mathjs";
import { toFraction, formatNumber, type FormatSettings } from "./number-format";
import { normalizeMathInput } from "./text-normalize";
import { exprToLatex, derivativeLatex, integralLatex } from "./latex";

// Defense-in-depth: every string a person can type/paste (x², √25, x×y,
// sin(θ)…) is normalized to plain ASCII math before mathjs ever sees it,
// even if it somehow bypassed the input-field-level normalization.
function parse(expr: string): MathNode {
  return _mathjsParse(normalizeMathInput(expr));
}
function evaluate(expr: string, scope?: Record<string, unknown>): unknown {
  const normalized = normalizeMathInput(expr);
  return scope !== undefined ? _mathjsEvaluate(normalized, scope) : _mathjsEvaluate(normalized);
}

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

// Characters this app's math language actually understands, post-normalization:
// plain ASCII letters/digits (variables, function names), whitespace, standard
// operators, parentheses, and the small set of unicode symbols
// normalizeMathInput() already knows how to translate (√ · × ÷ − π θ Θ α β γ Γ
// δ Δ λ μ σ Σ φ Φ ω Ω, superscript digits, ∞). Anything outside this set —
// stray symbols like @ # $ & ` ~ ^^ or, importantly, angle brackets used for
// HTML/script tags — is rejected up front with a plain-English message instead
// of surfacing a raw mathjs parser exception ("Value expected (char 1)",
// "Syntax error in part...") or, worse, silently mangling into "undefined".
const ALLOWED_EXPRESSION_CHARS =
  /^[\s0-9a-zA-Z+\-*/^().,!=|%_'"√·×÷−∞πθΘαβγΓδΔλμσΣφΦωΩ⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]*$/;

function assertNonEmptyExpression(expression: string): void {
  if (!expression || !expression.trim()) {
    throw new MathInputError("Please enter an expression.");
  }
  if (/[<>]/.test(expression)) {
    throw new MathInputError(
      "Please enter a valid math expression — HTML/script-style tags (< >) aren't supported here."
    );
  }
  if (!ALLOWED_EXPRESSION_CHARS.test(expression)) {
    throw new MathInputError(
      "Please enter a valid math expression — only numbers, letters, and standard math symbols (+ − × ÷ ^ ( ) √ π) are allowed."
    );
  }
  let depth = 0;
  for (const ch of expression) {
    if (ch === "(") depth++;
    else if (ch === ")") { depth--; if (depth < 0) break; }
  }
  if (depth !== 0) {
    throw new MathInputError("Please check your parentheses — they don't look balanced.");
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
 *  shown as-is. Raw mathjs parser/evaluator exceptions are translated into
 *  one plain-English line instead of leaking internals like
 *  'Syntax error in part "@@##" (char 4)' or 'Value expected (char 1)' —
 *  technically accurate, but meaningless to someone who just mistyped
 *  something and not what "proper" looks like in a consumer-facing app. */
function describeError(e: unknown): string {
  if (e instanceof MathInputError) return e.message;
  const msg = e instanceof Error ? e.message : "Unknown error";

  if (/complex number/i.test(msg)) {
    return "This expression involves complex (non-real) numbers, which this solver doesn't support — try the Complex Numbers calculator instead.";
  }
  if (/syntax error|value expected|unexpected|undefined symbol|unexpected end of expression/i.test(msg)) {
    return "This doesn't look like a valid math expression. Please check the syntax (e.g. matching parentheses, valid operators) and try again.";
  }
  if (/undefined function|is not a function|not supported/i.test(msg)) {
    return "One of the functions used here isn't supported. Try standard names like sin, cos, tan, ln, log, sqrt, exp.";
  }
  if (/too many arguments|too few arguments|wrong number of arguments/i.test(msg)) {
    return "A function here was called with the wrong number of arguments — double-check it (e.g. log(x) or log(x, base)).";
  }
  // Fallback: still don't show the raw mathjs internals, but keep it honest
  // that something failed to parse/evaluate rather than pretending success.
  return "We couldn't understand that expression. Please check the syntax and try again.";
}
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Human-friendly result formatting.
//
// mathjs's own simplify().toString() is mathematically correct but often
// reorders/scrambles terms in a way that reads as "wrong" to a person even
// when the value is right — e.g. simplify("2.5*x^2") comes back as
// "x ^ 2 * 5 / 2", and integrating "-5*x^2" gives "x ^ 3 * -5 / 3" — the sign
// buried in the middle of the term instead of out front. Multi-term
// polynomials fare worse: "3x^2 - 2x + 5" integrates to
// "x^3 + 5*x - x^2 + C" (degree 3, then degree 0, then degree 1 — no
// consistent order at all). The functions below re-derive a clean, textbook
// layout: pull each additive term's *literal numeric* coefficient out front
// as a reduced fraction (never touching irrational constants like log(2) or
// pi, so e.g. 2^x/ln(2) doesn't collapse into a decimal), and — only when the
// whole expression is a genuine single-variable polynomial — sort terms by
// descending degree.
// ─────────────────────────────────────────────────────────────────────────────

function gcd(a: number, b: number): number {
  a = Math.abs(a); b = Math.abs(b);
  while (b) { const t = a % b; a = b; b = t; }
  return a || 1;
}

/** Reduced improper-fraction string for a rational number, e.g. 1.6666667 ->
 *  "5/3", -0.8333333 -> "-5/6", 4 -> "4". Falls back to a short decimal for
 *  anything that isn't cleanly rational within tolerance (e.g. results
 *  involving pi/e) so we never print a bogus-looking fraction. */
function toSimpleFraction(value: number, maxDenominator = 5000): string {
  if (!isFinite(value)) return value > 0 ? "∞" : "-∞";
  const rounded = Math.round(value * 1e9) / 1e9;
  if (Number.isInteger(rounded)) return rounded.toString();
  const sign = rounded < 0 ? -1 : 1;
  const x = Math.abs(rounded);
  for (let den = 2; den <= maxDenominator; den++) {
    const num = x * den;
    const numRounded = Math.round(num);
    if (Math.abs(num - numRounded) < 1e-6) {
      const g = gcd(numRounded, den);
      const n = numRounded / g, d = den / g;
      if (d === 1) return (sign * n).toString();
      return `${sign < 0 ? "-" : ""}${n}/${d}`;
    }
  }
  return Number(rounded.toFixed(6)).toString();
}

/** Recursively strips ParenthesisNode wrappers. mathjs's parser preserves
 *  explicit "(...)" grouping as real ParenthesisNode wrapper nodes in the
 *  tree (only simplify() strips them) — since this app's own antiderivative
 *  strings are built with lots of explicit parens, skipping this step would
 *  make every asOperator()/asFunctionNode()/asSymbol() check below silently
 *  fail the moment it hit a wrapped node. */
function stripParens(node: MathNode): MathNode {
  if (node.type === "ParenthesisNode") {
    return stripParens((node as unknown as { content: MathNode }).content);
  }
  if (typeof (node as unknown as { map?: unknown }).map === "function") {
    return (node as unknown as { map: (fn: (n: MathNode) => MathNode) => MathNode }).map((child) => stripParens(child));
  }
  return node;
}

/** A signed additive term extracted from a +/- expression tree. */
interface SignedTerm { sign: 1 | -1; node: MathNode; }

/** Flattens nested add/subtract/unaryMinus nodes into a flat list of signed
 *  terms, e.g. "a - b + c" -> [+a, -b, +c]. A node that isn't itself a sum
 *  (e.g. a single "sin(x)") comes back as one positive term. */
function flattenSum(node: MathNode): SignedTerm[] {
  const op = asOperator(node);
  if (op?.fn === "add" && op.args.length >= 2) {
    return op.args.flatMap((a) => flattenSum(a));
  }
  if (op?.fn === "subtract" && op.args.length === 2) {
    const left = flattenSum(op.args[0]);
    const right = flattenSum(op.args[1]).map((t) => ({ ...t, sign: (t.sign * -1) as 1 | -1 }));
    return [...left, ...right];
  }
  if (op?.fn === "unaryMinus" && op.args.length === 1) {
    return flattenSum(op.args[0]).map((t) => ({ ...t, sign: (t.sign * -1) as 1 | -1 }));
  }
  return [{ sign: 1, node }];
}

/** True if this subtree is *purely numeric arithmetic* — no function calls
 *  (sin, log, sqrt, ...) and no occurrence of the integration/differentiation
 *  variable anywhere inside it. Named constants like pi/e are fine to treat
 *  as numeric (evaluating 2·π is expected), but a function call like log(2)
 *  is deliberately NOT folded — collapsing it to a decimal is exactly what
 *  turned "2ˣ/ln(2)" into the confusing "1.4426950408889634 * 2^x" before. */
function isPureLiteralSubtree(node: MathNode, variable: string): boolean {
  let pure = true;
  node.traverse((n: MathNode) => {
    if (n.type === "FunctionNode") pure = false;
    if (n.type === "SymbolNode" && (n as unknown as { name: string }).name === variable) pure = false;
  });
  return pure;
}

/** Peels off purely numeric literal factors from a multiply/divide chain,
 *  e.g. "x^3 * 5 / 3" -> { coeff: 5/3, rest: x^3 }, while leaving anything
 *  involving a function call (log(2), sin(1), ...) attached to `rest` so it
 *  prints symbolically instead of being evaluated into a decimal. */
function extractLiteralCoefficient(node: MathNode, variable: string): { coeff: number; rest: MathNode | null } {
  if (isPureLiteralSubtree(node, variable)) {
    const v = evaluate(node.toString());
    return { coeff: typeof v === "number" ? v : 1, rest: null };
  }
  const op = asOperator(node);
  if (op?.fn === "unaryMinus" && op.args.length === 1) {
    const inner = extractLiteralCoefficient(op.args[0], variable);
    return { coeff: -inner.coeff, rest: inner.rest };
  }
  if (op?.fn === "multiply" && op.args.length === 2) {
    const [a, b] = op.args;
    const aLit = isPureLiteralSubtree(a, variable);
    const bLit = isPureLiteralSubtree(b, variable);
    if (aLit && !bLit) {
      const inner = extractLiteralCoefficient(b, variable);
      return { coeff: (evaluate(a.toString()) as number) * inner.coeff, rest: inner.rest };
    }
    if (bLit && !aLit) {
      const inner = extractLiteralCoefficient(a, variable);
      return { coeff: (evaluate(b.toString()) as number) * inner.coeff, rest: inner.rest };
    }
    if (aLit && bLit) {
      return { coeff: (evaluate(a.toString()) as number) * (evaluate(b.toString()) as number), rest: null };
    }
    return { coeff: 1, rest: node };
  }
  if (op?.fn === "divide" && op.args.length === 2) {
    const [a, b] = op.args;
    if (isPureLiteralSubtree(b, variable)) {
      const inner = extractLiteralCoefficient(a, variable);
      return { coeff: inner.coeff / (evaluate(b.toString()) as number), rest: inner.rest };
    }
    // Numerator is a pure number but denominator contains the variable, e.g.
    // "1 / 2 / sqrt(x)" (mathjs's own derivative(sqrt(x)) output, parsed
    // left-associatively as divide(divide(1,2), sqrt(x))) — rewrite as
    // coefficient × (1/denominator) instead of leaving the whole chain of
    // divisions as one unparsed "rest" string.
    if (isPureLiteralSubtree(a, variable)) {
      const restNode = stripParens(parse(`1/(${b.toString()})`));
      return { coeff: evaluate(a.toString()) as number, rest: restNode };
    }
    return { coeff: 1, rest: node };
  }
  return { coeff: 1, rest: node };
}

/** If `rest` is exactly variable^n (or the bare variable, n=1), returns n —
 *  used to sort a pure polynomial's terms into descending-degree order. */
function polynomialDegree(rest: MathNode | null, variable: string): number | null {
  if (rest === null) return 0;
  const sym = asSymbol(rest);
  if (sym && sym.name === variable) return 1;
  const op = asOperator(rest);
  if (op?.fn === "pow" && op.args.length === 2) {
    const base = asSymbol(op.args[0]);
    const exp = op.args[1];
    if (base && base.name === variable && exp.type === "ConstantNode") {
      const n = (exp as unknown as { value: number }).value;
      if (typeof n === "number" && Number.isInteger(n)) return n;
    }
  }
  return null;
}

/** Recognizes coefficients that are actually ln(small integer) in disguise —
 *  mathjs's own derivative()/simplify() evaluate log(2), log(3), etc. into a
 *  raw decimal (0.6931471805599453, ...) with no way to ask for the symbolic
 *  form back, unlike this app's own hand-built integration rules which keep
 *  log(n) symbolic. Matching common small-integer ln() values here at least
 *  recovers "ln(2)" instead of showing "0.6931471805599453" to a person. */
function matchLnConstant(value: number): string | null {
  if (value <= 0) return null;
  for (let n = 2; n <= 25; n++) {
    if (Math.abs(value - Math.log(n)) < 1e-9) return `ln(${n})`;
  }
  return null;
}

function formatSignedTerm(coeff: number, rest: MathNode | null): { sign: 1 | -1; text: string } {
  const sign: 1 | -1 = coeff < 0 ? -1 : 1;
  const absCoeff = Math.abs(coeff);
  const restStr = rest === null ? "" : rest.toString();
  const restWrapped = restStr.includes(" ") ? `(${restStr})` : restStr;

  if (restStr === "") {
    return { sign, text: matchLnConstant(absCoeff) ?? toSimpleFraction(absCoeff) };
  }
  if (Math.abs(absCoeff - 1) < 1e-9) {
    return { sign, text: restStr };
  }
  if (Math.abs(absCoeff) < 1e-9) {
    return { sign: 1, text: "0" };
  }
  const lnMatch = matchLnConstant(absCoeff);
  if (lnMatch) {
    return { sign, text: `${lnMatch}*${restWrapped}` };
  }
  const coeffStr = toSimpleFraction(absCoeff);
  const wrapped = coeffStr.includes("/") ? `(${coeffStr})` : coeffStr;
  return { sign, text: `${wrapped}*${restWrapped}` };
}

/**
 * Rewrites a mathjs expression string into a clean, textbook-style result:
 * each additive term gets its literal numeric coefficient pulled out front
 * (as a reduced fraction, sign included), and — only when every term is a
 * plain power of `variable` (a genuine single-variable polynomial) — terms
 * are reordered by descending degree. Falls back to mathjs's own simplified
 * string if anything about the expression doesn't fit this shape.
 */
function prettifyResult(exprString: string, variable: string): string {
  try {
    // Deliberately parse WITHOUT calling mathjs's simplify() here — simplify()
    // eagerly evaluates constant function calls like log(2) into a decimal
    // (confirmed: simplify(parse("2^x/log(2)")) -> "1.442695... * 2^x"), which
    // is exactly the kind of "wrong-looking" output this function exists to
    // avoid. The pieces this app builds are already well-formed enough
    // (explicit +/- at the top level) that flattening + coefficient
    // extraction below works fine straight off the parse tree.
    const node = stripParens(parse(exprString));
    const rawTerms = flattenSum(node).map((t) => {
      const { coeff, rest } = extractLiteralCoefficient(t.node, variable);
      return { coeff: coeff * t.sign, rest };
    });

    const degrees = rawTerms.map((t) => polynomialDegree(t.rest, variable));
    const isPurePolynomial = degrees.every((d) => d !== null) && degrees.length > 1;

    const terms = isPurePolynomial
      ? rawTerms
          .map((t, i) => ({ t, d: degrees[i] as number }))
          .sort((a, b) => b.d - a.d)
          .map((p) => p.t)
      : rawTerms;

    const pieces = terms
      .map((t) => formatSignedTerm(t.coeff, t.rest))
      .filter((p) => p.text !== "0");

    if (pieces.length === 0) return "0";

    let out = pieces[0].sign === -1 ? `-${pieces[0].text}` : pieces[0].text;
    for (let i = 1; i < pieces.length; i++) {
      out += pieces[i].sign === -1 ? ` - ${pieces[i].text}` : ` + ${pieces[i].text}`;
    }
    return out;
  } catch {
    try { return simplify(parse(exprString)).toString(); } catch { return exprString; }
  }
}

export interface MathResult {
  input: string;
  result: string;
  steps: string[];
  error?: string;
  /** Raw numeric value (when the result is a single number) so the UI can apply
   *  the user's Decimal/Fraction/Scientific display settings instead of a fixed format. */
  numericResult?: number;
}

// Derivative solver
/**
 * Pushes a rich, textbook-style narration (bold rule name + prose + a real
 * KaTeX display equation) for one differentiation step, mirroring the
 * "Separate the terms / Differentiate each term / Combine" structure a
 * human tutor or a written solution would use. This function only narrates —
 * the actual derivative VALUE returned by solveDerivative always comes from
 * mathjs's own derivative(), which correctly handles far more cases (product
 * rule, quotient rule, arbitrary nesting) than these hand-written rules do.
 * Anything not specifically recognized below still gets a correct, cleanly
 * rendered step via the generic fallback at the end.
 */
function narrateDerivativeNode(node: MathNode, variable: string, steps: string[], partial = false): void {
  const here = () => derivativeLatex(node.toString(), variable, partial);

  if (isConstantExpr(node, variable)) {
    steps.push(`##Constant Rule\nThe derivative of any constant is $0$:\n$$${here()} = 0$$`);
    return;
  }
  {
    const sym = asSymbol(node);
    if (sym && sym.name === variable) {
      steps.push(`##Power Rule\n$${variable}$ is the same as $${variable}^1$; bring down the exponent $1$ and reduce it by $1$:\n$$${here()} = 1$$`);
      return;
    }
  }

  const op = asOperator(node);

  // NOTE: add/subtract/top-level sign flattening is handled once, up front,
  // by narrateDerivativeTop() using flattenSum() — by the time a node reaches
  // here it's already a single signed term, so no further +/- splitting.

  if (op?.fn === "unaryMinus" && op.args.length === 1) {
    steps.push(`##Constant Multiple Rule\nThe leading minus sign is a factor of $-1$:\n$$${here()} = -${derivativeLatex(op.args[0].toString(), variable, partial)}$$`);
    narrateDerivativeNode(op.args[0], variable, steps, partial);
    return;
  }

  // Constant multiple: c · f(x)
  if (op?.fn === "multiply" && op.args.length === 2) {
    const [a, b] = op.args;
    const constSide = isConstantExpr(a, variable) ? a : isConstantExpr(b, variable) ? b : null;
    const fnSide = constSide === a ? b : a;
    if (constSide) {
      steps.push(`##Constant Multiple Rule\nA constant factor can be pulled outside the derivative:\n$$${here()} = ${exprToLatex(constSide.toString())}\\cdot ${derivativeLatex(fnSide.toString(), variable, partial)}$$`);
      narrateDerivativeNode(fnSide, variable, steps, partial);
      return;
    }
  }

  // Power rule: x^n or (linear)^n
  if (op?.fn === "pow" && op.args.length === 2) {
    const [base, exp] = op.args;
    if (isConstantExpr(exp, variable)) {
      const n = evaluate(exp.toString());
      if (typeof n === "number") {
        const sym = asSymbol(base);
        if (sym && sym.name === variable) {
          steps.push(`##Power Rule\nBring down the exponent $${fmtNum(n)}$ and reduce it by $1$:\n$$${here()} = ${fmtNum(n)}${variable}^{${fmtNum(n - 1)}}$$`);
          return;
        }
        const lin = tryLinear(base, variable);
        if (lin) {
          const u = exprToLatex(wrapLinearArg(lin.a, lin.b, variable));
          steps.push(`##Power Rule + Chain Rule\nLet $u = ${u}$, so $u' = ${fmtNum(lin.a)}$. Bring down the exponent, reduce it by $1$, then multiply by $u'$:\n$$${here()} = ${fmtNum(n)}\\left(${u}\\right)^{${fmtNum(n - 1)}}\\cdot ${fmtNum(lin.a)}$$`);
          return;
        }
      }
    }
  }

  // sin/cos/tan/exp/log(ln)/sqrt of a linear argument — Chain Rule
  const fn = asFunctionNode(node);
  if (fn && fn.args.length === 1) {
    const arg = fn.args[0];
    const lin = tryLinear(arg, variable);
    const displayName = fn.fn.name === "log" ? "ln" : fn.fn.name;
    const RULE: Record<string, (u: string) => string> = {
      sin: (u) => `\\cos\\left(${u}\\right)`,
      cos: (u) => `-\\sin\\left(${u}\\right)`,
      tan: (u) => `\\sec^2\\left(${u}\\right)`,
      exp: (u) => `e^{${u}}`,
      log: (u) => `\\frac{1}{${u}}`,
      sqrt: (u) => `\\frac{1}{2\\sqrt{${u}}}`,
    };
    if (lin && RULE[fn.fn.name]) {
      const u = exprToLatex(wrapLinearArg(lin.a, lin.b, variable));
      const trivial = lin.a === 1 && lin.b === 0;
      if (trivial) {
        steps.push(`##Derivative of ${displayName}(${variable})\n$$${here()} = ${RULE[fn.fn.name](u)}$$`);
      } else {
        steps.push(`##Chain Rule\nLet $u = ${u}$, so $u' = ${fmtNum(lin.a)}$. Multiply the outer derivative by $u'$:\n$$${here()} = ${RULE[fn.fn.name](u)}\\cdot ${fmtNum(lin.a)}$$`);
      }
      return;
    }
  }

  // Fallback for anything not specifically narrated above (products of two
  // non-constant factors, quotients, deeper nesting, ...) — still correct
  // and still rendered as real LaTeX, just without a granular rule-by-rule
  // breakdown.
  steps.push(`##Differentiate\nApply the standard differentiation rules:\n$$${here()} = ${exprToLatex(prettifyResult(simplify(derivative(node, variable)).toString(), variable))}$$`);
}

/** Entry point: flattens the WHOLE top-level +/- chain (however deeply
 *  mathjs's parser nested it) into a flat list of signed terms in one pass —
 *  matching a textbook's "separate the terms / differentiate each term /
 *  combine" structure — rather than recursing through the parser's binary
 *  add/subtract tree one pair at a time, which produced redundant nested
 *  "combine" steps for every intermediate pairing. */
function narrateDerivativeTop(node: MathNode, variable: string, steps: string[], partial = false): void {
  const terms = flattenSum(node);
  if (terms.length <= 1) {
    narrateDerivativeNode(node, variable, steps, partial);
    return;
  }

  const wholeLatex = derivativeLatex(node.toString(), variable, partial);
  const perTermLatex = terms
    .map((t, i) => {
      const d = derivativeLatex(t.node.toString(), variable, partial);
      if (i === 0) return t.sign === -1 ? `-${d}` : d;
      return t.sign === -1 ? ` - ${d}` : ` + ${d}`;
    })
    .join("");

  steps.push(`##Separate the Terms\nThe derivative of a sum is the sum of the derivatives — differentiate each term separately:\n$$${wholeLatex} = ${perTermLatex}$$`);
  terms.forEach((t) => narrateDerivativeNode(t.node, variable, steps, partial));

  const finalLatex = exprToLatex(prettifyResult(simplify(derivative(node, variable)).toString(), variable));
  steps.push(`##Combine the Results\nAdd all the term derivatives together:\n$$${wholeLatex} = ${finalLatex}$$`);
}

export function solveDerivative(
  expression: string,
  variable: string = "x"
): MathResult {
  try {
    assertNonEmptyExpression(expression);
    const node = parse(expression);
    const steps: string[] = [];

    steps.push(`##Given\n$$f(${variable}) = ${exprToLatex(node.toString())}$$`);
    steps.push(`##Goal\nFind $f'(${variable})$ by differentiating with respect to $${variable}$.`);

    narrateDerivativeTop(node, variable, steps);

    const deriv = derivative(node, variable);
    const simplified = simplify(deriv);
    const prettyFinal = prettifyResult(simplified.toString(), variable);

    steps.push(`##Final Answer\n$$f'(${variable}) = ${exprToLatex(prettyFinal)}$$`);

    return { input: expression, result: prettyFinal, steps };
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
    steps.push(`##Given\n$$f(${variable}) = ${exprToLatex(current.toString())}$$`);
    steps.push(`##Goal\nFind the $${order}${ordinalSuffix(order)}$ derivative, i.e. apply differentiation ${order} time${order > 1 ? "s" : ""} in a row.`);

    for (let i = 1; i <= order; i++) {
      steps.push(`##Differentiation ${i} of ${order}\nStart from $f^{(${i - 1})}(${variable}) = ${exprToLatex(prettifyResult(current.toString(), variable))}$:`);
      narrateDerivativeTop(current, variable, steps);
      const deriv = derivative(current, variable);
      const simplified = simplify(deriv);
      current = simplified;
    }

    const finalPretty = prettifyResult(current.toString(), variable);
    steps.push(`##Final Answer\n$$f^{(${order})}(${variable}) = ${exprToLatex(finalPretty)}$$`);

    return { input: expression, result: finalPretty, steps };
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
    steps.push(`##Given\n$$\\int_{${fmtNum(lower)}}^{${fmtNum(upper)}} ${exprToLatex(expression)}\\,d${variable}$$`);

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

    steps.push(`##Method: Simpson's Rule\nApproximate the area under the curve using $n = ${n}$ evenly-spaced intervals, step size $h = \\frac{${fmtNum(upper)}-${fmtNum(lower)}}{${n}} = ${h.toFixed(6)}$:\n$$\\int_a^b f(${variable})\\,d${variable} \\approx \\frac{h}{3}\\Big[f(a) + 4f(x_1) + 2f(x_2) + \\cdots + f(b)\\Big]$$`);

    const rounded = Math.round(result * EPS_ROUND) / EPS_ROUND;
    if (Math.abs(result - Math.round(result)) < EPS) {
      steps.push(`##Result\n$$${formatNumber(Math.round(result), settings)} \\quad \\text{(exact)}$$`);
    } else {
      const frac = toFraction(result, 1000);
      const isNiceFraction = frac.includes("/") && Math.abs(evaluateFractionString(frac) - result) < 1e-5;
      steps.push(`##Result\n$$\\approx ${formatNumber(rounded, settings)}${isNiceFraction ? `\\quad(= ${frac})` : ""}$$`);
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
    steps.push(`##Given\n$$\\iint ${exprToLatex(expression)}\\;d${varY}\\,d${varX}$$\nOver the region $${varX} \\in [${fmtNum(xLower)}, ${fmtNum(xUpper)}]$, $${varY} \\in [${fmtNum(yLower)}, ${fmtNum(yUpper)}]$.`);

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

    steps.push(`##Method: Double Simpson's Rule\nUse a $${n}\\times${n}$ grid, with step sizes $h_{${varX}} = ${hx.toFixed(6)}$ and $h_{${varY}} = ${hy.toFixed(6)}$.`);
    steps.push(`##Result\n$$\\approx ${formatNumber(rounded, settings)}$$`);

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

/** True when `a` is 1 and `b` is 0 — i.e. the "linear substitution" is really
 *  no substitution at all (u = x exactly), so the explanatory steps can skip
 *  the "let u = ax+b" song-and-dance and just show the rule directly. */
function isTrivialLinear(lin: { a: number; b: number }): boolean {
  return lin.a === 1 && lin.b === 0;
}

function integrateNode(node: MathNode, variable: string, steps: string[]): IntegralPiece {
  const str = node.toString();
  const here = () => integralLatex(node.toString(), variable);

  // Constant (no variable present)
  if (isConstantExpr(node, variable)) {
    if (str === "undefined" || str === "Infinity" || str === "-Infinity" || str === "NaN") {
      return null;
    }
    const k = str === "0" ? "0" : str;
    steps.push(`##Constant Rule\n${k === "0" ? "The integrand is $0$" : `The integrand is just the constant $${exprToLatex(k)}$`} — the antiderivative of a constant $k$ is $k${variable}$:\n$$${here()} = ${exprToLatex(k)}${variable}$$`);
    return { antiderivative: k === "0" ? "0" : `(${k})*${variable}`, rule: "constant rule" };
  }

  // Sum / Difference: flatten the whole +/- chain in one pass (matches a
  // textbook's "separate the terms" step) instead of recursing pair-by-pair
  // through mathjs's binary add/subtract tree, which produced a cascade of
  // redundant nested "combine" steps.
  const flatTerms = flattenSum(node);
  if (flatTerms.length > 1) {
    const perTermLatex = flatTerms
      .map((t, i) => {
        const d = integralLatex(t.node.toString(), variable);
        if (i === 0) return t.sign === -1 ? `-${d}` : d;
        return t.sign === -1 ? ` - ${d}` : ` + ${d}`;
      })
      .join("");
    steps.push(`##Separate the Terms\nThis is a sum/difference of ${flatTerms.length} terms — by the Sum and Difference Rule, integrate each term separately, then add the results:\n$$${here()} = ${perTermLatex}$$`);
    const parts: string[] = [];
    let ok = true;
    flatTerms.forEach((t) => {
      const piece = integrateNode(t.node, variable, steps);
      if (!piece) { ok = false; return; }
      parts.push(t.sign === -1 ? `-(${piece.antiderivative})` : piece.antiderivative);
    });
    if (!ok) return null;
    steps.push(`##Combine the Results\nAdd all the term-by-term antiderivatives together:\n$$${here()} = ${exprToLatex(prettifyResult(parts.join("+"), variable))}$$`);
    return { antiderivative: parts.join(" + ").replace(/\+ -/g, "- "), rule: "sum rule" };
  }
  // Unary minus: -f(x)
  if (asOperator(node)?.fn === "unaryMinus") {
    const arg = asOperator(node)!.args[0];
    steps.push(`##Constant Multiple Rule\nThe leading minus sign is a constant factor of $-1$ — integrate what's left, then reattach the sign:\n$$${here()} = -${integralLatex(arg.toString(), variable)}$$`);
    const piece = integrateNode(arg, variable, steps);
    if (!piece) return null;
    return { antiderivative: `-(${piece.antiderivative})`, rule: "constant-multiple rule (k=-1)" };
  }

  // Multiplication: pull out constant factor → c · ∫f(x)dx
  if (asOperator(node)?.fn === "multiply") {
    const args = asOperator(node)!.args;
    if (args.length === 2) {
      const [lhs, rhs] = args;
      const constSide = isConstantExpr(lhs, variable) ? lhs : isConstantExpr(rhs, variable) ? rhs : null;
      const fnSide = constSide === lhs ? rhs : lhs;
      if (constSide) {
        steps.push(`##Constant Multiple Rule\n$${exprToLatex(constSide.toString())}$ is just a constant multiplier — pull it out front and integrate what's left:\n$$${here()} = ${exprToLatex(constSide.toString())}\\cdot ${integralLatex(fnSide.toString(), variable)}$$`);
        const piece = integrateNode(fnSide, variable, steps);
        if (!piece) return null;
        return { antiderivative: `(${constSide.toString()})*(${piece.antiderivative})`, rule: "constant multiple rule" };
      }
    }
    return null; // general product rule (integration by parts) not attempted
  }

  // Division: f(x)/c where c is constant
  if (asOperator(node)?.fn === "divide") {
    const args = asOperator(node)!.args;
    const [num, denom] = args;
    if (isConstantExpr(denom, variable)) {
      steps.push(`##Constant Divisor\nDividing by the constant $${exprToLatex(denom.toString())}$ is the same as pulling out a factor of $\\frac{1}{${exprToLatex(denom.toString())}}$ — integrate the numerator, then divide the result:\n$$${here()} = \\frac{${integralLatex(num.toString(), variable)}}{${exprToLatex(denom.toString())}}$$`);
      const piece = integrateNode(num, variable, steps);
      if (!piece) return null;
      return { antiderivative: `(${piece.antiderivative})/(${denom.toString()})`, rule: "constant divisor" };
    }
    // 1/(ax+b) → ln|ax+b| / a
    if (isConstantExpr(num, variable)) {
      const lin = tryLinear(denom, variable);
      if (lin && lin.a !== 0) {
        const argStr = wrapLinearArg(lin.a, lin.b, variable);
        if (isTrivialLinear(lin)) {
          steps.push(`##Reciprocal Rule\nThis is the reciprocal form $\\int \\frac{1}{${variable}}\\,d${variable}$. The standard result is the natural log of the absolute value:\n$$${here()} = \\ln\\left|${variable}\\right|$$`);
        } else {
          steps.push(`##Reciprocal Rule + u-Substitution\nLet $u = ${exprToLatex(argStr)}$, so $du = ${fmtNum(lin.a)}\\,d${variable}$:\n$$${here()} = \\frac{1}{${fmtNum(lin.a)}}\\int \\frac{1}{u}\\,du = \\frac{1}{${fmtNum(lin.a)}}\\ln\\left|${exprToLatex(argStr)}\\right|$$`);
        }
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
            const argStr = wrapLinearArg(lin.a, lin.b, variable);
            if (isTrivialLinear(lin)) {
              steps.push(`##Power Rule Exception (n = -1)\n$${variable}^{-1}$ is the one exponent the ordinary Power Rule can't handle, since $n+1=0$ would mean dividing by zero. Instead, its antiderivative is the natural log of the absolute value:\n$$${here()} = \\ln\\left|${variable}\\right|$$`);
            } else {
              steps.push(`##Power Rule Exception (n = -1) + u-Substitution\nLet $u = ${exprToLatex(argStr)}$, so $du = ${fmtNum(lin.a)}\\,d${variable}$:\n$$${here()} = \\frac{1}{${fmtNum(lin.a)}}\\ln\\left|${exprToLatex(argStr)}\\right|$$`);
            }
            return { antiderivative: `log(abs(${argStr}))/(${fmtNum(lin.a)})`, rule: "power rule (n=-1, log form)" };
          }
          const newExp = n + 1;
          const argStr = wrapLinearArg(lin.a, lin.b, variable);
          if (isTrivialLinear(lin)) {
            steps.push(`##Power Rule\n$\\int ${variable}^n\\,d${variable} = \\frac{${variable}^{n+1}}{n+1}$. Here $n = ${fmtNum(n)}$, so $n+1 = ${fmtNum(newExp)}$:\n$$${here()} = \\frac{${variable}^{${fmtNum(newExp)}}}{${fmtNum(newExp)}}$$`);
          } else {
            steps.push(`##Power Rule + u-Substitution\nLet $u = ${exprToLatex(argStr)}$ (linear in $${variable}$), so $du = ${fmtNum(lin.a)}\\,d${variable}$. By the Power Rule, $\\int u^n\\,du = \\frac{u^{n+1}}{n+1}$; here $n+1 = ${fmtNum(newExp)}$:\n$$${here()} = \\frac{\\left(${exprToLatex(argStr)}\\right)^{${fmtNum(newExp)}}}{${fmtNum(newExp)}\\cdot ${fmtNum(lin.a)}}$$`);
          }
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
          const b = base.toString();
          if (isTrivialLinear(lin)) {
            steps.push(`##Exponential Rule\nWith a constant base $a = ${b}$, the standard rule is $\\int a^${variable}\\,d${variable} = \\frac{a^${variable}}{\\ln(a)}$:\n$$${here()} = \\frac{${b}^${variable}}{\\ln(${b})}$$`);
          } else {
            steps.push(`##Exponential Rule + u-Substitution\nLet $u = ${exprToLatex(argStr)}$, so $du = ${fmtNum(lin.a)}\\,d${variable}$. The base $a = ${b}$ is constant, so $\\int a^u\\,du = \\frac{a^u}{\\ln(a)}$:\n$$${here()} = \\frac{${b}^{${exprToLatex(argStr)}}}{${fmtNum(lin.a)}\\cdot \\ln(${b})}$$`);
          }
          const aFactor = lin.a === 1 ? "" : `(${fmtNum(lin.a)})*`;
          return {
            antiderivative: `(${base.toString()})^(${argStr})/(${aFactor}log(${base.toString()}))`,
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
    const displayName = fname === "log" ? "ln" : fname;
    const arg = fnNode.args[0];
    const lin = arg ? tryLinear(arg, variable) : null;

    if (lin && lin.a !== 0) {
      const u = wrapLinearArg(lin.a, lin.b, variable);
      const uL = exprToLatex(u);
      const a = fmtNum(lin.a);
      const trivial = isTrivialLinear(lin);
      const header = trivial ? `##Standard ${displayName === "ln" ? "\\ln" : `\\${displayName}`} Rule` : `##u-Substitution`;
      const intro = trivial
        ? ""
        : `Let $u = ${uL}$, so $du = ${a}\\,d${variable}$:\n`;

      const RULES: Record<string, { rule: string; trivialLatex: string; subLatex: string; antideriv: string }> = {
        sin: { rule: "-\\cos", trivialLatex: `-\\cos(${variable})`, subLatex: `\\frac{-\\cos(u)}{${a}}`, antideriv: `-cos(${u})/(${a})` },
        cos: { rule: "\\sin", trivialLatex: `\\sin(${variable})`, subLatex: `\\frac{\\sin(u)}{${a}}`, antideriv: `sin(${u})/(${a})` },
        tan: { rule: "-\\ln|\\cos(\\cdot)|", trivialLatex: `-\\ln\\left|\\cos(${variable})\\right|`, subLatex: `\\frac{-\\ln\\left|\\cos(u)\\right|}{${a}}`, antideriv: `-log(abs(cos(${u})))/(${a})` },
        sec: { rule: "\\ln|\\sec+\\tan|", trivialLatex: `\\ln\\left|\\sec(${variable})+\\tan(${variable})\\right|`, subLatex: `\\frac{\\ln\\left|\\sec(u)+\\tan(u)\\right|}{${a}}`, antideriv: `log(abs(sec(${u})+tan(${u})))/(${a})` },
        exp: { rule: "e^{(\\cdot)}", trivialLatex: `e^{${variable}}`, subLatex: `\\frac{e^{u}}{${a}}`, antideriv: `exp(${u})/(${a})` },
      };

      if (RULES[fname]) {
        const r = RULES[fname];
        steps.push(`${header}\n${intro}$$${here()} = ${trivial ? r.trivialLatex : r.subLatex}$$`);
        return { antiderivative: r.antideriv, rule: `${fname} rule` };
      }
      if (fname === "log") {
        steps.push(`##Log Rule (Integration by Parts result)\n${intro}This uses the standard result $\\int \\ln(u)\\,du = u\\ln(u) - u$:\n$$${here()} = ${trivial ? `${variable}\\ln(${variable}) - ${variable}` : `\\frac{u\\ln(u) - u}{${a}}`}$$`);
        return { antiderivative: `((${u})*log(${u}) - (${u}))/(${a})`, rule: "log rule (∫ln u du = u ln u - u)" };
      }
      if (fname === "sqrt") {
        steps.push(`##Power Rule (via $\\sqrt{u} = u^{1/2}$)\n${intro}Rewrite $\\sqrt{u}$ as $u^{1/2}$, then apply the Power Rule: $\\int u^{1/2}\\,du = \\frac{2}{3}u^{3/2}$:\n$$${here()} = ${trivial ? `\\frac{2}{3}${variable}^{3/2}` : `\\frac{2u^{3/2}}{3\\cdot ${a}}`}$$`);
        return { antiderivative: `(2/3)*(${u})^(3/2)/(${a})`, rule: "power rule (sqrt, linear sub)" };
      }
    }
    return null;
  }

  // Bare variable: ∫x dx = x²/2
  if (asSymbol(node) && str === variable) {
    steps.push(`##Power Rule\n$${variable}$ is the same as $${variable}^1$; by the Power Rule, $\\int ${variable}^n\\,d${variable} = \\frac{${variable}^{n+1}}{n+1}$ with $n=1$:\n$$${here()} = \\frac{${variable}^2}{2}$$`);
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
    steps.push(`##Given\n$$${integralLatex(expression, variable)}$$`);
    steps.push(`##Goal\nFind a function $F(${variable})$ whose derivative is the integrand, i.e. $F'(${variable}) = ${exprToLatex(expression)}$.`);

    const node = simplify(parse(expression));
    const piece = integrateNode(node, variable, steps);

    if (!piece) {
      steps.push(`##Beyond This Solver\nThis integral needs advanced techniques (e.g. integration by parts, partial fractions, or trig substitution) not covered here.\n\nTip: use Definite Integration for a numerical answer instead.`);
      return {
        input: expression,
        result: "Cannot solve symbolically — try Definite Integration",
        steps,
        error: undefined,
      };
    }

    // Clean, textbook-ordered display (pulls literal coefficients out front,
    // sorts polynomial terms by descending degree) instead of raw mathjs
    // simplify() output, which scrambles term order and sign placement.
    const finalStr = prettifyResult(piece.antiderivative, variable);

    steps.push(`##Combine Everything\n$$F(${variable}) = ${exprToLatex(finalStr)}$$`);
    steps.push(`##Add the Constant of Integration\nSince the derivative of any constant is $0$, every function of the form $F(${variable}) + C$ (for any constant $C$) has the same derivative — so "$+\\,C$" represents the entire family of antiderivatives:\n$$${integralLatex(expression, variable)} = ${exprToLatex(finalStr)} + C$$`);

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
      if (allMatch) {
        steps.push(`##Verify\nDifferentiating $F(${variable})$ at several sample points reproduces the original integrand — ✓ confirming this antiderivative is correct.`);
      } else {
        steps.push(`##Verify\n⚠ This check did not match cleanly — double-check this result, or use Definite Integration.`);
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

    steps.push(`##Given\n$$f(${allVars.join(", ")}) = ${exprToLatex(node.toString())}$$`);
    steps.push(`##Goal\nFind $\\frac{\\partial f}{\\partial ${variable}}$${others.length ? `, treating $${others.join(", ")}$ as constant${others.length > 1 ? "s" : ""}` : ""}.`);

    narrateDerivativeTop(node, variable, steps, true);

    const deriv = derivative(node, variable);
    const simplified = simplify(deriv);
    const pretty = prettifyResult(simplified.toString(), variable);
    steps.push(`##Final Answer\n$$\\frac{\\partial f}{\\partial ${variable}} = ${exprToLatex(pretty)}$$`);

    return { input: expression, result: pretty, steps };
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

    steps.push(`##Given\n$$f(${variable}) = ${exprToLatex(f.toString())}$$`);
    steps.push(`##Step 1 — Find Critical Points\nSolve $f'(${variable}) = 0$:\n$$f'(${variable}) = ${exprToLatex(prettifyResult(fp.toString(), variable))}$$`);
    steps.push(`##Step 2 — Second-Derivative Test\nFind $f''(${variable})$ to classify each critical point:\n$$f''(${variable}) = ${exprToLatex(prettifyResult(fpp.toString(), variable))}$$`);
    steps.push(`##Step 3 — Scan for Sign Changes\nSearch for roots of $f'(${variable})$ on $[${fmtNum(xMin)}, ${fmtNum(xMax)}]$.`);

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
      steps.push(`##No Critical Points\nNo critical points were found on $[${fmtNum(xMin)}, ${fmtNum(xMax)}]$.`);
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
      steps.push(`##Critical Point at $${variable} = ${xRf}$\n$f''(${xRf}) = ${fmtNum(Math.round(sec * 10000) / 10000)}$ → ${kind}:\n$$f(${xRf}) = ${fRf}$$`);
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

    steps.push(`##Given\n$$f(${varX}, ${varY}) = ${exprToLatex(f.toString())}$$`);
    steps.push(`##Step 1 — Partial Derivatives\n$$f_{${varX}} = ${exprToLatex(prettifyResult(fx.toString(), varX))}, \\qquad f_{${varY}} = ${exprToLatex(prettifyResult(fy.toString(), varY))}$$`);
    steps.push(`##Step 2 — Solve the System\nSolve $f_{${varX}} = 0$ and $f_{${varY}} = 0$ simultaneously to find critical points.`);
    steps.push(`##Step 3 — Second Partials Test\nCompute the Hessian determinant $D = f_{${varX}${varX}}\\cdot f_{${varY}${varY}} - \\left(f_{${varX}${varY}}\\right)^2$:\n$$f_{${varX}${varX}} = ${exprToLatex(fxx.toString())}, \\quad f_{${varY}${varY}} = ${exprToLatex(fyy.toString())}, \\quad f_{${varX}${varY}} = ${exprToLatex(fxy.toString())}$$`);

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
      steps.push(`##No Critical Points\nNo critical points were found in $[-${range}, ${range}]^2$.`);
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
      steps.push(`##Critical Point at $(${xRf}, ${yRf})$\n$D = ${fmtNum(dR)}$, $f_{${varX}${varX}} = ${fmtNum(Math.round(A * 10000) / 10000)}$ → ${kind}:\n$$f(${xRf}, ${yRf}) = ${fRf}$$`);
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


/**
 * Pulls the single-letter variable names out of an expression (ignoring
 * known function names like sin/cos/log/pi/e), sorted alphabetically.
 * Shared by the equation grapher and the 3D implicit surface plotter so an
 * equation like "x^2 + y^2 + z^2 = 25" is recognized the same way everywhere.
 */
export function extractVariables(equation: string): string[] {
  const knownFns = new Set(["sin", "cos", "tan", "sec", "csc", "cot", "log", "ln", "exp", "sqrt", "abs", "pi", "e"]);
  const matches = equation.match(/[a-zA-Z]+/g) || [];
  const vars = new Set<string>();
  for (const m of matches) {
    if (knownFns.has(m.toLowerCase())) continue;
    if (m.length === 1) vars.add(m);
  }
  return Array.from(vars).sort();
}

/**
 * Rearranges "lhs = rhs" into a single "(lhs) - (rhs)" expression (F = 0
 * form) and reports which variables it uses. Returns an error message
 * instead of throwing so callers can show it inline.
 */
export function parseEquationToZeroForm(
  equation: string
): { vars: string[]; expr: string } | { error: string } {
  const parts = equation.split("=");
  if (parts.length !== 2) {
    return { error: "Use format: expression = expression, e.g. x^2 + y^2 + z^2 = 25" };
  }
  const expr = `(${parts[0].trim()}) - (${parts[1].trim()})`;
  const vars = extractVariables(expr);
  if (vars.length === 0) {
    return { error: "No variable detected — use x, y, and/or z" };
  }
  if (vars.length > 3) {
    return { error: "Only up to 3 variables (x, y, z) are supported for graphing" };
  }
  return { vars, expr };
}
