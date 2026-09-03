import { useState, useEffect , useCallback } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Pentagon } from "lucide-react";
import { StepsReveal } from "./StepsReveal";
import { useSettings } from "@/contexts/SettingsContext";
import { useAutoRun } from "@/hooks/useAutoRun";
import { formatNumber } from "@/lib/number-format";

type Shape = "circle" | "rectangle" | "triangle" | "trapezoid" | "parallelogram" | "ellipse" | "rhombus" | "sector" | "ring";

interface ShapeResult {
  area: number | null;
  perimeter: number | null;
  perimeterNote?: string;
  steps: string[];
  error?: string;
}

function calcShape(shape: Shape, params: Record<string, number>, fmt: (n: number) => string): ShapeResult {
  const steps: string[] = [];

  try {
    switch (shape) {
      case "circle": {
        const { r } = params;
        steps.push(`##Given\nA circle with radius $r = ${r}$.`);
        steps.push(`##Area\n$$A = \\pi r^2 = \\pi(${r})^2 = ${fmt(Math.PI * r * r)}$$`);
        const perimeter = 2 * Math.PI * r;
        steps.push(`##Circumference\n$$C = 2\\pi r = 2\\pi(${r}) = ${fmt(perimeter)}$$`);
        const area = Math.PI * r * r;
        return { area, perimeter, steps };
      }
      case "rectangle": {
        const { l, w } = params;
        steps.push(`##Given\nA rectangle with length $${l}$ and width $${w}$.`);
        const area = l * w;
        steps.push(`##Area\n$$A = l \\times w = ${l}\\times ${w} = ${fmt(area)}$$`);
        const perimeter = 2 * (l + w);
        steps.push(`##Perimeter\n$$P = 2(l+w) = 2(${l}+${w}) = ${fmt(perimeter)}$$`);
        return { area, perimeter, steps };
      }
      case "triangle": {
        const { a, b, c } = params;
        if (a + b <= c || a + c <= b || b + c <= a) {
          return { area: null, perimeter: null, steps: [], error: "These three sides can't form a triangle (triangle inequality violated)" };
        }
        steps.push(`##Given\nA triangle with sides $a=${a}$, $b=${b}$, $c=${c}$.`);
        const s = (a + b + c) / 2;
        steps.push(`##Semi-Perimeter\n$$s = \\frac{a+b+c}{2} = ${s}$$`);
        const areaVal = Math.sqrt(s * (s - a) * (s - b) * (s - c));
        steps.push(`##Heron's Formula\n$$A = \\sqrt{s(s-a)(s-b)(s-c)} = \\sqrt{${s}\\times ${fmt(s - a)}\\times ${fmt(s - b)}\\times ${fmt(s - c)}} = ${fmt(areaVal)}$$`);
        const perimeter = a + b + c;
        steps.push(`##Perimeter\n$$P = a+b+c = ${fmt(perimeter)}$$`);
        return { area: areaVal, perimeter, steps };
      }
      case "trapezoid": {
        const { a, b, h } = params;
        steps.push(`##Given\nA trapezoid with parallel sides $a=${a}$, $b=${b}$, and height $h=${h}$.`);
        const area = 0.5 * (a + b) * h;
        steps.push(`##Area\n$$A = \\frac{1}{2}(a+b)h = \\frac{1}{2}(${a}+${b})(${h}) = ${fmt(area)}$$`);
        return { area, perimeter: null, perimeterNote: "Need all 4 sides", steps };
      }
      case "parallelogram": {
        const { b, h } = params;
        steps.push(`##Given\nA parallelogram with base $b=${b}$ and height $h=${h}$.`);
        const area = b * h;
        steps.push(`##Area\n$$A = b \\times h = ${b}\\times ${h} = ${fmt(area)}$$`);
        return { area, perimeter: null, perimeterNote: "Need all sides", steps };
      }
      case "ellipse": {
        const { a, b } = params;
        steps.push(`##Given\nAn ellipse with semi-major axis $a=${a}$ and semi-minor axis $b=${b}$.`);
        const area = Math.PI * a * b;
        steps.push(`##Area\n$$A = \\pi a b = \\pi(${a})(${b}) = ${fmt(area)}$$`);
        const peri = Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
        steps.push(`##Perimeter (Ramanujan's Approximation)\n$$P \\approx \\pi\\left[3(a+b) - \\sqrt{(3a+b)(a+3b)}\\right] \\approx ${fmt(peri)}$$`);
        return { area, perimeter: peri, steps };
      }
      case "rhombus": {
        const { d1, d2 } = params;
        steps.push(`##Given\nA rhombus with diagonals $d_1=${d1}$ and $d_2=${d2}$.`);
        const area = 0.5 * d1 * d2;
        steps.push(`##Area\n$$A = \\frac{1}{2}d_1 d_2 = \\frac{1}{2}(${d1})(${d2}) = ${fmt(area)}$$`);
        const side = Math.sqrt((d1 / 2) ** 2 + (d2 / 2) ** 2);
        steps.push(`##Side Length\nEach side is the hypotenuse of a right triangle formed by half of each diagonal:\n$$s = \\sqrt{\\left(\\frac{d_1}{2}\\right)^2 + \\left(\\frac{d_2}{2}\\right)^2} = ${fmt(side)}$$`);
        const perimeter = 4 * side;
        steps.push(`##Perimeter\n$$P = 4s = ${fmt(perimeter)}$$`);
        return { area, perimeter, steps };
      }
      case "sector": {
        const { r, theta } = params;
        if (theta <= 0 || theta > 360) {
          return { area: null, perimeter: null, steps: [], error: "Angle must be between 0° and 360° (exclusive)" };
        }
        steps.push(`##Given\nA circle sector with radius $r=${r}$ and angle $\\theta = ${theta}°$.`);
        const rad = theta * Math.PI / 180;
        steps.push(`##Convert Angle to Radians\n$$\\theta = ${theta}° = ${rad.toFixed(6)}\\text{ rad}$$`);
        const area = 0.5 * r * r * rad;
        steps.push(`##Area\n$$A = \\frac{1}{2}r^2\\theta = \\frac{1}{2}(${r})^2(${rad.toFixed(4)}) = ${fmt(area)}$$`);
        const arc = r * rad;
        steps.push(`##Arc Length\n$$s = r\\theta = ${fmt(arc)}$$`);
        const perimeter = 2 * r + arc;
        steps.push(`##Perimeter\n$$P = 2r + s = ${fmt(perimeter)}$$`);
        return { area, perimeter, steps };
      }
      case "ring": {
        const { R, r } = params;
        if (r >= R) {
          return { area: null, perimeter: null, steps: [], error: "Inner radius must be strictly less than outer radius (r < R)" };
        }
        steps.push(`##Given\nA ring (annulus) with outer radius $R=${R}$ and inner radius $r=${r}$.`);
        const area = Math.PI * (R * R - r * r);
        steps.push(`##Area\n$$A = \\pi(R^2 - r^2) = \\pi\\left[(${R})^2 - (${r})^2\\right] = ${fmt(area)}$$`);
        return { area, perimeter: null, perimeterNote: `Outer: ${fmt(2 * Math.PI * R)}, Inner: ${fmt(2 * Math.PI * r)}`, steps };
      }
      default:
        return { area: null, perimeter: null, steps: [], error: "Unknown shape" };
    }
  } catch {
    return { area: null, perimeter: null, steps: [], error: "Invalid input values" };
  }
}

