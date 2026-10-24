import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { parse as mjParse } from "mathjs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MathInput } from "./MathInput";
import { MathTex } from "./MathTex";
import { StepsReveal } from "./StepsReveal";
import { FunctionGraph, type PlotMarker } from "./FunctionGraph";
import { useSettings } from "@/contexts/SettingsContext";
import { useAutoRun } from "@/hooks/useAutoRun";
import { formatNumber } from "@/lib/number-format";
import { exprToLatex } from "@/lib/latex";
import { cleanExpression, cleanVariable, parseNumericInput } from "@/lib/expression-clean";
import { extractVariables } from "@/lib/math-solver";
import { solveLimit } from "@/lib/limit-solver";
import { solveAny, type EqResult } from "@/lib/equation-solver";
import { GitBranch, Plus, Trash2, CheckCircle2, XCircle, CircleDot } from "lucide-react";

// ── Data model ────────────────────────────────────────────────────────────────
export type CondOp = "<" | "<=" | ">" | ">=" | "=" | "!=" | "otherwise";

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

const OP_LABEL: Record<CondOp, string> = { "<": "<", "<=": "\u2264", ">": ">", ">=": "\u2265", "=": "=", "!=": "\u2260", otherwise: "otherwise" };
const OP_LATEX: Record<CondOp, string> = { "<": "<", "<=": "\\le", ">": ">", ">=": "\\ge", "=": "=", "!=": "\\ne", otherwise: "" };

// ── compiled evaluation (compiled once, reused thousands of times by the graph) ─
const compileCache = new Map<string, ((x: number) => number) | null>();
function compileFormula(formula: string, variable: string): (x: number) => number {
  const key = `${variable}\u0000${formula}`;
  let f = compileCache.get(key);
  if (f === undefined) {
    try {
      const code = mjParse(cleanExpression(formula.trim() || "0")).compile();
      const scope: Record<string, number> = {};
      f = (x: number) => {
        scope[variable] = x;
        try {
          const v = code.evaluate(scope);
          return typeof v === "number" ? v : NaN;
        } catch { return NaN; }
      };
    } catch { f = null; }
    if (compileCache.size > 400) compileCache.clear();
    compileCache.set(key, f);
  }
  return f ?? (() => NaN);
}

export function evalPieceAt(piece: Piece, variable: string, x: number): number | null {
  const v = compileFormula(piece.formula, variable)(x);
  return Number.isFinite(v) ? v : null;
}

function conditionHolds(op: CondOp, x: number, b: number): boolean {
  switch (op) {
    case "<": return x < b;
    case "<=": return x <= b;
    case ">": return x > b;
    case ">=": return x >= b;
    case "=": return x === b;
    case "!=": return x !== b;
    case "otherwise": return true;
  }
}

interface Prepared { piece: Piece; b: number }
function prepare(pieces: Piece[]): Prepared[] {
  return pieces.map((piece) => ({ piece, b: piece.op === "otherwise" ? NaN : parseNumericInput(piece.boundary) }));
}
function firstMatch(prep: Prepared[], x: number): Piece | null {
  for (const { piece, b } of prep) {
    if (piece.op === "otherwise") return piece;
    if (!Number.isFinite(b)) continue;
    if (conditionHolds(piece.op, x, b)) return piece;
  }
  return null;
}

/** The first piece (in list order) whose condition holds at x — standard
 *  piecewise-definition semantics, so an earlier piece can deliberately
 *  shadow a later catch-all. */
export function pieceForX(pieces: Piece[], x: number): Piece | null {
  return firstMatch(prepare(pieces), x);
}

/** f(x) for the whole piecewise function (NaN where no piece applies). */
export function makePiecewiseFn(pieces: Piece[], variable: string): (x: number) => number {
  const prep = prepare(pieces);
  return (x: number) => {
    const piece = firstMatch(prep, x);
    return piece ? compileFormula(piece.formula, variable)(x) : NaN;
  };
}

function boundaryLatex(p: Piece): string {
  const cleaned = cleanExpression(p.boundary.trim() || "0");
  return exprToLatex(cleaned || "0");
}

function pieceConditionLatex(p: Piece, variable: string): string {
  if (p.op === "otherwise") return "\\text{otherwise}";
  return `${variable} ${OP_LATEX[p.op]} ${boundaryLatex(p)}`;
}

/** Same condition, phrased for "governs x near ..." prose — avoids ever
 *  string-replacing inside already-built LaTeX. */
function pieceDomainPhraseLatex(p: Piece, variable: string): string {
  if (p.op === "otherwise") return `\\text{every other } ${variable}`;
  return `${variable} \\text{ near } ${OP_LATEX[p.op]} ${boundaryLatex(p)}`;
}

