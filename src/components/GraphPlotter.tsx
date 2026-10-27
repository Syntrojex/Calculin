import { useState, useMemo, useEffect, useRef, Suspense, lazy } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { extractVariables } from "@/lib/math-solver";
import { FunctionGraph, type PlotMarker, type PlotCurve } from "./FunctionGraph";
import { findHoles } from "@/lib/graph-holes";
import { checkNumberField } from "@/lib/input-check";
import { classifyPlaneInput, compile1, compile2, buildImplicit, buildParametric, buildPolar, autoPolarRange, boundsOf, inequalityHolds, type PlaneSpec, type Pt } from "@/lib/plane-curves";
import { evaluate as mjEvaluate } from "mathjs";
import { makeEvaluator, findIntersections, validate2D, validateSurface, validateImplicitSurface } from "@/lib/graph-utils";
import { cleanExpression } from "@/lib/expression-clean";
import { useSettings } from "@/contexts/SettingsContext";
import { useAutoRun } from "@/hooks/useAutoRun";
import { formatNumber } from "@/lib/number-format";
import { LineChart, Plus, Trash2, Box, Crosshair, Maximize2, X, Sigma, Camera } from "lucide-react";
import { normalizeMathInput } from "@/lib/text-normalize";
import { downloadCanvasPNG } from "@/lib/canvas-export";
import { classify3D, buildShape, type Param3DSpec, type ShapeData } from "@/lib/param3d";

const Graph3D = lazy(() => import("./Graph3D").then(m => ({ default: m.Graph3D })));
const ImplicitSurface3D = lazy(() => import("./ImplicitSurface3D").then(m => ({ default: m.ImplicitSurface3D })));
const ParametricGraph3D = lazy(() => import("./ParametricGraph3D").then(m => ({ default: m.ParametricGraph3D })));

interface GraphEntry {
  id: number;
  expr: string;
  /** parameter range for parametric / polar curves (blank = automatic) */
  tLo?: string;
  tHi?: string;
}

const PLOT_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6"];

function parseNum(s: string | undefined): number | null {
  if (!s || !s.trim()) return null;
  try { const v = mjEvaluate(cleanExpression(s)); return typeof v === "number" && Number.isFinite(v) ? v : null; } catch { return null; }
}

/** Optional range field: blank = automatic; anything typed must be a real number. Returns an error message or null. */
function rangeFieldProblem(raw: string | undefined, label: string): string | null {
  if (!raw || !raw.trim()) return null;
  return checkNumberField(raw, label, (t) => mjEvaluate(cleanExpression(t))).error ?? null;
}

/** Turn a classified non-explicit spec into something FunctionGraph can draw. */
function makeCurve(spec: PlaneSpec, id: number, color: string, tLo?: string, tHi?: string): { curve?: PlotCurve; error?: string } {
  const cid = `${id}:${spec.kind}:${spec.label}:${tLo ?? ""}:${tHi ?? ""}`;
  if (spec.kind === "parametric" || spec.kind === "polar") {
    const nm = spec.kind === "polar" ? "θ" : spec.param ?? "t";
    const pLo = rangeFieldProblem(tLo, `the ${nm} range minimum`), pHi = rangeFieldProblem(tHi, `the ${nm} range maximum`);
    if (pLo || pHi) return { error: (pLo ?? pHi)! };
  }
  if (spec.kind === "implicit" || spec.kind === "inequality") {
    const F = compile2(spec.implicit!, ["x", "y"]);
    if (!F) return { error: "Couldn't read this equation." };
    const strict = spec.kind === "inequality" && (spec.op === "<" || spec.op === ">");
    return {
      curve: {
        id: cid, label: spec.label, color, dashed: strict,
        build: (v, q) => buildImplicit(F, v, q),
        fill: spec.kind === "inequality" ? inequalityHolds(F, spec.op!) : undefined,
      },
    };
  }
  if (spec.kind === "parametric") {
    const X = compile1(spec.fx!, spec.param!), Y = compile1(spec.fy!, spec.param!);
    if (!X || !Y) return { error: "Couldn't read this parametric curve." };
    const trig = /\b(sin|cos|tan|sec|csc|cot)\b/.test(spec.fx! + spec.fy!);
    let t0 = parseNum(tLo) ?? (trig ? 0 : -5), t1 = parseNum(tHi) ?? (trig ? 2 * Math.PI : 5);
    if (t1 < t0) [t0, t1] = [t1, t0];
    if (t1 - t0 < 1e-9) return { error: "The parameter range is empty — make the max larger than the min." };
    const segs = buildParametric(X, Y, t0, t1);
    if (!segs.length) return { error: "This curve has no real points for that parameter range." };
    return { curve: { id: cid, label: spec.label, color, build: (v) => buildParametric(X, Y, t0, t1, v), bounds: boundsOf(segs) ?? undefined } };
  }
  if (spec.kind === "polar") {
    const R = compile1(spec.fr!, spec.param!);
    if (!R) return { error: "Couldn't read this polar equation." };
    const [a0, a1] = autoPolarRange(R);
    let t0 = parseNum(tLo) ?? a0, t1 = parseNum(tHi) ?? a1;
    if (t1 < t0) [t0, t1] = [t1, t0];
    if (t1 - t0 < 1e-9) return { error: "The θ range is empty — make the max larger than the min." };
    const segs = buildPolar(R, t0, t1);
    if (!segs.length) return { error: "This polar curve has no real points for that θ range." };
    return { curve: { id: cid, label: spec.label, color, build: (v) => buildPolar(R, t0, t1, v), bounds: boundsOf(segs) ?? undefined } };
  }
  return {};
}

