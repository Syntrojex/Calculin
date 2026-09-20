import { MathTex } from "./MathTex";
import { exprToLatex } from "@/lib/latex";

interface ResultMathProps {
  /** Raw mathjs-syntax result string (e.g. "sin(x) * -1 / 2 / sqrt(cos(x))")
   *  — converted to real LaTeX (fractions, radicals, superscripts, a single
   *  leading sign) instead of being shown as flat text with stray "*", "/"
   *  and "-1" tokens. */
  expr: string;
  /** LaTeX for whatever goes before the "=", e.g. "f'(x)" or
   *  "\\int \\sin(x)\\,dx". Omit to render just the expression on its own. */
  prefix?: string;
  className?: string;
}

/** The KaTeX-rendered counterpart to MathText, for the "Result:" box of a
 *  calculator whose result is a single well-formed mathjs expression —
 *  exactly the case a plain-text renderer shows as e.g.
 *  "f'(x)=sin(x)·-1 / 2 / √(cos(x))" instead of a proper stacked fraction. */
export function ResultMath({ expr, prefix, className }: ResultMathProps) {
  const body = exprToLatex(expr);
  const latex = prefix ? `${prefix} = ${body}` : body;
  return <MathTex latex={latex} display className={className} />;
}
