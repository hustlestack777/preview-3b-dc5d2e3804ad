import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const script = html.match(/id="gg-cutout"[\s\S]*?<script>\s*([\s\S]*?)<\/script>/)[1];

const LOOKS = [
  "img/gg/camille-chainsaw.webp",
  "img/gg/camille-hardhat.webp",
  "img/gg/camille-polesaw.webp",
  "img/gg/camille-gloves.webp",
  "img/gg/camille-rope.webp",
  "img/gg/camille-pruner.webp",
];

function load(stored) {
  const store = {};
  if (stored !== undefined) store.camilleLookIndex = String(stored);
  const img = { src: "", attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
  const context = {
    localStorage: {
      getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem(k, v) { store[k] = String(v); },
    },
    document: { getElementById(id) { return id === "gg-cutout" ? img : null; } },
    isFinite,
    parseInt,
  };
  vm.runInNewContext(script, context);
  return { img, store };
}

test("each page load shows the next Camille look and advances the stored index", () => {
  let stored;
  const seen = [];
  for (let n = 0; n < LOOKS.length + 2; n += 1) {
    const { img, store } = load(stored);
    seen.push(img.src);
    assert.equal(img.attrs["data-look"], img.src);
    stored = store.camilleLookIndex;
    assert.equal(stored, String((n + 1) % LOOKS.length));
  }
  assert.deepEqual(seen, [...LOOKS, LOOKS[0], LOOKS[1]]);
});

test("a missing or junk index starts at the chainsaw look", () => {
  assert.equal(load(undefined).img.src, LOOKS[0]);
  assert.equal(load("nope").img.src, LOOKS[0]);
  assert.equal(load(-1).img.src, LOOKS[5]);
  assert.equal(load(-1).store.camilleLookIndex, "0");
});

test("the six looks are optimized transparent webp files", () => {
  for (const rel of LOOKS) {
    assert.equal(existsSync(new URL(rel, import.meta.url)), true, rel);
    assert.match(html, new RegExp(rel.replace(/\./g, "\\.")));
  }
  assert.doesNotMatch(html, /gg-outdoor-auburn/);
  assert.match(html, /id="gg-launcher"/);
  assert.match(html, /id="gg-panel"/);
  assert.doesNotMatch(html, /elevenlabs|agent_2301|convai-widget-embed/i);
});

test("page copy uses the locked word track and never says free", () => {
  // Shaun's locked 3 B's word track (Nov 22, 2:19 PM CT).
  assert.ok((html.split("Louisiana licensed arborist").length - 1) >= 5);
  assert.ok(html.includes("our team will call you back with a price"));
  assert.doesNotMatch(html, /Blake (will )?calls? (you )?back|Blake looks over/i);
  assert.ok(html.includes("InstaQuote at 3bs.getpros.xyz or call (318) 712-TREE"));
  assert.ok(html.includes("DeRidder, Leesville, Toledo Bend, Oakdale, Jennings and up through Alexandria"));
  assert.doesNotMatch(html, /LDAF|come check it out|Licensed Arborist/);
  assert.doesNotMatch(html, /\bfree\b/i);
  assert.doesNotMatch(html, /337[-.\s)?]*378[-.\s]?4046/);
});

test("phone chat sheet cannot grow wider than the screen", () => {
  const js = readFileSync(new URL("./js/gg-widget.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("./css/styles.css", import.meta.url), "utf8");
  const sheet = css.slice(css.indexOf("Camille's own sheet"), css.indexOf("Leave room at the very bottom"));
  assert.match(sheet, /@media \(max-width: 639px\)/);
  assert.match(sheet, /max-width: 100%/);
  assert.match(sheet, /font-size: 16px !important/);
  assert.doesNotMatch(sheet, /100vw/);
  assert.doesNotMatch(js, /width: 380px/);
  assert.doesNotMatch(js, /100vw/);
  assert.match(css, /overflow-x: clip/);
  assert.doesNotMatch(js, /webkitSpeechRecognition|speech-to-text/i);
});
