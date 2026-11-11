import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen, FileDown, Loader2, Copy, Check } from "lucide-react";
import { MathTex } from "./MathTex";
import { FORMULA_TOPICS } from "@/lib/formula-sheet-data";
import { exportFormulaSheetPDF } from "@/lib/pdf-export";

interface FormulaSheetProps {
  topicKey: string;
}

/** Renders a note that may contain inline `$...$` math segments (e.g. "for
 *  $n \neq -1$") as a mix of plain text and inline KaTeX. */
function NoteText({ text }: { text: string }) {
  const parts = text.split(/(\$[^$]+\$)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("$") && p.endsWith("$") ? <MathTex key={i} latex={p.slice(1, -1)} /> : <span key={i}>{p}</span>
      )}
    </>
  );
}

export function FormulaSheet({ topicKey }: FormulaSheetProps) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  // Desktop-only extras: filter box and copy-LaTeX on hover.
  const query = "";
  const [copied, setCopied] = useState<number | null>(null);
  const topic = FORMULA_TOPICS.find((t) => t.key === topicKey);

  if (!topic) {
    return (
      <Card className="border-destructive/20">
        <CardContent className="pt-4 text-destructive text-sm">Unknown formula topic.</CardContent>
      </Card>
    );
  }

  const handleExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      await exportFormulaSheetPDF(topic);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Couldn't generate the PDF. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-border/50 shadow-lg border-l-[3px] border-l-primary/50 rounded-l-md sm:rounded-3xl sm:border-l sm:border-l-border/50">
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <BookOpen className="h-5 w-5 text-primary" />
                {topic.title}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">{topic.description}</p>
            </div>
            <Button onClick={handleExport} disabled={exporting} className="gap-2 shrink-0">
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              Export as PDF
            </Button>
          </div>
          {exportError && (
            <div className="text-xs text-destructive mt-2">{exportError}</div>
          )}
        </CardHeader>
      </Card>


      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="grid sm:grid-cols-2 gap-3"
      >
        {topic.formulas.map((f, i) => ({ f, i })).filter(({ f }) => `${f.name} ${f.latex} ${f.note ?? ""}`.toLowerCase().includes(query.trim().toLowerCase())).map(({ f, i }) => (
          <Card key={i} className="group relative shadow-sm border-border/50 border-l-4 border-l-primary sm:rounded-2xl sm:border-l sm:border-l-border/50 sm:transition-all sm:hover:-translate-y-0.5 sm:hover:border-primary/40 sm:hover:shadow-[0_16px_36px_-16px] sm:hover:shadow-primary/50">
            <CardContent className="pt-4 pb-4">
              <button
                type="button"
                aria-label="Copy LaTeX"
                title="Copy LaTeX"
                onClick={() => { navigator.clipboard?.writeText(f.latex).then(() => { setCopied(i); setTimeout(() => setCopied((c) => (c === i ? null : c)), 1200); }).catch(() => {}); }}
                className="hidden sm:flex absolute right-3 top-3 h-7 w-7 items-center justify-center rounded-lg border border-border/60 bg-background/70 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 hover:text-primary hover:border-primary/40"
              >
                {copied === i ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
              <div className="text-sm font-semibold text-foreground mb-1.5 sm:text-[11px] sm:uppercase sm:tracking-[0.14em] sm:text-primary">{f.name}</div>
              <div className="overflow-x-auto">
                <MathTex latex={f.latex} display />
              </div>
              {f.note && <div className="text-xs text-muted-foreground mt-1.5"><NoteText text={f.note} /></div>}
            </CardContent>
          </Card>
        ))}
      </motion.div>
    </div>
  );
}
