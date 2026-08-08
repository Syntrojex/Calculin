import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeftRight } from "lucide-react";
import { StepsReveal } from "./StepsReveal";
import { useSettings } from "@/contexts/SettingsContext";
import { useAutoRun } from "@/hooks/useAutoRun";
import { formatNumber } from "@/lib/number-format";

type Category = "length" | "weight" | "temperature" | "speed" | "area";

const units: Record<Category, { name: string; toBase: (v: number) => number; fromBase: (v: number) => number }[]> = {
  length: [
    { name: "Meters (m)", toBase: (v) => v, fromBase: (v) => v },
    { name: "Kilometers (km)", toBase: (v) => v * 1000, fromBase: (v) => v / 1000 },
    { name: "Centimeters (cm)", toBase: (v) => v / 100, fromBase: (v) => v * 100 },
    { name: "Millimeters (mm)", toBase: (v) => v / 1000, fromBase: (v) => v * 1000 },
    { name: "Miles", toBase: (v) => v * 1609.344, fromBase: (v) => v / 1609.344 },
    { name: "Feet (ft)", toBase: (v) => v * 0.3048, fromBase: (v) => v / 0.3048 },
    { name: "Inches (in)", toBase: (v) => v * 0.0254, fromBase: (v) => v / 0.0254 },
    { name: "Yards (yd)", toBase: (v) => v * 0.9144, fromBase: (v) => v / 0.9144 },
  ],
  weight: [
    { name: "Kilograms (kg)", toBase: (v) => v, fromBase: (v) => v },
    { name: "Grams (g)", toBase: (v) => v / 1000, fromBase: (v) => v * 1000 },
    { name: "Milligrams (mg)", toBase: (v) => v / 1e6, fromBase: (v) => v * 1e6 },
    { name: "Pounds (lb)", toBase: (v) => v * 0.453592, fromBase: (v) => v / 0.453592 },
    { name: "Ounces (oz)", toBase: (v) => v * 0.0283495, fromBase: (v) => v / 0.0283495 },
    { name: "Metric Tons", toBase: (v) => v * 1000, fromBase: (v) => v / 1000 },
  ],
  temperature: [
    { name: "Celsius (°C)", toBase: (v) => v, fromBase: (v) => v },
    { name: "Fahrenheit (°F)", toBase: (v) => (v - 32) * 5 / 9, fromBase: (v) => v * 9 / 5 + 32 },
    { name: "Kelvin (K)", toBase: (v) => v - 273.15, fromBase: (v) => v + 273.15 },
  ],
  speed: [
    { name: "m/s", toBase: (v) => v, fromBase: (v) => v },
    { name: "km/h", toBase: (v) => v / 3.6, fromBase: (v) => v * 3.6 },
    { name: "mph", toBase: (v) => v * 0.44704, fromBase: (v) => v / 0.44704 },
    { name: "knots", toBase: (v) => v * 0.514444, fromBase: (v) => v / 0.514444 },
  ],
  area: [
    { name: "m²", toBase: (v) => v, fromBase: (v) => v },
    { name: "km²", toBase: (v) => v * 1e6, fromBase: (v) => v / 1e6 },
    { name: "ft²", toBase: (v) => v * 0.092903, fromBase: (v) => v / 0.092903 },
    { name: "acres", toBase: (v) => v * 4046.86, fromBase: (v) => v / 4046.86 },
    { name: "hectares", toBase: (v) => v * 10000, fromBase: (v) => v / 10000 },
  ],
};

export function UnitConverter() {
  const settings = useSettings();
  const [category, setCategory] = useState<Category>("length");
  const [fromIdx, setFromIdx] = useState("0");
  const [toIdx, setToIdx] = useState("1");
  const [value, setValue] = useState("1");
  const [result, setResult] = useState<{ from: string; to: string; converted: number; base: number; baseUnitName: string; steps: string[] } | string | null>(null);

  const convert = () => {
    const v = parseFloat(value);
    if (isNaN(v)) { setResult("Enter a valid number"); return; }
    const from = units[category][parseInt(fromIdx)];
    const to = units[category][parseInt(toIdx)];
    const base = from.toBase(v);
    const converted = to.fromBase(base);
    const baseUnitName = units[category][0].name;
    const steps = [
      `Convert ${v} ${from.name} to ${baseUnitName}: ${v} → ${formatNumber(base, settings)} ${baseUnitName}`,
      `Convert ${formatNumber(base, settings)} ${baseUnitName} to ${to.name}: ${formatNumber(base, settings)} → ${formatNumber(converted, settings)} ${to.name}`,
    ];
    setResult({ from: from.name, to: to.name, converted, base, baseUnitName, steps });
  };

  useAutoRun([category, fromIdx, toIdx, value], convert, settings.autoCalculate, 250);

  const swap = () => {
    setFromIdx(toIdx);
    setToIdx(fromIdx);
  };

  return (
    <div className="space-y-6">
      <Card className="border-border/50 shadow-lg">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ArrowLeftRight className="h-5 w-5 text-primary" />
            Unit Converter
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs">Category</Label>
            <Select value={category} onValueChange={(v) => { setCategory(v as Category); setFromIdx("0"); setToIdx("1"); setResult(null); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="length">Length</SelectItem>
                <SelectItem value="weight">Weight</SelectItem>
                <SelectItem value="temperature">Temperature</SelectItem>
                <SelectItem value="speed">Speed</SelectItem>
                <SelectItem value="area">Area</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Value</Label>
            <Input value={value} onChange={(e) => setValue(e.target.value)} type="number" className="font-mono text-center" onKeyDown={(e) => e.key === "Enter" && convert()} />
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-end">
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Select value={fromIdx} onValueChange={setFromIdx}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {units[category].map((u, i) => (
                    <SelectItem key={i} value={i.toString()}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="ghost" size="icon" onClick={swap} className="mb-0.5" aria-label="Swap units">
              <ArrowLeftRight className="h-4 w-4" />
            </Button>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Select value={toIdx} onValueChange={setToIdx}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {units[category].map((u, i) => (
                    <SelectItem key={i} value={i.toString()}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {!settings.autoCalculate && (
            <Button onClick={convert} className="w-full gap-2">
              <ArrowLeftRight className="h-4 w-4" /> Convert
            </Button>
          )}
        </CardContent>
      </Card>

      {result && (
        <motion.div key={typeof result === "string" ? result : result.converted} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          <Card className="shadow-lg border-border/50">
            <CardContent className="pt-6">
              {typeof result === "string" ? (
                <p className="text-center text-destructive font-medium">{result}</p>
              ) : (
                <>
                  <p className="text-center text-lg font-mono font-semibold">
                    {value} {result.from} = <span className="text-primary">{formatNumber(result.converted, settings)}</span> {result.to}
                  </p>
                  <StepsReveal steps={result.steps} show={settings.showSteps} resetKey={result.converted} />
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
