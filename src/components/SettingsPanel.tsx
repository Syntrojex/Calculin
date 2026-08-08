import { useState } from "react";
import { motion } from "framer-motion";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  Settings as SettingsIcon,
  Sun,
  Moon,
  Check,
  RotateCcw,
  Hash,
  Sigma,
  FlaskConical,
  Gauge,
  LineChart,
} from "lucide-react";
import { useSettings, type AccentColor, type AnimationSpeed } from "@/contexts/SettingsContext";
import type { NumberForm } from "@/lib/number-format";

const ACCENTS: { id: AccentColor; label: string; swatch: string }[] = [
  { id: "indigo", label: "Indigo", swatch: "oklch(0.55 0.25 265)" },
  { id: "purple", label: "Purple", swatch: "oklch(0.55 0.24 304)" },
  { id: "emerald", label: "Emerald", swatch: "oklch(0.55 0.15 155)" },
  { id: "rose", label: "Rose", swatch: "oklch(0.58 0.22 12)" },
  { id: "amber", label: "Amber", swatch: "oklch(0.62 0.17 75)" },
];

const NUMBER_FORMS: { id: NumberForm; label: string; icon: typeof Hash }[] = [
  { id: "decimal", label: "Decimal", icon: Hash },
  { id: "fraction", label: "Fraction", icon: Sigma },
  { id: "scientific", label: "Scientific", icon: FlaskConical },
];

const SPEEDS: { id: AnimationSpeed; label: string }[] = [
  { id: "slow", label: "Slow" },
  { id: "normal", label: "Normal" },
  { id: "fast", label: "Fast" },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
      {children}
    </h3>
  );
}

const rowVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.04, duration: 0.3, ease: [0.16, 1, 0.3, 1] as const },
  }),
};

export function SettingsPanel() {
  const s = useSettings();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          aria-label="Open settings"
        >
          <motion.span
            animate={open ? { rotate: 90 } : { rotate: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="flex"
          >
            <SettingsIcon className="h-5 w-5" />
          </motion.span>
        </Button>
      </SheetTrigger>

      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <SettingsIcon className="h-5 w-5 text-primary" />
            Settings
          </SheetTitle>
          <SheetDescription>
            Customize how Calculin looks and calculates. Saved automatically on this device.
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-8 space-y-6 mt-2">
          {/* Appearance */}
          <motion.div custom={0} initial="hidden" animate="visible" variants={rowVariants}>
            <SectionLabel>Appearance</SectionLabel>
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={() => s.update("theme", "light")}
                className={`flex-1 flex items-center justify-center gap-2 rounded-lg border py-2 text-sm font-medium transition-all ${
                  s.theme === "light"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted/50"
                }`}
              >
                <Sun className="h-4 w-4" /> Light
              </button>
              <button
                onClick={() => s.update("theme", "dark")}
                className={`flex-1 flex items-center justify-center gap-2 rounded-lg border py-2 text-sm font-medium transition-all ${
                  s.theme === "dark"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted/50"
                }`}
              >
                <Moon className="h-4 w-4" /> Dark
              </button>
            </div>

            <Label className="text-xs text-muted-foreground mb-2 block">Accent Color</Label>
            <div className="flex items-center gap-3">
              {ACCENTS.map((a) => (
                <button
                  key={a.id}
                  onClick={() => s.update("accent", a.id)}
                  title={a.label}
                  aria-label={a.label}
                  className="relative h-9 w-9 rounded-full flex items-center justify-center transition-transform hover:scale-110 active:scale-95"
                  style={{ backgroundColor: a.swatch }}
                >
                  {s.accent === a.id && <Check className="h-4 w-4 text-white drop-shadow" />}
                </button>
              ))}
            </div>
          </motion.div>

          <Separator />

          {/* Number format */}
          <motion.div custom={1} initial="hidden" animate="visible" variants={rowVariants}>
            <SectionLabel>Number Format</SectionLabel>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {NUMBER_FORMS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => s.update("numberForm", id)}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border py-2.5 text-xs font-medium transition-all ${
                    s.numberForm === id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>

            {s.numberForm === "decimal" && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-xs text-muted-foreground">Decimal Places</Label>
                  <span className="text-xs font-mono font-semibold text-primary">{s.decimalPlaces}</span>
                </div>
                <Slider
                  value={[s.decimalPlaces]}
                  onValueChange={([v]) => s.update("decimalPlaces", v)}
                  min={1}
                  max={10}
                  step={1}
                />
              </motion.div>
            )}
          </motion.div>

          <Separator />

          {/* Calculator behavior */}
          <motion.div custom={2} initial="hidden" animate="visible" variants={rowVariants} className="space-y-4">
            <SectionLabel>Calculator Behavior</SectionLabel>

            <SettingRow
              label="Show Steps"
              description="Display step-by-step solutions by default"
              checked={s.showSteps}
              onChange={(v) => s.update("showSteps", v)}
            />
            <SettingRow
              label="Auto Calculate"
              description="Solve automatically while you type"
              checked={s.autoCalculate}
              onChange={(v) => s.update("autoCalculate", v)}
            />
            <SettingRow
              label="Use Radians"
              description={s.useRadians ? "Angles shown in radians" : "Angles shown in degrees"}
              checked={s.useRadians}
              onChange={(v) => s.update("useRadians", v)}
            />
            <SettingRow
              label="Always Show Graphs"
              description="Plot a graph automatically where available"
              checked={s.alwaysShowGraphs}
              onChange={(v) => s.update("alwaysShowGraphs", v)}
            />
          </motion.div>

          <Separator />

          {/* Graphing & Animation */}
          <motion.div custom={2.5} initial="hidden" animate="visible" variants={rowVariants}>
            <SectionLabel>Graphing & Animation</SectionLabel>

            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <LineChart className="h-3.5 w-3.5" /> Default Graph Range (±)
              </Label>
              <span className="text-xs font-mono font-semibold text-primary">{s.defaultGraphRange}</span>
            </div>
            <Slider
              value={[s.defaultGraphRange]}
              onValueChange={([v]) => s.update("defaultGraphRange", v)}
              min={2}
              max={50}
              step={1}
              className="mb-4"
            />

            <Label className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
              <Gauge className="h-3.5 w-3.5" /> Step Animation Speed
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {SPEEDS.map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => s.update("animationSpeed", id)}
                  className={`rounded-lg border py-2 text-xs font-medium transition-all ${
                    s.animationSpeed === id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </motion.div>

          <Separator />

          <motion.div custom={3} initial="hidden" animate="visible" variants={rowVariants}>
            <Button
              variant="outline"
              className="w-full gap-2 text-muted-foreground"
              onClick={() => s.resetDefaults()}
            >
              <RotateCcw className="h-4 w-4" />
              Reset to Defaults
            </Button>
          </motion.div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SettingRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <div className="shrink-0">
        <Switch checked={checked} onCheckedChange={onChange} />
      </div>
    </div>
  );
}

function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return <label className={className}>{children}</label>;
}
