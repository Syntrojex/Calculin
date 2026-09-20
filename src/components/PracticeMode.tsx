import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MathText } from "./MathText";
import { MathTex } from "./MathTex";
import { StepsReveal } from "./StepsReveal";
import { useSettings } from "@/contexts/SettingsContext";
import { GraduationCap, CheckCircle2, XCircle, RefreshCw, Eye, Trophy } from "lucide-react";
import {
  generateProblem, CATEGORY_LABELS, ALL_CATEGORIES,
  type Category, type Difficulty, type Problem,
} from "@/lib/practice-problems";

/** Renders a prompt that may mix prose with `$inline$` and `$$display$$` math,
 *  so a question can show a matrix, a fraction, or an integral the same way
 *  the worked solution does. Plain prompts fall back to the old formatter. */
function PromptText({ text }: { text: string }) {
  if (!text.includes("$")) return <MathText text={text} />;
  const parts = text.split(/(\$\$[^$]+\$\$|\$[^$\n]+\$)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("$$") && p.endsWith("$$")) return <MathTex key={i} latex={p.slice(2, -2)} display />;
        if (p.startsWith("$") && p.endsWith("$")) return <MathTex key={i} latex={p.slice(1, -1)} />;
        return (
          <span key={i}>
            {p.split(/(\*\*[^*]+\*\*)/g).map((seg, j) =>
              seg.startsWith("**") && seg.endsWith("**")
                ? <strong key={j}>{seg.slice(2, -2)}</strong>
                : <span key={j}>{seg}</span>
            )}
          </span>
        );
      })}
    </>
  );
}

const CATEGORY_CHIPS: (Category | "mixed")[] = ["mixed", ...ALL_CATEGORIES];

export function PracticeMode() {
  const [category, setCategory] = useState<Category | "mixed">("mixed");
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [problem, setProblem] = useState<Problem>(() => generateProblem("mixed", "easy"));
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<"correct" | "incorrect" | "empty" | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [problemKey, setProblemKey] = useState(0);
  const settings = useSettings();

  const newProblem = useCallback((cat: Category | "mixed", diff: Difficulty) => {
    setProblem(generateProblem(cat, diff));
    setAnswer("");
    setFeedback(null);
    setShowAnswer(false);
    setProblemKey((k) => k + 1);
  }, []);

  const checkAnswer = () => {
    if (!answer.trim()) {
      setFeedback("empty");
      return;
    }
    const ok = problem.check(answer);
    setFeedback(ok ? "correct" : "incorrect");
    setScore((s) => ({ correct: s.correct + (ok ? 1 : 0), total: s.total + 1 }));
  };

  return (
    <div className="space-y-6">
      <Card className="border-border/50 shadow-lg border-l-[3px] border-l-primary/50 rounded-l-md">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <GraduationCap className="h-5 w-5 text-primary" />
            Practice Mode
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Exam-style questions across calculus, algebra, matrices and trigonometry — every
            solution is worked through step by step.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {CATEGORY_CHIPS.map((c) => (
              <button
                key={c}
                onClick={() => { setCategory(c); newProblem(c, difficulty); }}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                  category === c ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
                }`}
              >
                {c === "mixed" ? "Mixed" : CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            {(["easy", "medium", "hard"] as Difficulty[]).map((d) => (
              <button
                key={d}
                onClick={() => { setDifficulty(d); newProblem(category, d); }}
                className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-all ${
                  difficulty === d
                    ? d === "easy" ? "bg-green-500/15 text-green-700 dark:text-green-300 border border-green-500/30"
                    : d === "medium" ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30"
                    : "bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30"
                    : "bg-muted text-muted-foreground border border-transparent hover:bg-muted/70"
                }`}
              >
                {d}
              </button>
            ))}
            <div className="flex-1" />
            <Badge variant="secondary" className="gap-1.5 font-mono">
              <Trophy className="h-3 w-3" /> {score.correct}/{score.total}
            </Badge>
          </div>

          {difficulty === "hard" && (
            <p className="text-[11px] text-muted-foreground">
              Hard mode includes long multi-part questions: Gauss-Jordan elimination, integration
              by parts, trigonometric proofs and multi-stage word problems.
            </p>
          )}
        </CardContent>
      </Card>

      <AnimatePresence mode="wait">
        <motion.div
          key={problemKey}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <Card className="border-primary/20 shadow-lg">
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="text-xs">
                  {CATEGORY_LABELS[problem.category]}
                </Badge>
                <Badge variant="secondary" className="text-xs capitalize">{difficulty}</Badge>
              </div>

              <div className="text-base font-medium text-foreground whitespace-pre-line leading-relaxed break-words">
                <PromptText text={problem.prompt} />
              </div>

              <div className="space-y-1">
                <div className="flex gap-2">
                  <Input
                    value={answer}
                    onChange={(e) => { setAnswer(e.target.value); if (feedback) setFeedback(null); }}
                    placeholder="Your answer"
                    className="font-mono"
                    onKeyDown={(e) => e.key === "Enter" && checkAnswer()}
                  />
                  <Button onClick={checkAnswer} className="gap-1.5 shrink-0">
                    Check
                  </Button>
                </div>
                {problem.answerFormat && (
                  <p className="text-[11px] text-muted-foreground">Expected: {problem.answerFormat}</p>
                )}
              </div>

              <AnimatePresence>
                {feedback && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={`flex items-center gap-2 p-3 rounded-lg ${
                      feedback === "correct"
                        ? "bg-green-500/10 border border-green-500/20 text-green-700 dark:text-green-300"
                        : feedback === "empty"
                        ? "bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300"
                        : "bg-destructive/10 border border-destructive/20 text-destructive"
                    }`}
                  >
                    {feedback === "correct" ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> : <XCircle className="h-4 w-4 flex-shrink-0" />}
                    <span className="text-sm font-medium">
                      {feedback === "correct"
                        ? "Correct! Well done."
                        : feedback === "empty"
                        ? "Please enter an answer first."
                        : "Not quite — try again or reveal the worked solution."}
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setShowAnswer((v) => !v)} className="gap-1.5 text-xs">
                  <Eye className="h-3.5 w-3.5" /> {showAnswer ? "Hide" : "Show"} Answer
                </Button>
                <Button variant="ghost" size="sm" onClick={() => newProblem(category, difficulty)} className="gap-1.5 text-xs">
                  <RefreshCw className="h-3.5 w-3.5" /> New Problem
                </Button>
              </div>

              {showAnswer && (
                <div className="space-y-3">
                  <div className="p-3 rounded-lg bg-muted/50 text-sm font-mono break-words overflow-x-auto no-scrollbar">
                    <span className="text-muted-foreground">Answer: </span>
                    <MathText text={problem.correctAnswer} />
                    {problem.hint && <div className="text-xs text-muted-foreground mt-1 font-sans">Hint: {problem.hint}</div>}
                  </div>
                  <StepsReveal steps={problem.steps} show={settings.showSteps} resetKey={`${problemKey}-answer`} title="Worked Solution:" />
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
