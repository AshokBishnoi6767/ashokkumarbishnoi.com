"use strict";

/**
 * Trinity — Mathematical Engine v0.1
 *
 * Sits alongside the language/knowledge chain rather than above it —
 * Reasoning and Verification (both already built) call into this
 * module for arithmetic/algebraic/statistical claims rather than each
 * reimplementing math; this module has no dependency on them.
 *
 * Deterministic and dependency-light. Every exported function returns
 * the SAME envelope shape:
 *
 *   { operator, input, output, valid, error, precision, provenance }
 *
 * `output` is null whenever `valid` is false — an invalid operation
 * (division by zero, a non-square matrix asked for a determinant, a
 * dimension mismatch, an empty dataset) is reported as INVALID, never
 * silently coerced into NaN/Infinity/a guessed value. `precision` is
 * always the honest, fixed fact "float64" for anything that touched a
 * floating-point operation — never a fabricated significant-digit
 * claim about the underlying real-world quantity.
 *
 * This module does not decide what counts as "the loss function" for
 * gradient descent, what data a statistic describes, or what a
 * probability distribution models — every one of those is supplied
 * by the CALLER (see runGradientDescent's gradientFn parameter).
 * Learning as a broader process (sandboxing, validation, promotion)
 * is out of scope here — this file is the mathematical substrate a
 * later Learning Engine would call, not the Learning Engine itself.
 */

function result(operator, input, computeFn) {
  try {
    const output = computeFn();
    if (output && output.__invalid__) {
      return { operator, input, output: null, valid: false, error: output.error, precision: null, provenance: provenance() };
    }
    return { operator, input, output, valid: true, error: null, precision: "float64", provenance: provenance() };
  } catch (err) {
    return { operator, input, output: null, valid: false, error: err.message, precision: null, provenance: provenance() };
  }
}

function invalid(error) {
  return { __invalid__: true, error };
}

function provenance() {
  return { realm: "MATHEMATICAL_ENGINE", computed_at: new Date().toISOString() };
}

function isFiniteNumber(x) {
  return typeof x === "number" && Number.isFinite(x);
}

// ---------------------------------------------------------------- Arithmetic

function add(a, b) {
  return result("ADD", { a, b }, () => a + b);
}
function subtract(a, b) {
  return result("SUBTRACT", { a, b }, () => a - b);
}
function multiply(a, b) {
  return result("MULTIPLY", { a, b }, () => a * b);
}
function divide(a, b) {
  return result("DIVIDE", { a, b }, () => (b === 0 ? invalid("Division by zero.") : a / b));
}
function power(base, exponent) {
  return result("POWER", { base, exponent }, () => Math.pow(base, exponent));
}
function sqrt(x) {
  return result("SQRT", { x }, () => (x < 0 ? invalid("No real square root of a negative number.") : Math.sqrt(x)));
}

// ------------------------------------------------------------------ Algebra

// Solves ax + b = 0.
function solveLinearEquation(a, b) {
  return result("SOLVE_LINEAR_EQUATION", { a, b }, () => {
    if (a === 0) {
      return b === 0 ? { case: "INFINITE_SOLUTIONS", x: null } : { case: "NO_SOLUTION", x: null };
    }
    return { case: "UNIQUE", x: -b / a };
  });
}

// Solves ax^2 + bx + c = 0 over the reals. Never invents complex roots.
function solveQuadratic(a, b, c) {
  return result("SOLVE_QUADRATIC", { a, b, c }, () => {
    if (a === 0) return invalid("Not a quadratic equation (a = 0); use solveLinearEquation.");
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return { case: "NO_REAL_ROOTS", roots: [], discriminant };
    if (discriminant === 0) return { case: "ONE_REAL_ROOT", roots: [-b / (2 * a)], discriminant };
    const sqrtD = Math.sqrt(discriminant);
    return { case: "TWO_REAL_ROOTS", roots: [(-b + sqrtD) / (2 * a), (-b - sqrtD) / (2 * a)], discriminant };
  });
}

const INEQUALITY_OPS = new Set([">", ">=", "<", "<="]);
const FLIP = { ">": "<", ">=": "<=", "<": ">", "<=": ">=" };

