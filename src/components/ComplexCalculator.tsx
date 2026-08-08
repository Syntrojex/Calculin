import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MathText } from "./MathText";
import { StepsReveal } from "./StepsReveal";
import { Zap } from "lucide-react";
import { useSettings, type Settings } from "@/contexts/SettingsContext";
import { useAutoRun } from "@/hooks/useAutoRun";
import { formatNumber } from "@/lib/number-format";

type ComplexOp = "add" | "subtract" | "multiply" | "divide" | "power" | "sqrt" | "polar" | "rect" | "conjugate" | "modulus" | "demoivre";

interface Complex {
  re: number;
  im: number;
}

function fmt(x: number, s: Settings): string {
  const snapped = Math.abs(x) < 1e-10 ? 0 : x;
  return formatNumber(snapped, s);
}

function fmtComplex(c: Complex, s: Settings): string {
  if (Math.abs(c.im) < 1e-10) return fmt(c.re, s);
  if (Math.abs(c.re) < 1e-10) return `${fmt(c.im, s)}i`;
  const sign = c.im < 0 ? " - " : " + ";
  return `${fmt(c.re, s)}${sign}${fmt(Math.abs(c.im), s)}i`;
}

function fmtAngle(rad: number, s: Settings): string {
  const deg = rad * (180 / Math.PI);
  return s.useRadians ? `${fmt(rad, s)} rad (${fmt(deg, s)}°)` : `${fmt(deg, s)}° (${fmt(rad, s)} rad)`;
}

function add(a: Complex, b: Complex): Complex { return { re: a.re + b.re, im: a.im + b.im }; }
function sub(a: Complex, b: Complex): Complex { return { re: a.re - b.re, im: a.im - b.im }; }
function mul(a: Complex, b: Complex): Complex {
  return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
}
function div(a: Complex, b: Complex): Complex {
  const denom = b.re * b.re + b.im * b.im;
  if (denom === 0) throw new Error("Division by zero");
  return { re: (a.re * b.re + a.im * b.im) / denom, im: (a.im * b.re - a.re * b.im) / denom };
}
function modulus(a: Complex): number { return Math.sqrt(a.re * a.re + a.im * a.im); }
function argument(a: Complex): number { return Math.atan2(a.im, a.re); }
function conjugate(a: Complex): Complex { return { re: a.re, im: -a.im }; }

function sqrtComplex(a: Complex): Complex {
  const r = modulus(a);
  return {
    re: Math.sqrt((r + a.re) / 2),
    im: Math.sign(a.im || 1) * Math.sqrt((r - a.re) / 2),
  };
}

function power(a: Complex, n: number): Complex {
  const r = modulus(a);
  const theta = argument(a);
  const rn = Math.pow(r, n);
  return { re: rn * Math.cos(n * theta), im: rn * Math.sin(n * theta) };
}

function parseComplex(re: string, im: string): Complex {
  const reVal = parseFloat(re);
  const imVal = parseFloat(im);
  return {
    re: Number.isNaN(reVal) ? 0 : reVal,
    im: Number.isNaN(imVal) ? 0 : imVal,
  };
}

