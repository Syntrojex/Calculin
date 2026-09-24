import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Grid3X3 } from "lucide-react";
import { multiply, det as mathDet, inv as mathInv, add, subtract, transpose, Matrix } from "mathjs";
import { useSettings, type Settings } from "@/contexts/SettingsContext";
import { useAutoRun } from "@/hooks/useAutoRun";
import { StepsReveal } from "./StepsReveal";
import { MathTex } from "./MathTex";
import { toFraction, toFractionLatex } from "@/lib/number-format";

type Op = "add" | "subtract" | "multiply" | "determinant" | "inverse" | "transpose" | "cramer" | "rank" | "ref" | "rref";

const SIZES = [1, 2, 3, 4, 5];

function fmtCell(v: number): string {
  const r = toFractionLatex(v, 1000);
  return v < 0 ? `(${r})` : r;
}

/** Renders a plain 2D numeric matrix as a LaTeX bmatrix, e.g. for
 *  "$$A = \begin{bmatrix}1&2\\3&4\end{bmatrix}$$" style display steps. */
function matrixLatex(m: number[][]): string {
  const rows = m.map((row) => row.map((v) => toFractionLatex(v)).join(" & "));
  // \arraystretch adds vertical room per row — without it, a fraction's
  // numerator/denominator crowds into the row above or below it, since a
  // plain matrix row is only as tall as ordinary single-line text needs.
  return `\\def\\arraystretch{1.6}\\begin{bmatrix}${rows.join("\\\\")}\\end{bmatrix}`;
}

/** Same as matrixLatex but for an augmented [A | I]-style matrix, with a
 *  vertical divider drawn between the two halves — used for Gauss-Jordan
 *  inverse steps. */
function augmentedLatex(m: number[][], splitAt: number): string {
  const rows = m.map((row) => row.map((v) => toFractionLatex(v)).join(" & "));
  return `\\def\\arraystretch{1.6}\\left[\\begin{array}{${"c".repeat(splitAt)}|${"c".repeat(m[0].length - splitAt)}}${rows.join("\\\\")}\\end{array}\\right]`;
}

/** Creates an empty rows×cols grid of cell strings, reusing existing values
 *  where they still fit — so switching from 2×2 to 3×3 keeps what you'd
 *  already typed instead of wiping it. */
function resizeGrid(grid: string[][], rows: number, cols: number): string[][] {
  const out: string[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: string[] = [];
    for (let c = 0; c < cols; c++) {
      row.push(grid[r]?.[c] ?? "0");
    }
    out.push(row);
  }
  return out;
}

function parseGrid(grid: string[][], label: string): number[][] {
  const parsed = grid.map((row) => row.map((v) => parseFloat(v)));
  for (const row of parsed) {
    if (row.some((v) => Number.isNaN(v))) {
      throw new Error(`${label} has an empty or invalid cell — every cell needs a number.`);
    }
  }
  return parsed;
}

function formatMatrix(m: number[][] | Matrix): string {
  const arr = Array.isArray(m) ? m : (m as { toArray(): number[][] }).toArray() as number[][];
  return arr
    .map(row =>
      row
        .map(v => {
          if (typeof v !== "number") return String(v);
          const snapped = Math.abs(v) < 1e-10 ? 0 : v;
          // Matrices always display as fractions, never decimals, regardless
          // of the global number-format setting — a decimal entry like
          // 0.3333333 doesn't read as "the matrix" the way 1/3 does.
          return toFraction(snapped, 1000);
        })
        .join("\t")
    )
    .join("\n");
}

function minorOf(a: number[][], skipRow: number, skipCol: number): number[][] {
  return a.filter((_, r) => r !== skipRow).map((row) => row.filter((_, c) => c !== skipCol));
}

/** Computes det(A) while pushing a genuine worked-out method into `steps`:
 *  the 2×2 cross-multiply formula, full cofactor expansion (with each 2×2
 *  minor shown) for 3×3, and cofactor expansion along row 1 for anything
 *  bigger (each minor's own value is computed directly rather than
 *  recursively broken down further, so a 5×5 doesn't explode into an
 *  unreadable wall of nested minors). */
