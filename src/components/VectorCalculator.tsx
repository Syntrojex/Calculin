import { useState, useEffect, useCallback, useMemo, Suspense, lazy } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MathTex } from "./MathTex";
import { StepsReveal } from "./StepsReveal";
import { VectorGraph2D } from "./VectorGraph2D";
import { useSettings } from "@/contexts/SettingsContext";
import { useAutoRun } from "@/hooks/useAutoRun";
import { parseNumericInput } from "@/lib/expression-clean";
import { toFractionLatex } from "@/lib/number-format";
import * as V from "@/lib/vector-solver";
import { buildScene, COLORS } from "@/lib/vector-scene";
import type { Vec3, VectorResult } from "@/lib/vector-solver";
import { Move3d, ArrowRight, Plus, Minus } from "lucide-react";

const VectorGraph3D = lazy(() => import("./VectorGraph3D").then((m) => ({ default: m.VectorGraph3D })));

type Op = "add" | "subtract" | "scale" | "magnitude" | "unit" | "dot" | "cross" | "angle" | "scalarProj" | "vectorProj" | "triple" | "distance" | "midpoint" | "area" | "dircos" | "relation";

const OPS_2D: { value: Op; label: string }[] = [
  { value: "add", label: "u + v (+ more vectors)" },
  { value: "subtract", label: "u \u2212 v" },
  { value: "scale", label: "k \u00b7 u" },
  { value: "magnitude", label: "|u|" },
  { value: "unit", label: "Unit Vector of u" },
  { value: "dot", label: "u \u00b7 v (Dot Product)" },
  { value: "angle", label: "Angle Between u, v" },
  { value: "scalarProj", label: "Scalar Projection of u onto v" },
  { value: "vectorProj", label: "Vector Projection of u onto v" },
  { value: "relation", label: "Parallel / Orthogonal Test" },
  { value: "distance", label: "Distance Between Points u, v" },
  { value: "midpoint", label: "Midpoint of u, v" },
  { value: "area", label: "Area (Parallelogram & Triangle)" },
  { value: "dircos", label: "Direction Cosines of u" },
];
const OPS_3D: { value: Op; label: string }[] = [
  ...OPS_2D.slice(0, 5),
  { value: "cross", label: "u \u00d7 v (Cross Product)" },
  ...OPS_2D.slice(5),
  { value: "triple", label: "u \u00b7 (v \u00d7 w) (Triple Product)" },
];

const TWO_VECTOR_OPS = new Set<Op>(["subtract", "dot", "cross", "angle", "scalarProj", "vectorProj", "relation", "distance", "midpoint", "area"]);
const MAX_VECTORS = 6;
type Comp = { x: string; y: string; z: string };

function parseComponent(s: string): number {
  return parseNumericInput(s.trim() === "" ? "0" : s);
}

