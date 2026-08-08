import { motion, AnimatePresence } from "framer-motion";
import { Delete, RotateCcw, CornerDownLeft } from "lucide-react";

interface Key {
  label: string;
  insert?: string;
  action?: "backspace" | "clear" | "enter";
  wide?: boolean;
  category: "fn" | "const" | "op" | "num" | "action";
}

const ROWS: Key[][] = [
  [
    { label: "sin", insert: "sin(", category: "fn" },
    { label: "cos", insert: "cos(", category: "fn" },
    { label: "tan", insert: "tan(", category: "fn" },
    { label: "ln",  insert: "ln(",  category: "fn" },
    { label: "log", insert: "log(", category: "fn" },
    { label: "√",   insert: "sqrt(", category: "fn" },
  ],
  [
    { label: "asin", insert: "asin(", category: "fn" },
    { label: "acos", insert: "acos(", category: "fn" },
    { label: "atan", insert: "atan(", category: "fn" },
    { label: "abs",  insert: "abs(",  category: "fn" },
    { label: "x²",  insert: "^2",    category: "op" },
    { label: "xⁿ",  insert: "^",     category: "op" },
  ],
  [
    { label: "π",  insert: "pi",  category: "const" },
    { label: "e",  insert: "e",   category: "const" },
    { label: "x",  insert: "x",   category: "const" },
    { label: "y",  insert: "y",   category: "const" },
    { label: "(",  insert: "(",   category: "op"    },
    { label: ")",  insert: ")",   category: "op"    },
  ],
  [
    { label: "7", insert: "7", category: "num" },
    { label: "8", insert: "8", category: "num" },
    { label: "9", insert: "9", category: "num" },
    { label: "+", insert: "+", category: "op"  },
    { label: "−", insert: "-", category: "op"  },
    { label: "⌫", action: "backspace", category: "action" },
  ],
  [
    { label: "4", insert: "4", category: "num" },
    { label: "5", insert: "5", category: "num" },
    { label: "6", insert: "6", category: "num" },
    { label: "×", insert: "*", category: "op"  },
    { label: "÷", insert: "/", category: "op"  },
    { label: "C", action: "clear", category: "action" },
  ],
  [
    { label: "1", insert: "1", category: "num" },
    { label: "2", insert: "2", category: "num" },
    { label: "3", insert: "3", category: "num" },
    { label: ".", insert: ".", category: "num"  },
    { label: ",", insert: ", ", category: "op" },
    { label: "=", insert: "=", category: "op"  },
  ],
  [
    { label: "0", insert: "0",  category: "num" },
    { label: "00", insert: "00", category: "num" },
    { label: "±", insert: "-",  category: "op"  },
    { label: "space", insert: " ", category: "op" },
  ],
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
        {/* Category label strip */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/40 border-b border-border/40">
          <span className="text-[10px] text-muted-foreground tracking-wide uppercase font-medium">Math Keypad</span>
          <div className="flex gap-1.5 ml-auto">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">fn</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-500 border border-violet-500/20">const</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-foreground border border-border">num / op</span>
          </div>
        </div>

        <div className="p-2 space-y-1">
          {ROWS.map((row, ri) => (
            <div key={ri} className="flex gap-1">
              {row.map((key, ki) => (
                <KeyButton key={ki} k={key} onPress={() => handleKey(key)} />
              ))}
            </div>
          ))}

          {/* Enter — full width */}
          <button
            className="w-full h-9 rounded-lg border flex items-center justify-center gap-2 text-sm font-semibold transition-all bg-primary text-primary-foreground border-primary hover:bg-primary/90 active:scale-[0.98]"
            onPointerDown={(e) => { e.preventDefault(); handleKey(ENTER_KEY); }}
          >
            <CornerDownLeft className="h-4 w-4" />
            Enter / Solve
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function KeyButton({ k, onPress }: { k: Key; onPress: () => void }) {
  const isBackspace = k.action === "backspace";
  const isClear     = k.action === "clear";

  const base = "flex-1 h-9 min-w-0 rounded-lg border text-xs transition-all active:scale-[0.93] flex items-center justify-center";

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
      title={k.insert ?? k.action}
    >
      {isBackspace ? <Delete className="h-3.5 w-3.5" /> :
       isClear     ? <RotateCcw className="h-3 w-3" /> :
       k.label === "space" ? <span className="text-[10px] text-muted-foreground">space</span> :
       <span>{k.label}</span>}
    </button>
  );
}
