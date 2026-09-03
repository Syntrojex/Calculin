import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check, Sigma } from "lucide-react";
import { formatMath } from "@/lib/math-format";

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

  // sqrt → \sqrt, abs(...) → | ... |
  s = s.replace(/sqrt\(([^)]+)\)/g, "\\sqrt{$1}");
  s = s.replace(/\babs\(([^()]*)\)/g, "|$1|");
  // trig / log — this app's solvers only ever produce single-arg "log(...)",
  // which is always the natural log (see text-normalize.ts), so it maps to
  // \ln in LaTeX, not \log (which conventionally means base 10).
  s = s.replace(/\blog\b/g, "ln");
  s = s.replace(/\b(sin|cos|tan|cot|sec|csc|ln|exp)\b/g, "\\$1");
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

/**
 * Two-part copy control: the main button copies the PLAIN, human-readable
 * result (e.g. "3x²" / "ln|x| + C") straight to the clipboard — pasting it
 * into WhatsApp, Notes, Word, a chat, etc. shows exactly that. Previously
 * this copied raw LaTeX wrapped in "$...$" (e.g. "$3 \cdot x^{2}$"), which
 * looks like broken/garbled text everywhere except a LaTeX renderer — this
 * is what people were reporting as "copy doesn't work". A small secondary
 * "∑" button is kept alongside for anyone who specifically wants LaTeX.
 */
export function LaTeXExportButton({ text, latex, className }: LaTeXExportProps) {
  const [state, setState] = useState<"idle" | "copied" | "copiedLatex">("idle");

  const handleCopyPlain = () => {
    const plain = formatMath(text);
    navigator.clipboard.writeText(plain).then(() => {
      setState("copied");
      setTimeout(() => setState("idle"), 1800);
    });
  };

  const handleCopyLatex = () => {
    const generated = latex ?? toLatex(text);
    navigator.clipboard.writeText(`$${generated}$`).then(() => {
      setState("copiedLatex");
      setTimeout(() => setState("idle"), 1800);
    });
  };

  return (
    <div className={`flex items-center gap-1 ${className ?? ""}`}>
      <Button
        variant="outline"
        size="sm"
        onClick={handleCopyPlain}
        className="gap-1.5 text-xs font-mono h-7 px-2"
        title="Copy result"
      >
        {state === "copied"
          ? <><Check className="h-3 w-3 text-green-500" /> Copied!</>
          : <><Copy className="h-3 w-3" /> Copy</>}
      </Button>
      <Button
        variant="outline"
        size="icon"
        onClick={handleCopyLatex}
        className="h-7 w-7 shrink-0"
        title="Copy as LaTeX"
        aria-label="Copy as LaTeX"
      >
        {state === "copiedLatex" ? <Check className="h-3 w-3 text-green-500" /> : <Sigma className="h-3 w-3" />}
      </Button>
    </div>
  );
}
