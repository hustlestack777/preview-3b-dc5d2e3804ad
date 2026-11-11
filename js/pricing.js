/* Placeholder tree/stump pricing — Blake confirms later.
   Adapted from Hustle Stack PRD: stump grinding = per-stump custom;
   tree service = custom vertical. Numbers are DEMO ONLY. */
window.TREE_PRICING = {
  currency: "USD",
  disclaimer: "Placeholder ranges. Final price confirmed on-site.",
  trees: {
    // base by estimated height (ft)
    heightBands: [
      { maxFt: 25, low: 350, high: 800, label: "Small (<25 ft)" },
      { maxFt: 50, low: 700, high: 1900, label: "Medium (25–50 ft)" },
      { maxFt: 80, low: 1500, high: 3500, label: "Large (50–80 ft)" },
      { maxFt: 999, low: 2500, high: 7000, label: "XL (80+ ft)" }
    ],
    // multipliers
    nearStructure: 1.35,   // within ~25 ft of house
    nearLines: 1.45,       // near power lines
    haulOff: { low: 150, high: 600 },
    grindWithRemoval: { low: 150, high: 400 },
    speciesHardness: {
      pine: 0.95,
      oak: 1.1,
      cypress: 1.05,
      pecan: 1.1,
      sweetgum: 1.0,
      unknown: 1.0
    }
  },
  stumps: {
    // diameter inches → price
    bands: [
      { maxIn: 12, low: 125, high: 250 },
      { maxIn: 24, low: 200, high: 450 },
      { maxIn: 36, low: 350, high: 700 },
      { maxIn: 999, low: 500, high: 1200 }
    ],
    haulMulch: { low: 50, high: 150 }
  },
  trim: { low: 400, high: 900 },
  stormEmergencyMult: 1.25,
  cabling: { low: 150, high: 800 },
  planting: { low: 200, high: 900 },
  transplanting: { low: 400, high: 2000 },
  landClearing: { low: 400, high: 2000 }
};

window.BLAKE_SERVICES = [
  { id: "removal", label: "Hazardous tree removal", live: true, blurb: "Taking down dangerous or unwanted trees, including work near homes." },
  { id: "trim", label: "Professional trimming", live: true, blurb: "Pruning for health, clearance, and a cleaner look around your property." },
  { id: "emergency", label: "Storm cleanup", live: true, blurb: "Downed limbs, storm-damaged trees, and urgent yard recovery." },
  { id: "stump", label: "Stump grinding", live: true, blurb: "Grind stumps below grade so the yard can be used again." }
];

window.HUSTLE_VERTICALS = [
  "Lawn Care / Mowing (auto-quote)",
  "Edging / Trimming",
  "Pressure Wash",
  "Landscaping (custom bid)",
  "Dirt Work (custom bid)",
  "Stump Grinding (custom bid → per stump)",
  "Tree Service (custom bid)",
  "Junk Hauling",
  "Demolition",
  "Handyman",
  "Pool Services",
  "Window Services",
  "Fencing",
  "Holiday Lights",
  "Trash Haul",
  "Moving Help",
  "Gutter Cleaning",
  "Snow Removal"
];
