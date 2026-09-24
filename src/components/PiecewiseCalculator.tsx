import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { evaluate } from "mathjs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MathInput } from "./MathInput";
import { MathTex } from "./MathTex";
import { StepsReveal } from "./StepsReveal";
import { GraphCanvas, type GraphSeries } from "./GraphCanvas";
import { useSettings } from "@/contexts/SettingsContext";
import { useAutoRun } from "@/hooks/useAutoRun";
import { formatNumber } from "@/lib/number-format";
import { exprToLatex } from "@/lib/latex";
import { normalizeMathInput } from "@/lib/text-normalize";
import { computeLimit } from "./LimitsCalculator";
import { GitBranch, Plus, Trash2, CheckCircle2, XCircle, CircleDot } from "lucide-react";

// ── Data model ────────────────────────────────────────────────────────────────
export type CondOp = "<" | "<=" | ">" | ">=" | "otherwise";

export interface Piece {
  id: string;
  formula: string;
  op: CondOp;
  boundary: string;
}

let pieceIdSeq = 0;
export function newPiece(formula: string, op: CondOp, boundary: string): Piece {
  return { id: `p${pieceIdSeq++}`, formula, op, boundary };
}

const OP_LABEL: Record<CondOp, string> = { "<": "<", "<=": "\u2264", ">": ">", ">=": "\u2265", otherwise: "otherwise" };
const OP_LATEX: Record<CondOp, string> = { "<": "<", "<=": "\\le", ">": ">", ">=": "\\ge", otherwise: "" };

