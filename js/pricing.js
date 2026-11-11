/* Ballpark tree/stump pricing (v1, Nov 11 2026).
   Industry-standard Louisiana/US ranges approved by Shaun as up-front ballparks.
   Sources: /workspace/blake_assets/price_ranges.md (CostPrism LA, TreeOps USA,
   Angi, HomeGuide via Kingsport guide, US Home Costs, Big Cypress Land & Game, etc.).
   Never a firm price. Blake confirms the real price on the callback. */
window.TREE_PRICING = {
  currency: "USD",
  disclaimer: "Ballpark range, not a firm price. Blake confirms the real price on the callback.",
  trees: {
    // removal, by estimated height (ft)
    heightBands: [
      { maxFt: 30, low: 300, high: 700, label: "Small (under 30 ft)" },
      { maxFt: 60, low: 700, high: 1500, label: "Medium (30–60 ft)" },
      { maxFt: 80, low: 1500, high: 3000, label: "Large (60–80 ft)" },
      { maxFt: 999, low: 3000, high: 6000, label: "Very large (80+ ft)" }
    ],
    // hard jobs add about 25–50%
    nearStructure: 1.25,   // leaning over / close to the house
    nearLines: 1.5,        // near power lines
    haulOff: { low: 100, high: 300 },          // per load
    grindWithRemoval: { low: 125, high: 400 },
    speciesHardness: {
      pine: 1.0,
      oak: 1.1,
      cypress: 1.05,
      pecan: 1.1,
      sweetgum: 1.0,
      unknown: 1.0
    }
  },
  stumps: {
    // first stump, by diameter (inches)
    bands: [
      { maxIn: 12, low: 125, high: 200 },
      { maxIn: 24, low: 150, high: 400 },
      { maxIn: 36, low: 300, high: 600 },
      { maxIn: 999, low: 500, high: 800 }
    ],
    extraStump: { low: 50, high: 150 },  // each additional ordinary stump, same visit
    haulMulch: { low: 50, high: 150 }
  },
  trim: { low: 250, high: 900 },           // per tree; big trees over a roof up to ~1,800
  stormCleanup: { low: 300, high: 1500 },  // downed limbs / yard
  treeOnStructure: { low: 1500, high: 5000 },
  stormEmergencyMult: 1.25,
  haulLoad: { low: 100, high: 300 },
  skidSteerHourly: { low: 100, high: 300 },
  landClearingPerAcre: { low: 1500, high: 4000 },
  cabling: { low: 150, high: 800 },
  planting: { low: 200, high: 900 },
  transplanting: { low: 400, high: 2000 },
  landClearing: { low: 500, high: 2400 },
  // SHAUN TO CONFIRM — do not list these as public services until approved.
  // Public wording stays "skid steer dirt work and lot clearing." Footage supports
  // cleared lots and skid steers only. Do not show the items below, and do not
  // imply a contractor license (Blake has no LSLBC license):
  //   land clearing (beyond lot clearing already in the blurb)
  //   grading / leveling
  //   driveway or pad prep
  //   ditch work
  //   haul-off / fill
  dirtWork: { low: 500, high: 2400 }  // half-day minimum to a full day of skid steer work
};

window.BLAKE_SERVICES = [
  { id: "removal", label: "Hazardous tree removal", live: true, blurb: "Taking down dangerous or unwanted trees, including work near homes." },
  { id: "trim", label: "Professional trimming", live: true, blurb: "Pruning for health, clearance, and a cleaner look around your property." },
  { id: "emergency", label: "Storm cleanup", live: true, blurb: "Downed limbs, storm-damaged trees, and urgent yard recovery." },
  { id: "stump", label: "Stump grinding", live: true, blurb: "Grind stumps below grade so the yard can be used again." },
  { id: "dirt", label: "Skid steer & dirt work", live: true, blurb: "Skid steer dirt work and lot clearing." }
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
