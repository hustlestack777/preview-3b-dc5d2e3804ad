/* Variant config — pick with ?v=a (default) or ?v=b later */
window.SITE_VARIANTS = {
  a: {
    id: "a",
    label: "Hero estimate (default)",
    headline: "Call for an estimate.",
    subline: "Big trees, trees over the house, storm damage: we handle the tough jobs. Enter your address and add photos to see a ballpark price range. We’ll confirm your real price when we call you back.",
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
  phoneDisplay: "337-378-4046",
  phoneTel: "+13373784046"
};