let nextId = 1;


interface PlottedFn { expr: string }

/** Intersections of every pair of plotted functions inside [lo, hi] (poles are not intersections). */
function allPairwiseIntersections(fns: PlottedFn[], lo: number, hi: number): { x: number; y: number }[] {
  const evals = fns.map((f) => makeEvaluator(f.expr, "x"));
  const all: { x: number; y: number }[] = [];
  for (let i = 0; i < fns.length; i++) {
    for (let j = i + 1; j < fns.length; j++) {
      const a = evals[i], b = evals[j];
      if (a && b) all.push(...findIntersections(a, b, lo, hi));
    }
  }
  const deduped: { x: number; y: number }[] = [];
  for (const p of all) {
    if (!deduped.some((q) => Math.abs(q.x - p.x) < 1e-6 * (1 + Math.abs(p.x)) && Math.abs(q.y - p.y) < 1e-6 * (1 + Math.abs(p.y)))) deduped.push({ x: p.x, y: p.y });
  }
  return deduped.slice(0, 40);
}

/** Bounding box of a bounded curve (circle, ellipse, heart…); null when it runs off to infinity (lines, parabolas…). */
function probeBounds(curve: PlotCurve): [number, number, number, number] | null {
  if (curve.bounds) return curve.bounds;
  if (!curve.build || curve.fill) return null;
  for (const R of [10, 40, 160]) {
    const segs: Pt[][] = curve.build({ x0: -R, x1: R, y0: -R, y1: R, plotW: 500, plotH: 500 }, "fast");
    const bb = boundsOf(segs);
    if (!bb) continue;
    if (Math.max(Math.abs(bb[0]), Math.abs(bb[1]), Math.abs(bb[2]), Math.abs(bb[3])) < R * 0.97) return bb;
  }
  return null;
}