// Solves ax + b OP 0 for one of '>','>=','<','<='.
function solveLinearInequality(a, b, op) {
  return result("SOLVE_LINEAR_INEQUALITY", { a, b, op }, () => {
    if (!INEQUALITY_OPS.has(op)) return invalid(`Unsupported inequality operator: ${op}`);
    if (a === 0) {
      const holds = { ">": b > 0, ">=": b >= 0, "<": b < 0, "<=": b <= 0 }[op];
      return { case: holds ? "ALL_REALS" : "NO_SOLUTION" };
    }
    const boundary = -b / a;
    const effectiveOp = a < 0 ? FLIP[op] : op;
    return { case: "HALF_LINE", x_operator: effectiveOp, boundary };
  });
}

// ------------------------------------------------------------------ Vectors

function requireSameDimension(u, v) {
  if (!Array.isArray(u) || !Array.isArray(v)) throw new TypeError("Vectors must be arrays.");
  if (u.length !== v.length) return invalid(`Dimension mismatch: ${u.length} vs ${v.length}.`);
  return null;
}

function vectorAdd(u, v) {
  return result("VECTOR_ADD", { u, v }, () => requireSameDimension(u, v) || u.map((x, i) => x + v[i]));
}
function vectorSubtract(u, v) {
  return result("VECTOR_SUBTRACT", { u, v }, () => requireSameDimension(u, v) || u.map((x, i) => x - v[i]));
}
function dotProduct(u, v) {
  return result("DOT_PRODUCT", { u, v }, () => requireSameDimension(u, v) || u.reduce((sum, x, i) => sum + x * v[i], 0));
}
function scale(v, k) {
  return result("VECTOR_SCALE", { v, k }, () => v.map((x) => x * k));
}
function magnitude(v) {
  return result("VECTOR_MAGNITUDE", { v }, () => Math.sqrt(v.reduce((sum, x) => sum + x * x, 0)));
}
function normalize(v) {
  return result("VECTOR_NORMALIZE", { v }, () => {
    const mag = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
    if (mag === 0) return invalid("Cannot normalize the zero vector.");
    return v.map((x) => x / mag);
  });
}

// ------------------------------------------------------------------ Matrices

function shapeOf(A) {
  if (!Array.isArray(A) || A.length === 0 || !Array.isArray(A[0])) throw new TypeError("A matrix must be a non-empty array of arrays.");
  const cols = A[0].length;
  if (!A.every((row) => row.length === cols)) throw new TypeError("All matrix rows must have the same length.");
  return { rows: A.length, cols };
}

function matrixAdd(A, B) {
  return result("MATRIX_ADD", { A, B }, () => {
    const sa = shapeOf(A);
    const sb = shapeOf(B);
    if (sa.rows !== sb.rows || sa.cols !== sb.cols) return invalid(`Dimension mismatch: ${sa.rows}x${sa.cols} vs ${sb.rows}x${sb.cols}.`);
    return A.map((row, i) => row.map((x, j) => x + B[i][j]));
  });
}

function matrixMultiply(A, B) {
  return result("MATRIX_MULTIPLY", { A, B }, () => {
    const sa = shapeOf(A);
    const sb = shapeOf(B);
    if (sa.cols !== sb.rows) return invalid(`Inner dimension mismatch: ${sa.rows}x${sa.cols} * ${sb.rows}x${sb.cols}.`);
    const out = [];
    for (let i = 0; i < sa.rows; i += 1) {
      const row = [];
      for (let j = 0; j < sb.cols; j += 1) {
        let sum = 0;
        for (let k = 0; k < sa.cols; k += 1) sum += A[i][k] * B[k][j];
        row.push(sum);
      }
      out.push(row);
    }
    return out;
  });
}

function transpose(A) {
  return result("MATRIX_TRANSPOSE", { A }, () => {
    const { rows, cols } = shapeOf(A);
    const out = [];
    for (let j = 0; j < cols; j += 1) {
      const row = [];
      for (let i = 0; i < rows; i += 1) row.push(A[i][j]);
      out.push(row);
    }
    return out;
  });
}

