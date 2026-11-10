import { createFileRoute } from "@tanstack/react-router";
import { useState, Suspense, lazy } from "react";
import { motion } from "framer-motion";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SettingsPanel } from "@/components/SettingsPanel";
import {
  Infinity as InfinityIcon, LineChart, Calculator, Grid3X3,
  ArrowRight,
  Zap, GraduationCap, Menu, Binary, BookOpen, Library, ChevronDown,
  Github, Linkedin, ArrowUp, GitBranch, Layers, PieChart, Move3d, PencilRuler,
} from "lucide-react";
import { FORMULA_TOPICS } from "@/lib/formula-sheet-data";
import { DEFINITION_TOPICS } from "@/lib/definitions-data";

const DerivativeSolver = lazy(() => import("@/components/DerivativeSolver").then(m => ({ default: m.DerivativeSolver })));
const IntegrationSolver = lazy(() => import("@/components/IntegrationSolver").then(m => ({ default: m.IntegrationSolver })));
const DoubleIntegralCalculator = lazy(() => import("@/components/DoubleIntegralCalculator").then(m => ({ default: m.DoubleIntegralCalculator })));
const PartialDerivativeCalculator = lazy(() => import("@/components/PartialDerivativeCalculator").then(m => ({ default: m.PartialDerivativeCalculator })));
const LimitsCalculator = lazy(() => import("@/components/LimitsCalculator").then(m => ({ default: m.LimitsCalculator })));
const PiecewiseCalculator = lazy(() => import("@/components/PiecewiseCalculator").then(m => ({ default: m.PiecewiseCalculator })));
const EquationSolver = lazy(() => import("@/components/EquationSolver").then(m => ({ default: m.EquationSolver })));
const MatrixCalculator = lazy(() => import("@/components/MatrixCalculator").then(m => ({ default: m.MatrixCalculator })));
const VectorCalculator = lazy(() => import("@/components/VectorCalculator").then(m => ({ default: m.VectorCalculator })));
const ComplexCalculator = lazy(() => import("@/components/ComplexCalculator").then(m => ({ default: m.ComplexCalculator })));
const NumberConversions = lazy(() => import("@/components/NumberConversions").then(m => ({ default: m.NumberConversions })));
const GraphPlotter = lazy(() => import("@/components/GraphPlotter").then(m => ({ default: m.GraphPlotter })));
const PracticeMode = lazy(() => import("@/components/PracticeMode").then(m => ({ default: m.PracticeMode })));
const FormulaSheet = lazy(() => import("@/components/FormulaSheet").then(m => ({ default: m.FormulaSheet })));
const Definitions = lazy(() => import("@/components/Definitions").then(m => ({ default: m.Definitions })));

export const Route = createFileRoute("/")({  
  component: Index,
  head: () => ({
    meta: [
      { title: "Calculin" },
      {
        name: "description",
        content:
          "Free online calculator: derivatives, integrals, equations, limits, matrices, complex numbers, number systems, 2D/3D graphs & practice mode.",
      },
    ],
  }),
});

