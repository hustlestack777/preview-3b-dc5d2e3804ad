/* Ballpark tree/stump pricing for the preview quote form (Nov 11 2026).
   After the customer sends the form, the range uses Blake's prices:
   low = removal with no cleanup, high = removal + cleanup (no stump grinding).
   Stump grinding and tight-access (near a house or power lines) are add-ons.
   Very large trees (80+ ft) are quoted on the callback, not with a dollar range.
   These numbers are for the after-form range only, not a public price list.
   Never a firm price. We'll confirm the real price when we call back. */
window.TREE_PRICING = {
  currency: "USD",
  disclaimer: "Ballpark range, not a firm price. We'll confirm your real price when we call you back.",
  trees: {
    // removal, by estimated height (ft)
    heightBands: [
      { maxFt: 30, low: 700, high: 1000, label: "Small (under 30 ft)" },
      { maxFt: 60, low: 1250, high: 1750, label: "Medium (30–60 ft)" },
      { maxFt: 80, low: 2000, high: 2500, label: "Large (60–80 ft)" },
      { maxFt: 999, callForBallpark: true, label: "Very large (80+ ft)" }
    ],
    // tight-access add-ons
    nearStructure: 1.25,   // close to the house or tight drop space
    nearLines: 1.5,        // near power lines
    haulOff: { low: 100, high: 300 },          // per load
    // stump grinding added on top of removal, by tree size (150 to 2000)
    grindWithRemoval: [
      { maxFt: 30, low: 150, high: 400 },
      { maxFt: 60, low: 250, high: 800 },
      { maxFt: 80, low: 400, high: 1500 },
      { maxFt: 999, low: 800, high: 2000 }
    ],
    speciesHardness: {
      pine: 1.0,
      oak: 1.0,
      cypress: 1.0,
      pecan: 1.0,
      sweetgum: 1.0,
      unknown: 1.0
    }
  },
  stumps: {
    // first stump, by diameter (inches); Blake's range is 150 to 2000
    bands: [
      { maxIn: 12, low: 150, high: 400 },
      { maxIn: 24, low: 250, high: 800 },
      { maxIn: 36, low: 400, high: 1500 },
      { maxIn: 999, low: 800, high: 2000 }
    ],
    extraStump: { low: 150, high: 400 },  // each additional ordinary stump, same visit
    haulMulch: { low: 50, high: 150 }
  },
  trim: { low: 250, high: 900 },           // per tree; no new Blake number yet
  stormCleanup: { low: 300, high: 1500 },  // downed limbs / yard
  treeOnStructure: { low: 1500, high: 5000 },
  stormEmergencyMult: 1.25,
  haulLoad: { low: 100, high: 300 },
  skidSteerHourly: { low: 100, high: 300 },
  landClearingPerAcre: { low: 1500, high: 9000 },
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
