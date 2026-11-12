/* Variant config — pick with ?v=a (default) or ?v=b later */
window.SITE_VARIANTS = {
  a: {
    id: "a",
    label: "Hero estimate (default)",
    headline: "Call for an estimate.",
    subline: "Big trees, trees over the house, storm damage: we handle the tough jobs. Enter your address and add photos. Trimming jobs see a ballpark price range; removals get a quote on the callback. We’ll confirm your real price when we call you back.",
    cta: "Get started",
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
  // Ballpark ranges are worked out on this server after the form (no prices on the page).
  ballparkApi: "https://tree-lrl-credit-preview.onrender.com",
  phoneVanity: "(318) 712-TREE",
  phoneDisplay: "318-712-8733",
  phoneTel: "+13187128733"
};