// Tab order: Derivative, Integral, Double ∫, Partial Deriv., Limits, Piecewise,
// Equations, Matrix, Vectors, Complex, Num Systems, Graph, Practice
//
// Each tab declares its own `category` (matching a CATEGORIES key below)
// instead of being listed a second time in a separate per-category "tools"
// array — that used to mean adding a new tool took TWO edits kept in sync by
// hand (add it here, then remember to also add its value to the right
// category's tools list), and a forgotten second edit silently orphaned a
// tool from the header/mobile nav grouping. Now a new tool is a single line
// here; toolsOf() below derives each category's tool list by filtering.
const TABS: { value: string; label: string; shortLabel: string; icon: React.ReactNode; component: React.ReactNode; category: string }[] = [
  { value: "derivative", label: "Derivative", shortLabel: "d/dx", icon: <span className="text-xs font-bold">d/dx</span>, component: <DerivativeSolver />, category: "calculus" },
  { value: "integration", label: "Integral", shortLabel: "∫", icon: <InfinityIcon className="h-3.5 w-3.5" />, component: <IntegrationSolver />, category: "calculus" },
  { value: "doubleintegral", label: "Double ∫", shortLabel: "∬", icon: <Layers className="h-3.5 w-3.5" />, component: <DoubleIntegralCalculator />, category: "calculus" },
  { value: "partial", label: "Partial Deriv.", shortLabel: "∂f/∂x", icon: <PieChart className="h-3.5 w-3.5" />, component: <PartialDerivativeCalculator />, category: "calculus" },
  { value: "limits", label: "Limits", shortLabel: "lim", icon: <ArrowRight className="h-3.5 w-3.5" />, component: <LimitsCalculator />, category: "calculus" },
  { value: "piecewise", label: "Piecewise", shortLabel: "f{x}", icon: <GitBranch className="h-3.5 w-3.5" />, component: <PiecewiseCalculator />, category: "calculus" },
  { value: "equation", label: "Equations", shortLabel: "ax=b", icon: <Calculator className="h-3.5 w-3.5" />, component: <EquationSolver />, category: "algebra" },
  { value: "matrix", label: "Matrix", shortLabel: "[ ]", icon: <Grid3X3 className="h-3.5 w-3.5" />, component: <MatrixCalculator />, category: "algebra" },
  { value: "vector", label: "Vectors", shortLabel: "v⃗", icon: <Move3d className="h-3.5 w-3.5" />, component: <VectorCalculator />, category: "algebra" },
  { value: "complex", label: "Complex", shortLabel: "a+bi", icon: <Zap className="h-3.5 w-3.5" />, component: <ComplexCalculator />, category: "algebra" },
  { value: "numconv", label: "Num Systems", shortLabel: "0xFF", icon: <Binary className="h-3.5 w-3.5" />, component: <NumberConversions />, category: "algebra" },
  { value: "graph", label: "Graph", shortLabel: "📈", icon: <LineChart className="h-3.5 w-3.5" />, component: <GraphPlotter />, category: "graph" },
  { value: "practice", label: "Practice", shortLabel: "✏︎", icon: <GraduationCap className="h-3.5 w-3.5" />, component: <PracticeMode />, category: "practice" },
  // One tab per formula-sheet topic — generated from the same data used to
  // render each sheet, so adding a topic to formula-sheet-data.ts is enough
  // to make it navigable from both the desktop header and the mobile menu.
  ...FORMULA_TOPICS.map((topic) => ({
    value: `formula-${topic.key}`,
    label: topic.navLabel,
    shortLabel: topic.navLabel,
    icon: <BookOpen className="h-3.5 w-3.5" />,
    component: <FormulaSheet topicKey={topic.key} />,
    category: "formulasheet",
  })),
  // Same pattern for Definitions topics.
  ...DEFINITION_TOPICS.map((topic) => ({
    value: `definitions-${topic.key}`,
    label: topic.navLabel,
    shortLabel: topic.navLabel,
    icon: <Library className="h-3.5 w-3.5" />,
    component: <Definitions topicKey={topic.key} />,
    category: "definitions",
  })),
];

/** WhatsApp glyph — lucide has no brand icon for it, so this is the official
 *  mark drawn as a path that inherits the surrounding text color. */
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.87 9.87 0 0 0 4.79 1.22h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 1.67c2.2 0 4.27.86 5.83 2.42a8.2 8.2 0 0 1 2.41 5.82c0 4.54-3.7 8.24-8.25 8.24a8.23 8.23 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.18 8.18 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24Zm-4.5 4.4c-.18 0-.47.07-.72.34-.25.27-.95.93-.95 2.26s.98 2.62 1.11 2.8c.14.18 1.9 2.9 4.62 3.96.65.25 1.15.4 1.54.51.65.21 1.24.18 1.71.11.52-.08 1.6-.65 1.83-1.29.23-.63.23-1.18.16-1.29-.07-.11-.25-.18-.52-.31-.27-.14-1.6-.79-1.85-.88-.25-.09-.43-.14-.61.14-.18.27-.7.88-.86 1.06-.16.18-.32.2-.59.07-.27-.14-1.14-.42-2.18-1.34-.8-.72-1.35-1.6-1.5-1.87-.16-.27-.02-.42.12-.55.12-.12.27-.32.4-.48.14-.16.18-.27.27-.45.09-.18.05-.34-.02-.48-.07-.14-.6-1.47-.83-2.01-.22-.53-.44-.46-.6-.47h-.53Z" />
    </svg>
  );
}

