import {
  derivative, parse as _mathjsParse, simplify, rationalize, evaluate as _mathjsEvaluate, type MathNode,
} from "mathjs";
import { formatNumber, type FormatSettings } from "./number-format";
import { integrate1D, integrate2D, recognizeConstant, type IntegralStatus } from "./numeric-integrate";
import { cleanExpression, cleanVariable, parseNumericInput, findUnknownFunctionNames } from "./expression-clean";
import { exprToLatex, derivativeLatex, integralLatex, deepCleanNode } from "./latex";
import { stripParens } from "./expr-parens";
import { validate2D } from "./graph-utils";

// Defense-in-depth: every string a person can type/paste (x², √25, x×y,
// sin(θ)…) is normalized to plain ASCII math before mathjs ever sees it,
// even if it somehow bypassed the input-field-level normalization.
function parse(expr: string): MathNode {
  return _mathjsParse(cleanExpression(expr));
}
function evaluate(expr: string, scope?: Record<string, unknown>): unknown {
  const normalized = cleanExpression(expr);
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

/** Clean the raw input — but first reject unknown function names (foo(x)) with a clear message instead of reading them as a product of letters. */
function prepareInput(raw: string): string {
  const unknown = findUnknownFunctionNames(raw);
  if (unknown.length > 0) {
    throw new MathInputError(`Unknown function${unknown.length > 1 ? "s" : ""} "${unknown.join(", ")}" — supported ones include sin, cos, tan, asin, acos, atan, sinh, cosh, tanh, ln, log, sqrt, abs, exp, floor, ceil.`);
  }
  return cleanExpression(raw);
}

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
  const t = expression.trim();
  if (/[+\-*/^]$/.test(t)) {
    throw new MathInputError("The expression looks incomplete — it ends with an operator.");
  }
  if (/^[*/^]/.test(t)) {
    throw new MathInputError("The expression can't start with * / or ^.");
  }
  if (/\(\s*\)/.test(t) && !/[A-Za-z]\w*\s*\(\s*\)/.test(t)) {
    throw new MathInputError("There are empty parentheses — put something inside ( ).");
  }
  if (/[*/^]\s*[*/^]|\+\s*[*/^]|-\s*[*/^]/.test(t)) {
    throw new MathInputError("Two operators are in a row — please check the expression.");
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
    if (n.type === "SymbolNode") {
      const nm = (n as unknown as { name: string }).name;
      // pi and e stay symbolic ("pi*x", not "3.141593*x"); only plain numbers fold.
      if (nm === variable || nm === "pi" || nm === "e") pure = false;
    }
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

/** Strips harmless artefacts that hand-built antiderivative strings pick up: "(x + 0)", "exp(1 * x)", ")^1", "/ 1". */
function cleanupArtifacts(str: string): string {
  let t = str;
  for (let i = 0; i < 3; i++) {
    t = t
      .replace(/\(([A-Za-z_]\w*) \+ 0\)/g, "$1")
      .replace(/log\(abs\(exp\(([^()]*)\)\)\)/g, "($1)")
      .replace(/log\(exp\(([^()]*)\)\)/g, "($1)")
      .replace(/ \+ 0(?=\))/g, "")
      .replace(/\(1 \* ([A-Za-z_]\w*)\)/g, "($1)")
      .replace(/(?<!\^\s{0,3})\b1 \* (?=[A-Za-z(])/g, "")
      .replace(/\)\s*\^\s*1(?![\d.])/g, ")")
      .replace(/\s*\/\s*1(?![\d.])/g, "")
      .replace(/\* 1(?![\d.])/g, "");
  }
  return t;
}

function prettifyResult(exprString: string, variable: string): string {
  return cleanupArtifacts(prettifyResultInner(cleanupArtifacts(exprString), variable));
}

function prettifyResultInner(exprString: string, variable: string): string {
  try {
    // Deliberately parse WITHOUT calling mathjs's simplify() here — simplify()
    // eagerly evaluates constant function calls like log(2) into a decimal
    // (confirmed: simplify(parse("2^x/log(2)")) -> "1.442695... * 2^x"), which
    // is exactly the kind of "wrong-looking" output this function exists to
    // avoid. The pieces this app builds are already well-formed enough
    // (explicit +/- at the top level) that flattening + coefficient
    // extraction below works fine straight off the parse tree.
    const node = deepCleanNode(stripParens(parse(exprString)));
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
  /** A recognised closed form of numericResult (e.g. "π/2"), when there is one. */
  exactText?: string;
  exactTex?: string;
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
/** The derivative of fn(u) with respect to the abstract placeholder u, e.g.
 *  outerDerivativeRule("sec") -> the MathNode for "sec(u) * tan(u)". Backed
 *  by mathjs's own derivative(), so it automatically covers every function
 *  mathjs knows how to differentiate — not just a hand-picked few. Returns
 *  null for anything mathjs can't differentiate (rare — e.g. a user-defined
 *  or unrecognized function name), letting the caller fall back gracefully. */
function outerDerivativeRule(fnName: string): MathNode | null {
  try {
    return simplify(derivative(parse(`${fnName}(u)`), "u"));
  } catch {
    return null;
  }
}

/** Substitutes the actual inner expression back in for the abstract "u" in
 *  an outerDerivativeRule() result, returning ready-to-render LaTeX — e.g.
 *  substituting u -> cos(x) into "1/(2*sqrt(u))" gives
 *  "1/(2*sqrt(cos(x)))" as LaTeX. */
function substituteRuleVariable(ruleNode: MathNode, argNode: MathNode): string {
  const substituted = ruleNode.toString().replace(/\bu\b/g, `(${argNode.toString()})`);
  return exprToLatex(substituted);
}

/** Derivative of a node as ready-to-render LaTeX (simplified + prettified).
 *  Always computed by mathjs, so it is correct for any expression. */
function derivLx(node: MathNode, variable: string): string {
  return exprToLatex(prettifyResult(simplify(derivative(node, variable)).toString(), variable));
}

/** Removes redundant wrapping parentheses so structure checks see the real operator. */
function unwrapParens(node: MathNode): MathNode {
  let n = node;
  while (n.type === "ParenthesisNode") n = (n as unknown as { content: MathNode }).content;
  return n;
}

/** Operand of a product: only sums/differences/negations need parentheses. */
function wrapProd(node: MathNode): string {
  const tex = exprToLatex(node.toString());
  const op = asOperator(node);
  return op && (op.fn === "add" || op.fn === "subtract" || op.fn === "unaryMinus") ? `\\left(${tex}\\right)` : tex;
}

/** LaTeX of a node, wrapped in \left( \right) unless it is a bare symbol/number. */
function wrapNode(node: MathNode): string {
  const tex = exprToLatex(node.toString());
  return node.type === "SymbolNode" || node.type === "ConstantNode" ? tex : `\\left(${tex}\\right)`;
}

/** Same, for an already-built LaTeX string (e.g. a derivative result). */
function wrapTex(tex: string): string {
  return /[+\-]/.test(tex) ? `\\left(${tex}\\right)` : tex;
}

/** True when a node's derivative is obvious at a glance — a constant, a linear
 *  expression, a constant power of a linear expression, or one function of a
 *  linear expression. Those get their derivative written inline; anything
 *  more involved gets its own worked sub-steps. */
function isElementary(rawNode: MathNode, variable: string): boolean {
  const node = unwrapParens(rawNode);
  if (isConstantExpr(node, variable) || tryLinear(node, variable)) return true;
  const op = asOperator(node);
  if (op?.fn === "pow" && op.args.length === 2 && isConstantExpr(op.args[1], variable)) {
    return !!tryLinear(op.args[0], variable);
  }
  const fn = asFunctionNode(node);
  return !!(fn && fn.args.length === 1 && tryLinear(fn.args[0], variable));
}

/** n·x^(n-1) with the trivial cases (x^1, x^0, coefficient ±1) tidied. */
function powerRuleResult(n: number, variable: string): string {
  if (n === 0) return "0";
  const e = n - 1;
  if (e === 0) return "1";
  const coef = n === 1 ? "" : n === -1 ? "-" : fmtNum(n);
  return `${coef}${variable}${e === 1 ? "" : `^{${fmtNum(e)}}`}`;
}

/** Pushes a "rule" step (name, what u/v are, the general formula), then a
 *  worked sub-derivation for every part that isn't elementary, then a
 *  "Substitute" step that plugs the pieces into the formula. */
function pushRuleSteps(
  steps: string[],
  o: {
    header: string;
    defs: string;
    formula: string;
    sub: { label: string; node: MathNode }[];
    here: string;
    substituted: string;
    result: string;
    showResult: boolean;
  },
  variable: string,
  partial: boolean,
  depth: number,
): void {
  steps.push(`##${o.header}\n$$${o.defs}$$\n$$${o.formula}$$`);
  for (const s of o.sub) {
    steps.push(`##Find $${s.label}$\n$$${s.label} = ${derivativeLatex(s.node.toString(), variable, partial)}$$`);
    narrateDerivativeTop(s.node, variable, steps, partial, depth + 1);
  }
  steps.push(`##Substitute\n$$${o.here} = ${o.substituted}${o.showResult ? ` = ${o.result}` : ""}$$`);
}

function narrateDerivativeNode(rawNode: MathNode, variable: string, steps: string[], partial = false, depth = 0): void {
  const node = unwrapParens(rawNode);
  const here = () => derivativeLatex(node.toString(), variable, partial);
  const D = (inner: string) => derivativeLatex(inner, variable, partial);
  const showResult = depth > 0; // top level is followed by "Final Answer" anyway

  if (isConstantExpr(node, variable)) {
    steps.push(`##Constant Rule\n$$${here()} = 0$$`);
    return;
  }
  {
    const sym = asSymbol(node);
    if (sym && sym.name === variable) {
      steps.push(`##Power Rule\n$$${here()} = 1$$`);
      return;
    }
  }

  const op = asOperator(node);

  // NOTE: add/subtract/top-level sign flattening is handled once, up front,
  // by narrateDerivativeTop() using flattenSum() — by the time a node reaches
  // here it's already a single signed term, so no further +/- splitting.

  if (op?.fn === "unaryMinus" && op.args.length === 1) {
    steps.push(`##Constant Multiple Rule\n$$${here()} = -${derivativeLatex(op.args[0].toString(), variable, partial)}$$`);
    narrateDerivativeNode(op.args[0], variable, steps, partial, depth + 1);
    return;
  }

  // Constant multiple: c · f(x)
  if (op?.fn === "multiply" && op.args.length === 2) {
    const [a, b] = op.args.map(unwrapParens);
    const constSide = isConstantExpr(a, variable) ? a : isConstantExpr(b, variable) ? b : null;
    const fnSide = constSide === a ? b : a;
    if (constSide) {
      steps.push(`##Constant Multiple Rule\n$$${here()} = ${exprToLatex(constSide.toString())}\\cdot ${derivativeLatex(fnSide.toString(), variable, partial)}$$`);
      narrateDerivativeNode(fnSide, variable, steps, partial, depth + 1);
      return;
    }
  }

  // Division by a constant: f(x) / c
  if (op?.fn === "divide" && op.args.length === 2 && isConstantExpr(op.args[1], variable)) {
    steps.push(`##Constant Multiple Rule\n$$${here()} = \\frac{1}{${exprToLatex(op.args[1].toString())}}\\cdot ${derivativeLatex(op.args[0].toString(), variable, partial)}$$`);
    narrateDerivativeNode(op.args[0], variable, steps, partial, depth + 1);
    return;
  }

  // Product rule: u · v, both depending on the variable
  if (op?.fn === "multiply" && op.args.length === 2 && depth < 6) {
    const [u, v] = op.args.map(unwrapParens);
    const up = derivLx(u, variable);
    const vp = derivLx(v, variable);
    const uE = isElementary(u, variable);
    const vE = isElementary(v, variable);
    let defs = `u = ${exprToLatex(u.toString())},\\quad v = ${exprToLatex(v.toString())}`;
    if (uE) defs += `,\\quad u' = ${up}`;
    if (vE) defs += `,\\quad v' = ${vp}`;
    pushRuleSteps(steps, {
      header: "Product Rule",
      defs,
      formula: `${D("u*v")} = u'v + uv'`,
      sub: [...(uE ? [] : [{ label: "u'", node: u }]), ...(vE ? [] : [{ label: "v'", node: v }])],
      here: here(),
      substituted: `${wrapTex(up)}\\cdot ${wrapProd(v)} + ${wrapProd(u)}\\cdot ${wrapTex(vp)}`,
      result: derivLx(node, variable),
      showResult,
    }, variable, partial, depth);
    return;
  }

  // Quotient rule: u / v, both depending on the variable
  if (op?.fn === "divide" && op.args.length === 2 && depth < 6) {
    const [u, v] = op.args.map(unwrapParens);
    const up = derivLx(u, variable);
    const vp = derivLx(v, variable);
    const uE = isElementary(u, variable);
    const vE = isElementary(v, variable);
    let defs = `u = ${exprToLatex(u.toString())},\\quad v = ${exprToLatex(v.toString())}`;
    if (uE) defs += `,\\quad u' = ${up}`;
    if (vE) defs += `,\\quad v' = ${vp}`;
    pushRuleSteps(steps, {
      header: "Quotient Rule",
      defs,
      formula: `${D("u/v")} = \\frac{u'v - uv'}{v^{2}}`,
      sub: [...(uE ? [] : [{ label: "u'", node: u }]), ...(vE ? [] : [{ label: "v'", node: v }])],
      here: here(),
      substituted: `\\frac{${wrapTex(up)}\\cdot ${wrapProd(v)} - ${wrapProd(u)}\\cdot ${wrapTex(vp)}}{${wrapNode(v)}^{2}}`,
      result: derivLx(node, variable),
      showResult,
    }, variable, partial, depth);
    return;
  }

  if (op?.fn === "pow" && op.args.length === 2) {
    const [base, exp] = op.args.map(unwrapParens);

    // Constant exponent: x^n, (linear)^n, (anything)^n
    if (isConstantExpr(exp, variable)) {
      let n: unknown;
      try { n = evaluate(exp.toString()); } catch { n = undefined; }
      if (typeof n !== "number") {
        // exponent is a constant symbol such as y or a (e.g. ∂/∂x x^y)
        const sym0 = asSymbol(base);
        steps.push(`##Power Rule${sym0 && sym0.name === variable ? "" : " + Chain Rule"} (constant exponent $${exprToLatex(exp.toString())}$)\n$$\\frac{d}{d${variable}}u^{c} = c\\,u^{c-1}\\cdot u'$$\n$$${here()} = ${derivLx(node, variable)}$$`);
        return;
      }
      if (typeof n === "number") {
        const sym = asSymbol(base);
        if (sym && sym.name === variable) {
          steps.push(`##Power Rule\n$$${here()} = ${fmtNum(n)}\\,${variable}^{${fmtNum(n)}-1} = ${powerRuleResult(n, variable)}$$`);
          return;
        }
        const lin = tryLinear(base, variable);
        if (lin) {
          const u = exprToLatex(wrapLinearArg(lin.a, lin.b, variable));
          steps.push(`##Power Rule + Chain Rule\n$u = ${u},\\quad u' = ${fmtNum(lin.a)}$\n$$${here()} = ${fmtNum(n)}\\left(${u}\\right)^{${fmtNum(n - 1)}}\\cdot ${fmtNum(lin.a)}$$`);
          return;
        }
        if (depth < 6) {
          const bp = derivLx(base, variable);
          const bE = isElementary(base, variable);
          pushRuleSteps(steps, {
            header: "Power Rule + Chain Rule",
            defs: `u = ${exprToLatex(base.toString())}${bE ? `,\\quad u' = ${bp}` : ""}`,
            formula: `${D(`u^(${fmtNum(n)})`)} = ${fmtNum(n)}\\,u^{${fmtNum(n)}-1}\\cdot u'`,
            sub: bE ? [] : [{ label: "u'", node: base }],
            here: here(),
            substituted: `${fmtNum(n)}\\cdot ${wrapNode(base)}^{${fmtNum(n - 1)}}\\cdot ${wrapTex(bp)}`,
            result: derivLx(node, variable),
            showResult,
          }, variable, partial, depth);
          return;
        }
      }
    }

    // Constant base, variable exponent: a^u (including e^u)
    if (isConstantExpr(base, variable) && depth < 6) {
      const ep = derivLx(exp, variable);
      const eE = isElementary(exp, variable);
      const isE = asSymbol(base)?.name === "e";
      pushRuleSteps(steps, {
        header: "Exponential Rule",
        defs: `u = ${exprToLatex(exp.toString())}${eE ? `,\\quad u' = ${ep}` : ""}`,
        formula: isE ? `${D("e^u")} = e^{u}\\cdot u'` : `${D("a^u")} = a^{u}\\ln a\\cdot u'`,
        sub: eE ? [] : [{ label: "u'", node: exp }],
        here: here(),
        substituted: isE
          ? `e^{${exprToLatex(exp.toString())}}\\cdot ${wrapTex(ep)}`
          : `${wrapNode(base)}^{${exprToLatex(exp.toString())}}\\cdot \\ln ${wrapNode(base)}\\cdot ${wrapTex(ep)}`,
        result: derivLx(node, variable),
        showResult,
      }, variable, partial, depth);
      return;
    }

    // Variable base AND variable exponent: u^v
    if (depth < 6) {
      const up = derivLx(base, variable);
      const vp = derivLx(exp, variable);
      const uE = isElementary(base, variable);
      const vE = isElementary(exp, variable);
      let defs = `u = ${exprToLatex(base.toString())},\\quad v = ${exprToLatex(exp.toString())}`;
      if (uE) defs += `,\\quad u' = ${up}`;
      if (vE) defs += `,\\quad v' = ${vp}`;
      pushRuleSteps(steps, {
        header: "Logarithmic Differentiation",
        defs,
        formula: `${D("u^v")} = u^{v}\\left(v'\\ln u + \\frac{v\\,u'}{u}\\right)`,
        sub: [...(uE ? [] : [{ label: "u'", node: base }]), ...(vE ? [] : [{ label: "v'", node: exp }])],
        here: here(),
        substituted: `${wrapNode(base)}^{${exprToLatex(exp.toString())}}\\left(${vp === "1" ? "" : `${wrapTex(vp)}\\,`}\\ln ${wrapNode(base)} + \\frac{${wrapProd(exp)}${up === "1" ? "" : `\\cdot ${wrapTex(up)}`}}{${wrapNode(base)}}\\right)`,
        result: derivLx(node, variable),
        showResult,
      }, variable, partial, depth);
      return;
    }
  }

  // Any single-argument function (sin, cos, tan, sec, csc, cot, their
  // inverses, the hyperbolics, exp, log/ln, sqrt, cbrt, abs, ...) of the
  // variable — Chain Rule. The outer derivative rule is computed once via
  // mathjs's own derivative() applied to an abstract placeholder "u", so it
  // covers every function mathjs can differentiate, with the same correctness
  // guarantee the rest of the app already relies on.
  const fn = asFunctionNode(node);
  if (fn && fn.args.length === 1 && !isConstantExpr(fn.args[0], variable) && depth < 6) {
    const arg = unwrapParens(fn.args[0]);
    const displayName = fn.fn.name === "log" ? "ln" : fn.fn.name;
    const outerRule = outerDerivativeRule(fn.fn.name);
    if (outerRule) {
      const lin = tryLinear(arg, variable);
      if (lin) {
        // Inner function is linear (ax+b, or bare x): one multiply-by-u'.
        const u = exprToLatex(wrapLinearArg(lin.a, lin.b, variable));
        const outerAtArg = substituteRuleVariable(outerRule, arg);
        const trivial = lin.a === 1 && lin.b === 0;
        if (trivial) {
          steps.push(`##Derivative of ${displayName}(${variable})\n$$${here()} = ${outerAtArg}$$`);
        } else {
          steps.push(`##Chain Rule\n$u = ${u},\\quad u' = ${fmtNum(lin.a)}$\n$$${here()} = ${outerAtArg}\\cdot ${fmtNum(lin.a)}$$`);
        }
        return;
      }

      // Inner function is itself non-linear (sqrt(cos(x)), sin(x^2), ...):
      // a genuine two-layer chain rule. Inner derivatives that aren't obvious
      // get their own worked sub-steps (recursively).
      const uLatex = exprToLatex(arg.toString());
      const outerAtU = exprToLatex(outerRule.toString());
      const outerAtArg = substituteRuleVariable(outerRule, arg);
      // Let exprToLatex build "fn(u)" (via mathjs's toTex) so sqrt becomes a
      // radical and abs becomes bars instead of literal text.
      const outerFnLatex = exprToLatex(`${fn.fn.name}(u)`);
      const ip = derivLx(arg, variable);
      const iE = isElementary(arg, variable);
      pushRuleSteps(steps, {
        header: "Chain Rule",
        defs: `u = ${uLatex}${iE ? `,\\quad u' = ${ip}` : ""}`,
        formula: `\\frac{d}{d${variable}}\\left[${outerFnLatex}\\right] = ${wrapTex(outerAtU)}\\cdot u'`,
        sub: iE ? [] : [{ label: "u'", node: arg }],
        here: here(),
        substituted: `${outerAtArg}\\cdot ${wrapTex(ip)}`,
        result: derivLx(node, variable),
        showResult: false,
      }, variable, partial, depth);
      return;
    }
  }

  // Fallback for anything not specifically narrated above — still correct and
  // still rendered as real LaTeX, just without a granular breakdown.
  steps.push(`##Differentiate\n$$${here()} = ${derivLx(node, variable)}$$`);
}


/** Entry point: flattens the WHOLE top-level +/- chain (however deeply
 *  mathjs's parser nested it) into a flat list of signed terms in one pass —
 *  matching a textbook's "separate the terms / differentiate each term /
 *  combine" structure — rather than recursing through the parser's binary
 *  add/subtract tree one pair at a time, which produced redundant nested
 *  "combine" steps for every intermediate pairing. */
function narrateDerivativeTop(rawNode: MathNode, variable: string, steps: string[], partial = false, depth = 0): void {
  const node = unwrapParens(rawNode);
  const terms = flattenSum(node);
  if (terms.length <= 1) {
    narrateDerivativeNode(node, variable, steps, partial, depth);
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

  steps.push(`##Separate the Terms\n$$${wholeLatex} = ${perTermLatex}$$`);
  terms.forEach((t) => narrateDerivativeNode(t.node, variable, steps, partial, depth + 1));

  steps.push(`##Combine the Results\n$$${wholeLatex} = ${derivLx(node, variable)}$$`);
}

/** Substitutes a numeric value for `varName` (as a whole word, so "x" won't
 *  also match inside "exp") into an expression string — used to apply the
 *  Fundamental Theorem of Calculus (evaluate an antiderivative at a bound)
 *  without needing every other symbol in the expression to be resolved too,
 *  which mathjs's own evaluate(scope) requires. */
function substituteNumeric(exprStr: string, varName: string, value: number): string {
  const escaped = varName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return exprStr.replace(new RegExp(`\\b${escaped}\\b`, "g"), `(${fmtNum(value)})`);
}

interface SymbolicIntegralResult {
  /** The antiderivative, already run through prettifyResult. */
  antiderivativePretty: string;
  /** Ready-to-display steps: an "Approach" line (if any named rules were
   *  used) followed by the full rule-by-rule derivation and a final
   *  "Antiderivative" step — everything EXCEPT bound substitution or "+ C",
   *  which the caller (definite vs. indefinite vs. double) handles itself. */
  steps: string[];
}

/** Attempts a full symbolic antiderivative via the same rule-based
 *  integrator solveIndefiniteIntegral uses, shared here so that definite and
 *  double integrals can show the SAME quality of step-by-step derivation
 *  instead of jumping straight to a numerical approximation whenever a
 *  closed form actually exists. Returns null if no closed form is found —
 *  callers fall back to Simpson's Rule in that case, exactly as before. */
/** Tries the integrand as written AND in mathjs-simplified form (each can expose patterns the other hides). */
function integrateWithVariants(raw: MathNode, variable: string, steps: string[], budgetMs = 4000): { piece: IntegralPiece; node: MathNode } {
  return withIntegrationBudget(budgetMs, () => integrateWithVariantsInner(raw, variable, steps));
}

function integrateWithVariantsInner(raw: MathNode, variable: string, steps: string[]): { piece: IntegralPiece; node: MathNode } {
  const variants: MathNode[] = [];
  try { variants.push(simplify(raw)); } catch { /* ignore */ }
  variants.push(raw);
  for (const v of variants) {
    const buf: string[] = [];
    let piece: IntegralPiece = null;
    try { piece = integrateNode(v, variable, buf); } catch { piece = null; }
    if (piece) { steps.push(...buf); return { piece, node: v }; }
  }
  return { piece: null, node: raw };
}

function trySymbolicIntegral(node: MathNode, variable: string, label: string = "F"): SymbolicIntegralResult | null {
  const bodySteps: string[] = [];
  const { piece } = integrateWithVariants(node, variable, bodySteps);
  if (!piece) return null;
  const steps: string[] = [];
  steps.push(...bodySteps);
  const antiderivativePretty = prettifyResult(piece.antiderivative, variable);
  steps.push(`##Antiderivative\n$$${label}(${variable}) = ${exprToLatex(antiderivativePretty)}$$`);
  return { antiderivativePretty, steps };
}


// ── differentiation pre-processing ───────────────────────────────────────────
/** log10(u), log2(u), log(u, b)  →  ln(u)/ln(10), ln(u)/ln(2), ln(u)/ln(b): exact, differentiable forms. */
function rewriteLogBases(node: MathNode): MathNode {
  return node.transform((n: MathNode, path: string) => {
    if (path === "fn") return n;
    const fn = asFunctionNode(n);
    if (!fn) return n;
    if (fn.fn.name === "log10" && fn.args.length === 1) return parse(`log(${fn.args[0].toString()})/log(10)`);
    if (fn.fn.name === "log2" && fn.args.length === 1) return parse(`log(${fn.args[0].toString()})/log(2)`);
    if (fn.fn.name === "log" && fn.args.length === 2) return parse(`log(${fn.args[0].toString()})/log(${fn.args[1].toString()})`);
    return n;
  });
}

/** log(10), log(2), … are exact constants; keep them symbolic so simplify() doesn't turn 1/ln(10) into 0.4342…. */
function maskLogConstants(node: MathNode, variable: string[]): { node: MathNode; map: Map<string, string> } {
  const map = new Map<string, string>();
  let counter = 0;
  const masked = node.transform((n: MathNode, path: string) => {
    if (path === "fn") return n;
    const fn = asFunctionNode(n);
    if (fn && fn.fn.name === "log" && fn.args.length === 1 && variable.every((v) => isConstantExpr(n, v))) {
      const key = n.toString();
      let sym = [...map.entries()].find(([, v]) => v === key)?.[0];
      if (!sym) { sym = `LOGC${++counter}Z`; map.set(sym, key); }
      return parse(sym);
    }
    return n;
  });
  return { node: masked, map };
}

const STEP_FUNCTIONS = new Set(["floor", "ceil", "round", "fix", "sign"]);

/** Step functions (floor, ceil, round, sign) are flat between their jumps, so for
 *  differentiation they behave like constants: swap them for placeholder symbols. */
function maskStepFunctions(node: MathNode): { node: MathNode; map: Map<string, string>; used: boolean } {
  const map = new Map<string, string>();
  let counter = 0;
  const masked = node.transform((n: MathNode, path: string) => {
    if (path === "fn") return n;
    const fn = asFunctionNode(n);
    if (fn && STEP_FUNCTIONS.has(fn.fn.name) && fn.args.length >= 1) {
      const key = n.toString();
      let sym = [...map.entries()].find(([, v]) => v === key)?.[0];
      if (!sym) { sym = `STEPFN${++counter}Z`; map.set(sym, key); }
      return parse(sym);
    }
    return n;
  });
  return { node: masked, map, used: map.size > 0 };
}

function restoreStepFunctions(text: string, map: Map<string, string>, latex = false): string {
  let out = text;
  for (const [sym, original] of map) out = out.split(sym).join(latex ? exprToLatex(original) : `(${original.replace(/\blog\(/g, "ln(")})`);
  return out;
}

export function solveDerivative(
  expression: string,
  variable: string = "x"
): MathResult {
  try {
    expression = prepareInput(expression);
    variable = cleanVariable(variable);
    assertNonEmptyExpression(expression);
    const given = parse(expression);
    const steps: string[] = [];
    const bodySteps: string[] = [];

    steps.push(`##Given\n$$f(${variable}) = ${exprToLatex(given.toString())}$$`);

    const logMask = maskLogConstants(rewriteLogBases(given), [variable]);
    const masking = maskStepFunctions(logMask.node);
    const node = masking.node;
    if (masking.used) {
      const final = restoreStepFunctions(restoreStepFunctions(prettifyResult(simplify(derivative(node, variable)).toString(), variable), masking.map), logMask.map);
      steps.push(`##Step Function\nfloor, ceiling, round and sign are flat between their jumps, so their derivative is $0$ (undefined exactly at a jump).`);
      steps.push(`##Final Answer\n$$f'(${variable}) = ${exprToLatex(final)}$$`);
      return { input: expression, result: final, steps };
    }

    narrateDerivativeTop(node, variable, bodySteps);

    steps.push(...bodySteps.map((st) => restoreStepFunctions(st, logMask.map, true)));

    const deriv = derivative(node, variable);
    const simplified = simplify(deriv);
    const prettyFinal = restoreStepFunctions(prettifyResult(simplified.toString(), variable), logMask.map);

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
    expression = prepareInput(expression);
    variable = cleanVariable(variable);
    assertNonEmptyExpression(expression);
    if (!Number.isInteger(order) || order < 1) {
      throw new MathInputError("Please enter a whole number order of 1 or higher.");
    }
    const steps: string[] = [];
    const givenN = parse(expression);
    const logMaskN = maskLogConstants(rewriteLogBases(givenN), [variable]);
    const maskedN = maskStepFunctions(logMaskN.node);
    let current = maskedN.node;
    steps.push(`##Given\n$$f(${variable}) = ${exprToLatex(givenN.toString())}$$`);
    if (maskedN.used) {
      let cur = current;
      for (let i = 1; i <= order; i++) cur = simplify(derivative(cur, variable));
      const final = restoreStepFunctions(restoreStepFunctions(prettifyResult(cur.toString(), variable), maskedN.map), logMaskN.map);
      steps.push(`##Step Function\nfloor, ceiling, round and sign are flat between their jumps, so their derivative is $0$ (undefined exactly at a jump).`);
      steps.push(`##Final Answer\n$$f^{(${order})}(${variable}) = ${exprToLatex(final)}$$`);
      return { input: expression, result: final, steps };
    }

    for (let i = 1; i <= order; i++) {
      const buf: string[] = [];
      buf.push(`##Differentiation ${i} of ${order}\n$$f^{(${i - 1})}(${variable}) = ${exprToLatex(prettifyResult(current.toString(), variable))}$$`);
      narrateDerivativeTop(current, variable, buf);
      steps.push(...buf.map((st) => restoreStepFunctions(st, logMaskN.map, true)));
      const deriv = derivative(current, variable);
      const simplified = simplify(deriv);
      current = simplified;
    }

    const finalPretty = restoreStepFunctions(prettifyResult(current.toString(), variable), logMaskN.map);
    steps.push(`##Final Answer\n$$f^{(${order})}(${variable}) = ${exprToLatex(finalPretty)}$$`);

    return { input: expression, result: finalPretty, steps };
  } catch (e: unknown) {
    return { input: expression, result: "", steps: [], error: describeError(e) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Definite & double integrals.
//
// Strategy: closed form first (rule-based antiderivative + Fundamental Theorem),
// but ALWAYS cross-checked against an adaptive numerical integral so a wrong
// closed form (e.g. an antiderivative that blows up inside the interval) is
// never shown as the answer. Improper integrals (infinite limits, endpoint
// singularities) and integrals with no elementary antiderivative are handled
// by the numerical engine, which also reports honestly when an integral
// diverges or has no real value.
// ─────────────────────────────────────────────────────────────────────────────

const KNOWN_CONSTANTS = new Set(["pi", "e", "tau", "Infinity", "NaN"]);

/** Throws a friendly error if the expression uses a symbol other than `allowed` (and constants like pi, e). */
function assertOnlyKnownSymbols(node: MathNode, allowed: string[]): void {
  const bad = new Set<string>();
  node.traverse((n: MathNode, path: string) => {
    if (n.type !== "SymbolNode") return;
    const name = (n as unknown as { name: string }).name;
    if (path === "fn") return;
    if (!allowed.includes(name) && !KNOWN_CONSTANTS.has(name)) bad.add(name);
  });
  if (bad.size > 0) {
    const list = [...bad].join(", ");
    throw new MathInputError(
      `Unknown symbol${bad.size > 1 ? "s" : ""} "${list}". A numeric integral can only contain the variable${allowed.length > 1 ? "s" : ""} ${allowed.join(", ")} (and constants like pi, e).`,
    );
  }
}

/** Compiles a node into a plain numeric function; anything non-real becomes NaN. */
function compileReal(node: MathNode, vars: string[]): (...xs: number[]) => number {
  const code = node.compile();
  const scope: Record<string, number> = {};
  return (...xs: number[]) => {
    vars.forEach((v, i) => { scope[v] = xs[i]; });
    let r: unknown;
    try { r = code.evaluate(scope); } catch { return NaN; }
    return typeof r === "number" ? r : NaN;
  };
}

function boundLatex(b: number, label?: string): string {
  if (label && label.trim()) {
    const cleaned = cleanExpression(label);
    if (cleaned && !/^[+-]?\d+(\.\d+)?$/.test(cleaned)) {
      try { return exprToLatex(cleaned); } catch { /* fall through */ }
    }
  }
  if (b === Infinity) return "\\infty";
  if (b === -Infinity) return "-\\infty";
  const rec = Number.isFinite(b) ? recognizeConstant(b) : null;
  return rec && /pi|e/.test(rec.tex) ? rec.tex : fmtNum(b);
}

/** Replaces a whole-word variable by a full-precision numeric value (for evaluation). */
function substituteForEval(exprStr: string, varName: string, value: number): string {
  const escaped = varName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return exprStr.replace(new RegExp(`(?<![A-Za-z0-9_])${escaped}(?![A-Za-z0-9_(])`, "g"), `(${Number.isFinite(value) ? value.toPrecision(17) : String(value)})`);
}

/** Replaces a whole-word variable by an arbitrary expression string. */
function substituteExpr(exprStr: string, varName: string, replacement: string): string {
  const escaped = varName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return exprStr.replace(new RegExp(`(?<![A-Za-z0-9_])${escaped}(?![A-Za-z0-9_(])`, "g"), `(${replacement})`);
}

interface ValueSummary {
  step: string;
  result: string;
  numericResult: number;
  exactTex?: string;
  exactText?: string;
}

/** Formats the final number: closed-form recognition (π/2, 1 − π/4, …) plus the user's number format. */
function summarizeValue(value: number, trustedExact: boolean, settings: FormatSettings): ValueSummary {
  const v = Math.abs(value) < 1e-12 ? 0 : value;
  const rounded = Math.round(v * EPS_ROUND) / EPS_ROUND;
  const rec = trustedExact ? recognizeConstant(v) : null;
  const shown = formatNumber(rounded, settings);
  const isInt = rec && /^-?\d+$/.test(rec.text);
  let step: string;
  if (rec && isInt) step = `##Result\n$$${rec.tex}$$`;
  else if (rec) step = `##Result\n$$${rec.tex} \\approx ${shown}$$`;
  else step = `##Result\n$$${trustedExact ? "" : "\\approx "}${shown}$$`;
  return {
    step,
    result: rounded.toString(),
    numericResult: rounded,
    exactTex: rec && !isInt ? rec.tex : undefined,
    exactText: rec && !isInt ? rec.text : undefined,
  };
}

function numericProblem(status: IntegralStatus, context: string): MathInputError | null {
  if (status === "ok") return null;
  if (status === "diverges") return new MathInputError(`${context} diverges — it grows without bound, so it has no finite value.`);
  if (status === "undefined") return new MathInputError(`${context} isn't a real number on this range (for example the square root or logarithm of a negative number).`);
  return new MathInputError(`${context} doesn't converge — the integrand oscillates or decays too slowly for a finite value to be found.`);
}

export function solveDefiniteIntegral(
  expression: string,
  variable: string = "x",
  lower: number,
  upper: number,
  _n: number = 1000,
  settings: FormatSettings = DEFAULT_FORMAT_SETTINGS,
  labels?: { lower?: string; upper?: string },
): MathResult {
  try {
    expression = prepareInput(expression);
    variable = cleanVariable(variable);
    assertNonEmptyExpression(expression);
    if (typeof lower !== "number" || Number.isNaN(lower)) throw new MathInputError("Please enter a valid lower bound (a number, or something like pi/2, 1/3, -inf).");
    if (typeof upper !== "number" || Number.isNaN(upper)) throw new MathInputError("Please enter a valid upper bound (a number, or something like pi/2, 1/3, inf).");

    const node = parse(expression);
    assertOnlyKnownSymbols(node, [variable]);
    const lowL = boundLatex(lower, labels?.lower);
    const upL = boundLatex(upper, labels?.upper);
    const improper = !Number.isFinite(lower) || !Number.isFinite(upper);

    const steps: string[] = [];
    steps.push(`##Given\n$$\\int_{${lowL}}^{${upL}} ${exprToLatex(expression)}\\,d${variable}$$`);

    if (lower === upper) {
      steps.push(`##Equal Bounds\n$$\\int_{a}^{a} f\\,d${variable} = 0$$`);
      const s = summarizeValue(0, true, settings);
      steps.push(s.step);
      return { input: expression, result: s.result, steps, numericResult: 0 };
    }

    const f = compileReal(node, [variable]);
    const num = integrate1D(f, lower, upper);
    const trouble = numericProblem(num.status, "This integral");

    // 1) Closed form (finite bounds only), validated against the numeric value.
    if (!improper) {
      const symbolic = trySymbolicIntegral(node, variable);
      if (symbolic) {
        const atUpperStr = substituteForEval(symbolic.antiderivativePretty, variable, upper);
        const atLowerStr = substituteForEval(symbolic.antiderivativePretty, variable, lower);
        let atUpperVal = NaN, atLowerVal = NaN;
        try { atUpperVal = evaluate(atUpperStr) as number; } catch { /* domain issue */ }
        try { atLowerVal = evaluate(atLowerStr) as number; } catch { /* domain issue */ }
        if (typeof atUpperVal === "number" && typeof atLowerVal === "number" && isFinite(atUpperVal) && isFinite(atLowerVal)) {
          const value = atUpperVal - atLowerVal;
          const agrees = num.status === "ok" && Math.abs(value - num.value) <= 1e-6 * Math.max(1, Math.abs(num.value));
          if (agrees) {
            const upDisp = substituteExpr(symbolic.antiderivativePretty, variable, cleanExpression(labels?.upper || "") || fmtNum(upper));
            const loDisp = substituteExpr(symbolic.antiderivativePretty, variable, cleanExpression(labels?.lower || "") || fmtNum(lower));
            steps.push(...symbolic.steps);
            steps.push(`##Fundamental Theorem of Calculus\n$$\\int_{${lowL}}^{${upL}} f\\,d${variable} = F(${upL}) - F(${lowL})$$`);
            steps.push(`##Evaluate at the Bounds\n$$F(${upL}) - F(${lowL}) = ${exprToLatex(upDisp)} - \\left(${exprToLatex(loDisp)}\\right)$$`);
            const s = summarizeValue(num.value !== 0 ? value : 0, true, settings);
            steps.push(s.step);
            return { input: expression, result: s.result, steps, numericResult: s.numericResult, exactTex: s.exactTex, exactText: s.exactText };
          }
        }
      }
    }

    if (trouble) throw trouble;

    // 2) Numerical (no closed form, improper, or the closed form disagreed with the numeric check).
    if (improper) {
      const lim = (b: number, tex: string) => (Number.isFinite(b) ? "" : tex);
      const definition = !Number.isFinite(lower) && !Number.isFinite(upper)
        ? `\\lim_{A\\to-\\infty}\\lim_{B\\to\\infty}\\int_{A}^{B} f\\,d${variable}`
        : !Number.isFinite(upper)
          ? `\\lim_{B\\to\\infty}\\int_{${lowL}}^{B} f\\,d${variable}`
          : `\\lim_{A\\to-\\infty}\\int_{A}^{${upL}} f\\,d${variable}`;
      void lim;
      steps.push(`##Improper Integral\n$$\\int_{${lowL}}^{${upL}} f\\,d${variable} = ${definition}$$`);
      steps.push(`##Converges\nThe limit exists, so the integral converges. Evaluated numerically (adaptive Gauss–Kronrod).`);
    } else {
      steps.push(`##${num.status === "ok" ? "No Closed Form — " : ""}Numerical Integration\n$$\\int_{${lowL}}^{${upL}} f\\,d${variable} \\approx \\sum_i w_i\\, f(x_i)$$\nAdaptive Gauss–Kronrod, error ≈ ${num.error < 1e-14 ? "10⁻¹⁴" : num.error.toExponential(1)}.`);
    }
    const trusted = num.error < 1e-8 * (1 + Math.abs(num.value));
    const s = summarizeValue(num.value, trusted, settings);
    steps.push(s.step);
    return { input: expression, result: s.result, steps, numericResult: s.numericResult, exactTex: s.exactTex, exactText: s.exactText };
  } catch (e: unknown) {
    return { input: expression, result: "", steps: [], error: describeError(e) };
  }
}

type YBound = { kind: "const"; value: number; label: string } | { kind: "expr"; str: string; node: MathNode };

// Double integral ∬ f dy dx over a region: x from a to b (constants), y from
// g1(x) to g2(x) (constants or expressions in x). Closed form first (inner
// integral in y, then outer in x), cross-checked against nested adaptive
// quadrature; numerical fallback handles everything else, including infinite
// regions such as the Gaussian.
export function solveDoubleIntegral(
  expression: string,
  varX: string,
  varY: string,
  xLower: number | string,
  xUpper: number | string,
  yLower: number | string,
  yUpper: number | string,
  _n: number = 100,
  settings: FormatSettings = DEFAULT_FORMAT_SETTINGS,
): MathResult {
  try {
    expression = prepareInput(expression);
    varX = cleanVariable(varX, "x");
    varY = cleanVariable(varY, "y");
    assertNonEmptyExpression(expression);
    if (varX === varY) throw new MathInputError("The two variables must be different (e.g. x and y).");

    // x-limits that depend on y (e.g. x from 0 to y): the inner integral is then dx, so swap roles
    const dependsOn = (b: number | string, v: string) => typeof b === "string" && Number.isNaN(parseNumericInput(b)) && new RegExp(`\\b${v}\\b`).test(b);
    if ((dependsOn(xLower, varY) || dependsOn(xUpper, varY)) && !dependsOn(yLower, varX) && !dependsOn(yUpper, varX)) {
      const swapped = solveDoubleIntegral(expression, varY, varX, yLower, yUpper, xLower, xUpper, _n, settings);
      if (!swapped.error) swapped.steps = [`##Order of Integration\nThe ${varX}-limits depend on ${varY}, so ${varX} is the inner variable: integrate with respect to ${varX} first, then ${varY}.`, ...swapped.steps];
      return swapped;
    }

    const asNumber = (b: number | string, label: string): number => {
      const v = typeof b === "number" ? b : parseNumericInput(b);
      if (Number.isNaN(v)) throw new MathInputError(`Please enter a valid ${label} (a number, or something like pi/2, 1/3, inf).`);
      return v;
    };
    const xLo = asNumber(xLower, `${varX} lower bound`);
    const xHi = asNumber(xUpper, `${varX} upper bound`);

    const asYBound = (b: number | string, label: string): YBound => {
      if (typeof b === "number") {
        if (Number.isNaN(b)) throw new MathInputError(`Please enter a valid ${label}.`);
        return { kind: "const", value: b, label: "" };
      }
      const constant = parseNumericInput(b);
      if (!Number.isNaN(constant)) return { kind: "const", value: constant, label: b };
      const cleaned = cleanExpression(b);
      if (!cleaned) throw new MathInputError(`Please enter a valid ${label}.`);
      let n: MathNode;
      try { n = parse(cleaned); } catch { throw new MathInputError(`Please enter a valid ${label}.`); }
      assertOnlyKnownSymbols(n, [varX]);
      return { kind: "expr", str: cleaned, node: n };
    };
    const yLo = asYBound(yLower, `${varY} lower bound`);
    const yHi = asYBound(yUpper, `${varY} upper bound`);

    const node = parse(expression);
    assertOnlyKnownSymbols(node, [varX, varY]);

    const ybLatex = (b: YBound) => (b.kind === "const" ? boundLatex(b.value, b.label) : exprToLatex(b.str));
    const ybStr = (b: YBound) => (b.kind === "const" ? (Number.isFinite(b.value) ? fmtNum(b.value) : String(b.value)) : b.str);
    const xLoL = boundLatex(xLo, typeof xLower === "string" ? xLower : undefined);
    const xHiL = boundLatex(xHi, typeof xUpper === "string" ? xUpper : undefined);
    const yLoL = ybLatex(yLo);
    const yHiL = ybLatex(yHi);

    const steps: string[] = [];
    steps.push(`##Given\n$$\\iint_R ${exprToLatex(expression)}\\;d${varY}\\,d${varX}$$\n$${varX} \\in [${xLoL}, ${xHiL}],\\quad ${varY} \\text{ from } ${yLoL} \\text{ to } ${yHiL}$`);
    steps.push(`##Iterated Integral\n$$\\int_{${xLoL}}^{${xHiL}}\\left(\\int_{${yLoL}}^{${yHiL}} ${exprToLatex(expression)}\\,d${varY}\\right)d${varX}$$`);

    const yAt = (b: YBound): ((x: number) => number) => (b.kind === "const" ? () => b.value : compileReal(b.node, [varX]));
    const fn2 = compileReal(node, [varX, varY]);
    const infinite = [xLo, xHi].some((v) => !Number.isFinite(v)) || [yLo, yHi].some((b) => b.kind === "const" && !Number.isFinite(b.value));
    const num = integrate2D((x, y) => fn2(x, y), xLo, xHi, yAt(yLo), yAt(yHi));

    // Closed form (finite regions only).
    const innerSymbolic = !infinite ? trySymbolicIntegral(node, varY) : null;
    if (innerSymbolic) {
      try {
        const upSub = yHi.kind === "const" ? substituteForEval(innerSymbolic.antiderivativePretty, varY, yHi.value) : substituteExpr(innerSymbolic.antiderivativePretty, varY, yHi.str);
        const loSub = yLo.kind === "const" ? substituteForEval(innerSymbolic.antiderivativePretty, varY, yLo.value) : substituteExpr(innerSymbolic.antiderivativePretty, varY, yLo.str);
        const gPretty = prettifyResult(simplify(parse(`(${upSub}) - (${loSub})`)).toString(), varX);
        const outerSymbolic = trySymbolicIntegral(parse(gPretty), varX, "G");
        if (outerSymbolic) {
          const atXUpperStr = substituteForEval(outerSymbolic.antiderivativePretty, varX, xHi);
          const atXLowerStr = substituteForEval(outerSymbolic.antiderivativePretty, varX, xLo);
          const hi = evaluate(atXUpperStr) as number;
          const lo = evaluate(atXLowerStr) as number;
          if (typeof hi === "number" && typeof lo === "number" && isFinite(hi) && isFinite(lo)) {
            const value = hi - lo;
            if (num.status === "ok" && Math.abs(value - num.value) <= 1e-6 * Math.max(1, Math.abs(num.value))) {
              steps.push(`##Inner Integral — d${varY} ($${varX}$ constant)`);
              steps.push(...innerSymbolic.steps);
              steps.push(`##Evaluate at the ${varY}-Bounds\n$$\\Big[F(${varX},${varY})\\Big]_{${varY}=${yLoL}}^{${varY}=${yHiL}} = ${exprToLatex(gPretty)}$$`);
              steps.push(`##Outer Integral (with respect to ${varX})`);
              steps.push(...outerSymbolic.steps);
              steps.push(`##Evaluate at the ${varX}-Bounds\n$$G(${xHiL}) - G(${xLoL})$$`);
              const s = summarizeValue(value, true, settings);
              steps.push(s.step);
              return { input: expression, result: s.result, steps, numericResult: s.numericResult, exactTex: s.exactTex, exactText: s.exactText };
            }
          }
        }
      } catch {
        // domain issue in the closed form — use the numerical value
      }
    }

    const trouble = numericProblem(num.status, "This double integral");
    if (trouble) throw trouble;
    void ybStr;
    steps.push(`##${infinite ? "Improper Region — " : "No Closed Form — "}Numerical Integration\n$$\\iint_R f\\,d${varY}\\,d${varX} \\approx \\int \\left(\\sum_j w_j\\, f(x, y_j)\\right) dx$$\nNested adaptive Gauss–Kronrod.`);
    const trusted = num.error < 1e-7 * (1 + Math.abs(num.value));
    const s = summarizeValue(num.value, trusted, settings);
    steps.push(s.step);
    return { input: expression, result: s.result, steps, numericResult: s.numericResult, exactTex: s.exactTex, exactText: s.exactText };
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

type IntegralPiece = { antiderivative: string; rule: string; verified?: boolean } | null;

function isConstantExpr(node: MathNode, variable: string): boolean {
  let has = false;
  node.traverse((n: MathNode, path: string) => {
    if (n.type === "SymbolNode" && path !== "fn" && (n as unknown as { name: string }).name === variable) has = true;
  });
  return !has;
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


// ── u-Substitution and Integration by Parts ──────────────────────────────────
// The rules above cover everything whose inner function is LINEAR (sin(2x+1),
// (3x+1)^5, e^{-x}…). These two helpers extend the integrator to the two
// techniques every calculus course teaches next, so integrals like
// ∫2x·cos(x²)dx, ∫x/(x²+1)dx and ∫x·e^x dx are solved in full instead of
// falling through to "Cannot solve symbolically". Both push a complete
// textbook derivation (choose u, differentiate, rewrite, integrate, substitute
// back) — no step is compressed away.

/** Runs mathjs simplify over an expression string, keeping the original if
 *  simplification fails — used to keep intermediate results readable
 *  ("exp(x)" rather than "exp(x)/1"). */
function tidyExpr(str: string): string {
  try {
    return simplify(parse(str)).toString().replace(/\+ -/g, "- ");
  } catch {
    return str;
  }
}

/** Flattens a*b*c (however mathjs nested it) into [a, b, c]. */
function flattenProduct(node: MathNode): MathNode[] {
  const op = asOperator(node);
  if (op?.fn === "multiply") return op.args.flatMap((a) => flattenProduct(a));
  return [node];
}

function mulStrings(parts: string[]): string {
  if (parts.length === 0) return "1";
  return parts.map((p) => `(${p})`).join("*");
}

/** Evaluates a node to a plain number when it carries no variable. */
function constValue(node: MathNode, variable: string): number | null {
  if (!isConstantExpr(node, variable)) return null;
  try {
    const v = evaluate(node.toString());
    return typeof v === "number" && isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

/** The antiderivative of a standard "outer" function, written in terms of a
 *  placeholder that the caller substitutes the inner function back into. */
type OuterForm =
  | { kind: "fn"; name: string; inner: MathNode }
  | { kind: "pow"; exponent: number; inner: MathNode }
  | { kind: "recip"; inner: MathNode }
  | { kind: "identity"; inner: MathNode };

function describeOuter(node: MathNode, variable: string): OuterForm | null {
  const fn = asFunctionNode(node);
  if (fn && fn.args.length === 1 && !isConstantExpr(fn.args[0], variable)) {
    if (["sin", "cos", "exp", "tan", "sqrt", "log"].includes(fn.fn.name)) {
      return { kind: "fn", name: fn.fn.name, inner: fn.args[0] };
    }
    return null;
  }
  const op = asOperator(node);
  if (op?.fn === "pow") {
    const [base, exp] = op.args;
    const n = constValue(exp, variable);
    if (n !== null && !isConstantExpr(base, variable)) {
      return n === -1 ? { kind: "recip", inner: base } : { kind: "pow", exponent: n, inner: base };
    }
  }
  return null;
}

/** ∫f(u)du for the standard outer forms, as a string in terms of `uStr`. */
function antiderivOfOuter(form: OuterForm, uStr: string): { expr: string; latexRule: string } | null {
  const u = `(${uStr})`;
  switch (form.kind) {
    case "fn":
      switch (form.name) {
        case "sin":  return { expr: `-cos${u}`,  latexRule: "\\int \\sin(u)\\,du = -\\cos(u)" };
        case "cos":  return { expr: `sin${u}`,   latexRule: "\\int \\cos(u)\\,du = \\sin(u)" };
        case "exp":  return { expr: `exp${u}`,   latexRule: "\\int e^{u}\\,du = e^{u}" };
        case "tan":  return { expr: `-log(abs(cos${u}))`, latexRule: "\\int \\tan(u)\\,du = -\\ln|\\cos(u)|" };
        case "sqrt": return { expr: `(2/3)*${u}^(3/2)`,   latexRule: "\\int \\sqrt{u}\\,du = \\tfrac{2}{3}u^{3/2}" };
        case "log":  return { expr: `${u}*log${u} - ${u}`, latexRule: "\\int \\ln(u)\\,du = u\\ln(u) - u" };
        default: return null;
      }
    case "pow": {
      const n = form.exponent;
      return { expr: `${u}^(${fmtNum(n + 1)})/(${fmtNum(n + 1)})`, latexRule: `\\int u^{${fmtNum(n)}}\\,du = \\frac{u^{${fmtNum(n + 1)}}}{${fmtNum(n + 1)}}` };
    }
    case "recip":
      return { expr: `log(abs${u})`, latexRule: "\\int \\frac{1}{u}\\,du = \\ln|u|" };
    case "identity":
      return { expr: `${u}^2/2`, latexRule: "\\int u\\,du = \\frac{u^2}{2}" };
  }
}

/**
 * General u-substitution: spots an integrand of the form k · g'(x) · f(g(x))
 * (including the quotient form g'(x)/g(x)) and integrates it by letting
 * u = g(x). Returns null unless the leftover factor really is a constant
 * multiple of g'(x), so nothing is fudged.
 */
function tryGeneralUSub(node: MathNode, variable: string, steps: string[]): IntegralPiece {
  const op = asOperator(node);
  if (!op) return null;

  // Build the list of multiplied factors. A quotient a/b counts as a · b^(-1).
  let factors: MathNode[];
  if (op.fn === "multiply") {
    factors = flattenProduct(node);
  } else if (op.fn === "divide") {
    const [num, den] = op.args;
    if (isConstantExpr(den, variable)) return null;
    try {
      factors = [...flattenProduct(num), parse(`(${den.toString()})^(-1)`)];
    } catch {
      return null;
    }
  } else {
    return null;
  }
  if (factors.length < 2) return null;

  // First pass looks for f(g(x))·g'(x); the second treats a whole factor as u
  // itself (the ∫sin(x)cos(x)dx = sin²(x)/2 pattern).
  const candidates: OuterForm[] = [];
  for (const f of factors) {
    const form = describeOuter(f, variable);
    if (form) candidates.push(form);
  }
  for (const f of factors) {
    if (!isConstantExpr(f, variable)) candidates.push({ kind: "identity", inner: f });
  }

  for (let ci = 0; ci < candidates.length; ci++) {
    const form = candidates[ci];
    const i = factors.findIndex((f) =>
      form.kind === "identity" ? f.toString() === form.inner.toString() : describeOuter(f, variable)?.inner.toString() === form.inner.toString()
    );
    if (i < 0) continue;
    const inner = form.inner;
    // A linear inner function is already handled by the simpler rules above.
    const innerDeriv = (() => { try { return simplify(derivative(inner, variable)); } catch { return null; } })();
    if (!innerDeriv || isConstantExpr(innerDeriv, variable)) continue;

    const rest = factors.filter((_, j) => j !== i);
    const restStr = mulStrings(rest.map((r) => r.toString()));
    let ratio: number | null = null;
    try {
      ratio = constValue(simplify(parse(`(${restStr})/(${innerDeriv.toString()})`)), variable);
    } catch {
      ratio = null;
    }
    if (ratio === null || ratio === 0) continue;

    const anti = antiderivOfOuter(form, "u");
    if (!anti) continue;

    const innerL = exprToLatex(inner.toString());
    const derivL = exprToLatex(innerDeriv.toString());
    const kL = fmtNum(ratio);

    steps.push(`##u-Substitution\n$$u = ${innerL}, \\quad du = ${derivL}\\,d${variable}$$`);
    const integrandInU =
      form.kind === "recip" ? "\\frac{1}{u}"
      : form.kind === "pow" ? `u^{${fmtNum(form.exponent)}}`
      : form.kind === "identity" ? "u"
      : `${form.name === "log" ? "\\ln" : `\\${form.name}`}(u)`;
    steps.push(`##Rewrite in Terms of u\n$$\\int ${exprToLatex(node.toString())}\\,d${variable} = ${ratio === 1 ? "" : kL}\\int ${integrandInU}\\,du$$`);
    steps.push(`##Integrate\n$$${ratio === 1 ? "" : kL}\\int ${integrandInU}\\,du = ${ratio === 1 ? "" : kL}${ratio === 1 ? exprToLatex(anti.expr) : `\\left[${exprToLatex(anti.expr)}\\right]`}$$`);
    const backStr = anti.expr.replace(/\bu\b/g, `(${inner.toString()})`);
    const finalStr = ratio === 1 ? backStr : `(${kL})*(${backStr})`;
    steps.push(`##Substitute Back\n$$u = ${innerL} \\;\\Rightarrow\\; ${exprToLatex(finalStr)}$$`);

    return { antiderivative: finalStr, rule: "u-substitution" };
  }
  return null;
}

/** The polynomial degree of a node in `variable`, or null if it isn't one. */
function polyDegree(node: MathNode, variable: string): number | null {
  const str = node.toString();
  if (!str.includes(variable)) return 0;
  if (asSymbol(node) && str === variable) return 1;
  const op = asOperator(node);
  if (op?.fn === "pow") {
    const n = constValue(op.args[1], variable);
    if (n !== null && Number.isInteger(n) && n >= 0 && asSymbol(op.args[0])?.name === variable) return n;
    return null;
  }
  if (op && (op.fn === "add" || op.fn === "subtract" || op.fn === "multiply")) {
    const degs = op.args.map((a) => polyDegree(a, variable));
    if (degs.some((d) => d === null)) return null;
    const ds = degs as number[];
    return op.fn === "multiply" ? ds.reduce((a, b) => a + b, 0) : Math.max(...ds);
  }
  if (op?.fn === "unaryMinus") return polyDegree(op.args[0], variable);
  return null;
}

/**
 * Integration by parts for the classic case: a polynomial multiplied by
 * sin / cos / e^(linear), or by ln. Picks u by LIATE, applies
 * ∫u\,dv = uv - ∫v\,du, and recurses — the polynomial loses a degree each
 * pass, so it always terminates.
 */
function tryIntegrationByParts(node: MathNode, variable: string, steps: string[], depth = 0): IntegralPiece {
  if (depth > 4) return null;
  const op = asOperator(node);
  if (op?.fn !== "multiply") return null;
  const factors = flattenProduct(node);
  if (factors.length < 2) return null;

  // Split into (polynomial part) × (the rest)
  const polyParts: MathNode[] = [];
  const otherParts: MathNode[] = [];
  for (const f of factors) {
    const d = polyDegree(f, variable);
    if (d !== null) polyParts.push(f); else otherParts.push(f);
  }
  if (otherParts.length !== 1) return null;

  const polyNode = simplify(parse(mulStrings(polyParts.map((p) => p.toString()))));
  const otherNode = otherParts[0];
  const polyDeg = polyDegree(polyNode, variable);
  if (polyDeg === null || polyDeg < 1) return null;

  // LIATE: a logarithm always becomes u (differentiating it is what makes the
  // remaining integral easy); otherwise the polynomial is u, since each pass
  // drops its degree by one and the recursion terminates.
  const otherIsLog = asFunctionNode(otherNode)?.fn.name === "log";
  const uNode = otherIsLog ? otherNode : polyNode;
  const dvNode = otherIsLog ? polyNode : otherNode;

  // dv must be something we can integrate on its own.
  const dvSteps: string[] = [];
  const dvPiece = integrateNode(dvNode, variable, dvSteps, depth + 1);
  if (!dvPiece) return null;

  const vStr = tidyExpr(dvPiece.antiderivative);
  const duNode = simplify(derivative(uNode, variable));

  const uL = exprToLatex(uNode.toString());
  const dvL = exprToLatex(dvNode.toString());
  const vL = exprToLatex(vStr);
  const duL = exprToLatex(duNode.toString());

  steps.push(`##Integration by Parts\n$$\\int u\\,dv = uv - \\int v\\,du$$\n$$u = ${uL}, \\qquad dv = ${dvL}\\,d${variable}$$`);
  steps.push(`##Find $du$ and $v$\n$$du = ${duL}\\,d${variable}, \\qquad v = \\int ${dvL}\\,d${variable} = ${vL}$$`);
  steps.push(`##Substitute\n$$\\int ${exprToLatex(node.toString())}\\,d${variable} = ${uL}\\cdot ${vL} - \\int ${vL}\\cdot ${duL}\\,d${variable}$$`);

  const remainderStr = `(${vStr})*(${duNode.toString()})`;
  let remainderNode: MathNode;
  try {
    remainderNode = simplify(parse(remainderStr));
  } catch {
    return null;
  }

  steps.push(`##Solve the Remaining Integral\n$$\\int ${exprToLatex(remainderNode.toString())}\\,d${variable}$$`);
  const innerSteps: string[] = [];
  let remainderPiece = integrateNode(remainderNode, variable, innerSteps, depth + 1);
  if (!remainderPiece) {
    const partsSteps: string[] = [];
    remainderPiece = tryIntegrationByParts(remainderNode, variable, partsSteps, depth + 1);
    if (remainderPiece) innerSteps.push(...partsSteps);
  }
  if (!remainderPiece) return null;
  steps.push(...innerSteps);

  const finalStr = tidyExpr(`(${uNode.toString()})*(${vStr}) - (${remainderPiece.antiderivative})`);
  steps.push(`##Combine\n$$\\int ${exprToLatex(node.toString())}\\,d${variable} = ${exprToLatex(finalStr)}$$`);

  return { antiderivative: finalStr, rule: "integration by parts" };
}

/** ∫ k/(x² + a²) dx = (k/a)·arctan(x/a) — the standard arctan form. */
function tryArctanForm(node: MathNode, variable: string, steps: string[]): IntegralPiece {
  const op = asOperator(node);
  if (op?.fn !== "divide") return null;
  const [num, den] = op.args;
  const k = constValue(num, variable);
  if (k === null) return null;
  // Match den = c·x² + d with c, d > 0
  try {
    const c = (evaluate(den.toString(), { [variable]: 1 }) as number) - (evaluate(den.toString(), { [variable]: 0 }) as number);
    const d = evaluate(den.toString(), { [variable]: 0 }) as number;
    if (typeof c !== "number" || typeof d !== "number" || c <= 0 || d <= 0) return null;
    // Confirm it really is quadratic with no linear term.
    const check = evaluate(den.toString(), { [variable]: 2 }) as number;
    if (Math.abs(check - (4 * c + d)) > 1e-9) return null;
    const a = Math.sqrt(d / c);
    const aStr = fmtNum(a);
    const argStr = a === 1 ? variable : `${variable}/(${aStr})`;
    const coef = k / (c * a);
    steps.push(`##Arctangent Form\n$$${c === 1 ? "" : `${exprToLatex(den.toString())} = ${fmtNum(c)}\\left(${variable}^2 + ${fmtNum(a * a)}\\right), \\quad `}a = ${fmtNum(a)}$$\n$$\\int\\frac{du}{u^2+a^2} = \\frac{1}{a}\\arctan\\!\\left(\\frac{u}{a}\\right)$$`);
    steps.push(`##Substitute\n$$\\int \\frac{${fmtNum(k)}}{${exprToLatex(den.toString())}}\\,d${variable} = \\frac{${fmtNum(k)}}{${c === 1 ? "" : `${fmtNum(c)}\\cdot `}${fmtNum(a)}}\\arctan\\!\\left(\\frac{${variable}}{${fmtNum(a)}}\\right)$$`);
    return {
      antiderivative: coef === 1 ? `atan(${argStr})` : `(${fmtNum(coef)})*atan(${argStr})`,
      rule: "arctangent rule",
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Extra integration strategies.
//
// integrateNode() (the original rule-based integrator, now integrateNodeCore)
// handles sums, constant multiples, the power rule, simple trig/exp/log and
// linear u-substitution. The strategies below widen coverage for what a
// student actually meets: polynomial products, rational functions (partial
// fractions), powers/products of sin & cos, tan/sec/cot/csc powers, inverse
// trig and hyperbolic functions, radicals of quadratics, x·(ax+b)^p,
// e^{ax}·sin(bx), ln(x)^n and algebraic-derivative integration by parts.
//
// Every strategy writes into its own step buffer, and every result produced
// here is verified numerically (d/dx of the answer must reproduce the
// integrand at several sample points) before it is accepted — so a strategy
// that misfires simply returns null instead of showing a wrong antiderivative.
// ─────────────────────────────────────────────────────────────────────────────

type Poly = number[]; // coefficients, ascending powers

function trimPoly(p: Poly): Poly {
  const q = [...p];
  while (q.length > 1 && Math.abs(q[q.length - 1]) < 1e-12) q.pop();
  return q;
}
function polyAdd(a: Poly, b: Poly): Poly {
  const n = Math.max(a.length, b.length);
  return trimPoly(Array.from({ length: n }, (_, i) => (a[i] ?? 0) + (b[i] ?? 0)));
}
function polyMul(a: Poly, b: Poly): Poly {
  const out = new Array(a.length + b.length - 1).fill(0);
  a.forEach((x, i) => b.forEach((y, j) => { out[i + j] += x * y; }));
  return trimPoly(out);
}
function polyScale(a: Poly, k: number): Poly { return trimPoly(a.map((x) => x * k)); }
function polyDeg(a: Poly): number { return trimPoly(a).length - 1; }
function polyEvalAt(a: Poly, x: number): number { return a.reduceRight((acc, c) => acc * x + c, 0); }

function polyDivide(num: Poly, den: Poly): { q: Poly; r: Poly } {
  const n = trimPoly(num);
  const d = trimPoly(den);
  let r = [...n];
  const q = new Array(Math.max(n.length - d.length + 1, 1)).fill(0);
  const lead = d[d.length - 1];
  for (let k = n.length - d.length; k >= 0; k--) {
    const c = r[k + d.length - 1] / lead;
    q[k] = c;
    for (let j = 0; j < d.length; j++) r[k + j] -= c * d[j];
  }
  r = trimPoly(r.slice(0, Math.max(d.length - 1, 1)));
  return { q: trimPoly(q), r };
}

/** A clean numeric literal for building expression strings. */
function numLit(v: number): string {
  if (Number.isInteger(v)) return String(v);
  const f = toSimpleFraction(v, 2000);
  if (f.includes("/")) {
    const ok = Math.abs((evaluate(f) as number) - v) < 1e-9 * Math.max(1, Math.abs(v));
    if (ok) return `(${f})`;
  }
  return String(Number(v.toPrecision(12)));
}

function polyToString(p: Poly, variable: string): string {
  const terms: string[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const c = p[i];
    if (Math.abs(c) < 1e-12) continue;
    const mag = Math.abs(c);
    const coef = Math.abs(mag - 1) < 1e-12 && i > 0 ? "" : numLit(mag);
    const mono = i === 0 ? "" : i === 1 ? variable : `${variable}^${i}`;
    const body = coef && mono ? `${coef}*${mono}` : coef || mono;
    terms.push(`${c < 0 ? "-" : "+"} ${body}`);
  }
  if (terms.length === 0) return "0";
  const s = terms.join(" ");
  return s.startsWith("+ ") ? s.slice(2) : s.startsWith("- ") ? `-${s.slice(2)}` : s;
}

/** If `node` is a polynomial in `variable` with numeric coefficients, returns its coefficients. */
function polyFromNode(node: MathNode, variable: string): Poly | null {
  const n = unwrapParens(node);
  if (isConstantExpr(n, variable)) {
    try {
      const v = evaluate(n.toString());
      return typeof v === "number" && Number.isFinite(v) ? [v] : null;
    } catch { return null; }
  }
  const sym = asSymbol(n);
  if (sym) return sym.name === variable ? [0, 1] : null;
  const op = asOperator(n);
  if (!op) return null;
  if (op.fn === "unaryMinus" && op.args.length === 1) {
    const a = polyFromNode(op.args[0], variable);
    return a ? polyScale(a, -1) : null;
  }
  if (op.fn === "unaryPlus" && op.args.length === 1) return polyFromNode(op.args[0], variable);
  if ((op.fn === "add" || op.fn === "subtract") && op.args.length === 2) {
    const a = polyFromNode(op.args[0], variable);
    const b = polyFromNode(op.args[1], variable);
    if (!a || !b) return null;
    return polyAdd(a, op.fn === "add" ? b : polyScale(b, -1));
  }
  if (op.fn === "multiply") {
    let acc: Poly = [1];
    for (const a of op.args) {
      const pa = polyFromNode(a, variable);
      if (!pa) return null;
      acc = polyMul(acc, pa);
    }
    return acc;
  }
  if (op.fn === "divide" && op.args.length === 2) {
    const a = polyFromNode(op.args[0], variable);
    const d = polyFromNode(op.args[1], variable);
    if (!a || !d || d.length !== 1 || Math.abs(d[0]) < 1e-14) return null;
    return polyScale(a, 1 / d[0]);
  }
  if (op.fn === "pow" && op.args.length === 2 && isConstantExpr(op.args[1], variable)) {
    const base = polyFromNode(op.args[0], variable);
    let e: unknown;
    try { e = evaluate(op.args[1].toString()); } catch { return null; }
    if (!base || typeof e !== "number" || !Number.isInteger(e) || e < 0 || e > 24) return null;
    let acc: Poly = [1];
    for (let i = 0; i < e; i++) acc = polyMul(acc, base);
    return acc;
  }
  return null;
}

// ── numeric verification ──────────────────────────────────────────────────────
const VERIFY_POINTS = [-2.7, -1.3, -0.6, -0.15, 0.05, 0.15, 0.31, 0.55, 0.7, 0.85, 1.4, 2.2, 3.1, 5.3, 8.4];

/** Does d/dx of `antiderivative` reproduce `integrand` at several sample points? */
function verifyAntiderivative(integrand: MathNode, antiderivative: string, variable: string, points: number[] = VERIFY_POINTS): boolean {
  try {
    const f = compileReal(integrand, [variable]);
    const F = compileReal(parse(antiderivative), [variable]);
    let valid = 0;
    for (const x of points) {
      const fx = f(x);
      if (!Number.isFinite(fx)) continue;
      const h = 1e-5 * Math.max(1, Math.abs(x));
      const f1 = F(x + h), f0 = F(x - h), f2 = F(x + 2 * h), fm2 = F(x - 2 * h);
      if (![f1, f0, f2, fm2].every(Number.isFinite)) continue;
      const d = (-f2 + 8 * f1 - 8 * f0 + fm2) / (12 * h);
      if (Math.abs(d - fx) > 1e-4 * Math.max(1, Math.abs(fx), Math.abs(d))) return false;
      valid++;
    }
    return valid >= 2;
  } catch {
    return false;
  }
}

// ── flatten a product into (numeric coefficient, factor list) ────────────────
function collectFactors(node: MathNode, variable: string): { coeff: number; factors: MathNode[] } {
  const n = unwrapParens(node);
  const op = asOperator(n);
  if (op?.fn === "unaryMinus" && op.args.length === 1) {
    const inner = collectFactors(op.args[0], variable);
    return { coeff: -inner.coeff, factors: inner.factors };
  }
  if (op?.fn === "multiply") {
    let coeff = 1;
    const factors: MathNode[] = [];
    for (const a of op.args) {
      const inner = collectFactors(a, variable);
      coeff *= inner.coeff;
      factors.push(...inner.factors);
    }
    return { coeff, factors };
  }
  if (op?.fn === "divide" && op.args.length === 2) {
    const num = collectFactors(op.args[0], variable);
    const den = unwrapParens(op.args[1]);
    if (isConstantExpr(den, variable)) {
      try {
        const v = evaluate(den.toString());
        if (typeof v === "number" && v !== 0 && Number.isFinite(v)) return { coeff: num.coeff / v, factors: num.factors };
      } catch { /* opaque */ }
    }
    // dividing by e^u / exp(u) is multiplying by e^(-u)
    const dop = asOperator(den);
    const dfn = asFunctionNode(den);
    if (dfn && dfn.fn.name === "exp" && dfn.args.length === 1) return { coeff: num.coeff, factors: [...num.factors, parse(`exp(-(${dfn.args[0].toString()}))`)] };
    if (dop?.fn === "pow" && dop.args.length === 2 && asSymbol(unwrapParens(dop.args[0]))?.name === "e") {
      return { coeff: num.coeff, factors: [...num.factors, parse(`exp(-(${dop.args[1].toString()}))`)] };
    }
    if (asSymbol(den)?.name === "e") return { coeff: num.coeff, factors: [...num.factors, parse("exp(-1)")] };
    if (dop?.fn === "pow" && dop.args.length === 2 && isConstantExpr(dop.args[1], variable)) {
      const ev = evaluate(dop.args[1].toString());
      if (typeof ev === "number") return { coeff: num.coeff, factors: [...num.factors, parse(`(${dop.args[0].toString()})^(${-ev})`)] };
    }
    if (dfn && dfn.fn.name === "sqrt" && dfn.args.length === 1) return { coeff: num.coeff, factors: [...num.factors, parse(`(${dfn.args[0].toString()})^(-1/2)`)] };
    return { coeff: num.coeff, factors: [...num.factors, parse(`(${den.toString()})^(-1)`)] };
  }
  if (isConstantExpr(n, variable)) {
    try {
      const v = evaluate(n.toString());
      if (typeof v === "number" && Number.isFinite(v)) return { coeff: v, factors: [] };
    } catch { /* keep as a factor */ }
  }
  return { coeff: 1, factors: [n] };
}

// ── complex numbers (tiny) for the sin/cos product expansion ─────────────────
interface Cx { re: number; im: number }
const cxMul = (a: Cx, b: Cx): Cx => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });

/** Fourier terms {freq → complex coeff} of sin(a x + b) or cos(a x + b). */
function trigTerms(kind: "sin" | "cos", a: number, b: number): Map<number, Cx> {
  const m = new Map<number, Cx>();
  if (kind === "sin") {
    m.set(a, { re: Math.sin(b) / 2, im: -Math.cos(b) / 2 });
    m.set(-a, { re: Math.sin(b) / 2, im: Math.cos(b) / 2 });
  } else {
    m.set(a, { re: Math.cos(b) / 2, im: Math.sin(b) / 2 });
    m.set(-a, { re: Math.cos(b) / 2, im: -Math.sin(b) / 2 });
  }
  return m;
}
function mulTerms(A: Map<number, Cx>, B: Map<number, Cx>): Map<number, Cx> {
  const out = new Map<number, Cx>();
  const key = (w: number) => Number(w.toFixed(9));
  for (const [w1, c1] of A) {
    for (const [w2, c2] of B) {
      const w = key(w1 + w2);
      const c = cxMul(c1, c2);
      const prev = out.get(w) ?? { re: 0, im: 0 };
      out.set(w, { re: prev.re + c.re, im: prev.im + c.im });
    }
  }
  return out;
}

/** sin^m·cos^n·… of linear arguments → Σ c·cos(ωx) + s·sin(ωx), as an expression string. */
function trigProductToSum(node: MathNode, variable: string): string | null {
  const { coeff, factors } = collectFactors(node, variable);
  if (factors.length === 0) return null;
  let acc: Map<number, Cx> = new Map([[0, { re: coeff, im: 0 }]]);
  let count = 0;
  for (const f of factors) {
    let base = f;
    let power = 1;
    const op = asOperator(f);
    if (op?.fn === "pow" && op.args.length === 2 && isConstantExpr(op.args[1], variable)) {
      const e = evaluate(op.args[1].toString());
      if (typeof e !== "number" || !Number.isInteger(e) || e < 1 || e > 12) return null;
      base = unwrapParens(op.args[0]);
      power = e;
    }
    const fn = asFunctionNode(base);
    if (!fn || fn.args.length !== 1 || (fn.fn.name !== "sin" && fn.fn.name !== "cos")) return null;
    const lin = tryLinear(fn.args[0], variable);
    if (!lin || Math.abs(lin.a) < 1e-12) return null;
    const t = trigTerms(fn.fn.name as "sin" | "cos", lin.a, lin.b);
    for (let i = 0; i < power; i++) {
      acc = mulTerms(acc, t);
      count++;
      if (count > 12) return null;
    }
  }
  const parts: string[] = [];
  const freqs = [...acc.keys()].filter((w) => w >= -1e-9).sort((a, b) => a - b);
  for (const w of freqs) {
    const c = acc.get(w)!;
    if (Math.abs(w) < 1e-9) {
      if (Math.abs(c.re) > 1e-12) parts.push(numLit(c.re));
      continue;
    }
    const cosC = 2 * c.re;
    const sinC = -2 * c.im;
    const arg = Math.abs(w - 1) < 1e-12 ? variable : `${numLit(w)}*${variable}`;
    if (Math.abs(cosC) > 1e-12) parts.push(`${numLit(cosC)}*cos(${arg})`);
    if (Math.abs(sinC) > 1e-12) parts.push(`${numLit(sinC)}*sin(${arg})`);
  }
  if (parts.length === 0) return "0";
  return parts.join(" + ").replace(/\+ -/g, "- ");
}

// ── tan / sec / cot / csc powers ──────────────────────────────────────────────
function tanPowInt(n: number, u: string): string {
  if (n === 0) return u;
  if (n === 1) return `(-log(abs(cos(${u}))))`;
  return `(tan(${u})^${n - 1}/${n - 1} - ${tanPowInt(n - 2, u)})`;
}
function cotPowInt(n: number, u: string): string {
  if (n === 0) return u;
  if (n === 1) return `log(abs(sin(${u})))`;
  return `(-cot(${u})^${n - 1}/${n - 1} - ${cotPowInt(n - 2, u)})`;
}
function secPowInt(n: number, u: string): string {
  if (n === 0) return u;
  if (n === 1) return `log(abs(sec(${u}) + tan(${u})))`;
  if (n === 2) return `tan(${u})`;
  return `(sec(${u})^${n - 2}*tan(${u})/${n - 1} + ${(n - 2) / (n - 1)}*${secPowInt(n - 2, u)})`;
}
function cscPowInt(n: number, u: string): string {
  if (n === 0) return u;
  if (n === 1) return `(-log(abs(csc(${u}) + cot(${u}))))`;
  if (n === 2) return `(-cot(${u}))`;
  return `(-csc(${u})^${n - 2}*cot(${u})/${n - 1} + ${(n - 2) / (n - 1)}*${cscPowInt(n - 2, u)})`;
}

/** ∫ sec^m tan^n  (m even, or n odd) and ∫ csc^m cot^n, via w = tan/sec (or cot/csc). */
function secTanMixed(m: number, n: number, u: string, co: boolean): string | null {
  const [A, B] = co ? ["csc", "cot"] : ["sec", "tan"];
  const sign = co ? -1 : 1;
  if (m >= 2 && m % 2 === 0) {
    // w = B, A^2 = 1 + w^2:  ∫ (1+w^2)^((m-2)/2) w^n dw
    let poly: Poly = [1];
    for (let i = 0; i < (m - 2) / 2; i++) poly = polyMul(poly, [1, 0, 1]);
    poly = polyMul(poly, [...new Array(n).fill(0), 1]);
    const w = `${B}(${u})`;
    const terms = poly.map((c, k) => (Math.abs(c) < 1e-12 ? "" : `${numLit(sign * c / (k + 1))}*${w}^${k + 1}`)).filter(Boolean);
    return `(${terms.join(" + ")})`;
  }
  if (n % 2 === 1 && m >= 1) {
    // w = A, B^2 = A^2 - 1:  ∫ w^(m-1) (w^2-1)^((n-1)/2) dw
    let poly: Poly = [1];
    for (let i = 0; i < (n - 1) / 2; i++) poly = polyMul(poly, [-1, 0, 1]);
    poly = polyMul(poly, [...new Array(m - 1).fill(0), 1]);
    const w = `${A}(${u})`;
    const terms = poly.map((c, k) => (Math.abs(c) < 1e-12 ? "" : `${numLit(sign * c / (k + 1))}*${w}^${k + 1}`)).filter(Boolean);
    return `(${terms.join(" + ")})`;
  }
  return null;
}

// ── root finding for partial fractions ───────────────────────────────────────
function integerScale(p: Poly): Poly | null {
  for (const mult of [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 30, 36, 60, 100, 120, 360, 720, 1000, 10000, 100000, 1000000]) {
    const q = p.map((c) => c * mult);
    if (q.every((c) => Math.abs(c - Math.round(c)) < 1e-9)) return q.map(Math.round);
  }
  return null;
}

function divisors(n: number): number[] {
  const a = Math.abs(Math.round(n));
  if (a === 0) return [0];
  const out: number[] = [];
  for (let i = 1; i * i <= a && i <= 5000; i++) if (a % i === 0) { out.push(i); if (i * i !== a) out.push(a / i); }
  return out;
}

function syntheticDiv(p: Poly, r: number): Poly {
  // divide by (x - r), p ascending
  const n = p.length - 1;
  const out = new Array(n).fill(0);
  let carry = 0;
  for (let i = n; i >= 1; i--) { carry = p[i] + carry * r; out[i - 1] = carry; }
  return out;
}

/** Durand–Kerner complex roots of a monic polynomial (ascending coeffs). */
function durandKerner(monic: Poly): Cx[] {
  const n = monic.length - 1;
  let roots: Cx[] = Array.from({ length: n }, (_, k) => {
    const ang = (2 * Math.PI * k) / n + 0.4;
    const rad = 1 + Math.max(...monic.slice(0, n).map(Math.abs));
    return { re: rad * Math.cos(ang) * 0.7, im: rad * Math.sin(ang) * 0.7 };
  });
  const evalP = (z: Cx): Cx => {
    let acc: Cx = { re: 0, im: 0 };
    for (let i = n; i >= 0; i--) acc = { re: cxMul(acc, z).re + monic[i], im: cxMul(acc, z).im };
    return acc;
  };
  const cxDiv = (a: Cx, b: Cx): Cx => {
    const d = b.re * b.re + b.im * b.im;
    return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
  };
  for (let it = 0; it < 500; it++) {
    let maxStep = 0;
    roots = roots.map((z, i) => {
      let denom: Cx = { re: 1, im: 0 };
      roots.forEach((w, j) => { if (j !== i) denom = cxMul(denom, { re: z.re - w.re, im: z.im - w.im }); });
      if (denom.re === 0 && denom.im === 0) denom = { re: 1e-12, im: 0 };
      const step = cxDiv(evalP(z), denom);
      maxStep = Math.max(maxStep, Math.hypot(step.re, step.im));
      return { re: z.re - step.re, im: z.im - step.im };
    });
    if (maxStep < 1e-14) break;
  }
  return roots;
}

interface RealFactorization {
  lead: number;
  lin: { r: number; m: number; exact: boolean }[];
  quad: { p: number; q: number; m: number }[];
}

function polyDerivative(p: Poly): Poly { return p.length > 1 ? trimPoly(p.slice(1).map((c, i) => c * (i + 1))) : [0]; }
function polyIsZero(p: Poly, scale = 1): boolean { return p.every((c) => Math.abs(c) < 1e-9 * scale); }
function polyMonic(p: Poly): Poly { const q = trimPoly(p); const l = q[q.length - 1]; return q.map((c) => c / l); }
function polyGcd(a: Poly, b: Poly): Poly {
  let x = trimPoly(a), y = trimPoly(b);
  const scale = Math.max(...x.map(Math.abs), ...y.map(Math.abs), 1);
  for (let it = 0; it < 40 && !polyIsZero(y, scale); it++) {
    const r = polyDivide(x, y).r;
    x = y;
    y = polyIsZero(r, scale) ? [0] : polyMonic(r);
    x = polyMonic(x);
  }
  return polyMonic(x);
}
/** Yun's algorithm: Q = Π f_k^k with each f_k square-free. */
function squarefreeDecomp(Q: Poly): { f: Poly; k: number }[] | null {
  const q = polyMonic(Q);
  const dq = polyDerivative(q);
  if (polyIsZero(dq)) return null;
  const c = polyGcd(q, dq);
  let w = polyDivide(q, c).q;
  let y = polyDivide(dq, c).q;
  const out: { f: Poly; k: number }[] = [];
  for (let i = 1; i <= 12 && polyDeg(w) >= 1; i++) {
    const z = polyAdd(y, polyScale(polyDerivative(w), -1));
    const g = polyIsZero(z) ? w : polyGcd(w, z);
    if (polyDeg(g) >= 1) out.push({ f: polyMonic(g), k: i });
    w = polyDivide(w, g).q;
    y = polyDivide(z, g).q;
  }
  const check = out.reduce((acc, f) => { let t = acc; for (let i = 0; i < f.k; i++) t = polyMul(t, f.f); return t; }, [1] as Poly);
  if (check.length !== q.length || check.some((cc, i) => Math.abs(cc - q[i]) > 1e-6 * (1 + Math.abs(q[i])))) return null;
  return out;
}

function factorRealPoly(Q: Poly): RealFactorization | null {
  const dec = polyDeg(Q) >= 2 ? squarefreeDecomp(Q) : null;
  if (dec && dec.some((d) => d.k > 1)) {
    const lead = trimPoly(Q)[trimPoly(Q).length - 1];
    const lin: RealFactorization["lin"] = [];
    const quad: RealFactorization["quad"] = [];
    for (const { f, k } of dec) {
      const sub = factorRealPoly(f.length > 1 ? f : [1, 1]);
      if (!sub) return null;
      sub.lin.forEach((l) => lin.push({ ...l, m: l.m * k }));
      sub.quad.forEach((qd) => quad.push({ ...qd, m: qd.m * k }));
    }
    return { lead, lin, quad };
  }
  const q0 = trimPoly(Q);
  const lead = q0[q0.length - 1];
  let rem = q0.map((c) => c / lead);
  const lin: RealFactorization["lin"] = [];
  const quad: RealFactorization["quad"] = [];

  // exact rational roots
  const scaled = integerScale(rem);
  if (scaled) {
    let cur = rem;
    let guard = 0;
    while (polyDeg(cur) >= 1 && guard++ < 20) {
      const sc = integerScale(cur);
      if (!sc) break;
      const a0 = sc[0];
      const an = sc[sc.length - 1];
      let found: number | null = null;
      if (a0 === 0) found = 0;
      else {
        outer: for (const p of divisors(a0)) for (const q of divisors(an)) for (const s of [1, -1]) {
          const r = (s * p) / q;
          if (Math.abs(polyEvalAt(cur, r)) < 1e-9 * (1 + Math.abs(a0))) { found = r; break outer; }
        }
      }
      if (found === null) break;
      const existing = lin.find((l) => Math.abs(l.r - found!) < 1e-12);
      if (existing) existing.m++; else lin.push({ r: found, m: 1, exact: true });
      cur = syntheticDiv(cur, found);
    }
    rem = cur;
  }

  const d = polyDeg(rem);
  if (d >= 1) {
    if (d === 1) {
      lin.push({ r: -rem[0] / rem[1], m: 1, exact: false });
    } else if (d === 2) {
      const [c, b] = [rem[0], rem[1]];
      const disc = b * b - 4 * c;
      if (disc > 1e-12) {
        const sq = Math.sqrt(disc);
        lin.push({ r: (-b + sq) / 2, m: 1, exact: false }, { r: (-b - sq) / 2, m: 1, exact: false });
      } else if (Math.abs(disc) <= 1e-12) lin.push({ r: -b / 2, m: 2, exact: false });
      else quad.push({ p: b, q: c, m: 1 });
    } else {
      const roots = durandKerner(rem);
      const used = new Array(roots.length).fill(false);
      for (let i = 0; i < roots.length; i++) {
        if (used[i]) continue;
        used[i] = true;
        const z = roots[i];
        if (Math.abs(z.im) < 1e-6) {
          let m = 1;
          for (let j = i + 1; j < roots.length; j++) if (!used[j] && Math.abs(roots[j].im) < 1e-5 && Math.abs(roots[j].re - z.re) < 1e-4 * (1 + Math.abs(z.re))) { used[j] = true; m++; }
          lin.push({ r: z.re, m, exact: false });
        } else if (z.im > 0) {
          let m = 1;
          for (let j = i + 1; j < roots.length; j++) if (!used[j] && roots[j].im > 0 && Math.hypot(roots[j].re - z.re, roots[j].im - z.im) < 1e-4 * (1 + Math.abs(z.re))) { used[j] = true; m++; }
          // remove conjugates
          let removed = 0;
          for (let j = 0; j < roots.length && removed < m; j++) if (!used[j] && roots[j].im < 0 && Math.hypot(roots[j].re - z.re, roots[j].im + z.im) < 1e-4 * (1 + Math.abs(z.re))) { used[j] = true; removed++; }
          quad.push({ p: -2 * z.re, q: z.re * z.re + z.im * z.im, m });
        }
      }
    }
  }
  // check reconstruction
  let prod: Poly = [1];
  for (const l of lin) for (let i = 0; i < l.m; i++) prod = polyMul(prod, [-l.r, 1]);
  for (const qd of quad) for (let i = 0; i < qd.m; i++) prod = polyMul(prod, [qd.q, qd.p, 1]);
  const orig = q0.map((c) => c / lead);
  if (prod.length !== orig.length) return null;
  for (let i = 0; i < orig.length; i++) if (Math.abs(prod[i] - orig[i]) > 1e-5 * (1 + Math.abs(orig[i]))) return null;
  return { lead, lin, quad };
}

function solveLinearSystem(M: number[][], b: number[]): number[] | null {
  const n = b.length;
  const A = M.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    if (Math.abs(A[piv][c]) < 1e-12) return null;
    [A[c], A[piv]] = [A[piv], A[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k];
    }
  }
  return A.map((row, i) => row[n] / row[i]);
}

/** Writes a rational expression (built from polynomials with + - * / and integer powers) as P/Q. */
function rationalFromNode(node: MathNode, variable: string): { P: Poly; Q: Poly } | null {
  const n = unwrapParens(node);
  const pl = polyFromNode(n, variable);
  if (pl) return { P: pl, Q: [1] };
  const op = asOperator(n);
  if (!op) return null;
  if (op.fn === "unaryMinus" && op.args.length === 1) {
    const a = rationalFromNode(op.args[0], variable);
    return a ? { P: polyScale(a.P, -1), Q: a.Q } : null;
  }
  if ((op.fn === "add" || op.fn === "subtract") && op.args.length === 2) {
    const a = rationalFromNode(op.args[0], variable);
    const b = rationalFromNode(op.args[1], variable);
    if (!a || !b) return null;
    const sgn = op.fn === "add" ? 1 : -1;
    return { P: polyAdd(polyMul(a.P, b.Q), polyScale(polyMul(b.P, a.Q), sgn)), Q: polyMul(a.Q, b.Q) };
  }
  if (op.fn === "multiply") {
    let P: Poly = [1], Q: Poly = [1];
    for (const arg of op.args) {
      const r = rationalFromNode(arg, variable);
      if (!r) return null;
      P = polyMul(P, r.P); Q = polyMul(Q, r.Q);
    }
    return { P, Q };
  }
  if (op.fn === "divide" && op.args.length === 2) {
    const a = rationalFromNode(op.args[0], variable);
    const b = rationalFromNode(op.args[1], variable);
    if (!a || !b) return null;
    if (polyDeg(b.P) === 0 && Math.abs(b.P[0]) < 1e-14) return null;
    return { P: polyMul(a.P, b.Q), Q: polyMul(a.Q, b.P) };
  }
  if (op.fn === "pow" && op.args.length === 2 && isConstantExpr(op.args[1], variable)) {
    const e = evaluate(op.args[1].toString());
    const base = rationalFromNode(op.args[0], variable);
    if (!base || typeof e !== "number" || !Number.isInteger(e) || Math.abs(e) > 12) return null;
    const k = Math.abs(e);
    let P: Poly = [1], Q: Poly = [1];
    for (let i = 0; i < k; i++) { P = polyMul(P, base.P); Q = polyMul(Q, base.Q); }
    return e >= 0 ? { P, Q } : { P: Q, Q: P };
  }
  return null;
}

/** Antiderivative of rational function P/Q via partial fractions. */
function tryRationalFunction(node: MathNode, variable: string, steps: string[]): IntegralPiece {
  const fr = rationalFromNode(node, variable);
  if (!fr) return null;
  const P = fr.P;
  const Q = fr.Q;
  if (polyDeg(Q) < 1) return null;
  if (polyFromNode(node, variable)) return null;
  if (polyDeg(P) > 14 || polyDeg(Q) > 8) return null;

  const { q: S, r: R } = polyDivide(P, Q);
  const hasPoly = polyDeg(S) > 0 || Math.abs(S[0]) > 1e-12;
  const fac = factorRealPoly(Q);
  if (!fac) return null;
  const { lead, lin, quad } = fac;
  const Qm = trimPoly(Q).map((c) => c / lead);
  const Rm = polyScale(R, 1 / lead);

  // basis polynomials
  type Term = { kind: "lin"; r: number; k: number; exact: boolean } | { kind: "q0"; p: number; q: number; k: number } | { kind: "q1"; p: number; q: number; k: number };
  const terms: Term[] = [];
  const basis: Poly[] = [];
  const divideExactly = (num: Poly, den: Poly): Poly | null => {
    const { q, r } = polyDivide(num, den);
    return r.every((c) => Math.abs(c) < 1e-6 * (1 + Math.abs(num[num.length - 1]))) ? q : null;
  };
  for (const l of lin) for (let k = 1; k <= l.m; k++) {
    let den: Poly = [1];
    for (let i = 0; i < k; i++) den = polyMul(den, [-l.r, 1]);
    const b = divideExactly(Qm, den);
    if (!b) return null;
    terms.push({ kind: "lin", r: l.r, k, exact: l.exact });
    basis.push(b);
  }
  for (const qd of quad) for (let k = 1; k <= qd.m; k++) {
    let den: Poly = [1];
    for (let i = 0; i < k; i++) den = polyMul(den, [qd.q, qd.p, 1]);
    const b = divideExactly(Qm, den);
    if (!b) return null;
    terms.push({ kind: "q0", p: qd.p, q: qd.q, k });
    basis.push(b);
    terms.push({ kind: "q1", p: qd.p, q: qd.q, k });
    basis.push(polyMul(b, [0, 1]));
  }
  const n = polyDeg(Qm);
  if (basis.length !== n) return null;
  const M: number[][] = Array.from({ length: n }, (_, row) => basis.map((b) => b[row] ?? 0));
  const rhs = Array.from({ length: n }, (_, row) => Rm[row] ?? 0);
  const u = solveLinearSystem(M, rhs);
  if (!u) return null;

  // Build decomposition and antiderivative
  const decomp: string[] = [];
  const anti: string[] = [];
  if (hasPoly) {
    decomp.push(polyToString(S, variable));
    const integ: Poly = [0, ...S.map((c, i) => c / (i + 1))];
    anti.push(polyToString(integ, variable));
  }
  const rStr = (r: number) => (Math.abs(r) < 1e-12 ? variable : `${variable} ${r < 0 ? "+" : "-"} ${numLit(Math.abs(r))}`);
  const used = new Set<number>();
  terms.forEach((t, i) => {
    if (used.has(i)) return;
    const A = u[i];
    if (t.kind === "lin") {
      if (Math.abs(A) < 1e-10) return;
      const base = `(${rStr(t.r)})`;
      decomp.push(`${numLit(A)}/${t.k === 1 ? base : `${base}^${t.k}`}`);
      anti.push(t.k === 1 ? `${numLit(A)}*log(abs${base})` : `${numLit(A / (1 - t.k))}*${base}^(${1 - t.k})`);
    } else if (t.kind === "q0") {
      const j = terms.findIndex((x, idx) => idx !== i && x.kind === "q1" && Math.abs(x.p - t.p) < 1e-12 && Math.abs(x.q - t.q) < 1e-12 && x.k === t.k);
      const B = j >= 0 ? u[j] : 0;
      if (j >= 0) used.add(j);
      const C = A;
      if (Math.abs(B) < 1e-10 && Math.abs(C) < 1e-10) return;
      const quadStr = `(${variable}^2 ${t.p < 0 ? "-" : "+"} ${numLit(Math.abs(t.p))}*${variable} ${t.q < 0 ? "-" : "+"} ${numLit(Math.abs(t.q))})`;
      decomp.push(`(${numLit(B)}*${variable} ${C < 0 ? "-" : "+"} ${numLit(Math.abs(C))})/${t.k === 1 ? quadStr : `${quadStr}^${t.k}`}`);
      const kk = t.q - (t.p * t.p) / 4;
      if (kk <= 0) { anti.push("NaN"); return; }
      const sk = Math.sqrt(kk);
      if (t.k !== 1) {
        // (Bx+C)/Q^k = (B/2)(2x+p)/Q^k + (C - Bp/2)/Q^k ; first part is a direct power rule,
        // second via the reduction I_k = s/(2a²(k-1)(s²+a²)^(k-1)) + (2k-3)/(2a²(k-1)) I_{k-1}
        const k = t.k;
        const sArg = `(${variable} ${t.p / 2 < 0 ? "-" : "+"} ${numLit(Math.abs(t.p / 2))})`;
        const Qs = `(${variable}^2 ${t.p < 0 ? "-" : "+"} ${numLit(Math.abs(t.p))}*${variable} ${t.q < 0 ? "-" : "+"} ${numLit(Math.abs(t.q))})`;
        const Ik = (kk2: number): string => {
          if (kk2 === 1) return `atan(${sArg}/${numLit(sk)})/${numLit(sk)}`;
          const a2 = kk;
          return `(${sArg}/(${numLit(2 * a2 * (kk2 - 1))}*${Qs}^${kk2 - 1}) + ${numLit((2 * kk2 - 3) / (2 * a2 * (kk2 - 1)))}*${Ik(kk2 - 1)})`;
        };
        const parts: string[] = [];
        if (Math.abs(B) > 1e-10) parts.push(`${numLit(-B / (2 * (k - 1)))}/${Qs}^${k - 1}`);
        const Cp = C - (B * t.p) / 2;
        if (Math.abs(Cp) > 1e-10) parts.push(`${numLit(Cp)}*${Ik(k)}`);
        anti.push(parts.join(" + "));
        return;
      }
      const logPart = Math.abs(B) > 1e-10 ? `${numLit(B / 2)}*log${quadStr}` : "";
      const atanCoef = (C - (B * t.p) / 2) / sk;
      const atanPart = Math.abs(atanCoef) > 1e-10 ? `${numLit(atanCoef)}*atan((${variable} ${t.p / 2 < 0 ? "-" : "+"} ${numLit(Math.abs(t.p / 2))})/${numLit(sk)})` : "";
      anti.push([logPart, atanPart].filter(Boolean).join(" + "));
    }
  });
  if (anti.includes("NaN")) return null;
  if (anti.length === 0) return null;
  const antiStr = anti.join(" + ").replace(/\+ -/g, "- ");
  const decompStr = decomp.join(" + ").replace(/\+ -/g, "- ");
  steps.push(`##Partial Fractions\n$$${integralLatex(node.toString(), variable)}\\;:\\quad ${exprToLatex(node.toString())} = ${exprToLatex(decompStr)}$$`);
  steps.push(`##Integrate Each Term\n$$${integralLatex(node.toString(), variable)} = ${exprToLatex(prettifyResult(antiStr, variable))}$$`);
  return { antiderivative: antiStr, rule: "partial fractions" };
}

// ── radicals of a quadratic: 1/√Q and √Q ─────────────────────────────────────
function tryQuadraticRadical(node: MathNode, variable: string, steps: string[]): IntegralPiece {
  const n = unwrapParens(node);
  let inner: MathNode | null = null;
  let power = 0;
  let cNum = 1;
  const fn = asFunctionNode(n);
  const op = asOperator(n);
  if (fn && fn.fn.name === "sqrt" && fn.args.length === 1) { inner = fn.args[0]; power = 1; }
  else if (op?.fn === "pow" && op.args.length === 2 && isConstantExpr(op.args[1], variable)) {
    const e = evaluate(op.args[1].toString());
    if (e === 0.5) { inner = op.args[0]; power = 1; }
    else if (e === -0.5) { inner = op.args[0]; power = -1; }
  } else if (op?.fn === "divide" && op.args.length === 2 && isConstantExpr(op.args[0], variable)) {
    const c = evaluate(op.args[0].toString());
    const d = unwrapParens(op.args[1]);
    const df = asFunctionNode(d);
    const dop = asOperator(d);
    if (typeof c === "number" && df && df.fn.name === "sqrt" && df.args.length === 1) { inner = df.args[0]; power = -1; cNum = c; }
    else if (typeof c === "number" && dop?.fn === "pow" && dop.args.length === 2 && isConstantExpr(dop.args[1], variable) && evaluate(dop.args[1].toString()) === 0.5) { inner = dop.args[0]; power = -1; cNum = c; }
  }
  if (!inner) return null;
  const Q = polyFromNode(inner, variable);
  if (!Q || polyDeg(Q) !== 2) return null;
  const [g, b, a] = Q;
  const h = b / (2 * a);
  const k = g / a - h * h;
  const sh = Math.abs(h) < 1e-12 ? variable : `(${variable} ${h < 0 ? "-" : "+"} ${numLit(Math.abs(h))})`;
  const innerLatex = exprToLatex(inner.toString());
  const sa = Math.sqrt(Math.abs(a));
  let anti: string;
  let label: string;
  if (a < 0) {
    const R2 = k < 0 ? -k : NaN; // Q = |a|(R² − (x+h)²), R² = -k ... derived below
    // Q = a((x+h)^2 + k) = |a|(-(x+h)^2 - k) → R² = -k
    if (!(R2 > 0)) return null;
    const R = Math.sqrt(R2);
    if (power === -1) { anti = `(1/${numLit(sa)})*asin(${sh}/${numLit(R)})`; label = "1/\\sqrt{R^2-u^2} = \\arcsin(u/R)"; }
    else anti = `${numLit(sa)}*(${sh}/2*sqrt(${numLit(R2)} - ${sh}^2) + ${numLit(R2 / 2)}*asin(${sh}/${numLit(R)}))`;
    label = "Complete the square, then \\arcsin form";
  } else if (k > 0) {
    if (power === -1) anti = `(1/${numLit(sa)})*log(${sh} + sqrt(${sh}^2 + ${numLit(k)}))`;
    else anti = `${numLit(sa)}*(${sh}/2*sqrt(${sh}^2 + ${numLit(k)}) + ${numLit(k / 2)}*log(${sh} + sqrt(${sh}^2 + ${numLit(k)})))`;
    label = "Complete the square, then \\sinh^{-1} form";
  } else if (k < 0) {
    const m2 = -k;
    if (power === -1) anti = `(1/${numLit(sa)})*log(abs(${sh} + sqrt(${sh}^2 - ${numLit(m2)})))`;
    else anti = `${numLit(sa)}*(${sh}/2*sqrt(${sh}^2 - ${numLit(m2)}) - ${numLit(m2 / 2)}*log(abs(${sh} + sqrt(${sh}^2 - ${numLit(m2)}))))`;
    label = "Complete the square, then \\cosh^{-1} form";
  } else return null;
  steps.push(`##Quadratic Under a Root\n$$${innerLatex} = ${exprToLatex(`${numLit(a)}*(${sh}^2 + ${numLit(k)})`)}$$\n$${label}$`);
  if (cNum !== 1) anti = `${numLit(cNum)}*(${anti})`;
  steps.push(`##Result\n$$${integralLatex(n.toString(), variable)} = ${exprToLatex(prettifyResult(anti, variable))}$$`);
  return { antiderivative: anti, rule: "radical of a quadratic" };
}

// ── P(x)·(ax+b)^p  (p rational, positive or negative), incl. x^p alone ───────
interface PowFactor { base: MathNode; exp: number }

/** Splits a product/quotient into (coefficient, base^exponent factors); roots become fractional exponents. */
function powerFactors(node: MathNode, variable: string): { coeff: number; pf: PowFactor[] } | null {
  const out: PowFactor[] = [];
  let coeff = 1;
  let ok = true;
  const walk = (m: MathNode, sign: number) => {
    if (!ok) return;
    const n = unwrapParens(m);
    const op = asOperator(n);
    const fn = asFunctionNode(n);
    if (isConstantExpr(n, variable)) {
      try {
        const v = evaluate(n.toString());
        if (typeof v === "number" && Number.isFinite(v) && v !== 0) { coeff *= sign === 1 ? v : 1 / v; return; }
      } catch { /* fall through */ }
      ok = false; return;
    }
    if (op?.fn === "unaryMinus" && op.args.length === 1) { coeff *= -1; walk(op.args[0], sign); return; }
    if (op?.fn === "multiply") { op.args.forEach((a) => walk(a, sign)); return; }
    if (op?.fn === "divide" && op.args.length === 2) { walk(op.args[0], sign); walk(op.args[1], -sign); return; }
    if (op?.fn === "pow" && op.args.length === 2 && isConstantExpr(op.args[1], variable)) {
      const e = evaluate(op.args[1].toString());
      if (typeof e !== "number") { ok = false; return; }
      out.push({ base: unwrapParens(op.args[0]), exp: sign * e });
      return;
    }
    if (fn && fn.fn.name === "sqrt" && fn.args.length === 1) { out.push({ base: unwrapParens(fn.args[0]), exp: sign * 0.5 }); return; }
    if (fn && fn.fn.name === "cbrt" && fn.args.length === 1) { out.push({ base: unwrapParens(fn.args[0]), exp: sign / 3 }); return; }
    out.push({ base: n, exp: sign });
  };
  walk(node, 1);
  if (!ok) return null;
  // merge identical bases
  const merged: PowFactor[] = [];
  for (const f of out) {
    const key = f.base.toString();
    const ex = merged.find((m) => m.base.toString() === key);
    if (ex) ex.exp += f.exp; else merged.push({ ...f });
  }
  return { coeff, pf: merged.filter((f) => Math.abs(f.exp) > 1e-12) };
}

function tryLinearPowerTimesPoly(node: MathNode, variable: string, steps: string[]): IntegralPiece {
  const pfs = powerFactors(node, variable);
  if (!pfs) return null;
  let polyPart: Poly = [pfs.coeff];
  let lin: { a: number; b: number } | null = null;
  let p = 0;
  for (const f of pfs.pf) {
    const bp = polyFromNode(f.base, variable);
    if (bp && Number.isInteger(f.exp) && f.exp >= 0) {
      let acc: Poly = [1];
      for (let i = 0; i < f.exp; i++) acc = polyMul(acc, bp);
      polyPart = polyMul(polyPart, acc);
      continue;
    }
    const l = tryLinear(f.base, variable);
    if (!l || Math.abs(l.a) < 1e-12) return null;
    if (lin && (Math.abs(lin.a - l.a) > 1e-9 || Math.abs(lin.b - l.b) > 1e-9)) return null;
    lin = l;
    p += f.exp;
  }
  if (!lin) return null;
  if (polyDeg(polyPart) > 12) return null;
  // x = (u - b)/a  →  polynomial in u
  const inv: Poly = [-lin.b / lin.a, 1 / lin.a];
  let acc: Poly = [0];
  let power: Poly = [1];
  for (let k = 0; k < polyPart.length; k++) {
    acc = polyAdd(acc, polyScale(power, polyPart[k]));
    power = polyMul(power, inv);
  }
  const u = `(${lin.a === 1 ? variable : `${numLit(lin.a)}*${variable}`} ${lin.b < 0 ? "-" : "+"} ${numLit(Math.abs(lin.b))})`;
  const parts: string[] = [];
  for (let k = 0; k < acc.length; k++) {
    const c = acc[k];
    if (Math.abs(c) < 1e-12) continue;
    const ex = k + p + 1;
    if (Math.abs(ex) < 1e-12) parts.push(`${numLit(c / lin.a)}*log(abs${u})`);
    else parts.push(`${numLit(c / (lin.a * ex))}*${u}^${numLit(ex)}`);
  }
  if (parts.length === 0) return null;
  const anti = parts.join(" + ").replace(/\+ -/g, "- ");
  steps.push(`##Substitute $u = ${exprToLatex(u)}$\n$$${integralLatex(node.toString(), variable)} = \\frac{1}{${fmtNum(lin.a)}}\\int \\left(\\text{polynomial in } u\\right) u^{${fmtNum(p)}}\\,du$$`);
  steps.push(`##Integrate Term by Term\n$$= ${exprToLatex(prettifyResult(anti, variable))}$$`);
  return { antiderivative: anti, rule: "linear substitution" };
}

// ── P(x) · {e^{ax+b}, sin, cos, sinh, cosh}(ax+b): tabular integration by parts ─
function tryPolyTimesTranscendental(node: MathNode, variable: string, steps: string[]): IntegralPiece {
  const { coeff, factors } = collectFactors(node, variable);
  let poly: Poly = [coeff];
  let g: { kind: "exp" | "sin" | "cos" | "sinh" | "cosh"; a: number; b: number } | null = null;
  for (const f of factors) {
    const pl = polyFromNode(f, variable);
    if (pl) { poly = polyMul(poly, pl); continue; }
    if (g) return null;
    const fn = asFunctionNode(f);
    const op = asOperator(f);
    if (fn && ["sin", "cos", "sinh", "cosh", "exp"].includes(fn.fn.name) && fn.args.length === 1) {
      const l = tryLinear(fn.args[0], variable);
      if (!l || Math.abs(l.a) < 1e-12) return null;
      g = { kind: fn.fn.name as "exp", a: l.a, b: l.b };
    } else if (op?.fn === "pow" && op.args.length === 2 && asSymbol(unwrapParens(op.args[0]))?.name === "e") {
      const l = tryLinear(op.args[1], variable);
      if (!l || Math.abs(l.a) < 1e-12) return null;
      g = { kind: "exp", a: l.a, b: l.b };
    } else return null;
  }
  if (!g || polyDeg(poly) < 1 || polyDeg(poly) > 10) return null;
  const arg = `${numLit(g.a)}*${variable} ${g.b < 0 ? "-" : "+"} ${numLit(Math.abs(g.b))}`;
  // j-th antiderivative of g
  const G = (j: number): string => {
    const div = `${numLit(Math.pow(g!.a, j))}`;
    switch (g!.kind) {
      case "exp": return `exp(${arg})/${div}`;
      case "sinh": return `${j % 2 === 1 ? "cosh" : "sinh"}(${arg})/${div}`;
      case "cosh": return `${j % 2 === 1 ? "sinh" : "cosh"}(${arg})/${div}`;
      case "sin": { const cyc = ["sin", "-cos", "-sin", "cos"]; const t = cyc[(j) % 4]; return `${t.startsWith("-") ? "-" : ""}${t.replace("-", "")}(${arg})/${div}`; }
      case "cos": { const cyc = ["cos", "sin", "-cos", "-sin"]; const t = cyc[(j) % 4]; return `${t.startsWith("-") ? "-" : ""}${t.replace("-", "")}(${arg})/${div}`; }
    }
  };
  // derivatives of poly
  const terms: string[] = [];
  let cur = poly;
  for (let k = 0; k <= polyDeg(poly); k++) {
    if (!(cur.length === 1 && Math.abs(cur[0]) < 1e-14)) {
      terms.push(`${k % 2 === 0 ? "+" : "-"} (${polyToString(cur, variable)})*(${G(k + 1)})`);
    }
    cur = cur.length > 1 ? trimPoly(cur.slice(1).map((c, i) => c * (i + 1))) : [0];
  }
  const anti = terms.join(" ").replace(/^\+ /, "");
  steps.push(`##Integration by Parts (tabular)\n$$\\int P(x)\\,g(x)\\,dx = P G_1 - P' G_2 + P'' G_3 - \\cdots$$`);
  steps.push(`##Result\n$$${integralLatex(node.toString(), variable)} = ${exprToLatex(prettifyResult(anti, variable))}$$`);
  return { antiderivative: anti, rule: "tabular integration by parts" };
}

// ── P(x)·|ax+b| ──────────────────────────────────────────────────────────────
function tryPolyTimesAbs(node: MathNode, variable: string, steps: string[]): IntegralPiece {
  const { coeff, factors } = collectFactors(node, variable);
  let poly: Poly = [coeff];
  let lin: { a: number; b: number } | null = null;
  for (const f of factors) {
    const pl = polyFromNode(f, variable);
    if (pl) { poly = polyMul(poly, pl); continue; }
    const fn = asFunctionNode(f);
    if (lin || !fn || fn.fn.name !== "abs" || fn.args.length !== 1) return null;
    const l = tryLinear(fn.args[0], variable);
    if (!l || Math.abs(l.a) < 1e-12) return null;
    lin = l;
  }
  if (!lin || polyDeg(poly) < 1) return null;
  const uPoly: Poly = [lin.b, lin.a];
  const prod = polyMul(poly, uPoly);
  const H: Poly = [0, ...prod.map((c, i) => c / (i + 1))];
  const r = -lin.b / lin.a;
  const u = `(${numLit(lin.a)}*${variable} ${lin.b < 0 ? "-" : "+"} ${numLit(Math.abs(lin.b))})`;
  const anti = `sign${u}*((${polyToString(H, variable)}) - (${numLit(polyEvalAt(H, r))}))`;
  steps.push(`##Split at the Sign Change\n$$|u| = u\,\\operatorname{sgn}(u) \\;\\Rightarrow\\; \\int P(x)\\,|u|\\,dx = \\operatorname{sgn}(u)\\int P(x)\\,u\\,dx$$`);
  steps.push(`##Result\n$$${integralLatex(node.toString(), variable)} = ${exprToLatex(prettifyResult(anti, variable))}$$`);
  return { antiderivative: anti, rule: "polynomial times absolute value" };
}

// ── general u-substitution:  f(x) = h(g(x))·g'(x) ────────────────────────────
function pickSubVariable(node: MathNode): string {
  const text = node.toString();
  for (const c of ["u", "w", "v", "t", "s", "z"]) if (!new RegExp(`(?<![A-Za-z0-9_])${c}(?![A-Za-z0-9_])`).test(text)) return c;
  return "u_";
}

function collectSubCandidates(node: MathNode, variable: string): MathNode[] {
  const seen = new Set<string>();
  const out: MathNode[] = [];
  const add = (m: MathNode) => {
    const u = unwrapParens(m);
    if (isConstantExpr(u, variable)) return;
    if (asSymbol(u)?.name === variable) return;
    const k = u.toString();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(u);
  };
  node.traverse((n: MathNode) => {
    const fn = asFunctionNode(n);
    const op = asOperator(n);
    if (fn) fn.args.forEach(add);
    if (op?.fn === "pow" && op.args.length === 2) { add(op.args[0]); if (!isConstantExpr(op.args[1], variable)) add(op.args[1]); }
    if (op?.fn === "divide" && op.args.length === 2) add(op.args[1]);
  });
  // simplest candidates first
  return out.sort((a, b) => a.toString().length - b.toString().length).slice(0, 8);
}

/** Replaces every occurrence of the subtree `target` inside `node` by the symbol `sym`. */
function replaceSubtree(node: MathNode, target: MathNode, sym: string): MathNode {
  const key = target.toString();
  return node.transform((n: MathNode) => (unwrapParens(n).toString() === key ? parse(sym) : n));
}

function tryUSubstitution(node: MathNode, variable: string, steps: string[], depth: number): IntegralPiece {
  if (depth > 3) return null;
  const cands = collectSubCandidates(node, variable);
  const uName = pickSubVariable(node);
  for (const g of cands) {
    let gp: MathNode;
    try { gp = simplify(derivative(g, variable)); } catch { continue; }
    if (isConstantExpr(gp, variable) && Math.abs(Number(evaluate(gp.toString()))) < 1e-14) continue;
    let ratio: MathNode;
    try { ratio = simplify(replaceSubtree(parse(`(${node.toString()})/(${gp.toString()})`), g, uName)); } catch { continue; }
    if (!isConstantExpr(ratio, variable)) continue;
    const sub: string[] = [];
    let H: IntegralPiece = null;
    try { H = integrateNode(ratio, uName, sub, depth + 1); } catch { H = null; }
    if (!H) continue;
    const anti = substituteExpr(H.antiderivative, uName, g.toString());
    steps.push(`##u-Substitution\n$u = ${exprToLatex(g.toString())},\\quad du = ${exprToLatex(gp.toString())}\\,d${variable}$\n$$${integralLatex(node.toString(), variable)} = \\int ${exprToLatex(ratio.toString())}\\,d${uName}$$`);
    steps.push(...sub);
    steps.push(`##Substitute Back\n$$${integralLatex(node.toString(), variable)} = ${exprToLatex(prettifyResult(anti, variable))}$$`);
    return { antiderivative: anti, rule: "u-substitution" };
  }
  return null;
}

// ── table rules (inverse trig, hyperbolic, cot/csc, sec², …) with linear u ──
function tryTableRules(node: MathNode, variable: string, steps: string[]): IntegralPiece {
  const n = unwrapParens(node);
  const fn = asFunctionNode(n);
  const op = asOperator(n);
  const done = (anti: string, name: string, latexForm: string): IntegralPiece => {
    steps.push(`##${name}\n$$${integralLatex(n.toString(), variable)} = ${latexForm}$$`);
    return { antiderivative: anti, rule: name };
  };

  if (fn && fn.args.length === 1) {
    const lin = tryLinear(fn.args[0], variable);
    if (lin && Math.abs(lin.a) > 1e-12) {
      const u = wrapLinearArg(lin.a, lin.b, variable);
      const a = fmtNum(lin.a);
      const uL = exprToLatex(u);
      const nm = fn.fn.name;
      const table: Record<string, [string, string, string]> = {
        cot: [`log(abs(sin(${u})))/(${a})`, "Cotangent Rule", `\\frac{\\ln\\left|\\sin(${uL})\\right|}{${a}}`],
        csc: [`-log(abs(csc(${u}) + cot(${u})))/(${a})`, "Cosecant Rule", `\\frac{-\\ln\\left|\\csc(${uL})+\\cot(${uL})\\right|}{${a}}`],
        sinh: [`cosh(${u})/(${a})`, "Hyperbolic Rule", `\\frac{\\cosh(${uL})}{${a}}`],
        cosh: [`sinh(${u})/(${a})`, "Hyperbolic Rule", `\\frac{\\sinh(${uL})}{${a}}`],
        tanh: [`log(cosh(${u}))/(${a})`, "Hyperbolic Rule", `\\frac{\\ln\\cosh(${uL})}{${a}}`],
        coth: [`log(abs(sinh(${u})))/(${a})`, "Hyperbolic Rule", `\\frac{\\ln\\left|\\sinh(${uL})\\right|}{${a}}`],
        sech: [`2*atan(tanh((${u})/2))/(${a})`, "Hyperbolic Rule", `\\frac{2\\arctan\\left(\\tanh(${uL}/2)\\right)}{${a}}`],
        asin: [`((${u})*asin(${u}) + sqrt(1 - (${u})^2))/(${a})`, "Integration by Parts (arcsin)", `\\frac{u\\arcsin u + \\sqrt{1-u^2}}{${a}}`],
        acos: [`((${u})*acos(${u}) - sqrt(1 - (${u})^2))/(${a})`, "Integration by Parts (arccos)", `\\frac{u\\arccos u - \\sqrt{1-u^2}}{${a}}`],
        atan: [`((${u})*atan(${u}) - log(1 + (${u})^2)/2)/(${a})`, "Integration by Parts (arctan)", `\\frac{u\\arctan u - \\tfrac12\\ln(1+u^2)}{${a}}`],
        asinh: [`((${u})*asinh(${u}) - sqrt((${u})^2 + 1))/(${a})`, "Integration by Parts (arsinh)", `\\frac{u\\,\\mathrm{arsinh}\\,u - \\sqrt{u^2+1}}{${a}}`],
        abs: [`(${u})*abs(${u})/(2*${a})`, "Absolute Value Rule", `\\frac{u\\,|u|}{2\\cdot ${a}}`],
        sign: [`abs(${u})/(${a})`, "Sign Rule", `\\frac{|u|}{${a}}`],
      };
      if (table[nm]) {
        const [anti, name, tex] = table[nm];
        if (name.startsWith("Integration")) {
          steps.push(`##${name}\n$u = ${uL}$\n$$${integralLatex(n.toString(), variable)} = ${tex}$$`);
          return { antiderivative: anti, rule: name };
        }
        return done(anti, name, tex);
      }
    }
  }

  // fn(u)^2 for sec, csc, sech, csch, cosh ... (squares with a linear argument)
  if (op?.fn === "pow" && op.args.length === 2 && isConstantExpr(op.args[1], variable)) {
    const e = evaluate(op.args[1].toString());
    const inner = asFunctionNode(unwrapParens(op.args[0]));
    if (typeof e === "number" && Number.isInteger(e) && e >= 1 && inner && inner.args.length === 1) {
      const lin = tryLinear(inner.args[0], variable);
      if (lin && Math.abs(lin.a) > 1e-12) {
        const u = wrapLinearArg(lin.a, lin.b, variable);
        const a = `(${fmtNum(lin.a)})`;
        const nm = inner.fn.name;
        const uL = exprToLatex(u);
        if (e >= 2 && ["tan", "sec", "cot", "csc"].includes(nm)) {
          const body = nm === "tan" ? tanPowInt(e, u) : nm === "sec" ? secPowInt(e, u) : nm === "cot" ? cotPowInt(e, u) : cscPowInt(e, u);
          const anti = `${body}/${a}`;
          steps.push(`##Reduction Formula for $\\${nm}^{${e}}$\n$$${integralLatex(n.toString(), variable)} = ${exprToLatex(prettifyResult(anti, variable))}$$`);
          return { antiderivative: anti, rule: "trig power reduction" };
        }
        if (e === 2 && nm === "sech") return done(`tanh(${u})/${a}`, "Hyperbolic Rule", `\\frac{\\tanh(${uL})}{${a}}`);
        if (e === 2 && nm === "csch") return done(`-coth(${u})/${a}`, "Hyperbolic Rule", `\\frac{-\\coth(${uL})}{${a}}`);
        if (e === 2 && nm === "tanh") return done(`((${u}) - tanh(${u}))/${a}`, "Hyperbolic Rule", `\\frac{u-\\tanh u}{${a}}`);
        if (e === 2 && nm === "sinh") return done(`(sinh(2*(${u}))/4 - (${u})/2)/${a}`, "Hyperbolic Power Reduction", `\\frac{\\sinh(2u)/4 - u/2}{${a}}`);
        if (e === 2 && nm === "cosh") return done(`(sinh(2*(${u}))/4 + (${u})/2)/${a}`, "Hyperbolic Power Reduction", `\\frac{\\sinh(2u)/4 + u/2}{${a}}`);
      }
    }
  }

  // sec·tan and csc·cot, general sec^m tan^n / csc^m cot^n
  const { coeff, factors } = collectFactors(n, variable);
  if (factors.length >= 1) {
    const exps: Record<string, number> = {};
    let argStr: string | null = null;
    let linGlobal: { a: number; b: number } | null = null;
    let ok = true;
    for (const f of factors) {
      let base = f;
      let e = 1;
      const fop = asOperator(f);
      if (fop?.fn === "pow" && fop.args.length === 2 && isConstantExpr(fop.args[1], variable)) {
        const ev = evaluate(fop.args[1].toString());
        if (typeof ev !== "number" || !Number.isInteger(ev) || ev < 1) { ok = false; break; }
        e = ev;
        base = unwrapParens(fop.args[0]);
      }
      const ff = asFunctionNode(base);
      if (!ff || ff.args.length !== 1 || !["sec", "tan", "csc", "cot"].includes(ff.fn.name)) { ok = false; break; }
      const l = tryLinear(ff.args[0], variable);
      if (!l || Math.abs(l.a) < 1e-12) { ok = false; break; }
      if (linGlobal && (Math.abs(linGlobal.a - l.a) > 1e-9 || Math.abs(linGlobal.b - l.b) > 1e-9)) { ok = false; break; }
      linGlobal = l;
      argStr = wrapLinearArg(l.a, l.b, variable);
      exps[ff.fn.name] = (exps[ff.fn.name] ?? 0) + e;
    }
    if (ok && linGlobal && argStr) {
      const keys = Object.keys(exps);
      const aS = `(${fmtNum(linGlobal.a)})`;
      const hasSec = "sec" in exps || "tan" in exps;
      const hasCsc = "csc" in exps || "cot" in exps;
      if (hasSec && !hasCsc && keys.length === 2 || (hasSec && !hasCsc && keys.length === 1 && "sec" in exps)) {
        const m = exps.sec ?? 0;
        const t = exps.tan ?? 0;
        let anti: string | null = null;
        if (t === 0 && m >= 3) anti = `${secPowInt(m, argStr)}`;
        else if (m >= 1 && t >= 1) anti = secTanMixed(m, t, argStr, false);
        if (!anti && m >= 1 && t >= 2 && t % 2 === 0) {
          // sec^m (sec^2 - 1)^(t/2) = Σ c_j sec^(m+2j)
          let pp: Poly = [1];
          for (let i = 0; i < t / 2; i++) pp = polyMul(pp, [-1, 0, 1]);
          anti = `(${pp.map((c, j) => (Math.abs(c) < 1e-12 ? "" : `${numLit(c)}*${secPowInt(m + j, argStr)}`)).filter(Boolean).join(" + ")})`;
        }
        if (anti) {
          const full = `${numLit(coeff)}*${anti}/${aS}`;
          steps.push(`##Trig Substitution\n$$${integralLatex(n.toString(), variable)} = ${exprToLatex(prettifyResult(full, variable))}$$`);
          return { antiderivative: full, rule: "sec/tan powers" };
        }
      }
      if (hasCsc && !hasSec && (keys.length === 2 || ("csc" in exps && keys.length === 1))) {
        const m = exps.csc ?? 0;
        const t = exps.cot ?? 0;
        let anti: string | null = null;
        if (t === 0 && m >= 3) anti = `${cscPowInt(m, argStr)}`;
        else if (m >= 1 && t >= 1) anti = secTanMixed(m, t, argStr, true);
        if (!anti && m >= 1 && t >= 2 && t % 2 === 0) {
          let pp: Poly = [1];
          for (let i = 0; i < t / 2; i++) pp = polyMul(pp, [-1, 0, 1]);
          anti = `(${pp.map((c, j) => (Math.abs(c) < 1e-12 ? "" : `${numLit(c)}*${cscPowInt(m + j, argStr)}`)).filter(Boolean).join(" + ")})`;
        }
        if (anti) {
          const full = `${numLit(coeff)}*${anti}/${aS}`;
          steps.push(`##Trig Substitution\n$$${integralLatex(n.toString(), variable)} = ${exprToLatex(prettifyResult(full, variable))}$$`);
          return { antiderivative: full, rule: "csc/cot powers" };
        }
      }
    }
  }
  return null;
}

// ── trigonometric rewrites: 1/cos → sec, sin/cos → tan, cos^-n → sec^n … ────
function rewriteTrigReciprocals(node: MathNode): MathNode {
  const pairOf = (m: MathNode): { name: string; arg: MathNode } | null => {
    const f = asFunctionNode(unwrapParens(m));
    return f && f.args.length === 1 ? { name: f.fn.name, arg: f.args[0] } : null;
  };
  const recip: Record<string, string> = { cos: "sec", sin: "csc", tan: "cot", sec: "cos", csc: "sin", cot: "tan" };
  return node.transform((n: MathNode) => {
    const op = asOperator(n);
    if (op?.fn === "divide" && op.args.length === 2) {
      const [num, den] = op.args;
      const dn = pairOf(den);
      const nn = pairOf(num);
      if (nn && dn && nn.arg.toString() === dn.arg.toString()) {
        if (nn.name === "sin" && dn.name === "cos") return parse(`tan(${nn.arg.toString()})`);
        if (nn.name === "cos" && dn.name === "sin") return parse(`cot(${nn.arg.toString()})`);
      }
      if (dn && recip[dn.name]) return parse(`(${num.toString()})*${recip[dn.name]}(${dn.arg.toString()})`);
      const dop = asOperator(unwrapParens(den));
      if (dop?.fn === "pow" && dop.args.length === 2) {
        const b = pairOf(dop.args[0]);
        if (b && recip[b.name]) return parse(`(${num.toString()})*${recip[b.name]}(${b.arg.toString()})^(${dop.args[1].toString()})`);
      }
    }
    if (op?.fn === "pow" && op.args.length === 2) {
      const b = pairOf(op.args[0]);
      let e: unknown;
      try { e = evaluate(op.args[1].toString()); } catch { e = null; }
      if (b && recip[b.name] && typeof e === "number" && e < 0 && Number.isInteger(e)) {
        return parse(`${recip[b.name]}(${b.arg.toString()})^${-e}`);
      }
    }
    return n;
  });
}

// ── e^{ax+c}·sin/cos(bx+d)  (cyclic integration by parts, closed form) ──────
function tryExpTrig(node: MathNode, variable: string, steps: string[]): IntegralPiece {
  const { coeff, factors } = collectFactors(node, variable);
  if (factors.length !== 2) return null;
  let expLin: { a: number; b: number } | null = null;
  let trig: { name: "sin" | "cos"; a: number; b: number } | null = null;
  for (const f of factors) {
    const op = asOperator(f);
    const fn = asFunctionNode(f);
    if (fn && fn.fn.name === "exp" && fn.args.length === 1) {
      const l = tryLinear(fn.args[0], variable);
      if (!l) return null;
      expLin = l;
    } else if (op?.fn === "pow" && op.args.length === 2 && asSymbol(unwrapParens(op.args[0]))?.name === "e") {
      const l = tryLinear(op.args[1], variable);
      if (!l) return null;
      expLin = l;
    } else if (fn && (fn.fn.name === "sin" || fn.fn.name === "cos") && fn.args.length === 1) {
      const l = tryLinear(fn.args[0], variable);
      if (!l) return null;
      trig = { name: fn.fn.name, a: l.a, b: l.b };
    } else return null;
  }
  if (!expLin || !trig || Math.abs(trig.a) < 1e-12 || Math.abs(expLin.a) < 1e-12 && false) return null;
  const A = expLin.a;
  const B = trig.a;
  const den = A * A + B * B;
  const E = `exp(${numLit(A)}*${variable} ${expLin.b < 0 ? "-" : "+"} ${numLit(Math.abs(expLin.b))})`;
  const T = `${numLit(B)}*${variable} ${trig.b < 0 ? "-" : "+"} ${numLit(Math.abs(trig.b))}`;
  const anti = trig.name === "sin"
    ? `${numLit(coeff / den)}*${E}*(${numLit(A)}*sin(${T}) - ${numLit(B)}*cos(${T}))`
    : `${numLit(coeff / den)}*${E}*(${numLit(A)}*cos(${T}) + ${numLit(B)}*sin(${T}))`;
  steps.push(`##Integration by Parts (twice, cyclic)\n$$I = \\int ${exprToLatex(node.toString())}\\,d${variable}$$\n$$I = ${exprToLatex(prettifyResult(anti, variable))}$$`);
  return { antiderivative: anti, rule: "cyclic integration by parts" };
}

// ── ln(x)^n and x^m ln(x)^n ──────────────────────────────────────────────────
function lnPowAnti(n: number, u: string): string {
  if (n === 0) return u;
  return `((${u})*log(${u})^${n} - ${n}*${lnPowAnti(n - 1, u)})`;
}

function tryLogPowers(node: MathNode, variable: string, steps: string[]): IntegralPiece {
  const { coeff, factors } = collectFactors(node, variable);
  if (factors.length === 0 || factors.length > 2) return null;
  let m = 0;
  let nPow = 0;
  let logArg: { a: number; b: number } | null = null;
  for (const f of factors) {
    const pl = polyFromNode(f, variable);
    if (pl && polyDeg(pl) >= 0 && pl.length === 1) { m += 0; continue; }
    const sym = asSymbol(f);
    const op = asOperator(f);
    if (sym && sym.name === variable) { m += 1; continue; }
    if (op?.fn === "pow" && op.args.length === 2 && asSymbol(unwrapParens(op.args[0]))?.name === variable && isConstantExpr(op.args[1], variable)) {
      const e = evaluate(op.args[1].toString());
      if (typeof e !== "number") return null;
      m += e;
      continue;
    }
    const fn = asFunctionNode(f);
    if (fn && fn.fn.name === "log" && fn.args.length === 1) {
      const l = tryLinear(fn.args[0], variable);
      if (!l) return null;
      logArg = l; nPow = 1; continue;
    }
    if (op?.fn === "pow" && op.args.length === 2) {
      const lf = asFunctionNode(unwrapParens(op.args[0]));
      if (lf && lf.fn.name === "log" && lf.args.length === 1 && isConstantExpr(op.args[1], variable)) {
        const e = evaluate(op.args[1].toString());
        const l = tryLinear(lf.args[0], variable);
        if (!l || typeof e !== "number" || !Number.isInteger(e) || e < 1) return null;
        logArg = l; nPow = e; continue;
      }
    }
    return null;
  }
  if (!logArg || nPow < 1) return null;
  const u = `(${logArg.a === 1 ? variable : `${numLit(logArg.a)}*${variable}`} ${logArg.b < 0 ? "-" : "+"} ${numLit(Math.abs(logArg.b))})`;
  // pure ln(u)^n
  if (Math.abs(m) < 1e-12) {
    const anti = `${numLit(coeff / logArg.a)}*${lnPowAnti(nPow, u)}`;
    steps.push(`##Reduction for $\\ln^{${nPow}}$\n$$${integralLatex(node.toString(), variable)} = ${exprToLatex(prettifyResult(anti, variable))}$$`);
    return { antiderivative: anti, rule: "ln power reduction" };
  }
  // x^m ln(x)^n (argument must be exactly x)
  if (!(Math.abs(logArg.a - 1) < 1e-12 && Math.abs(logArg.b) < 1e-12)) return null;
  const rec = (k: number): string => {
    if (Math.abs(m + 1) < 1e-12) return `log(abs(${variable}))^${k + 1}/${k + 1}`;
    if (k === 0) return `${variable}^${numLit(m + 1)}/${numLit(m + 1)}`;
    return `(${variable}^${numLit(m + 1)}*log(${variable})^${k}/${numLit(m + 1)} - ${k}/${numLit(m + 1)}*${rec(k - 1)})`;
  };
  const anti = `${numLit(coeff)}*${rec(nPow)}`;
  steps.push(`##Integration by Parts (repeated)\n$$${integralLatex(node.toString(), variable)} = ${exprToLatex(prettifyResult(anti, variable))}$$`);
  return { antiderivative: anti, rule: "x^m ln^n" };
}

// ── P(x)·g(x) where g' is algebraic (arctan, arcsin, arccos, …) ─────────────
function tryPartsAlgebraicDerivative(node: MathNode, variable: string, steps: string[], depth: number): IntegralPiece {
  if (depth > 3) return null;
  const { coeff, factors } = collectFactors(node, variable);
  if (factors.length < 1 || factors.length > 2) return null;
  let g: MathNode | null = null;
  let poly: Poly = [coeff];
  for (const f of factors) {
    const fn = asFunctionNode(f);
    const pl = polyFromNode(f, variable);
    if (pl) { poly = polyMul(poly, pl); continue; }
    if (fn && ["atan", "asin", "acos", "asinh", "acosh", "atanh", "acot", "log"].includes(fn.fn.name) && fn.args.length === 1 && !g) { g = f; continue; }
    return null;
  }
  if (!g || polyDeg(poly) > 8) return null;
  const V: Poly = [0, ...poly.map((c, i) => c / (i + 1))];
  const vStr = polyToString(V, variable);
  let dg: MathNode;
  try { dg = simplify(derivative(g, variable)); } catch { return null; }
  const remainingStr = `(${vStr})*(${dg.toString()})`;
  let remNode: MathNode;
  try { remNode = parse(remainingStr); } catch { return null; }
  const sub: string[] = [];
  const rem = integrateNode(simplify(remNode), variable, sub, depth + 1);
  if (!rem) return null;
  const anti = `(${vStr})*(${g.toString()}) - (${rem.antiderivative})`;
  steps.push(`##Integration by Parts\n$$u = ${exprToLatex(g.toString())}, \\quad dv = ${exprToLatex(polyToString(poly, variable))}\\,d${variable}$$\n$$v = ${exprToLatex(vStr)}, \\quad du = ${exprToLatex(dg.toString())}\\,d${variable}$$`);
  steps.push(`##Remaining Integral\n$$\\int v\\,du = ${integralLatex(simplify(remNode).toString(), variable)}$$`);
  steps.push(...sub);
  steps.push(`##Combine\n$$uv - \\int v\\,du = ${exprToLatex(prettifyResult(anti, variable))}$$`);
  return { antiderivative: anti, rule: "integration by parts (algebraic derivative)" };
}

// ── P(x)/√Q(x) with Q quadratic (Ostrogradsky: R(x)·√Q + λ∫1/√Q) ───────────
function tryPolyOverQuadraticRadical(node: MathNode, variable: string, steps: string[]): IntegralPiece {
  const pfs = powerFactors(node, variable);
  if (!pfs) return null;
  let P: Poly = [pfs.coeff];
  let Q: Poly | null = null;
  let radExp = 0;
  for (const f of pfs.pf) {
    const bp = polyFromNode(f.base, variable);
    if (bp && Number.isInteger(f.exp) && f.exp >= 0) {
      let acc: Poly = [1];
      for (let i = 0; i < f.exp; i++) acc = polyMul(acc, bp);
      P = polyMul(P, acc);
      continue;
    }
    if (bp && polyDeg(bp) === 2 && Math.abs(Math.abs(f.exp) - 0.5) < 1e-12 && !Q) { Q = bp; radExp = f.exp; continue; }
    return null;
  }
  if (!Q) return null;
  // √Q numerator → P·Q / √Q
  if (radExp > 0) P = polyMul(P, Q);
  const n = polyDeg(P);
  if (n < 1 || n > 7) return null;
  // P = R'·Q + R·Q'/2 + λ  with R of degree n-1
  const Qd: Poly = [Q[1], 2 * Q[2]];
  const unknown = n + 1; // r_0..r_{n-1}, λ
  const M: number[][] = Array.from({ length: n + 1 }, () => new Array(unknown).fill(0));
  for (let j = 0; j < n; j++) {
    const Rj: Poly = [...new Array(j).fill(0), 1];
    const dR: Poly = j === 0 ? [0] : [...new Array(j - 1).fill(0), j];
    const term = polyAdd(polyMul(dR, Q), polyScale(polyMul(Rj, Qd), 0.5));
    for (let r = 0; r <= n; r++) M[r][j] = term[r] ?? 0;
  }
  M[0][n] = 1;
  const rhs = Array.from({ length: n + 1 }, (_, r) => P[r] ?? 0);
  const sol = solveLinearSystem(M, rhs);
  if (!sol) return null;
  const R: Poly = sol.slice(0, n);
  const lambda = sol[n];
  const radNode = parse(`1/sqrt(${polyToString(Q, variable)})`);
  const radSteps: string[] = [];
  let tail = "";
  if (Math.abs(lambda) > 1e-10) {
    const t = tryQuadraticRadical(radNode, variable, radSteps);
    if (!t) return null;
    tail = ` + ${numLit(lambda)}*(${t.antiderivative})`;
  }
  const anti = `(${polyToString(R, variable)})*sqrt(${polyToString(Q, variable)})${tail}`.replace(/\+ -/g, "- ");
  steps.push(`##Reduce to $\\int \\frac{dx}{\\sqrt{Q}}$\n$$\\int \\frac{P(x)}{\\sqrt{Q}}\\,dx = R(x)\\sqrt{Q} + \\lambda\\int \\frac{dx}{\\sqrt{Q}}$$`);
  steps.push(...radSteps);
  steps.push(`##Result\n$$${integralLatex(node.toString(), variable)} = ${exprToLatex(prettifyResult(anti, variable))}$$`);
  return { antiderivative: anti, rule: "polynomial over a quadratic radical" };
}

// ── rational functions of e^{ax}: substitute u = e^{ax} ──────────────────────
function tryExpSubstitution(node: MathNode, variable: string, steps: string[], depth: number): IntegralPiece {
  if (depth > 3) return null;
  const exps: { c: number; d: number }[] = [];
  let fail = false;
  node.traverse((n: MathNode, path: string) => {
    if (fail || path === "fn") return;
    const fn = asFunctionNode(n);
    const op = asOperator(n);
    let arg: MathNode | null = null;
    if (fn && fn.fn.name === "exp" && fn.args.length === 1) arg = fn.args[0];
    else if (op?.fn === "pow" && op.args.length === 2 && asSymbol(unwrapParens(op.args[0]))?.name === "e" && !isConstantExpr(op.args[1], variable)) arg = op.args[1];
    if (arg) {
      const l = tryLinear(arg, variable);
      if (!l || Math.abs(l.a) < 1e-12) { fail = true; return; }
      exps.push({ c: l.a, d: l.b });
    }
  });
  if (fail || exps.length === 0) return null;
  const a = Math.min(...exps.map((e) => Math.abs(e.c)));
  if (exps.some((e) => Math.abs(e.c / a - Math.round(e.c / a)) > 1e-9 || Math.abs(Math.round(e.c / a)) > 8)) return null;
  const uName = pickSubVariable(node);
  const replaced = node.transform((n: MathNode) => {
    const fn = asFunctionNode(n);
    const op = asOperator(n);
    let arg: MathNode | null = null;
    if (fn && fn.fn.name === "exp" && fn.args.length === 1) arg = fn.args[0];
    else if (op?.fn === "pow" && op.args.length === 2 && asSymbol(unwrapParens(op.args[0]))?.name === "e") arg = op.args[1];
    if (!arg) return n;
    const l = tryLinear(arg, variable);
    if (!l) return n;
    const k = Math.round(l.a / a);
    return parse(`exp(${numLit(l.b)})*${uName}^(${k})`);
  });
  let ratio: MathNode;
  try { ratio = simplify(parse(`(${replaced.toString()})/(${numLit(a)}*${uName})`)); } catch { return null; }
  if (!isConstantExpr(ratio, variable)) return null;
  const sub: string[] = [];
  const H = integrateNode(ratio, uName, sub, depth + 1);
  if (!H) return null;
  const anti = substituteExpr(H.antiderivative, uName, a === 1 ? `exp(${variable})` : `exp(${numLit(a)}*${variable})`);
  steps.push(`##Substitute $${uName} = e^{${a === 1 ? "" : numLit(a)}${variable}}$\n$$${integralLatex(node.toString(), variable)} = \\int ${exprToLatex(ratio.toString())}\\,d${uName}$$`);
  steps.push(...sub);
  steps.push(`##Substitute Back\n$$${integralLatex(node.toString(), variable)} = ${exprToLatex(prettifyResult(anti, variable))}$$`);
  return { antiderivative: anti, rule: "exponential substitution" };
}

// ── generic parts:  P(x)·h(x)  →  P·v − ∫P'·v  with v = ∫h  ─────────────────
function tryPartsPolyTimesAny(node: MathNode, variable: string, steps: string[], depth: number): IntegralPiece {
  if (depth > 2) return null;
  const { coeff, factors } = collectFactors(node, variable);
  let poly: Poly = [coeff];
  const rest: MathNode[] = [];
  for (const f of factors) {
    const pl = polyFromNode(f, variable);
    if (pl) poly = polyMul(poly, pl); else rest.push(f);
  }
  if (rest.length === 0 || polyDeg(poly) < 1 || polyDeg(poly) > 6) return null;
  const hStr = rest.map((r) => `(${r.toString()})`).join("*");
  const hNode = parse(hStr);
  const vSteps: string[] = [];
  const v = integrateNode(hNode, variable, vSteps, depth + 2);
  if (!v) return null;
  const dP: Poly = poly.length > 1 ? trimPoly(poly.slice(1).map((c, i) => c * (i + 1))) : [0];
  const remStr = `(${polyToString(dP, variable)})*(${v.antiderivative})`;
  const remSteps: string[] = [];
  let rem: IntegralPiece = null;
  try { rem = integrateNode(simplify(parse(remStr)), variable, remSteps, depth + 2); } catch { rem = null; }
  if (!rem) return null;
  const anti = `(${polyToString(poly, variable)})*(${v.antiderivative}) - (${rem.antiderivative})`;
  steps.push(`##Integration by Parts\n$$u = ${exprToLatex(polyToString(poly, variable))}, \\quad dv = ${exprToLatex(hStr)}\\,d${variable}$$\n$$du = ${exprToLatex(polyToString(dP, variable))}\\,d${variable}, \\quad v = ${exprToLatex(prettifyResult(v.antiderivative, variable))}$$`);
  steps.push(...remSteps);
  steps.push(`##Combine\n$$uv - \\int v\\,du = ${exprToLatex(prettifyResult(anti, variable))}$$`);
  return { antiderivative: anti, rule: "integration by parts (generic)" };
}

// ── expand with function atoms treated as symbols:  (1+cos x)^2,  e^x(x+1) … ─
function tryExpandAtoms(node: MathNode, variable: string, steps: string[], depth: number): IntegralPiece {
  if (depth > 3) return null;
  const atoms = new Map<string, string>();
  let counter = 0;
  const abstracted = node.transform((n: MathNode, path: string) => {
    if (path === "fn") return n;
    const fn = asFunctionNode(n);
    if (fn && !isConstantExpr(n, variable)) {
      const key = n.toString();
      if (!atoms.has(key)) atoms.set(key, `AT${++counter}Z`);
      return parse(atoms.get(key)!);
    }
    return n;
  });
  if (atoms.size === 0) return null;
  let expanded: MathNode;
  try { expanded = rationalize(abstracted); } catch { return null; }
  let text = expanded.toString();
  for (const [key, sym] of atoms) text = text.split(sym).join(`(${key})`);
  let result: MathNode;
  try { result = parse(text); } catch { return null; }
  const before = flattenSum(simplify(result)).length;
  const original = flattenSum(node).length;
  if (before <= original && result.toString() === node.toString()) return null;
  // must have become a sum of >1 terms or at least changed shape
  const terms = flattenSum(result);
  if (terms.length < 2 && result.toString().replace(/\s/g, "") === node.toString().replace(/\s/g, "")) return null;
  const sub: string[] = [];
  const piece = integrateNode(result, variable, sub, depth + 1);
  if (!piece) return null;
  steps.push(`##Expand\n$$${exprToLatex(node.toString())} = ${exprToLatex(result.toString())}$$`);
  steps.push(...sub);
  return piece;
}

// ── e^{ax} × (trig product) → e^{ax} × Σ sinusoids ───────────────────────────
function tryExpTimesTrigProduct(node: MathNode, variable: string, steps: string[], depth: number): IntegralPiece {
  if (depth > 3) return null;
  const { coeff, factors } = collectFactors(node, variable);
  const expF: MathNode[] = [];
  const trigF: MathNode[] = [];
  for (const f of factors) {
    const fn = asFunctionNode(f);
    const op = asOperator(f);
    const isExp = (fn && fn.fn.name === "exp") || (op?.fn === "pow" && asSymbol(unwrapParens(op.args[0]))?.name === "e");
    if (isExp) expF.push(f); else trigF.push(f);
  }
  if (expF.length !== 1 || trigF.length === 0) return null;
  const sum = trigProductToSum(parse(trigF.map((t) => `(${t.toString()})`).join("*")), variable);
  if (!sum) return null;
  const isSingle = trigF.length === 1 && asFunctionNode(trigF[0]) !== null;
  if (isSingle) return null;
  const expr = `(${numLit(coeff)})*(${expF[0].toString()})*(${sum})`;
  const sub: string[] = [];
  let piece: IntegralPiece = null;
  try { piece = integrateNode(simplify(parse(expr)), variable, sub, depth + 1); } catch { piece = null; }
  if (!piece) {
    try { piece = integrateNode(parse(expr), variable, sub, depth + 1); } catch { piece = null; }
  }
  if (!piece) return null;
  steps.push(`##Power-Reduction\n$$${integralLatex(node.toString(), variable)} = ${integralLatex(expr, variable)}$$`);
  steps.push(...sub);
  return piece;
}

// ── hyperbolic → exponentials ────────────────────────────────────────────────
function tryHyperbolicRewrite(node: MathNode, variable: string, steps: string[], depth: number): IntegralPiece {
  if (depth > 3) return null;
  let changed = false;
  const rewritten = node.transform((n: MathNode, path: string) => {
    if (path === "fn") return n;
    const fn = asFunctionNode(n);
    if (!fn || fn.args.length !== 1) return n;
    const u = fn.args[0].toString();
    if (fn.fn.name === "sinh") { changed = true; return parse(`(exp(${u}) - exp(-(${u})))/2`); }
    if (fn.fn.name === "cosh") { changed = true; return parse(`(exp(${u}) + exp(-(${u})))/2`); }
    if (fn.fn.name === "tanh") { changed = true; return parse(`(exp(${u}) - exp(-(${u})))/(exp(${u}) + exp(-(${u})))`); }
    return n;
  });
  if (!changed) return null;
  const sub: string[] = [];
  let piece: IntegralPiece = null;
  try { piece = integrateNode(rewritten, variable, sub, depth + 1); } catch { piece = null; }
  if (!piece) return null;
  steps.push(`##Rewrite Hyperbolics as Exponentials\n$$${integralLatex(node.toString(), variable)} = ${integralLatex(rewritten.toString(), variable)}$$`);
  steps.push(...sub);
  return piece;
}

// ── √(ax+b) substitution:  u = √(ax+b), x = (u²−b)/a ─────────────────────────
function trySqrtLinearSubstitution(node: MathNode, variable: string, steps: string[], depth: number): IntegralPiece {
  if (depth > 3) return null;
  let target: { l: { a: number; b: number }; text: string } | null = null;
  node.traverse((n: MathNode, path: string) => {
    if (target || path === "fn") return;
    const fn = asFunctionNode(n);
    if (fn && fn.fn.name === "sqrt" && fn.args.length === 1) {
      const l = tryLinear(fn.args[0], variable);
      if (l && Math.abs(l.a) > 1e-12) target = { l, text: n.toString() };
    }
  });
  const t = target as { l: { a: number; b: number }; text: string } | null;
  if (!t) return null;
  const uName = pickSubVariable(node);
  const xOfU = `((${uName}^2 - ${numLit(t.l.b)})/${numLit(t.l.a)})`;
  let replaced: MathNode;
  try {
    replaced = node.transform((n: MathNode, path: string) => {
      if (path === "fn") return n;
      if (n.toString() === t.text) return parse(uName);
      if (asSymbol(n)?.name === variable) return parse(xOfU);
      return n;
    });
  } catch { return null; }
  let integrand: MathNode;
  try { integrand = simplify(parse(`(${replaced.toString()})*(2*${uName}/${numLit(t.l.a)})`)); } catch { return null; }
  if (!isConstantExpr(integrand, variable)) return null;
  const sub: string[] = [];
  const H = integrateNode(integrand, uName, sub, depth + 1);
  if (!H) return null;
  const anti = substituteExpr(H.antiderivative, uName, t.text);
  steps.push(`##Substitute $${uName} = ${exprToLatex(t.text)}$\n$$${variable} = ${exprToLatex(xOfU)}, \\quad ${variable === "x" ? "dx" : `d${variable}`} = ${exprToLatex(`2*${uName}/${numLit(t.l.a)}`)}\\,d${uName}$$\n$$${integralLatex(node.toString(), variable)} = \\int ${exprToLatex(integrand.toString())}\\,d${uName}$$`);
  steps.push(...sub);
  steps.push(`##Substitute Back\n$$${integralLatex(node.toString(), variable)} = ${exprToLatex(prettifyResult(anti, variable))}$$`);
  return { antiderivative: anti, rule: "radical substitution" };
}

// ── rational functions of sin/cos: Weierstrass t = tan(u/2) ─────────────────
function tryWeierstrass(node: MathNode, variable: string, steps: string[], depth: number): IntegralPiece {
  if (depth > 3) return null;
  let lin: { a: number; b: number } | null = null;
  let ok = true;
  let sawTrig = false;
  node.traverse((n: MathNode, path: string) => {
    if (!ok || path === "fn") return;
    const fn = asFunctionNode(n);
    if (!fn) {
      if (asSymbol(n)?.name === variable) {
        // bare variable allowed only inside trig args
      }
      return;
    }
    if (!["sin", "cos", "tan", "sec", "csc", "cot"].includes(fn.fn.name) || fn.args.length !== 1) { ok = false; return; }
    const l = tryLinear(fn.args[0], variable);
    if (!l || Math.abs(l.a) < 1e-12) { ok = false; return; }
    if (lin && (Math.abs(lin.a - l.a) > 1e-9 || Math.abs(lin.b - l.b) > 1e-9)) { ok = false; return; }
    lin = l;
    sawTrig = true;
  });
  const lg = lin as { a: number; b: number } | null;
  if (!ok || !sawTrig || !lg) return null;
  const tName = pickSubVariable(node);
  const sinT = `(2*${tName}/(1+${tName}^2))`;
  const cosT = `((1-${tName}^2)/(1+${tName}^2))`;
  const replaced = node.transform((n: MathNode, path: string) => {
    if (path === "fn") return n;
    const fn = asFunctionNode(n);
    if (!fn || fn.args.length !== 1) return n;
    switch (fn.fn.name) {
      case "sin": return parse(sinT);
      case "cos": return parse(cosT);
      case "tan": return parse(`${sinT}/${cosT}`);
      case "sec": return parse(`1/${cosT}`);
      case "csc": return parse(`1/${sinT}`);
      case "cot": return parse(`${cosT}/${sinT}`);
      default: return n;
    }
  });
  let integrand: MathNode;
  try { integrand = simplify(parse(`(${replaced.toString()})*2/((1+${tName}^2)*${numLit(lg.a)})`)); } catch { return null; }
  if (!isConstantExpr(integrand, variable)) return null;
  const sub: string[] = [];
  let H: IntegralPiece = null;
  try { H = integrateNode(integrand, tName, sub, depth + 1); } catch { H = null; }
  if (!H) return null;
  const u = `(${numLit(lg.a)}*${variable} ${lg.b < 0 ? "-" : "+"} ${numLit(Math.abs(lg.b))})`;
  const anti = substituteExpr(H.antiderivative, tName, `tan(${u}/2)`);
  steps.push(`##Weierstrass Substitution $${tName} = \\tan\\frac{u}{2}$\n$$\\sin u = \\frac{2${tName}}{1+${tName}^2},\\quad \\cos u = \\frac{1-${tName}^2}{1+${tName}^2},\\quad du = \\frac{2\\,d${tName}}{1+${tName}^2}$$\n$$${integralLatex(node.toString(), variable)} = \\int ${exprToLatex(integrand.toString())}\\,d${tName}$$`);
  steps.push(...sub);
  steps.push(`##Substitute Back\n$$${integralLatex(node.toString(), variable)} = ${exprToLatex(prettifyResult(anti, variable))}$$`);
  return { antiderivative: anti, rule: "Weierstrass substitution" };
}

// ── rationalise  1/(√a ± √b)  ────────────────────────────────────────────────
function tryConjugate(node: MathNode, variable: string, steps: string[], depth: number): IntegralPiece {
  if (depth > 3) return null;
  const op = asOperator(unwrapParens(node));
  if (!op || op.fn !== "divide" || op.args.length !== 2) return null;
  const den = asOperator(unwrapParens(op.args[1]));
  if (!den || (den.fn !== "add" && den.fn !== "subtract") || den.args.length !== 2) return null;
  const [a, b] = den.args;
  const conj = den.fn === "add" ? `(${a.toString()}) - (${b.toString()})` : `(${a.toString()}) + (${b.toString()})`;
  let rewritten: MathNode;
  try { rewritten = simplify(parse(`((${op.args[0].toString()})*(${conj}))/(((${a.toString()})^2) - ((${b.toString()})^2))`)); } catch { return null; }
  if (rewritten.toString() === node.toString()) return null;
  const sub: string[] = [];
  let piece: IntegralPiece = null;
  try { piece = integrateNode(rewritten, variable, sub, depth + 1); } catch { piece = null; }
  if (!piece) return null;
  steps.push(`##Multiply by the Conjugate\n$$${exprToLatex(node.toString())} = ${exprToLatex(rewritten.toString())}$$`);
  steps.push(...sub);
  return piece;
}

// ── trigonometric substitution for √(quadratic) ──────────────────────────────
function binom(n: number, k: number): number { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return Math.round(r); }

/** sin(k·t), cos(k·t) → polynomials in sin(t), cos(t) (k = 2…6). */
function expandMultipleAngles(node: MathNode, t: string): MathNode {
  return node.transform((n: MathNode, path: string) => {
    if (path === "fn") return n;
    const fn = asFunctionNode(n);
    if (!fn || fn.args.length !== 1 || (fn.fn.name !== "sin" && fn.fn.name !== "cos")) return n;
    const l = tryLinear(fn.args[0], t);
    if (!l || Math.abs(l.b) > 1e-12 || !Number.isInteger(l.a) || Math.abs(l.a) < 2 || Math.abs(l.a) > 6) return n;
    const k = Math.abs(l.a);
    const cs = `cos(${t})`, sn = `sin(${t})`;
    const terms: string[] = [];
    for (let j = 0; j <= k; j++) {
      const wantImag = fn.fn.name === "sin";
      if ((j % 2 === 1) !== wantImag) continue;
      const sign = (((wantImag ? (j - 1) / 2 : j / 2) % 2) === 0) ? 1 : -1;
      terms.push(`${sign * binom(k, j)}*${cs}^${k - j}*${sn}^${j}`);
    }
    const body = terms.join(" + ");
    return parse(fn.fn.name === "sin" && l.a < 0 ? `-(${body})` : `(${body})`);
  });
}

/** Any product of sin/cos/tan/cot/sec/csc powers → a sum of friendlier terms
 *  (cos²/sin² → cot², 1/(cos² sin) → tan·sec + csc, …) that the table rules can integrate. */
function niceTrigForm(node: MathNode, t: string): MathNode {
  const pfs = powerFactors(node, t);
  if (!pfs) return node;
  let a = 0, b = 0;
  for (const f of pfs.pf) {
    const fn = asFunctionNode(f.base);
    if (!fn || fn.args.length !== 1 || !Number.isInteger(f.exp) || asSymbol(unwrapParens(fn.args[0]))?.name !== t) return node;
    const e = f.exp;
    switch (fn.fn.name) {
      case "cos": a += e; break;
      case "sin": b += e; break;
      case "tan": b += e; a -= e; break;
      case "cot": a += e; b -= e; break;
      case "sec": a -= e; break;
      case "csc": b -= e; break;
      default: return node;
    }
  }
  const c = pfs.coeff;
  const termFor = (aa: number, bb: number, k: number): string => {
    const coef = numLit(k);
    if (aa >= 0 && bb >= 0) return `${coef}*cos(${t})^${aa}*sin(${t})^${bb}`;
    if (aa > 0 && bb < 0) {
      const p = Math.min(aa, -bb);
      const rest = aa - p > 0 ? `*cos(${t})^${aa - p}` : -bb - p > 0 ? `*csc(${t})^${-bb - p}` : "";
      return `${coef}*cot(${t})^${p}${rest}`;
    }
    if (aa < 0 && bb > 0) {
      const p = Math.min(-aa, bb);
      const rest = bb - p > 0 ? `*sin(${t})^${bb - p}` : -aa - p > 0 ? `*sec(${t})^${-aa - p}` : "";
      return `${coef}*tan(${t})^${p}${rest}`;
    }
    if (bb === 0) return `${coef}*sec(${t})^${-aa}`;
    return `${coef}*csc(${t})^${-bb}`;
  };
  // both negative: multiply by (sin²+cos²) until one exponent is non-negative
  const terms: { a: number; b: number; k: number }[] = [];
  const expand = (aa: number, bb: number, k: number, depth: number) => {
    if ((aa >= 0 || bb >= 0) || depth > 8) { terms.push({ a: aa, b: bb, k }); return; }
    expand(aa + 2, bb, k, depth + 1);
    expand(aa, bb + 2, k, depth + 1);
  };
  expand(a, b, c, 0);
  const merged = new Map<string, { a: number; b: number; k: number }>();
  for (const tm of terms) {
    const key = `${tm.a},${tm.b}`;
    const ex = merged.get(key);
    if (ex) ex.k += tm.k; else merged.set(key, { ...tm });
  }
  try {
    return parse([...merged.values()].map((tm) => termFor(tm.a, tm.b, tm.k)).join(" + "));
  } catch { return node; }
}

function tryTrigSubstitution(node: MathNode, variable: string, steps: string[], depth: number): IntegralPiece {
  if (depth > 3) return null;
  let Q: Poly | null = null;
  let ok = true;
  node.traverse((n: MathNode, path: string) => {
    if (!ok || path === "fn") return;
    const fn = asFunctionNode(n);
    const op = asOperator(n);
    let base: MathNode | null = null;
    if (fn && fn.fn.name === "sqrt" && fn.args.length === 1) base = fn.args[0];
    else if (op?.fn === "pow" && op.args.length === 2 && isConstantExpr(op.args[1], variable)) {
      const e = evaluate(op.args[1].toString());
      if (typeof e === "number" && Number.isFinite(e) && !Number.isInteger(e) && Math.abs(2 * e - Math.round(2 * e)) < 1e-12) base = op.args[0];
    }
    if (!base) return;
    const pb = polyFromNode(base, variable);
    if (!pb || polyDeg(pb) !== 2) return;
    if (!Q) Q = pb;
    else if (Q.length !== pb.length || Q.some((c, i) => Math.abs(c - pb[i]) > 1e-9)) ok = false;
  });
  const quad = Q as Poly | null;
  if (!ok || !quad) return null;
  const [g, b, a] = quad;
  const h = b / (2 * a);
  const k = g / a - h * h;
  if (Math.abs(k) < 1e-12) return null; // perfect square — no radical to remove
  const tName = pickSubVariable(node);
  const uStr = `(${variable} ${h < 0 ? "-" : "+"} ${numLit(Math.abs(h))})`;
  const uPlain = Math.abs(h) < 1e-12 ? variable : uStr;
  type Mode = { x: string; root: string; dx: string; back: Record<string, string>; tBack: string; pts: number[]; label: string; tex: string };
  let mode: Mode;
  if (a < 0 && k < 0) {
    const R = Math.sqrt(-k), sa = Math.sqrt(-a);
    const Rs = numLit(R);
    const rad = `sqrt(${numLit(-k)} - ${uPlain}^2)`;
    mode = {
      label: `u = R\\sin\\theta`, tex: `\\sqrt{R^2-u^2} = R\\cos\\theta`,
      x: `(${Rs}*sin(${tName}) - ${numLit(h)})`, root: `(${numLit(sa)}*${Rs}*cos(${tName}))`, dx: `(${Rs}*cos(${tName}))`,
      back: { sin: `(${uPlain}/${Rs})`, cos: `(${rad}/${Rs})`, tan: `(${uPlain}/${rad})`, cot: `(${rad}/${uPlain})`, sec: `(${Rs}/${rad})`, csc: `(${Rs}/${uPlain})` },
      tBack: `asin(${uPlain}/${Rs})`, pts: [-0.9, -0.6, -0.3, 0.2, 0.5, 0.8].map((q) => q * R - h),
    };
  } else if (a > 0 && k > 0) {
    const sk = Math.sqrt(k), sa = Math.sqrt(a);
    const sks = numLit(sk);
    const rad = `sqrt(${uPlain}^2 + ${numLit(k)})`;
    mode = {
      label: `u = a\\tan\\theta`, tex: `\\sqrt{u^2+a^2} = a\\sec\\theta`,
      x: `(${sks}*tan(${tName}) - ${numLit(h)})`, root: `(${numLit(sa)}*${sks}*sec(${tName}))`, dx: `(${sks}*sec(${tName})^2)`,
      back: { sin: `(${uPlain}/${rad})`, cos: `(${sks}/${rad})`, tan: `(${uPlain}/${sks})`, cot: `(${sks}/${uPlain})`, sec: `(${rad}/${sks})`, csc: `(${rad}/${uPlain})` },
      tBack: `atan(${uPlain}/${sks})`, pts: [-3.1, -1.4, -0.5, 0.3, 0.9, 2.2, 4.1].map((q) => q - h),
    };
  } else if (a > 0 && k < 0) {
    const m = Math.sqrt(-k), sa = Math.sqrt(a);
    const ms = numLit(m);
    const rad = `sqrt(${uPlain}^2 - ${numLit(-k)})`;
    mode = {
      label: `u = a\\sec\\theta`, tex: `\\sqrt{u^2-a^2} = a\\tan\\theta`,
      x: `(${ms}*sec(${tName}) - ${numLit(h)})`, root: `(${numLit(sa)}*${ms}*tan(${tName}))`, dx: `(${ms}*sec(${tName})*tan(${tName}))`,
      back: { sin: `(${rad}/${uPlain})`, cos: `(${ms}/${uPlain})`, tan: `(${rad}/${ms})`, cot: `(${ms}/${rad})`, sec: `(${uPlain}/${ms})`, csc: `(${uPlain}/${rad})` },
      tBack: `acos(${ms}/abs(${uPlain}))`, pts: [1.2, 1.5, 2, 2.8, 4, 6].map((q) => q * m - h),
    };
  } else return null;

  // 1) rewrite the integrand in θ
  const replaced = node.transform((n: MathNode, path: string) => {
    if (path === "fn") return n;
    const fn = asFunctionNode(n);
    const op = asOperator(n);
    if (fn && fn.fn.name === "sqrt" && fn.args.length === 1 && polyFromNode(fn.args[0], variable) && polyDeg(polyFromNode(fn.args[0], variable)!) === 2) return parse(mode.root);
    if (op?.fn === "pow" && op.args.length === 2 && isConstantExpr(op.args[1], variable)) {
      const e = evaluate(op.args[1].toString());
      const pb = polyFromNode(op.args[0], variable);
      if (typeof e === "number" && !Number.isInteger(e) && pb && polyDeg(pb) === 2) return parse(`${mode.root}^${numLit(2 * e)}`);
    }
    if (asSymbol(n)?.name === variable) return parse(mode.x);
    return n;
  });
  let integrand: MathNode;
  try { integrand = simplify(parse(`(${replaced.toString()})*${mode.dx}`)); } catch { return null; }
  if (!isConstantExpr(integrand, variable)) return null;
  const sub: string[] = [];
  let H: IntegralPiece = null;
  const nice = niceTrigForm(integrand, tName);
  try { H = integrateNode(nice, tName, sub, depth + 1); } catch { H = null; }
  if (!H && nice !== integrand) { sub.length = 0; try { H = integrateNode(integrand, tName, sub, depth + 1); } catch { H = null; } }
  if (!H) return null;

  // 2) back-substitute: sin θ, cos θ, … and θ itself in terms of x
  let T: MathNode;
  try { T = expandMultipleAngles(parse(H.antiderivative), tName); } catch { return null; }
  const back = T.transform((n: MathNode, path: string) => {
    if (path === "fn") return n;
    const fn = asFunctionNode(n);
    if (fn && fn.args.length === 1 && asSymbol(unwrapParens(fn.args[0]))?.name === tName && mode.back[fn.fn.name]) return parse(mode.back[fn.fn.name]);
    if (asSymbol(n)?.name === tName) return parse(mode.tBack);
    return n;
  });
  const anti = back.toString();
  if (!isConstantExpr(back, tName)) return null;
  if (!verifyAntiderivative(node, anti, variable, mode.pts)) return null;
  steps.push(`##Trigonometric Substitution\n$$${mode.label}, \\qquad ${mode.tex}$$\n$$u = ${exprToLatex(uPlain)}, \\quad ${variable} = ${exprToLatex(mode.x)}, \\quad d${variable} = ${exprToLatex(mode.dx)}\\,d\\theta$$`);
  steps.push(`##Rewrite in $\\theta$\n$$${integralLatex(node.toString(), variable)} = \\int ${exprToLatex(integrand.toString())}\\,d\\theta$$`);
  steps.push(...sub.map((st) => st.split(tName).join("\u03b8")));
  steps.push(`##Back-Substitute\n$$\\theta = ${exprToLatex(mode.tBack)}$$\n$$${integralLatex(node.toString(), variable)} = ${exprToLatex(prettifyResult(anti, variable))}$$`);
  return { antiderivative: anti, rule: "trigonometric substitution", verified: true };
}

// ── roots of x: x = u^N makes x^(p/q), √x, ∛x rational ───────────────────────
function gcdInt(a: number, b: number): number { return b === 0 ? Math.abs(a) : gcdInt(b, a % b); }

function tryRootSubstitution(node: MathNode, variable: string, steps: string[], depth: number): IntegralPiece {
  if (depth > 3) return null;
  const dens: number[] = [];
  node.traverse((n: MathNode, path: string) => {
    if (path === "fn") return;
    const fn = asFunctionNode(n);
    const op = asOperator(n);
    if (fn && fn.args.length === 1 && asSymbol(unwrapParens(fn.args[0]))?.name === variable) {
      if (fn.fn.name === "sqrt") dens.push(2);
      if (fn.fn.name === "cbrt") dens.push(3);
    }
    if (op?.fn === "pow" && op.args.length === 2 && asSymbol(unwrapParens(op.args[0]))?.name === variable && isConstantExpr(op.args[1], variable)) {
      const e = evaluate(op.args[1].toString());
      if (typeof e === "number" && !Number.isInteger(e)) {
        for (let q = 2; q <= 8; q++) if (Math.abs(e * q - Math.round(e * q)) < 1e-9) { dens.push(q); break; }
      }
    }
  });
  if (dens.length === 0) return null;
  const N = dens.reduce((acc, q) => (acc * q) / gcdInt(acc, q), 1);
  if (N < 2 || N > 12) return null;
  const uName = pickSubVariable(node);
  const replaced = node.transform((n: MathNode, path: string) => {
    if (path === "fn") return n;
    const fn = asFunctionNode(n);
    const op = asOperator(n);
    if (fn && fn.args.length === 1 && asSymbol(unwrapParens(fn.args[0]))?.name === variable) {
      if (fn.fn.name === "sqrt") return parse(`${uName}^${N / 2}`);
      if (fn.fn.name === "cbrt") return parse(`${uName}^${N / 3}`);
    }
    if (op?.fn === "pow" && op.args.length === 2 && asSymbol(unwrapParens(op.args[0]))?.name === variable && isConstantExpr(op.args[1], variable)) {
      const e = evaluate(op.args[1].toString());
      if (typeof e === "number") return parse(`${uName}^${numLit(e * N)}`);
    }
    if (asSymbol(n)?.name === variable) return parse(`${uName}^${N}`);
    return n;
  });
  let integrand: MathNode;
  try { integrand = simplify(parse(`(${replaced.toString()})*${N}*${uName}^${N - 1}`)); } catch { return null; }
  if (!isConstantExpr(integrand, variable)) return null;
  const sub: string[] = [];
  let H: IntegralPiece = null;
  try { H = integrateNode(integrand, uName, sub, depth + 1); } catch { H = null; }
  if (!H) return null;
  const anti = substituteExpr(H.antiderivative, uName, N === 2 ? `sqrt(${variable})` : `${variable}^(1/${N})`);
  if (!verifyAntiderivative(node, anti, variable, [0.3, 0.7, 1.3, 2.2, 3.4, 5.1, 8.2])) return null;
  steps.push(`##Substitute $${variable} = ${uName}^{${N}}$\n$$${uName} = ${N === 2 ? `\\sqrt{${variable}}` : `${variable}^{1/${N}}`},\\quad d${variable} = ${N}${uName}^{${N - 1}}\\,d${uName}$$\n$$${integralLatex(node.toString(), variable)} = \\int ${exprToLatex(integrand.toString())}\\,d${uName}$$`);
  steps.push(...sub);
  steps.push(`##Substitute Back\n$$${integralLatex(node.toString(), variable)} = ${exprToLatex(prettifyResult(anti, variable))}$$`);
  return { antiderivative: anti, rule: "root substitution", verified: true };
}

// ── the strategy chain ───────────────────────────────────────────────────────
/** If f(x)/B(x) is the same constant at every sample point, return that constant. */
function ratioConst(f: (x: number) => number, B: (x: number) => number): number | null {
  let r: number | null = null;
  let n = 0;
  for (const x of [0.4, 0.9, 1.7, 2.3, 3.1, -0.6]) {
    const fv = f(x), bv = B(x);
    if (!Number.isFinite(fv) || !Number.isFinite(bv) || Math.abs(bv) < 1e-12) continue;
    const q = fv / bv;
    if (r === null) r = q; else if (Math.abs(q - r) > 1e-7 * Math.max(1, Math.abs(r))) return null;
    n++;
  }
  return n >= 3 ? r : null;
}

/**
 * Integrals whose antiderivative is a named special function:
 *   e^(−a x²) → erf,  sin(ax)/x → Si,  cos(ax)/x → Ci,  e^(ax)/x → Ei,
 *   1/ln x → li,  sin/cos(a x²) → Fresnel S / C.
 * These have no elementary closed form, so we name the standard function
 * instead of giving up.
 */
function trySpecialFunctions(node: MathNode, variable: string, steps: string[]): IntegralPiece {
  const x = variable;
  const f = compileReal(node, [x]);
  const cf = (c: number) => (Math.abs(c - 1) < 1e-9 ? "" : Math.abs(c + 1) < 1e-9 ? "-" : `(${fmtNum(c)})*`);
  const ax = (a: number) => (Math.abs(a - 1) < 1e-9 ? "" : `${fmtNum(a)}*`);
  const mk = (src: string) => compileReal(parse(src), [x]);
  const done = (anti: string, name: string, note: string): IntegralPiece => {
    steps.push(`##Special Function\n$$${integralLatex(node.toString(), x)}$$\nThis has no elementary antiderivative. It equals the standard function **${name}**:\n\n${note}`);
    return { antiderivative: anti, rule: name, verified: true };
  };

  // Gaussian  c·e^(−a x²)
  {
    const f0 = f(0), f1 = f(1);
    if (Number.isFinite(f0) && Number.isFinite(f1) && f0 !== 0 && f1 / f0 > 0 && f1 / f0 < 1) {
      const a = -Math.log(f1 / f0);
      const B = mk(`exp(-${a}*${x}^2)`);
      const c = ratioConst(f, B);
      if (c !== null && Math.abs(c - f0) < 1e-7 * Math.max(1, Math.abs(f0))) {
        const sa = Math.sqrt(a);
        void sa;
        return done(`${cf(c)}(sqrt(pi)/(2*${Math.abs(a - 1) < 1e-9 ? "1" : `sqrt(${fmtNum(a)})`}))*erf(${Math.abs(a - 1) < 1e-9 ? "" : `sqrt(${fmtNum(a)})*`}${x})`, "erf", "$\\int e^{-a x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2\\sqrt{a}}\\,\\mathrm{erf}(\\sqrt{a}\\,x)$");
      }
    }
  }

  // e^(a x)/x  (written with ^, so there is no exp() call to find)
  {
    const g = (t: number) => t * f(t);
    const g1 = g(1), g2 = g(2);
    if (Number.isFinite(g1) && Number.isFinite(g2) && g1 !== 0 && g2 / g1 > 0) {
      const a = Math.log(g2 / g1);
      if (Math.abs(a) > 1e-9) {
        const c = ratioConst(f, mk(`exp(${a}*${x})/${x}`));
        if (c !== null) return done(`${cf(c)}Ei(${ax(Number(a.toPrecision(10)))}${x})`, "Ei", "$\\int \\frac{e^{ax}}{x}\\,dx = \\mathrm{Ei}(ax)$");
      }
    }
  }

  // find the first sin / cos / exp / ln call and its argument
  let fn: { name: string; arg: MathNode } | null = null;
  node.traverse((n: MathNode) => {
    if (fn) return;
    const fnode = asFunctionNode(n);
    if (fnode && ["sin", "cos", "exp", "log"].includes(fnode.fn.name) && fnode.args.length === 1) fn = { name: fnode.fn.name, arg: fnode.args[0] };
  });
  const FN = fn as { name: string; arg: MathNode } | null;
  if (FN) {
    const lin = tryLinear(FN.arg, x);
    if (lin && lin.b === 0 && lin.a !== 0) {
      const a = lin.a;
      if (FN.name === "sin") {
        const c = ratioConst(f, mk(`sin(${a}*${x})/${x}`));
        if (c !== null) return done(`${cf(c)}Si(${ax(a)}${x})`, "Si", "$\\int \\frac{\\sin(ax)}{x}\\,dx = \\mathrm{Si}(ax)$");
      }
      if (FN.name === "cos") {
        const c = ratioConst(f, mk(`cos(${a}*${x})/${x}`));
        if (c !== null) return done(`${cf(c)}Ci(${ax(Math.abs(a))}${x})`, "Ci", "$\\int \\frac{\\cos(ax)}{x}\\,dx = \\mathrm{Ci}(|a|x)$");
      }
      if (FN.name === "exp") {
        const c = ratioConst(f, mk(`exp(${a}*${x})/${x}`));
        if (c !== null) return done(`${cf(c)}Ei(${ax(a)}${x})`, "Ei", "$\\int \\frac{e^{ax}}{x}\\,dx = \\mathrm{Ei}(ax)$");
      }
    }
    if (FN.name === "log" && unwrapParens(FN.arg).toString() === x) {
      const c = ratioConst(f, mk(`1/log(${x})`));
      if (c !== null) return done(`${cf(c)}li(${x})`, "li", "$\\int \\frac{dx}{\\ln x} = \\mathrm{li}(x)$ (logarithmic integral)");
    }
    if (FN.name === "sin" || FN.name === "cos") {
      const poly = polyFromNode(FN.arg, x);
      if (poly && poly.length === 3 && poly[0] === 0 && poly[1] === 0 && poly[2] > 0) {
        const a = poly[2];
        const c = ratioConst(f, mk(`${FN.name}(${a}*${x}^2)`));
        if (c !== null) {
          const nm = FN.name === "sin" ? "FresnelS" : "FresnelC";
          return done(`${cf(c)}sqrt(pi/(2*${fmtNum(a)}))*${nm}(sqrt(2*${fmtNum(a)}/pi)*${x})`, nm, "Fresnel integral: $\\int \\" + FN.name + "(ax^2)\\,dx = \\sqrt{\\tfrac{\\pi}{2a}}\\,\\mathrm{" + (FN.name === "sin" ? "S" : "C") + "}\\!\\left(x\\sqrt{\\tfrac{2a}{\\pi}}\\right)$");
        }
      }
    }
  }
  return null;
}

/** u = xᵏ substitution for integrands like x³·e^(x²), x⁵·sin(x³), x³/(1+x²)^… (leftover powers of x fold into u). */
function tryPowerSubstitution(node: MathNode, variable: string, steps: string[], depth: number): IntegralPiece {
  if (depth > 4) return null;
  const U = variable === "u" ? "w" : "u";
  const f = compileReal(node, [variable]);
  const src = node.toString();
  for (const k of [2, 3, 4]) {
    // only worth trying when x^k actually appears in the integrand
    if (!new RegExp(`\\b${variable}\\s*\\^\\s*\\(?${k}\\)?(?![\\d.])`).test(src)) continue;
    let h: MathNode, H: MathNode;
    try {
      h = simplify(parse(`(${node.toString()})/(${k}*${variable}^${k - 1})`));
      H = simplify(h.transform((n: MathNode) => (n.type === "SymbolNode" && (n as unknown as { name: string }).name === variable ? parse(`${U}^(1/${k})`) : n)));
    } catch { continue; }
    const hs = H.toString();
    if (new RegExp(`\\b${variable}\\b`).test(hs) || !hs.includes(U)) continue;
    if (new RegExp(`${U}\\s*\\^\\s*\\(?-?\\d+\\s*/\\s*${k}\\)?`).test(hs) || /sqrt\(|cbrt\(/.test(hs)) continue;
    // H(xᵏ)·k·x^(k−1) must equal f(x) for positive and negative x
    let Hc: (u: number) => number;
    try { Hc = compileReal(H, [U]); } catch { continue; }
    let good = 0, bad = false;
    for (const x of [0.6, 1.1, 1.8, -0.7, -1.4]) {
      const fv = f(x), hv = Hc(Math.pow(x, k)) * k * Math.pow(x, k - 1);
      if (!Number.isFinite(fv) || !Number.isFinite(hv)) continue;
      if (Math.abs(fv - hv) > 1e-6 * Math.max(1, Math.abs(fv))) { bad = true; break; }
      good++;
    }
    if (bad || good < 3) continue;
    const buf: string[] = [];
    const inner = integrateNode(H, U, buf, depth + 1);
    if (!inner) continue;
    steps.push(`##u-Substitution\n$$u = ${variable}^{${k}}, \\quad du = ${k}${variable}^{${k - 1}}\\,d${variable}$$`);
    steps.push(`##Rewrite in Terms of u\n$$${integralLatex(node.toString(), variable)} = \\int ${exprToLatex(hs)}\\,du$$`);
    steps.push(...buf);
    const back = inner.antiderivative.replace(new RegExp(`\\b${U}\\b`, "g"), `(${variable}^${k})`);
    steps.push(`##Substitute Back\n$$u = ${variable}^{${k}} \\;\\Rightarrow\\; ${exprToLatex(back)}$$`);
    return { antiderivative: back, rule: "u-substitution" };
  }
  return null;
}

function integrateExtras(node: MathNode, variable: string, steps: string[], depth: number): IntegralPiece {
  if (depth > 6) return null;
  const attempts: Array<() => { piece: IntegralPiece; buf: string[] }> = [];
  const run = (fn: (buf: string[]) => IntegralPiece) => attempts.push(() => { const buf: string[] = []; return { piece: fn(buf), buf }; });

  run((buf) => tryTableRules(node, variable, buf));

  // 1) sin/cos powers & products → sum of sinusoids
  run((buf) => {
    const sum = trigProductToSum(node, variable);
    if (!sum) return null;
    const f = collectFactors(node, variable).factors;
    const simpleAlready = f.length === 1 && asFunctionNode(f[0]) !== null;
    if (simpleAlready) return null;
    buf.push(`##Power-Reduction / Product-to-Sum\n$$${integralLatex(node.toString(), variable)} = ${integralLatex(prettifyResult(sum, variable), variable)}$$`);
    return integrateNode(parse(sum), variable, buf, depth + 1);
  });

  // 0) trig reciprocal rewrite → retry whole pipeline on the rewritten tree
  run((buf) => {
    const rewritten = rewriteTrigReciprocals(node);
    if (rewritten.toString() === node.toString()) return null;
    buf.push(`##Rewrite\n$$${integralLatex(node.toString(), variable)} = ${integralLatex(rewritten.toString(), variable)}$$`);
    const inner = integrateNode(rewritten, variable, buf, depth + 1);
    return inner;
  });

  run((buf) => tryPolyTimesTranscendental(node, variable, buf));
  run((buf) => tryPolyTimesAbs(node, variable, buf));
  run((buf) => tryExpTrig(node, variable, buf));
  run((buf) => tryLogPowers(node, variable, buf));
  run((buf) => tryQuadraticRadical(node, variable, buf));
  run((buf) => tryLinearPowerTimesPoly(node, variable, buf));
  run((buf) => tryRationalFunction(node, variable, buf));

  // polynomial expansion
  run((buf) => {
    const poly = polyFromNode(node, variable);
    if (!poly || polyDeg(poly) < 1) return null;
    const expanded = polyToString(poly, variable);
    buf.push(`##Expand\n$$${exprToLatex(node.toString())} = ${exprToLatex(expanded)}$$`);
    return integrateNode(parse(expanded), variable, buf, depth + 1);
  });

  run((buf) => tryPartsAlgebraicDerivative(node, variable, buf, depth));
  run((buf) => tryPolyOverQuadraticRadical(node, variable, buf));
  run((buf) => tryRootSubstitution(node, variable, buf, depth));
  run((buf) => tryExpTimesTrigProduct(node, variable, buf, depth));
  run((buf) => tryExpandAtoms(node, variable, buf, depth));
  run((buf) => tryPartsPolyTimesAny(node, variable, buf, depth));
  run((buf) => tryUSubstitution(node, variable, buf, depth));
  run((buf) => tryWeierstrass(node, variable, buf, depth));
  run((buf) => tryHyperbolicRewrite(node, variable, buf, depth));
  run((buf) => trySqrtLinearSubstitution(node, variable, buf, depth));
  run((buf) => tryTrigSubstitution(node, variable, buf, depth));
  run((buf) => tryConjugate(node, variable, buf, depth));
  run((buf) => tryExpSubstitution(node, variable, buf, depth));
  run((buf) => tryPowerSubstitution(node, variable, buf, depth));
  if (depth === 0) run((buf) => trySpecialFunctions(node, variable, buf));

  for (const attempt of attempts) {
    let out: { piece: IntegralPiece; buf: string[] };
    try { out = attempt(); } catch { continue; }
    if (out.piece && (out.piece.verified || verifyAntiderivative(node, out.piece.antiderivative, variable))) {
      steps.push(...out.buf);
      return out.piece;
    }
  }
  return null;
}

let integrationDeadline = Infinity;
const integrationFailMemo = new Set<string>();

function withIntegrationBudget<T>(ms: number, fn: () => T): T {
  const prevDeadline = integrationDeadline;
  integrationDeadline = Date.now() + ms;
  integrationFailMemo.clear();
  try { return fn(); } finally { integrationDeadline = prevDeadline; }
}

function integrateNode(node: MathNode, variable: string, steps: string[], depth = 0): IntegralPiece {
  if (Date.now() > integrationDeadline) return null;
  const memoKey = `${variable}|${node.toString()}`;
  if (integrationFailMemo.has(memoKey)) return null;
  const result = integrateNodeUncached(node, variable, steps, depth);
  if (!result) integrationFailMemo.add(memoKey);
  return result;
}

function integrateNodeUncached(node: MathNode, variable: string, steps: string[], depth = 0): IntegralPiece {
  const coreSteps: string[] = [];
  let core: IntegralPiece = null;
  try { core = integrateNodeCore(node, variable, coreSteps, depth); } catch { core = null; }
  if (core) { steps.push(...coreSteps); return core; }
  return integrateExtras(node, variable, steps, depth);
}


function integrateNodeCore(node: MathNode, variable: string, steps: string[], depth = 0): IntegralPiece {
  const str = node.toString();
  const here = () => integralLatex(node.toString(), variable);

  // Constant (no variable present)
  if (isConstantExpr(node, variable)) {
    if (str === "undefined" || str === "Infinity" || str === "-Infinity" || str === "NaN") {
      return null;
    }
    const k = str === "0" ? "0" : str;
    steps.push(`##Constant Rule\n$$${here()} = ${k === "0" ? "0" : `${exprToLatex(k)}${variable}`}$$`);
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
    steps.push(`##Separate the Terms\n$$${here()} = ${perTermLatex}$$`);
    const parts: string[] = [];
    let ok = true;
    flatTerms.forEach((t) => {
      const piece = integrateNode(t.node, variable, steps, depth + 1);
      if (!piece) { ok = false; return; }
      parts.push(t.sign === -1 ? `-(${piece.antiderivative})` : piece.antiderivative);
    });
    if (!ok) return null;
    steps.push(`##Combine the Results\n$$${here()} = ${exprToLatex(prettifyResult(parts.join("+"), variable))}$$`);
    return { antiderivative: parts.join(" + ").replace(/\+ -/g, "- "), rule: "sum rule" };
  }
  // Unary minus: -f(x)
  if (asOperator(node)?.fn === "unaryMinus") {
    const arg = asOperator(node)!.args[0];
    steps.push(`##Constant Multiple Rule\n$$${here()} = -${integralLatex(arg.toString(), variable)}$$`);
    const piece = integrateNode(arg, variable, steps, depth + 1);
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
        steps.push(`##Constant Multiple Rule\n$$${here()} = ${exprToLatex(constSide.toString())}\\cdot ${integralLatex(fnSide.toString(), variable)}$$`);
        const piece = integrateNode(fnSide, variable, steps, depth + 1);
        if (!piece) return null;
        return { antiderivative: `(${constSide.toString()})*(${piece.antiderivative})`, rule: "constant multiple rule" };
      }
    }
    // Beyond a constant factor: try u-substitution, then integration by parts.
    // Each attempt writes into its own buffer so a failed attempt leaves no
    // half-finished reasoning in the displayed steps.
    const subSteps: string[] = [];
    const sub = tryGeneralUSub(node, variable, subSteps);
    if (sub) { steps.push(...subSteps); return sub; }
    const partsSteps: string[] = [];
    const parts = tryIntegrationByParts(node, variable, partsSteps, depth + 1);
    if (parts) { steps.push(...partsSteps); return parts; }
    return null;
  }

  // Division: f(x)/c where c is constant
  if (asOperator(node)?.fn === "divide") {
    const args = asOperator(node)!.args;
    const [num, denom] = args;
    if (isConstantExpr(denom, variable)) {
      steps.push(`##Constant Divisor\n$$${here()} = \\frac{${integralLatex(num.toString(), variable)}}{${exprToLatex(denom.toString())}}$$`);
      const piece = integrateNode(num, variable, steps, depth + 1);
      if (!piece) return null;
      return { antiderivative: `(${piece.antiderivative})/(${denom.toString()})`, rule: "constant divisor" };
    }
    // 1/(ax+b) → ln|ax+b| / a
    if (isConstantExpr(num, variable)) {
      const lin = tryLinear(denom, variable);
      if (lin && lin.a !== 0) {
        const argStr = wrapLinearArg(lin.a, lin.b, variable);
        if (isTrivialLinear(lin)) {
          steps.push(`##Reciprocal Rule\n$$${here()} = \\ln\\left|${variable}\\right|$$`);
        } else {
          steps.push(`##Reciprocal Rule + u-Substitution\n$u = ${exprToLatex(argStr)},\\quad du = ${fmtNum(lin.a)}\\,d${variable}$\n$$${here()} = \\frac{1}{${fmtNum(lin.a)}}\\int \\frac{1}{u}\\,du = \\frac{1}{${fmtNum(lin.a)}}\\ln\\left|${exprToLatex(argStr)}\\right|$$`);
        }
        return { antiderivative: `(${num.toString()})*log(abs(${argStr}))/(${fmtNum(lin.a)})`, rule: "reciprocal/log rule" };
      }
      const atanSteps: string[] = [];
      const atanPiece = tryArctanForm(node, variable, atanSteps);
      if (atanPiece) { steps.push(...atanSteps); return atanPiece; }
    }
    const divSubSteps: string[] = [];
    const divSub = tryGeneralUSub(node, variable, divSubSteps);
    if (divSub) { steps.push(...divSubSteps); return divSub; }
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
              steps.push(`##Power Rule Exception (n = -1)\n$$${here()} = \\ln\\left|${variable}\\right|$$`);
            } else {
              steps.push(`##Power Rule Exception (n = -1) + u-Substitution\n$u = ${exprToLatex(argStr)},\\quad du = ${fmtNum(lin.a)}\\,d${variable}$\n$$${here()} = \\frac{1}{${fmtNum(lin.a)}}\\ln\\left|${exprToLatex(argStr)}\\right|$$`);
            }
            return { antiderivative: `log(abs(${argStr}))/(${fmtNum(lin.a)})`, rule: "power rule (n=-1, log form)" };
          }
          const newExp = n + 1;
          const argStr = wrapLinearArg(lin.a, lin.b, variable);
          if (isTrivialLinear(lin)) {
            steps.push(`##Power Rule\n$$${here()} = \\frac{${variable}^{${fmtNum(n)}+1}}{${fmtNum(n)}+1} = \\frac{${variable}^{${fmtNum(newExp)}}}{${fmtNum(newExp)}}$$`);
          } else {
            steps.push(`##Power Rule + u-Substitution\n$u = ${exprToLatex(argStr)},\\quad du = ${fmtNum(lin.a)}\\,d${variable}$\n$$${here()} = \\frac{\\left(${exprToLatex(argStr)}\\right)^{${fmtNum(newExp)}}}{${fmtNum(newExp)}\\cdot ${fmtNum(lin.a)}}$$`);
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
            steps.push(`##Exponential Rule\n$$${here()} = ${b === "e" ? `e^${variable}` : `\\frac{${b}^${variable}}{\\ln(${b})}`}$$`);
          } else {
            steps.push(`##Exponential Rule + u-Substitution\n$u = ${exprToLatex(argStr)},\\quad du = ${fmtNum(lin.a)}\\,d${variable}$\n$$${here()} = ${b === "e" ? `\\frac{e^{${exprToLatex(argStr)}}}{${fmtNum(lin.a)}}` : `\\frac{${b}^{${exprToLatex(argStr)}}}{${fmtNum(lin.a)}\\cdot \\ln(${b})}`}$$`);
          }
          const aFactor = lin.a === 1 ? "" : `(${fmtNum(lin.a)})*`;
          return {
            antiderivative: b === "e"
              ? `(e)^(${argStr})${lin.a === 1 ? "" : `/(${fmtNum(lin.a)})`}`
              : `(${base.toString()})^(${argStr})/(${aFactor}log(${base.toString()}))`,
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
        : `$u = ${uL},\\quad du = ${a}\\,d${variable}$\n`;

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
        steps.push(`##Log Rule\n${intro}$$${here()} = ${trivial ? `${variable}\\ln(${variable}) - ${variable}` : `\\frac{u\\ln(u) - u}{${a}}`}$$`);
        return { antiderivative: `((${u})*log(${u}) - (${u}))/(${a})`, rule: "log rule (∫ln u du = u ln u - u)" };
      }
      if (fname === "sqrt") {
        steps.push(`##Power Rule ($\\sqrt{u} = u^{1/2}$)\n${intro}$$${here()} = ${trivial ? `\\frac{2}{3}${variable}^{3/2}` : `\\frac{2u^{3/2}}{3\\cdot ${a}}`}$$`);
        return { antiderivative: `(2/3)*(${u})^(3/2)/(${a})`, rule: "power rule (sqrt, linear sub)" };
      }
    }
    return null;
  }

  // Bare variable: ∫x dx = x²/2
  if (asSymbol(node) && str === variable) {
    steps.push(`##Power Rule\n$$${here()} = \\frac{${variable}^{1+1}}{1+1} = \\frac{${variable}^2}{2}$$`);
    return { antiderivative: `${variable}^2/2`, rule: "power rule (n=1)" };
  }

  return null;
}

export function solveIndefiniteIntegral(
  expression: string,
  variable: string = "x"
): MathResult {
  try {
    expression = prepareInput(expression);
    variable = cleanVariable(variable);
    assertNonEmptyExpression(expression);
    const steps: string[] = [];
    const bodySteps: string[] = [];
    steps.push(`##Given\n$$${integralLatex(expression, variable)}$$`);

    const { piece, node } = integrateWithVariants(parse(expression), variable, bodySteps);

    if (!piece) {
      steps.push(...bodySteps);
      steps.push(`##Beyond This Solver\nNot supported (needs e.g. trig substitution). Try Definite Integration for a numerical value.`);
      return {
        input: expression,
        result: "Cannot solve symbolically — try Definite Integration",
        steps,
        error: undefined,
      };
    }
    steps.push(...bodySteps);

    // Clean, textbook-ordered display (pulls literal coefficients out front,
    // sorts polynomial terms by descending degree) instead of raw mathjs
    // simplify() output, which scrambles term order and sign placement.
    const isSpecial = /\b(erf|Si|Ci|Ei|li|FresnelS|FresnelC)\(/.test(piece.antiderivative);
    let finalStr = isSpecial ? piece.antiderivative : prettifyResult(piece.antiderivative, variable);
    // Never hand back an antiderivative that fails the derivative check: the
    // pretty-printer or an intermediate rule can mangle signs on negative powers.
    if (!piece.verified && !verifyAntiderivative(node, finalStr, variable)) {
      const raws: string[] = [];
      try { raws.push(simplify(parse(piece.antiderivative)).toString()); } catch { /* ignore */ }
      try { raws.push(rationalize(parse(piece.antiderivative)).toString()); } catch { /* ignore */ }
      raws.push(piece.antiderivative);
      let fixed: string | null = null;
      for (const r of raws) {
        let pretty: string | null = null;
        try { pretty = prettifyResult(r, variable); } catch { pretty = null; }
        if (pretty && verifyAntiderivative(node, pretty, variable)) { fixed = pretty; break; }
        if (verifyAntiderivative(node, r, variable)) { fixed = r; break; }
      }
      if (fixed) finalStr = fixed;
    }

    steps.push(`##Add the Constant\n$$${integralLatex(expression, variable)} = ${exprToLatex(finalStr)} + C$$`);

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
        steps.push(`##Verify\n$F'(${variable}) = f(${variable})$ ✓`);
      } else {
        steps.push(`##Verify\n⚠ Check didn't match — re-verify manually, or use Definite Integration.`);
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
/** LaTeX for ∂ⁿf/∂y²∂x given the order the derivatives are applied in (first applied is rightmost). */
export function partialNotation(sequence: string[]): string {
  const segments: { v: string; n: number }[] = [];
  for (const v of sequence) {
    const last = segments[segments.length - 1];
    if (last && last.v === v) last.n++; else segments.push({ v, n: 1 });
  }
  const denom = [...segments].reverse().map((sg) => (sg.n === 1 ? `\\partial ${sg.v}` : `\\partial ${sg.v}^{${sg.n}}`)).join(" ");
  const total = sequence.length;
  return total === 1 ? `\\frac{\\partial f}{${denom}}` : `\\frac{\\partial^{${total}} f}{${denom}}`;
}

/**
 * Partial derivative(s). `variable` is the variable to differentiate by; pass
 * `sequence` (e.g. ["x","y"]) for higher-order and mixed partials — they are
 * applied left to right, so ["x","y"] gives ∂²f/∂y∂x.
 */
export function solvePartialDerivative(
  expression: string,
  variable: string,
  allVars: string[] = ["x", "y"],
  sequence?: string[],
): MathResult {
  try {
    expression = prepareInput(expression);
    variable = cleanVariable(variable);
    allVars = [...new Set([...allVars.map((v) => cleanVariable(v)), ...(sequence ?? []).map((v) => cleanVariable(v))])];
    assertNonEmptyExpression(expression);
    const seq = sequence && sequence.length > 0 ? sequence.map((v) => cleanVariable(v)) : [variable];
    if (seq.length > 6) throw new MathInputError("Please keep the order of the derivative to 6 or less.");
    const steps: string[] = [];
    const givenP = parse(expression);
    const logMaskP = maskLogConstants(rewriteLogBases(givenP), allVars);
    const maskedP = maskStepFunctions(logMaskP.node);
    let current = maskedP.node;
    const restoreTex = (st: string) => restoreStepFunctions(st, logMaskP.map, true);

    const uniqueSeq = [...new Set(seq)];
    const constNote = seq.length === 1
      ? (allVars.filter((v) => v !== seq[0]).length ? ` (${allVars.filter((v) => v !== seq[0]).map((v) => `$${v}$`).join(", ")} treated as constant${allVars.filter((v) => v !== seq[0]).length > 1 ? "s" : ""})` : "")
      : ` (differentiate by ${seq.map((v) => `$${v}$`).join(", then ")}${uniqueSeq.length > 0 ? "; everything else is constant at each step" : ""})`;
    steps.push(`##Given\n$$f(${allVars.join(", ")}) = ${exprToLatex(givenP.toString())}$$\nFind $${partialNotation(seq)}$${constNote}.`);

    for (let i = 0; i < seq.length; i++) {
      const v = seq[i];
      if (seq.length > 1) {
        steps.push(`##Differentiate by ${v}${i > 0 ? " (again)" : ""}\n$$${i === 0 ? "f" : "g"} = ${exprToLatex(restoreStepFunctions(prettifyResult(current.toString(), v), logMaskP.map))}\\quad\\Rightarrow\\quad \\frac{\\partial}{\\partial ${v}}${i === 0 ? "f" : "g"}$$`);
      }
      if (!maskedP.used) {
        const buf: string[] = [];
        narrateDerivativeTop(current, v, buf, true);
        steps.push(...buf.map(restoreTex));
      }
      current = simplify(derivative(current, v));
    }
    let pretty = restoreStepFunctions(restoreStepFunctions(prettifyResult(current.toString(), seq[seq.length - 1]), maskedP.map), logMaskP.map);
    // mathjs folds ln(2), ln(10)… into decimals — turn the common ones back into ln(k)
    for (let k = 2; k <= 12; k++) {
      const dec = Math.log(k).toString().slice(0, 12).replace(/\./g, "\\.");
      pretty = pretty.replace(new RegExp(`(?<![\\d.])${dec}\\d*`, "g"), `ln(${k})`);
    }
    steps.push(`##Final Answer\n$$${partialNotation(seq)} = ${exprToLatex(pretty)}$$`);

    return { input: expression, result: pretty, steps };
  } catch (e: unknown) {
    return { input: expression, result: "", steps: [], error: describeError(e) };
  }
}

// Generate points for graphing

/**
 * Checks whether an expression can actually be plotted as y = f(variable), and
 * returns a plain-English reason when it cannot. The graph used to fail
 * silently (an empty canvas) for a typo like "sinn(x)" or an expression in the
 * wrong variable; now every custom function either draws or explains itself.
 */
export function validateGraphExpression(
  expression: string,
  variable: string = "x",
  xMin: number = -10,
  xMax: number = 10
): string | null {
  return validate2D(expression, variable, xMin, xMax);
}

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

export { polyFromNode, polyDeg, polyToString, trimPoly, rationalFromNode };
