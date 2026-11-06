/* ============================================================
   3 B's Tree Removal — SITE CONFIG (demo)
   Blake Berry · Pitkin, LA · DO NOT contact Blake from this bot
   ============================================================ */
window.SITE_CONFIG = {
  businessName: "3 B's Tree Removal",
  businessNameShort: "3 B's Tree Removal",
  tagline: "Licensed arborist · tree removal, trimming & stump grinding",
  ownerFirst: "Blake",

  /* Public number from his live site — demo only; production should use a tracked Twilio line */
  phoneDisplay: "(337) 378-4046",
  phoneTel: "+13373784046",

  /* Service area from partner notes */
  serviceAreaLabel: "Pitkin · Leesville · DeRidder · Oakdale · Alexandria region",
  serviceAreaNote: "Lake Charles listed on his current site; confirm zones with Blake before launch.",
  towns: [
    "Pitkin", "Oakdale", "Glenmora", "Forest Hill", "Woodworth",
    "Leesville", "DeRidder", "New Llano", "Fort Johnson", "Rosepine",
    "Anacoco", "Hornbeck", "Boyce", "Alexandria", "Pineville", "Ball"
  ],

  leadEmailTo: "shaun.brasher@gmail.com",
  leadEmailCcNote: "Blake gets notified once wired — demo emails Shaun only.",

  /* Google Maps — paste key to enable Static satellite + Street View.
     Leave empty for graceful OSM / placeholder fallback (no spend). */
  googleMapsApiKey: "",

  /* Instant-quote PLACEHOLDER ranges — Blake must confirm before any public use.
     Derived from SWLA / Gulf South published bands in tree_leads_plan.md */
  quoteRanges: {
    _disclaimer: "PLACEHOLDER RANGES — awaiting Blake confirmation. Not published as final pricing. Not a guarantee.",
    jobs: {
      smallTrim: {
        key: "smallTrim",
        label: "Small trim / pruning",
        sizeHint: "Under ~25 ft · light canopy work",
        low: 400,
        high: 900
      },
      mediumRemoval: {
        key: "mediumRemoval",
        label: "Standard residential removal",
        sizeHint: "~25–50 ft · typical yard tree",
        low: 700,
        high: 1900
      },
      largeRemoval: {
        key: "largeRemoval",
        label: "Large / near-structure removal",
        sizeHint: "~50–80 ft · crane or complex access possible",
        low: 1500,
        high: 3500
      },
      xlHazard: {
        key: "xlHazard",
        label: "Extra-large / hazardous / multi-tree",
        sizeHint: "80+ ft, storm damage, or several trees",
        low: 2500,
        high: 7000
      },
      arboristConsult: {
        key: "arboristConsult",
        label: "Arborist assessment / cabling",
        sizeHint: "Health, risk, bracing, or consult",
        low: 150,
        high: 800
      },
      stumpOnly: {
        key: "stumpOnly",
        label: "Stump grinding (add-on or alone)",
        sizeHint: "Per stump; size varies",
        low: 150,
        high: 450
      },
      stormEmergency: {
        key: "stormEmergency",
        label: "Storm / emergency response",
        sizeHint: "Downed, leaning, or blocking access",
        low: 560,
        high: 3290
      }
    },
    addOns: {
      stumpGrind: { label: "Add stump grinding", low: 150, high: 400 },
      haulOff: { label: "Haul-off / debris removal", low: 150, high: 600 },
      landClear: { label: "Extra land clearing on same visit", low: 400, high: 2000 }
    }
  },

  formEndpoint: "/api/leads-placeholder",
  galleryReady: false,
  reviewsReady: false
};
