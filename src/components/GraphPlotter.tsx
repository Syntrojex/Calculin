import { useState, useMemo, useEffect, useRef, Suspense, lazy } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { generateGraphPoints, extractVariables } from "@/lib/math-solver";
import { GraphCanvas, type GraphSeries } from "./GraphCanvas";
import { useSettings } from "@/contexts/SettingsContext";
import { useAutoRun } from "@/hooks/useAutoRun";
import { formatNumber } from "@/lib/number-format";
import { LineChart, Plus, Trash2, Box, Crosshair, Maximize2, X, Sigma, Camera } from "lucide-react";
import { normalizeMathInput } from "@/lib/text-normalize";

const Graph3D = lazy(() => import("./Graph3D").then(m => ({ default: m.Graph3D })));
const ImplicitSurface3D = lazy(() => import("./ImplicitSurface3D").then(m => ({ default: m.ImplicitSurface3D })));

interface GraphEntry {
  id: number;
  expr: string;
}

let nextId = 1;

function findIntersections(s1: GraphSeries, s2: GraphSeries): { x: number; y: number }[] {
  const result: { x: number; y: number }[] = [];
  const n = Math.min(s1.points.length, s2.points.length);
  for (let i = 0; i < n - 1; i++) {
    const d0 = s1.points[i].y - s2.points[i].y;
    const d1 = s1.points[i + 1].y - s2.points[i + 1].y;
    if (d0 === 0) {
      result.push({ x: s1.points[i].x, y: s1.points[i].y });
      continue;
    }
    if ((d0 > 0 && d1 < 0) || (d0 < 0 && d1 > 0)) {
      const t = d0 / (d0 - d1);
      const x = s1.points[i].x + t * (s1.points[i + 1].x - s1.points[i].x);
      const y = s1.points[i].y + t * (s1.points[i + 1].y - s1.points[i].y);
      result.push({ x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 });
    }
  }
  return result;
}

