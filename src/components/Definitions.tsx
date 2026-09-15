import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Library, FileDown, Loader2 } from "lucide-react";
import { MathTex } from "./MathTex";
import { DEFINITION_TOPICS } from "@/lib/definitions-data";
import { exportDefinitionsPDF } from "@/lib/definitions-pdf-export";

interface DefinitionsProps {
  topicKey: string;
}

/** Renders text that may contain inline `$...$` math segments as a mix of
 *  plain text and inline KaTeX. */
function RichText({ text }: { text: string }) {
  const parts = text.split(/(\$[^$]+\$)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("$") && p.endsWith("$") ? <MathTex key={i} latex={p.slice(1, -1)} /> : <span key={i}>{p}</span>
      )}
    </>
  );
}

export function Definitions({ topicKey }: DefinitionsProps) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const topic = DEFINITION_TOPICS.find((t) => t.key === topicKey);

  if (!topic) {
    return (
      <Card className="border-destructive/20">
        <CardContent className="pt-4 text-destructive text-sm">Unknown definitions topic.</CardContent>
      </Card>
    );
  }

  const handleExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      await exportDefinitionsPDF(topic);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Couldn't generate the PDF. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-border/50 shadow-lg border-l-[3px] border-l-primary/50 rounded-l-md">
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Library className="h-5 w-5 text-primary" />
                {topic.title}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">{topic.description}</p>
            </div>
            <Button onClick={handleExport} disabled={exporting} className="gap-2 shrink-0">
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              Export as PDF
            </Button>
          </div>
          {exportError && <div className="text-xs text-destructive mt-2">{exportError}</div>}
        </CardHeader>
      </Card>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="space-y-3">
        {topic.definitions.map((d, i) => (
          <Card key={i} className="shadow-sm border-border/50 border-l-4 border-l-primary">
            <CardContent className="pt-4 pb-4 space-y-1.5">
              <div className="text-sm font-semibold text-foreground">{d.term}</div>
              <div className="text-sm text-foreground/90 leading-relaxed"><RichText text={d.definition} /></div>
              {d.example && (
                <div className="text-xs text-muted-foreground mt-1.5 pt-1.5 border-t border-border/40">
                  <span className="font-medium">Example: </span>
                  <RichText text={d.example} />
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </motion.div>
    </div>
  );
}
