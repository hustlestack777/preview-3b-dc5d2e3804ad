import express from "express";
import { Resend } from "resend";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import { buildLrlInquiryEmail, lrlInquiryRecipients, validateLrlInquiry } from "./lrl-inquiry.js";
import { computeBallpark, loadPricing, rangeMarkup, sizeMarkups } from "./ballpark.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT) || 4318;
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const hits = new Map();

app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));

function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) return forwarded.split(",")[0].trim();
  return req.ip || "unknown";
}

function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((time) => now - time < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

const BALLPARK_ORIGINS = new Set([
  "https://hustlestack777.github.io",
  "https://tree-lrl-credit-preview.onrender.com",
  "https://3bs.getpros.xyz",
  "https://getpros.xyz",
  "https://www.getpros.xyz",
]);

// Canonical host: https://3bs.getpros.xyz (Shaun, Nov 12). index.html carries it in the
// canonical/og tags; env CANONICAL_HOST can swap it. The onrender host (and any other
// host) gets a 301 to the canonical host only while https://<canonical>/health answers
// "ok" over a valid cert, so the onrender URL never breaks if the domain goes away.
// CANONICAL_REDIRECT=0 turns the redirect off.
const SITE_HOST = "3bs.getpros.xyz";
const CANONICAL_HOST = String(process.env.CANONICAL_HOST || SITE_HOST).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
const REDIRECT_ON = process.env.CANONICAL_REDIRECT !== "0";
const indexHtml = readFileSync(join(__dirname, "index.html"), "utf8").split("https://" + SITE_HOST).join("https://" + CANONICAL_HOST);
let canonicalLive = false;
let probeFails = 0;

async function probeCanonical() {
  try {
    const res = await fetch("https://" + CANONICAL_HOST + "/health", { redirect: "manual", signal: AbortSignal.timeout(8000) });
    const ok = res.ok && (await res.text()).trim() === "ok";
    if (ok) { canonicalLive = true; probeFails = 0; return; }
  } catch {
    /* DNS or cert not ready */
  }
  probeFails += 1;
  if (probeFails >= 3) canonicalLive = false;
}
probeCanonical();
setInterval(probeCanonical, 5 * 60 * 1000).unref();
const ballparkHits = new Map();

app.use((req, res, next) => {
  if (!REDIRECT_ON || !canonicalLive) return next();
  const host = String(req.headers.host || "").toLowerCase().split(":")[0];
  if (!host || host === CANONICAL_HOST || req.path === "/health" || req.path.startsWith("/api/")) return next();
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  return res.redirect(301, "https://" + CANONICAL_HOST + req.originalUrl);
});

// Server-only files are never served as static pages.
app.use((req, res, next) => {
  if (/^\/(server|ballpark|lrl-inquiry(\.test)?)\.js$|^\/package(-lock)?\.json$|^\/\.env|^\/node_modules\//i.test(req.path)) {
    return res.status(404).type("text/plain").send("Not found");
  }
  return next();
});

app.use("/api/ballpark", (req, res, next) => {
  const origin = req.get("origin");
  if (origin && BALLPARK_ORIGINS.has(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
  }
  if (req.method === "OPTIONS") return res.status(204).end();
  return next();
});

app.get("/health", (_req, res) => {
  res.type("text/plain").send("ok");
});

// Ballpark range, only after the contact form. Prices come from Render env vars, never the page.
app.post("/api/ballpark", (req, res) => {
  const ip = clientIp(req);
  const now = Date.now();
  const recent = (ballparkHits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= 20) {
    ballparkHits.set(ip, recent);
    return res.status(429).json({ ok: false, error: "Please wait a few minutes and try again." });
  }
  recent.push(now);
  ballparkHits.set(ip, recent);

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const name = String(body.name || "").trim();
  const phoneDigits = String(body.phone || "").replace(/\D/g, "");
  if (name.length < 2 || phoneDigits.length < 10 || body.consent !== true) {
    return res.status(400).json({ ok: false, error: "Send your name, phone and consent first." });
  }
  const result = computeBallpark(body, loadPricing(), { sizes: sizeMarkups(), other: rangeMarkup() });
  res.set("Cache-Control", "no-store");
  return res.json({ ok: true, ...result });
});

app.post("/api/lrl-inquiry", async (req, res) => {
  if (rateLimited(clientIp(req))) {
    return res.status(429).json({ ok: false, error: "Please wait a few minutes and try again." });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  if (String(body.company_fax || "").trim()) {
    return res.json({ ok: true });
  }

  const parsed = validateLrlInquiry({
    ...body,
    sourceSite: body.sourceSite || "3 B's Tree Removal",
    sourcePage: body.sourcePage || req.get("referer") || "",
  });
  if (!parsed.ok) {
    return res.status(400).json({ ok: false, error: parsed.error });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.LRL_RESEND_FROM || process.env.RESEND_FROM;
  const to = lrlInquiryRecipients(process.env.LRL_INQUIRY_EMAIL);
  if (!apiKey || !from || !to.length) {
    return res.status(500).json({ ok: false, error: "This form isn't ready yet. Please email Shaun directly." });
  }

  const message = buildLrlInquiryEmail(parsed.value);
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to,
    subject: message.subject,
    html: message.html,
    text: message.text,
    replyTo: parsed.value.email || undefined,
  });

  if (error) {
    console.error("LRL inquiry email failed");
    return res.status(502).json({ ok: false, error: "We couldn't send that. Please try again or email Shaun." });
  }

  return res.json({ ok: true });
});

app.get(["/", "/index.html", "/index"], (_req, res) => {
  res.set("Cache-Control", "no-cache");
  res.type("html").send(indexHtml);
});

app.use(express.static(__dirname, { extensions: ["html"] }));

app.listen(port, "0.0.0.0", () => {
  console.log(`LRL credit preview listening on ${port}`);
});
