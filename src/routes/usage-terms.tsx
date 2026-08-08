import { createFileRoute } from "@tanstack/react-router";
import { LegalPageLayout } from "@/components/LegalPageLayout";

export const Route = createFileRoute("/usage-terms")({
  component: UsageTermsPage,
  head: () => ({ meta: [{ title: "Usage Terms — Calculin" }] }),
});

function UsageTermsPage() {
  return (
    <LegalPageLayout title="Usage Terms" lastUpdated="August 2026">
      <section>
        <h2>1. Acceptance of Terms</h2>
        <p>
          By accessing or using Calculin ("the Service"), you agree to be bound by
          these Usage Terms. If you do not agree with any part of these terms, please
          do not use the Service.
        </p>
      </section>

      <section>
        <h2>2. Who Can Use Calculin</h2>
        <p>
          Calculin is free for anyone to use — students, educators, professionals, and
          hobbyists alike, anywhere in the world. No account, sign-up, subscription, or
          payment is required for any feature, including the 3D graphing and Practice tools.
        </p>
      </section>

      <section>
        <h2>3. Acceptable Use</h2>
        <p>You agree to use Calculin only for lawful purposes. You agree not to:</p>
        <ul>
          <li>Attempt to disrupt, overload, or interfere with the Service's normal operation.</li>
          <li>Use automated scripts to scrape, mirror, or excessively query the Service in a way that degrades performance for others.</li>
          <li>Reverse-engineer the Service with the intent to redistribute it as your own without attribution.</li>
          <li>Use the Service to generate or distribute content that is unlawful, harmful, or infringes on others' rights.</li>
          <li>Misrepresent your relationship with Calculin or its creator in any public or commercial context.</li>
        </ul>
      </section>

      <section>
        <h2>4. No Account Required</h2>
        <p>
          Calculin does not require you to create an account. Any preferences you set
          (theme, accent color, number format, default graph range, and similar
          settings) are stored locally in your browser using standard web storage, and
          are never transmitted to a server. Uninstalling your browser or clearing site
          data will reset these preferences.
        </p>
      </section>

      <section>
        <h2>5. Accuracy of Results</h2>
        <p>
          Calculin is provided to help you learn and verify mathematics, not as a
          substitute for professional, academic, financial, or engineering judgment.
          While every effort has been made to ensure correctness — including numeric
          verification on several tools — results are provided "as is" without warranty
          of any kind. You are responsible for independently verifying any result used
          in a graded, financial, or safety-critical context.
        </p>
      </section>

      <section>
        <h2>6. Intellectual Property</h2>
        <p>
          The Calculin name, visual design, and underlying source code are the property
          of Muhammad Mustafa unless otherwise noted. You may use the Service for
          personal, educational, and non-commercial purposes freely. Redistribution of
          the source code, in whole or in part, as a competing product without
          permission is not permitted.
        </p>
      </section>

      <section>
        <h2>7. Changes to the Service</h2>
        <p>
          Calculin is actively developed and may change, add, or remove features at any
          time without prior notice — new tools are added regularly. These Usage Terms
          may also be updated periodically; continued use of the Service after changes
          are posted constitutes acceptance of the revised terms.
        </p>
      </section>

      <section>
        <h2>8. Contact</h2>
        <p>
          Questions, concerns, or clarifications about these terms can be sent via the
          Feedback page linked in the footer.
        </p>
      </section>
    </LegalPageLayout>
  );
}
