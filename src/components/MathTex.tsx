import { useMemo } from "react";
import katex from "katex";

interface MathTexProps {
  latex: string;
  /** true = centered block equation (own line); false = inline within a sentence */
  display?: boolean;
  className?: string;
}

/** Renders a LaTeX string with KaTeX. Falls back to the raw LaTeX source as
 *  plain text if it fails to parse — this app builds LaTeX programmatically
 *  from its own solvers, so failures should be rare, but a broken render
 *  must never crash the whole steps panel. */
export function MathTex({ latex, display = false, className }: MathTexProps) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(latex, {
        displayMode: display,
        throwOnError: false,
        strict: "ignore",
        output: "html",
      });
    } catch {
      return null;
    }
  }, [latex, display]);

  if (html === null) {
    return (
      <span className={`font-mono text-sm ${className ?? ""}`}>{latex}</span>
    );
  }

  const Tag = display ? "div" : "span";
  return (
    <Tag
      className={`${display ? "my-1.5 overflow-x-auto" : ""} ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
