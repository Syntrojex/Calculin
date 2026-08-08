import { createFileRoute } from "@tanstack/react-router";
import { LegalPageLayout } from "@/components/LegalPageLayout";

export const Route = createFileRoute("/documentation")({
  component: DocumentationPage,
  head: () => ({ meta: [{ title: "Documentation — Calculin" }] }),
});

function DocumentationPage() {
  return (
    <LegalPageLayout title="Documentation" lastUpdated="August 2026">
      <section>
        <h2>Welcome to Calculin</h2>
        <p>
          Calculin is a free, browser-based calculator suite built for students, teachers,
          and anyone who needs to solve math problems with clear, step-by-step working —
          not just a final number. Every tool below runs entirely in your browser; nothing
          you type is sent to a server, and there's no account or sign-up required for
          any feature.
        </p>
      </section>

      <section>
        <h2>Calculus Tools</h2>
        <p>
          <strong>Derivative</strong> finds f'(x) for polynomials, trigonometric functions,
          and exponentials, including higher-order derivatives (2nd, 3rd, and beyond),
          with each application of the power, chain, or trig rule shown as its own step.
        </p>
        <p>
          <strong>Integral</strong> handles definite integrals (using Simpson's Rule for
          high numerical accuracy), indefinite integrals (using a recursive symbolic
          solver that knows the power rule, sum rule, and trig and exponential forms with
          linear substitution), and double integrals over a rectangular region.
        </p>
        <p>
          <strong>Calc+</strong> covers partial derivatives with respect to any chosen
          variable, and finding extrema (maxima, minima) for both single- and
          two-variable functions.
        </p>
        <p>
          <strong>Limits</strong> numerically approximates one-sided and two-sided
          limits, including limits at infinity, by sampling values that approach the
          target from both directions.
        </p>
      </section>

      <section>
        <h2>Algebra & Equations</h2>
        <p>
          <strong>Equations</strong> solves linear and quadratic equations from any valid
          algebraic form — you can type the full equation (terms on either side) and
          Calculin extracts the coefficients automatically, rather than asking you to
          isolate them by hand.
        </p>
        <p>
          The same tab also includes a dedicated <strong>Graph Equation</strong> tool:
          type an equation using x, x and y, or x, y and z, and Calculin automatically
          renders a 2D function graph, a 2D implicit curve (like a circle or ellipse), or
          a 3D implicit surface (like a sphere or plane), depending on how many variables
          you use.
        </p>
      </section>

      <section>
        <h2>Other Tools</h2>
        <ul>
          <li><strong>Matrix</strong> — addition, subtraction, multiplication, determinant, inverse, transpose, rank, row echelon form, and Cramer's Rule.</li>
          <li><strong>Trignometry</strong> — a full identity reference organized by category, plus a Prove Identity tool that simplifies both sides of an equation symbolically using real trig identities and shows its reasoning.</li>
          <li><strong>Complex</strong> — arithmetic, modulus/argument, polar-to-rectangular conversion, powers, principal roots, and De Moivre's Theorem.</li>
          <li><strong>Num Theory</strong> — GCD/LCM via the Euclidean algorithm, prime factorization with full factor trees, and prime listing up to a chosen limit.</li>
          <li><strong>Shapes</strong> — area and perimeter for circles, rectangles, triangles, trapezoids, parallelograms, ellipses, rhombi, sectors, and rings.</li>
          <li><strong>Converter</strong> — length, weight, temperature, speed, and area unit conversion with live results.</li>
          <li><strong>Num Systems</strong> — convert any number between bases 2 through 36, with the full division/remainder working shown.</li>
          <li><strong>Graph</strong> — 2D function plotting with Compare Mode (overlay multiple functions with automatic intersection-point detection), and a fully interactive, color-mapped 3D surface plotter you can rotate and zoom.</li>
          <li><strong>Practice</strong> — randomly generated problems across every category and difficulty level, including real-world word problems, with full worked solutions revealed on demand.</li>
        </ul>
      </section>

      <section>
        <h2>Settings</h2>
        <p>
          The gear icon in the header opens Settings, where you can choose decimal,
          fraction, or scientific notation for results; control decimal precision (1–10
          places); toggle step-by-step solutions and auto-calculate on by default; switch
          between radians and degrees; pick an accent color and light/dark theme; and
          adjust the default graph range and step-reveal animation speed. Every
          preference is saved automatically in your browser and restored next time you visit.
        </p>
      </section>

      <section>
        <h2>Tips for Best Results</h2>
        <p>
          Use <code>^</code> for exponents (e.g. <code>x^2</code>), <code>*</code> for
          multiplication where it isn't implied, and standard function names like{" "}
          <code>sin(x)</code>, <code>cos(x)</code>, <code>log(x)</code>, and{" "}
          <code>sqrt(x)</code>. Pi and e are recognized as constants. If a tool's result
          looks unexpected, try enabling Show Steps in Settings to follow exactly how
          Calculin arrived at the answer.
        </p>
      </section>

      <section>
        <h2>A Note on Accuracy</h2>
        <p>
          Calculin uses a mix of exact symbolic methods and numerical approximation
          (Simpson's Rule, finite differences, grid-based isosurface detection)
          depending on the tool. Results are rounded for display according to your
          Settings, but the underlying calculations retain full floating-point precision
          internally. For anything safety-critical or graded, please double-check
          important results independently.
        </p>
      </section>
    </LegalPageLayout>
  );
}
