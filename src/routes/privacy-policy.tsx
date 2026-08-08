import { createFileRoute } from "@tanstack/react-router";
import { LegalPageLayout } from "@/components/LegalPageLayout";

export const Route = createFileRoute("/privacy-policy")({
  component: PrivacyPolicyPage,
  head: () => ({ meta: [{ title: "Privacy Policy — Calculin" }] }),
});

function PrivacyPolicyPage() {
  return (
    <LegalPageLayout title="Privacy Policy" lastUpdated="August 2026">
      <section>
        <h2>Our Approach to Privacy</h2>
        <p>
          Calculin was built with a simple principle: your math is your business. The
          Service does not require an account, does not ask for your name or email to
          function, and does not send the expressions you type to any server for
          calculation — every computation runs locally in your own browser, on your own
          device, using your own device's processing power.
        </p>
      </section>

      <section>
        <h2>What We Store</h2>
        <p>
          Calculin uses your browser's local storage to remember your preferences —
          things like your chosen theme, accent color, decimal precision, default graph
          range, and whether step-by-step solutions are shown by default. This data
          stays on your device and is never transmitted anywhere. Clearing your
          browser's site data will reset these preferences to their defaults, and
          uninstalling the browser removes them entirely.
        </p>
      </section>

      <section>
        <h2>What We Don't Collect</h2>
        <ul>
          <li>No account registration, so there's no name, email, or password on file anywhere.</li>
          <li>No tracking cookies and no third-party advertising trackers of any kind.</li>
          <li>No server-side logging of the math expressions or numbers you enter.</li>
          <li>No location tracking, device fingerprinting, or analytics beacons.</li>
          <li>No selling or sharing of personal data — we simply don't have any to sell.</li>
        </ul>
      </section>

      <section>
        <h2>Feedback Submissions</h2>
        <p>
          If you choose to use the Feedback page and voluntarily provide contact
          details, that information is used solely to respond to your message. It is
          not added to any mailing list, not shared with third parties, and not used
          for any purpose beyond addressing what you wrote.
        </p>
      </section>

      <section>
        <h2>Children's Privacy</h2>
        <p>
          Calculin is a general-audience educational tool and does not knowingly
          collect personal information from anyone, including children, since no
          personal information is collected from any user in the first place. Parents
          and educators can use Calculin with students without any data-collection concerns.
        </p>
      </section>

      <section>
        <h2>Changes to This Policy</h2>
        <p>
          This Privacy Policy may be updated as the Service evolves — for example, if a
          new optional feature were ever introduced that involved data handling.
          Material changes will always be reflected by updating the "Last updated" date
          above, and we will never retroactively reduce your privacy without clear notice.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          Privacy questions, requests, or concerns can be sent via the Feedback page
          linked in the footer.
        </p>
      </section>
    </LegalPageLayout>
  );
}
