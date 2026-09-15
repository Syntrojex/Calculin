export interface DefinitionEntry {
  term: string;
  /** Plain-language definition. May include inline `$...$` math. */
  definition: string;
  /** A concrete worked example. May include inline `$...$` math. */
  example?: string;
}

export interface DefinitionTopic {
  key: string;
  navLabel: string;
  title: string;
  description: string;
  definitions: DefinitionEntry[];
}

export const DEFINITION_TOPICS: DefinitionTopic[] = [
  {
    key: "derivative",
    navLabel: "Derivatives",
    title: "Derivative Definitions",
    description: "Core vocabulary for differentiation, used throughout the Derivative calculator.",
    definitions: [
      { term: "Derivative", definition: "The instantaneous rate of change of a function — equivalently, the slope of the tangent line to its graph at a point.", example: "For $f(x) = x^2$, the derivative $f'(x) = 2x$ gives the slope at any $x$; at $x=3$ the slope is $6$." },
      { term: "Differentiable", definition: "A function is differentiable at a point if its derivative exists there (the graph has a well-defined, non-vertical tangent line, with no sharp corner or break).", example: "$f(x) = |x|$ is NOT differentiable at $x=0$ — it has a sharp corner there." },
      { term: "Higher-Order Derivative", definition: "The derivative of a derivative. The 2nd derivative $f''(x)$ measures how the slope itself is changing (concavity); the 3rd, 4th, etc. continue the pattern.", example: "For $f(x)=x^3$: $f'(x)=3x^2$, $f''(x)=6x$, $f'''(x)=6$." },
      { term: "Critical Point", definition: "A point where $f'(x) = 0$ or $f'(x)$ is undefined — a candidate location for a local maximum, local minimum, or neither.", example: "For $f(x)=x^2-4x$, $f'(x)=2x-4=0$ at $x=2$ — a critical point (here, a minimum)." },
      { term: "Local Maximum / Minimum", definition: "A point where a function's value is higher (or lower) than all nearby points — found by checking where $f'$ changes sign at a critical point.", example: "$f(x)=-x^2$ has a local maximum at $x=0$, since $f'$ goes from positive to negative there." },
      { term: "Concavity", definition: "Whether a curve bends upward (concave up, $f''>0$) or downward (concave down, $f''<0$).", example: "$f(x)=x^2$ has $f''(x)=2>0$ everywhere, so it's concave up everywhere (a familiar upward-opening parabola)." },
      { term: "Inflection Point", definition: "A point where a curve changes concavity — from concave up to concave down, or vice versa (where $f''$ changes sign).", example: "$f(x)=x^3$ has $f''(x)=6x$, which changes sign at $x=0$ — an inflection point." },
      { term: "Chain Rule (concept)", definition: "The rule for differentiating a composition of functions (a \"function of a function\") — differentiate the outer function, then multiply by the derivative of the inner function.", example: "For $f(x)=\\sin(3x)$: outer $\\sin(u)$, inner $u=3x$, so $f'(x)=\\cos(3x)\\cdot 3$." },
    ],
  },
  {
    key: "integration",
    navLabel: "Integrals",
    title: "Integration Definitions",
    description: "Core vocabulary for integration, used throughout the Integration calculator.",
    definitions: [
      { term: "Antiderivative", definition: "A function $F(x)$ whose derivative equals a given function $f(x)$ — i.e. $F'(x) = f(x)$. Antiderivatives aren't unique: any two differ only by a constant.", example: "$F(x) = x^2$ is an antiderivative of $f(x) = 2x$, since $\\frac{d}{dx}[x^2] = 2x$." },
      { term: "Indefinite Integral", definition: "The general family of all antiderivatives of a function, written $\\int f(x)\\,dx$ and always including \"$+ C$\" for an arbitrary constant.", example: "$\\int 2x\\,dx = x^2 + C$ — every value of $C$ gives a valid antiderivative." },
      { term: "Definite Integral", definition: "The signed area between a curve and the x-axis over a specific interval $[a,b]$, written $\\int_a^b f(x)\\,dx$ — a single number, not a family of functions.", example: "$\\int_0^2 x\\,dx = 2$ — the area of the triangle under the line $y=x$ from $0$ to $2$." },
      { term: "Constant of Integration (C)", definition: "The \"+C\" added to every indefinite integral, representing that infinitely many antiderivatives exist (any constant added to one still has the same derivative).", example: "Both $x^2+1$ and $x^2-5$ have derivative $2x$ — both are captured by $x^2+C$." },
      { term: "Riemann Sum", definition: "An approximation of the area under a curve by summing the areas of many thin rectangles — the idea a definite integral makes exact as the rectangles become infinitely thin.", example: "Approximating $\\int_0^1 x^2\\,dx$ with 4 rectangles of width $0.25$ each." },
      { term: "Area Under a Curve", definition: "The region enclosed between a function's graph and the x-axis over an interval — computed exactly using a definite integral.", example: "The area under $f(x)=x^2$ from $x=0$ to $x=3$ is $\\int_0^3 x^2\\,dx = 9$." },
      { term: "Fundamental Theorem of Calculus", definition: "The theorem connecting derivatives and integrals: it says differentiation and integration are reverse processes of each other, and gives the shortcut $\\int_a^b f(x)\\,dx = F(b)-F(a)$.", example: "For $f(x)=x$: $F(x)=\\frac{x^2}{2}$, so $\\int_1^3 x\\,dx = F(3)-F(1) = 4.5-0.5=4$." },
    ],
  },
  {
    key: "limits",
    navLabel: "Limits",
    title: "Limit Definitions",
    description: "Core vocabulary for limits and continuity, used in the Limits calculator.",
    definitions: [
      { term: "Limit", definition: "The value a function approaches as its input gets arbitrarily close to some point — regardless of whether the function is actually defined at that exact point.", example: "$\\lim_{x\\to 2}(x+3) = 5$, even though this just means \"as $x$ nears $2$\"." },
      { term: "One-Sided Limit", definition: "The value a function approaches from only the left ($x\\to a^-$) or only the right ($x\\to a^+$) — useful when a function behaves differently on each side.", example: "For $f(x)=\\frac{|x|}{x}$: $\\lim_{x\\to 0^-}f(x)=-1$ but $\\lim_{x\\to 0^+}f(x)=1$." },
      { term: "Two-Sided Limit Exists", definition: "A two-sided limit exists exactly when both one-sided limits exist AND agree with each other.", example: "Since the left/right limits of $\\frac{|x|}{x}$ at $0$ disagree ($-1$ vs $1$), the two-sided limit does not exist." },
      { term: "Continuity", definition: "A function is continuous at a point if the limit there exists AND equals the function's actual value at that point (no gaps, jumps, or holes).", example: "$f(x)=x^2$ is continuous everywhere: $\\lim_{x\\to a}f(x) = f(a)$ for every $a$." },
      { term: "Discontinuity", definition: "A point where a function fails to be continuous — the limit doesn't exist, or doesn't match the function's actual value there.", example: "$f(x)=\\frac{1}{x}$ has a discontinuity at $x=0$, where the function is undefined." },
      { term: "Removable Discontinuity", definition: "A \"hole\" in a graph where the limit exists, but either the function isn't defined there or its actual value doesn't match the limit — it could be \"fixed\" by redefining just that one point.", example: "$f(x)=\\frac{x^2-1}{x-1}$ has a removable discontinuity at $x=1$ (it simplifies to $x+1$ everywhere else)." },
      { term: "Vertical Asymptote", definition: "A vertical line $x=a$ that a function's graph approaches but never reaches, where the function's values grow without bound (the limit is $+\\infty$ or $-\\infty$).", example: "$f(x)=\\frac{1}{x}$ has a vertical asymptote at $x=0$." },
      { term: "Horizontal Asymptote", definition: "A horizontal line $y=L$ that a function's graph approaches as $x\\to\\infty$ or $x\\to-\\infty$.", example: "$f(x)=\\frac{1}{x}$ has a horizontal asymptote at $y=0$, since $\\lim_{x\\to\\infty}\\frac{1}{x}=0$." },
    ],
  },
  {
    key: "equations",
    navLabel: "Equations",
    title: "Equation Definitions",
    description: "Core vocabulary for equations, used in the Equation Solver.",
    definitions: [
      { term: "Linear Equation", definition: "An equation where the variable appears only to the first power — its graph is a straight line.", example: "$3x + 5 = 20$ is linear; solving gives $x=5$." },
      { term: "Quadratic Equation", definition: "An equation where the variable's highest power is 2, of the standard form $ax^2+bx+c=0$ — its graph is a parabola.", example: "$x^2 - 5x + 6 = 0$ is quadratic; it factors as $(x-2)(x-3)=0$." },
      { term: "Root (Solution)", definition: "A value of the variable that makes the equation true — where the corresponding graph crosses the x-axis.", example: "$x=2$ and $x=3$ are the roots of $x^2-5x+6=0$." },
      { term: "Discriminant", definition: "The expression $b^2-4ac$ inside a quadratic's square root — its sign tells you how many real solutions exist before you even solve.", example: "For $x^2-5x+6=0$: $D=25-24=1>0$, so there are two distinct real roots." },
      { term: "Coefficient", definition: "The numeric multiplier in front of a variable term.", example: "In $3x^2 - 5x + 6$, the coefficients are $3$, $-5$, and the constant term $6$." },
      { term: "Vertex", definition: "The highest or lowest point of a parabola — where a quadratic function reaches its maximum or minimum value.", example: "$f(x)=x^2-4x+3$ has its vertex at $x=2$ (found via $-b/2a$), where $f(2)=-1$." },
    ],
  },
  {
    key: "matrix",
    navLabel: "Matrices",
    title: "Types of Matrices",
    description: "Common matrix types and terminology, used in the Matrix calculator.",
    definitions: [
      { term: "Matrix", definition: "A rectangular grid of numbers arranged in rows and columns, used to represent linear systems, transformations, and data.", example: "$\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}$ is a 2×2 matrix, and $\\begin{bmatrix}1&2&3\\\\4&5&6\\\\7&8&9\\end{bmatrix}$ is a 3×3 matrix." },
      { term: "Row Matrix", definition: "A matrix with exactly one row.", example: "$\\begin{bmatrix}1&2&3\\end{bmatrix}$ is a 1×3 row matrix." },
      { term: "Column Matrix", definition: "A matrix with exactly one column.", example: "$\\begin{bmatrix}1\\\\2\\\\3\\end{bmatrix}$ is a 3×1 column matrix." },
      { term: "Square Matrix", definition: "A matrix with the same number of rows and columns.", example: "$\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}$ is a 2×2 square matrix, and $\\begin{bmatrix}1&0&2\\\\0&3&1\\\\4&1&5\\end{bmatrix}$ is a 3×3 square matrix." },
      { term: "Zero (Null) Matrix", definition: "A matrix in which every entry is $0$.", example: "$\\begin{bmatrix}0&0\\\\0&0\\end{bmatrix}$ is a 2×2 zero matrix, and $\\begin{bmatrix}0&0&0\\\\0&0&0\\\\0&0&0\\end{bmatrix}$ is a 3×3 zero matrix." },
      { term: "Identity Matrix", definition: "A square matrix with $1$s on the main diagonal and $0$s everywhere else — the matrix equivalent of the number $1$ ($AI=A$).", example: "$I_2 = \\begin{bmatrix}1&0\\\\0&1\\end{bmatrix}$ and $I_3 = \\begin{bmatrix}1&0&0\\\\0&1&0\\\\0&0&1\\end{bmatrix}$ are the 2×2 and 3×3 identity matrices." },
      { term: "Diagonal Matrix", definition: "A square matrix where every entry OFF the main diagonal is $0$ (diagonal entries can be anything).", example: "$\\begin{bmatrix}5&0\\\\0&-2\\end{bmatrix}$ is a 2×2 diagonal matrix, and $\\begin{bmatrix}3&0&0\\\\0&-1&0\\\\0&0&7\\end{bmatrix}$ is a 3×3 diagonal matrix." },
      { term: "Scalar Matrix", definition: "A diagonal matrix where every diagonal entry is the SAME number.", example: "$\\begin{bmatrix}4&0\\\\0&4\\end{bmatrix}$ is a 2×2 scalar matrix, and $\\begin{bmatrix}2&0&0\\\\0&2&0\\\\0&0&2\\end{bmatrix}$ is a 3×3 scalar matrix." },
      { term: "Symmetric Matrix", definition: "A square matrix that equals its own transpose ($A = A^T$) — it's a mirror image of itself across the main diagonal (entry $(i,j)$ always equals entry $(j,i)$).", example: "$\\begin{bmatrix}1&2\\\\2&5\\end{bmatrix}$ is symmetric, and so is $\\begin{bmatrix}1&2&3\\\\2&4&5\\\\3&5&6\\end{bmatrix}$ — every entry above the diagonal matches its mirror below it." },
      { term: "Skew-Symmetric Matrix", definition: "A square matrix that equals the NEGATIVE of its own transpose ($A^T = -A$) — every diagonal entry must be $0$, and entry $(j,i)$ is always the negative of entry $(i,j)$.", example: "$\\begin{bmatrix}0&2\\\\-2&0\\end{bmatrix}$ is skew-symmetric, and so is $\\begin{bmatrix}0&2&-1\\\\-2&0&3\\\\1&-3&0\\end{bmatrix}$." },
      { term: "Upper Triangular Matrix", definition: "A square matrix where every entry BELOW the main diagonal is $0$.", example: "$\\begin{bmatrix}1&2\\\\0&4\\end{bmatrix}$ is upper triangular, and so is $\\begin{bmatrix}1&2&3\\\\0&4&5\\\\0&0&6\\end{bmatrix}$." },
      { term: "Lower Triangular Matrix", definition: "A square matrix where every entry ABOVE the main diagonal is $0$.", example: "$\\begin{bmatrix}1&0\\\\3&4\\end{bmatrix}$ is lower triangular, and so is $\\begin{bmatrix}1&0&0\\\\2&3&0\\\\4&5&6\\end{bmatrix}$." },
      { term: "Singular Matrix", definition: "A square matrix whose determinant is $0$ — it has no inverse.", example: "$\\begin{bmatrix}1&2\\\\2&4\\end{bmatrix}$ is singular, since $\\det = 1(4)-2(2) = 0$. $\\begin{bmatrix}1&2&3\\\\2&4&6\\\\1&0&1\\end{bmatrix}$ is also singular, since its 2nd row is exactly twice its 1st row." },
      { term: "Non-Singular Matrix", definition: "A square matrix whose determinant is NOT $0$ — it has a valid inverse.", example: "$\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}$ is non-singular, since $\\det = -2 \\neq 0$." },
      { term: "Transpose", definition: "The matrix formed by flipping a matrix over its main diagonal — rows become columns and columns become rows.", example: "The transpose of $\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}$ is $\\begin{bmatrix}1&3\\\\2&4\\end{bmatrix}$." },
      { term: "Elementary Matrix", definition: "An identity matrix with exactly ONE elementary row operation applied to it (a single row swap, a single row scaled, or one row added to another) — multiplying by an elementary matrix has the same effect as performing that row operation directly.", example: "$\\begin{bmatrix}1&0\\\\0&2\\end{bmatrix}$ is the elementary matrix that scales row 2 by $2$; $\\begin{bmatrix}0&1\\\\1&0\\end{bmatrix}$ is the elementary matrix that swaps rows 1 and 2." },
      { term: "Row Echelon Form (REF)", definition: "A matrix shape reached by Gaussian elimination: each row's first non-zero entry (its \"pivot\") sits further right than the pivot in the row above, and all entries below every pivot are $0$.", example: "$\\begin{bmatrix}1&2&3\\\\0&1&4\\\\0&0&1\\end{bmatrix}$ is in row echelon form — pivots are the 1's, stepping right down the diagonal." },
      { term: "Reduced Row Echelon Form (RREF)", definition: "Row echelon form taken one step further: every pivot equals $1$, and every entry ABOVE each pivot is also $0$ (not just below it) — this is the most simplified form a matrix can be row-reduced to.", example: "$\\begin{bmatrix}1&0&0\\\\0&1&0\\\\0&0&1\\end{bmatrix}$ is in reduced row echelon form (here it's simply the identity matrix)." },
      { term: "Rank", definition: "The number of non-zero rows remaining once a matrix is reduced to row echelon form — informally, how many of its rows carry genuinely independent information.", example: "$\\begin{bmatrix}1&2\\\\2&4\\end{bmatrix}$ has rank $1$ (row 2 is just row 1 doubled, so it reduces away to a zero row)." },
    ],
  },
  {
    key: "complex",
    navLabel: "Complex Numbers",
    title: "Complex Number Definitions",
    description: "Core vocabulary for complex numbers, used in the Complex Number calculator.",
    definitions: [
      { term: "Complex Number", definition: "A number of the form $a+bi$, combining a real part $a$ and an imaginary part $b$ (multiplied by the imaginary unit $i$).", example: "$3+4i$ is a complex number with real part $3$ and imaginary part $4$." },
      { term: "Imaginary Unit (i)", definition: "The number defined so that $i^2=-1$ — it lets us take square roots of negative numbers.", example: "$\\sqrt{-9} = 3i$, since $(3i)^2 = 9i^2 = -9$." },
      { term: "Real Part", definition: "The non-imaginary component of a complex number $a+bi$ — just $a$.", example: "The real part of $5-2i$ is $5$." },
      { term: "Imaginary Part", definition: "The coefficient of $i$ in a complex number $a+bi$ — just $b$ (not $bi$).", example: "The imaginary part of $5-2i$ is $-2$." },
      { term: "Complex Conjugate", definition: "The complex number formed by flipping the sign of the imaginary part — $a+bi$ becomes $a-bi$.", example: "The conjugate of $3+4i$ is $3-4i$." },
      { term: "Modulus", definition: "The distance from the origin to a complex number on the complex plane — its \"size\", computed as $\\sqrt{a^2+b^2}$.", example: "$|3+4i| = \\sqrt{9+16} = 5$." },
      { term: "Argument", definition: "The angle a complex number makes with the positive real axis on the complex plane.", example: "The argument of $1+i$ is $45°$ (or $\\pi/4$ radians)." },
      { term: "Polar Form", definition: "Writing a complex number as $r(\\cos\\theta+i\\sin\\theta)$ using its modulus $r$ and argument $\\theta$, instead of $a+bi$.", example: "$1+i$ in polar form is $\\sqrt2(\\cos45°+i\\sin45°)$." },
    ],
  },
  {
    key: "trig",
    navLabel: "Trigonometry",
    title: "Trigonometry Definitions",
    description: "Core vocabulary for trigonometry, used in the Trigonometry calculator.",
    definitions: [
      { term: "Angle", definition: "A measure of rotation between two rays sharing an endpoint, measured in degrees or radians.", example: "A right angle measures $90°$, equivalent to $\\pi/2$ radians." },
      { term: "Radian", definition: "The angle subtended at the center of a circle by an arc equal in length to the circle's radius — the natural unit of angle in calculus.", example: "A full circle is $2\\pi$ radians, equal to $360°$." },
      { term: "Sine, Cosine, Tangent", definition: "The three basic trig ratios of a right triangle's angle: sine = opposite/hypotenuse, cosine = adjacent/hypotenuse, tangent = opposite/adjacent.", example: "In a 3-4-5 right triangle, $\\sin\\theta = 3/5$ for the angle opposite the side of length 3." },
      { term: "Reciprocal Functions", definition: "Secant, cosecant, and cotangent — the reciprocals of cosine, sine, and tangent respectively.", example: "$\\sec\\theta = \\frac{1}{\\cos\\theta}$." },
      { term: "Unit Circle", definition: "A circle of radius $1$ centered at the origin, used to define sine and cosine for any angle (not just triangle angles between $0°$ and $90°$).", example: "On the unit circle, the point at angle $90°$ is $(0,1)$, so $\\sin90°=1$ and $\\cos90°=0$." },
      { term: "Trigonometric Identity", definition: "An equation involving trig functions that's true for every value of the variable (not just specific solutions).", example: "$\\sin^2\\theta+\\cos^2\\theta=1$ holds for every angle $\\theta$." },
      { term: "Periodic Function", definition: "A function that repeats its values in a regular pattern over a fixed interval (its period).", example: "$\\sin\\theta$ has period $360°$ (or $2\\pi$): $\\sin(\\theta+360°)=\\sin\\theta$." },
      { term: "Reference Angle", definition: "The acute angle between the terminal side of an angle and the x-axis — used to find trig values for angles outside $0°$–$90°$.", example: "The reference angle for $150°$ is $30°$." },
    ],
  },
  {
    key: "shapes",
    navLabel: "Shapes",
    title: "Geometry Definitions",
    description: "Core vocabulary for shapes and geometry, used in the Shapes calculator.",
    definitions: [
      { term: "Perimeter", definition: "The total distance around the outside of a two-dimensional shape.", example: "A rectangle with sides 4 and 6 has perimeter $2(4+6)=20$." },
      { term: "Area", definition: "The amount of two-dimensional space enclosed within a shape's boundary.", example: "A rectangle with sides 4 and 6 has area $4\\times6=24$." },
      { term: "Polygon", definition: "A closed two-dimensional shape made of straight line segments.", example: "Triangles, rectangles, and pentagons are all polygons; circles are not." },
      { term: "Regular Polygon", definition: "A polygon where all sides are equal in length and all interior angles are equal.", example: "A square is a regular quadrilateral; an equilateral triangle is a regular triangle." },
      { term: "Radius", definition: "The distance from a circle's center to any point on the circle.", example: "A circle with diameter 10 has radius 5." },
      { term: "Diameter", definition: "The distance across a circle through its center — exactly twice the radius.", example: "A circle with radius 5 has diameter 10." },
      { term: "Chord", definition: "A line segment connecting two points on a circle (a diameter is the longest possible chord).", example: "Any straight line drawn between two points on a circle's edge is a chord." },
      { term: "Arc", definition: "A portion of a circle's circumference between two points on the circle.", example: "A semicircle's boundary curve is an arc spanning $180°$." },
      { term: "Sector", definition: "A \"pie-slice\" region of a circle bounded by two radii and the arc between them.", example: "A quarter of a circle (a $90°$ slice) is a sector." },
      { term: "Congruent", definition: "Two shapes are congruent if they have exactly the same size and shape (one can be moved/rotated/flipped onto the other exactly).", example: "Two circles with the same radius are always congruent." },
      { term: "Similar", definition: "Two shapes are similar if they have the same shape but possibly different sizes — corresponding angles equal, corresponding sides proportional.", example: "Any two squares are similar, regardless of their side lengths." },
    ],
  },
  {
    key: "numtheory",
    navLabel: "Number Theory",
    title: "Number Theory Definitions",
    description: "Core vocabulary for number theory, used in the Number Theory calculator.",
    definitions: [
      { term: "Prime Number", definition: "A whole number greater than 1 with exactly two divisors: 1 and itself.", example: "$7$ is prime — only $1$ and $7$ divide it evenly." },
      { term: "Composite Number", definition: "A whole number greater than 1 with more than two divisors (i.e., not prime).", example: "$12$ is composite — divisible by $1,2,3,4,6,12$." },
      { term: "Factor (Divisor)", definition: "A whole number that divides another number exactly, with no remainder.", example: "The factors of $12$ are $1,2,3,4,6,12$." },
      { term: "Multiple", definition: "The product of a number and any whole number — what you get by \"multiplying it up\".", example: "The first few multiples of $4$ are $4, 8, 12, 16, \\dots$" },
      { term: "Greatest Common Divisor (GCD)", definition: "The largest whole number that divides two (or more) numbers exactly.", example: "$\\gcd(12, 18) = 6$." },
      { term: "Least Common Multiple (LCM)", definition: "The smallest whole number that is a multiple of two (or more) numbers.", example: "$\\text{lcm}(4, 6) = 12$." },
      { term: "Coprime Numbers", definition: "Two numbers whose greatest common divisor is $1$ — they share no common factors other than 1.", example: "$8$ and $9$ are coprime, even though neither is prime." },
      { term: "Prime Factorization", definition: "Writing a number as a product of prime numbers.", example: "$60 = 2^2\\times 3\\times 5$." },
    ],
  },
  {
    key: "numsystems",
    navLabel: "Number Systems",
    title: "Number System Definitions",
    description: "Core vocabulary for number systems and bases, used in the Number Systems calculator.",
    definitions: [
      { term: "Number System (Base/Radix)", definition: "A system for writing numbers using a fixed set of digits, where each digit's position represents a power of the \"base\".", example: "Decimal (base 10) uses digits 0-9; binary (base 2) uses only 0 and 1." },
      { term: "Binary (Base 2)", definition: "A number system using only the digits 0 and 1 — the native language of computer hardware.", example: "$1011_2 = 8+0+2+1 = 11_{10}$." },
      { term: "Octal (Base 8)", definition: "A number system using digits 0-7.", example: "$17_8 = 1\\times8+7 = 15_{10}$." },
      { term: "Decimal (Base 10)", definition: "The everyday number system using digits 0-9 — based on 10 fingers.", example: "$253_{10} = 2\\times100+5\\times10+3$." },
      { term: "Hexadecimal (Base 16)", definition: "A number system using digits 0-9 plus letters A-F (for 10-15) — commonly used to represent computer memory addresses and colors compactly.", example: "$2F_{16} = 2\\times16+15 = 47_{10}$." },
      { term: "Place Value", definition: "The value a digit represents based on its position in a number, determined by powers of the base.", example: "In $253_{10}$, the '5' is in the tens place, worth $5\\times10^1=50$." },
      { term: "Bit", definition: "A single binary digit (0 or 1) — the smallest unit of digital information.", example: "The binary number $1011$ has 4 bits." },
    ],
  },
];
