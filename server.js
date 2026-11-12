import express from "express";
import { Resend } from "resend";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildLrlInquiryEmail, lrlInquiryRecipients, validateLrlInquiry } from "./lrl-inquiry.js";

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

app.get("/health", (_req, res) => {
  res.type("text/plain").send("ok");
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

app.use(express.static(__dirname, { extensions: ["html"] }));

app.listen(port, "0.0.0.0", () => {
  console.log(`LRL credit preview listening on ${port}`);
});