const shapeFields: Record<Shape, { label: string; key: string; placeholder: string }[]> = {
  circle: [{ label: "Radius", key: "r", placeholder: "5" }],
  rectangle: [{ label: "Length", key: "l", placeholder: "6" }, { label: "Width", key: "w", placeholder: "4" }],
  triangle: [{ label: "Side a", key: "a", placeholder: "3" }, { label: "Side b", key: "b", placeholder: "4" }, { label: "Side c", key: "c", placeholder: "5" }],
  trapezoid: [{ label: "Side a (top)", key: "a", placeholder: "4" }, { label: "Side b (bottom)", key: "b", placeholder: "8" }, { label: "Height", key: "h", placeholder: "5" }],
  parallelogram: [{ label: "Base", key: "b", placeholder: "6" }, { label: "Height", key: "h", placeholder: "4" }],
  ellipse: [{ label: "Semi-major (a)", key: "a", placeholder: "5" }, { label: "Semi-minor (b)", key: "b", placeholder: "3" }],
  rhombus: [{ label: "Diagonal 1", key: "d1", placeholder: "6" }, { label: "Diagonal 2", key: "d2", placeholder: "8" }],
  sector: [{ label: "Radius", key: "r", placeholder: "5" }, { label: "Angle (°)", key: "theta", placeholder: "90" }],
  ring: [{ label: "Outer Radius (R)", key: "R", placeholder: "8" }, { label: "Inner Radius (r)", key: "r", placeholder: "5" }],
};

