"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const math = require("../math/engine");

test("Math engine: 2 + 2 = 4", () => {
  const r = math.add(2, 2);
  assert.equal(r.valid, true);
  assert.equal(r.output, 4);
  assert.equal(r.operator, "ADD");
});

test("Math engine: 12 x 17 = 204", () => {
  const r = math.multiply(12, 17);
  assert.equal(r.output, 204);
});

test("Math engine: division by zero is INVALID, never Infinity/NaN silently returned", () => {
  const r = math.divide(5, 0);
  assert.equal(r.valid, false);
  assert.equal(r.output, null);
  assert.match(r.error, /zero/i);
});

test("Math engine: sqrt of a negative number is INVALID, never a fabricated complex result", () => {
  const r = math.sqrt(-4);
  assert.equal(r.valid, false);
});

test("Math engine: solveLinearEquation — 2x + 4 = 0 -> x = -2", () => {
  const r = math.solveLinearEquation(2, 4);
  assert.equal(r.output.case, "UNIQUE");
  assert.equal(r.output.x, -2);
});

test("Math engine: solveLinearEquation — 0x + 5 = 0 has NO_SOLUTION, 0x + 0 = 0 has INFINITE_SOLUTIONS", () => {
  assert.equal(math.solveLinearEquation(0, 5).output.case, "NO_SOLUTION");
  assert.equal(math.solveLinearEquation(0, 0).output.case, "INFINITE_SOLUTIONS");
});

test("Math engine: solveQuadratic — x^2 - 5x + 6 = 0 -> roots {3, 2}", () => {
  const r = math.solveQuadratic(1, -5, 6);
  assert.equal(r.output.case, "TWO_REAL_ROOTS");
  assert.deepEqual(r.output.roots.sort((a, b) => a - b), [2, 3]);
});

test("Math engine: solveQuadratic with negative discriminant reports NO_REAL_ROOTS, never invents complex numbers", () => {
  const r = math.solveQuadratic(1, 0, 1); // x^2 + 1 = 0
  assert.equal(r.output.case, "NO_REAL_ROOTS");
  assert.deepEqual(r.output.roots, []);
});

test("Math engine: solveLinearInequality — 3x - 6 > 0 -> x > 2", () => {
  const r = math.solveLinearInequality(3, -6, ">");
  assert.equal(r.output.x_operator, ">");
  assert.equal(r.output.boundary, 2);
});

test("Math engine: solveLinearInequality flips direction when dividing by a negative coefficient", () => {
  // -2x + 4 > 0  =>  x < 2
  const r = math.solveLinearInequality(-2, 4, ">");
  assert.equal(r.output.x_operator, "<");
  assert.equal(r.output.boundary, 2);
});

test("Math engine: vector operations — add, dot product, magnitude", () => {
  assert.deepEqual(math.vectorAdd([1, 2, 3], [4, 5, 6]).output, [5, 7, 9]);
  assert.equal(math.dotProduct([1, 2, 3], [4, 5, 6]).output, 32);
  assert.equal(math.magnitude([3, 4]).output, 5);
});

test("Math engine: vector dimension mismatch is INVALID, never silently truncated/padded", () => {
  const r = math.vectorAdd([1, 2], [1, 2, 3]);
  assert.equal(r.valid, false);
});

test("Math engine: cannot normalize the zero vector", () => {
  const r = math.normalize([0, 0, 0]);
  assert.equal(r.valid, false);
});

test("Math engine: matrix multiply — 2x2 identity times any matrix returns that matrix", () => {
  const I = math.identity(2).output;
  const A = [[1, 2], [3, 4]];
  assert.deepEqual(math.matrixMultiply(I, A).output, A);
});

test("Math engine: matrix multiply dimension mismatch is INVALID", () => {
  const r = math.matrixMultiply([[1, 2]], [[1, 2]]);
  assert.equal(r.valid, false);
});

