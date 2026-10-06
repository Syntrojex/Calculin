import { useState, useEffect, useCallback, Suspense, lazy } from "react";
import { motion } from "framer-motion";
import { evaluate } from "mathjs";
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
import { normalizeMathInput } from "@/lib/text-normalize";
import { toFractionLatex } from "@/lib/number-format";
import * as V from "@/lib/vector-solver";
import type { Vec3, VectorResult } from "@/lib/vector-solver";
import { Move3d, ArrowRight } from "lucide-react";

const VectorGraph3D = lazy(() => import("./VectorGraph3D").then((m) => ({ default: m.VectorGraph3D })));

type Op = "add" | "subtract" | "scale" | "magnitude" | "unit" | "dot" | "cross" | "angle" | "scalarProj" | "vectorProj";

const OPS_2D: { value: Op; label: string }[] = [
  { value: "add", label: "u + v" },
  { value: "subtract", label: "u \u2212 v" },
  { value: "scale", label: "k \u00b7 u" },
  { value: "magnitude", label: "|u|" },
  { value: "unit", label: "Unit Vector of u" },
  { value: "dot", label: "u \u00b7 v (Dot Product)" },
  { value: "angle", label: "Angle Between u, v" },
  { value: "scalarProj", label: "Scalar Projection of u onto v" },
  { value: "vectorProj", label: "Vector Projection of u onto v" },
];
const OPS_3D: { value: Op; label: string }[] = [
  ...OPS_2D.slice(0, 5),
  { value: "cross", label: "u \u00d7 v (Cross Product)" },
  ...OPS_2D.slice(5),
];

const NEEDS_V = new Set<Op>(["add", "subtract", "dot", "cross", "angle", "scalarProj", "vectorProj"]);
const NEEDS_K = new Set<Op>(["scale"]);

function parseComponent(s: string): number {
  try {
    const v = evaluate(normalizeMathInput(s.trim() || "0"));
    return typeof v === "number" ? v : NaN;
  } catch {
    return NaN;
  }
}

