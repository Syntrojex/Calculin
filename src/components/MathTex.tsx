import { memo, useMemo } from "react";
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
 *  must never crash the whole steps panel.
 *
 *  Wrapped in memo(): Formula Sheet / Definitions pages render dozens of
 *  these at once (up to ~40 on the Trigonometry sheet) — without memo, ANY
 *  re-render of an ancestor (switching theme, switching tabs, any unrelated
 *  state change bubbling down) re-renders every single one of them even
 *  though their own props never changed, which is what made switching
 *  themes or calculators feel sluggish on pages with lots of formulas. */
export const MathTex = memo(function MathTex({ latex, display = false, className }: MathTexProps) {
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
      className={`${display ? "my-1.5 overflow-x-auto no-scrollbar max-w-full" : ""} ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});
