import { motion, AnimatePresence } from "framer-motion";
import { MathText } from "./MathText";
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
              <span className="text-sm font-mono break-words">
                <MathText text={step} />
              </span>
            </motion.div>
          ))}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
