/* Ballpark pricing for the preview quote form only (not a public price list).
   After the form, the low end is Blake's price for the job they picked.
   The high end is about 15% over that, rounded to the nearest $50, and never
   below his price. Change rangeMarkup, rangeRoundTo, and the price fields
   when Blake updates his numbers. Very large trees (80+ ft) are quoted on
   the callback. We'll confirm the real price when we call back. */
window.TREE_PRICING = {
  currency: "USD",
  // Adjust these when Blake changes how wide the shown range should be.
  rangeMarkup: 0.15,
  rangeRoundTo: 50,
  disclaimer: "Ballpark range, not a firm price. We'll confirm your real price when we call you back.",
  trees: {
    // Blake's removal price (no cleanup). cleanupPrice is ready if we add that choice later.
    heightBands: [
      { maxFt: 30, price: 700, cleanupPrice: 1000, label: "Small (under 30 ft)" },
      { maxFt: 60, price: 1250, cleanupPrice: 1750, label: "Medium (30–60 ft)" },
      { maxFt: 80, price: 2000, cleanupPrice: 2500, label: "Large (60–80 ft)" },
      { maxFt: 999, callForBallpark: true, label: "Very large (80+ ft)" }
    ],
    // tight-access add-ons, applied to Blake's price before the 15% range
    nearStructure: 1.25,   // close to the house or tight drop space
    nearLines: 1.5,        // near power lines
    haulOff: { price: 100 },
    // stump grinding added on top of removal, by tree size (150 to 2000)
    grindWithRemoval: [
      { maxFt: 30, price: 150 },
      { maxFt: 60, price: 250 },
      { maxFt: 80, price: 400 },
      { maxFt: 999, price: 800 }
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
    // first stump, by diameter (inches); Blake's floor by size, 150 to 2000
    bands: [
      { maxIn: 12, price: 150 },
      { maxIn: 24, price: 250 },
      { maxIn: 36, price: 400 },
      { maxIn: 999, price: 800 }
    ],
    extraStump: { price: 150 },
    haulMulch: { price: 50 }
  },
  // Placeholders until Blake gives a single price for these jobs.
  trim: { price: 250 },
  stormCleanup: { price: 300 },
  treeOnStructure: { price: 1500 },
  stormEmergencyMult: 1.25,
  haulLoad: { price: 100 },
  skidSteerHourly: { price: 100 },
  landClearingPerAcre: { price: 1500 },
  cabling: { price: 150 },
  planting: { price: 200 },
  transplanting: { price: 400 },
  landClearing: { price: 500 },
  // SHAUN TO CONFIRM — do not list these as public services until approved.
  // Public wording stays "skid steer dirt work and lot clearing." Footage supports
  // cleared lots and skid steers only. Do not show the items below, and do not
  // imply a contractor license (Blake has no LSLBC license):
  //   land clearing (beyond lot clearing already in the blurb)
  //   grading / leveling
  //   driveway or pad prep
  //   ditch work
  //   haul-off / fill
  dirtWork: { price: 500 }
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
