import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

// Shaun, Nov 22 2026: the main area is for ads and copy only. Next-parish-over addresses
// (Lake Charles, Sulphur, Natchitoches, Avoyelles, Evangeline) still get an InstaQuote.
test("out-of-area Louisiana addresses pass the address check", () => {
  const src = readFileSync(new URL("./js/autocomplete.js", import.meta.url), "utf8");
  const ctx = { window: {}, document: { addEventListener() {}, querySelectorAll: () => [], getElementById: () => null }, setTimeout, clearTimeout, console };
  ctx.globalThis = ctx;
  try { vm.runInNewContext(src, ctx); } catch (e) { /* DOM wiring may fail; the check is set first */ }
  const inLA = ctx.inLouisiana || ctx.window.inLouisiana;
  assert.equal(typeof inLA, "function");
  for (const [name, lat, lon] of [["Lake Charles", 30.2266, -93.2174], ["Sulphur", 30.2366, -93.3774], ["Natchitoches", 31.7607, -93.0863], ["Marksville", 31.1279, -92.0662], ["Ville Platte", 30.6891, -92.2715], ["Leesville", 31.1435, -93.261]]) {
    assert.equal(inLA(lat, lon), true, name);
  }
});

test("no customer-facing 'we don't serve' language", () => {
  for (const f of ["index.html", "llms.txt", "js/app.js", "js/autocomplete.js", "js/config.js", "js/gg-widget.js"]) {
    const t = readFileSync(new URL("./" + f, import.meta.url), "utf8");
    assert.doesNotMatch(t, /(don['’]t|do not|doesn['’]t|not) serve|outside (our|the) (service )?area|out of (our )?area|We serve Central/i, f);
  }
});
