export const SHAUN_INQUIRY_EMAILS = [
  "shaun.brasher@gmail.com",
  "shaun@lagniapperealmlabs.com",
];

export const BLOCKED_INQUIRY_EMAILS = [
  "acadianabathandcounter@gmail.com",
];

export const LRL_TOPICS = [
  { value: "website", label: "Website" },
  { value: "leads", label: "Getting more leads" },
  { value: "ai", label: "AI or automation" },
  { value: "other", label: "Something else" },
];

export const LRL_REACH_TIMES = [
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" },
  { value: "anytime", label: "Anytime" },
];

const MAX_TEXT = 200;
const MAX_COMMENT = 2000;
const MAX_PAGE = 300;

export function clip(value, max) {
  return String(value ?? "").trim().slice(0, max);
}

export function phoneDigits(phone) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

export function isValidEmail(email) {
  const trimmed = String(email ?? "").trim();
  if (!trimmed) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) && trimmed.length <= MAX_TEXT;
}

function uniqueAddresses(addresses) {
  const seen = new Set();
  const result = [];
  for (const address of addresses) {
    const trimmed = String(address ?? "").trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function isBlocked(address) {
  const key = String(address ?? "").trim().toLowerCase();
  return BLOCKED_INQUIRY_EMAILS.some((blocked) => blocked.toLowerCase() === key);
}

export function lrlInquiryRecipients(envList) {
  const fromEnv = String(envList ?? "")
    .split(/[,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const source = fromEnv.length ? fromEnv : [...SHAUN_INQUIRY_EMAILS];
  const allowed = uniqueAddresses(source.filter((address) => !isBlocked(address)));
  return allowed.length ? allowed : [SHAUN_INQUIRY_EMAILS[0]];
}

export function topicLabel(value) {
  return LRL_TOPICS.find((item) => item.value === value)?.label ?? "";
}

export function reachTimeLabel(value) {
  return LRL_REACH_TIMES.find((item) => item.value === value)?.label ?? "";
}

export function validateLrlInquiry(raw = {}) {
  const name = clip(raw.name, MAX_TEXT);
  const phone = clip(raw.phone, MAX_TEXT);
  const email = clip(raw.email, MAX_TEXT);
  const business = clip(raw.business, MAX_TEXT);
  const topic = clip(raw.topic, 40);
  const reachTime = clip(raw.reachTime, 40);
  const comment = clip(raw.comment, MAX_COMMENT);
  const sourceSite = clip(raw.sourceSite, MAX_TEXT) || "Website";
  const sourcePage = clip(raw.sourcePage, MAX_PAGE);

  if (!name) return { ok: false, error: "Please add your name." };
  if (phoneDigits(phone).length < 10) return { ok: false, error: "Please add a phone number we can reach you at." };
  if (email && !isValidEmail(email)) return { ok: false, error: "That email doesn't look right." };
  if (!LRL_TOPICS.some((item) => item.value === topic)) return { ok: false, error: "Please choose what this is about." };
  if (!LRL_REACH_TIMES.some((item) => item.value === reachTime)) return { ok: false, error: "Please choose the best time to reach you." };

  return {
    ok: true,
    value: { name, phone, email, business, topic, reachTime, comment, sourceSite, sourcePage },
  };
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

export function buildLrlInquiryEmail(inquiry) {
  const subject = `LRL inquiry from ${inquiry.sourceSite}: ${inquiry.name}`;
  const rows = [
    ["Name", inquiry.name],
    ["Phone", inquiry.phone],
    ["Email", inquiry.email],
    ["Business", inquiry.business],
    ["What's it about", topicLabel(inquiry.topic)],
    ["Best time to reach them", reachTimeLabel(inquiry.reachTime)],
    ["Anything else", inquiry.comment],
    ["Source site", inquiry.sourceSite],
    ["Source page", inquiry.sourcePage],
  ].filter(([, value]) => String(value ?? "").trim());

  const table = rows
    .map(
      ([label, value]) =>
        `<tr><td style="border-bottom:1px solid #e5e5e5;color:#555;white-space:nowrap;vertical-align:top;padding:6px 10px 6px 0"><b>${esc(label)}</b></td><td style="border-bottom:1px solid #e5e5e5;padding:6px 0">${esc(value).replace(/\n/g, "<br>")}</td></tr>`,
    )
    .join("");

  const html = `<div style="font:15px/1.45 Arial,sans-serif;color:#222;max-width:560px">
<p style="margin:0 0 4px;color:#666;font-size:12px;letter-spacing:.04em;text-transform:uppercase"><b>LRL inquiry</b> — not a client lead</p>
<h2 style="margin:0 0 12px">Someone reached out from the site credit</h2>
<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%">${table}</table>
<p style="margin:16px 0 0;color:#555">This came from the Lagniappe Realm Labs credit on ${esc(inquiry.sourceSite)}. It was not added to a client lead inbox.</p>
</div>`;

  const text = [
    "LRL inquiry — not a client lead",
    `Someone reached out from the site credit on ${inquiry.sourceSite}.`,
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    "This was not added to a client lead inbox.",
  ].join("\n");

  return { subject, html, text };
}
