import { createFileRoute } from "@tanstack/react-router";
import { LegalPageLayout } from "@/components/LegalPageLayout";

export const Route = createFileRoute("/about")({
  component: AboutPage,
  head: () => ({ meta: [{ title: "About — Calculin" }] }),
});

function AboutPage() {
  return (
    <LegalPageLayout title="About Calculin" lastUpdated="August 2026">
      <section>
        <h2>What is Calculin?</h2>
        <p>
          Calculin is a free, all-in-one math companion for anyone who wants more
          than just an answer. Type in a derivative, an integral, an equation, a
          matrix, a trig identity, or a graph — and Calculin walks you through it
          step by step, the same way you'd solve it by hand, so the "why" behind
          the result is never a mystery.
        </p>
      </section>

      <section>
        <h2>Why It Exists</h2>
        <p>
          Most calculators online either hide their steps behind a paywall or don't
          show them at all. Calculin was built to fix that: derivatives, integrals,
          equations, matrices, trigonometry, complex numbers, number theory, geometry,
          2D/3D graphing, and a practice mode with worked solutions — all free, all in
          one place, with no account required.
        </p>
      </section>

      <section>
        <h2>Who Built It</h2>
        <p>
          Calculin is developed by <strong>Muhammad Mustafa Amir</strong> — also
          known as <strong>Syntrojex</strong>, which is his GitHub handle as well.
          He is a BS Software Engineering student at FAST National University,
          Lahore.
        </p>
        <p>
          He specializes in Flutter and Dart development, with a strong command of
          state management and a solid foundation in C++. He also has hands-on
          experience in game development. He enjoys building modern, scalable, and
          user-friendly applications, and is continuously sharpening his skills
          across software engineering, mobile app & game development, and
          problem-solving. Calculin is an independent, continually evolving
          project — new tools and improvements are added regularly.
        </p>
        <p>
          <strong>Tech Stack:</strong> Flutter • Dart • State Management • Firebase •
          C++ • Git &amp; GitHub
        </p>
      </section>

      <section>
        <h2>Message from the Owner</h2>
        <p>
          Hi, I'm Muhammad Mustafa Amir. I built Calculin on my own, alongside my
          software engineering studies.
        </p>
        <p>
          The idea came from something pretty simple: I got tired of calculators
          that just gave a final answer with no explanation, or hid the actual
          steps behind a subscription. So I built the tool I wished existed —
          derivatives, integrals, matrices, graphs, and more, all free, all showing
          their work.
        </p>
        <p>
          It's a one-person project, still growing as I keep learning and adding to
          it in my free time. If you spot a bug, have an idea, or just want to say
          something worked well for you, the Feedback link below actually reaches
          me — I read every message. Thanks for giving it a try.
        </p>
      </section>

      <section>
        <h2>Get in Touch</h2>
        <p>
          Found a bug, have a feature request, or just want to say hello? Use the
          Feedback link in the footer, or connect via the GitHub and LinkedIn links
          at the bottom of the page.
        </p>
      </section>
    </LegalPageLayout>
  );
}
