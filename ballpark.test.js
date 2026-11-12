import test from "node:test";
import assert from "node:assert/strict";
import { computeBallpark, rangeMarkup } from "./ballpark.js";

// Made-up numbers only. Blake's real prices live in Render env vars, never in this repo.
const fake = {
  roundTo: 10,
  pruning: { bands: [{ maxFt: 30, price: 100, cleanupPrice: 140, label: "Small" }, { maxFt: 999, callForBallpark: true, label: "Very large" }] },
  stumps: { bands: [{ maxIn: 999, price: 40 }] }
};

test("trim: low is no-cleanup price, high is cleanup price plus markup", () => {
  const r = computeBallpark({ jobTypes: ["trim"], items: [{ kind: "tree", heightFt: 20 }] }, fake, 0.15);
  assert.deepEqual(r.range, { low: 100, high: 160 });
});

test("removal gets no range and a callback", () => {
  const r = computeBallpark({ jobTypes: ["removal"], items: [{ kind: "tree", heightFt: 20 }] }, fake, 0.15);
  assert.equal(r.range, null);
  assert.equal(r.reason, "removal");
});

test("no pricing configured gives no range", () => {
  const r = computeBallpark({ jobTypes: ["trim"], items: [{ kind: "tree", heightFt: 20 }] }, null, 0.15);
  assert.equal(r.range, null);
});

test("markup setting", () => {
  assert.equal(rangeMarkup({ RANGE_MARKUP: "0.25" }), 0.25);
  assert.equal(rangeMarkup({}), 0.15);
});
