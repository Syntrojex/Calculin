import { parse as _parse, type MathNode } from "mathjs";
import { normalizeMathInput } from "./text-normalize";

// ── Lightweight structural type guards (kept local rather than imported from
// math-solver.ts, to avoid a circular import — math-solver.ts itself imports
// exprToLatex from this file) ────────────────────────────────────────────────
interface OpNode extends MathNode { fn: string; args: MathNode[] }
interface FnNode extends MathNode { fn: { name: string }; args: MathNode[] }

function asOperator(node: MathNode): OpNode | null {
  return node.type === "OperatorNode" ? (node as unknown as OpNode) : null;
}
function asFunctionNode(node: MathNode): FnNode | null {
  return node.type === "FunctionNode" ? (node as unknown as FnNode) : null;
}
function stripParens(node: MathNode): MathNode {
  if (node.type === "ParenthesisNode") {
    return stripParens((node as unknown as { content: MathNode }).content);
  }
  const withMap = node as unknown as { map?: (fn: (n: MathNode) => MathNode) => MathNode };
  if (typeof withMap.map === "function") return withMap.map((child) => stripParens(child));
  return node;
}

/**
 * mathjs's derivative()/simplify() often leave results as a left-associative
 * chain of divisions with the sign buried inside a "* -1" factor — e.g.
 * differentiating sqrt(cos(x)) produces the mathjs string
 * "sin(x) * -1 / 2 / sqrt(cos(x))" instead of the textbook
 * "-sin(x) / (2*sqrt(cos(x)))". Rendered as LaTeX, the raw form nests one
 * \frac inside another and buries the minus sign mid-expression, which is
 * exactly the kind of result that reads as "wrong" even when it's correct.
 *
 * deepClean() walks the ENTIRE expression tree (not just the outermost
 * level — so a sign or a division chain hidden inside a sum, like the
 * product-rule result for sin(x)/sqrt(x), is caught too) and, at every
 * division/multiplication/addition it finds, collapses "a/b/c" chains into
 * a single fraction and hoists any embedded literal -1 out to one leading
 * minus sign. It never changes what the expression evaluates to — only how
 * the same tree is grouped and signed for display. Because this lives
 * inside exprToLatex(), every step and every result box throughout the app
 * benefits automatically — not just the final answer.
 */
function isOneConstant(node: MathNode): boolean {
  return node.type === "ConstantNode" && (node as unknown as { value: unknown }).value === 1;
}

function isNegativeOneConstant(node: MathNode): boolean {
  if (node.type === "ConstantNode" && (node as unknown as { value: unknown }).value === -1) return true;
  // mathjs represents a literal "-1" as unaryMinus(ConstantNode(1)), not a
  // ConstantNode with value -1 — both derivative() output and a fresh
  // parse("-1") produce this shape, so both must be recognized.
  const op = asOperator(node);
  if (op?.fn === "unaryMinus" && op.args.length === 1) {
    const inner = op.args[0];
    return inner.type === "ConstantNode" && (inner as unknown as { value: unknown }).value === 1;
  }
  return false;
}

/** node.toString() -> re-parsed MathNode, or null if that round-trip fails
 *  (should be rare — every string built below comes from valid subtrees). */
function tryReparse(str: string): MathNode | null {
  try { return stripParens(_parse(str)); } catch { return null; }
}

/** Strips one leading unaryMinus, reporting the sign it carried. A node with
 *  no leading minus reports sign +1 and comes back unchanged. */
function signOf(node: MathNode): { sign: 1 | -1; node: MathNode } {
  const op = asOperator(node);
  if (op?.fn === "unaryMinus" && op.args.length === 1) return { sign: -1, node: op.args[0] };
  return { sign: 1, node };
}

function applySign(sign: 1 | -1, node: MathNode): MathNode {
  if (sign === 1) return node;
  return tryReparse(`-(${node.toString()})`) ?? node;
}

