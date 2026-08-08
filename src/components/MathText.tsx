import { formatMathHTML } from "@/lib/math-format";

interface MathTextProps {
  text: string;
  className?: string;
}

/**
 * Renders math expressions with proper HTML superscripts.
 * e.g. "x^2 + 3*x" renders as "x<sup>2</sup> + 3·x"
 */
export function MathText({ text, className }: MathTextProps) {
  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: formatMathHTML(text) }}
    />
  );
}