export function VectorCalculator() {
  const settings = useSettings();
  const [is3D, setIs3D] = useState(false);
  const [op, setOp] = useState<Op>("add");
  const [comps, setComps] = useState<Comp[]>([
    { x: "2", y: "3", z: "1" },
    { x: "-1", y: "4", z: "2" },
    { x: "1", y: "-2", z: "3" },
    { x: "0", y: "2", z: "-1" },
    { x: "-2", y: "-1", z: "1" },
    { x: "1", y: "1", z: "1" },
  ]);
  const [sumCount, setSumCount] = useState(2);
  const [k, setK] = useState("2");
  const [showSteps, setShowSteps] = useState(settings.showSteps);
  const [result, setResult] = useState<VectorResult | null>(null);

  useEffect(() => setShowSteps(settings.showSteps), [settings.showSteps]);
  useEffect(() => { if (!is3D && (op === "cross" || op === "triple")) setOp("add"); }, [is3D, op]);

  const count = op === "add" ? sumCount : op === "triple" ? 3 : TWO_VECTOR_OPS.has(op) ? 2 : 1;
  const names = V.VECTOR_NAMES;
  const vecs: Vec3[] = useMemo(
    () => comps.slice(0, count).map((c) => ({ x: parseComponent(c.x), y: parseComponent(c.y), z: is3D ? parseComponent(c.z) : 0 })),
    [comps, count, is3D],
  );
  const kVal = parseComponent(k);

  const setComp = (i: number, key: keyof Comp, value: string) => setComps((cs) => cs.map((c, idx) => (idx === i ? { ...c, [key]: value } : c)));

  const solve = useCallback(() => {
    const [u, v, w] = vecs;
    switch (op) {
      case "add": setResult(V.vecSumMany(vecs, is3D)); break;
      case "subtract": setResult(V.vecSubtract(u, v, is3D)); break;
      case "scale": setResult(V.vecScale(u, kVal, is3D)); break;
      case "magnitude": setResult(V.vecMagnitude(u, is3D)); break;
      case "unit": setResult(V.vecUnit(u, is3D)); break;
      case "dot": setResult(V.vecDot(u, v, is3D)); break;
      case "cross": setResult(V.vecCross(u, v)); break;
      case "angle": setResult(V.vecAngle(u, v, is3D)); break;
      case "scalarProj": setResult(V.vecScalarProjection(u, v, is3D)); break;
      case "vectorProj": setResult(V.vecVectorProjection(u, v, is3D)); break;
      case "triple": setResult(V.vecTripleProduct(u, v, w)); break;
      case "relation": setResult(V.vecRelation(u, v, is3D)); break;
      case "distance": setResult(V.vecDistance(u, v, is3D)); break;
      case "midpoint": setResult(V.vecMidpoint(u, v, is3D)); break;
      case "area": setResult(V.vecArea(u, v, is3D)); break;
      case "dircos": setResult(V.vecDirectionCosines(u, is3D)); break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [op, JSON.stringify(vecs), kVal, is3D]);

  useAutoRun([op, JSON.stringify(comps.slice(0, count)), count, k, is3D, settings.numberForm, settings.decimalPlaces], solve, settings.autoCalculate);

  const ops = is3D ? OPS_3D : OPS_2D;

  const scene = useMemo(
    () => buildScene({
      op: ({ relation: "angle", distance: "subtract", midpoint: "add", area: is3D ? "cross" : "dot", dircos: "unit" } as Record<string, Op>)[op] as Parameters<typeof buildScene>[0]["op"] ?? op,
      vectors: vecs,
      names,
      k: kVal,
      is3D,
      result: result && !result.error ? result.resultVector : undefined,
      scalar: result && !result.error ? result.resultScalar : undefined,
    }),
    [op, vecs, kVal, is3D, result, names],
  );

  const resultLatex = (() => {
    if (!result || result.error) return "";
    if (result.verdict) return `\\text{${result.verdict}}`;
    if (result.resultVector) {
      const r = result.resultVector;
      const cs = is3D ? [r.x, r.y, r.z] : [r.x, r.y];
      return `\\langle ${cs.map((c) => toFractionLatex(c)).join(", ")} \\rangle`;
    }
    if (result.resultScalar !== undefined) {
      return result.isAngle ? `${toFractionLatex(result.resultScalar)}\u00b0` : toFractionLatex(result.resultScalar);
    }
    return "";
  })();

  const vectorInputs = (i: number) => (
    <div key={i} className="space-y-1.5">
      <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
        Vector {names[i]}
      </Label>
      <div className={`grid gap-2 ${is3D ? "grid-cols-3" : "grid-cols-2"}`}>
        <Input value={comps[i].x} onChange={(e) => setComp(i, "x", e.target.value)} className="font-mono text-center" placeholder="x" />
        <Input value={comps[i].y} onChange={(e) => setComp(i, "y", e.target.value)} className="font-mono text-center" placeholder="y" />
        {is3D && <Input value={comps[i].z} onChange={(e) => setComp(i, "z", e.target.value)} className="font-mono text-center" placeholder="z" />}
      </div>
    </div>
  );

  return (
    <div className="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start space-y-6 lg:space-y-0">
      <div className="space-y-6 min-w-0">
        <Card className="border-border/50 shadow-lg border-l-[3px] border-l-primary/50 rounded-l-md">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Move3d className="h-5 w-5 text-primary" />
              Vectors
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs value={is3D ? "3d" : "2d"} onValueChange={(val) => setIs3D(val === "3d")}>
              <TabsList className="w-full">
                <TabsTrigger value="2d" className="flex-1">2D</TabsTrigger>
                <TabsTrigger value="3d" className="flex-1">3D</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="space-y-1">
              <Label className="text-xs">Operation</Label>
              <Select value={op} onValueChange={(val) => setOp(val as Op)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ops.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {Array.from({ length: count }, (_, i) => vectorInputs(i))}

            {op === "add" && (
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" className="gap-1" disabled={sumCount >= MAX_VECTORS} onClick={() => setSumCount((n) => Math.min(MAX_VECTORS, n + 1))}>
                  <Plus className="h-3.5 w-3.5" /> Add vector {names[sumCount] ?? ""}
                </Button>
                <Button type="button" variant="ghost" size="sm" className="gap-1" disabled={sumCount <= 2} onClick={() => setSumCount((n) => Math.max(2, n - 1))}>
                  <Minus className="h-3.5 w-3.5" /> Remove
                </Button>
                <span className="text-xs text-muted-foreground">{sumCount} vectors</span>
              </div>
            )}

            {op === "scale" && (
              <div className="space-y-1 w-24">
                <Label className="text-xs text-muted-foreground">Scalar k</Label>
                <Input value={k} onChange={(e) => setK(e.target.value)} className="font-mono text-center" />
              </div>
            )}

            <label className="flex items-center gap-2 text-sm">
              <Switch checked={showSteps} onCheckedChange={setShowSteps} />
              Step-by-step
            </label>

            {!settings.autoCalculate && (
              <Button onClick={solve} className="w-full gap-2">
                <ArrowRight className="h-4 w-4" /> Solve
              </Button>
            )}
          </CardContent>
        </Card>

        {result && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <Card className="border-primary/20 shadow-lg">
              <CardContent className="pt-6 space-y-4">
                {result.error ? (
                  <div className="p-4 rounded-lg bg-destructive/10 text-destructive text-sm">{result.error}</div>
                ) : (
                  <>
                    <div className="p-4 rounded-lg bg-primary/5 border border-primary/10 overflow-x-auto no-scrollbar">
                      <div className="text-sm text-muted-foreground mb-1">Result:</div>
                      <MathTex latex={resultLatex} display className="text-lg font-semibold text-foreground" />
                    </div>
                    <StepsReveal steps={result.steps} show={showSteps} resetKey={`${op}-${resultLatex}`} />
                  </>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>

      <div className="space-y-4 lg:sticky lg:top-4 min-w-0">
        <Card className="shadow-lg border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Diagram</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {is3D ? (
              <Suspense
                fallback={
                  <div className="h-[400px] rounded-xl border border-border overflow-hidden relative bg-muted/20">
                    <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted/40 via-muted/10 to-muted/40" />
                    <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">Loading 3D engine{"\u2026"}</div>
                  </div>
                }
              >
                <VectorGraph3D scene={scene} />
              </Suspense>
            ) : (
              <VectorGraph2D scene={scene} />
            )}
            {scene.legend.length > 0 && (
              <ul className="space-y-1 text-xs font-mono">
                {scene.legend.map((l, i) => (
                  <li key={i} className="flex items-start gap-2 text-muted-foreground">
                    <span className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: l.color }} />
                    <span className="break-words">{l.text}</span>
                  </li>
                ))}
              </ul>
            )}
            {is3D && <p className="text-[11px] text-muted-foreground text-center">drag to rotate · scroll or pinch to zoom</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