function determinantWithSteps(a: number[][], steps: string[]): number {
  const n = a.length;
  if (n === 1) {
    steps.push(`##Determinant (1×1)\nA 1×1 matrix's determinant is just its single entry:\n$$\\det(A) = ${fmtCell(a[0][0])}$$`);
    return a[0][0];
  }
  if (n === 2) {
    const [[p, q], [r, s]] = a;
    const d = p * s - q * r;
    steps.push(`##Formula (2×2)\nFor $A=\\begin{bmatrix}a&b\\\\c&d\\end{bmatrix}$, cross-multiply the diagonals and subtract:\n$$\\det(A) = ad - bc$$`);
    steps.push(`##Substitute and Compute\n$$\\det(A) = (${fmtCell(p)})(${fmtCell(s)}) - (${fmtCell(q)})(${fmtCell(r)}) = ${fmtCell(p * s)} - ${fmtCell(q * r)} = ${fmtCell(d)}$$`);
    return d;
  }
  if (n === 3) {
    const row0 = a[0];
    const signs = [1, -1, 1];
    const minors = row0.map((_, j) => minorOf(a, 0, j));
    const minorDets = minors.map((m) => m[0][0] * m[1][1] - m[0][1] * m[1][0]);
    steps.push(`##Cofactor Expansion (along Row 1)\nMultiply each entry by its 2×2 minor (cross out its row/column), alternating signs $(+,-,+)$:\n$$\\det(A) = a_{11}\\begin{vmatrix}a_{22}&a_{23}\\\\a_{32}&a_{33}\\end{vmatrix} - a_{12}\\begin{vmatrix}a_{21}&a_{23}\\\\a_{31}&a_{33}\\end{vmatrix} + a_{13}\\begin{vmatrix}a_{21}&a_{22}\\\\a_{31}&a_{32}\\end{vmatrix}$$`);
    minors.forEach((m, j) => {
      steps.push(`##Minor ${j + 1} (remove row 1, column ${j + 1})\n$$${matrixLatex(m)} \\;\\Rightarrow\\; \\det = (${fmtCell(m[0][0])})(${fmtCell(m[1][1])}) - (${fmtCell(m[0][1])})(${fmtCell(m[1][0])}) = ${fmtCell(minorDets[j])}$$`);
    });
    const d = row0.reduce((acc, v, j) => acc + signs[j] * v * minorDets[j], 0);
    const combineExpr = row0.map((v, j) => `${signs[j] === 1 ? (j === 0 ? "" : "+") : "-"}(${fmtCell(v)})(${fmtCell(minorDets[j])})`).join(" ");
    steps.push(`##Combine\n$$\\det(A) = ${combineExpr} = ${fmtCell(d)}$$`);
    return d;
  }
  // n >= 4: cofactor expansion along row 1; each (n-1)×(n-1) minor's value
  // is computed directly rather than expanded further.
  const row0 = a[0];
  const minors = row0.map((_, j) => minorOf(a, 0, j));
  const minorDets = minors.map((m) => mathDet(m) as number);
  steps.push(`##Cofactor Expansion (along Row 1, ${n}×${n})\nFor a matrix this size, expand along the first row into ${n} minors of size ${n - 1}×${n - 1}, alternating signs:\n$$\\det(A) = \\sum_{j=1}^{${n}} (-1)^{1+j}\\,a_{1j}\\,M_{1j}$$`);
  minors.forEach((m, j) => {
    steps.push(`##Minor $M_{1,${j + 1}}$ (remove row 1, column ${j + 1})\n$$\\det\\left(${matrixLatex(m)}\\right) = ${fmtCell(minorDets[j])}$$`);
  });
  const d = row0.reduce((acc, v, j) => acc + (j % 2 === 0 ? 1 : -1) * v * minorDets[j], 0);
  const combineExpr = row0.map((v, j) => `${j % 2 === 0 ? (j === 0 ? "" : "+") : "-"}(${fmtCell(v)})(${fmtCell(minorDets[j])})`).join(" ");
  steps.push(`##Combine\n$$\\det(A) = ${combineExpr} = ${fmtCell(d)}$$`);
  return d;
}

