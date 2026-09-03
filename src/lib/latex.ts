import { parse as _parse } from "mathjs";
import { normalizeMathInput } from "./text-normalize";

/**
 * Converts this app's plain expression syntax (mathjs-flavored: "x^3",
 * "sqrt(x)", "log(x)", "abs(x)", "3*x", "1/x", ...) into real LaTeX for
 * KaTeX rendering. Delegates to mathjs's own MathNode.toTex(), which — unlike
 * a hand-written regex converter — correctly handles fractions, nested
 * powers, sqrt, absolute value, and arbitrary parenthesization without the
 * "half-matched \frac{}" bugs a naive "a/b -> \frac{a}{b}" regex runs into on
 * anything more complex than a single term (confirmed: a regex-based
 * approach mangled "2^x/log(2)" into "2^\frac{{x}}{\ln}(2)").
 */
export function exprToLatex(input: string): string {
  try {
    const node = _parse(normalizeMathInput(input));
    let tex = node.toTex();
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
