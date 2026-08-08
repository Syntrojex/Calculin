import { createFileRoute } from "@tanstack/react-router";
import { LegalPageLayout } from "@/components/LegalPageLayout";
import { Button } from "@/components/ui/button";
import { Github, Linkedin } from "lucide-react";

export const Route = createFileRoute("/feedback")({
  component: FeedbackPage,
  head: () => ({ meta: [{ title: "Feedback — Calculin" }] }),
});

function FeedbackPage() {
  return (
    <LegalPageLayout title="Feedback" lastUpdated="August 2026">
      <section>
        <h2>We'd Love to Hear From You</h2>
        <p>
          Found a bug, have an idea for a new tool, or noticed a calculation
          that doesn't look right? Here's how to reach out.
        </p>
      </section>

      <section>
        <h2>Report a Bug or Issue</h2>
        <p>
          The fastest way to report something broken — a wrong step in a
          solution, a tool that isn't working, a mislabeled result — is to
          open an issue on GitHub. Include what you were calculating and
          which tool or page the problem is on.
        </p>
        <Button asChild className="gap-2">
          <a
            href="https://github.com/Syntrojex/Calculin"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Github className="h-4 w-4" />
            Open an Issue on GitHub
          </a>
        </Button>
      </section>

      <section>
        <h2>Suggest a Tool or Feature</h2>
        <p>
          Think a calculator or feature is missing from Calculin?
          Suggestions are welcome — reach out via GitHub or LinkedIn with
          what you'd like to see added and why.
        </p>
      </section>

      <section>
        <h2>Content Quality Feedback</h2>
        <p>
          If a specific step-by-step solution didn't land — too fast, too
          slow, missing a step, or just plain wrong — that's exactly the
          kind of feedback that improves Calculin fastest.
        </p>
      </section>

      <section>
        <h2>Direct Contact</h2>
        <p>For anything else, connect directly:</p>
        <div className="flex gap-3 not-prose">
          <Button asChild variant="outline" size="sm" className="gap-2">
            <a
              href="https://www.linkedin.com/in/mustafa-amir-syntrojex"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Linkedin className="h-4 w-4" />
              LinkedIn
            </a>
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-2">
            <a
              href="https://github.com/Syntrojex"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Github className="h-4 w-4" />
              GitHub
            </a>
          </Button>
        </div>
      </section>
    </LegalPageLayout>
  );
}
