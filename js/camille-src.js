/* Camille chat attribution. Runs right after <elevenlabs-convai> and BEFORE the widget
   script, so the chat starts with the same src / utm tags the quote form sends
   (src=fbreel1122 organic reel, src=fbboost1122 paid boost, etc.).
   The ElevenLabs agent reads these as dynamic variables:
     page_src            e.g. "fbreel1122" (defaults to SITE_DEFAULTS.source, like the form)
     page_variant        e.g. "a"
     page_utm            e.g. "utm_source=facebook&utm_medium=paid_social&utm_campaign=blake_reel_nov22" ("" if none)
     page_path           e.g. "/?src=fbreel1122"
     page_source_detail  same shape as the form's source_detail: "<path> · src=… · v=… · utm_…"
   The tags are kept for the tab session, so they survive a reload or in-page navigation. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CamilleSrc = api;
  if (typeof document !== "undefined") api.apply(document, root);
})(typeof window !== "undefined" ? window : globalThis, function () {
  const KEY = "camille_src_v1";
  const clean = (v, n) => String(v == null ? "" : v).replace(/[^\w.\-~+%@/ ]/g, "").slice(0, n || 80);
  const cleanPath = (v) => String(v == null ? "" : v).replace(/[^\w.\-~+%@/?=&]/g, "").slice(0, 300);

  function buildDynamicVars(search, pathname, defaults, saved) {
    const q = new URLSearchParams(search || "");
    const utm = [];
    q.forEach((val, key) => {
      if (/^utm_/i.test(key)) utm.push(key.toLowerCase() + "=" + clean(val));
    });
    const fromUrl = q.get("src");
    const d = defaults || {};
    // URL beats the saved session value; saved beats the site default.
    if (!fromUrl && saved && saved.page_src) return saved;
    const src = clean(fromUrl || d.source || "lrl").toLowerCase();
    const variant = clean(q.get("v") || d.variant || "a", 8).toLowerCase();
    const path = cleanPath((pathname || "/") + (search || ""));
    const utmStr = utm.join("&");
    const detail = [path, "src=" + src, "v=" + variant, utmStr].filter(Boolean).join(" · ");
    return { page_src: src, page_variant: variant, page_utm: utmStr, page_path: path, page_source_detail: detail };
  }

  function apply(doc, win) {
    const el = doc.querySelector("elevenlabs-convai");
    if (!el) return null;
    let saved = null;
    try { saved = JSON.parse(win.sessionStorage.getItem(KEY) || "null"); } catch (e) { saved = null; }
    const vars = buildDynamicVars(win.location.search, win.location.pathname, win.SITE_DEFAULTS, saved);
    try { win.sessionStorage.setItem(KEY, JSON.stringify(vars)); } catch (e) { /* private mode */ }
    let existing = {};
    try { existing = JSON.parse(el.getAttribute("dynamic-variables") || "{}"); } catch (e) { existing = {}; }
    el.setAttribute("dynamic-variables", JSON.stringify(Object.assign({}, existing, vars)));
    return vars;
  }

  return { buildDynamicVars, apply, KEY };
});
