import express from "express";
import { Resend } from "resend";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
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

const DEFAULT_CORS_ORIGINS = [
  "https://hustlestack777.github.io",
  "https://tree-lrl-credit-preview.onrender.com",
  "https://getpros.xyz",
  "https://www.getpros.xyz",
];
function corsOrigins(env = process.env) {
  const extra = String(env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  return new Set([...DEFAULT_CORS_ORIGINS, ...extra]);
}
const ballparkHits = new Map();

// Server-only files are never served as static pages.
const MAGNET_BASE = "/3bs-tree-removal";

app.use((req, res, next) => {
  const path = req.path.replace(/^\/3bs-tree-removal(?=\/|$)/, "") || "/";
  if (/^\/(server|ballpark|lrl-inquiry(\.test)?|magnet)\.js$|^\/package(-lock)?\.json$|^\/\.env|^\/node_modules\//i.test(path)) {
    return res.status(404).type("text/plain").send("Not found");
  }
  return next();
});

app.use(["/api/ballpark", "/api/lrl-inquiry"], (req, res, next) => {
  const origin = req.get("origin");
  if (origin && corsOrigins().has(origin)) {
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

app.get([MAGNET_BASE, MAGNET_BASE + "/", MAGNET_BASE + "/index.html", MAGNET_BASE + "/index"], (req, res) => {
  // Express treats /3bs-tree-removal and /3bs-tree-removal/ as the same route unless
  // we inspect the raw URL. Relative assets need the trailing slash.
  const path = String(req.originalUrl || req.url || "").split("?")[0];
  if (path !== MAGNET_BASE + "/") {
    return res.redirect(302, MAGNET_BASE + "/");
  }
  res.set("X-Robots-Tag", "noindex, nofollow");
  res.set("Cache-Control", "no-store");
  return res.sendFile(join(__dirname, "magnet.html"));
});
app.use(MAGNET_BASE, express.static(__dirname, { extensions: ["html"], index: false }));

app.use(express.static(__dirname, { extensions: ["html"] }));

app.listen(port, "0.0.0.0", () => {
  console.log(`LRL credit preview listening on ${port}`);
});