function tabByValue(value: string) {
  return TABS.find((t) => t.value === value)!;
}

// Desktop-only grouping: the header shows this row of categories, and clicking
// one that holds more than one tool opens a second row underneath listing
// just that category's tools. "Graph" and "Practice" are single-tool
// categories, so clicking them jumps straight to that tool with no sub-row.
// Mobile is untouched — it still uses the hamburger Sheet with the flat
// TABS list above, regardless of this grouping.
// All premium-desktop styling lives here so this one file is self-contained.
// Everything is inside min-width:640px (except the font class), so mobile is untouched.
const PREMIUM_CSS = `
@import url("https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap");
.font-display { font-family: "Instrument Serif", "Cormorant Garamond", Georgia, "Times New Roman", serif; }
@media (min-width: 640px) {
  .calc-aurora {
    position: fixed; inset: 0; z-index: -1; pointer-events: none; opacity: 0.45;
    background:
      radial-gradient(720px 520px at 0% -5%, color-mix(in oklab, var(--primary) 55%, transparent), transparent 70%),
      radial-gradient(640px 480px at 100% -5%, rgba(30, 140, 255, 0.35), transparent 70%),
      radial-gradient(700px 420px at 40% 105%, rgba(18, 181, 165, 0.16), transparent 70%);
  }
  .dark .calc-aurora { opacity: 0.9; }
  /* ── Tool tile hover: lift + rotating gradient ring + cursor spotlight ── */
  .calc-tile {
    transition: transform .28s cubic-bezier(.2,.9,.3,1.2), box-shadow .28s, border-color .28s, background-color .28s;
  }
  .calc-tile::before {
    content: ""; position: absolute; inset: -1px; border-radius: inherit; padding: 1.5px; pointer-events: none;
    background: linear-gradient(120deg, var(--primary), color-mix(in oklab, var(--primary) 40%, white), var(--primary), color-mix(in oklab, var(--primary) 55%, black), var(--primary));
    background-size: 300% 100%;
    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    -webkit-mask-composite: xor; mask-composite: exclude;
    opacity: 0; transition: opacity .3s;
    animation: calcRing 3s linear infinite;
  }
  .calc-tile::after {
    content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; z-index: 0;
    background: radial-gradient(170px circle at var(--mx, 50%) var(--my, 50%), color-mix(in oklab, var(--primary) 34%, transparent), transparent 70%);
    opacity: 0; transition: opacity .25s;
  }
  .calc-tile:hover { transform: translateY(-4px); box-shadow: 0 16px 38px -14px color-mix(in oklab, var(--primary) 70%, transparent); }
  .calc-tile:hover::before, .calc-tile:hover::after { opacity: 1; }
  .calc-tile-sym { display: inline-block; transition: transform .3s cubic-bezier(.2,.9,.3,1.3), text-shadow .3s; transform-origin: left center; }
  .calc-tile:hover .calc-tile-sym { transform: scale(1.14) translateY(-2px); text-shadow: 0 0 22px color-mix(in oklab, var(--primary) 80%, transparent); }
  .calc-tile:active { transform: translateY(-1px) scale(.985); }
  @keyframes calcRing { to { background-position: 300% 0; } }


  /* Number fields: hide the grey native spinner (themed -/+ buttons are in ui/input) */
  input[type=number] { -moz-appearance: textfield; appearance: textfield; }
  input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
  /* ── Result card ── */
  .premium-main [class~="bg-primary/5"][class~="border-primary/10"] {
    background: linear-gradient(135deg, color-mix(in oklab, var(--primary) 20%, transparent), color-mix(in oklab, #35d0ff 7%, transparent));
    border-color: color-mix(in oklab, var(--primary) 40%, transparent);
    border-radius: 18px; padding: 1.1rem 1.4rem;
    box-shadow: 0 18px 40px -24px var(--primary);
  }
  .premium-main [class~="bg-primary/5"][class~="border-primary/10"] .katex-display { font-size: 1.3em; margin: .55rem 0 .2rem; }
  .premium-main [class~="bg-primary/5"][class~="border-primary/10"] > .flex:first-child > .text-muted-foreground { text-transform: uppercase; letter-spacing: .16em; font-size: 11px; font-weight: 600; }

  /* ── Loading shimmer (tool panels while their code loads) ── */
  .premium-main .animate-pulse { animation: none; }
  .premium-main .animate-pulse > div {
    background-image: linear-gradient(100deg, transparent 30%, color-mix(in oklab, var(--primary) 16%, transparent) 50%, transparent 70%);
    background-size: 250% 100%; animation: calcShimmerBg 1.4s linear infinite;
  }
  @keyframes calcShimmerBg { from { background-position: 150% 0; } to { background-position: -100% 0; } }

  /* ── Scrollbars + selection ── */
  html { scrollbar-width: thin; scrollbar-color: color-mix(in oklab, var(--primary) 45%, transparent) transparent; }
  ::-webkit-scrollbar { width: 10px; height: 10px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: color-mix(in oklab, var(--primary) 40%, transparent); border-radius: 99px; border: 2px solid transparent; background-clip: padding-box; }
  ::-webkit-scrollbar-thumb:hover { background: color-mix(in oklab, var(--primary) 70%, transparent); background-clip: padding-box; border: 2px solid transparent; }
  ::selection { background: color-mix(in oklab, var(--primary) 35%, transparent); }
  /* ── Input card polish ── */
  .premium-main .math-preview { border-top: 1px dashed color-mix(in oklab, var(--foreground) 14%, transparent); margin-top: .5rem; }
  .premium-main button.w-full.gap-2 {
    height: 3rem; border-radius: 14px; font-weight: 600; font-size: .95rem; border: 0;
    color: #0a0818;
    background: linear-gradient(135deg, color-mix(in oklab, var(--primary) 70%, white), color-mix(in oklab, var(--primary) 50%, #35d0ff));
    box-shadow: 0 10px 30px -10px color-mix(in oklab, var(--primary) 70%, transparent);
  }
  /* ── Subtle desktop animations (all accent-coloured) ── */
  .premium-main button.w-full.gap-2 { position: relative; overflow: hidden; transition: transform .25s cubic-bezier(.2,.9,.3,1.2), box-shadow .25s; }
  .premium-main button.w-full.gap-2::after {
    content: ""; position: absolute; top: 0; bottom: 0; left: -40%; width: 40%; pointer-events: none;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,.5), transparent); transform: skewX(-20deg); opacity: 0;
  }
  .premium-main button.w-full.gap-2:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 14px 30px -10px color-mix(in oklab, var(--primary) 75%, transparent); }
  .premium-main button.w-full.gap-2:hover:not(:disabled)::after { opacity: 1; animation: calcShimmer .8s ease-out; }
  .premium-main button.w-full.gap-2:active:not(:disabled) { transform: translateY(0) scale(.99); }
  @keyframes calcShimmer { from { left: -40%; } to { left: 120%; } }
  .premium-main input, .premium-main textarea { transition: box-shadow .25s, border-color .25s; }
  .premium-main input:focus-visible, .premium-main textarea:focus-visible {
    border-color: var(--primary);
    box-shadow: 0 0 0 4px color-mix(in oklab, var(--primary) 24%, transparent), 0 0 26px color-mix(in oklab, var(--primary) 38%, transparent);
  }
  .premium-main canvas { animation: calcDraw .9s cubic-bezier(.2,.8,.2,1) both; }
  @keyframes calcDraw { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
  header nav button { transition: background-color .2s, color .2s, transform .2s, box-shadow .2s; }
  header nav button:hover { transform: translateY(-1px); box-shadow: 0 6px 18px -8px color-mix(in oklab, var(--primary) 70%, transparent); }
  footer nav a { background: linear-gradient(currentColor, currentColor) 0 100% / 0 1.5px no-repeat; padding-bottom: 3px; transition: background-size .25s, color .2s; }
  footer nav a:hover { background-size: 100% 1.5px; }
  @media (prefers-reduced-motion: reduce) {
    .premium-main canvas, .premium-main button.w-full.gap-2::after { animation: none !important; }
    .calc-tile, .calc-tile-sym { transition: none; }
    .calc-tile::before { animation: none; }
    .calc-tile:hover, .calc-tile:hover .calc-tile-sym { transform: none; }
  }

  .premium-main .rounded-xl.border.bg-card {
    border-radius: 22px;
    background: linear-gradient(180deg, color-mix(in oklab, var(--card) 90%, white 4%), color-mix(in oklab, var(--card) 72%, transparent));
    backdrop-filter: blur(14px);
    box-shadow: 0 18px 50px -20px rgba(0, 0, 0, 0.45);
  }
}
`;