function pieceRowLatex(p: Piece, variable: string): string {
  const body = exprToLatex(cleanExpression(p.formula.trim() || "0") || "0");
  return `${body} & ${pieceConditionLatex(p, variable)}`;
}

export function fullPiecewiseLatex(pieces: Piece[], variable: string): string {
  const rows = pieces.map((p) => pieceRowLatex(p, variable)).join(" \\\\ ");
  return `\\def\\arraystretch{1.5}f(${variable}) = \\begin{cases} ${rows} \\end{cases}`;
}

/** Every boundary value used by a non-"otherwise" piece, deduplicated and
 *  sorted — the only places continuity can possibly break. */
export function getBreakpoints(pieces: Piece[]): number[] {
  const set = new Set<number>();
  for (const p of pieces) {
    if (p.op === "otherwise") continue;
    const b = parseNumericInput(p.boundary);
    if (Number.isFinite(b)) set.add(b);
  }
  return Array.from(set).sort((a, b) => a - b);
}

type Classification = "continuous" | "jump" | "removable" | "infinite" | "dne" | "none-nearby";

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
  const prep = prepare(pieces);
  const eps = 1e-6 * (1 + Math.abs(x));
  const leftPiece = firstMatch(prep, x - eps);
  const rightPiece = firstMatch(prep, x + eps);
  const atPiece = firstMatch(prep, x);
  const xLatex = Number.isFinite(x) ? exprToLatex(fmt(x)) : "x";
  const steps: string[] = [];
  const num = (v: number) => exprToLatex(fmt(v));

  type Side = { value: number | null; kind: "finite" | "infinite" | "dne" | "none"; tex: string };
  const sideLimit = (piece: Piece | null, side: "left" | "right"): Side => {
    const sg = side === "left" ? "-" : "+";
    if (!piece) {
      steps.push(`##${side === "left" ? "Left" : "Right"}-Hand Limit\n$$\\lim_{${variable}\\to ${xLatex}^${sg}} f(${variable}) = \\text{DNE}$$\nNo piece covers this side.`);
      return { value: null, kind: "none", tex: "\\text{DNE}" };
    }
    const r = solveLimit(piece.formula, variable, String(x), side, fmt);
    let out: Side;
    if (r.error) out = { value: null, kind: "dne", tex: "\\text{DNE}" };
    else if (r.kind === "finite") out = { value: r.numericValue ?? null, kind: "finite", tex: r.exactTex ?? num(r.numericValue as number) };
    else if (r.kind === "infinite") out = { value: r.limitValue ?? null, kind: "infinite", tex: (r.limitValue as number) > 0 ? "\\infty" : "-\\infty" };
    else out = { value: null, kind: "dne", tex: "\\text{DNE}" };
    steps.push(`##${side === "left" ? "Left" : "Right"}-Hand Limit\n$f(${variable}) = ${exprToLatex(cleanExpression(piece.formula))}$ for $${pieceDomainPhraseLatex(piece, variable)}$\n$$\\lim_{${variable}\\to ${xLatex}^${sg}} f(${variable}) = ${out.tex}$$`);
    return out;
  };
  const L = sideLimit(leftPiece, "left");
  const R = sideLimit(rightPiece, "right");

  let atValue: number | null = null;
  if (atPiece) {
    atValue = evalPieceAt(atPiece, variable, x);
    steps.push(`##Function Value\n$$f(${xLatex}) = ${atValue !== null ? num(atValue) : "\\text{undefined}"}$$`);
  } else {
    steps.push(`##Function Value\n$$f(${xLatex}) = \\text{undefined}$$\nNo piece includes $${variable} = ${xLatex}$.`);
  }

  let classification: Classification;
  let conclusion: string;
  const tol = (a: number, b: number) => 1e-6 * (1 + Math.abs(a) + Math.abs(b));

  if (L.kind === "none" || R.kind === "none") {
    classification = "none-nearby";
    conclusion = `One side has no piece — continuity is not defined at $${variable} = ${xLatex}$.`;
  } else if (L.kind === "infinite" || R.kind === "infinite") {
    classification = "infinite";
    conclusion = `$$\\lim_{${variable}\\to ${xLatex}^-} f = ${L.tex}, \\qquad \\lim_{${variable}\\to ${xLatex}^+} f = ${R.tex}$$\n**Infinite discontinuity** (vertical asymptote) at $${variable} = ${xLatex}$.`;
  } else if (L.kind === "dne" || R.kind === "dne") {
    classification = "dne";
    conclusion = `A one-sided limit does not exist here (the formula oscillates or isn't real-valued), so $f$ is **not continuous** at $${variable} = ${xLatex}$.`;
  } else if (Math.abs((L.value as number) - (R.value as number)) > tol(L.value as number, R.value as number)) {
    classification = "jump";
    conclusion = `$$${L.tex} \\ne ${R.tex}$$\n**Jump discontinuity** at $${variable} = ${xLatex}$ (jump of ${num((R.value as number) - (L.value as number))}).`;
  } else if (atValue === null || Math.abs(atValue - (L.value as number)) > tol(atValue, L.value as number)) {
    classification = "removable";
    conclusion = `$$\\lim_{${variable}\\to ${xLatex}} f(${variable}) = ${L.tex}, \\quad f(${xLatex}) = ${atValue === null ? "\\text{undefined}" : num(atValue)}$$\n**Removable discontinuity** at $${variable} = ${xLatex}$.`;
  } else {
    classification = "continuous";
    conclusion = `$$\\lim_{${variable}\\to ${xLatex}^-} f = \\lim_{${variable}\\to ${xLatex}^+} f = f(${xLatex}) = ${L.tex}$$\n**Continuous** at $${variable} = ${xLatex}$.`;
  }
  steps.push(`##Conclusion\n${conclusion}`);

  return {
    x, leftPiece, rightPiece, atPiece,
    leftLimit: L.kind === "finite" ? L.value : null,
    rightLimit: R.kind === "finite" ? R.value : null,
    atValue, classification, steps,
  };
}

