/* Camille website chat. Grok (xAI) is called from this server.
   The key stays in the Authorization header. It is never written to logs,
   errors, or the page. If this service has no xAI key, the same route
   asks the firewood.delivery backup, which already holds a Camille chat. */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PERSONA_PATH = join(dirname(fileURLToPath(import.meta.url)), "gg-chat-persona.md");

export const XAI_URL = "https://api.x.ai/v1/chat/completions";
export const BACKUP_URL = "https://firewood.delivery/api/grok-chat/camille";
export const DEFAULT_MODEL = "grok-4-fast-non-reasoning";
/* Blake's per-business key uses the same name as the other business services.
   The extra names are accepted if one of them is the one set on this service. */
export const KEY_ENVS = ["XAI_API_KEY", "XAI_API_KEY_3BS", "BLAKE_XAI_API_KEY", "CAMILLE_XAI_API_KEY"];
export const PUBLIC_DIGITS = "3187128733";
export const BRIDGE = "Easiest way to get you a real number is a few photos and a good time to call. When's best to reach you?";
export const DECLINE = "That's not one I can help with, but I can help with your trees. What's going on with them?";
export const SAFETY = "Stay at least 35 feet back from it and anything touching it, and don't try to move it. Call your power company, and 911 if there's sparking, fire, or anyone hurt.";
export const FALLBACK = "Sorry, chat's having trouble. Call (318) 712-TREE or start your InstaQuote up top.";

const PHONE_RE = /(?:\+?1[\s.\-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/g;
const JOB_RE = /\b(tree|trees|stump|limb|oak|pine|trim|trimming|removal|yard|quote|instaquote|photo|photos|storm|clearing|dirt|arborist|branch|branches)\b/i;
const STEER_RE = /\b(tree|trees|stump|limb|quote|instaquote|photo|photos|reach you|yard|removal|trimming|trim|call)\b/i;
const WIRES_RE = /\b(wires? down|power lines?|sparking|sparks)\b/i;
const HAZARD_RE = /\b(wires? down|power lines?|sparking|sparks|smell of gas|smells like gas|anyone hurt|on (the |my )?(house|car|home)|storm damage)\b/i;
const PROMPT_ATTACK_RE = /\b(system prompt|these instructions|your instructions|developer message)\b/i;

export function resolveXaiKey(env = process.env) {
  for (const name of KEY_ENVS) {
    const key = String(env[name] || "").trim();
    if (key) return { name, key };
  }
  return null;
}

export function camilleChatMode(env = process.env) {
  const found = resolveXaiKey(env);
  return found ? `camille chat: ${found.name}` : "camille chat: firewood backup";
}

export function cleanPageSrc(value) {
  return String(value || "").replace(/[^a-z0-9_-]/gi, "").slice(0, 40);
}

export function loadPersona() {
  return readFileSync(PERSONA_PATH, "utf8");
}

export function systemPrompt(pageSrc, persona = loadPersona()) {
  const src = cleanPageSrc(pageSrc);
  return String(persona).split("{{page_src}}").join(src);
}

export function sanitizeMessages(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const message of input.slice(-16)) {
    if (!message || (message.role !== "user" && message.role !== "assistant")) continue;
    if (typeof message.content !== "string") continue;
    const content = message.content.trim().slice(0, 1000);
    if (!content) continue;
    out.push({ role: message.role, content });
  }
  return out;
}

export function scrubReply(text) {
  let out = String(text || "");
  out = out.replace(PHONE_RE, () => "(318) 712-TREE");
  out = out.replace(/\b\d{10,11}\b/g, () => "(318) 712-TREE");
  out = out.replace(/licensed contractor/gi, "Louisiana licensed arborist");
  out = out.replace(/\b(bonded|guaranteed)\b/gi, "");
  out = out.replace(/\bfree\b/gi, "");
  out = out.replace(/\s{2,}/g, " ").replace(/\s+([,.!?])/g, "$1").trim();
  return out || BRIDGE;
}

export function finishReply(userText, modelText) {
  let reply = scrubReply(modelText);
  const user = String(userText || "");
  if (WIRES_RE.test(user) && !/35 feet/i.test(reply)) {
    reply = `${SAFETY} ${reply}`.trim();
  }
  if (HAZARD_RE.test(user)) return reply;
  if (JOB_RE.test(user) || STEER_RE.test(reply)) return reply;
  return `${reply.replace(/[.\s]+$/, "")}. ${BRIDGE}`.replace(/\s{2,}/g, " ").trim();
}

async function readJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function completeCamilleChat({ messages, pageSrc, env = process.env, fetchImpl = fetch, persona } = {}) {
  const history = sanitizeMessages(messages);
  const last = history[history.length - 1];
  if (!last || last.role !== "user") {
    const error = new Error("bad_request");
    error.code = "bad_request";
    throw error;
  }
  if (PROMPT_ATTACK_RE.test(last.content)) {
    return { reply: DECLINE, provider: "guard" };
  }

  const found = resolveXaiKey(env);
  let raw = "";
  let provider = "backup";
  if (found) {
    provider = "xai";
    const res = await fetchImpl(XAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${found.key}`,
      },
      body: JSON.stringify({
        model: String(env.GROK_CHAT_MODEL || DEFAULT_MODEL),
        temperature: 0.4,
        max_tokens: 400,
        messages: [
          { role: "system", content: systemPrompt(pageSrc, persona) },
          ...history,
        ],
      }),
      signal: AbortSignal.timeout(28000),
    });
    if (!res.ok) {
      const error = new Error("model_http");
      error.code = "model_failed";
      error.status = res.status;
      throw error;
    }
    const data = await readJson(res);
    raw = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  } else {
    const backup = String(env.CAMILLE_CHAT_BACKUP_URL || BACKUP_URL);
    const res = await fetchImpl(backup, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: history,
        pageSrc: cleanPageSrc(pageSrc),
      }),
      signal: AbortSignal.timeout(28000),
    });
    if (!res.ok) {
      const error = new Error("backup_http");
      error.code = "model_failed";
      error.status = res.status;
      throw error;
    }
    const data = await readJson(res);
    raw = data && data.reply;
  }

  if (typeof raw !== "string" || !raw.trim()) {
    const error = new Error("model_empty");
    error.code = "model_failed";
    throw error;
  }
  return { reply: finishReply(last.content, raw).slice(0, 1200), provider };
}

function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) return forwarded.split(",")[0].trim();
  return req.ip || "unknown";
}

function limited(hits, ip, max, windowMs) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((time) => now - time < windowMs);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > max;
}

export function registerCamilleChat(app, options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  const max = options.rateLimit === false ? Infinity : (options.rateLimit || 30);
  const hits = options.hits || new Map();

  app.get("/api/camille-chat/status", (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ ok: true, provider: resolveXaiKey(env) ? "xai" : "backup" });
  });

  app.post("/api/camille-chat", async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (limited(hits, clientIp(req), max, 10 * 60 * 1000)) {
      return res.status(429).json({ reply: "Please wait a few minutes and try again, or call (318) 712-TREE." });
    }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    try {
      const out = await completeCamilleChat({
        messages: body.messages,
        pageSrc: body.pageSrc,
        env,
        fetchImpl,
        persona: options.persona,
      });
      return res.json({ reply: out.reply });
    } catch (error) {
      if (error && error.code === "bad_request") {
        return res.status(400).json({ reply: "Ask me about the trees, or start your InstaQuote up top." });
      }
      console.error("camille chat failed", error && error.status ? error.status : error && error.code ? error.code : "error");
      return res.status(502).json({ reply: FALLBACK });
    }
  });
}
