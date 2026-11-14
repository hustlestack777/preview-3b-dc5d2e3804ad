/* Server-side model call. The key stays in the Authorization header.
   It is never written to logs, errors, or the page. */

import { LLM_KEY_ENV } from "./camille-brand.js";

export { LLM_KEY_ENV };

export const KILL_SWITCH_ENV = "CAMILLE_LLM_KILL_SWITCH";

const DEFAULT_BASE = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";

export function killSwitchOn(env = process.env) {
  const flag = String(env[KILL_SWITCH_ENV] || "").trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "on" || flag === "yes";
}

export function llmConfig(env = process.env) {
  const key = String(env[LLM_KEY_ENV] || "").trim();
  return {
    key,
    envName: LLM_KEY_ENV,
    killSwitch: killSwitchOn(env),
    killSwitchEnv: KILL_SWITCH_ENV,
    base: String(env.CAMILLE_LLM_BASE_URL || DEFAULT_BASE).replace(/\/$/, ""),
    model: String(env.CAMILLE_LLM_MODEL || DEFAULT_MODEL),
  };
}

export async function callChatModel({ system, messages, env = process.env, fetchImpl = fetch }) {
  const cfg = llmConfig(env);
  if (!cfg.key) {
    const err = new Error(`${LLM_KEY_ENV} is not set`);
    err.code = "missing_key";
    throw err;
  }
  let res;
  try {
    res = await fetchImpl(`${cfg.base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.key}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0.6,
        max_tokens: 1024,
        messages: [
          { role: "system", content: system },
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      }),
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw Object.assign(new Error("model_unreachable"), { code: "model_failed" });
  }
  if (!res.ok) {
    throw Object.assign(new Error("model_http"), { code: "model_failed" });
  }
  const data = await res.json();
  const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (typeof text !== "string" || !text.trim()) {
    throw Object.assign(new Error("model_empty"), { code: "model_failed" });
  }
  return text.trim();
}