const CATEGORIES: { key: string; label: string; icon: React.ReactNode; collapsedOnMobile?: boolean }[] = [
  { key: "calculus", label: "Calculus", icon: <span className="text-xs font-bold">d/dx</span> },
  { key: "algebra", label: "Algebra", icon: <Calculator className="h-3.5 w-3.5" /> },
  { key: "graph", label: "Graph", icon: <LineChart className="h-3.5 w-3.5" /> },
  { key: "practice", label: "Practice", icon: <PencilRuler className="h-3.5 w-3.5" /> },
  // Only these two reference-heavy categories (10 topics each) collapse
  // into a dropdown on mobile — every other category always lists its
  // tools flat, an explicit per-category flag rather than a tool-count
  // threshold, so adding another tool to Calculus (or anywhere else) can
  // never silently flip it into the collapsed treatment again.
  { key: "definitions", label: "Definitions", icon: <Library className="h-3.5 w-3.5" />, collapsedOnMobile: true },
  { key: "formulasheet", label: "Formula Sheet", icon: <BookOpen className="h-3.5 w-3.5" />, collapsedOnMobile: true },
];

/** Every tab value belonging to a category, in TABS' own order — the single
 *  derived source every piece of nav UI below reads from, instead of each
 *  keeping its own copy of the list. */
