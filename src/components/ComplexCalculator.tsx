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

/** Same as fmtComplex but with the sign-splitting done for LaTeX embedding
 *  (avoids "3 + -4i" when the imaginary part is negative). */
function czLatex(c: Complex, s: Settings): string {
  if (Math.abs(c.im) < 1e-10) return fmt(c.re, s);
  if (Math.abs(c.re) < 1e-10) return `${fmt(c.im, s)}i`;
  const sign = c.im < 0 ? "-" : "+";
  return `${fmt(c.re, s)} ${sign} ${fmt(Math.abs(c.im), s)}i`;
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
  const givenParts = [`z_1 = ${czLatex(a, s)}`];
  if (!["sqrt", "polar", "conjugate", "modulus", "demoivre"].includes(op)) {
    givenParts.push(`z_2 = ${czLatex(b, s)}`);
  }
  steps.push(`##Given\n$$${givenParts.join(", \\quad ")}$$`);

  switch (op) {
    case "add": {
      const r = add(a, b);
      steps.push(`##Add Real and Imaginary Parts Separately\n$$z_1 + z_2 = (${fmt(a.re, s)} + ${fmt(b.re, s)}) + (${fmt(a.im, s)} + ${fmt(b.im, s)})i = ${czLatex(r, s)}$$`);
      return { result: fmtComplex(r, s), steps };
    }
    case "subtract": {
      const r = sub(a, b);
      steps.push(`##Subtract Real and Imaginary Parts Separately\n$$z_1 - z_2 = (${fmt(a.re, s)} - ${fmt(b.re, s)}) + (${fmt(a.im, s)} - ${fmt(b.im, s)})i = ${czLatex(r, s)}$$`);
      return { result: fmtComplex(r, s), steps };
    }
    case "multiply": {
      const r = mul(a, b);
      steps.push(`##FOIL, Using $i^2 = -1$\n$$(a+bi)(c+di) = (ac-bd) + (ad+bc)i$$`);
      steps.push(`##Substitute the Values\n$$z_1 z_2 = (${fmt(a.re, s)}\\cdot ${fmt(b.re, s)} - ${fmt(a.im, s)}\\cdot ${fmt(b.im, s)}) + (${fmt(a.re, s)}\\cdot ${fmt(b.im, s)} + ${fmt(a.im, s)}\\cdot ${fmt(b.re, s)})i = ${czLatex(r, s)}$$`);
      return { result: fmtComplex(r, s), steps };
    }
    case "divide": {
      const r = div(a, b);
      const denom = b.re * b.re + b.im * b.im;
      steps.push(`##Multiply by the Conjugate\nMultiply numerator and denominator by the conjugate of $z_2$, $\\overline{z_2} = ${czLatex(conjugate(b), s)}$, to clear the imaginary part from the denominator:\n$$|z_2|^2 = ${fmt(denom, s)}$$`);
      steps.push(`##Result\n$$\\frac{z_1}{z_2} = ${czLatex(r, s)}$$`);
      return { result: fmtComplex(r, s), steps };
    }
    case "power": {
      const r = power(a, n);
      const mod = modulus(a);
      const arg = argument(a);
      steps.push(`##Convert to Polar Form\n$$|z_1| = ${fmt(mod, s)}, \\qquad \\arg(z_1) = ${fmtAngle(arg, s)}$$`);
      steps.push(`##Apply $z^n = |z|^n(\\cos(n\\theta) + i\\sin(n\\theta))$\n$$z_1^{${n}} = ${fmt(mod, s)}^{${n}}\\left(\\cos(${fmt(n * arg, s)}) + i\\sin(${fmt(n * arg, s)})\\right) = ${czLatex(r, s)}$$`);
      return { result: fmtComplex(r, s), steps };
    }
    case "sqrt": {
      const r = sqrtComplex(a);
      steps.push(`##Principal Square Root Formula\n$$\\sqrt{z} = \\sqrt{\\frac{|z|+\\operatorname{Re}(z)}{2}} + i\\cdot\\operatorname{sign}(\\operatorname{Im}(z))\\sqrt{\\frac{|z|-\\operatorname{Re}(z)}{2}}$$`);
      steps.push(`##Substitute\n$|z_1| = ${fmt(modulus(a), s)}$:\n$$\\sqrt{z_1} = ${czLatex(r, s)}$$`);
      return { result: `${fmtComplex(r, s)}  (principal root)`, steps };
    }
    case "polar": {
      const r = modulus(a);
      const theta = argument(a);
      steps.push(`##Modulus\n$$r = \\sqrt{(${fmt(a.re, s)})^2 + (${fmt(a.im, s)})^2} = ${fmt(r, s)}$$`);
      steps.push(`##Argument\n$$\\theta = \\operatorname{atan2}(${fmt(a.im, s)}, ${fmt(a.re, s)}) = ${fmtAngle(theta, s)}$$`);
      return { result: `r = ${fmt(r, s)},  θ = ${fmtAngle(theta, s)}`, steps };
    }
    case "rect": {
      const r = b.re;
      const theta = b.im * (Math.PI / 180);
      const re = r * Math.cos(theta);
      const im = r * Math.sin(theta);
      steps.push(`##Given (Polar Form)\n$$r = ${fmt(r, s)}, \\qquad \\theta = ${fmt(b.im, s)}°$$`);
      steps.push(`##Convert Using $x = r\\cos\\theta$, $y = r\\sin\\theta$\n$$\\operatorname{Re} = ${fmt(r, s)}\\cdot\\cos(\\theta) = ${fmt(re, s)}$$\n$$\\operatorname{Im} = ${fmt(r, s)}\\cdot\\sin(\\theta) = ${fmt(im, s)}$$`);
      return { result: fmtComplex({ re, im }, s), steps };
    }
    case "conjugate": {
      steps.push(`##Flip the Sign of the Imaginary Part\n$$\\overline{z_1} = ${czLatex(conjugate(a), s)}$$`);
      return { result: fmtComplex(conjugate(a), s), steps };
    }
    case "modulus": {
      const r = modulus(a);
      steps.push(`##Modulus Formula\n$$|z| = \\sqrt{\\operatorname{Re}(z)^2 + \\operatorname{Im}(z)^2}$$`);
      steps.push(`##Substitute\n$$|z_1| = \\sqrt{(${fmt(a.re, s)})^2 + (${fmt(a.im, s)})^2} = \\sqrt{${fmt(a.re * a.re, s)} + ${fmt(a.im * a.im, s)}} = ${fmt(r, s)}$$`);
      return { result: `|z₁| = ${fmt(r, s)}`, steps };
    }
    case "demoivre": {
      const mod = modulus(a);
      const arg = argument(a);
      const nArg = n * arg;
      const r = power(a, n);
      steps.push(`##De Moivre's Theorem\n$$\\left[r(\\cos\\theta + i\\sin\\theta)\\right]^n = r^n\\left(\\cos(n\\theta) + i\\sin(n\\theta)\\right)$$`);
      steps.push(`##Convert to Polar Form\n$$r = ${fmt(mod, s)}, \\qquad \\theta = ${fmtAngle(arg, s)}$$`);
      steps.push(`##Raise to the $n$th Power\n$$r^{${n}} = ${fmt(Math.pow(mod, n), s)}, \\qquad n\\theta = ${n}\\times ${fmtAngle(arg, s)} = ${fmtAngle(nArg, s)}$$`);
      steps.push(`##Result\n$$z_1^{${n}} = ${czLatex(r, s)}$$`);
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
        <CardContent
          className="space-y-4"
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); calculate(); }
          }}
        >
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
