/* Server-side ballpark ranges for the 3 B's quote form.
   No prices live in this repo. Blake's numbers come from the TREE_PRICING_JSON
   environment variable on Render, and the range width comes from RANGE_MARKUP
   (0.15 = 15%). The range is only returned after the contact form is sent.

   Rules (Shaun approved 11/11 10:13 PM CT):
   - Blake's tree prices are PRUNING / TRIMMING only.
   - Tree removal has no price yet, so removal jobs get no range and a callback quote.
   - Each option (no cleanup, with cleanup) gets its own range. It starts at Blake's
     price for that option. The top is his price plus the size's markup, rounded to the
     nearest roundTo (default $50). Markups are env settings: RANGE_MARKUP_SMALL (0.25),
     RANGE_MARKUP_MEDIUM (0.35), RANGE_MARKUP_LARGE (0.35).
   - Stump and tight-access add-ons go on top at Blake's price ("we'll confirm on the call").
   - Jobs with no tree pruning (stump only, storm cleanup, dirt work) use RANGE_MARKUP. */

const DEFAULT_MARKUP = 0.15;
const DEFAULT_ROUND = 50;

export function loadPricing(env = process.env) {
  const raw = env.TREE_PRICING_JSON;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function markupFrom(raw, fallback) {
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 2 ? n : fallback;
}

export function rangeMarkup(env = process.env) {
  return markupFrom(env.RANGE_MARKUP, DEFAULT_MARKUP);
}

/** Per-size markups for pruning. */
export function sizeMarkups(env = process.env) {
  return {
    small: markupFrom(env.RANGE_MARKUP_SMALL, 0.25),
    medium: markupFrom(env.RANGE_MARKUP_MEDIUM, 0.35),
    large: markupFrom(env.RANGE_MARKUP_LARGE, 0.35),
  };
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function roundHigh(amount, markup, roundTo) {
  const step = num(roundTo) > 0 ? num(roundTo) : DEFAULT_ROUND;
  const high = Math.round((amount * (1 + markup)) / step) * step;
  return Math.max(high, Math.round(amount));
}

function clampInt(v, lo, hi, fallback) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

/** items: [{kind:"tree", heightFt} | {kind:"stump", diameterIn}], jobTypes: ["trim","removal",...] */
/** markups: { sizes: {small, medium, large}, other } */
export function computeBallpark(input, pricing, markups) {
  const types = new Set((Array.isArray(input && input.jobTypes) ? input.jobTypes : []).map(String));
  const items = Array.isArray(input && input.items) ? input.items.slice(0, 40) : [];
  const emergency = Boolean(input && input.stormUrgent);
  const trees = items.filter((m) => m && m.kind === "tree");
  const stumps = items.filter((m) => m && m.kind === "stump");
  const lines = [];

  // Removals (and storm-damaged trees that aren't a trim) get a callback quote, no range.
  const removal = types.has("removal") || (trees.length > 0 && !types.has("trim") && types.has("emergency"));
  if (removal) {
    trees.forEach((t, i) => lines.push({ label: `Tree removal ${i + 1}`, callback: true }));
    stumps.forEach((s, i) => lines.push({ label: `Stump grinding ${i + 1}`, callback: true }));
    if (types.has("dirt")) lines.push({ label: "Skid steer dirt work", callback: true });
    return { range: null, callback: true, reason: "removal", lines };
  }

  if (!pricing) {
    return { range: null, callback: true, reason: "unavailable", lines: [] };
  }

  const roundTo = pricing.roundTo;
  const sizes = (markups && markups.sizes) || sizeMarkups({});
  const otherMarkup = markups && Number.isFinite(markups.other) ? markups.other : DEFAULT_MARKUP;
  const emergencyMult = emergency && num(pricing.stormEmergencyMult) > 0 ? num(pricing.stormEmergencyMult) : 1;
  let callForBallpark = false;
  // Pruning: two options, each its own range.
  const opt = { noCleanup: { low: 0, high: 0 }, withCleanup: { low: 0, high: 0 } };
  let prunedTrees = 0;

  if (types.has("trim")) {
    const bands = (pricing.pruning && pricing.pruning.bands) || [];
    trees.forEach((t, i) => {
      const h = clampInt(t.heightFt, 5, 200, 40);
      const band = bands.find((b) => h <= num(b.maxFt)) || bands[bands.length - 1];
      if (!band || band.callForBallpark || band.price == null) {
        callForBallpark = true;
        lines.push({ label: `Trim tree ${i + 1} · ~${h} ft${band && band.label ? " · " + band.label : ""}`, callForBallpark: true });
        return;
      }
      const markup = Number.isFinite(sizes[band.key]) ? sizes[band.key] : otherMarkup;
      let mult = emergencyMult;
      if (t.nearHouse && num(pricing.nearStructure) > 0) mult *= num(pricing.nearStructure);
      if (t.nearLines && num(pricing.nearLines) > 0) mult *= num(pricing.nearLines);
      const base = num(band.price);
      const clean = band.cleanupPrice != null ? num(band.cleanupPrice) : base;
      // Range comes from Blake's own price; tight access / storm go on top of both ends.
      const extra = (p) => Math.round(p * mult) - p;
      opt.noCleanup.low += base + extra(base);
      opt.noCleanup.high += roundHigh(base, markup, roundTo) + extra(base);
      opt.withCleanup.low += clean + extra(clean);
      opt.withCleanup.high += roundHigh(clean, markup, roundTo) + extra(clean);
      prunedTrees += 1;
      lines.push({ label: `Trim tree ${i + 1} · ~${h} ft · ${band.label || ""}`.trim() + (mult !== 1 ? " · access/storm add-on, we'll confirm on the call" : "") });
    });
  }

  // Add-ons and non-pruning items.
  let addOn = 0;
  let otherLow = 0;
  let otherHigh = 0;
  const stumpBands = (pricing.stumps && pricing.stumps.bands) || [];
  stumps.forEach((st, i) => {
    const d = clampInt(st.diameterIn, 2, 120, 18);
    const band = stumpBands.find((b) => d <= num(b.maxIn)) || stumpBands[stumpBands.length - 1];
    const extra = pricing.stumps && pricing.stumps.extraStump;
    let price = i > 0 && extra != null && d <= 24 ? num(extra) : num(band && band.price);
    if (st.haulMulch && pricing.stumps && pricing.stumps.haulMulch != null) price += num(pricing.stumps.haulMulch);
    if (!price) {
      callForBallpark = true;
      lines.push({ label: `Stump grinding · ${d}"`, callForBallpark: true });
      return;
    }
    addOn += price;
    otherLow += price;
    otherHigh += roundHigh(price, otherMarkup, roundTo);
    lines.push({ label: `Stump grinding · ${d}"` + (prunedTrees ? " · add-on, we'll confirm on the call" : "") });
  });
  const addOther = (p, label) => {
    addOn += p;
    otherLow += p;
    otherHigh += roundHigh(p, otherMarkup, roundTo);
    lines.push({ label: label + (prunedTrees ? " · add-on, we'll confirm on the call" : "") });
  };
  if (types.has("emergency") && !lines.length && pricing.stormCleanup != null) addOther(num(pricing.stormCleanup), "Storm cleanup (downed limbs)");
  if (types.has("dirt") && pricing.dirtWork != null) addOther(num(pricing.dirtWork), "Skid steer dirt work (half day to a full day)");

  if (prunedTrees) {
    const options = [
      { id: "no-cleanup", label: "Trimming, no cleanup", low: opt.noCleanup.low + addOn, high: opt.noCleanup.high + addOn },
      { id: "with-cleanup", label: "Trimming with cleanup", low: opt.withCleanup.low + addOn, high: opt.withCleanup.high + addOn },
    ];
    return {
      range: { low: options[0].low, high: options[1].high },
      options,
      addOns: addOn > 0,
      callback: false,
      callForBallpark,
      lines,
    };
  }
  const low = Math.round(otherLow);
  const high = Math.max(Math.round(otherHigh), low);
  if (!low) return { range: null, callback: true, reason: callForBallpark ? "large" : "none", lines };
  return { range: { low, high }, options: null, callback: false, callForBallpark, lines };
}