/** Computes A⁻¹ while pushing a genuine worked method into `steps`: the
 *  swap-and-negate adjugate formula for 2×2, and full Gauss-Jordan
 *  elimination on the augmented [A | I] matrix (shown step by step) for
 *  anything 3×3 or larger. Returns null (with an explanatory step) if A is
 *  singular. */
function inverseWithSteps(a: number[][], settings: Settings, steps: string[]): number[][] | null {
  const n = a.length;
  const d = mathDet(a) as number;

  if (n === 2) {
    steps.push(`##Determinant\n$$\\det(A) = (${fmtCell(a[0][0])})(${fmtCell(a[1][1])}) - (${fmtCell(a[0][1])})(${fmtCell(a[1][0])}) = ${fmtCell(d)}$$`);
    if (Math.abs(d) < 1e-10) {
      steps.push(`##No Inverse\nSince $\\det(A) = 0$, this matrix is singular — it has no inverse.`);
      return null;
    }
    const [[p, q], [r, s]] = a;
    steps.push(`##Swap and Negate (Adjugate)\nFor a 2×2 matrix, swap the main diagonal entries and negate the other two:\n$$\\text{adj}(A) = \\begin{bmatrix}d&-b\\\\-c&a\\end{bmatrix} = ${matrixLatex([[s, -q], [-r, p]])}$$`);
    const inv2 = [[s / d, -q / d], [-r / d, p / d]];
    steps.push(`##Divide by the Determinant\n$$A^{-1} = \\frac{1}{\\det(A)}\\,\\text{adj}(A) = \\frac{1}{${fmtCell(d)}}${matrixLatex([[s, -q], [-r, p]])} = ${matrixLatex(inv2)}$$`);
    return inv2;
  }

  steps.push(`##Determinant\n$$\\det(A) = ${fmtCell(d)}$$`);
  if (Math.abs(d) < 1e-10) {
    steps.push(`##No Inverse\nSince $\\det(A) = 0$, this matrix is singular — it has no inverse.`);
    return null;
  }
  steps.push(`##Method: Gauss-Jordan Elimination\n$\\det(A)\\neq0$, so an inverse exists. Augment $A$ with the identity, row-reduce the left half to identity — the right half becomes $A^{-1}$.`);

  const aug = a.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  steps.push(`##Augment with the Identity Matrix\n$$${augmentedLatex(aug, n)}$$`);

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(aug[r][col]) > Math.abs(aug[pivotRow][col])) pivotRow = r;
    if (Math.abs(aug[pivotRow][col]) < 1e-12) continue;

    if (pivotRow !== col) {
      [aug[col], aug[pivotRow]] = [aug[pivotRow], aug[col]];
      steps.push(`##Swap Rows\n$R_{${col + 1}} \\leftrightarrow R_{${pivotRow + 1}}$:\n$$${augmentedLatex(aug, n)}$$`);
    }
    const pivot = aug[col][col];
    if (Math.abs(pivot - 1) > 1e-10) {
      aug[col] = aug[col].map((v) => v / pivot);
      steps.push(`##Scale the Pivot Row\n$$R_{${col + 1}} \\to \\frac{1}{${fmtCell(pivot)}}R_{${col + 1}}$$\n$$${augmentedLatex(aug, n)}$$`);
    }
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = aug[r][col];
      if (Math.abs(factor) > 1e-12) {
        aug[r] = aug[r].map((v, c) => v - factor * aug[col][c]);
        steps.push(`##Clear Column ${col + 1} in Row ${r + 1}\n$$R_{${r + 1}} \\to R_{${r + 1}} - (${fmtCell(factor)})R_{${col + 1}}$$\n$$${augmentedLatex(aug, n)}$$`);
      }
    }
  }

  const result = aug.map((row) => row.slice(n).map((v) => (Math.abs(v) < 1e-10 ? 0 : v)));
  steps.push(`##Result\nThe left half is now the identity matrix — the right half is $A^{-1}$:\n$$A^{-1} = ${matrixLatex(result)}$$`);
  return result;
}

/** Gaussian elimination to Row Echelon Form, optionally continuing on to
 *  Reduced Row Echelon Form (clearing entries ABOVE each pivot too, not
 *  just below). */
