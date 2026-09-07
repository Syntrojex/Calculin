import { createFileRoute } from "@tanstack/react-router";
import { useState, Suspense, lazy } from "react";
import { motion } from "framer-motion";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SettingsPanel } from "@/components/SettingsPanel";
import {
  Infinity as InfinityIcon, LineChart, Calculator, Grid3X3,
  ArrowRight, ArrowLeftRight, Pentagon, TrendingUp,
  Zap, Hash, GraduationCap, Menu, Binary, BookOpen,
  Github, Linkedin, ArrowUp,
} from "lucide-react";
import { FORMULA_TOPICS } from "@/lib/formula-sheet-data";

const DerivativeSolver = lazy(() => import("@/components/DerivativeSolver").then(m => ({ default: m.DerivativeSolver })));
const IntegrationSolver = lazy(() => import("@/components/IntegrationSolver").then(m => ({ default: m.IntegrationSolver })));
const CalculusPlus = lazy(() => import("@/components/CalculusPlus").then(m => ({ default: m.CalculusPlus })));
const LimitsCalculator = lazy(() => import("@/components/LimitsCalculator").then(m => ({ default: m.LimitsCalculator })));
const EquationSolver = lazy(() => import("@/components/EquationSolver").then(m => ({ default: m.EquationSolver })));
const MatrixCalculator = lazy(() => import("@/components/MatrixCalculator").then(m => ({ default: m.MatrixCalculator })));
const TrigIdentities = lazy(() => import("@/components/TrigIdentities").then(m => ({ default: m.TrigIdentities })));
const ComplexCalculator = lazy(() => import("@/components/ComplexCalculator").then(m => ({ default: m.ComplexCalculator })));
const NumberTheory = lazy(() => import("@/components/NumberTheory").then(m => ({ default: m.NumberTheory })));
const ShapesCalculator = lazy(() => import("@/components/ShapesCalculator").then(m => ({ default: m.ShapesCalculator })));
const UnitConverter = lazy(() => import("@/components/UnitConverter").then(m => ({ default: m.UnitConverter })));
const NumberConversions = lazy(() => import("@/components/NumberConversions").then(m => ({ default: m.NumberConversions })));
const GraphPlotter = lazy(() => import("@/components/GraphPlotter").then(m => ({ default: m.GraphPlotter })));
const PracticeMode = lazy(() => import("@/components/PracticeMode").then(m => ({ default: m.PracticeMode })));
const FormulaSheet = lazy(() => import("@/components/FormulaSheet").then(m => ({ default: m.FormulaSheet })));

export const Route = createFileRoute("/")({  
  component: Index,
  head: () => ({
    meta: [
      { title: "Calculin" },
      {
        name: "description",
        content:
          "Free online calculator: derivatives, integrals, equations, limits, matrices, trigonometry, complex numbers, number theory, shapes, converters, number systems, 2D/3D graphs & practice mode.",
      },
    ],
  }),
});

// Tab order: Derivative, Integral, Calc+, Limits, Equations, Matrix, Trigonometry,
// Complex, Num Theory, Shapes, Converter, Num Conversions, Graph, Practice
const TABS: { value: string; label: string; shortLabel: string; icon: React.ReactNode; component: React.ReactNode }[] = [
  { value: "derivative", label: "Derivative", shortLabel: "d/dx", icon: <span className="text-xs font-bold">d/dx</span>, component: <DerivativeSolver /> },
  { value: "integration", label: "Integral", shortLabel: "∫", icon: <InfinityIcon className="h-3.5 w-3.5" />, component: <IntegrationSolver /> },
  { value: "calcplus", label: "Calc+", shortLabel: "∂", icon: <TrendingUp className="h-3.5 w-3.5" />, component: <CalculusPlus /> },
  { value: "limits", label: "Limits", shortLabel: "lim", icon: <ArrowRight className="h-3.5 w-3.5" />, component: <LimitsCalculator /> },
  { value: "equation", label: "Equations", shortLabel: "ax=b", icon: <Calculator className="h-3.5 w-3.5" />, component: <EquationSolver /> },
  { value: "matrix", label: "Matrix", shortLabel: "[ ]", icon: <Grid3X3 className="h-3.5 w-3.5" />, component: <MatrixCalculator /> },
  { value: "trig", label: "Trigonometry", shortLabel: "θ", icon: <span className="text-xs font-bold">θ</span>, component: <TrigIdentities /> },
  { value: "complex", label: "Complex", shortLabel: "z", icon: <Zap className="h-3.5 w-3.5" />, component: <ComplexCalculator /> },
  { value: "numtheory", label: "Num Theory", shortLabel: "gcd", icon: <Hash className="h-3.5 w-3.5" />, component: <NumberTheory /> },
  { value: "shapes", label: "Shapes", shortLabel: "△", icon: <Pentagon className="h-3.5 w-3.5" />, component: <ShapesCalculator /> },
  { value: "converter", label: "Converter", shortLabel: "⇄", icon: <ArrowLeftRight className="h-3.5 w-3.5" />, component: <UnitConverter /> },
  { value: "numconv", label: "Num Systems", shortLabel: "0b1", icon: <Binary className="h-3.5 w-3.5" />, component: <NumberConversions /> },
  { value: "graph", label: "Graph", shortLabel: "📈", icon: <LineChart className="h-3.5 w-3.5" />, component: <GraphPlotter /> },
  { value: "practice", label: "Practice", shortLabel: "✏︎", icon: <GraduationCap className="h-3.5 w-3.5" />, component: <PracticeMode /> },
  // One tab per formula-sheet topic — generated from the same data used to
  // render each sheet, so adding a topic to formula-sheet-data.ts is enough
  // to make it navigable from both the desktop header and the mobile menu.
  ...FORMULA_TOPICS.map((topic) => ({
    value: `formula-${topic.key}`,
    label: topic.navLabel,
    shortLabel: topic.navLabel,
    icon: <BookOpen className="h-3.5 w-3.5" />,
    component: <FormulaSheet topicKey={topic.key} />,
  })),
];

