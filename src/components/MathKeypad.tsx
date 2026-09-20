import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Delete, RotateCcw, CornerDownLeft } from "lucide-react";

interface Key {
  label: string;
  insert?: string;
  action?: "backspace" | "clear" | "enter";
  /** Tooltip — spells out what the key actually inserts. */
  hint?: string;
  category: "fn" | "const" | "op" | "num" | "action";
}

type PageKey = "basic" | "functions" | "symbols";

/**
 * The keypad is split into three pages instead of one dense grid: numbers and
 * operators (the default), the full function library (all six trig ratios,
 * their inverses, hyperbolics, logs and roots), and symbols/constants. That
 * way sin/cos/tan and their relatives are always one tap away without
 * squeezing forty keys onto a single screen.
 */
const PAGES: { key: PageKey; label: string; rows: Key[][] }[] = [
  {
    key: "basic",
    label: "123",
    rows: [
      [
        { label: "7", insert: "7", category: "num" },
        { label: "8", insert: "8", category: "num" },
        { label: "9", insert: "9", category: "num" },
        { label: "÷", insert: "/", category: "op" },
        { label: "(", insert: "(", category: "op" },
        { label: ")", insert: ")", category: "op" },
      ],
      [
        { label: "4", insert: "4", category: "num" },
        { label: "5", insert: "5", category: "num" },
        { label: "6", insert: "6", category: "num" },
        { label: "×", insert: "*", category: "op" },
        { label: "x²", insert: "^2", category: "op" },
        { label: "xⁿ", insert: "^", category: "op" },
      ],
      [
        { label: "1", insert: "1", category: "num" },
        { label: "2", insert: "2", category: "num" },
        { label: "3", insert: "3", category: "num" },
        { label: "−", insert: "-", category: "op" },
        { label: "√", insert: "sqrt(", category: "fn", hint: "sqrt(" },
        { label: "⌫", action: "backspace", category: "action" },
      ],
      [
        { label: "0", insert: "0", category: "num" },
        { label: ".", insert: ".", category: "num" },
        { label: "x", insert: "x", category: "const" },
        { label: "+", insert: "+", category: "op" },
        { label: "=", insert: "=", category: "op" },
        { label: "C", action: "clear", category: "action" },
      ],
      [
        { label: "y", insert: "y", category: "const" },
        { label: "z", insert: "z", category: "const" },
        { label: "π", insert: "pi", category: "const", hint: "pi" },
        { label: "e", insert: "e", category: "const" },
        { label: ",", insert: ", ", category: "op" },
        { label: "space", insert: " ", category: "op" },
      ],
    ],
  },
  {
    key: "functions",
    label: "f(x)",
    rows: [
      [
        { label: "sin", insert: "sin(", category: "fn" },
        { label: "cos", insert: "cos(", category: "fn" },
        { label: "tan", insert: "tan(", category: "fn" },
        { label: "sec", insert: "sec(", category: "fn" },
        { label: "csc", insert: "csc(", category: "fn" },
        { label: "cot", insert: "cot(", category: "fn" },
      ],
      [
        { label: "sin⁻¹", insert: "asin(", category: "fn", hint: "asin(" },
        { label: "cos⁻¹", insert: "acos(", category: "fn", hint: "acos(" },
        { label: "tan⁻¹", insert: "atan(", category: "fn", hint: "atan(" },
        { label: "sinh", insert: "sinh(", category: "fn" },
        { label: "cosh", insert: "cosh(", category: "fn" },
        { label: "tanh", insert: "tanh(", category: "fn" },
      ],
      [
        { label: "ln", insert: "ln(", category: "fn" },
        { label: "log", insert: "log10(", category: "fn", hint: "log10( — base-10 log" },
        { label: "logₐ", insert: "log(", category: "fn", hint: "log(value, base)" },
        { label: "eˣ", insert: "exp(", category: "fn", hint: "exp(" },
        { label: "10ˣ", insert: "10^(", category: "op" },
        { label: "aᵇ", insert: "^", category: "op" },
      ],
      [
        { label: "√", insert: "sqrt(", category: "fn", hint: "sqrt(" },
        { label: "∛", insert: "cbrt(", category: "fn", hint: "cbrt(" },
        { label: "|x|", insert: "abs(", category: "fn", hint: "abs(" },
        { label: "1/x", insert: "^(-1)", category: "op" },
        { label: "n!", insert: "!", category: "op", hint: "factorial" },
        { label: "⌫", action: "backspace", category: "action" },
      ],
      [
        { label: "x", insert: "x", category: "const" },
        { label: "y", insert: "y", category: "const" },
        { label: "(", insert: "(", category: "op" },
        { label: ")", insert: ")", category: "op" },
        { label: ",", insert: ", ", category: "op" },
        { label: "C", action: "clear", category: "action" },
      ],
    ],
  },
  {
    key: "symbols",
    label: "π∞",
    rows: [
      [
        { label: "π", insert: "pi", category: "const", hint: "pi" },
        { label: "e", insert: "e", category: "const" },
        { label: "∞", insert: "Infinity", category: "const", hint: "Infinity" },
        { label: "θ", insert: "theta", category: "const", hint: "theta" },
        { label: "α", insert: "alpha", category: "const", hint: "alpha" },
        { label: "λ", insert: "lambda", category: "const", hint: "lambda" },
      ],
      [
        { label: "x", insert: "x", category: "const" },
        { label: "y", insert: "y", category: "const" },
        { label: "z", insert: "z", category: "const" },
        { label: "t", insert: "t", category: "const" },
        { label: "n", insert: "n", category: "const" },
        { label: "k", insert: "k", category: "const" },
      ],
      [
        { label: "x²", insert: "^2", category: "op" },
        { label: "x³", insert: "^3", category: "op" },
        { label: "x⁻¹", insert: "^(-1)", category: "op" },
        { label: "%", insert: "%", category: "op" },
        { label: "±", insert: "-", category: "op", hint: "minus sign" },
        { label: "⌫", action: "backspace", category: "action" },
      ],
      [
        { label: "gcd", insert: "gcd(", category: "fn", hint: "gcd(a, b)" },
        { label: "lcm", insert: "lcm(", category: "fn", hint: "lcm(a, b)" },
        { label: "mod", insert: " mod ", category: "op" },
        { label: "round", insert: "round(", category: "fn" },
        { label: "min", insert: "min(", category: "fn" },
        { label: "max", insert: "max(", category: "fn" },
      ],
      [
        { label: "(", insert: "(", category: "op" },
        { label: ")", insert: ")", category: "op" },
        { label: ",", insert: ", ", category: "op" },
        { label: "=", insert: "=", category: "op" },
        { label: "space", insert: " ", category: "op" },
        { label: "C", action: "clear", category: "action" },
      ],
    ],
  },
];