function allPairwiseIntersections(series: GraphSeries[]): { x: number; y: number }[] {
  const all: { x: number; y: number }[] = [];
  for (let i = 0; i < series.length; i++) {
    for (let j = i + 1; j < series.length; j++) {
      all.push(...findIntersections(series[i], series[j]));
    }
  }
  // De-duplicate points that are very close together
  const deduped: { x: number; y: number }[] = [];
  for (const p of all) {
    if (!deduped.some((q) => Math.abs(q.x - p.x) < 1e-2 && Math.abs(q.y - p.y) < 1e-2)) {
      deduped.push(p);
    }
  }
  return deduped;
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
  const [surfaceType, setSurfaceType] = useState<"explicit" | "implicit">("explicit");
  const [implicitEq, setImplicitEq] = useState("x^2 + y^2 + z^2 = 25");
  const [plottedImplicit, setPlottedImplicit] = useState<{ vars: string[]; expr: string; range: number; original: string } | null>({
    vars: ["x", "y", "z"],
    expr: "(x^2 + y^2 + z^2) - (25)",
    range: 10,
    original: "x^2 + y^2 + z^2 = 25",
  });
  const [implicitError, setImplicitError] = useState<string | null>(null);
  const [is3dFullscreen, setIs3dFullscreen] = useState(false);
  const chart2dRef = useRef<HTMLDivElement>(null);
  const chart3dRef = useRef<HTMLDivElement>(null);

  const downloadCanvasPNG = async (containerRef: React.RefObject<HTMLDivElement | null>, filename: string) => {
    const sourceCanvas = containerRef.current?.querySelector("canvas") as HTMLCanvasElement | null;
    if (!sourceCanvas) return;

    // The 3D canvas renders with a transparent background (alpha:true) so it
    // composites nicely inside the card. Exporting it as-is leaves the PNG's
    // background transparent, which most image viewers simply show as plain
    // white. Flatten it onto the app's actual theme background color first
    // so the download looks like what's on screen.
    const flattened = document.createElement("canvas");
    flattened.width = sourceCanvas.width;
    flattened.height = sourceCanvas.height;
    const ctx = flattened.getContext("2d");
    if (!ctx) return;
    const bg = getComputedStyle(document.documentElement).getPropertyValue("--background").trim();
    ctx.fillStyle = bg || (document.documentElement.classList.contains("dark") ? "#0a0a0f" : "#ffffff");
    ctx.fillRect(0, 0, flattened.width, flattened.height);
    ctx.drawImage(sourceCanvas, 0, 0);

    const blob: Blob | null = await new Promise((resolve) => flattened.toBlob(resolve, "image/png"));
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = `${filename}.png`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

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

  const plotImplicit = (eq: string, customRange?: number) => {
    const parts = eq.split("=");
    if (parts.length !== 2) {
      setImplicitError("Use format: expression = expression, e.g. x^2 + y^2 + z^2 = 25");
      setPlottedImplicit(null);
      return;
    }
    const expr = `(${parts[0].trim()}) - (${parts[1].trim()})`;
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
    setImplicitError(null);
    setPlottedImplicit({ vars: ["x", "y", "z"], expr, range: customRange ?? settings.defaultGraphRange, original: eq });
  };
  const [plotted, setPlotted] = useState<GraphSeries[]>([]);

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

  const [plotRange, setPlotRange] = useState<{ lo: number; hi: number }>({ lo: -settings.defaultGraphRange, hi: settings.defaultGraphRange });

  const plot = () => {
    const lo = Math.min(xMin, xMax);
    const hi = Math.max(xMin, xMax);
    const effLo = hi - lo < 1e-9 ? lo - 10 : lo;
    const effHi = hi - lo < 1e-9 ? hi + 10 : hi;
    setPlotRange({ lo: effLo, hi: effHi });
    const results = graphs
      .filter((g) => g.expr.trim())
      .map((g) => ({
        expr: g.expr,
        points: generateGraphPoints(g.expr, "x", effLo, effHi),
      }));
    setPlotted(results);
  };

  useAutoRun([graphs.map((g) => g.expr).join("|"), xMin, xMax], plot, settings.autoCalculate && mode === "2d");

  const activeGraphs = useMemo(() => graphs.filter((g) => g.expr.trim()), [graphs]);

  const intersections = useMemo(() => {
    if (!compareMode || plotted.length < 2) return [];
    return allPairwiseIntersections(plotted);
  }, [compareMode, plotted]);

  return (
    <div className="space-y-6">
      <Card className="border-border/50 shadow-lg">
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
                      placeholder="e.g. x^2, sin(x), log(x)"
                      className="font-mono text-sm"
                      onKeyDown={(e) => e.key === "Enter" && plot()}
                    />
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
                    onChange={(e) => setXMin(parseFloat(e.target.value) || -10)}
                    className="text-center"
                  />
                </div>
                <div className="space-y-1 flex-1">
                  <Label className="text-xs">X max</Label>
                  <Input
                    type="number"
                    value={xMax}
                    onChange={(e) => setXMax(parseFloat(e.target.value) || 10)}
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
              </div>

              {surfaceType === "explicit" ? (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs">Function f(x, y)</Label>
                    <Input
                      value={expr3d}
                      onChange={(e) => setExpr3d(normalizeMathInput(e.target.value))}
                      placeholder="e.g. sin(x) * cos(y), x^2 - y^2"
                      className="font-mono text-sm"
                      onKeyDown={(e) => e.key === "Enter" && setPlotted3d(expr3d)}
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {examples3d.map((ex) => (
                      <button
                        key={ex}
                        onClick={() => { setExpr3d(ex); setPlotted3d(ex); }}
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
                  <Button onClick={() => setPlotted3d(expr3d)} className="w-full gap-2">
                    <Box className="h-4 w-4" /> Plot 3D Surface
                  </Button>
                  <p className="text-xs text-muted-foreground">drag to rotate · scroll to zoom · z = f(x, y) over [−{settings.defaultGraphRange}, {settings.defaultGraphRange}]²</p>
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
                  <Button onClick={() => plotImplicit(implicitEq)} className="w-full gap-2">
                    <Sigma className="h-4 w-4" /> Plot Implicit Surface
                  </Button>
                  {implicitError && <p className="text-xs text-destructive">{implicitError}</p>}
                  <p className="text-xs text-muted-foreground">drag to rotate · scroll to zoom · surface where the equation equals zero, over [−{settings.defaultGraphRange}, {settings.defaultGraphRange}]³</p>
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
              {surfaceType === "explicit" ? `z = ${plotted3d}` : plottedImplicit ? plottedImplicit.original : ""}
            </p>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => downloadCanvasPNG(chart3dRef, surfaceType === "explicit" ? `calculin-3d-${plotted3d.slice(0, 20)}` : "calculin-implicit-surface")}
                className="hidden sm:flex h-8 w-8 text-primary border-primary/40 hover:bg-primary/10"
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
              <div className="h-[460px] rounded-xl border border-border flex items-center justify-center text-sm text-muted-foreground bg-muted/20">
                Loading 3D engine…
              </div>
            }
          >
            <div ref={chart3dRef} className={is3dFullscreen ? "flex-1 min-h-0" : ""}>
              {surfaceType === "explicit" ? (
                <Graph3D expression={plotted3d} range={settings.defaultGraphRange} fillParent={is3dFullscreen} />
              ) : plottedImplicit ? (
                <ImplicitSurface3D
                  expression={plottedImplicit.expr}
                  varNames={[plottedImplicit.vars[0], plottedImplicit.vars[1], plottedImplicit.vars[2]]}
                  range={plottedImplicit.range}
                  fillParent={is3dFullscreen}
                />
              ) : (
                <div className="h-[460px] rounded-xl border border-border flex items-center justify-center text-sm text-muted-foreground bg-muted/20 text-center px-6">
                  Enter an equation in x, y, and z, then hit "Plot Implicit Surface" to render it.
                </div>
              )}
            </div>
          </Suspense>
        </motion.div>
      )}

      {mode === "2d" && plotted.length > 0 && (
        <>
          {compareMode || plotted.length === 1 ? (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
              <Card className="shadow-lg border-border/50">
                <CardContent className="pt-6 space-y-3">
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => downloadCanvasPNG(chart2dRef, `calculin-2d-${(plotted[0]?.expr ?? "graph").slice(0, 20)}`)}
                      className="h-8 w-8 text-primary border-primary/40 hover:bg-primary/10"
                      aria-label="Download PNG"
                      title="Download PNG"
                    >
                      <Camera className="h-4 w-4" />
                    </Button>
                  </div>
                  <div ref={chart2dRef}>
                    <GraphCanvas series={plotted} xMin={plotRange.lo} xMax={plotRange.hi} markers={intersections} />
                  </div>
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
                      <CardTitle className="text-sm text-muted-foreground">f(x) = {p.expr}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <GraphCanvas series={[p]} xMin={plotRange.lo} xMax={plotRange.hi} />
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
