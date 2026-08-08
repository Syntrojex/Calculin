import { createFileRoute } from "@tanstack/react-router";
import { LegalPageLayout } from "@/components/LegalPageLayout";

export const Route = createFileRoute("/terms-of-service")({
  component: TermsOfServicePage,
  head: () => ({ meta: [{ title: "Terms of Service — Calculin" }] }),
});

function TermsOfServicePage() {
  return (
    <LegalPageLayout title="Terms of Service" lastUpdated="August 2026">
      <section>
        <h2>1. Overview</h2>
        <p>
          These Terms of Service ("Terms") govern your access to and use of Calculin,
          a free online calculator suite covering calculus, algebra, trigonometry,
          complex numbers, number theory, geometry, graphing, and practice problems.
          By using Calculin, you agree to these Terms in full.
        </p>
      </section>

      <section>
        <h2>2. License to Use</h2>
        <p>
          Subject to these Terms, Calculin grants you a personal, non-exclusive,
          non-transferable, revocable license to access and use the Service for
          lawful, personal, or educational purposes.
        </p>
      </section>

      <section>
        <h2>3. No Warranty</h2>
        <p>
          The Service is provided "as is" and "as available," without warranties of
          any kind, whether express or implied, including but not limited to
          warranties of merchantability, fitness for a particular purpose, or
          non-infringement. We do not warrant that the Service will be uninterrupted,
          timely, secure, or error-free, or that calculation results will be accurate
          in every conceivable case.
        </p>
      </section>

      <section>
        <h2>4. Limitation of Liability</h2>
        <p>
          To the fullest extent permitted by law, Muhammad Mustafa and any
          contributors to Calculin shall not be liable for any indirect, incidental,
          special, consequential, or punitive damages, or any loss of data, profits,
          or academic standing, arising from your use of or inability to use the
          Service, even if advised of the possibility of such damages.
        </p>
      </section>

      <section>
        <h2>5. Availability & Modifications</h2>
        <p>
          We reserve the right to modify, suspend, or discontinue the Service (or any
          part of it), temporarily or permanently, with or without notice. We are not
          liable for any modification, suspension, or discontinuation of the Service.
        </p>
      </section>

      <section>
        <h2>6. Third-Party Links</h2>
        <p>
          The Service may link to third-party sites (such as a GitHub repository or
          LinkedIn profile). We are not responsible for the content, accuracy, or
          practices of any linked third-party site.
        </p>
      </section>

      <section>
        <h2>7. Termination</h2>
        <p>
          Since Calculin requires no account, there is nothing to "terminate" on our
          end — you may simply stop using the Service at any time. We reserve the
          right to restrict access to the Service for anyone who violates these Terms
          or the Usage Terms.
        </p>
      </section>

      <section>
        <h2>8. Governing Law</h2>
        <p>
          These Terms are governed by applicable local law in the jurisdiction where
          the Service is operated, without regard to conflict-of-law principles.
        </p>
      </section>

      <section>
        <h2>9. Changes to These Terms</h2>
        <p>
          We may revise these Terms from time to time. The "Last updated" date above
          reflects the most recent changes. Continued use of the Service after changes
          are posted constitutes acceptance of the revised Terms.
        </p>
      </section>

      <section>
        <h2>10. Contact</h2>
        <p>
          Questions about these Terms can be sent via the Feedback page linked in the footer.
        </p>
      </section>
    </LegalPageLayout>
  );
}
