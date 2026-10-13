import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { evaluate } from "mathjs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MathInput } from "./MathInput";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { solvePartialDerivative, extractVariables, partialNotation } from "@/lib/math-solver";
import type { MathResult } from "@/lib/math-solver";
import { cleanExpression, parseNumericInput } from "@/lib/expression-clean";
import { formatNumber } from "@/lib/number-format";
import { PieChart, ArrowRight, Undo2, X } from "lucide-react";
import { ResultMath } from "./ResultMath";
import { StepsReveal } from "./StepsReveal";
import { useSettings } from "@/contexts/SettingsContext";
import { useAutoRun } from "@/hooks/useAutoRun";

export function PartialDerivativeCalculator() {
  const settings = useSettings();
  const [expr, setExpr] = useState("x^2*y + sin(x*y)");
  const [seq, setSeq] = useState<string[]>(["x"]);
  const [point, setPoint] = useState<Record<string, string>>({});
  const [showSteps, setShowSteps] = useState(settings.showSteps);
  const [result, setResult] = useState<MathResult | null>(null);

  useEffect(() => setShowSteps(settings.showSteps), [settings.showSteps]);

  // Variables that actually appear in the function ("e" is Euler's number).
  const detected = useMemo(() => {
    const vars = extractVariables(cleanExpression(expr)).filter((v) => v !== "e");
    return vars.length > 0 ? vars : ["x", "y"];
  }, [expr]);

  // Keep the chosen sequence valid as the function changes.
  useEffect(() => {
    setSeq((prev) => {
      const kept = prev.filter((v) => detected.includes(v));
      return kept.length > 0 ? kept : [detected[0]];
    });
  }, [detected]);

  const solve = () => setResult(solvePartialDerivative(expr, seq[seq.length - 1], detected, seq));

  useAutoRun([expr, seq.join(","), detected.join(","), settings.numberForm, settings.decimalPlaces], solve, settings.autoCalculate);

  const gradient = useMemo(
    () => (detected.length <= 4 ? detected.map((v) => ({ v, res: solvePartialDerivative(expr, v, detected) })) : []),
    [expr, detected],
  );

  const valueAt = (res: MathResult | null): string | null => {
    if (!res || res.error || !res.result) return null;
    const scope: Record<string, number> = {};
    for (const v of detected) {
      const n = parseNumericInput(point[v] ?? "");
      if (!Number.isFinite(n)) return null;
      scope[v] = n;
    }
    try {
      const val = evaluate(cleanExpression(res.result), scope);
      return typeof val === "number" && Number.isFinite(val) ? formatNumber(val, settings) : "undefined";
    } catch { return null; }
  };
  const pointComplete = detected.every((v) => Number.isFinite(parseNumericInput(point[v] ?? "")));

  return (
    <div className="space-y-6">
      <Card className="border-border/50 shadow-lg border-l-[3px] border-l-primary/50 rounded-l-md">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <PieChart className="h-5 w-5 text-primary" />
            Partial Derivative
          </CardTitle>
        </CardHeader>
        <CardContent
          className="space-y-4"
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); solve(); }
          }}
        >
          <div className="space-y-2">
            <Label>Function f({detected.join(", ")})</Label>
            <MathInput value={expr} onChange={setExpr} placeholder="e.g. x^2*y + sin(x*y)" onEnter={solve} />
          </div>

          <div className="space-y-2">
            <Label>Differentiate by (click in order — first click is applied first)</Label>
            <div className="flex flex-wrap items-center gap-2">
              {detected.map((v) => (
                <Button
                  key={v}
                  type="button"
                  size="sm"
                  variant="outline"
                  className="font-mono w-10"
                  onClick={() => setSeq((s) => (s.length >= 6 ? s : [...s, v]))}
                >
                  {v}
                </Button>
              ))}
              <span className="mx-1 h-5 w-px bg-border" />
              <Button type="button" size="sm" variant="ghost" className="gap-1 text-xs" onClick={() => setSeq((s) => (s.length > 1 ? s.slice(0, -1) : s))} disabled={seq.length <= 1}>
                <Undo2 className="h-3.5 w-3.5" /> Undo
              </Button>
              <Button type="button" size="sm" variant="ghost" className="gap-1 text-xs" onClick={() => setSeq([detected[0]])}>
                <X className="h-3.5 w-3.5" /> Reset
              </Button>
            </div>
            <p className="text-xs text-muted-foreground font-mono">
              Applying: {seq.map((v, i) => `∂/∂${v}${i < seq.length - 1 ? "  →  " : ""}`).join("")}
              {seq.length === 1 ? "  (other variables are treated as constants)" : ""}
            </p>
          </div>

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
                  <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
                    <div className="text-sm text-muted-foreground mb-1">Result:</div>
                    <ResultMath prefix={partialNotation(seq)} expr={result.result} className="text-lg font-semibold text-foreground" />
                    {pointComplete && valueAt(result) !== null && (
                      <div className="mt-2 text-sm text-muted-foreground font-mono">
                        at ({detected.map((v) => `${v} = ${point[v]}`).join(", ")}) → <span className="text-foreground font-semibold">{valueAt(result)}</span>
                      </div>
                    )}
                  </div>
                  <StepsReveal steps={result.steps} show={showSteps} resetKey={`${result.result}-${seq.join("")}`} />
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {gradient.length > 1 && gradient.every((g) => !g.res.error) && (
        <Card className="shadow-lg border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">All first-order partials (gradient ∇f)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {gradient.map(({ v, res }) => (
              <ResultMath key={v} prefix={`\\frac{\\partial f}{\\partial ${v}}`} expr={res.result} className="text-base text-foreground" />
            ))}
            <div className="pt-2 border-t border-border/40">
              <Label className="text-xs text-muted-foreground">Evaluate at a point (optional)</Label>
              <div className="mt-1 flex flex-wrap gap-2">
                {detected.map((v) => (
                  <div key={v} className="w-24 space-y-1">
                    <Label className="text-[11px] text-muted-foreground">{v} =</Label>
                    <Input value={point[v] ?? ""} onChange={(e) => setPoint((p) => ({ ...p, [v]: e.target.value }))} className="font-mono text-center h-9" placeholder="1, pi/2" />
                  </div>
                ))}
              </div>
              {pointComplete && (
                <div className="mt-2 space-y-1 text-sm font-mono">
                  {gradient.map(({ v, res }) => (
                    <div key={v} className="text-muted-foreground">∂f/∂{v} = <span className="text-foreground font-semibold">{valueAt(res) ?? "—"}</span></div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