export function GraphPlotter() {
  const settings = useSettings();
  const [mode, setMode] = useState<"2d" | "3d">("2d");
  const [graphs, setGraphs] = useState<GraphEntry[]>([
    { id: nextId++, expr: "sin(x)" },
  ]);
  const [xMin, setXMin] = useState(-settings.defaultGraphRange);
  const [xMax, setXMax] = useState(settings.defaultGraphRange);
  const [compareMode, setCompareMode] = useState(true);
  const [expr3d, setExpr3d] = useState("sin(x) * cos(y)");
  const [plotted3d, setPlotted3d] = useState("sin(x) * cos(y)");
  const [surfaceType, setSurfaceType] = useState<"explicit" | "implicit" | "parametric">("explicit");
  const [implicitEq, setImplicitEq] = useState("x^2 + y^2 + z^2 = 25");
  const [plottedImplicit, setPlottedImplicit] = useState<{ vars: string[]; expr: string; range: number; original: string } | null>({
    vars: ["x", "y", "z"],
    expr: "(x^2 + y^2 + z^2) - (25)",
    range: 10,
    original: "x^2 + y^2 + z^2 = 25",
  });
  const [implicitError, setImplicitError] = useState<string | null>(null);
  const [paramInput, setParamInput] = useState("(cos(t), sin(t), t/3)");
  const [paramRanges, setParamRanges] = useState<Record<string, { lo: string; hi: string }>>({});
  const [paramShape, setParamShape] = useState<{ spec: Param3DSpec; data: ShapeData } | null>(null);
  const [paramError, setParamError] = useState<string | null>(null);
  const [is3dFullscreen, setIs3dFullscreen] = useState(false);
  const [range3dInput, setRange3dInput] = useState("");
  const range3d = (() => { const v = parseNum(range3dInput); return v !== null && v >= 0.5 && v <= 500 ? v : settings.defaultGraphRange; })();
  const range3dProblem = (() => {
    if (!range3dInput.trim()) return null;
    const bad = rangeFieldProblem(range3dInput, "the range");
    if (bad) return `${bad} Using ±${settings.defaultGraphRange} instead.`;
    const v = parseNum(range3dInput);
    if (v === null || v < 0.5 || v > 500) return `The range must be between 0.5 and 500 — using ±${settings.defaultGraphRange} instead.`;
    return null;
  })();
  const chart3dRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!is3dFullscreen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIs3dFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [is3dFullscreen]);

  const examples3d = [
    "sin(x) * cos(y)",
    "sin(sqrt(x^2+y^2))",
    "x^2 - y^2",
    "exp(-(x^2+y^2)/4)",
    "cos(x) + sin(y)",
    "x*sin(y) - y*cos(x)",
    "abs(sin(x)*cos(y))",
  ];
  const examplesImplicit = [
    { label: "Sphere", eq: "x^2 + y^2 + z^2 = 25", range: 10 },
    { label: "Torus", eq: "(sqrt(x^2 + y^2) - 3)^2 + z^2 = 1", range: 6 },
    { label: "Ellipsoid", eq: "x^2/9 + y^2/4 + z^2/16 = 1", range: 6 },
    { label: "Cylinder", eq: "x^2 + y^2 = 9", range: 6 },
    { label: "Cone", eq: "x^2 + y^2 - z^2 = 0", range: 6 },
    { label: "Paraboloid", eq: "x^2 + y^2 = z", range: 6 },
    { label: "Hyperboloid", eq: "x^2 + y^2 - z^2 = 1", range: 6 },
    { label: "Heart", eq: "(x^2 + 9*y^2/4 + z^2 - 1)^3 - x^2*z^3 - (9/80)*y^2*z^3 = 0", range: 3 },
    { label: "Gyroid", eq: "sin(x)*cos(y) + sin(y)*cos(z) + sin(z)*cos(x) = 0", range: 10 },
    { label: "Schwarz P", eq: "cos(x) + cos(y) + cos(z) = 0", range: 10 },
    { label: "Diamond", eq: "sin(x)*sin(y)*sin(z) + sin(x)*cos(y)*cos(z) + cos(x)*sin(y)*cos(z) + cos(x)*cos(y)*sin(z) = 0", range: 10 },
  ];

  const paramSpec = useMemo(() => classify3D(paramInput, settings.defaultGraphRange), [paramInput, settings.defaultGraphRange]);
  const examplesParam: { label: string; v: string; r?: Record<string, [string, string]> }[] = [
    { label: "Helix", v: "(cos(t), sin(t), t/3)", r: { t: ["0", "6*pi"] } },
    { label: "Trefoil knot", v: "((2+cos(3t))cos(2t), (2+cos(3t))sin(2t), sin(3t))" },
    { label: "Torus", v: "((3+cos(v))cos(u), (3+cos(v))sin(u), sin(v))" },
    { label: "Sphere", v: "(sin(u)cos(v), sin(u)sin(v), cos(u))", r: { u: ["0", "pi"], v: ["0", "2*pi"] } },
    { label: "Cone", v: "(u cos(v), u sin(v), u)", r: { u: ["0", "3"], v: ["0", "2*pi"] } },
    { label: "Möbius strip", v: "((1+v/2*cos(u/2))cos(u), (1+v/2*cos(u/2))sin(u), v/2*sin(u/2))", r: { u: ["0", "2*pi"], v: ["-1", "1"] } },
    { label: "z = r²", v: "z = r^2" },
    { label: "Ripple", v: "z = sin(3r)/(1+r)" },
    { label: "Flower (r,θ)", v: "z = r*cos(4*theta)/2" },
    { label: "Bumpy ball", v: "rho = 2 + 0.4*sin(5*theta)*sin(4*phi)" },
    { label: "Vase", v: "r = 1.5 + sin(z)/2", r: { z: ["-3", "3"] } },
    { label: "Spiral staircase", v: "(u cos(v), u sin(v), v/2)", r: { u: ["0", "2"], v: ["0", "4*pi"] } },
  ];
  const plotParam = (raw: string, rangesIn?: Record<string, { lo: string; hi: string }>) => {
    const spec = classify3D(raw, settings.defaultGraphRange);
    if (spec.error) { setParamError(spec.error); setParamShape(null); return; }
    const rr = rangesIn ?? paramRanges;
    for (const d of spec.defaults) {
      const e1 = rangeFieldProblem(rr[d.name]?.lo, `the ${d.name} range minimum`), e2 = rangeFieldProblem(rr[d.name]?.hi, `the ${d.name} range maximum`);
      if (e1 || e2) { setParamError((e1 ?? e2)!); setParamShape(null); return; }
    }
    const ranges = spec.defaults.map((d) => {
      const lo = parseNum(rr[d.name]?.lo) ?? d.lo, hi = parseNum(rr[d.name]?.hi) ?? d.hi;
      return (lo <= hi ? [lo, hi] : [hi, lo]) as [number, number];
    });
    if (ranges.some(([a, b]) => b - a < 1e-9)) { setParamError("A parameter range is empty — make its max larger than its min."); setParamShape(null); return; }
    const built = buildShape(spec, ranges);
    if (built.error || !built.data) { setParamError(built.error ?? "Couldn't build this shape."); setParamShape(null); return; }
    setParamError(null);
    setParamShape({ spec, data: built.data });
  };

  const plotImplicit = (eq: string, customRange?: number) => {
    const parts = eq.split("=");
    if (parts.length !== 2) {
      setImplicitError("Use format: expression = expression, e.g. x^2 + y^2 + z^2 = 25");
      setPlottedImplicit(null);
      return;
    }
    const expr = `(${cleanExpression(parts[0])}) - (${cleanExpression(parts[1])})`;
    const vars = extractVariables(expr);
    const allowed = new Set(["x", "y", "z"]);
    const unknownVars = vars.filter((v) => !allowed.has(v));
    if (unknownVars.length > 0) {
      setImplicitError(`Unknown variable${unknownVars.length > 1 ? "s" : ""} "${unknownVars.join(", ")}" — only x, y, z are supported`);
      setPlottedImplicit(null);
      return;
    }
    if (vars.length === 0) {
      setImplicitError("No x, y, or z found in the equation");
      setPlottedImplicit(null);
      return;
    }
    // A variable that doesn't appear at all (e.g. no "z" in a cylinder
    // x^2+y^2=9) is still valid — the surface simply extends infinitely
    // along that axis. Always pass all 3 axis names so the scene renders
    // a full x/y/z frame regardless of which ones the equation actually uses.
    const useRange = customRange ?? range3d;
    const problem = validateImplicitSurface(expr, ["x", "y", "z"], useRange);
    if (problem) {
      setImplicitError(problem);
      setPlottedImplicit(null);
      return;
    }
    setImplicitError(null);
    setPlottedImplicit({ vars: ["x", "y", "z"], expr, range: useRange, original: eq });
  };
  const [plotted, setPlotted] = useState<(PlottedFn & { color: string })[]>([]);
  const [plotCurves, setPlotCurves] = useState<{ curve: PlotCurve; spec: PlaneSpec }[]>([]);
  const [rangeTouched, setRangeTouched] = useState(false);
  const [error3d, setError3d] = useState<string | null>(null);

  const addGraph = () => {
    if (graphs.length >= 5) return;
    setGraphs((prev) => [...prev, { id: nextId++, expr: "" }]);
  };

  const removeGraph = (id: number) => {
    setGraphs((prev) => prev.filter((g) => g.id !== id));
  };

  const updateExpr = (id: number, expr: string) => {
    setGraphs((prev) => prev.map((g) => (g.id === id ? { ...g, expr } : g)));
  };
  const updateRange = (id: number, key: "tLo" | "tHi", value: string) => {
    setGraphs((prev) => prev.map((g) => (g.id === id ? { ...g, [key]: value } : g)));
  };

  const [plotRange, setPlotRange] = useState<{ lo: number; hi: number }>({ lo: -settings.defaultGraphRange, hi: settings.defaultGraphRange });
  // Per-function error text, keyed by graph id, so a typo in one function
  // explains itself instead of silently drawing nothing.
  const [graphErrors, setGraphErrors] = useState<Record<number, string>>({});

  const plot = () => {
    const lo = Math.min(xMin, xMax);
    const hi = Math.max(xMin, xMax);
    const effLo = hi - lo < 1e-9 ? lo - 10 : lo;
    const effHi = hi - lo < 1e-9 ? hi + 10 : hi;
    const errors: Record<number, string> = {};
    const results: (PlottedFn & { color: string })[] = [];
    const curves: { curve: PlotCurve; spec: PlaneSpec }[] = [];
    graphs.forEach((g, idx) => {
      if (!g.expr.trim()) return;
      const color = PLOT_COLORS[idx % PLOT_COLORS.length];
      const spec = classifyPlaneInput(g.expr);
      if (spec.error) { errors[g.id] = spec.error; return; }
      if (spec.kind === "explicit") {
        const problem = validate2D(spec.expr!, "x", effLo, effHi);
        if (problem) errors[g.id] = problem;
        else results.push({ expr: spec.expr!, color });
        return;
      }
      const made = makeCurve(spec, g.id, color, g.tLo, g.tHi);
      if (made.error) { errors[g.id] = made.error; return; }
      if (made.curve) {
        if ((spec.kind === "implicit" || spec.kind === "inequality") && made.curve.build) {
          const probe = made.curve.build({ x0: effLo, x1: effHi, y0: -(effHi - effLo) * 0.31, y1: (effHi - effLo) * 0.31, plotW: 520, plotH: 320 }, "fast");
          if (probe.length === 0 && spec.kind === "implicit") {
            // maybe the curve lives outside this window — look wider before giving up
            const wide = made.curve.build({ x0: -400, x1: 400, y0: -300, y1: 300, plotW: 520, plotH: 320 }, "fast");
            if (wide.length === 0) { errors[g.id] = "There are no real points where this equation holds (for example x² + y² = −1)."; return; }
          }
        }
        const bb = probeBounds(made.curve);
        if (bb) made.curve.bounds = bb;
        curves.push({ curve: made.curve, spec });
      }
    });
    setPlotRange({ lo: effLo, hi: effHi });
    setGraphErrors(errors);
    setPlotted(results);
    setPlotCurves(curves);
  };

  useAutoRun([graphs.map((g) => `${g.expr}|${g.tLo ?? ""}|${g.tHi ?? ""}`).join("||"), xMin, xMax], plot, settings.autoCalculate && mode === "2d");

  const activeGraphs = useMemo(() => graphs.filter((g) => g.expr.trim()), [graphs]);
  const kindById = useMemo(() => {
    const m: Record<number, PlaneSpec> = {};
    graphs.forEach((g) => { if (g.expr.trim()) m[g.id] = classifyPlaneInput(g.expr); });
    return m;
  }, [graphs]);
  const examples2d = [
    { label: "Circle", v: "x^2 + y^2 = 25" },
    { label: "Ellipse", v: "x^2/9 + y^2/4 = 1" },
    { label: "Hyperbola", v: "x*y = 1" },
    { label: "Heart", v: "(x^2 + y^2 - 1)^3 = x^2 * y^3" },
    { label: "Cardioid", v: "r = 1 + cos(theta)" },
    { label: "Rose", v: "r = 2*sin(3*theta)" },
    { label: "Spiral", v: "r = theta" },
    { label: "Lissajous", v: "x = sin(3t), y = sin(2t)" },
    { label: "Cycloid", v: "x = t - sin(t), y = 1 - cos(t)" },
    { label: "Region", v: "y > x^2 - 2" },
    { label: "tan x", v: "tan(x)" },
    { label: "sin(1/x)", v: "sin(1/x)" },
  ];

  const intersections = useMemo(() => {
    if (!compareMode || plotted.length < 2) return [];
    return allPairwiseIntersections(plotted, plotRange.lo, plotRange.hi);
  }, [compareMode, plotted, plotRange]);

  const plotSeries = useMemo(() => plotted.map((p) => ({ expr: p.expr, label: `y = ${cleanExpression(p.expr)}`, color: p.color })), [plotted]);
  const curveList = useMemo(() => plotCurves.map((c) => c.curve), [plotCurves]);
  const curveOnly = plotted.length === 0 && plotCurves.length > 0;
  const totalPlotted = plotted.length + plotCurves.length;
  const intersectionMarkers = useMemo<PlotMarker[]>(
    () => [
      ...intersections.map((p) => ({ x: p.x, y: p.y, filled: true, color: "#f43f5e" })),
      ...plotted.flatMap((p) => findHoles(p.expr, plotRange.lo, plotRange.hi).map((h) => ({ x: h.x, y: h.y, filled: false, color: p.color }))),
    ],
    [intersections, plotted, plotRange],
  );
  const range2d: [number, number] = [plotRange.lo, plotRange.hi];

  // 3D: only render a surface when the function really has real values in the box.
  const plotSurface = (raw: string) => {
    const cleaned = cleanExpression(raw);
    const problem = validateSurface(raw, range3d);
    setError3d(problem);
    setPlotted3d(problem ? "" : cleaned);
  };

  return (
    <div className="space-y-6">
      <Card className="border-border/50 shadow-lg border-l-[3px] border-l-primary/50 rounded-l-md">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <LineChart className="h-5 w-5 text-primary" />
            Graph Plotter
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <button
              onClick={() => setMode("2d")}
              className={`flex-1 flex items-center justify-center gap-2 rounded-lg border py-2 text-sm font-medium transition-all ${
                mode === "2d" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted/50"
              }`}
            >
              <LineChart className="h-4 w-4" /> 2D Graph
            </button>
            <button
              onClick={() => setMode("3d")}
              className={`flex-1 flex items-center justify-center gap-2 rounded-lg border py-2 text-sm font-medium transition-all ${
                mode === "3d" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted/50"
              }`}
            >
              <Box className="h-4 w-4" /> 3D Surface
            </button>
          </div>

          {mode === "2d" ? (
            <>
              {graphs.map((g, idx) => (
                <div key={g.id} className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">Function {idx + 1}</Label>
                    <Input
                      value={g.expr}
                      onChange={(e) => updateExpr(g.id, normalizeMathInput(e.target.value))}
                      placeholder="y = x^2 · x^2+y^2=25 · r=1+cos(theta) · (cos(t), sin(t)) · y > x"
                      className="font-mono text-sm"
                      onKeyDown={(e) => e.key === "Enter" && plot()}
                      aria-invalid={Boolean(graphErrors[g.id])}
                    />
                    {graphErrors[g.id] && (
                      <p className="text-xs text-destructive leading-snug">{graphErrors[g.id]}</p>
                    )}
                    {!graphErrors[g.id] && kindById[g.id] && ["parametric", "polar"].includes(kindById[g.id].kind) && (
                      <div className="flex items-center gap-2 pt-1">
                        <span className="text-[11px] text-muted-foreground w-24 shrink-0">{kindById[g.id].kind === "polar" ? "θ range" : `${kindById[g.id].param ?? "t"} range`} (auto if blank)</span>
                        <Input value={g.tLo ?? ""} onChange={(e) => updateRange(g.id, "tLo", e.target.value)} placeholder="min e.g. 0" className="h-7 text-xs font-mono" />
                        <Input value={g.tHi ?? ""} onChange={(e) => updateRange(g.id, "tHi", e.target.value)} placeholder="max e.g. 2*pi" className="h-7 text-xs font-mono" />
                      </div>
                    )}
                    {!graphErrors[g.id] && kindById[g.id] && kindById[g.id].kind !== "explicit" && (
                      <p className="text-[11px] text-muted-foreground">{({ implicit: "Implicit curve", parametric: "Parametric curve", polar: "Polar curve", inequality: "Inequality region" } as Record<string, string>)[kindById[g.id].kind]} — drawn at full resolution at any zoom.</p>
                    )}
                  </div>
                  {graphs.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeGraph(g.id)}
                      className="text-destructive hover:text-destructive"
                      aria-label="Remove graph"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}

              <div className="flex flex-wrap gap-1.5">
                {examples2d.map((ex) => (
                  <button
                    key={ex.label}
                    onClick={() => { setRangeTouched(false); setGraphs((prev) => prev.map((g, i) => (i === 0 ? { ...g, expr: ex.v, tLo: "", tHi: "" } : g))); }}
                    title={ex.v}
                    className="text-xs px-2 py-1 rounded-md border border-border text-muted-foreground hover:bg-muted/60 font-medium transition-all"
                  >
                    {ex.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between">
                <Button variant="outline" size="sm" onClick={addGraph} className="gap-1" disabled={graphs.length >= 5}>
                  <Plus className="h-4 w-4" /> Add Function
                </Button>
                {activeGraphs.length > 1 && (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch checked={compareMode} onCheckedChange={setCompareMode} />
                    Compare on one graph
                  </label>
                )}
              </div>

              <div className="flex gap-4">
                <div className="space-y-1 flex-1">
                  <Label className="text-xs">X min</Label>
                  <Input
                    type="number"
                    value={xMin}
                    onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) { setXMin(v); setRangeTouched(true); } }}
                    className="text-center"
                  />
                </div>
                <div className="space-y-1 flex-1">
                  <Label className="text-xs">X max</Label>
                  <Input
                    type="number"
                    value={xMax}
                    onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) { setXMax(v); setRangeTouched(true); } }}
                    className="text-center"
                  />
                </div>
              </div>

              <Button onClick={plot} className="w-full gap-2">
                <LineChart className="h-4 w-4" />
                Plot Graphs
              </Button>
            </>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-2">
                <button
                  onClick={() => setSurfaceType("explicit")}
                  className={`flex-1 flex flex-col items-center justify-center gap-0.5 rounded-lg border py-2 transition-all ${
                    surfaceType === "explicit" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <Box className="h-3.5 w-3.5" /> Surface
                  </span>
                  <span className="text-[11px] font-mono opacity-75">z = f(x, y)</span>
                </button>
                <button
                  onClick={() => setSurfaceType("implicit")}
                  className={`flex-1 flex flex-col items-center justify-center gap-0.5 rounded-lg border py-2 transition-all ${
                    surfaceType === "implicit" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <Sigma className="h-3.5 w-3.5" /> Implicit Surface
                  </span>
                  <span className="text-[11px] font-mono opacity-75">F(x, y, z) = 0</span>
                </button>
                <button
                  onClick={() => { setSurfaceType("parametric"); if (!paramShape) plotParam(paramInput); }}
                  className={`flex-1 flex flex-col items-center justify-center gap-0.5 rounded-lg border py-2 transition-all ${
                    surfaceType === "parametric" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <Sigma className="h-3.5 w-3.5" /> Parametric / Polar
                  </span>
                  <span className="text-[11px] font-mono opacity-75">(x(t), y(t), z(t))</span>
                </button>
              </div>

              {surfaceType === "parametric" ? (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs">Curve, surface, cylindrical or spherical shape</Label>
                    <Input
                      value={paramInput}
                      onChange={(e) => setParamInput(normalizeMathInput(e.target.value))}
                      placeholder="(cos(t), sin(t), t)  ·  (u cos v, u sin v, u)  ·  z = r^2  ·  rho = 2 + sin(3 theta)"
                      className="font-mono text-sm"
                      onKeyDown={(e) => e.key === "Enter" && plotParam(paramInput)}
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {examplesParam.map((ex) => (
                      <button
                        key={ex.label}
                        title={ex.v}
                        onClick={() => {
                          setParamInput(ex.v);
                          const rr: Record<string, { lo: string; hi: string }> = {};
                          Object.entries(ex.r ?? {}).forEach(([k, [lo, hi]]) => { rr[k] = { lo, hi }; });
                          setParamRanges(rr);
                          plotParam(ex.v, rr);
                        }}
                        className="text-xs px-2 py-1 rounded-md border border-border text-muted-foreground hover:bg-muted/60 font-medium transition-all"
                      >
                        {ex.label}
                      </button>
                    ))}
                  </div>
                  {!paramSpec.error && paramSpec.params.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] text-muted-foreground">{paramSpec.kind === "curve" ? "Parametric curve" : "Parametric surface"} in {paramSpec.params.join(", ")}{paramSpec.note ? ` — ${paramSpec.note}` : ""}. Ranges (blank = automatic):</p>
                      {paramSpec.defaults.map((d) => (
                        <div key={d.name} className="flex items-center gap-2">
                          <span className="text-xs font-mono w-12 shrink-0">{d.name}</span>
                          <Input value={paramRanges[d.name]?.lo ?? ""} onChange={(e) => setParamRanges((p) => ({ ...p, [d.name]: { lo: e.target.value, hi: p[d.name]?.hi ?? "" } }))} placeholder={d.angle ? "0" : String(d.lo)} className="h-7 text-xs font-mono" />
                          <Input value={paramRanges[d.name]?.hi ?? ""} onChange={(e) => setParamRanges((p) => ({ ...p, [d.name]: { lo: p[d.name]?.lo ?? "", hi: e.target.value } }))} placeholder={d.angle ? (d.hi > 4 ? "2*pi" : "pi") : String(d.hi)} className="h-7 text-xs font-mono" />
                        </div>
                      ))}
                    </div>
                  )}
                  <Button onClick={() => plotParam(paramInput)} className="w-full gap-2">
                    <Sigma className="h-4 w-4" /> Plot Shape
                  </Button>
                  {(paramError || paramSpec.error) && <p className="text-xs text-destructive leading-snug">{paramError ?? paramSpec.error}</p>}
                  <p className="text-xs text-muted-foreground"><span className="sm:hidden">one-finger drag to rotate · pinch in/out to zoom</span><span className="hidden sm:inline">drag to rotate · scroll to zoom</span> · shown with true proportions (not stretched)</p>
                </>
              ) : surfaceType === "explicit" ? (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs">Function f(x, y)</Label>
                    <Input
                      value={expr3d}
                      onChange={(e) => setExpr3d(normalizeMathInput(e.target.value))}
                      placeholder="e.g. sin(x) * cos(y), x^2 - y^2"
                      className="font-mono text-sm"
                      onKeyDown={(e) => e.key === "Enter" && plotSurface(expr3d)}
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {examples3d.map((ex) => (
                      <button
                        key={ex}
                        onClick={() => { setExpr3d(ex); plotSurface(ex); }}
                        className={`text-xs px-2 py-1 rounded-md border font-mono transition-all ${
                          plotted3d === ex
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:bg-muted/60"
                        }`}
                      >
                        {ex}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground shrink-0">x, y range ±</span>
                    <Input value={range3dInput} onChange={(e) => setRange3dInput(e.target.value)} placeholder={String(settings.defaultGraphRange)} className="h-7 w-24 text-xs font-mono" />
                    <span className="text-[11px] text-muted-foreground">blank = default</span>
                  </div>
                  {range3dProblem && <p className="text-xs text-destructive leading-snug">{range3dProblem}</p>}
                  <Button onClick={() => plotSurface(expr3d)} className="w-full gap-2">
                    <Box className="h-4 w-4" /> Plot 3D Surface
                  </Button>
                  {error3d && <p className="text-xs text-destructive leading-snug">{error3d}</p>}
                  <p className="text-xs text-muted-foreground"><span className="sm:hidden">one-finger drag to rotate · pinch in/out to zoom</span><span className="hidden sm:inline">drag to rotate · scroll to zoom</span> · z = f(x, y) over [−{range3d}, {range3d}]²</p>
                </>
              ) : (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs">Equation in x, y, z</Label>
                    <Input
                      value={implicitEq}
                      onChange={(e) => setImplicitEq(normalizeMathInput(e.target.value))}
                      placeholder="e.g. x^2 + y^2 + z^2 = 25"
                      className="font-mono text-sm"
                      onKeyDown={(e) => e.key === "Enter" && plotImplicit(implicitEq)}
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {examplesImplicit.map(({ label, eq, range }) => (
                      <button
                        key={label}
                        onClick={() => { setImplicitEq(eq); plotImplicit(eq, range); }}
                        title={eq}
                        className={`text-xs px-2.5 py-1 rounded-md border font-medium transition-all ${
                          plottedImplicit?.expr === `(${eq.split("=")[0].trim()}) - (${eq.split("=")[1].trim()})`
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:bg-muted/60"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground shrink-0">box range ±</span>
                    <Input value={range3dInput} onChange={(e) => setRange3dInput(e.target.value)} placeholder={String(settings.defaultGraphRange)} className="h-7 w-24 text-xs font-mono" />
                    <span className="text-[11px] text-muted-foreground">blank = default</span>
                  </div>
                  {range3dProblem && <p className="text-xs text-destructive leading-snug">{range3dProblem}</p>}
                  <Button onClick={() => plotImplicit(implicitEq)} className="w-full gap-2">
                    <Sigma className="h-4 w-4" /> Plot Implicit Surface
                  </Button>
                  {implicitError && <p className="text-xs text-destructive">{implicitError}</p>}
                  <p className="text-xs text-muted-foreground"><span className="sm:hidden">one-finger drag to rotate · pinch in/out to zoom</span><span className="hidden sm:inline">drag to rotate · scroll to zoom</span> · surface where the equation equals zero, over [−{range3d}, {range3d}]³</p>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {mode === "3d" && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className={
            is3dFullscreen
              ? "fixed inset-0 z-50 bg-background p-4 flex flex-col"
              : "relative"
          }
        >
          <div className="flex items-center justify-between gap-2 mb-2 px-1">
            <p className="font-mono text-sm font-semibold text-foreground truncate">
              {surfaceType === "explicit" ? `z = ${plotted3d}` : surfaceType === "parametric" ? (paramShape?.spec.label ?? "") : plottedImplicit ? plottedImplicit.original : ""}
            </p>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => downloadCanvasPNG(chart3dRef, surfaceType === "explicit" ? `calculin-3d-${plotted3d.slice(0, 20)}` : surfaceType === "parametric" ? "calculin-3d-parametric" : "calculin-implicit-surface")}
                className="flex h-8 w-8 text-primary border-primary/40 hover:bg-primary/10"
                aria-label="Download PNG"
                title="Download PNG"
              >
                <Camera className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setIs3dFullscreen((v) => !v)}
                className="hidden sm:flex h-8 w-8"
                aria-label={is3dFullscreen ? "Exit fullscreen" : "View fullscreen"}
                title={is3dFullscreen ? "Exit fullscreen" : "View fullscreen"}
              >
                {is3dFullscreen ? <X className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <Suspense
            fallback={
              <div className="h-[460px] rounded-xl border border-border overflow-hidden relative bg-muted/20">
                <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted/40 via-muted/10 to-muted/40" />
                <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                  Loading 3D engine…
                </div>
              </div>
            }
          >
            <div ref={chart3dRef} className={is3dFullscreen ? "flex-1 min-h-0" : ""}>
              {surfaceType === "parametric" ? (
                paramShape ? (
                  <ParametricGraph3D data={paramShape.data} range={settings.defaultGraphRange} fillParent={is3dFullscreen} label={paramShape.spec.label} />
                ) : (
                  <div className="h-[460px] rounded-xl border border-border flex items-center justify-center text-sm text-muted-foreground bg-muted/20 text-center px-6">
                    {paramError ?? "Pick an example or type a shape, then hit \"Plot Shape\"."}
                  </div>
                )
              ) : surfaceType === "explicit" ? (
                plotted3d ? (
                  <Graph3D expression={plotted3d} range={range3d} resolution={110} fillParent={is3dFullscreen} />
                ) : (
                  <div className="h-[460px] rounded-xl border border-border flex items-center justify-center text-sm text-muted-foreground bg-muted/20 text-center px-6">
                    {error3d ?? "Enter a function of x and y, then hit \"Plot 3D Surface\"."}
                  </div>
                )
              ) : plottedImplicit ? (
                <ImplicitSurface3D
                  expression={plottedImplicit.expr}
                  varNames={[plottedImplicit.vars[0], plottedImplicit.vars[1], plottedImplicit.vars[2]]}
                  range={plottedImplicit.range}
                  fillParent={is3dFullscreen}
                />
              ) : (
                <div className="h-[460px] rounded-xl border border-border flex items-center justify-center text-sm text-muted-foreground bg-muted/20 text-center px-6">
                  {implicitError ?? "Enter an equation in x, y, and z, then hit \"Plot Implicit Surface\" to render it."}
                </div>
              )}
            </div>
          </Suspense>
        </motion.div>
      )}

      {mode === "2d" && totalPlotted > 0 && (
        <>
          {compareMode || totalPlotted === 1 ? (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
              <Card className="shadow-lg border-border/50">
                <CardContent className="pt-6 space-y-3">
                  <FunctionGraph
                    series={plotSeries}
                    curves={curveList}
                    equalAspect={curveOnly}
                    fit={curveOnly && !rangeTouched}
                    xRange={range2d}
                    markers={intersectionMarkers}
                    downloadFilename={plotted[0]?.expr ?? plotCurves[0]?.spec.label}
                  />
                  {intersections.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <Crosshair className="h-3.5 w-3.5 text-rose-500" /> Intersection points
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {intersections.map((p, i) => (
                          <Badge key={i} variant="secondary" className="font-mono text-xs">
                            ({formatNumber(p.x, settings)}, {formatNumber(p.y, settings)})
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ) : (
            <div className="space-y-4">
              {plotted.map((p, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: i * 0.08 }}>
                  <Card className="shadow-lg border-border/50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-muted-foreground">f(x) = {cleanExpression(p.expr)}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <FunctionGraph series={[{ expr: p.expr, label: `f(x)`, color: p.color }]} xRange={range2d} />
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
              {plotCurves.map((c, i) => (
                <motion.div key={`c${c.curve.id}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: (plotted.length + i) * 0.08 }}>
                  <Card className="shadow-lg border-border/50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-muted-foreground">{c.spec.label}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <FunctionGraph series={[]} curves={[c.curve]} equalAspect fit={!rangeTouched} xRange={range2d} />
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
