import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check, Sigma } from "lucide-react";
import { formatMath } from "@/lib/math-format";
import { exprToLatex } from "@/lib/latex";

interface LaTeXExportProps {
  /** The raw math text (e.g. "x^2 + 3*x - 5") */
  text: string;
  /** Optional: override the generated LaTeX */
  latex?: string;
  className?: string;
}

/**
 * Converts a result string to LaTeX for the "copy as LaTeX" button. Every
 * caller passes a plain mathjs-syntax result string (e.g. "x^2" or
 * "sin(x) - x*cos(x) + C"), which exprToLatex — mathjs's own
 * MathNode.toTex(), run through the same fraction/sign cleanup as every
 * Result box — handles correctly. A hand-written regex converter used to do
 * this instead and mangled things like "2^x/log(2)" into a broken
 * half-matched \frac{}. If the text isn't a valid expression at all,
 * exprToLatex's own fallback returns it unchanged.
 */
function toLatex(text: string): string {
  return exprToLatex(text);
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
