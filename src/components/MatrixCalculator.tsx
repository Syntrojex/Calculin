import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Grid3X3 } from "lucide-react";
import { multiply, det, inv, add, subtract, transpose, Matrix } from "mathjs";
import { useSettings, type Settings } from "@/contexts/SettingsContext";
import { useAutoRun } from "@/hooks/useAutoRun";
import { StepsReveal } from "./StepsReveal";
import { formatNumber } from "@/lib/number-format";

type Op = "add" | "subtract" | "multiply" | "determinant" | "inverse" | "transpose" | "cramer" | "rank" | "ref";

function parseMatrix(text: string): number[][] {
  if (!text || !text.trim()) {
    throw new Error("Please enter matrix values.");
  }
  const rows = text.trim().split("\n").map(row =>
    row.trim().split(/[\s,]+/).filter(Boolean).map(Number)
  );
  for (const row of rows) {
    if (row.length === 0) {
      throw new Error("Remove any blank lines from the matrix.");
    }
    if (row.some(v => Number.isNaN(v))) {
      throw new Error("Matrix entries must be numbers.");
    }
  }
  return rows;
}

function formatMatrix(m: number[][] | Matrix, settings: Settings): string {
  const arr = Array.isArray(m) ? m : (m as { toArray(): number[][] }).toArray() as number[][];
  return arr
    .map(row =>
      row
        .map(v => {
          if (typeof v !== "number") return String(v);
          // Snap tiny floating-point noise (e.g. 1.9999999999999998) to 0/whole
          // before formatting, same convention used elsewhere in the app.
          const snapped = Math.abs(v) < 1e-10 ? 0 : v;
          return formatNumber(snapped, settings);
        })
        .join("\t")
    )
    .join("\n");
}

function gaussianElim(matrix: number[][]): { ref: number[][]; steps: string[]; rank: number } {
  const rows = matrix.length;
  if (rows === 0) return { ref: [], steps: [], rank: 0 };
  const cols = matrix[0].length;
  const m = matrix.map(r => [...r]); // deep copy
  const steps: string[] = [];
  steps.push("Start: Row Echelon Form using Gaussian Elimination");
  let pivotRow = 0;

  for (let col = 0; col < cols && pivotRow < rows; col++) {
    // Find pivot
    let maxRow = pivotRow;
    for (let r = pivotRow + 1; r < rows; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[maxRow][col])) maxRow = r;
    }
    if (Math.abs(m[maxRow][col]) < 1e-10) continue;

    if (maxRow !== pivotRow) {
      [m[pivotRow], m[maxRow]] = [m[maxRow], m[pivotRow]];
      steps.push(`R${pivotRow + 1} ↔ R${maxRow + 1}  (partial pivoting)`);
    }

    // Scale pivot row
    const pivot = m[pivotRow][col];
    if (Math.abs(pivot - 1) > 1e-10) {
      const factor = 1 / pivot;
      m[pivotRow] = m[pivotRow].map(v => v * factor);
      steps.push(`R${pivotRow + 1} → (1/${parseFloat(pivot.toFixed(4))}) × R${pivotRow + 1}`);
    }

    // Eliminate below
    for (let r = pivotRow + 1; r < rows; r++) {
      const factor = m[r][col];
      if (Math.abs(factor) > 1e-10) {
        m[r] = m[r].map((v, c) => v - factor * m[pivotRow][c]);
        const fStr = parseFloat(factor.toFixed(4));
        steps.push(`R${r + 1} → R${r + 1} - (${fStr})×R${pivotRow + 1}`);
      }
    }
    pivotRow++;
  }

  // Count non-zero rows for rank
  const rank = m.filter(row => row.some(v => Math.abs(v) > 1e-10)).length;
  steps.push(`Rank = number of non-zero rows = ${rank}`);

  // Clean near-zeros
  const ref = m.map(row => row.map(v => Math.abs(v) < 1e-10 ? 0 : parseFloat(v.toFixed(6))));
  return { ref, steps, rank };
}

