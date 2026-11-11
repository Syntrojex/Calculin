import { motion, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";
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

// Desktop-only timeline look (inside min-width:640px, so mobile is untouched).
const STEPS_CSS = `
@media (min-width: 0px) {
  .steps-tl { position: relative; }
  .steps-tl::before {
    content: ""; position: absolute; left: 1.55rem; top: 2.2rem; bottom: 2.2rem; width: 2px; border-radius: 2px;
    background: linear-gradient(var(--primary), color-mix(in oklab, var(--primary) 25%, transparent));
  }
  .steps-tl > .step-row:last-child .step-num { background: linear-gradient(135deg, var(--primary), color-mix(in oklab, var(--primary) 50%, #35d0ff)); color: #fff; border-color: transparent; }
}
`;

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

/** Renders **bold** markdown within a plain-text segment (used e.g. for the
 *  "Approach" step, which bolds the rule names it's about to use). */
function TextWithBold({ text }: { text: string }) {
  const pieces = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {pieces.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i} className="font-semibold text-foreground">{p.slice(2, -2)}</strong>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

function MathSegments({ text, display }: { text: string; display?: boolean }) {
  return (
    <>
      {splitMathSegments(text).map((p, i) =>
        p.kind === "text" ? (
          <TextWithBold key={i} text={p.content} />
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
        <div className="leading-relaxed min-w-0 break-words">
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
      <style>{STEPS_CSS}</style>
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground flex justify-between mb-3">
        <span>{title}</span>
        <span className="normal-case tracking-normal font-medium text-primary">{steps.length} steps</span>
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={resetKey ?? "steps"} className="steps-tl space-y-3">
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
              className="step-row flex items-start gap-3 p-3 rounded-2xl border border-border/50 bg-foreground/[0.03] hover:border-primary/40 transition-colors"
              style={{ willChange: "clip-path" }}
            >
              <span className="step-num flex-shrink-0 w-8 h-8 rounded-full text-primary text-sm flex items-center justify-center font-medium bg-card border border-primary/50 shadow-[0_0_14px] shadow-primary/30 relative z-10">
                {i === steps.length - 1 && steps.length > 1 ? (
                  <Check className="h-4 w-4" />
                ) : (
                  i + 1
                )}
              </span>
              <span className="text-sm break-words min-w-0 flex-1 overflow-x-auto">
                <StepContent text={step} />
              </span>
            </motion.div>
          ))}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