export function ShapesCalculator() {
  const settings = useSettings();
  const [shape, setShape] = useState<Shape>("circle");
  const [values, setValues] = useState<Record<string, string>>({ r: "5" });
  const [result, setResult] = useState<ShapeResult | null>(null);
  const [showSteps, setShowSteps] = useState(settings.showSteps);

  useEffect(() => setShowSteps(settings.showSteps), [settings.showSteps]);

  const handleShapeChange = (s: Shape) => {
    setShape(s);
    const defaults: Record<string, string> = {};
    shapeFields[s].forEach(f => { defaults[f.key] = f.placeholder; });
    setValues(defaults);
    setResult(null);
  };

  const solve = useCallback(() => {
    const params: Record<string, number> = {};
    for (const f of shapeFields[shape]) {
      params[f.key] = parseFloat(values[f.key] || "0");
      if (isNaN(params[f.key]) || params[f.key] <= 0) {
        setResult({ area: null, perimeter: null, steps: [], error: `${f.label} must be a positive number` });
        return;
      }
    }
    setResult(calcShape(shape, params, (n) => formatNumber(n, settings)));
  }, [shape, values, settings]);

  useAutoRun([shape, JSON.stringify(values)], solve, settings.autoCalculate);

  return (
    <div className="space-y-6">
      <Card className="border-border/50 shadow-lg">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Pentagon className="h-5 w-5 text-primary" />
            Shapes Area & Perimeter
          </CardTitle>
        </CardHeader>
        <CardContent
          className="space-y-4"
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); solve(); }
          }}
        >
          <div className="space-y-1">
            <Label className="text-xs">Select Shape</Label>
            <Select value={shape} onValueChange={(v) => handleShapeChange(v as Shape)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="circle">Circle</SelectItem>
                <SelectItem value="rectangle">Rectangle</SelectItem>
                <SelectItem value="triangle">Triangle</SelectItem>
                <SelectItem value="trapezoid">Trapezoid</SelectItem>
                <SelectItem value="parallelogram">Parallelogram</SelectItem>
                <SelectItem value="ellipse">Ellipse</SelectItem>
                <SelectItem value="rhombus">Rhombus</SelectItem>
                <SelectItem value="sector">Circle Sector</SelectItem>
                <SelectItem value="ring">Ring (Annulus)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {shapeFields[shape].map(f => (
              <div key={f.key} className="space-y-1">
                <Label className="text-xs">{f.label}</Label>
                <Input
                  type="number"
                  value={values[f.key] || ""}
                  onChange={(e) => setValues(prev => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  className="font-mono text-center"
                  onKeyDown={(e) => e.key === "Enter" && solve()}
                />
              </div>
            ))}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Switch checked={showSteps} onCheckedChange={setShowSteps} />
            Step-by-step
          </label>

          {!settings.autoCalculate && (
            <Button onClick={solve} className="w-full gap-2">
              <Pentagon className="h-4 w-4" /> Calculate
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
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
                    <div className="text-xs text-muted-foreground mb-1">Area</div>
                    <div className="text-lg font-mono font-semibold">
                      {result.area !== null ? formatNumber(result.area, settings) : "—"}
                    </div>
                  </div>
                  <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
                    <div className="text-xs text-muted-foreground mb-1">Perimeter</div>
                    <div className="text-lg font-mono font-semibold">
                      {result.perimeter !== null ? formatNumber(result.perimeter, settings) : (result.perimeterNote ?? "—")}
                    </div>
                  </div>
                </div>

                <StepsReveal steps={result.steps} show={showSteps} resetKey={`${result.area}-${result.perimeter}`} />
              </>
            )}
          </CardContent>
        </Card>
        </motion.div>
      )}
    </div>
  );
}