function compute(op: ComplexOp, a: Complex, b: Complex, n: number, s: Settings): { result: string; steps: string[] } {
  const steps: string[] = [];
  steps.push(`z₁ = ${fmtComplex(a, s)}`);
  if (!["sqrt", "polar", "conjugate", "modulus", "demoivre"].includes(op)) {
    steps.push(`z₂ = ${fmtComplex(b, s)}`);
  }

  switch (op) {
    case "add": {
      const r = add(a, b);
      steps.push(`z₁ + z₂ = (${fmt(a.re, s)} + ${fmt(b.re, s)}) + (${fmt(a.im, s)} + ${fmt(b.im, s)})i`);
      return { result: fmtComplex(r, s), steps };
    }
    case "subtract": {
      const r = sub(a, b);
      steps.push(`z₁ - z₂ = (${fmt(a.re, s)} - ${fmt(b.re, s)}) + (${fmt(a.im, s)} - ${fmt(b.im, s)})i`);
      return { result: fmtComplex(r, s), steps };
    }
    case "multiply": {
      const r = mul(a, b);
      steps.push(`(a+bi)(c+di) = (ac-bd) + (ad+bc)i`);
      steps.push(`= (${fmt(a.re, s)}·${fmt(b.re, s)} - ${fmt(a.im, s)}·${fmt(b.im, s)}) + (${fmt(a.re, s)}·${fmt(b.im, s)} + ${fmt(a.im, s)}·${fmt(b.re, s)})i`);
      return { result: fmtComplex(r, s), steps };
    }
    case "divide": {
      const r = div(a, b);
      const denom = b.re * b.re + b.im * b.im;
      steps.push(`Multiply by conjugate of z₂: ${fmtComplex(conjugate(b), s)}`);
      steps.push(`Denominator: |z₂|² = ${fmt(denom, s)}`);
      return { result: fmtComplex(r, s), steps };
    }
    case "power": {
      const r = power(a, n);
      const mod = modulus(a);
      const arg = argument(a);
      steps.push(`|z₁| = ${fmt(mod, s)},  arg(z₁) = ${fmtAngle(arg, s)}`);
      steps.push(`z₁^n = |z₁|^n · (cos(n·θ) + i·sin(n·θ))`);
      steps.push(`= ${fmt(mod, s)}^${n} · (cos(${fmt(n * arg, s)}) + i·sin(${fmt(n * arg, s)}))`);
      return { result: fmtComplex(r, s), steps };
    }
    case "sqrt": {
      const r = sqrtComplex(a);
      steps.push(`√z = √((|z|+Re(z))/2) + i·sign(Im)·√((|z|-Re(z))/2)`);
      steps.push(`|z₁| = ${fmt(modulus(a), s)}`);
      return { result: `${fmtComplex(r, s)}  (principal root)`, steps };
    }
    case "polar": {
      const r = modulus(a);
      const theta = argument(a);
      steps.push(`r = √(${fmt(a.re, s)}² + ${fmt(a.im, s)}²) = ${fmt(r, s)}`);
      steps.push(`θ = atan2(${fmt(a.im, s)}, ${fmt(a.re, s)}) = ${fmtAngle(theta, s)}`);
      return { result: `r = ${fmt(r, s)},  θ = ${fmtAngle(theta, s)}`, steps };
    }
    case "rect": {
      const r = b.re;
      const theta = b.im * (Math.PI / 180);
      const re = r * Math.cos(theta);
      const im = r * Math.sin(theta);
      steps.push(`Input: r = ${fmt(r, s)}, θ = ${fmt(b.im, s)}°`);
      steps.push(`Re = r·cos(θ) = ${fmt(r, s)}·${fmt(Math.cos(theta), s)} = ${fmt(re, s)}`);
      steps.push(`Im = r·sin(θ) = ${fmt(r, s)}·${fmt(Math.sin(theta), s)} = ${fmt(im, s)}`);
      return { result: fmtComplex({ re, im }, s), steps };
    }
    case "conjugate": {
      steps.push(`Conjugate: flip sign of imaginary part`);
      return { result: fmtComplex(conjugate(a), s), steps };
    }
    case "modulus": {
      const r = modulus(a);
      steps.push(`|z| = √(${fmt(a.re, s)}² + ${fmt(a.im, s)}²)`);
      steps.push(`    = √(${fmt(a.re * a.re, s)} + ${fmt(a.im * a.im, s)})`);
      steps.push(`    = √${fmt(a.re * a.re + a.im * a.im, s)}`);
      return { result: `|z₁| = ${fmt(r, s)}`, steps };
    }
    case "demoivre": {
      const mod = modulus(a);
      const arg = argument(a);
      const nArg = n * arg;
      const r = power(a, n);
      steps.push(`De Moivre: [r(cosθ + i·sinθ)]^n = r^n · (cos(nθ) + i·sin(nθ))`);
      steps.push(`r = ${fmt(mod, s)},  θ = ${fmtAngle(arg, s)}`);
      steps.push(`r^${n} = ${fmt(Math.pow(mod, n), s)},  nθ = ${n}×${fmtAngle(arg, s)} = ${fmtAngle(nArg, s)}`);
      return { result: fmtComplex(r, s), steps };
    }
    default:
      return { result: "", steps: [] };
  }
}

