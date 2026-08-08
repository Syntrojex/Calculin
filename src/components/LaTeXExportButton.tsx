import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";

interface LaTeXExportProps {
  /** The raw math text (e.g. "x^2 + 3*x - 5") */
  text: string;
  /** Optional: override the generated LaTeX */
  latex?: string;
  className?: string;
}

/** Convert simple math text to decent LaTeX */
function toLatex(text: string): string {
  let s = text;

  // Powers first — mathjs's computed results always write "x ^ 2" with
  // spaces around the caret (not "x^2"), so these tolerate whitespace on
  // both sides. This must run BEFORE the fraction regex below: converting
  // exponents first stops a numeral like the "3" in "x ^ 3 / 3" from being
  // swept into the wrong \frac{...}{...} grouping.
  s = s.replace(/\s*\^\s*\(([^)]+)\)/g, "^{$1}");
  s = s.replace(/\s*\^\s*([0-9]+)/g, "^{$1}");
  s = s.replace(/\s*\^\s*([a-zA-Z])/g, "^{$1}");

  // sqrt → \sqrt
  s = s.replace(/sqrt\(([^)]+)\)/g, "\\sqrt{$1}");
  // trig / log
  s = s.replace(/\b(sin|cos|tan|cot|sec|csc|log|ln|exp)\b/g, "\\$1");
  // pi, infinity
  s = s.replace(/\bpi\b/gi, "\\pi");
  s = s.replace(/∞/g, "\\infty");
  s = s.replace(/∫/g, "\\int");
  s = s.replace(/∬/g, "\\iint");

  // fractions: a/b → \frac{a}{b}  (simple single-char / digit numerator+denominator)
  s = s.replace(/(\w+)\s*\/\s*(\w+)/g, "\\frac{$1}{$2}");

  // multiplication dot
  s = s.replace(/·/g, "\\cdot");
  s = s.replace(/\*/g, "\\cdot");
  // subscripts: x_2
  s = s.replace(/_([0-9])/g, "_{$1}");
  return s;
}

export function LaTeXExportButton({ text, latex, className }: LaTeXExportProps) {
  const [state, setState] = useState<"idle" | "copied">("idle");

  const handleCopy = () => {
    const generated = latex ?? toLatex(text);
    navigator.clipboard.writeText(`$${generated}$`).then(() => {
      setState("copied");
      setTimeout(() => setState("idle"), 1800);
    });
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleCopy}
      className={`gap-1.5 text-xs font-mono h-7 px-2 ${className ?? ""}`}
      title="Copy as LaTeX"
    >
      {state === "copied"
        ? <><Check className="h-3 w-3 text-green-500" /> Copied!</>
        : <><Copy className="h-3 w-3" /> Copy LaTeX</>}
    </Button>
  );
}
