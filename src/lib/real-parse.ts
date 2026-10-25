/**
 * Parse for GRAPHING: like mathjs, but a power with an odd-denominator rational
 * exponent is the REAL root — so x^(1/3) and x^(2/3) draw on both sides of 0
 * (mathjs would return complex numbers for x < 0, leaving half the graph empty).
 *   base^(p/q), q odd  →  nthRoot(base, q)^p
 */
import { parse, evaluate, type MathNode } from "mathjs";
import { cleanExpression } from "./expression-clean";

function hasSymbol(n: MathNode): boolean {
  let found = false;
  n.traverse((m: MathNode, path: string) => { if (m.type === "SymbolNode" && path !== "fn") { const nm = (m as unknown as { name: string }).name; if (!["pi", "e", "tau"].includes(nm)) found = true; } });
  return found;
}

function oddRoot(exponent: MathNode): { p: number; q: number } | null {
  if (hasSymbol(exponent)) return null;
  let v: unknown;
  try { v = evaluate(exponent.toString()); } catch { return null; }
  if (typeof v !== "number" || !Number.isFinite(v) || Number.isInteger(v)) return null;
  for (let q = 3; q <= 15; q += 2) {
    const p = Math.round(v * q);
    if (Math.abs(v - p / q) < 1e-12 && p % q !== 0) {
      // reduce
      let a = Math.abs(p), b = q;
      while (b) [a, b] = [b, a % b];
      return { p: p / a, q: q / a };
    }
  }
  return null;
}

export function realRoots(node: MathNode): MathNode {
  return node.transform((n: MathNode) => {
    if (n.type === "OperatorNode" && (n as unknown as { op: string }).op === "^") {
      const args = (n as unknown as { args: MathNode[] }).args;
      const r = oddRoot(args[1]);
      if (r && r.q > 1) {
        const base = args[0].toString();
        return parse(`nthRoot(${base}, ${r.q})^${r.p < 0 ? `(${r.p})` : r.p}`);
      }
    }
    return n;
  });
}

/** cleanExpression → parse → real-root transform. */
export function realParse(expr: string): MathNode {
  return realRoots(parse(cleanExpression(expr)));
}
