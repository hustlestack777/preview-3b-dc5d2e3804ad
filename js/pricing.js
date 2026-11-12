/* No prices live on this page. After the contact form, the page asks the
   preview server for a ballpark range (Blake's numbers stay on the server).
   Blake's tree prices are for pruning / trimming only. Tree removals get a
   callback quote, not a range. */
window.TREE_BALLPARK = {
  disclaimer: "Ballpark range, not a firm price. We'll confirm your real price when we call you back."
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