function identity(n) {
  return result("IDENTITY_MATRIX", { n }, () => {
    if (!Number.isInteger(n) || n <= 0) return invalid("n must be a positive integer.");
    return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  });
}

function determinantOf(A) {
  const n = A.length;
  if (n === 1) return A[0][0];
  if (n === 2) return A[0][0] * A[1][1] - A[0][1] * A[1][0];
  let det = 0;
  for (let col = 0; col < n; col += 1) {
    const minor = A.slice(1).map((row) => row.filter((_, j) => j !== col));
    det += (col % 2 === 0 ? 1 : -1) * A[0][col] * determinantOf(minor);
  }
  return det;
}

// Recursive cofactor expansion — correct for any square matrix, but
// O(n!); only practical for small n. That limitation is stated, not
// hidden, and matches this milestone's explicit scope (no optimized
// LU-decomposition solver here).
function determinant(A) {
  return result("DETERMINANT", { A }, () => {
    const { rows, cols } = shapeOf(A);
    if (rows !== cols) return invalid(`Determinant requires a square matrix; got ${rows}x${cols}.`);
    return determinantOf(A);
  });
}

function matrixVectorMultiply(A, v) {
  return result("MATRIX_VECTOR_MULTIPLY", { A, v }, () => {
    const { rows, cols } = shapeOf(A);
    if (cols !== v.length) return invalid(`Dimension mismatch: ${rows}x${cols} matrix * length-${v.length} vector.`);
    return A.map((row) => row.reduce((sum, x, j) => sum + x * v[j], 0));
  });
}

// Solves Ax = b via Cramer's rule. Practical only for small square A
// (same O(n!) determinant limitation as above) — explicitly not a
// general-purpose numerical solver.
function solveLinearSystem(A, b) {
  return result("SOLVE_LINEAR_SYSTEM", { A, b }, () => {
    const { rows, cols } = shapeOf(A);
    if (rows !== cols) return invalid(`Cramer's rule requires a square coefficient matrix; got ${rows}x${cols}.`);
    if (b.length !== rows) return invalid(`b must have length ${rows}; got ${b.length}.`);
    const detA = determinantOf(A);
    if (detA === 0) return invalid("Coefficient matrix is singular (determinant = 0); no unique solution.");
    const x = [];
    for (let col = 0; col < cols; col += 1) {
      const Ai = A.map((row, i) => row.map((val, j) => (j === col ? b[i] : val)));
      x.push(determinantOf(Ai) / detA);
    }
    return x;
  });
}

// --------------------------------------------------------------- Statistics

function requireNonEmpty(values) {
  if (!Array.isArray(values) || values.length === 0) return invalid("Requires a non-empty array of numbers.");
  return null;
}

function mean(values) {
  return result("MEAN", { values }, () => requireNonEmpty(values) || values.reduce((s, x) => s + x, 0) / values.length);
}

function variance(values, { population = false } = {}) {
  return result("VARIANCE", { values, population }, () => {
    const guard = requireNonEmpty(values);
    if (guard) return guard;
    if (!population && values.length < 2) return invalid("Sample variance requires at least 2 values.");
    const m = values.reduce((s, x) => s + x, 0) / values.length;
    const sumSq = values.reduce((s, x) => s + (x - m) * (x - m), 0);
    return sumSq / (population ? values.length : values.length - 1);
  });
}

function standardDeviation(values, opts = {}) {
  const v = variance(values, opts);
  return result("STANDARD_DEVIATION", { values, ...opts }, () => (v.valid ? Math.sqrt(v.output) : invalid(v.error)));
}

function median(values) {
  return result("MEDIAN", { values }, () => {
    const guard = requireNonEmpty(values);
    if (guard) return guard;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  });
}

// --------------------------------------------------------------- Probability

// Bayes' rule: P(A|B) = P(B|A) * P(A) / P(B).
function bayesRule({ pBGivenA, pA, pB }) {
  return result("BAYES_RULE", { pBGivenA, pA, pB }, () => (pB === 0 ? invalid("P(B) = 0; conditional is undefined.") : (pBGivenA * pA) / pB));
}

