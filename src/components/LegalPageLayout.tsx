interface LegalPageLayoutProps {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
}

export function LegalPageLayout({ title, lastUpdated, children }: LegalPageLayoutProps) {
  return (
    <div className="force-light min-h-screen bg-background">
      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground mb-2">{title}</h1>
        <p className="text-sm text-muted-foreground mb-10">Last updated: {lastUpdated}</p>

        <div className="space-y-8 text-foreground/90 leading-relaxed [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-foreground [&_h2]:mt-2 [&_h2]:mb-3 [&_p]:text-sm [&_p]:text-muted-foreground [&_p]:mb-3 [&_li]:text-sm [&_li]:text-muted-foreground [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5">
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