function tabByValue(value: string) {
  return TABS.find((t) => t.value === value)!;
}

// Desktop-only grouping: the header shows this row of categories, and clicking
// one that holds more than one tool opens a second row underneath listing
// just that category's tools. "Graph" and "Practice" are single-tool
// categories, so clicking them jumps straight to that tool with no sub-row.
// Mobile is untouched — it still uses the hamburger Sheet with the flat
// TABS list above, regardless of this grouping.
const CATEGORIES: { key: string; label: string; icon: React.ReactNode; tools: string[] }[] = [
  { key: "calculus", label: "Calculus", icon: <span className="text-xs font-bold">d/dx</span>, tools: ["derivative", "integration", "calcplus", "limits"] },
  { key: "algebra", label: "Algebra", icon: <Calculator className="h-3.5 w-3.5" />, tools: ["equation", "matrix", "complex"] },
  { key: "geometry", label: "Geometry", icon: <span className="text-xs font-bold">θ</span>, tools: ["trig", "shapes"] },
  { key: "numbers", label: "Numbers", icon: <Hash className="h-3.5 w-3.5" />, tools: ["numtheory", "numconv", "converter"] },
  { key: "graph", label: "Graph", icon: <LineChart className="h-3.5 w-3.5" />, tools: ["graph"] },
  { key: "practice", label: "Practice", icon: <GraduationCap className="h-3.5 w-3.5" />, tools: ["practice"] },
  { key: "formulasheet", label: "Formula Sheet", icon: <BookOpen className="h-3.5 w-3.5" />, tools: FORMULA_TOPICS.map((t) => `formula-${t.key}`) },
];

function categoryOf(tabValue: string) {
  return CATEGORIES.find((c) => c.tools.includes(tabValue)) ?? CATEGORIES[0];
}

