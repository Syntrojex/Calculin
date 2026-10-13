import { useState, useEffect , useCallback } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MathInput } from "./MathInput";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "lucide-react";
import { StepsReveal } from "./StepsReveal";
import { useSettings } from "@/contexts/SettingsContext";
import { useAutoRun } from "@/hooks/useAutoRun";
import { formatNumber } from "@/lib/number-format";
import { solveLimit, type LimitResult, type LimitSide } from "@/lib/limit-solver";
import { FunctionGraph, type PlotMarker, type PlotLine } from "./FunctionGraph";
import { validateGraphExpression } from "@/lib/math-solver";
import { cleanExpression, cleanVariable, parseNumericInput } from "@/lib/expression-clean";
import { evaluate } from "mathjs";

export type { LimitResult, LimitSide };

export function computeLimit(expr: string, variable: string, approaching: string, side: LimitSide, fmt: (n: number) => string): LimitResult {
  return solveLimit(expr, variable, approaching, side, fmt);
}

export function LimitsCalculator() {
  const settings = useSettings();
  const [expr, setExpr] = useState("sin(x)/x");
  const [variable, setVariable] = useState("x");
  const [approaching, setApproaching] = useState("0");
  const [side, setSide] = useState<LimitSide>("two-sided");
  const [result, setResult] = useState<LimitResult | null>(null);
  const [showSteps, setShowSteps] = useState(settings.showSteps);

  useEffect(() => setShowSteps(settings.showSteps), [settings.showSteps]);

  const solve = useCallback(
    () => setResult(computeLimit(expr, variable, approaching, side, (n) => formatNumber(n, settings))),
    [expr, variable, approaching, side, settings]
  );

  useAutoRun([expr, variable, approaching, side, settings.numberForm, settings.decimalPlaces], solve, settings.autoCalculate);

  // ── graph of f near the point the limit is taken at ────────────────────────
  const v = cleanVariable(variable);
  const a = parseNumericInput(approaching);
  const graph = (() => {
    if (!result || result.error || Number.isNaN(a)) return null;
    const w = Math.max(3, Number.isFinite(a) ? Math.abs(a) * 0.6 : 0);
    const xRange: [number, number] = Number.isFinite(a) ? [a - w, a + w] : a > 0 ? [-5, 50] : [-50, 5];
    const problem = validateGraphExpression(expr, v, xRange[0], xRange[1]);
    const markers: PlotMarker[] = [];
    const vlines: PlotLine[] = [];
    const hlines: PlotLine[] = [];
    if (Number.isFinite(a)) {
      vlines.push({ value: a, label: `${v} = ${approaching.trim()}` });
      if (result.kind === "finite" && result.limitValue !== undefined) {
        markers.push({ x: a, y: result.limitValue, filled: false, label: `L = ${result.exactText ?? formatNumber(result.limitValue, settings)}`, color: "#ef4444" });
        hlines.push({ value: result.limitValue, color: "rgba(239,68,68,0.7)" });
        try {
          const fa = evaluate(cleanExpression(expr), { [v]: a });
          if (typeof fa === "number" && Number.isFinite(fa) && Math.abs(fa - result.limitValue) > 1e-9 * (1 + Math.abs(fa))) {
            markers.push({ x: a, y: fa, filled: true, label: `f(${approaching.trim()}) = ${formatNumber(fa, settings)}`, color: "#6366f1" });
          }
        } catch { /* f(a) undefined */ }
      }
    } else if (result.kind === "finite" && result.limitValue !== undefined) {
      hlines.push({ value: result.limitValue, label: `y = ${result.exactText ?? formatNumber(result.limitValue, settings)}`, color: "rgba(239,68,68,0.8)" });
    }
    return { problem, xRange, markers, vlines, hlines };
  })();

  return (
    <div className="space-y-6">
      <Card className="border-border/50 shadow-lg border-l-[3px] border-l-primary/50 rounded-l-md">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ArrowRight className="h-5 w-5 text-primary" />
            Limits Calculator
          </CardTitle>
        </CardHeader>
        <CardContent
          className="space-y-4"
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); solve(); }
          }}
        >
          <div className="space-y-1">
            <Label className="text-xs">Function f(x)</Label>
            <MathInput value={expr} onChange={setExpr} placeholder="e.g. sin(x)/x" onEnter={solve} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Variable</Label>
              <Input value={variable} onChange={(e) => setVariable(e.target.value)} className="text-center font-mono" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Approaching (e.g. 0, pi, Infinity)</Label>
              <Input value={approaching} onChange={(e) => setApproaching(e.target.value)} className="text-center font-mono" onKeyDown={(e) => e.key === "Enter" && solve()} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Side</Label>
            <div className="flex gap-1.5">
              {([
                { key: "two-sided", label: "Two-Sided" },
                { key: "left", label: "Left-Hand (⁻)" },
                { key: "right", label: "Right-Hand (⁺)" },
              ] as { key: LimitSide; label: string }[]).map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setSide(opt.key)}
                  className={`flex-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    side === opt.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          {!settings.autoCalculate && (
            <Button onClick={solve} className="w-full gap-2">
              <ArrowRight className="h-4 w-4" /> Calculate Limit
            </Button>
          )}
        </CardContent>
      </Card>

      {result && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <Card className="shadow-lg border-border/50">
          <CardContent className="pt-6 space-y-4">
            {result.error ? (
              <p className="text-destructive font-medium">{result.error}</p>
            ) : (
              <>
                <Badge variant="secondary" className="text-base font-mono px-3 py-1">
                  lim{side === "left" ? "\u207b" : side === "right" ? "\u207a" : ""} = {result.exactText ? `${result.exactText} ≈ ` : ""}{result.numericValue !== undefined && Number.isFinite(result.numericValue) ? formatNumber(result.numericValue, settings) : result.value}
                </Badge>
                <StepsReveal steps={result.steps} show={showSteps} resetKey={result.value} title="Steps:" />
                <Button variant="ghost" size="sm" onClick={() => setShowSteps((sv) => !sv)} className="text-xs">
                  {showSteps ? "Hide" : "Show"} Steps
                </Button>
              </>
            )}
          </CardContent>
        </Card>
        </motion.div>
      )}

      {graph && (
        <Card className="shadow-lg border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Graph of f({v}) near the limit point</CardTitle>
          </CardHeader>
          <CardContent>
            {graph.problem ? (
              <p className="text-sm text-muted-foreground">{graph.problem}</p>
            ) : (
              <FunctionGraph
                series={[{ expr, label: `f(${v})` }]}
                variable={v}
                xRange={graph.xRange}
                markers={graph.markers}
                vlines={graph.vlines}
                hlines={graph.hlines}
              />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