test("Math engine: determinant of a 3x3 matrix, and rejects a non-square matrix", () => {
  const A = [[6, 1, 1], [4, -2, 5], [2, 8, 7]];
  assert.equal(math.determinant(A).output, -306);
  assert.equal(math.determinant([[1, 2, 3], [4, 5, 6]]).valid, false);
});

test("Math engine: solveLinearSystem — 2x + y = 5, x - y = 1 -> x=2, y=1", () => {
  const r = math.solveLinearSystem([[2, 1], [1, -1]], [5, 1]);
  assert.equal(r.valid, true);
  assert.ok(Math.abs(r.output[0] - 2) < 1e-9);
  assert.ok(Math.abs(r.output[1] - 1) < 1e-9);
});

test("Math engine: solveLinearSystem reports a singular matrix as INVALID, not a guessed answer", () => {
  const r = math.solveLinearSystem([[1, 2], [2, 4]], [1, 2]);
  assert.equal(r.valid, false);
  assert.match(r.error, /singular/i);
});

test("Math engine: statistics — mean, variance, median of a known dataset", () => {
  const values = [2, 4, 4, 4, 5, 5, 7, 9];
  assert.equal(math.mean(values).output, 5);
  const v = math.variance(values, { population: true });
  assert.ok(Math.abs(v.output - 4) < 1e-9);
  assert.equal(math.median(values).output, 4.5);
});

test("Math engine: statistics on an empty dataset is INVALID, never NaN", () => {
  assert.equal(math.mean([]).valid, false);
  assert.equal(math.variance([1]).valid, false); // sample variance needs >= 2 points
});

test("Math engine: Bayes' rule computes a real posterior from explicit inputs, never a fabricated 0.72", () => {
  // P(disease|positive) with P(positive|disease)=0.99, P(disease)=0.01, P(positive)=0.0198
  const r = math.bayesRule({ pBGivenA: 0.99, pA: 0.01, pB: 0.0198 });
  assert.ok(Math.abs(r.output - 0.5) < 1e-6);
});

test("Math engine: expectedValue rejects a distribution that does not sum to 1, never silently normalizes it", () => {
  const r = math.expectedValue([{ value: 1, probability: 0.3 }, { value: 2, probability: 0.3 }]);
  assert.equal(r.valid, false);
});

test("Math engine: expectedValue of a fair coin (heads=1, tails=0) is 0.5", () => {
  const r = math.expectedValue([{ value: 1, probability: 0.5 }, { value: 0, probability: 0.5 }]);
  assert.equal(r.output, 0.5);
});

test("Math engine: gradientDescentStep computes theta - eta*gradient for a scalar and a vector", () => {
  assert.equal(math.gradientDescentStep({ theta: 10, gradient: 4, learningRate: 0.5 }).output, 8);
  assert.deepEqual(math.gradientDescentStep({ theta: [10, 20], gradient: [4, 2], learningRate: 0.5 }).output, [8, 19]);
});

test("Math engine: runGradientDescent converges to the minimum of (x-3)^2, gradient supplied by the caller", () => {
  const r = math.runGradientDescent({
    theta0: 0,
    gradientFn: (x) => 2 * (x - 3),
    learningRate: 0.1,
    maxIterations: 500,
    tolerance: 1e-10,
  });
  assert.equal(r.valid, true);
  assert.equal(r.output.converged, true);
  assert.ok(Math.abs(r.output.theta - 3) < 1e-4);
});

test("Math engine: runGradientDescent respects maxIterations as an explicit bound, never runs unbounded", () => {
  const r = math.runGradientDescent({
    theta0: 0,
    gradientFn: (x) => 2 * (x - 1000000), // deliberately slow to converge at this learning rate
    learningRate: 1e-9,
    maxIterations: 3,
    tolerance: 1e-15,
  });
  assert.equal(r.output.iterations, 3);
  assert.equal(r.output.converged, false);
});

test("Math engine: every result carries provenance identifying this engine", () => {
  const r = math.add(1, 1);
  assert.equal(r.provenance.realm, "MATHEMATICAL_ENGINE");
  assert.ok(!Number.isNaN(Date.parse(r.provenance.computed_at)));
});