function Index() {
  const [tab, setTab] = useState("derivative");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const selectTab = (value: string) => {
    setTab(value);
    setMobileMenuOpen(false);
  };

  const selectCategory = (key: string) => {
    const cat = CATEGORIES.find((c) => c.key === key)!;
    // Single-tool categories (Graph, Practice) jump straight there; multi-tool
    // categories switch to their first tool (unless the current tab is
    // already inside this category) and reveal the sub-row.
    if (!cat.tools.includes(tab)) selectTab(cat.tools[0]);
  };

  const activeCategory = categoryOf(tab);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-lg">
        <div className="mx-auto max-w-4xl lg:max-w-6xl px-3 sm:px-4 py-3">
          <div className="flex items-center gap-2 lg:gap-6">
            <button
              className="sm:hidden mr-1 p-1.5 -ml-1.5 rounded-md hover:bg-muted/60 text-foreground"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open tools menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-primary-foreground font-bold text-lg shadow-sm">
                ∫
              </div>
              <h1 className="text-lg font-bold tracking-tight text-foreground">Calculin</h1>
            </div>

            {/* Desktop category row — mobile keeps the hamburger Sheet below instead */}
            <nav className="hidden sm:flex items-center gap-1 flex-1 overflow-x-auto">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.key}
                  onClick={() => selectCategory(cat.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    activeCategory.key === cat.key ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  }`}
                >
                  {cat.icon}
                  {cat.label}
                </button>
              ))}
            </nav>

            <div className="ml-auto sm:ml-0">
              <SettingsPanel />
            </div>
          </div>

          {/* Sub-row: only the active category's specific tools, when it has more than one */}
          {activeCategory.tools.length > 1 && (
            <div className="hidden sm:flex items-center gap-1 mt-2 pt-2 border-t border-dashed border-border/60 overflow-x-auto">
              {activeCategory.tools.map((value) => {
                const t = tabByValue(value);
                return (
                  <button
                    key={value}
                    onClick={() => selectTab(value)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                      tab === value ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </header>

      {/* Mobile tools menu (hamburger) */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="w-72 overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Tools</SheetTitle>
          </SheetHeader>
          <nav className="px-2 pb-6 mt-2 space-y-4">
            {CATEGORIES.map((cat) => (
              <div key={cat.key}>
                <div className="px-3 mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {cat.label}
                </div>
                <div className="space-y-1">
                  {cat.tools.map((value) => {
                    const t = tabByValue(value);
                    return (
                      <button
                        key={value}
                        onClick={() => selectTab(value)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                          tab === value ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"
                        }`}
                      >
                        <span className="w-5 flex items-center justify-center">{t.icon}</span>
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </SheetContent>
      </Sheet>

      <div className="relative overflow-hidden">
        <div
          className="absolute inset-0 -z-10 opacity-[0.15] pointer-events-none"
          style={{
            background:
              "radial-gradient(600px circle at 20% 0%, var(--color-primary), transparent 60%), radial-gradient(500px circle at 85% 10%, var(--color-primary), transparent 55%)",
          }}
        />
        <motion.section
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto max-w-4xl px-4 pt-8 pb-6 text-center"
        >
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            Solve Math <span className="text-primary">Instantly</span>
          </h2>
          <p className="mt-2 text-muted-foreground text-xs sm:text-sm px-2">
            Derivatives · Integrals · Limits · Matrices · Trigonometry · Complex Numbers · Number Theory · Shapes · 2D/3D Graphs · Practice Mode
          </p>
        </motion.section>
      </div>

      <main className="mx-auto max-w-4xl lg:max-w-6xl px-3 sm:px-4 pb-16 flex-1 w-full">
        <Tabs value={tab} onValueChange={setTab}>
          {/* Current tool name shown on mobile, since the tab bar is hidden in favor of the hamburger menu */}
          <div className="sm:hidden mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
            <span className="text-primary">{TABS.find((t) => t.value === tab)?.icon}</span>
            {TABS.find((t) => t.value === tab)?.label}
          </div>

          {TABS.map((t) => (
            <TabsContent key={t.value} value={t.value}>
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              >
                <Suspense
                  fallback={
                    <div className="space-y-4 animate-pulse">
                      <div className="h-40 rounded-xl bg-muted/40 border border-border/50" />
                      <div className="h-24 rounded-xl bg-muted/30 border border-border/50" />
                    </div>
                  }
                >
                  {t.component}
                </Suspense>
              </motion.div>
            </TabsContent>
          ))}
        </Tabs>
      </main>

      <footer className="border-t border-border/50 bg-muted/30">
        <div className="mx-auto max-w-4xl px-4 py-10">
          <div className="grid grid-cols-2 gap-12 sm:gap-24 justify-center text-center sm:text-left max-w-sm sm:max-w-md mx-auto">
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">Resources</h3>
              <ul className="space-y-2 text-xs text-muted-foreground">
                <li><a href="/documentation" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">Documentation</a></li>
                <li><a href="https://github.com/Syntrojex/Calculin" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">GitHub</a></li>
                <li><a href="/usage-terms" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">Usage Terms</a></li>
                <li><a href="/feedback" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">Feedback</a></li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">Legal & Support</h3>
              <ul className="space-y-2 text-xs text-muted-foreground">
                <li><a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">Privacy Policy</a></li>
                <li><a href="/terms-of-service" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">Terms of Service</a></li>
                <li><a href="/about" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">About</a></li>
              </ul>
            </div>
          </div>
        </div>

        <div className="border-t border-border/50">
          <div className="mx-auto max-w-4xl px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground text-center sm:text-left">
              © {new Date().getFullYear()} <span className="font-medium text-foreground">Muhammad Mustafa Amir</span>
            </p>
            <p className="text-xs text-muted-foreground text-center font-medium">
              All rights reserved.
            </p>
            <div className="flex items-center gap-4">
              <a href="https://github.com/Syntrojex" target="_blank" rel="noopener noreferrer" aria-label="GitHub" className="text-muted-foreground hover:text-primary transition-colors"><Github className="h-4 w-4" /></a>
              <a href="https://www.linkedin.com/in/mustafa-amir-syntrojex" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" className="text-muted-foreground hover:text-primary transition-colors"><Linkedin className="h-4 w-4" /></a>
              <button
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
              >
                Back to Top <ArrowUp className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
