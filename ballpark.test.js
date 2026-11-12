import test from "node:test";
import assert from "node:assert/strict";
import { computeBallpark, rangeMarkup, sizeMarkups } from "./ballpark.js";

// Made-up numbers only. Blake's real prices live in Render env vars, never in this repo.
const fake = {
  roundTo: 10,
  pruning: { bands: [{ key: "small", maxFt: 30, price: 100, cleanupPrice: 140, label: "Small" }, { maxFt: 999, callForBallpark: true, label: "Very large" }] },
  stumps: { bands: [{ maxIn: 999, price: 40 }] }
};
const m = { sizes: { small: 0.2, medium: 0.3, large: 0.3 }, other: 0.1 };

test("trim: each option starts at Blake's price, top is price plus the size markup", () => {
  const r = computeBallpark({ jobTypes: ["trim"], items: [{ kind: "tree", heightFt: 20 }] }, fake, m);
  assert.deepEqual(r.options.map((o) => [o.low, o.high]), [[100, 120], [140, 170]]);
});

test("trim plus stumps: no range at all, callback only", () => {
  const r = computeBallpark({ jobTypes: ["trim", "stump"], items: [{ kind: "tree", heightFt: 20 }, { kind: "stump", diameterIn: 10 }] }, fake, m);
  assert.equal(r.range, null);
  assert.equal(r.options, undefined);
  assert.equal(computeBallpark({ jobTypes: ["stump"], items: [{ kind: "stump", diameterIn: 10 }] }, fake, m).range, null);
});

test("removal, stumps, storm, clearing and dirt work never get a range, even with trimming", () => {
  for (const extra of ["removal", "stump", "emergency", "clearing", "grading", "pad", "drainage", "haul", "dirt", "other"]) {
    const r = computeBallpark({ jobTypes: ["trim", extra], items: [{ kind: "tree", heightFt: 20, size: "small" }] }, fake, m);
    assert.equal(r.range, null, extra);
    assert.equal(r.options, undefined, extra);
    assert.equal(r.callback, true, extra);
  }
});

test("trim-only with stump count gets no range", () => {
  const r = computeBallpark({ jobTypes: ["trim"], items: [{ kind: "tree", heightFt: 20 }, { kind: "stump", diameterIn: 10 }] }, fake, m);
  assert.equal(r.range, null);
});

test("no job type picked gets no range", () => {
  assert.equal(computeBallpark({ jobTypes: [], items: [{ kind: "tree", heightFt: 20 }] }, fake, m).range, null);
});

test("size pick chooses the band by key and labels the line with the size", () => {
  const r = computeBallpark({ jobTypes: ["trim"], items: [{ kind: "tree", heightFt: 80, size: "small" }] }, fake, m);
  assert.deepEqual(r.options.map((o) => [o.low, o.high]), [[100, 120], [140, 170]]);
  assert.match(r.lines[0].label, /Small/);
  assert.doesNotMatch(r.lines[0].label, /ft/);
});

test("removal gets no range and a callback", () => {
  const r = computeBallpark({ jobTypes: ["removal"], items: [{ kind: "tree", heightFt: 20 }] }, fake, m);
  assert.equal(r.range, null);
  assert.equal(r.reason, "removal");
});

test("no pricing configured gives no range", () => {
  assert.equal(computeBallpark({ jobTypes: ["trim"], items: [{ kind: "tree", heightFt: 20 }] }, null, m).range, null);
});

test("markup settings", () => {
  assert.deepEqual(sizeMarkups({ RANGE_MARKUP_SMALL: "0.3" }), { small: 0.3, medium: 0.35, large: 0.35 });
  assert.equal(rangeMarkup({}), 0.15);
});

test("callback lines only say removal when removal was picked", () => {
  const r = computeBallpark({ jobTypes: ["stump"], items: [{ kind: "tree", heightFt: 20 }, { kind: "stump", diameterIn: 10 }] }, fake, m);
  assert.ok(r.lines.every((l) => !/removal/i.test(l.label)));
  const t = computeBallpark({ jobTypes: ["trim", "clearing"], items: [{ kind: "tree", heightFt: 20 }] }, fake, m);
  assert.equal(t.lines[0].label, "Trim tree 1");
});
