import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (name) => readFileSync(new URL("./" + name, import.meta.url), "utf8");
const index = read("index.html");
const privacy = read("lrl-privacy.html");
const llms = read("llms.txt");
const robots = read("robots.txt");
const sitemap = read("sitemap.xml");

const PUBLIC = {
  "index.html": index,
  "lrl-privacy.html": privacy,
  "llms.txt": llms,
  "robots.txt": robots,
  "sitemap.xml": sitemap,
};

const ARBORIST = "Louisiana licensed arborist";
// Shaun's locked 3 B's word track (Nov 22, 2:19 PM CT).
const AREA = "Central & Southwest Louisiana: Lake Charles, Sulphur, DeRidder, Leesville, Toledo Bend and up to Alexandria";
const CTA = "InstaQuote at 3bs.getpros.xyz or call (318) 712-TREE";
const CALLBACK = "Blake calls you back with a price";
const BOTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "PerplexityBot",
  "Google-Extended",
  "Applebot-Extended",
  "GrokBot",
  "xAI-SearchBot",
  "Grok",
];

function decode(html) {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function meta(html, name) {
  const match = html.match(new RegExp(`<meta name="${name}" content="([\\s\\S]*?)"`));
  assert.ok(match, name);
  return decode(match[1]);
}

test("public files omit the private cell, the word free, and prices", () => {
  for (const [name, text] of Object.entries(PUBLIC)) {
    assert.doesNotMatch(text, /337[-.\s)?]*378[-.\s]?4046/, name);
    assert.doesNotMatch(text, /\bfree\b/i, name);
    assert.doesNotMatch(text, /\$\s?\d/, name);
  }
});

test("page and social descriptions say Louisiana licensed arborist and insured", () => {
  const fields = [
    meta(index, "description"),
    decode(index.match(/property="og:description" content="([\s\S]*?)"/)[1]),
    decode(index.match(/name="twitter:description" content="([\s\S]*?)"/)[1]),
  ];
  for (const text of fields) {
    assert.match(text, /Louisiana licensed arborist/i);
    assert.match(text, /\binsured\b/i);
  }
});

test("link preview image is absolute, sized, described, and cache-busted", () => {
  const image = "https://3bs.getpros.xyz/og-image.jpg?v=20261120";
  assert.ok(index.includes(`property="og:image" content="${image}"`));
  assert.match(index, /property="og:image:width" content="1200"/);
  assert.match(index, /property="og:image:height" content="630"/);
  const alt = decode(index.match(/property="og:image:alt" content="([\s\S]*?)"/)[1]);
  assert.match(alt, /Louisiana licensed arborist/i);
  assert.match(alt, /\binsured\b/i);
  assert.ok(index.includes(`name="twitter:image" content="${image}"`));
  assert.match(index, /rel="icon" href="favicon\.ico"/);
  assert.match(index, /rel="apple-touch-icon" href="apple-touch-icon\.png"/);
});

test("titles and meta descriptions are present and unique", () => {
  const homeTitle = decode(index.match(/<title>([\s\S]*?)<\/title>/)[1]);
  const privacyTitle = decode(privacy.match(/<title>([\s\S]*?)<\/title>/)[1]);
  const homeDesc = meta(index, "description");
  const privacyDesc = meta(privacy, "description");
  assert.notEqual(homeTitle, privacyTitle);
  assert.notEqual(homeDesc, privacyDesc);
  assert.ok(homeTitle.length > 10);
  assert.ok(homeDesc.length > 50);
  assert.ok(privacyDesc.length > 40);
  assert.match(index, /<h1>Enter your address\.<\/h1>/);
  assert.match(homeDesc, /Louisiana licensed arborist/);
  assert.ok(homeDesc.includes(AREA), "locked area line");
  assert.ok(homeDesc.includes(CTA), "locked CTA");
});

test("llms.txt repeats the published services, locked area, CTA, and public phone", () => {
  for (const fact of [
    "Hazardous tree removal",
    "Stump grinding",
    "Land clearing and dirt work",
    "Professional trimming",
    "Storm cleanup, also when weather hits",
    AREA,
    CTA,
    "Pitkin",
    "(318) 712-TREE",
    "318-712-8733",
    "+1-318-712-8733",
    "https://3bs.getpros.xyz/",
    ARBORIST,
    "Insured",
  ]) {
    assert.ok(llms.includes(fact), fact);
  }
  assert.doesNotMatch(llms, /Lafayette|Vernon|Beauregard|Rapides|Sabine|LDAF|come check it out/);
});

