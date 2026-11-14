/* One Camille turn: model when a key is set, scripted flow when it is not
   or the call fails, then the shared guardrails either way. */

import { buildSystemPrompt } from "../chat-core/prompt.js";
import { checkOutput, sanitizeChips } from "../chat-core/guardrails.js";
import { scriptedReply } from "./scripted.js";
import { callChatModel, llmConfig } from "./llm.js";

function cleanHistory(messages) {
  const list = Array.isArray(messages) ? messages : [];
  return list
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, 1500) }))
    .filter((m) => m.content)
    .slice(-16);
}

export async function takeTurn({ messages, brand, env = process.env, callModel = callChatModel } = {}) {
  const history = cleanHistory(messages);
  const latest = [...history].reverse().find((m) => m.role === "user");
  const userMessage = latest ? latest.content : "";
  const isGreeting = !history.some((m) => m.role === "assistant");
  const cfg = llmConfig(env);
  const scripted = scriptedReply(userMessage, history, brand);

  let raw = scripted.text;
  let chips = scripted.chips;
  let source = "scripted";
  const llm = { ok: false, reason: "missing_key", env: cfg.envName };

  if (!userMessage && isGreeting) {
    raw = brand.greeting;
    llm.reason = cfg.key ? "greeting" : "missing_key";
    if (cfg.key) llm.ok = true;
  } else if (!cfg.key) {
    llm.reason = "missing_key";
  } else if (cfg.killSwitch) {
    llm.reason = "kill_switch";
    llm.env = cfg.killSwitchEnv;
  } else {
    try {
      raw = await callModel({
        system: buildSystemPrompt(brand),
        messages: history.filter((m) => m.role === "user" || m.role === "assistant"),
        env,
      });
      source = "model";
      llm.ok = true;
      llm.reason = "ok";
      delete llm.env;
    } catch {
      raw = scripted.text;
      source = "scripted";
      llm.ok = false;
      llm.reason = "model_failed";
      delete llm.env;
    }
  }

  let checked = checkOutput(raw, { brand, history, userMessage, isGreeting });
  if (!checked.text) {
    checked = checkOutput(scripted.text, { brand, history, userMessage, isGreeting });
    source = "scripted";
  }
  return {
    text: checked.text,
    chips: sanitizeChips(chips, brand),
    source,
    llm,
    violations: checked.violations,
  };
}