function toolsOf(categoryKey: string): string[] {
  return TABS.filter((t) => t.category === categoryKey).map((t) => t.value);
}

function categoryOf(tabValue: string) {
  const category = tabByValue(tabValue).category;
  return CATEGORIES.find((c) => c.key === category) ?? CATEGORIES[0];
}

function Index() {
  const [tab, setTab] = useState("derivative");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [expandedMobileCategories, setExpandedMobileCategories] = useState<Set<string>>(new Set());
  const toggleMobileCategory = (key: string) => {
    setExpandedMobileCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const selectTab = (value: string) => {
    setTab(value);
    setMobileMenuOpen(false);
  };

  const selectCategory = (key: string) => {
    const cat = CATEGORIES.find((c) => c.key === key)!;
    // Single-tool categories (Graph, Practice) jump straight there; multi-tool
    // categories switch to their first tool (unless the current tab is
    // already inside this category) and reveal the sub-row.
    const tools = toolsOf(cat.key);
    if (!tools.includes(tab)) selectTab(tools[0]);
  };

  const activeCategory = categoryOf(tab);
  const activeCategoryTools = toolsOf(activeCategory.key);


  return (
    <div className="min-h-screen bg-background flex flex-col sm:relative sm:isolate">
      <style>{PREMIUM_CSS}</style>
      {/* Desktop-only soft aurora behind everything; mobile keeps its plain background */}
      <div className="calc-aurora hidden sm:block" aria-hidden="true" />
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-lg sm:border-0 sm:bg-transparent sm:backdrop-blur-none sm:pt-4">
        <div className="mx-auto max-w-4xl lg:max-w-6xl px-3 sm:px-4">
          <div className="flex items-center gap-2 lg:gap-6 py-3 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:rounded-full sm:border sm:border-border/60 sm:bg-card/60 sm:backdrop-blur-xl sm:shadow-lg sm:py-2.5 sm:pl-5 sm:pr-3">
            <button
              className="sm:hidden mr-1 p-1.5 -ml-1.5 rounded-md hover:bg-muted/60 text-foreground"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open tools menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 shrink-0 sm:justify-self-start">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-primary-foreground font-bold text-lg shadow-sm sm:from-amber-200 sm:to-amber-500 sm:text-amber-950 sm:shadow-[0_0_18px_rgba(244,213,141,0.35)]">
                ∫
              </div>
              <h1 className="text-lg font-bold tracking-tight text-foreground">Calculin</h1>
            </div>

            {/* Desktop category row — mobile keeps the hamburger Sheet below instead */}
            <nav className="hidden sm:flex items-center justify-center gap-0.5 min-w-0 max-w-full sm:overflow-visible rounded-full border border-border/50 bg-muted/40 p-1">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.key}
                  onClick={() => selectCategory(cat.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg sm:rounded-full sm:px-4 text-sm font-medium whitespace-nowrap transition-colors ${
                    activeCategory.key === cat.key
                      ? "bg-primary/10 text-primary sm:bg-gradient-to-br sm:from-primary/35 sm:to-cyan-400/20 sm:text-foreground sm:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)]"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  }`}
                >
                  {cat.icon}
                  {cat.label}
                </button>
              ))}
            </nav>

            <div className="ml-auto sm:ml-0 sm:justify-self-end">
              <SettingsPanel />
            </div>
          </div>

        </div>
      </header>

      {/* Mobile tools menu (hamburger) */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="w-72 overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Tools</SheetTitle>
          </SheetHeader>
          <nav className="px-2 pb-6 mt-2 space-y-4">
            {CATEGORIES.map((cat) => {
              // Small categories (Calculus, Algebra, ...) list their tools
              // inline right away, same as before. Only the two reference
              // categories (Definitions, Formula Sheet — 10 topics each,
              // via collapsedOnMobile) collapse into a dropdown instead, so
              // the menu doesn't turn into one long undifferentiated scroll.
              const catTools = toolsOf(cat.key);
              const isLarge = cat.collapsedOnMobile === true;
              const isOpen = !isLarge || expandedMobileCategories.has(cat.key) || activeCategory.key === cat.key;
              return (
                <div key={cat.key}>
                  {isLarge ? (
                    <button
                      onClick={() => toggleMobileCategory(cat.key)}
                      className="w-full flex items-center justify-between px-3 mb-1 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      <span className="flex items-center gap-1.5">{cat.icon} {cat.label}</span>
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </button>
                  ) : (
                    <div className="px-3 mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {cat.label}
                    </div>
                  )}
                  {isOpen && (
                    <div className="space-y-1">
                      {catTools.map((value) => {
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
                  )}
                </div>
              );
            })}
          </nav>
        </SheetContent>
      </Sheet>

      <div className="relative overflow-hidden sm:hidden">
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
            Derivatives · Integrals · Limits · Matrices · Complex Numbers · Number Systems · 2D/3D Graphs · Practice Mode
          </p>
        </motion.section>
      </div>

      <main className="premium-main mx-auto max-w-4xl lg:max-w-6xl px-3 sm:px-4 pb-16 sm:pt-8 flex-1 w-full">
        {/* Desktop tool switcher: big symbol tiles for Calculus/Algebra, compact
            pills for the 10-topic reference categories. Mobile uses the hamburger. */}
        {activeCategoryTools.length > 1 && (
          <div className="hidden sm:block mb-6">
            <div className="mb-3 flex items-baseline gap-3">
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{activeCategory.label}</h2>
              <span className="text-xs text-muted-foreground/70">{activeCategoryTools.length} {activeCategory.key === "definitions" || activeCategory.key === "formulasheet" ? "topics" : "tools"}</span>
            </div>
            {activeCategory.key === "calculus" || activeCategory.key === "algebra" ? (
              <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${activeCategoryTools.length}, minmax(0, 1fr))` }}>
                {activeCategoryTools.map((value) => {
                  const t = tabByValue(value);
                  const active = tab === value;
                  return (
                    <button
                      key={value}
                      onClick={() => selectTab(value)}
                      onMouseMove={(e) => {
                        const r = e.currentTarget.getBoundingClientRect();
                        e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
                        e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
                      }}
                      className={`calc-tile relative rounded-2xl border px-4 pt-4 pb-3.5 text-left ${
                        active
                          ? "border-primary/60 bg-gradient-to-br from-primary/30 to-cyan-400/10 shadow-[0_18px_50px_-14px] shadow-primary/50"
                          : "border-border/60 bg-card/40 hover:border-primary/30 hover:bg-card/70"
                      }`}
                    >
                      <div className={`relative z-[1] font-display h-9 text-[32px] leading-none ${active ? "text-foreground" : "text-foreground/70"}`}><span className="calc-tile-sym">{t.shortLabel}</span></div>
                      <div className={`relative z-[1] mt-2.5 text-sm font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}>{t.label}</div>
                      {active && <span className="absolute inset-x-4 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-primary to-cyan-400" />}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {activeCategoryTools.map((value) => {
                  const t = tabByValue(value);
                  const active = tab === value;
                  return (
                    <button
                      key={value}
                      onClick={() => selectTab(value)}
                      className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                        active ? "border-primary/50 bg-primary/15 text-foreground" : "border-border/60 text-muted-foreground hover:bg-card/60 hover:text-foreground"
                      }`}
                    >
                      <span className="[&_svg]:h-3.5 [&_svg]:w-3.5">{t.icon}</span>
                      {t.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <Tabs value={tab} onValueChange={setTab}>
          {/* Current tool name shown on mobile, since the tab bar is hidden in favor of the hamburger menu */}
          <div className="sm:hidden mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
            <span className="text-primary">{TABS.find((t) => t.value === tab)?.icon}</span>
            {TABS.find((t) => t.value === tab)?.label}
          </div>

          {TABS.filter((t) => t.value === tab).map((t) => (
            <TabsContent key={t.value} value={t.value} forceMount>
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

      <footer className="border-t border-border/50 bg-muted/30 sm:bg-transparent">
        <div className="mx-auto max-w-4xl px-4 py-10 sm:py-6">
          {/* Desktop: all links in one horizontal row */}
          <nav className="hidden sm:flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-xs text-muted-foreground">
            <a href="/documentation" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">Documentation</a>
            <a href="https://github.com/Syntrojex/Calculin" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">GitHub</a>
            <a href="/usage-terms" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">Usage Terms</a>
            <a href="/feedback" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">Feedback</a>
            <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">Privacy Policy</a>
            <a href="/terms-of-service" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">Terms of Service</a>
            <a href="/about" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">About</a>
          </nav>
          {/* Mobile: original two-column footer, unchanged */}
          <div className="sm:hidden grid grid-cols-2 gap-12 justify-center text-center max-w-sm mx-auto">
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
              <a href="https://wa.me/923324097601" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="text-muted-foreground hover:text-primary transition-colors"><WhatsAppIcon className="h-4 w-4" /></a>
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