export function evalPieceAt(piece: Piece, variable: string, x: number): number | null {
  try {
    const v = evaluate(normalizeMathInput(piece.formula || "0"), { [variable]: x });
    return typeof v === "number" && isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

function conditionHolds(piece: Piece, x: number, boundary: number): boolean {
  switch (piece.op) {
    case "<": return x < boundary;
    case "<=": return x <= boundary;
    case ">": return x > boundary;
    case ">=": return x >= boundary;
    case "otherwise": return true;
  }
}

/** The first piece (in list order) whose condition holds at x — standard
 *  piecewise-definition semantics, so an earlier piece can deliberately
 *  shadow a later catch-all. */
export function pieceForX(pieces: Piece[], x: number): Piece | null {
  for (const p of pieces) {
    if (p.op === "otherwise") return p;
    const b = parseFloat(p.boundary);
    if (!isFinite(b)) continue;
    if (conditionHolds(p, x, b)) return p;
  }
  return null;
}

function pieceConditionLatex(p: Piece, variable: string): string {
  if (p.op === "otherwise") return "\\text{otherwise}";
  const b = p.boundary.trim() || "0";
  return `${variable} ${OP_LATEX[p.op]} ${exprToLatex(normalizeMathInput(b))}`;
}

/** Same condition, phrased for "governs x near ..." prose — avoids ever
 *  string-replacing inside already-built LaTeX (a naive replace of the
 *  variable name, e.g. "x", also matches the "x" inside "\text{...}" and
 *  corrupts the command). */
function pieceDomainPhraseLatex(p: Piece, variable: string): string {
  if (p.op === "otherwise") return `\\text{every other } ${variable}`;
  const b = p.boundary.trim() || "0";
  return `${variable} \\text{ near } ${OP_LATEX[p.op]} ${exprToLatex(normalizeMathInput(b))}`;
}

function pieceRowLatex(p: Piece, variable: string): string {
  const body = exprToLatex(normalizeMathInput(p.formula.trim() || "0"));
  return `${body} & ${pieceConditionLatex(p, variable)}`;
}

export function fullPiecewiseLatex(pieces: Piece[], variable: string): string {
  const rows = pieces.map((p) => pieceRowLatex(p, variable)).join(" \\\\ ");
  // A piece's own formula can contain a fraction (e.g. "1/x"), which needs
  // extra row height so it doesn't crowd into the row above/below it.
  return `\\def\\arraystretch{1.5}f(${variable}) = \\begin{cases} ${rows} \\end{cases}`;
}

/** Every boundary value used by a non-"otherwise" piece, deduplicated and
 *  sorted — these are the only points where continuity could possibly break,
 *  since every piece is smooth/continuous on the *interior* of its own
 *  domain (it's a single ordinary formula there). */
export function getBreakpoints(pieces: Piece[]): number[] {
  const set = new Set<number>();
  for (const p of pieces) {
    if (p.op === "otherwise") continue;
    const b = parseFloat(p.boundary);
    if (isFinite(b)) set.add(b);
  }
  return Array.from(set).sort((a, b) => a - b);
}

type Classification = "continuous" | "jump" | "removable" | "none-nearby";

interface BreakpointAnalysis {
  x: number;
  leftPiece: Piece | null;
  rightPiece: Piece | null;
  atPiece: Piece | null;
  leftLimit: number | null;
  rightLimit: number | null;
  atValue: number | null;
  classification: Classification;
  steps: string[];
}

export function analyzeBreakpoint(pieces: Piece[], variable: string, x: number, fmt: (n: number) => string): BreakpointAnalysis {
  const eps = 1e-6;
  const leftPiece = pieceForX(pieces, x - eps);
  const rightPiece = pieceForX(pieces, x + eps);
  const atPiece = pieceForX(pieces, x);
  const xLatex = exprToLatex(fmt(x));
  const steps: string[] = [];

  let leftLimit: number | null = null;
  if (leftPiece) {
    leftLimit = computeLimit(leftPiece.formula, variable, x.toString(), "left", fmt).numericValue ?? null;
    steps.push(`##Left-Hand Limit\nUsing $f(${variable}) = ${exprToLatex(normalizeMathInput(leftPiece.formula))}$, which governs $${pieceDomainPhraseLatex(leftPiece, variable)}$:\n$$\\lim_{${variable}\\to ${xLatex}^-} f(${variable}) = ${leftLimit !== null ? exprToLatex(fmt(leftLimit)) : "\\text{DNE}"}$$`);
  } else {
    steps.push(`##Left-Hand Limit\nNo piece is defined just left of $${variable} = ${xLatex}$.`);
  }

  let rightLimit: number | null = null;
  if (rightPiece) {
    rightLimit = computeLimit(rightPiece.formula, variable, x.toString(), "right", fmt).numericValue ?? null;
    steps.push(`##Right-Hand Limit\nUsing $f(${variable}) = ${exprToLatex(normalizeMathInput(rightPiece.formula))}$, which governs $${pieceDomainPhraseLatex(rightPiece, variable)}$:\n$$\\lim_{${variable}\\to ${xLatex}^+} f(${variable}) = ${rightLimit !== null ? exprToLatex(fmt(rightLimit)) : "\\text{DNE}"}$$`);
  } else {
    steps.push(`##Right-Hand Limit\nNo piece is defined just right of $${variable} = ${xLatex}$.`);
  }

  let atValue: number | null = null;
  if (atPiece) {
    atValue = evalPieceAt(atPiece, variable, x);
    steps.push(`##Function Value\n$$f(${xLatex}) = ${atValue !== null ? exprToLatex(fmt(atValue)) : "\\text{undefined}"}$$`);
  } else {
    steps.push(`##Function Value\n$f(${xLatex})$ is undefined \u2014 no piece's condition includes $${variable} = ${xLatex}$.`);
  }

  const limitsAgree = leftLimit !== null && rightLimit !== null && Math.abs(leftLimit - rightLimit) < 1e-4;
  let classification: Classification;
  let conclusion: string;

  if (leftLimit === null || rightLimit === null) {
    classification = "none-nearby";
    conclusion = `A one-sided limit doesn't apply here (no piece covers that side), so continuity isn't defined at $${variable} = ${xLatex}$ either.`;
  } else if (!limitsAgree) {
    classification = "jump";
    conclusion = `Left limit $${exprToLatex(fmt(leftLimit))} \\ne$ right limit $${exprToLatex(fmt(rightLimit))}$ \u2014 **jump discontinuity** at $${variable} = ${xLatex}$.`;
  } else if (atValue === null || Math.abs(atValue - leftLimit) > 1e-4) {
    classification = "removable";
    conclusion = `Both one-sided limits agree at $${exprToLatex(fmt(leftLimit))}$, but $f(${xLatex})$ ${atValue === null ? "is undefined" : `= ${exprToLatex(fmt(atValue))}$ doesn't match`} \u2014 **removable discontinuity**.`;
  } else {
    classification = "continuous";
    conclusion = `Left limit, right limit, and $f(${xLatex})$ all equal $${exprToLatex(fmt(leftLimit))}$ \u2014 **continuous** at $${variable} = ${xLatex}$.`;
  }
  steps.push(`##Conclusion\n${conclusion}`);

  return { x, leftPiece, rightPiece, atPiece, leftLimit, rightLimit, atValue, classification, steps };
}

// ── Graph building ───────────────────────────────────────────────────────────
export function buildPiecewiseSeries(pieces: Piece[], variable: string, xMin: number, xMax: number, samples = 500): GraphSeries[] {
  const segments: { x: number; y: number }[][] = [];
  let current: { x: number; y: number }[] = [];
  let currentId: string | null = null;

  for (let i = 0; i <= samples; i++) {
    const x = xMin + ((xMax - xMin) * i) / samples;
    const piece = pieceForX(pieces, x);
    const y = piece ? evalPieceAt(piece, variable, x) : null;
    if (!piece || y === null) {
      if (current.length > 1) segments.push(current);
      current = [];
      currentId = null;
      continue;
    }
    if (piece.id !== currentId && current.length > 1) {
      segments.push(current);
      current = [];
    }
    currentId = piece.id;
    current.push({ x, y });
  }
  if (current.length > 1) segments.push(current);

  return segments.map((points, i) => ({ expr: `piece ${i + 1}`, points, color: "#6366f1" }));
}

export function buildBreakpointMarkers(pieces: Piece[], variable: string, breakpoints: number[]): { x: number; y: number; filled?: boolean }[] {
  const markers: { x: number; y: number; filled?: boolean }[] = [];
  const eps = 1e-6;
  for (const x of breakpoints) {
    const leftPiece = pieceForX(pieces, x - eps);
    const rightPiece = pieceForX(pieces, x + eps);
    const atPiece = pieceForX(pieces, x);

    if (leftPiece) {
      const y = evalPieceAt(leftPiece, variable, x);
      if (y !== null) markers.push({ x, y, filled: atPiece?.id === leftPiece.id });
    }
    if (rightPiece && rightPiece.id !== leftPiece?.id) {
      const y = evalPieceAt(rightPiece, variable, x);
      if (y !== null) markers.push({ x, y, filled: atPiece?.id === rightPiece.id });
    }
  }
  return markers;
}

const CLASSIFICATION_STYLE: Record<Classification, { label: string; className: string; Icon: typeof CheckCircle2 }> = {
  continuous: { label: "Continuous", className: "bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/30", Icon: CheckCircle2 },
  jump: { label: "Jump Discontinuity", className: "bg-destructive/15 text-destructive border-destructive/30", Icon: XCircle },
  removable: { label: "Removable Discontinuity", className: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30", Icon: CircleDot },
  "none-nearby": { label: "Not Defined Nearby", className: "bg-muted text-muted-foreground border-border", Icon: XCircle },
};

function fmtCond(op: CondOp): string {
  return OP_LABEL[op];
}

// ── Component ────────────────────────────────────────────────────────────────
export function PiecewiseCalculator() {
  const settings = useSettings();
  const fmt = useCallback((n: number) => formatNumber(n, settings), [settings]);

  const [variable, setVariable] = useState("x");
  const [pieces, setPieces] = useState<Piece[]>(() => [
    newPiece("x^2", "<", "2"),
    newPiece("3x-1", ">=", "2"),
  ]);
  const [evalPoint, setEvalPoint] = useState("2");
  const [analyses, setAnalyses] = useState<BreakpointAnalysis[]>([]);
  const [series, setSeries] = useState<GraphSeries[]>([]);
  const [markers, setMarkers] = useState<{ x: number; y: number; filled?: boolean }[]>([]);
  const [graphRange, setGraphRange] = useState<{ lo: number; hi: number }>({ lo: -10, hi: 10 });
  const [showSteps, setShowSteps] = useState(settings.showSteps);

  useEffect(() => setShowSteps(settings.showSteps), [settings.showSteps]);

  const addPiece = () => setPieces((ps) => [...ps, newPiece("", "otherwise", "")]);
  const removePiece = (id: string) => setPieces((ps) => (ps.length > 1 ? ps.filter((p) => p.id !== id) : ps));
  const updatePiece = (id: string, patch: Partial<Piece>) =>
    setPieces((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const recompute = useCallback(() => {
    const breakpoints = getBreakpoints(pieces);
    setAnalyses(breakpoints.map((x) => analyzeBreakpoint(pieces, variable, x, fmt)));

    let lo = -10, hi = 10;
    if (breakpoints.length > 0) {
      const spread = breakpoints[breakpoints.length - 1] - breakpoints[0];
      const pad = Math.max(4, spread * 0.8 + 2);
      lo = breakpoints[0] - pad;
      hi = breakpoints[breakpoints.length - 1] + pad;
    }
    setGraphRange({ lo, hi });
    setSeries(buildPiecewiseSeries(pieces, variable, lo, hi));
    setMarkers(buildBreakpointMarkers(pieces, variable, breakpoints));
  }, [pieces, variable, fmt]);

  useAutoRun([pieces, variable, settings.numberForm, settings.decimalPlaces], recompute, settings.autoCalculate);

  const evalResult = useMemo(() => {
    const x = parseFloat(evalPoint);
    if (!isFinite(x)) return null;
    const piece = pieceForX(pieces, x);
    if (!piece) return { piece: null, y: null, x };
    return { piece, y: evalPieceAt(piece, variable, x), x };
  }, [evalPoint, pieces, variable]);

  return (
    <div className="space-y-6">
      <Card className="border-border/50 shadow-lg border-l-[3px] border-l-primary/50 rounded-l-md">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <GitBranch className="h-5 w-5 text-primary" />
            Piecewise Function &amp; Continuity
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Define each piece with its own condition, then check whether the function is continuous where the pieces meet.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="w-24 space-y-1">
            <Label className="text-xs">Variable</Label>
            <Input value={variable} onChange={(e) => setVariable(e.target.value || "x")} className="text-center font-mono" />
          </div>

          <div className="space-y-2.5">
            <AnimatePresence initial={false}>
              {pieces.map((p, i) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex flex-wrap items-end gap-2 p-2.5 rounded-lg bg-muted/30 border border-border/40"
                >
                  <div className="flex-1 min-w-[9rem] space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Piece {i + 1}: f({variable}) =</Label>
                    <MathInput value={p.formula} onChange={(v) => updatePiece(p.id, { formula: v })} placeholder="e.g. x^2" withKeypad={false} />
                  </div>
                  <div className="w-32 space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Condition</Label>
                    <Select value={p.op} onValueChange={(v) => updatePiece(p.id, { op: v as CondOp })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="<">{variable} {OP_LABEL["<"]} a</SelectItem>
                        <SelectItem value="<=">{variable} {OP_LABEL["<="]} a</SelectItem>
                        <SelectItem value=">">{variable} {OP_LABEL[">"]} a</SelectItem>
                        <SelectItem value=">=">{variable} {OP_LABEL[">="]} a</SelectItem>
                        <SelectItem value="otherwise">otherwise</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {p.op !== "otherwise" && (
                    <div className="w-20 space-y-1">
                      <Label className="text-[11px] text-muted-foreground">a =</Label>
                      <Input value={p.boundary} onChange={(e) => updatePiece(p.id, { boundary: e.target.value })} className="text-center font-mono h-9" />
                    </div>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => removePiece(p.id)} disabled={pieces.length <= 1} className="h-9 w-9 text-muted-foreground hover:text-destructive shrink-0">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </motion.div>
              ))}
            </AnimatePresence>
            <Button variant="outline" size="sm" onClick={addPiece} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Add Piece
            </Button>
          </div>

          <div className="p-3 rounded-lg bg-primary/5 border border-primary/10 overflow-x-auto no-scrollbar">
            <MathTex latex={fullPiecewiseLatex(pieces, variable)} display />
          </div>

          {!settings.autoCalculate && (
            <Button onClick={recompute} className="w-full gap-2">
              <GitBranch className="h-4 w-4" /> Analyze Continuity
            </Button>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-lg border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Evaluate at a Point</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">{variable} =</Label>
              <Input value={evalPoint} onChange={(e) => setEvalPoint(e.target.value)} className="text-center font-mono" />
            </div>
          </div>
          {evalResult && (
            evalResult.piece ? (
              <p className="text-sm">
                <span className="text-muted-foreground">Piece {pieces.findIndex((p) => p.id === evalResult.piece!.id) + 1} applies</span>
                {" "}(<code className="font-mono">{fmtCond(evalResult.piece.op)} {evalResult.piece.boundary}</code>) {"\u2192"}{" "}
                <Badge variant="secondary" className="font-mono">
                  f({fmt(evalResult.x)}) = {evalResult.y !== null ? fmt(evalResult.y) : "undefined"}
                </Badge>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">No piece's condition covers {variable} = {evalPoint} {"\u2014"} f is undefined there.</p>
            )
          )}
        </CardContent>
      </Card>

      <Card className="shadow-lg border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Graph</CardTitle>
          <p className="text-xs text-muted-foreground">A filled dot is part of the graph; a hollow ring is a value the curve approaches but doesn't reach.</p>
        </CardHeader>
        <CardContent>
          {series.length > 0 ? (
            <GraphCanvas series={series} xMin={graphRange.lo} xMax={graphRange.hi} markers={markers} title={`f(${variable})`} downloadFilename="piecewise-function" />
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">Enter at least one valid piece to see its graph.</p>
          )}
        </CardContent>
      </Card>

      {analyses.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Continuity at Each Breakpoint</h3>
            <Button variant="ghost" size="sm" onClick={() => setShowSteps((v) => !v)} className="text-xs">
              {showSteps ? "Hide" : "Show"} Steps
            </Button>
          </div>
          {analyses.map((a) => {
            const style = CLASSIFICATION_STYLE[a.classification];
            const Icon = style.Icon;
            return (
              <motion.div key={a.x} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
                <Card className="shadow-md border-border/50">
                  <CardContent className="pt-5 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="font-mono text-sm text-foreground">{variable} = {fmt(a.x)}</span>
                      <Badge variant="outline" className={`gap-1.5 ${style.className}`}>
                        <Icon className="h-3.5 w-3.5" /> {style.label}
                      </Badge>
                    </div>
                    <StepsReveal steps={a.steps} show={showSteps} resetKey={`${a.x}-${pieces.length}`} title="Steps:" />
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