const OPS: { value: ComplexOp; label: string; needsB: boolean; needsN: boolean; bLabel?: string }[] = [
  { value: "add", label: "z₁ + z₂", needsB: true, needsN: false },
  { value: "subtract", label: "z₁ − z₂", needsB: true, needsN: false },
  { value: "multiply", label: "z₁ × z₂", needsB: true, needsN: false },
  { value: "divide", label: "z₁ ÷ z₂", needsB: true, needsN: false },
  { value: "power", label: "z₁ ^ n", needsB: false, needsN: true },
  { value: "sqrt", label: "√z₁", needsB: false, needsN: false },
  { value: "modulus", label: "|z₁| (Modulus)", needsB: false, needsN: false },
  { value: "conjugate", label: "z̄₁ (Conjugate)", needsB: false, needsN: false },
  { value: "polar", label: "→ Polar Form (r, θ)", needsB: false, needsN: false },
  { value: "rect", label: "Polar → Rectangular", needsB: true, needsN: false, bLabel: "r  and  θ (degrees) as 'real + imag'" },
  { value: "demoivre", label: "De Moivre's Theorem", needsB: false, needsN: true },
];

export function ComplexCalculator() {
  const settings = useSettings();
  const [op, setOp] = useState<ComplexOp>("add");
  const [a1, setA1] = useState("3");
  const [b1, setB1] = useState("4");
  const [a2, setA2] = useState("1");
  const [b2, setB2] = useState("-2");
  const [n, setN] = useState("3");
  const [result, setResult] = useState<{ result: string; steps: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSteps, setShowSteps] = useState(settings.showSteps);

  useEffect(() => setShowSteps(settings.showSteps), [settings.showSteps]);

  const currentOp = OPS.find(o => o.value === op)!;

  const calculate = () => {
    try {
      setError(null);
      const za = parseComplex(a1, b1);
      const zb = parseComplex(a2, b2);
      const nParsed = parseFloat(n);
      const nVal = Number.isNaN(nParsed) ? 2 : nParsed;
      setResult(compute(op, za, zb, nVal, settings));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
      setResult(null);
    }
  };

  useAutoRun([op, a1, b1, a2, b2, n, settings.numberForm, settings.decimalPlaces, settings.useRadians], calculate, settings.autoCalculate);

  return (
    <div className="space-y-6">
      <Card className="border-border/50 shadow-lg">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Zap className="h-5 w-5 text-primary" />
            Complex Number Calculator
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs">Operation</Label>
            <Select value={op} onValueChange={v => { setOp(v as ComplexOp); setResult(null); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {OPS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">z₁ = a + bi</Label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Real (a)</Label>
                  <Input value={a1} onChange={e => setA1(e.target.value)} className="font-mono" placeholder="3" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Imaginary (b)</Label>
                  <Input value={b1} onChange={e => setB1(e.target.value)} className="font-mono" placeholder="4" />
                </div>
              </div>
            </div>

            {currentOp.needsB && (
              <div className="space-y-1">
                <Label className="text-xs">
                  {currentOp.bLabel ?? "z₂ = c + di"}
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Real (c)</Label>
                    <Input value={a2} onChange={e => setA2(e.target.value)} className="font-mono" placeholder="1" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Imaginary (d)</Label>
                    <Input value={b2} onChange={e => setB2(e.target.value)} className="font-mono" placeholder="-2" />
                  </div>
                </div>
              </div>
            )}

            {currentOp.needsN && (
              <div className="space-y-1">
                <Label className="text-xs">Exponent n</Label>
                <Input value={n} onChange={e => setN(e.target.value)} className="font-mono w-28" placeholder="3" type="number" />
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Switch checked={showSteps} onCheckedChange={setShowSteps} />
            Step-by-step
          </label>

          {!settings.autoCalculate && (
            <Button onClick={calculate} className="w-full gap-2">
              <Zap className="h-4 w-4" /> Calculate
            </Button>
          )}
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive/20">
          <CardContent className="pt-4 text-destructive text-sm">{error}</CardContent>
        </Card>
      )}

      {result && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <Card className="border-primary/20 shadow-lg">
          <CardContent className="pt-6 space-y-4">
            <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
              <div className="text-sm text-muted-foreground mb-1">Result</div>
              <div className="text-xl font-mono font-semibold">
                <MathText text={result.result} />
              </div>
            </div>
            <StepsReveal steps={result.steps} show={showSteps} resetKey={result.result} />
          </CardContent>
        </Card>
        </motion.div>
      )}
    </div>
  );
}
