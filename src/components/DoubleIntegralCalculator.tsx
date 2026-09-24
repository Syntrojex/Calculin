import { useState, useEffect, useCallback, useRef, Suspense, lazy } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MathInput } from "./MathInput";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { solveDoubleIntegral } from "@/lib/math-solver";
import { StepsReveal } from "./StepsReveal";
import type { MathResult } from "@/lib/math-solver";
import { ArrowRight, Layers, Camera } from "lucide-react";
import { MathText } from "./MathText";
import { useSettings } from "@/contexts/SettingsContext";
import { useAutoRun } from "@/hooks/useAutoRun";
import { formatNumber } from "@/lib/number-format";
import { downloadCanvasPNG, slugifyForFilename } from "@/lib/canvas-export";

const Graph3D = lazy(() => import("./Graph3D").then((m) => ({ default: m.Graph3D })));

/** Renames the user's chosen variable names to plain "x"/"y" so the shared
 *  Graph3D component (which always evaluates with scope {x, y}) can plot a
 *  double integral's integrand even when the user typed e.g. u, v as their
 *  variable names. */
function renameToXY(expr: string, varX: string, varY: string): string {
  const px = "\u0000X\u0000", py = "\u0000Y\u0000";
  let out = expr.replace(new RegExp(`\\b${varX}\\b`, "g"), px);
  out = out.replace(new RegExp(`\\b${varY}\\b`, "g"), py);
  return out.replace(new RegExp(px, "g"), "x").replace(new RegExp(py, "g"), "y");
}

export function DoubleIntegralCalculator() {
  const settings = useSettings();
  const [expr, setExpr] = useState("x^2 + y^2");
  const [variable, setVariable] = useState("x");
  const [varY, setVarY] = useState("y");
  const [lower, setLower] = useState("0");
  const [upper, setUpper] = useState("1");
  const [yLower, setYLower] = useState("0");
  const [yUpper, setYUpper] = useState("1");
  const [showSteps, setShowSteps] = useState(settings.showSteps);
  const [result, setResult] = useState<MathResult | null>(null);
  const chart3dRef = useRef<HTMLDivElement>(null);

  useEffect(() => setShowSteps(settings.showSteps), [settings.showSteps]);

  const solve = useCallback(() => {
    setResult(solveDoubleIntegral(
      expr, variable, varY,
      parseFloat(lower), parseFloat(upper),
      parseFloat(yLower), parseFloat(yUpper),
      100, settings
    ));
  }, [expr, variable, varY, lower, upper, yLower, yUpper, settings]);

  useAutoRun([expr, variable, varY, lower, upper, yLower, yUpper, settings.numberForm, settings.decimalPlaces], solve, settings.autoCalculate);

  const doubleIntegralRange = Math.max(
    Math.abs(parseFloat(lower) || 0), Math.abs(parseFloat(upper) || 0),
    Math.abs(parseFloat(yLower) || 0), Math.abs(parseFloat(yUpper) || 0),
    2
  ) * 1.4;

  return (
    <div className="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start space-y-6 lg:space-y-0">
      <div className="space-y-6 min-w-0">
        <Card className="border-border/50 shadow-lg border-l-[3px] border-l-primary/50 rounded-l-md">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Layers className="h-5 w-5 text-primary" />
              Double Integral
            </CardTitle>
          </CardHeader>
          <CardContent
            className="space-y-4"
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); solve(); }
            }}
          >
            <div className="space-y-2">
              <Label>Integrand f(x, y)</Label>
              <MathInput value={expr} onChange={setExpr} placeholder="e.g. x^2 + y^2" onEnter={solve} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Variable 1</Label>
                <Input value={variable} onChange={(e) => setVariable(e.target.value)} className="font-mono text-center" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Variable 2</Label>
                <Input value={varY} onChange={(e) => setVarY(e.target.value)} className="font-mono text-center" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{variable} lower</Label>
                <Input value={lower} onChange={(e) => setLower(e.target.value)} className="font-mono text-center" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{variable} upper</Label>
                <Input value={upper} onChange={(e) => setUpper(e.target.value)} className="font-mono text-center" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{varY} lower</Label>
                <Input value={yLower} onChange={(e) => setYLower(e.target.value)} className="font-mono text-center" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{varY} upper</Label>
                <Input value={yUpper} onChange={(e) => setYUpper(e.target.value)} className="font-mono text-center" />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Switch checked={showSteps} onCheckedChange={setShowSteps} />
              Step-by-step
            </label>

            {!settings.autoCalculate && (
              <Button onClick={solve} className="w-full gap-2">
                <ArrowRight className="h-4 w-4" />
                Solve Integral
              </Button>
            )}
          </CardContent>
        </Card>

        {result && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <Card className="border-primary/20 shadow-lg">
              <CardContent className="pt-6 space-y-4">
                {result.error ? (
                  <div className="p-4 rounded-lg bg-destructive/10 text-destructive text-sm">
                    {result.error}
                  </div>
                ) : (
                  <>
                    <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
                      <div className="text-sm text-muted-foreground mb-1">Result:</div>
                      <div className="text-xl font-mono font-semibold text-foreground">
                        <MathText text={`\u222c = ${result.numericResult !== undefined ? formatNumber(result.numericResult, settings) : result.result}`} />
                      </div>
                    </div>
                    <StepsReveal steps={result.steps} show={showSteps} resetKey={result.result} />
                  </>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>

      <div className="space-y-4 lg:sticky lg:top-4 min-w-0">
        {result && !result.error && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <Card className="shadow-lg border-border/50">
              <CardHeader className="pb-2 flex-row items-center justify-between">
                <CardTitle className="text-sm text-muted-foreground">
                  3D Surface: f({variable}, {varY}) over [{lower}, {upper}] {"\u00d7"} [{yLower}, {yUpper}]
                </CardTitle>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => downloadCanvasPNG(chart3dRef, `calculin-double-integral-${slugifyForFilename(expr)}`)}
                  className="h-8 w-8 text-primary border-primary/40 hover:bg-primary/10 shrink-0"
                  aria-label="Download PNG"
                  title="Download PNG"
                >
                  <Camera className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent>
                <Suspense
                  fallback={
                    <div className="h-[420px] rounded-xl border border-border overflow-hidden relative bg-muted/20">
                      <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted/40 via-muted/10 to-muted/40" />
                      <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                        Loading 3D engine{"\u2026"}
                      </div>
                    </div>
                  }
                >
                  <div ref={chart3dRef}>
                    <Graph3D expression={renameToXY(expr, variable, varY)} range={doubleIntegralRange} />
                  </div>
                </Suspense>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>
    </div>
  );
}