test("robots.txt allows the named crawlers and points at the sitemap", () => {
  assert.match(robots, /User-agent: \*\s+Allow: \//);
  for (const bot of BOTS) {
    assert.match(robots, new RegExp(`User-agent: ${bot}\\s+Allow: /`));
  }
  assert.doesNotMatch(robots, /Disallow:/);
  assert.match(robots, /Sitemap: https:\/\/3bs\.getpros\.xyz\/sitemap\.xml/);
});

test("sitemap lists the canonical page with lastmod", () => {
  assert.match(sitemap, /<loc>https:\/\/3bs\.getpros\.xyz\/<\/loc>/);
  assert.match(sitemap, /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
  assert.equal((sitemap.match(/<url>/g) || []).length, 1);
  assert.doesNotMatch(sitemap, /lrl-privacy/);
});

test("JSON-LD matches the visible FAQ and published business facts", () => {
  const raw = index.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(raw, "json-ld script");
  const data = JSON.parse(raw[1]);
  const graph = data["@graph"];
  assert.ok(Array.isArray(graph));

  const business = graph.find((node) => [].concat(node["@type"]).includes("HomeAndConstructionBusiness"));
  assert.ok(business);
  assert.ok([].concat(business["@type"]).includes("LocalBusiness"));
  assert.equal(business.name, "3 B's Tree Removal");
  assert.equal(business.telephone, "+1-318-712-8733");
  assert.equal(business.address.addressLocality, "Pitkin");
  assert.equal(business.address.addressRegion, "LA");
  assert.deepEqual(business.areaServed.map((a) => a.name), ["Central Louisiana", "Southwest Louisiana", "Lake Charles", "Sulphur", "DeRidder", "Leesville", "Toledo Bend", "Alexandria"]);
  assert.equal(business.employee.name, "Blake Berry");
  assert.equal(business.employee.jobTitle, "Louisiana licensed arborist");
  assert.match(business.employee.description, new RegExp(ARBORIST.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  const services = graph.filter((node) => node["@type"] === "Service");
  assert.deepEqual(services.map((service) => service.name), [
    "Hazardous tree removal",
    "Stump grinding",
    "Land clearing & dirt work",
    "Professional trimming",
    "Storm cleanup",
  ]);
  for (const service of services) {
    assert.ok(service.description);
    assert.equal(service.provider["@id"], "https://3bs.getpros.xyz/#business");
    assert.ok(Array.isArray(service.areaServed) && service.areaServed.length === 8);
  }

  const faq = graph.find((node) => node["@type"] === "FAQPage");
  const section = index.match(/<section class="faq[\s\S]*?<\/section>/)[0];
  const visible = [...section.matchAll(/<h3>([\s\S]*?)<\/h3>\s*<p>([\s\S]*?)<\/p>/g)].map((match) => ({
    q: decode(match[1]),
    a: decode(match[2]),
  }));
  assert.equal(visible.length, faq.mainEntity.length);
  faq.mainEntity.forEach((question, i) => {
    assert.equal(question["@type"], "Question");
    assert.equal(question.name, visible[i].q);
    assert.equal(question.acceptedAnswer["@type"], "Answer");
    assert.equal(question.acceptedAnswer.text, visible[i].a);
  });
  assert.match(visible.map((item) => item.a).join("\n"), new RegExp(ARBORIST.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  const blob = JSON.stringify(graph);
  assert.doesNotMatch(blob, /aggregateRating|reviewCount|ratingValue|priceRange|"price"/);
  assert.doesNotMatch(blob, /Lafayette|LDAF|come check it out/);
  assert.match(visible.map((item) => item.a).join("\n"), new RegExp(CTA.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  for (const label of ["Hazardous tree removal", "Stump grinding", "Land clearing &amp; dirt work", "Professional trimming", "Storm cleanup"]) {
    assert.match(index, new RegExp(`<strong>${label}</strong>`));
  }
});