const ENTER_KEY: Key = { label: "enter", action: "enter", category: "action" };

const CAT_STYLES: Record<Key["category"], string> = {
  fn:     "bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 active:bg-primary/30 font-semibold",
  const:  "bg-violet-500/10 text-violet-600 dark:text-violet-300 border-violet-500/20 hover:bg-violet-500/20 active:bg-violet-500/30 font-mono font-bold",
  op:     "bg-muted/60 text-foreground border-border hover:bg-muted active:bg-muted/80",
  num:    "bg-background text-foreground border-border hover:bg-muted/60 active:bg-muted font-mono font-semibold",
  action: "text-foreground border-border",
};

interface MathKeypadProps {
  onInput: (text: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onEnter?: () => void;
}

export function MathKeypad({ onInput, onBackspace, onClear, onEnter }: MathKeypadProps) {
  const [page, setPage] = useState<PageKey>("basic");
  const activePage = PAGES.find((p) => p.key === page)!;

  const handleKey = (key: Key) => {
    if (key.action === "backspace") { onBackspace(); return; }
    if (key.action === "clear")     { onClear();     return; }
    if (key.action === "enter")     { onEnter?.();   return; }
    if (key.insert !== undefined)   { onInput(key.insert); }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -6, scaleY: 0.96 }}
        animate={{ opacity: 1, y: 0, scaleY: 1 }}
        exit={{ opacity: 0, y: -4, scaleY: 0.97 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        style={{ transformOrigin: "top" }}
        className="mt-1.5 rounded-xl border border-border/60 bg-card shadow-xl overflow-hidden select-none"
        onPointerDown={(e) => e.preventDefault()} // prevents input from losing focus
      >
        {/* Page switcher */}
        <div className="flex items-center gap-1.5 px-2 py-1.5 bg-muted/40 border-b border-border/40">
          {PAGES.map((p) => (
            <button
              key={p.key}
              onPointerDown={(e) => { e.preventDefault(); setPage(p.key); }}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                page === p.key
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
          <span className="ml-auto text-[10px] text-muted-foreground tracking-wide uppercase font-medium hidden sm:inline">
            Math Keypad
          </span>
        </div>

        <div className="p-2 space-y-1">
          {activePage.rows.map((row, ri) => (
            <div key={`${page}-${ri}`} className="flex gap-1">
              {row.map((key, ki) => (
                <KeyButton key={ki} k={key} onPress={() => handleKey(key)} />
              ))}
            </div>
          ))}

          {/* Enter — full width */}
          <button
            className="w-full h-10 rounded-lg border flex items-center justify-center gap-2 text-sm font-semibold transition-all bg-primary text-primary-foreground border-primary hover:bg-primary/90 active:scale-[0.98]"
            onPointerDown={(e) => { e.preventDefault(); handleKey(ENTER_KEY); }}
          >
            <CornerDownLeft className="h-4 w-4" />
            Enter
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function KeyButton({ k, onPress }: { k: Key; onPress: () => void }) {
  const isBackspace = k.action === "backspace";
  const isClear     = k.action === "clear";

  const base = "flex-1 h-10 min-w-0 rounded-lg border text-xs transition-all active:scale-[0.93] flex items-center justify-center";

  const style = isBackspace
    ? "bg-rose-500/10 text-rose-500 border-rose-500/20 hover:bg-rose-500/20 active:bg-rose-500/30"
    : isClear
      ? "bg-orange-500/10 text-orange-500 border-orange-500/20 hover:bg-orange-500/20 active:bg-orange-500/30"
      : CAT_STYLES[k.category];

  return (
    <button
      className={`${base} ${style}`}
      onPointerDown={(e) => { e.preventDefault(); onPress(); }}
      aria-label={k.label}
      title={k.hint ?? k.insert ?? k.action}
    >
      {isBackspace ? <Delete className="h-3.5 w-3.5" /> :
       isClear     ? <RotateCcw className="h-3 w-3" /> :
       k.label === "space" ? <span className="text-[10px] text-muted-foreground">space</span> :
       <span className="truncate px-0.5">{k.label}</span>}
    </button>
  );
}
