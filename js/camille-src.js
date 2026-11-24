/* Camille chat attribution. Runs right after the chat panel and BEFORE the widget
   script, so the chat starts with the same src / utm tags the quote form sends
   (src=fbreel1122 organic reel, src=fbboost1122 paid boost, etc.).
   The chat request sends these to this site's server:
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

  const api = { buildDynamicVars, KEY, current: null };
  function apply(doc, win) {
    let saved = null;
    try { saved = JSON.parse(win.sessionStorage.getItem(KEY) || "null"); } catch (e) { saved = null; }
    const vars = buildDynamicVars(win.location.search, win.location.pathname, win.SITE_DEFAULTS, saved);
    try { win.sessionStorage.setItem(KEY, JSON.stringify(vars)); } catch (e) { /* private mode */ }
    const el = doc.getElementById ? doc.getElementById("gg-panel") : null;
    if (el) el.setAttribute("data-page-src", vars.page_src);
    api.current = vars;
    return vars;
  }
  api.apply = apply;

  return api;
});