function gaussianElim(matrix: number[][], toRREF: boolean): { ref: number[][]; steps: string[]; rank: number } {
  const rows = matrix.length;
  if (rows === 0) return { ref: [], steps: [], rank: 0 };
  const cols = matrix[0].length;
  const m = matrix.map(r => [...r]);
  const steps: string[] = [];
  steps.push(`##Start\nReduce to Row Echelon Form using Gaussian Elimination:\n$$${matrixLatex(matrix)}$$`);
  let pivotRow = 0;
  const pivotCols: number[] = [];

  for (let col = 0; col < cols && pivotRow < rows; col++) {
    let maxRow = pivotRow;
    for (let r = pivotRow + 1; r < rows; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[maxRow][col])) maxRow = r;
    }
    if (Math.abs(m[maxRow][col]) < 1e-10) continue;

    if (maxRow !== pivotRow) {
      [m[pivotRow], m[maxRow]] = [m[maxRow], m[pivotRow]];
      steps.push(`##Partial Pivoting\n$R_{${pivotRow + 1}} \\leftrightarrow R_{${maxRow + 1}}$ (swap to put the largest entry in the pivot position):\n$$${matrixLatex(m)}$$`);
    }

    const pivot = m[pivotRow][col];
    if (Math.abs(pivot - 1) > 1e-10) {
      const factor = 1 / pivot;
      m[pivotRow] = m[pivotRow].map(v => v * factor);
      steps.push(`##Scale Pivot Row\n$$R_{${pivotRow + 1}} \\to \\frac{1}{${toFractionLatex(pivot)}} R_{${pivotRow + 1}}$$\n$$${matrixLatex(m)}$$`);
    }

    for (let r = pivotRow + 1; r < rows; r++) {
      const factor = m[r][col];
      if (Math.abs(factor) > 1e-10) {
        m[r] = m[r].map((v, c) => v - factor * m[pivotRow][c]);
        steps.push(`##Eliminate Below the Pivot\n$$R_{${r + 1}} \\to R_{${r + 1}} - (${fmtCell(factor)})\\,R_{${pivotRow + 1}}$$\n$$${matrixLatex(m)}$$`);
      }
    }
    pivotCols.push(col);
    pivotRow++;
  }

  const rank = m.filter(row => row.some(v => Math.abs(v) > 1e-10)).length;

  if (toRREF && pivotCols.length > 0) {
    steps.push(`##Back-Substitution\nRow Echelon Form only clears BELOW each pivot; Reduced form also clears ABOVE each pivot, working from the last pivot back:`);
    for (let i = pivotCols.length - 1; i >= 0; i--) {
      const col = pivotCols[i];
      for (let r = 0; r < i; r++) {
        const factor = m[r][col];
        if (Math.abs(factor) > 1e-10) {
          m[r] = m[r].map((v, c) => v - factor * m[i][c]);
          steps.push(`##Clear Above Pivot ${i + 1}\n$$R_{${r + 1}} \\to R_{${r + 1}} - (${fmtCell(factor)})\\,R_{${i + 1}}$$\n$$${matrixLatex(m)}$$`);
        }
      }
    }
  }

  steps.push(`##${toRREF ? "Reduced Row Echelon Form" : "Rank"}\n${toRREF ? "Every pivot is $1$, with zeros both above and below it:" : "The rank is the number of non-zero rows remaining:"}\n$$${toRREF ? matrixLatex(m.map(row => row.map(v => Math.abs(v) < 1e-10 ? 0 : v))) : `\\text{rank} = ${rank}`}$$`);

  const ref = m.map(row => row.map(v => Math.abs(v) < 1e-10 ? 0 : v));
  return { ref, steps, rank };
}

/** A small grid of cell inputs replacing the old free-text textarea — no
 *  "press Enter for a new row" gesture needed at all (rows/cols are picked
 *  from dropdowns instead), which sidesteps the textarea/Enter-to-submit
 *  conflict entirely rather than trying to special-case it.
 *
 *  Arrow keys move between cells like a spreadsheet: Up/Down always jump a
 *  row (there's nothing else for them to do in a one-line input); Left/Right
 *  only jump a column once the caret is already at that edge of the cell's
 *  text, so normal in-cell caret movement still works while editing a
 *  multi-character value. Landing on a cell selects its contents so typing
 *  immediately replaces it, matching spreadsheet muscle memory.
 */