function conditionalProbability({ pAAndB, pB }) {
  return result("CONDITIONAL_PROBABILITY", { pAAndB, pB }, () => (pB === 0 ? invalid("P(B) = 0; conditional is undefined.") : pAAndB / pB));
}

// outcomes: [{ value, probability }]. Never normalizes a probability
// distribution that doesn't already sum to 1 — that would be
// fabricating the missing mass rather than reporting the input as
// invalid.
function expectedValue(outcomes) {
  return result("EXPECTED_VALUE", { outcomes }, () => {
    const guard = requireNonEmpty(outcomes);
    if (guard) return guard;
    const totalP = outcomes.reduce((s, o) => s + o.probability, 0);
    if (Math.abs(totalP - 1) > 1e-9) return invalid(`Probabilities must sum to 1; got ${totalP}.`);
    return outcomes.reduce((s, o) => s + o.value * o.probability, 0);
  });
}

// ------------------------------------------------------------- Optimization

function requireMatchingShape(theta, gradient) {
  const thetaIsArray = Array.isArray(theta);
  const gradientIsArray = Array.isArray(gradient);
  if (thetaIsArray !== gradientIsArray) return invalid("theta and gradient must both be scalars or both be arrays.");
  if (thetaIsArray && theta.length !== gradient.length) return invalid(`theta/gradient length mismatch: ${theta.length} vs ${gradient.length}.`);
  return null;
}

// One step of theta_(t+1) = theta_t - eta * gradient. Works for a
// scalar theta or an array theta (elementwise). This module does not
// know or decide what loss the gradient came from — that is the
// caller's model, supplied as a plain number/array.
function gradientDescentStep({ theta, gradient, learningRate }) {
  return result("GRADIENT_DESCENT_STEP", { theta, gradient, learningRate }, () => {
    if (!isFiniteNumber(learningRate) || learningRate <= 0) return invalid("learningRate must be a positive finite number.");
    const guard = requireMatchingShape(theta, gradient);
    if (guard) return guard;
    if (Array.isArray(theta)) return theta.map((t, i) => t - learningRate * gradient[i]);
    return theta - learningRate * gradient;
  });
}

// Explicit, bounded iteration: runs gradientDescentStep repeatedly,
// using the CALLER's gradientFn (theta -> gradient) to know what is
// being minimized — this module never assumes a specific loss.
// Terminates on maxIterations or when the step size drops below
// tolerance (both explicit, both caller-overridable, never silent
// infinite iteration).
function runGradientDescent({ theta0, gradientFn, learningRate, maxIterations = 1000, tolerance = 1e-8 }) {
  return result("GRADIENT_DESCENT", { theta0, learningRate, maxIterations, tolerance }, () => {
    if (typeof gradientFn !== "function") return invalid("gradientFn must be a function mapping theta -> gradient.");
    if (!isFiniteNumber(learningRate) || learningRate <= 0) return invalid("learningRate must be a positive finite number.");

    let theta = theta0;
    const history = [theta0];
    let converged = false;
    let iterations = 0;

    for (; iterations < maxIterations; iterations += 1) {
      const gradient = gradientFn(theta);
      const step = gradientDescentStep({ theta, gradient, learningRate });
      if (!step.valid) return invalid(step.error);
      const delta = Array.isArray(theta)
        ? Math.sqrt(theta.reduce((s, t, i) => s + (t - step.output[i]) ** 2, 0))
        : Math.abs(theta - step.output);
      theta = step.output;
      history.push(theta);
      if (delta < tolerance) {
        converged = true;
        iterations += 1;
        break;
      }
    }

    return { theta, iterations, converged, history };
  });
}

module.exports = {
  add,
  subtract,
  multiply,
  divide,
  power,
  sqrt,
  solveLinearEquation,
  solveQuadratic,
  solveLinearInequality,
  vectorAdd,
  vectorSubtract,
  dotProduct,
  scale,
  magnitude,
  normalize,
  matrixAdd,
  matrixMultiply,
  transpose,
  identity,
  determinant,
  matrixVectorMultiply,
  solveLinearSystem,
  mean,
  variance,
  standardDeviation,
  median,
  bayesRule,
  conditionalProbability,
  expectedValue,
  gradientDescentStep,
  runGradientDescent,
};
