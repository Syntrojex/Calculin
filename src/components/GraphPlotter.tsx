import { useState, useMemo, Suspense, lazy } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { generateGraphPoints } from "@/lib/math-solver";
import { GraphCanvas, type GraphSeries } from "./GraphCanvas";
import { useSettings } from "@/contexts/SettingsContext";
import { useAutoRun } from "@/hooks/useAutoRun";
import { formatNumber } from "@/lib/number-format";
import { LineChart, Plus, Trash2, Box, Crosshair } from "lucide-react";

const Graph3D = lazy(() => import("./Graph3D").then(m => ({ default: m.Graph3D })));

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

  const examples3d = [
    "sin(x) * cos(y)",
    "sin(sqrt(x^2+y^2))",
    "x^2 - y^2",
    "exp(-(x^2+y^2)/4)",
    "cos(x) + sin(y)",
    "x*sin(y) - y*cos(x)",
    "abs(sin(x)*cos(y))",
  ];
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
                      onChange={(e) => updateExpr(g.id, e.target.value)}
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
              <div className="space-y-1">
                <Label className="text-xs">Function f(x, y)</Label>
                <Input
                  value={expr3d}
                  onChange={(e) => setExpr3d(e.target.value)}
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
            </div>
          )}
        </CardContent>
      </Card>

      {mode === "3d" && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <Suspense
            fallback={
              <div className="h-[460px] rounded-xl border border-border flex items-center justify-center text-sm text-muted-foreground bg-muted/20">
                Loading 3D engine…
              </div>
            }
          >
            <Graph3D expression={plotted3d} range={settings.defaultGraphRange} />
          </Suspense>
        </motion.div>
      )}

      {mode === "2d" && plotted.length > 0 && (
        <>
          {compareMode || plotted.length === 1 ? (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
              <Card className="shadow-lg border-border/50">
                <CardContent className="pt-6 space-y-3">
                  <GraphCanvas series={plotted} xMin={plotRange.lo} xMax={plotRange.hi} markers={intersections} />
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
