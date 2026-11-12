/* Variant config — pick with ?v=a (default) or ?v=b later */
window.SITE_VARIANTS = {
  a: {
    id: "a",
    label: "Address-first (default)",
    headline: "Enter your address.",
    subline: "Start with your address. We pull up your property, you tell us the work, and our team calls you back with your real price. Trees, stumps, land clearing, dirt work and storm cleanup.",
    cta: "Start my quote",
    heroImage: "img/hero-poster.jpg"
  }
};

window.SITE_DEFAULTS = {
  source: "lrl",          // Lagniappe / our micro-site
  variant: "a",
  blakeSite: "https://www.3bstreeremoval.com/",
  leadEmailTo: "shaun.brasher@gmail.com",
  // Shared lead intake (Render). FormSubmit above stays as the fallback.
  leadApi: "https://tree-leads-3b-4omg.onrender.com",
  // Same-origin so it works on any host (onrender or 3bs.getpros.xyz). Ballpark ranges are worked out on this server after the form (no prices on the page).
  ballparkApi: window.location.origin,
  phoneVanity: "(318) 712-TREE",
  phoneDisplay: "318-712-8733",
  phoneTel: "+13187128733"
};