export function VectorCalculator() {
  const settings = useSettings();
  const [is3D, setIs3D] = useState(false);
  const [op, setOp] = useState<Op>("add");
  const [ux, setUx] = useState("2"); const [uy, setUy] = useState("3"); const [uz, setUz] = useState("1");
  const [vx, setVx] = useState("-1"); const [vy, setVy] = useState("4"); const [vz, setVz] = useState("2");
  const [k, setK] = useState("2");
  const [showSteps, setShowSteps] = useState(settings.showSteps);
  const [result, setResult] = useState<VectorResult | null>(null);

  useEffect(() => setShowSteps(settings.showSteps), [settings.showSteps]);
  useEffect(() => { if (!is3D && op === "cross") setOp("add"); }, [is3D, op]);

  const u: Vec3 = { x: parseComponent(ux), y: parseComponent(uy), z: is3D ? parseComponent(uz) : 0 };
  const v: Vec3 = { x: parseComponent(vx), y: parseComponent(vy), z: is3D ? parseComponent(vz) : 0 };
  const kVal = parseComponent(k);

  const solve = useCallback(() => {
    switch (op) {
      case "add": setResult(V.vecAdd(u, v, is3D)); break;
      case "subtract": setResult(V.vecSubtract(u, v, is3D)); break;
      case "scale": setResult(V.vecScale(u, kVal, is3D)); break;
      case "magnitude": setResult(V.vecMagnitude(u, is3D)); break;
      case "unit": setResult(V.vecUnit(u, is3D)); break;
      case "dot": setResult(V.vecDot(u, v, is3D)); break;
      case "cross": setResult(V.vecCross(u, v)); break;
      case "angle": setResult(V.vecAngle(u, v, is3D)); break;
      case "scalarProj": setResult(V.vecScalarProjection(u, v, is3D)); break;
      case "vectorProj": setResult(V.vecVectorProjection(u, v, is3D)); break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [op, ux, uy, uz, vx, vy, vz, k, is3D]);

  useAutoRun([op, ux, uy, uz, vx, vy, vz, k, is3D, settings.numberForm, settings.decimalPlaces], solve, settings.autoCalculate);

  const ops = is3D ? OPS_3D : OPS_2D;
  const needsV = NEEDS_V.has(op);
  const needsK = NEEDS_K.has(op);
  const singleVectorOnly = op === "magnitude" || op === "unit";

  // Build the arrows to visualize, matching what the current operation is
  // actually about — always show the inputs, plus the result when the
  // result is itself a vector.
  const arrows2D = [{ x: u.x, y: u.y, color: "#6366f1", label: "u" }];
  const arrows3D = [{ x: u.x, y: u.y, z: u.z, color: "#6366f1", label: "u" }];
  if (needsV) {
    arrows2D.push({ x: v.x, y: v.y, color: "#f59e0b", label: "v" });
    arrows3D.push({ x: v.x, y: v.y, z: v.z, color: "#f59e0b", label: "v" });
  }
  if (result && !result.error && result.resultVector) {
    const r = result.resultVector;
    const label = op === "unit" ? "\u00fb" : op === "scale" ? "ku" : op === "cross" ? "u\u00d7v" : op === "vectorProj" ? "proj" : "result";
    arrows2D.push({ x: r.x, y: r.y, color: "#10b981", label });
    arrows3D.push({ x: r.x, y: r.y, z: r.z, color: "#10b981", label });
  }

  const resultLatex = (() => {
    if (!result || result.error) return "";
    if (result.resultVector) {
      const r = result.resultVector;
      const comps = is3D ? [r.x, r.y, r.z] : [r.x, r.y];
      return `\\langle ${comps.map((c) => toFractionLatex(c)).join(", ")} \\rangle`;
    }
    if (result.resultScalar !== undefined) {
      return result.isAngle ? `${toFractionLatex(result.resultScalar)}\u00b0` : toFractionLatex(result.resultScalar);
    }
    return "";
  })();

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

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Vector u</Label>
              <div className={`grid gap-2 ${is3D ? "grid-cols-3" : "grid-cols-2"}`}>
                <Input value={ux} onChange={(e) => setUx(e.target.value)} className="font-mono text-center" placeholder="x" />
                <Input value={uy} onChange={(e) => setUy(e.target.value)} className="font-mono text-center" placeholder="y" />
                {is3D && <Input value={uz} onChange={(e) => setUz(e.target.value)} className="font-mono text-center" placeholder="z" />}
              </div>
            </div>

            {needsV && !singleVectorOnly && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Vector v</Label>
                <div className={`grid gap-2 ${is3D ? "grid-cols-3" : "grid-cols-2"}`}>
                  <Input value={vx} onChange={(e) => setVx(e.target.value)} className="font-mono text-center" placeholder="x" />
                  <Input value={vy} onChange={(e) => setVy(e.target.value)} className="font-mono text-center" placeholder="y" />
                  {is3D && <Input value={vz} onChange={(e) => setVz(e.target.value)} className="font-mono text-center" placeholder="z" />}
                </div>
              </div>
            )}

            {needsK && (
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
          <CardContent>
            {is3D ? (
              <Suspense
                fallback={
                  <div className="h-[380px] rounded-xl border border-border overflow-hidden relative bg-muted/20">
                    <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted/40 via-muted/10 to-muted/40" />
                    <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                      Loading 3D engine{"\u2026"}
                    </div>
                  </div>
                }
              >
                <VectorGraph3D
                  vectors={arrows3D}
                  range={Math.max(4, ...arrows3D.flatMap((a) => [Math.abs(a.x), Math.abs(a.y), Math.abs(a.z)]).filter((n) => isFinite(n))) * 1.3}
                />
              </Suspense>
            ) : (
              <VectorGraph2D vectors={arrows2D} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
