import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
// Load the browser script the way a page would (classic script), but with a CommonJS shim.
const mod = { exports: {} };
vm.runInNewContext(readFileSync(new URL("./js/camille-src.js", import.meta.url), "utf8"), { module: mod, URLSearchParams, JSON });
const { buildDynamicVars, apply, KEY } = mod.exports;

test("organic reel link tags the chat with src=fbreel1122", () => {
  const v = buildDynamicVars("?src=fbreel1122", "/", { source: "lrl", variant: "a" });
  assert.equal(v.page_src, "fbreel1122");
  assert.equal(v.page_utm, "");
  assert.equal(v.page_source_detail, "/?src=fbreel1122 · src=fbreel1122 · v=a");
});

test("boost link carries src and utm like the quote form", () => {
  const v = buildDynamicVars("?src=fbboost1122&utm_source=facebook&utm_medium=paid_social&utm_campaign=blake_reel_nov22", "/", {});
  assert.equal(v.page_src, "fbboost1122");
  assert.equal(v.page_utm, "utm_source=facebook&utm_medium=paid_social&utm_campaign=blake_reel_nov22");
  assert.match(v.page_source_detail, /src=fbboost1122 · v=a · utm_source=facebook&utm_medium=paid_social&utm_campaign=blake_reel_nov22$/);
});

test("no src falls back to the saved session tag, then the site default", () => {
  const saved = buildDynamicVars("?src=fbreel1122", "/", {});
  assert.equal(buildDynamicVars("", "/", { source: "lrl" }, saved).page_src, "fbreel1122");
  assert.equal(buildDynamicVars("", "/", { source: "lrl" }, null).page_src, "lrl");
});

test("junk in the URL is stripped", () => {
  const v = buildDynamicVars('?src=fb"><script>x', "/", {});
  assert.ok(!/[<>"]/.test(v.page_src));
});

test("apply() records page_src on the chat panel", () => {
  const attrs = {};
  const el = { setAttribute: (k, v) => { attrs[k] = v; } };
  const store = {};
  const doc = { getElementById: (id) => (id === "gg-panel" ? el : null) };
  const win = { location: { search: "?src=fbreel1122", pathname: "/" }, SITE_DEFAULTS: { source: "lrl" },
    sessionStorage: { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; } } };
  const vars = apply(doc, win);
  assert.equal(vars.page_src, "fbreel1122");
  assert.equal(attrs["data-page-src"], "fbreel1122");
  assert.equal(JSON.parse(store[KEY]).page_src, "fbreel1122");
});

test("index.html loads camille-src.js after the chat panel and before the widget, with no ElevenLabs script", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  const panel = html.indexOf('id="gg-panel"');
  const src = html.indexOf("js/camille-src.js");
  const widget = html.indexOf("js/gg-widget.js");
  assert.ok(panel > 0 && panel < src && src < widget);
  assert.equal(html.includes("elevenlabs"), false);
  assert.equal(html.includes("convai-widget-embed"), false);
});

test("InstaQuote naming on the preview", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.ok(!/instant tree quote/i.test(html));
  assert.ok(html.includes("Start my InstaQuote"));
});
