import { useMemo } from "react";
import { exprToLatex } from "@/lib/latex";
import { MathTex } from "./MathTex";

/** One side of an equation → LaTeX, or null if it can't be parsed as maths. */
function partTex(part: string): string | null {
  const p = part.trim();
  if (!p) return null;
  try {
    const t = exprToLatex(p);
    // exprToLatex hands the raw text back when parsing fails; only accept that
    // for plain symbols/numbers like "x" or "25".
    if (t === p && !/^[A-Za-z0-9_.]+$/.test(p)) return null;
    return t;
  } catch {
    return null;
  }
}

/** Split on a separator that sits outside any brackets. */
function splitTop(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) depth--;
    if (ch === sep && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out;
}

const REL: Record<string, string> = { "<=": "\\le", ">=": "\\ge", "=": "=", "<": "<", ">": ">" };

function buildTex(input: string): string | null {
  const s = input.trim();
  if (!s) return null;

  // Vector / point / parametric form: (a, b, c)
  if (s.startsWith("(") && s.endsWith(")")) {
    const items = splitTop(s.slice(1, -1), ",");
    if (items.length >= 2) {
      const parts = items.map(partTex);
      if (parts.every((x) => x !== null)) return `\\left(${parts.join(",\\ ")}\\right)`;
    }
  }

  // Equations and inequalities: left REL right (REL may repeat, e.g. 1 < x < 5)
  const pieces: string[] = [];
  const ops: string[] = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) depth--;
    if (depth === 0 && (ch === "<" || ch === ">" || ch === "=")) {
      const two = s.slice(i, i + 2);
      const op = two === "<=" || two === ">=" ? two : ch;
      pieces.push(cur); cur = ""; ops.push(op);
      i += op.length - 1;
    } else cur += ch;
  }
  pieces.push(cur);
  if (ops.length) {
    const texs = pieces.map(partTex);
    if (texs.every((x) => x !== null)) return texs.map((t, i) => (i < ops.length ? `${t} ${REL[ops[i]]}` : t)).join(" ");
    return null;
  }
  return partTex(s);
}

/** Desktop-only live preview of what is typed, shown as real maths under an
 *  input. Hidden on phones, and renders nothing if the text can't be parsed. */
export function MathPreview({ value }: { value: string }) {
  const tex = useMemo(() => buildTex(value), [value]);
  if (!tex) return null;
  return (
    <div className="math-preview flex items-center gap-3 px-1 pt-2 text-lg overflow-x-auto">
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground shrink-0">Preview</span>
      <MathTex latex={tex} />
    </div>
  );
}
