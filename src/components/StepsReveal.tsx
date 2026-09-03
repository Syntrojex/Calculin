import { motion, AnimatePresence } from "framer-motion";
import { MathText } from "./MathText";
import { MathTex } from "./MathTex";
import { useSettings } from "@/contexts/SettingsContext";

interface StepsRevealProps {
  steps: string[];
  show?: boolean;
  title?: string;
  /** Unique key (e.g. the result/input) so the animation replays on new results */
  resetKey?: string | number;
}

const SPEED_MULTIPLIER = { slow: 1.6, normal: 1, fast: 0.55 };

/**
 * A step string can use a small markup so it renders like a real textbook
 * solution instead of a flat line of unicode:
 *   "##Header text"   as the FIRST line -> bold sub-heading for this step
 *   "$$ ...latex... $$"                 -> centered KaTeX display equation
 *   "$...latex...$" inline in a sentence -> inline KaTeX
 * Anything else is plain prose. Old plain-string steps (no $ or ## at all)
 * render exactly as before via MathText, so nothing already using
 * StepsReveal breaks.
 */
/** Splits a string into plain-text / inline-math / display-math segments. */
function splitMathSegments(body: string): { kind: "text" | "inline" | "display"; content: string }[] {
  const parts: { kind: "text" | "inline" | "display"; content: string }[] = [];
  const re = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) parts.push({ kind: "text", content: body.slice(last, m.index) });
    if (m[1] !== undefined) parts.push({ kind: "display", content: m[1].trim() });
    else parts.push({ kind: "inline", content: (m[2] ?? "").trim() });
    last = re.lastIndex;
  }
  if (last < body.length) parts.push({ kind: "text", content: body.slice(last) });
  return parts;
}

function MathSegments({ text, display }: { text: string; display?: boolean }) {
  return (
    <>
      {splitMathSegments(text).map((p, i) =>
        p.kind === "text" ? (
          <span key={i}>{p.content}</span>
        ) : (
          <MathTex key={i} latex={p.content} display={display && p.kind === "display"} />
        )
      )}
    </>
  );
}

function StepContent({ text }: { text: string }) {
  let body = text;
  let header: string | null = null;

  if (body.startsWith("##")) {
    const nl = body.indexOf("\n");
    if (nl === -1) {
      header = body.slice(2).trim();
      body = "";
    } else {
      header = body.slice(2, nl).trim();
      body = body.slice(nl + 1).trim();
    }
  }

  if (!header && !/\$/.test(body)) {
    // Fast path: no markup at all — behaves exactly like the old plain
    // StepsReveal did, via the existing unicode-aware MathText formatter.
    return <MathText text={body} />;
  }

  return (
    <div className="space-y-1">
      {header && (
        <div className="font-semibold text-foreground">
          <MathSegments text={header} />
        </div>
      )}
      {body && (
        <div className="leading-relaxed">
          <MathSegments text={body} display />
        </div>
      )}
    </div>
  );
}

/**
 * Renders solution steps with a sequential, left-to-right "typewriter style"
 * reveal — each step slides/types in one after another instead of all
 * appearing at once. Speed is controlled globally via Settings.
 */
export function StepsReveal({ steps, show = true, title = "Solution Steps:", resetKey }: StepsRevealProps) {
  const { animationSpeed } = useSettings();
  if (!show || steps.length === 0) return null;

  const mult = SPEED_MULTIPLIER[animationSpeed];

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-muted-foreground">{title}</div>
      <AnimatePresence mode="wait">
        <motion.div key={resetKey ?? "steps"} className="space-y-1">
          {steps.map((step, i) => (
            <motion.div
              key={i}
              initial={{ clipPath: "inset(0 100% 0 0)", opacity: 0.3 }}
              animate={{ clipPath: "inset(0 0% 0 0)", opacity: 1 }}
              transition={{
                delay: i * 0.32 * mult,
                duration: 0.6 * mult,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors"
              style={{ willChange: "clip-path" }}
            >
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-medium">
                {i + 1}
              </span>
              <span className="text-sm break-words min-w-0 flex-1">
                <StepContent text={step} />
              </span>
            </motion.div>
          ))}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
