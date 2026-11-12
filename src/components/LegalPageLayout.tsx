import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

interface LegalPageLayoutProps {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
}

// Desktop-only polish (min-width:640px); the phone layout is unchanged.
const LEGAL_CSS = `
@media (min-width: 640px) {
  .legal-page { background:
    radial-gradient(700px 320px at 15% -5%, color-mix(in oklab, var(--primary) 16%, transparent), transparent 70%),
    radial-gradient(600px 300px at 90% 0%, color-mix(in oklab, #35d0ff 9%, transparent), transparent 70%),
    var(--background); }
  .legal-page h1 { font-family: "Instrument Serif", "Cormorant Garamond", Georgia, "Times New Roman", serif; font-weight: 400; font-size: 3.4rem; line-height: 1.02; letter-spacing: 0; }
  .legal-body h2 { position: relative; padding-left: 14px; }
  .legal-body h2::before { content: ""; position: absolute; left: 0; top: .25em; bottom: .25em; width: 3px; border-radius: 3px; background: linear-gradient(var(--primary), color-mix(in oklab, var(--primary) 30%, transparent)); }
}
`;

export function LegalPageLayout({ title, lastUpdated, children }: LegalPageLayoutProps) {
  return (
    <div className="legal-page force-light min-h-screen bg-background">
      <style>{LEGAL_CSS}</style>
      <main className="mx-auto max-w-3xl px-4 py-12">
        <Link to="/" className="inline-flex items-center gap-2 mb-8 rounded-full border border-border/60 bg-card/70 px-4 py-1.5 text-sm text-muted-foreground backdrop-blur transition-colors hover:text-primary hover:border-primary/40">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Calculin
        </Link>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground mb-2">{title}</h1>
        <p className="text-sm text-muted-foreground mb-10">Last updated: {lastUpdated}</p>

        <div className="legal-body space-y-8 text-foreground/90 leading-relaxed sm:rounded-3xl sm:border sm:border-border/50 sm:bg-card/70 sm:p-10 sm:shadow-xl sm:backdrop-blur [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-foreground [&_h2]:mt-2 [&_h2]:mb-3 [&_p]:text-sm [&_p]:text-muted-foreground [&_p]:mb-3 [&_li]:text-sm [&_li]:text-muted-foreground [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5">
          {children}
        </div>
      </main>

      <footer className="border-t border-border/50 py-8 mt-8">
        <div className="mx-auto max-w-3xl px-4 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Built by Muhammad Mustafa. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