export function deepCleanNode(node: MathNode): MathNode {
  const op = asOperator(node);

  if (op?.fn === "unaryMinus" && op.args.length === 1) {
    const inner = signOf(deepCleanNode(op.args[0]));
    return applySign((inner.sign * -1) as 1 | -1, inner.node);
  }

  if (op?.fn === "divide" && op.args.length === 2) {
    // Clean each side first (so any nested chain a level down has already
    // been collapsed and its sign hoisted to a single leading unaryMinus),
    // THEN strip that outer sign back off before checking whether what's
    // left is itself a division — the recursive call always wraps a
    // negative result in unaryMinus, so without this un-wrap the chain
    // check below would never match past the first division.
    const sA0 = signOf(deepCleanNode(op.args[0]));
    const sB0 = signOf(deepCleanNode(op.args[1]));
    let numerator = sA0.node;
    let denominator = sB0.node;
    let sign = (sA0.sign * sB0.sign) as 1 | -1;
    // Collapse a left-associative chain: (p/q)/b -> p/(q*b), so the whole
    // chain renders as ONE fraction instead of one nested inside another.
    const numOp = asOperator(numerator);
    if (numOp?.fn === "divide" && numOp.args.length === 2) {
      const [p, q] = numOp.args;
      const sP = signOf(p);
      numerator = sP.node;
      sign = (sign * sP.sign) as 1 | -1;
      denominator = tryReparse(`(${q.toString()})*(${denominator.toString()})`) ?? denominator;
    }
    const combined = tryReparse(`(${numerator.toString()})/(${denominator.toString()})`) ?? node;
    return applySign(sign, combined);
  }

  if (op?.fn === "multiply" && op.args.length === 2) {
    const a = deepCleanNode(op.args[0]);
    const b = deepCleanNode(op.args[1]);
    if (isNegativeOneConstant(a)) return applySign(-1, b);
    if (isNegativeOneConstant(b)) return applySign(-1, a);
    // A "1/denom" factor folds directly into a single fraction:
    // coeff*(1/denom) -> coeff/denom, instead of leaving a redundant "×1"
    // sitting in the numerator (e.g. "2*(1/x^3)" -> "2/x^3").
    const bFrac = asOperator(b);
    if (bFrac?.fn === "divide" && bFrac.args.length === 2 && isOneConstant(bFrac.args[0])) {
      return deepCleanNode(tryReparse(`(${a.toString()})/(${bFrac.args[1].toString()})`) ?? node);
    }
    const aFrac = asOperator(a);
    if (aFrac?.fn === "divide" && aFrac.args.length === 2 && isOneConstant(aFrac.args[0])) {
      return deepCleanNode(tryReparse(`(${b.toString()})/(${aFrac.args[1].toString()})`) ?? node);
    }
    const sA = signOf(a);
    const sB = signOf(b);
    const sign = (sA.sign * sB.sign) as 1 | -1;
    const combined = tryReparse(`(${sA.node.toString()})*(${sB.node.toString()})`) ?? node;
    return applySign(sign, combined);
  }

  if ((op?.fn === "add" || op?.fn === "subtract") && op.args.length === 2) {
    const a = deepCleanNode(op.args[0]);
    const bClean = deepCleanNode(op.args[1]);
    const sB = signOf(bClean);
    // "a + (-b)" and "a - (+b)" both read as "a - b" — pick whichever
    // operator the cleaned right-hand side now actually needs.
    const bIsNegative = op.fn === "add" ? sB.sign === -1 : sB.sign === 1;
    const joiner = bIsNegative ? "-" : "+";
    return tryReparse(`(${a.toString()})${joiner}(${sB.node.toString()})`) ?? node;
  }

  if (op?.fn === "pow" && op.args.length === 2) {
    const a = deepCleanNode(op.args[0]);
    const b = deepCleanNode(op.args[1]);
    return tryReparse(`(${a.toString()})^(${b.toString()})`) ?? node;
  }

  const fn = asFunctionNode(node);
  if (fn && fn.args.length > 0) {
    const args = fn.args.map((a) => deepCleanNode(a).toString()).join(", ");
    return tryReparse(`${fn.fn.name}(${args})`) ?? node;
  }

  return node;
}

/** Same cleanup, working on this app's plain expression-string syntax
 *  instead of a parsed node — used by callers (like prettifyResult) that
 *  want the cleaned-up string back rather than LaTeX. Falls back to the
 *  original string unchanged if it doesn't parse. */
export function deepCleanExprString(exprString: string): string {
  try {
    return deepCleanNode(stripParens(_parse(exprString))).toString();
  } catch {
    return exprString;
  }
}

/**
 * Converts this app's plain expression syntax (mathjs-flavored: "x^3",
 * "sqrt(x)", "log(x)", "abs(x)", "3*x", "1/x", ...) into real LaTeX for
 * KaTeX rendering. Delegates to mathjs's own MathNode.toTex(), which — unlike
 * a hand-written regex converter — correctly handles fractions, nested
 * powers, sqrt, absolute value, and arbitrary parenthesization without the
 * "half-matched \frac{}" bugs a naive "a/b -> \frac{a}{b}" regex runs into on
 * anything more complex than a single term (confirmed: a regex-based
 * approach mangled "2^x/log(2)" into "2^\frac{{x}}{\ln}(2)"). Before handing
 * off to toTex(), the parsed tree is run through deepCleanNode() so a chain
 * of divisions or a buried "* -1" sign renders as one clean fraction with a
 * single leading minus, instead of nested fractions with the sign lost
 * inside them.
 */
export function exprToLatex(input: string): string {
  try {
    const node = _parse(normalizeMathInput(input));
    const cleaned = deepCleanNode(stripParens(node));
    let tex = cleaned.toTex();
    // This app's solvers only ever call mathjs's single-arg log(...), which
    // is always the natural log (see text-normalize.ts) — mathjs already
    // renders that as \ln for a recognized built-in call, but guard against
    // \mathrm{ln} showing up for any edge case where it falls back to a
    // plain-text function wrapper.
    tex = tex.replace(/\\mathrm\{ln\}/g, "\\ln");
    return tex;
  } catch {
    // Fall back to the raw string rather than crash the steps panel — this
    // should be rare since callers only ever pass strings this app itself
    // already built and knows to be valid mathjs syntax.
    return input;
  }
}

/** Wraps a d/dx (or ∂/∂x) style derivative notation as LaTeX, e.g.
 *  derivativeLatex("x^3", "x") -> "\frac{d}{dx}\left[x^{3}\right]" */
export function derivativeLatex(expr: string, variable: string, partial = false): string {
  const d = partial ? "\\partial" : "d";
  // "\partial" is a LaTeX command name — concatenating it directly with the
  // variable ("\partialx") makes KaTeX try to parse a single unknown command
  // token, so a space is required to terminate it. Plain "d" has no such
  // issue and customarily reads better with no gap ("dx", not "d x").
  const denom = partial ? `\\partial ${variable}` : `${d}${variable}`;
  return `\\frac{${d}}{${denom}}\\left[${exprToLatex(expr)}\\right]`;
}

/** Wraps an indefinite integral, e.g. integralLatex("sin(x)", "x") -> "\int \sin(x)\,dx" */
export function integralLatex(expr: string, variable: string): string {
  return `\\int ${exprToLatex(expr)}\\,d${variable}`;
}