function MatrixGrid({ label, rows, cols, values, onCellChange }: {
  label: string;
  rows: number;
  cols: number;
  values: string[][];
  onCellChange: (r: number, c: number, value: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  const focusCell = (r: number, c: number) => {
    const el = containerRef.current?.querySelector<HTMLInputElement>(`input[data-r="${r}"][data-c="${c}"]`);
    if (el) {
      el.focus();
      el.select();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, r: number, c: number) => {
    const el = e.currentTarget;
    switch (e.key) {
      case "ArrowUp":
        e.preventDefault();
        focusCell(Math.max(0, r - 1), c);
        break;
      case "ArrowDown":
      case "Enter":
        e.preventDefault();
        focusCell(Math.min(rows - 1, r + 1), c);
        break;
      case "ArrowLeft":
        if (el.selectionStart === 0 && el.selectionEnd === 0) {
          e.preventDefault();
          focusCell(r, Math.max(0, c - 1));
        }
        break;
      case "ArrowRight":
        if (el.selectionStart === el.value.length && el.selectionEnd === el.value.length) {
          e.preventDefault();
          focusCell(r, Math.min(cols - 1, c + 1));
        }
        break;
    }
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label} ({rows}×{cols})</Label>
      <div
        ref={containerRef}
        className="inline-grid gap-1 p-2 rounded-md border border-input bg-background"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(2.5rem, 1fr))` }}
      >
        {Array.from({ length: rows }).flatMap((_, r) =>
          Array.from({ length: cols }).map((_, c) => (
            <input
              key={`${r}-${c}`}
              data-r={r}
              data-c={c}
              value={values[r]?.[c] ?? ""}
              onChange={(e) => onCellChange(r, c, e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, r, c)}
              inputMode="decimal"
              className="w-full h-9 rounded border border-border bg-muted/30 text-center font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          ))
        )}
      </div>
    </div>
  );
}

export function MatrixCalculator() {
  const settings = useSettings();
  const [op, setOp] = useState<Op>("multiply");

  const [rowsA, setRowsA] = useState(2);
  const [colsA, setColsA] = useState(2);
  const [gridA, setGridA] = useState<string[][]>([["1", "2"], ["3", "4"]]);

  const [rowsB, setRowsB] = useState(2);
  const [colsB, setColsB] = useState(2);
  const [gridB, setGridB] = useState<string[][]>([["5", "6"], ["7", "8"]]);

  const [vecB, setVecB] = useState<string[]>(["5", "11"]);

  const [result, setResult] = useState<string | null>(null);
  const [resultMatrix, setResultMatrix] = useState<number[][] | null>(null);
  const [steps, setSteps] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showSteps, setShowSteps] = useState(settings.showSteps);

  useEffect(() => setShowSteps(settings.showSteps), [settings.showSteps]);

  const needsB = op === "add" || op === "subtract" || op === "multiply";
  const needsVec = op === "cramer";

  const changeRowsA = (n: number) => { setRowsA(n); setGridA((g) => resizeGrid(g, n, colsA)); if (needsVec) setVecB((v) => Array.from({ length: n }, (_, i) => v[i] ?? "0")); };
  const changeColsA = (n: number) => { setColsA(n); setGridA((g) => resizeGrid(g, rowsA, n)); };
  const changeRowsB = (n: number) => { setRowsB(n); setGridB((g) => resizeGrid(g, n, colsB)); };
  const changeColsB = (n: number) => { setColsB(n); setGridB((g) => resizeGrid(g, rowsB, n)); };

  const setCellA = (r: number, c: number, v: string) => setGridA((g) => g.map((row, ri) => ri === r ? row.map((cell, ci) => ci === c ? v : cell) : row));
  const setCellB = (r: number, c: number, v: string) => setGridB((g) => g.map((row, ri) => ri === r ? row.map((cell, ci) => ci === c ? v : cell) : row));
  const setVecCell = (i: number, v: string) => setVecB((vec) => vec.map((cell, ci) => ci === i ? v : cell));

  const calculate = useCallback(() => {
    try {
      setError(null);
      setSteps([]);
      setResultMatrix(null);
      const a = parseGrid(gridA, "Matrix A");

      if (op === "determinant") {
        if (rowsA !== colsA) throw new Error("The determinant is only defined for a square matrix (same number of rows and columns).");
        const stepList: string[] = [`##Given\n$$A = ${matrixLatex(a)}$$`];
        const d = determinantWithSteps(a, stepList);
        setSteps(stepList);
        setResult(`Determinant = ${toFraction(Math.abs(d) < 1e-10 ? 0 : d, 1000)}`);
        return;
      }
      if (op === "inverse") {
        if (rowsA !== colsA) throw new Error("Only a square matrix can have an inverse.");
        const stepList: string[] = [`##Given\n$$A = ${matrixLatex(a)}$$`];
        const r = inverseWithSteps(a, settings, stepList);
        setSteps(stepList);
        if (!r) { setResult("No inverse (singular matrix)"); return; }
        setResult(formatMatrix(r));
        setResultMatrix(r);
        return;
      }
      if (op === "transpose") {
        const r = transpose(a) as number[][];
        const exampleSwaps = rowsA > 1 && colsA > 1
          ? `\nFor example, entry $(1,2)=${fmtCell(a[0][1])}$ becomes entry $(2,1)$ in $A^T$, and entry $(2,1)=${fmtCell(a[1][0])}$ becomes entry $(1,2)$.`
          : "";
        setSteps([`##Given\n$$A = ${matrixLatex(a)}$$`, `##Transpose\nFlip rows and columns — row $i$, column $j$ of $A$ becomes row $j$, column $i$ of $A^T$.${exampleSwaps}\n$$A^T = ${matrixLatex(r)}$$`]);
        setResult(formatMatrix(r));
        setResultMatrix(r);
        return;
      }
      if (op === "rank") {
        const { rank, ref, steps: refSteps } = gaussianElim(a, false);
        setSteps(refSteps);
        setResult(`Rank = ${rank}\n\nRow Echelon Form:\n${formatMatrix(ref)}`);
        setResultMatrix(ref);
        return;
      }
      if (op === "ref") {
        const { ref, steps: refSteps } = gaussianElim(a, false);
        setSteps(refSteps);
        setResult(formatMatrix(ref));
        setResultMatrix(ref);
        return;
      }
      if (op === "rref") {
        const { ref, steps: refSteps } = gaussianElim(a, true);
        setSteps(refSteps);
        setResult(formatMatrix(ref));
        setResultMatrix(ref);
        return;
      }
      if (op === "cramer") {
        if (rowsA !== colsA) throw new Error("Cramer's rule needs a square coefficient matrix A.");
        const n = a.length;
        const bv = vecB.map((v) => parseFloat(v));
        if (bv.some((v) => Number.isNaN(v))) throw new Error("Vector b has an empty or invalid entry.");
        if (bv.length !== n) throw new Error(`Vector b must have ${n} entries to match A's ${n} rows.`);

        const D = mathDet(a) as number;
        const stepList: string[] = [];
        stepList.push(`##System\n$$A\\vec{x} = \\vec{b}, \\qquad ${n} \\text{ unknowns}$$`);
        stepList.push(`##Step 1 — Determinant of A\n$$D = \\det(A) = ${toFractionLatex(D)}$$`);
        if (Math.abs(D) < 1e-12) {
          stepList.push(`##Singular System\n$D = 0$ — the system has no unique solution.`);
          setSteps(stepList);
          setResult("No unique solution");
          return;
        }

        const xs: number[] = [];
        for (let i = 0; i < n; i++) {
          const Ai = a.map((row, r) => row.map((v, c) => (c === i ? bv[r] : v)));
          const Di = mathDet(Ai) as number;
          const xi = Di / D;
          stepList.push(`##Step ${i + 2} — Solve for $x_{${i + 1}}$\nReplace column ${i + 1} of $A$ with $\\vec{b}$ to form $A_{${i + 1}}$:\n$$${matrixLatex(Ai)}$$\n$$\\det(A_{${i + 1}}) = ${toFractionLatex(Di)}, \\qquad x_{${i + 1}} = \\frac{\\det(A_{${i + 1}})}{D} = ${toFractionLatex(xi)}$$`);
          xs.push(xi);
        }

        setSteps(stepList);
        setResult(xs.map((x, i) => `x${i + 1} = ${toFraction(Math.abs(x) < 1e-10 ? 0 : x, 1000)}`).join("\n"));
        return;
      }

      const b = parseGrid(gridB, "Matrix B");

      if ((op === "add" || op === "subtract") && (rowsA !== rowsB || colsA !== colsB)) {
        throw new Error(`A and B must be the same size to ${op === "add" ? "add" : "subtract"} them — A is ${rowsA}×${colsA}, B is ${rowsB}×${colsB}.`);
      }
      if (op === "multiply" && colsA !== rowsB) {
        throw new Error(`To multiply A×B, A's column count must match B's row count — A is ${rowsA}×${colsA}, B is ${rowsB}×${colsB}.`);
      }

      let r: number[][] | Matrix;
      const stepList: string[] = [`##Given\n$$A = ${matrixLatex(a)}, \\qquad B = ${matrixLatex(b)}$$`];

      if (op === "add" || op === "subtract") {
        const opSym = op === "add" ? "+" : "-";
        r = (op === "add" ? add(a, b) : subtract(a, b)) as number[][];
        // Show the whole "expression matrix" bracketed — every cell as its
        // own substituted expression — THEN the collapsed numeric matrix,
        // instead of listing each row's arithmetic as separate flat lines.
        const exprRows = a.map((row, ri) => row.map((v, ci) => `${fmtCell(v)}${opSym}${fmtCell(b[ri][ci])}`).join(" & "));
        const exprMatrix = `\\begin{bmatrix}${exprRows.join("\\\\")}\\end{bmatrix}`;
        stepList.push(`##${op === "add" ? "Add" : "Subtract"} Corresponding Entries\n${op === "add" ? "Add each entry of $A$ to the entry in the same position in $B$" : "Subtract each entry of $B$ from the entry in the same position in $A$"} — position by position:\n$$A${opSym}B = ${exprMatrix}$$`);
        stepList.push(`##Result\n$$A${opSym}B = ${matrixLatex(r)}$$`);
      } else {
        r = multiply(a, b);
        const rMat = r as number[][];
        stepList.push(`##Multiply — Row × Column\nEach entry of $A\\times B$ is the dot product of a row of $A$ with a column of $B$:\n$$(AB)_{ij} = \\sum_k A_{ik}B_{kj}$$`);
        // Show the whole "expression matrix" bracketed — every output cell
        // as its own dot-product expression — THEN the collapsed numeric
        // result matrix, instead of listing each row as separate equations.
        const exprRows: string[] = [];
        for (let i = 0; i < rowsA; i++) {
          const rowCells: string[] = [];
          for (let j = 0; j < colsB; j++) {
            rowCells.push(a[i].map((v, k) => `(${fmtCell(v)})(${fmtCell(b[k][j])})`).join("+"));
          }
          exprRows.push(rowCells.join(" & "));
        }
        stepList.push(`##Expand Each Entry\n$$A\\times B = \\begin{bmatrix}${exprRows.join("\\\\")}\\end{bmatrix}$$`);
        stepList.push(`##Result\n$$A\\times B = ${matrixLatex(rMat)}$$`);
      }

      setSteps(stepList);
      setResult(formatMatrix(r));
      setResultMatrix(Array.isArray(r) ? r : (r as { toArray(): number[][] }).toArray());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Invalid matrix");
      setResult(null);
      setResultMatrix(null);
    }
  }, [op, gridA, gridB, vecB, rowsA, colsA, rowsB, colsB, settings]);

  useAutoRun([op, gridA, gridB, vecB, rowsA, colsA, rowsB, colsB, settings.decimalPlaces, settings.numberForm], calculate, settings.autoCalculate);

  return (
    <div className="space-y-6">
      <Card className="border-border/50 shadow-lg border-l-[3px] border-l-primary/50 rounded-l-md">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Grid3X3 className="h-5 w-5 text-primary" />
            Matrix Calculator
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs">Operation</Label>
            <Select value={op} onValueChange={(v) => setOp(v as Op)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="add">A + B</SelectItem>
                <SelectItem value="subtract">A - B</SelectItem>
                <SelectItem value="multiply">A × B</SelectItem>
                <SelectItem value="determinant">det(A)</SelectItem>
                <SelectItem value="inverse">A⁻¹</SelectItem>
                <SelectItem value="transpose">Aᵀ</SelectItem>
                <SelectItem value="rank">Rank(A)</SelectItem>
                <SelectItem value="ref">Row Echelon Form (REF)</SelectItem>
                <SelectItem value="rref">Reduced Row Echelon Form (RREF)</SelectItem>
                <SelectItem value="cramer">Solve A·x = b (Cramer's rule)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className={`grid gap-4 ${needsB ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
            <div className="space-y-2">
              <div className="flex items-end gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">A rows</Label>
                  <Select value={rowsA.toString()} onValueChange={(v) => changeRowsA(parseInt(v))}>
                    <SelectTrigger className="w-16"><SelectValue /></SelectTrigger>
                    <SelectContent>{SIZES.map((n) => <SelectItem key={n} value={n.toString()}>{n}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <span className="pb-2 text-muted-foreground text-sm">×</span>
                <div className="space-y-1">
                  <Label className="text-xs">A cols</Label>
                  <Select value={colsA.toString()} onValueChange={(v) => changeColsA(parseInt(v))}>
                    <SelectTrigger className="w-16"><SelectValue /></SelectTrigger>
                    <SelectContent>{SIZES.map((n) => <SelectItem key={n} value={n.toString()}>{n}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <MatrixGrid label="Matrix A" rows={rowsA} cols={colsA} values={gridA} onCellChange={setCellA} />
            </div>

            {needsB && (
              <div className="space-y-2">
                <div className="flex items-end gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">B rows</Label>
                    <Select value={rowsB.toString()} onValueChange={(v) => changeRowsB(parseInt(v))}>
                      <SelectTrigger className="w-16"><SelectValue /></SelectTrigger>
                      <SelectContent>{SIZES.map((n) => <SelectItem key={n} value={n.toString()}>{n}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <span className="pb-2 text-muted-foreground text-sm">×</span>
                  <div className="space-y-1">
                    <Label className="text-xs">B cols</Label>
                    <Select value={colsB.toString()} onValueChange={(v) => changeColsB(parseInt(v))}>
                      <SelectTrigger className="w-16"><SelectValue /></SelectTrigger>
                      <SelectContent>{SIZES.map((n) => <SelectItem key={n} value={n.toString()}>{n}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <MatrixGrid label="Matrix B" rows={rowsB} cols={colsB} values={gridB} onCellChange={setCellB} />
              </div>
            )}
          </div>

          {needsVec && (
            <MatrixGrid
              label="Vector b"
              rows={rowsA}
              cols={1}
              values={vecB.map((v) => [v])}
              onCellChange={(r, _c, v) => setVecCell(r, v)}
            />
          )}

          <label className="flex items-center gap-2 text-sm">
            <Switch checked={showSteps} onCheckedChange={setShowSteps} />
            Step-by-step
          </label>

          {!settings.autoCalculate && (
            <Button onClick={calculate} className="w-full gap-2">
              <Grid3X3 className="h-4 w-4" /> Calculate
            </Button>
          )}
        </CardContent>
      </Card>

      {(result || error) && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <Card className="shadow-lg border-border/50">
          <CardContent className="pt-6 space-y-3">
            {error ? (
              <p className="text-destructive font-medium">{error}</p>
            ) : (
              <>
                {resultMatrix ? (
                  <div className="flex justify-center overflow-x-auto no-scrollbar bg-muted/50 rounded-lg p-4 max-w-full">
                    <MathTex latex={matrixLatex(resultMatrix)} display />
                  </div>
                ) : (
                  <pre className="font-mono text-sm whitespace-pre bg-muted/50 rounded-lg p-4">{result}</pre>
                )}
                <StepsReveal steps={steps} show={showSteps} resetKey={result ?? ""} />
              </>
            )}
          </CardContent>
        </Card>
        </motion.div>
      )}
    </div>
  );
}