export function MatrixCalculator() {
  const settings = useSettings();
  const [matA, setMatA] = useState("1 2\n3 4");
  const [matB, setMatB] = useState("5 6\n7 8");
  const [vecB, setVecB] = useState("5\n11");
  const [op, setOp] = useState<Op>("multiply");
  const [result, setResult] = useState<string | null>(null);
  const [steps, setSteps] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showSteps, setShowSteps] = useState(settings.showSteps);

  useEffect(() => setShowSteps(settings.showSteps), [settings.showSteps]);

  const needsB = op === "add" || op === "subtract" || op === "multiply";
  const needsVec = op === "cramer";

  const calculate = () => {
    try {
      setError(null);
      setSteps([]);
      const a = parseMatrix(matA);

      if (op === "determinant") {
        const d = det(a) as number;
        const snapped = Math.abs(d) < 1e-10 ? 0 : d;
        setResult(`Determinant = ${formatNumber(snapped, settings)}`);
        return;
      }
      if (op === "inverse") {
        const r = inv(a) as number[][];
        setResult(formatMatrix(r, settings));
        return;
      }
      if (op === "transpose") {
        const r = transpose(a) as number[][];
        setResult(formatMatrix(r, settings));
        return;
      }
      if (op === "rank") {
        const { rank, ref, steps: refSteps } = gaussianElim(a);
        setSteps(refSteps);
        setResult(`Rank = ${rank}\n\nRow Echelon Form:\n${formatMatrix(ref, settings)}`);
        return;
      }
      if (op === "ref") {
        const { ref, steps: refSteps } = gaussianElim(a);
        setSteps(refSteps);
        setResult(formatMatrix(ref, settings));
        return;
      }
      if (op === "cramer") {
        const n = a.length;
        if (a.some(row => row.length !== n)) throw new Error("A must be square");
        const bv = parseMatrix(vecB).flat();
        if (bv.length !== n) throw new Error(`Vector b must have ${n} entries`);

        const D = det(a) as number;
        const stepList: string[] = [];
        stepList.push(`System: A·x = b with ${n} unknowns`);
        stepList.push(`Step 1: Compute D = det(A) = ${formatNumber(Math.round(D * 10000) / 10000, settings)}`);
        if (Math.abs(D) < 1e-12) {
          stepList.push(`D = 0 → System has no unique solution (singular)`);
          setSteps(stepList);
          setResult("No unique solution");
          return;
        }

        const xs: number[] = [];
        for (let i = 0; i < n; i++) {
          const Ai = a.map((row, r) => row.map((v, c) => (c === i ? bv[r] : v)));
          const Di = det(Ai) as number;
          const xi = Di / D;
          stepList.push(`Step ${i + 2}: Replace column ${i + 1} of A with b → A${i + 1}`);
          stepList.push(`  det(A${i + 1}) = ${formatNumber(Math.round(Di * 10000) / 10000, settings)}`);
          stepList.push(`  x${i + 1} = det(A${i + 1}) / D = ${formatNumber(Math.round(xi * 10000) / 10000, settings)}`);
          xs.push(xi);
        }

        setSteps(stepList);
        setResult(xs.map((x, i) => `x${i + 1} = ${formatNumber(Math.abs(x) < 1e-10 ? 0 : x, settings)}`).join("\n"));
        return;
      }

      const b = parseMatrix(matB);
      let r: number[][] | Matrix;
      if (op === "add") r = add(a, b) as number[][];
      else if (op === "subtract") r = subtract(a, b) as number[][];
      else r = multiply(a, b);

      setResult(formatMatrix(r as number[][] | Matrix, settings));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Invalid matrix");
      setResult(null);
    }
  };

  useAutoRun([op, matA, matB, vecB, settings.decimalPlaces, settings.numberForm], calculate, settings.autoCalculate);

  return (
    <div className="space-y-6">
      <Card className="border-border/50 shadow-lg">
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
                <SelectItem value="rank">Rank(A) + REF</SelectItem>
                <SelectItem value="ref">Row Echelon Form (REF)</SelectItem>
                <SelectItem value="cramer">Solve A·x = b (Cramer's rule)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className={`grid gap-4 ${needsB ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
            <div className="space-y-1">
              <Label className="text-xs">Matrix A (rows on new lines, values space-separated)</Label>
              <textarea
                value={matA}
                onChange={(e) => setMatA(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono min-h-[80px] focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder={"1 2\n3 4"}
              />
            </div>
            {needsB && (
              <div className="space-y-1">
                <Label className="text-xs">Matrix B</Label>
                <textarea
                  value={matB}
                  onChange={(e) => setMatB(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono min-h-[80px] focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder={"5 6\n7 8"}
                />
              </div>
            )}
          </div>

          {needsVec && (
            <div className="space-y-1">
              <Label className="text-xs">Vector b (one value per line)</Label>
              <textarea
                value={vecB}
                onChange={(e) => setVecB(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono min-h-[80px] focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder={"5\n11"}
              />
            </div>
          )}

          {(op === "rank" || op === "ref" || op === "cramer") && (
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={showSteps} onCheckedChange={setShowSteps} />
              Step-by-step
            </label>
          )}

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
                <pre className="font-mono text-sm whitespace-pre bg-muted/50 rounded-lg p-4">{result}</pre>
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