/** Open/closed dots at each breakpoint: the limit from each side (hollow unless f actually takes it) and f(x) itself. */
export function markersFromAnalyses(analyses: BreakpointAnalysis[]): PlotMarker[] {
  const out: PlotMarker[] = [];
  for (const a of analyses) {
    const tol = (v: number) => 1e-6 * (1 + Math.abs(v));
    const holds = (y: number) => a.atValue !== null && Math.abs(a.atValue - y) <= tol(y);
    if (a.leftLimit !== null) out.push({ x: a.x, y: a.leftLimit, filled: holds(a.leftLimit) });
    if (a.rightLimit !== null && (a.leftLimit === null || Math.abs(a.rightLimit - a.leftLimit) > tol(a.rightLimit))) out.push({ x: a.x, y: a.rightLimit, filled: holds(a.rightLimit) });
    if (a.atValue !== null) {
      const matches = [a.leftLimit, a.rightLimit].some((y) => y !== null && Math.abs(a.atValue! - y) <= tol(y));
      if (!matches) out.push({ x: a.x, y: a.atValue, filled: true });
    }
  }
  return out;
}

const CLASSIFICATION_STYLE: Record<Classification, { label: string; className: string; Icon: typeof CheckCircle2 }> = {
  continuous: { label: "Continuous", className: "bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/30", Icon: CheckCircle2 },
  jump: { label: "Jump Discontinuity", className: "bg-destructive/15 text-destructive border-destructive/30", Icon: XCircle },
  removable: { label: "Removable Discontinuity", className: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30", Icon: CircleDot },
  infinite: { label: "Infinite Discontinuity", className: "bg-destructive/15 text-destructive border-destructive/30", Icon: XCircle },
  dne: { label: "Limit Doesn't Exist", className: "bg-destructive/15 text-destructive border-destructive/30", Icon: XCircle },
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
  const [graphRange, setGraphRange] = useState<{ lo: number; hi: number }>({ lo: -10, hi: 10 });
  const [showSteps, setShowSteps] = useState(settings.showSteps);
  const [constSolve, setConstSolve] = useState<{ unknowns: string[]; eqs: string[]; result: EqResult } | null>(null);

  useEffect(() => setShowSteps(settings.showSteps), [settings.showSteps]);

  const addPiece = () => setPieces((ps) => [...ps, newPiece("", "otherwise", "")]);
  const removePiece = (id: string) => setPieces((ps) => (ps.length > 1 ? ps.filter((p) => p.id !== id) : ps));
  const updatePiece = (id: string, patch: Partial<Piece>) =>
    setPieces((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const recompute = useCallback(() => {
    const breakpoints = getBreakpoints(pieces);
    // Unknown constants (a, k, b …) in the formulas → solve for the values that make f continuous
    const v = cleanVariable(variable);
    const unknowns = Array.from(new Set(pieces.flatMap((p) => (p.formula.trim() ? extractVariables(cleanExpression(p.formula)) : [])))).filter((n) => n !== v && n !== "e" && n !== "pi");
    if (unknowns.length > 0) {
      const prep = prepare(pieces);
      const eqs: string[] = [];
      for (const b of breakpoints) {
        const eps = 1e-6 * (1 + Math.abs(b));
        const lp = firstMatch(prep, b - eps), rp = firstMatch(prep, b + eps), ap = firstMatch(prep, b);
        const sub = (f: string) => `(${cleanExpression(f)})`.replace(new RegExp(`\\b${v}\\b`, "g"), `(${b})`);
        if (lp && rp && lp.id !== rp.id) eqs.push(`${sub(lp.formula)} = ${sub(rp.formula)}`);
        if (ap && lp && ap.id !== lp.id && ap.id !== rp?.id) eqs.push(`${sub(lp.formula)} = ${sub(ap.formula)}`);
      }
      setAnalyses([]);
      setConstSolve(eqs.length ? { unknowns, eqs, result: solveAny(eqs.join(", "), fmt) } : null);
      return;
    }
    setConstSolve(null);
    setAnalyses(breakpoints.map((x) => analyzeBreakpoint(pieces, variable, x, fmt)));

    let lo = -10, hi = 10;
    if (breakpoints.length > 0) {
      const spread = breakpoints[breakpoints.length - 1] - breakpoints[0];
      const pad = Math.max(4, spread * 0.8 + 2);
      lo = breakpoints[0] - pad;
      hi = breakpoints[breakpoints.length - 1] + pad;
    }
    setGraphRange({ lo, hi });
  }, [pieces, variable, fmt]);

  useAutoRun([pieces, variable, settings.numberForm, settings.decimalPlaces], recompute, settings.autoCalculate);

  const evalResult = useMemo(() => {
    const x = parseNumericInput(evalPoint);
    if (!Number.isFinite(x)) return null;
    const piece = pieceForX(pieces, x);
    if (!piece) return { piece: null, y: null, x };
    return { piece, y: evalPieceAt(piece, variable, x), x };
  }, [evalPoint, pieces, variable]);

  const plotFn = useMemo(() => makePiecewiseFn(pieces, variable), [pieces, variable]);
  const plotSeries = useMemo(() => [{ fn: plotFn, label: `f(${variable})` }], [plotFn, variable]);
  const plotMarkers = useMemo(() => markersFromAnalyses(analyses), [analyses]);
  const plotRange = useMemo<[number, number]>(() => [graphRange.lo, graphRange.hi], [graphRange]);

  const problemFor = (p: Piece): string | null => {
    const cleaned = cleanExpression(p.formula);
    if (p.formula.trim() === "") return null;
    try { mjParse(cleaned); } catch { return "I couldn't read this formula — check the brackets and operators."; }
    return null; // other letters (a, k …) are treated as unknown constants to solve for
  };

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
            <Input value={variable} onChange={(e) => setVariable(cleanVariable(e.target.value, "x"))} className="text-center font-mono" />
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
                    {problemFor(p) && <p className="text-[11px] text-destructive">{problemFor(p)}</p>}
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
                        <SelectItem value="=">{variable} {OP_LABEL["="]} a</SelectItem>
                        <SelectItem value="!=">{variable} {OP_LABEL["!="]} a</SelectItem>
                        <SelectItem value="otherwise">otherwise</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {p.op !== "otherwise" && (
                    <div className="w-20 space-y-1">
                      <Label className="text-[11px] text-muted-foreground">a =</Label>
                      <Input
                        value={p.boundary}
                        onChange={(e) => updatePiece(p.id, { boundary: e.target.value })}
                        className={`text-center font-mono h-9 ${p.boundary.trim() !== "" && !Number.isFinite(parseNumericInput(p.boundary)) ? "border-destructive focus-visible:ring-destructive" : ""}`}
                        placeholder="2, 1/2, pi"
                      />
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
          {pieces.some((p) => p.formula.trim() !== "" && !problemFor(p)) ? (
            <FunctionGraph series={plotSeries} variable={variable} xRange={plotRange} markers={plotMarkers} title={`f(${variable})`} downloadFilename="piecewise-function" />
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">Enter at least one valid piece to see its graph.</p>
          )}
        </CardContent>
      </Card>

      {constSolve && (
        <Card className="shadow-lg border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Constant{constSolve.unknowns.length > 1 ? "s" : ""} for Continuity: {constSolve.unknowns.join(", ")}</CardTitle>
            <p className="text-xs text-muted-foreground">Continuity at each breakpoint requires the pieces to meet — that gives the equation{constSolve.eqs.length > 1 ? "s" : ""} solved below.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {constSolve.result.error ? (
              <p className="text-sm text-destructive">{constSolve.result.error}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {constSolve.result.roots.map((r, i) => <Badge key={i} variant="secondary" className="font-mono text-sm">{r.includes("=") ? r : `${constSolve.unknowns[0]} = ${r}`}</Badge>)}
              </div>
            )}
            <StepsReveal steps={[`##Continuity Conditions\n$$\\begin{array}{l}${constSolve.eqs.map((e) => e.split(" = ").map((t) => exprToLatex(t)).join(" = ")).join("\\\\")}\\end{array}$$`, ...constSolve.result.steps]} show={showSteps} resetKey={constSolve.eqs.join("|")} title="Steps:" />
          </CardContent>
        </Card>
      )}

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
