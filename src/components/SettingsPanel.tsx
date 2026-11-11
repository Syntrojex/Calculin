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

// Desktop-only polish for the sheet; everything is inside min-width:640px so mobile is untouched.
const SETTINGS_CSS = `
@media (min-width: 640px) {
  .settings-sheet {
    background:
      radial-gradient(420px 170px at 70% 0, color-mix(in oklab, var(--primary) 26%, transparent), transparent 75%),
      color-mix(in oklab, var(--background) 93%, transparent);
    backdrop-filter: blur(22px);
    box-shadow: -30px 0 80px rgba(0,0,0,.35);
  }
  .settings-sheet h2 { font-family: "Instrument Serif", "Cormorant Garamond", Georgia, "Times New Roman", serif; font-weight: 400; font-size: 2.35rem; line-height: 1; letter-spacing: 0; }
  .settings-sheet h2 svg { display: none; }
  .settings-sheet h3 { letter-spacing: .18em; }
  .settings-sheet .set-seg-on { background: linear-gradient(135deg, color-mix(in oklab, var(--primary) 85%, black), color-mix(in oklab, var(--primary) 55%, #35d0ff)); color: #fff; border-color: transparent; box-shadow: 0 6px 20px -6px var(--primary); }
  .settings-sheet .set-tile-on { border-color: var(--primary); box-shadow: 0 0 0 3px color-mix(in oklab, var(--primary) 22%, transparent); }
  .settings-sheet [role="switch"][data-state="checked"] { background: linear-gradient(135deg, var(--primary), color-mix(in oklab, var(--primary) 55%, #35d0ff)); }
  .settings-sheet [role="slider"] { box-shadow: 0 2px 10px rgba(0,0,0,.35), 0 0 0 4px color-mix(in oklab, var(--primary) 28%, transparent); }
}
`;

const NUMBER_SAMPLES: Record<string, string> = { decimal: "0.3333", fraction: "1/3", scientific: "3.33×10⁻¹" };

function SectionLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
      {children}
      {hint && <span className="hidden sm:inline float-right normal-case tracking-normal text-primary">{hint}</span>}
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

      <SheetContent side="right" className="settings-sheet w-full sm:max-w-[460px] overflow-y-auto">
        <style>{SETTINGS_CSS}</style>
        <SheetHeader className="sm:pt-3">
          <SheetTitle className="flex items-center gap-2">
            <SettingsIcon className="h-5 w-5 text-primary" />
            Settings
          </SheetTitle>
          <SheetDescription>
            <span className="sm:hidden">Customize how Calculin looks and calculates. Saved automatically on this device.</span>
            <span className="hidden sm:inline">Saved automatically on this device</span>
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-8 space-y-6 mt-2 sm:mt-5">
          {/* Appearance */}
          <motion.div custom={0} initial="hidden" animate="visible" variants={rowVariants}>
            <SectionLabel>Appearance</SectionLabel>
            <div className="flex items-center gap-2 mb-4 sm:gap-1 sm:p-1 sm:rounded-2xl sm:border sm:bg-muted/30">
              <button
                onClick={() => s.update("theme", "light")}
                className={`flex-1 flex items-center justify-center gap-2 rounded-lg border py-2 text-sm font-medium transition-all sm:rounded-xl sm:py-2.5 ${
                  s.theme === "light"
                    ? "border-primary bg-primary/10 text-primary set-seg-on"
                    : "border-border text-muted-foreground hover:bg-muted/50"
                }`}
              >
                <Sun className="h-4 w-4" /> Light
              </button>
              <button
                onClick={() => s.update("theme", "dark")}
                className={`flex-1 flex items-center justify-center gap-2 rounded-lg border py-2 text-sm font-medium transition-all sm:rounded-xl sm:py-2.5 ${
                  s.theme === "dark"
                    ? "border-primary bg-primary/10 text-primary set-seg-on"
                    : "border-border text-muted-foreground hover:bg-muted/50"
                }`}
              >
                <Moon className="h-4 w-4" /> Dark
              </button>
            </div>

            <Label className="text-xs text-muted-foreground mb-2 block">Accent Color</Label>
            <div className="flex items-center gap-3 sm:gap-2.5">
              {ACCENTS.map((a) => (
                <button
                  key={a.id}
                  onClick={() => s.update("accent", a.id)}
                  title={a.label}
                  aria-label={a.label}
                  className={`relative flex flex-col items-center transition-transform hover:scale-110 active:scale-95 sm:flex-1 sm:gap-1.5 sm:rounded-2xl sm:border sm:bg-muted/30 sm:py-2.5 sm:text-[11px] sm:text-muted-foreground sm:hover:scale-[1.04] ${
                    s.accent === a.id ? "set-tile-on sm:text-foreground" : ""
                  }`}
                >
                  <span
                    className="h-9 w-9 sm:h-7 sm:w-7 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: a.swatch }}
                  >
                    {s.accent === a.id && <Check className="h-4 w-4 sm:h-3.5 sm:w-3.5 text-white drop-shadow" />}
                  </span>
                  <span className="hidden sm:block">{a.label}</span>
                </button>
              ))}
            </div>
          </motion.div>

          <Separator className="sm:hidden" />

          {/* Number format */}
          <motion.div custom={1} initial="hidden" animate="visible" variants={rowVariants}>
            <SectionLabel hint="1 ÷ 3">Number Format</SectionLabel>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {NUMBER_FORMS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => s.update("numberForm", id)}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border py-2.5 text-xs font-medium transition-all sm:items-start sm:rounded-xl sm:px-3 sm:gap-0.5 ${
                    s.numberForm === id
                      ? "border-primary bg-primary/10 text-primary sm:text-foreground"
                      : "border-border text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  <Icon className="h-4 w-4 sm:hidden" />
                  {label}
                  <span className="hidden sm:block font-normal text-[1.15rem] leading-tight" style={{ fontFamily: '"Instrument Serif", Georgia, serif' }}>
                    {NUMBER_SAMPLES[id]}
                  </span>
                </button>
              ))}
            </div>

            {s.numberForm === "decimal" && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="sm:rounded-xl sm:border sm:bg-muted/30 sm:p-4">
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

          <Separator className="sm:hidden" />

          {/* Calculator behavior */}
          <motion.div custom={2} initial="hidden" animate="visible" variants={rowVariants} className="space-y-4">
            <SectionLabel>Calculator Behavior</SectionLabel>

            <div className="space-y-4 sm:space-y-0 sm:rounded-2xl sm:border sm:bg-muted/30 sm:divide-y sm:divide-border">
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
            </div>
          </motion.div>

          <Separator className="sm:hidden" />

          {/* Graphing & Animation */}
          <motion.div custom={2.5} initial="hidden" animate="visible" variants={rowVariants}>
            <SectionLabel>Graphing & Animation</SectionLabel>

            <div className="sm:rounded-xl sm:border sm:bg-muted/30 sm:p-4 sm:mb-3">
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
              className="mb-4 sm:mb-0"
            />
            </div>

            <Label className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
              <Gauge className="h-3.5 w-3.5" /> Step Animation Speed
            </Label>
            <div className="grid grid-cols-3 gap-2 sm:gap-1 sm:p-1 sm:rounded-2xl sm:border sm:bg-muted/30">
              {SPEEDS.map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => s.update("animationSpeed", id)}
                  className={`rounded-lg border py-2 text-xs font-medium transition-all sm:rounded-xl sm:py-2.5 sm:text-[13px] ${
                    s.animationSpeed === id
                      ? "border-primary bg-primary/10 text-primary set-seg-on"
                      : "border-border text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </motion.div>

          <Separator className="sm:hidden" />

          <motion.div custom={3} initial="hidden" animate="visible" variants={rowVariants} className="sm:sticky sm:bottom-0 sm:-mx-4 sm:px-4 sm:py-4 sm:border-t sm:bg-background sm:flex sm:items-center sm:gap-3">
            <span className="hidden sm:block flex-1 text-xs text-muted-foreground">Changes apply instantly</span>
            <Button
              variant="outline"
              className="w-full sm:w-auto gap-2 text-muted-foreground"
              onClick={() => s.resetDefaults()}
            >
              <RotateCcw className="h-4 w-4" />
              Reset to Defaults
            </Button>
          </motion.div>

          {/* Mobile only: footer pages live here now (no footer on the bottom bar) */}
          <div className="sm:hidden pt-2 pb-6">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">About Calculin</div>
            {[
              ["Documentation", "/documentation"],
              ["About", "/about"],
              ["Feedback", "/feedback"],
              ["Privacy Policy", "/privacy-policy"],
              ["Terms of Service", "/terms-of-service"],
              ["Usage Terms", "/usage-terms"],
            ].map(([label, href]) => (
              <a key={href} href={href} className="flex items-center justify-between border-b border-border/50 py-3 text-sm text-foreground">
                {label}
                <span className="text-muted-foreground">›</span>
              </a>
            ))}
            <div className="mt-4 flex justify-center gap-5 text-xs text-muted-foreground">
              <a href="https://github.com/Syntrojex" target="_blank" rel="noopener noreferrer">GitHub</a>
              <a href="https://www.linkedin.com/in/mustafa-amir-syntrojex" target="_blank" rel="noopener noreferrer">LinkedIn</a>
              <a href="https://wa.me/923324097601" target="_blank" rel="noopener noreferrer">WhatsApp</a>
            </div>
          </div>
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
    <div className="flex items-center justify-between gap-4 sm:px-4 sm:py-3">
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
