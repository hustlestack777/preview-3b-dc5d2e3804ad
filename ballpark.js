/* Server-side ballpark ranges for the 3 B's quote form.
   No prices live in this repo. Blake's numbers come from the TREE_PRICING_JSON
   environment variable on Render, and the range width comes from RANGE_MARKUP
   (0.15 = 15%). The range is only returned after the contact form is sent.

   Rules:
   - Blake's tree prices are PRUNING / TRIMMING only.
   - Tree removal has no price yet, so removal jobs get no range and a callback quote.
   - Low end = Blake's no-cleanup price. High end = his cleanup price plus RANGE_MARKUP,
     rounded to the nearest roundTo (default $50), never below the low end. */

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

export function rangeMarkup(env = process.env) {
  const n = Number(env.RANGE_MARKUP);
  return Number.isFinite(n) && n >= 0 && n <= 2 ? n : DEFAULT_MARKUP;
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
export function computeBallpark(input, pricing, markup) {
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
  let low = 0;
  let high = 0;
  let callForBallpark = false;
  const emergencyMult = emergency && num(pricing.stormEmergencyMult) > 0 ? num(pricing.stormEmergencyMult) : 1;

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
      let base = num(band.price);
      let withCleanup = band.cleanupPrice != null ? num(band.cleanupPrice) : base;
      let mult = emergencyMult;
      if (t.nearHouse && num(pricing.nearStructure) > 0) mult *= num(pricing.nearStructure);
      if (t.nearLines && num(pricing.nearLines) > 0) mult *= num(pricing.nearLines);
      base = Math.round(base * mult);
      withCleanup = Math.round(withCleanup * mult);
      low += base;
      high += roundHigh(withCleanup, markup, roundTo);
      lines.push({ label: `Trim tree ${i + 1} · ~${h} ft · ${band.label || ""}`.trim() });
    });
  }

  const stumpBands = (pricing.stumps && pricing.stumps.bands) || [];
  stumps.forEach((s, i) => {
    const d = clampInt(s.diameterIn, 2, 120, 18);
    const band = stumpBands.find((b) => d <= num(b.maxIn)) || stumpBands[stumpBands.length - 1];
    const extra = pricing.stumps && pricing.stumps.extraStump;
    let price = i > 0 && extra != null && d <= 24 ? num(extra) : num(band && band.price);
    if (s.haulMulch && pricing.stumps && pricing.stumps.haulMulch != null) price += num(pricing.stumps.haulMulch);
    if (!price) {
      callForBallpark = true;
      lines.push({ label: `Stump grinding · ${d}"`, callForBallpark: true });
      return;
    }
    low += price;
    high += roundHigh(price, markup, roundTo);
    lines.push({ label: `Stump grinding · ${d}"` });
  });

  if (types.has("emergency") && !lines.length && pricing.stormCleanup != null) {
    const p = num(pricing.stormCleanup);
    low += p;
    high += roundHigh(p, markup, roundTo);
    lines.push({ label: "Storm cleanup (downed limbs)" });
  }
  if (types.has("dirt") && pricing.dirtWork != null) {
    const p = num(pricing.dirtWork);
    low += p;
    high += roundHigh(p, markup, roundTo);
    lines.push({ label: "Skid steer dirt work (half day to a full day)" });
  }

  low = Math.round(low);
  high = Math.max(Math.round(high), low);
  if (!low) return { range: null, callback: true, reason: callForBallpark ? "large" : "none", lines };
  return { range: { low, high }, callback: false, callForBallpark, lines };
}
