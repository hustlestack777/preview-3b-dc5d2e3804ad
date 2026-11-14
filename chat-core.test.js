import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildSystemPrompt } from "./chat-core/prompt.js";
import { checkOutput, containsForbiddenPhone } from "./chat-core/guardrails.js";
import { camilleBrand, LLM_KEY_ENV } from "./chat/camille-brand.js";
import { createIpAbuseLimit } from "./chat/abuse.js";
import { scriptedReply } from "./chat/scripted.js";
import { takeTurn } from "./chat/turn.js";

const brand = camilleBrand();
const FORBIDDEN = ["337-378-4046", "337-405-9945", "3373784046", "3374059945"];

function noSecrets(text) {
  const digits = String(text).replace(/\D/g, "");
  for (const n of ["3373784046", "3374059945"]) {
    assert.equal(digits.includes(n), false, "forbidden number leaked");
  }
  for (const n of FORBIDDEN) assert.equal(String(text).includes(n), false);
}

test("system prompt carries the hard rules", () => {
  const prompt = buildSystemPrompt(brand);
  assert.match(prompt, /\(318\) 712-TREE/);
  assert.match(prompt, /318-712-8733/);
  assert.match(prompt, /337-378-4046/);
  assert.match(prompt, /337-405-9945/);
  assert.match(prompt, /Louisiana Licensed Arborist/);
  assert.match(prompt, /Do not say any dollar amount/);
  assert.match(prompt, /once/);
  assert.match(prompt, /At most one natural follow-up/);
  assert.match(prompt, /Never repeat a question/);
  assert.match(prompt, /general knowledge/);
  assert.match(prompt, /Answer the actual question first/);
});

test("off-topic answer is kept and steered back to tree work", async () => {
  let called = 0;
  const turn = await takeTurn({
    messages: [
      { role: "assistant", content: brand.greeting },
      { role: "user", content: "Who do you think will win the Super Bowl?" },
    ],
    brand,
    env: { [LLM_KEY_ENV]: "test-key" },
    callModel: async () => {
      called += 1;
      return "I'd lean Kansas City. They've looked sharp.";
    },
  });
  assert.equal(called, 1);
  assert.equal(turn.source, "model");
  assert.match(turn.text, /Kansas City/);
  assert.match(turn.text, /tree|quote/i);
  assert.ok((turn.text.match(/\?/g) || []).length <= 1);
  assert.ok(turn.chips.length >= 1 && turn.chips.length <= 3);
  noSecrets(turn.text);
});

test("scripted fallback steers an off-topic question back", async () => {
  let called = 0;
  const turn = await takeTurn({
    messages: [{ role: "user", content: "Who do you think will win the Super Bowl?" }],
    brand,
    env: {},
    callModel: async () => {
      called += 1;
      return "should not run";
    },
  });
  assert.equal(called, 0);
  assert.equal(turn.source, "scripted");
  assert.equal(turn.llm.env, LLM_KEY_ENV);
  assert.equal(turn.llm.reason, "missing_key");
  assert.match(turn.text, /tree|quote/i);
  assert.match(turn.text, /\bAI\b/);
  assert.ok((turn.text.match(/\?/g) || []).length <= 1);
  noSecrets(turn.text);
});

test("an invented price is replaced with the site price policy", async () => {
  const turn = await takeTurn({
    messages: [
      { role: "assistant", content: brand.greeting },
      { role: "user", content: "How much to take down a big oak?" },
    ],
    brand,
    env: { [LLM_KEY_ENV]: "test-key" },
    callModel: async () => "A big oak removal is about $4,500, and we can usually do it next week.",
  });
  assert.equal(turn.text.includes("$"), false);
  assert.equal(turn.text.includes("4,500"), false);
  assert.equal(turn.text.includes("4500"), false);
  assert.match(turn.text, /ballpark|call you back|real price/i);
  assert.ok((turn.text.match(/\?/g) || []).length <= 1);
  assert.ok(turn.chips.some((c) => /trim|removal|quote/i.test(c.label)));
  noSecrets(turn.text);
});

test("scripted price answer uses the site policy and no invented dollars", () => {
  const reply = scriptedReply("How much to take down a big oak?", [], brand);
  const checked = checkOutput(reply.text, {
    brand,
    history: [],
    userMessage: "How much to take down a big oak?",
    isGreeting: true,
  });
  assert.equal(checked.text.includes("$"), false);
  assert.match(checked.text, /ballpark|call you back|real price/i);
  assert.match(checked.text, /\bAI\b/);
  noSecrets(checked.text);
});

test("what's Blake's cell never reveals a private number", async () => {
  const turn = await takeTurn({
    messages: [
      { role: "assistant", content: brand.greeting },
      { role: "user", content: "What's Blake's cell?" },
    ],
    brand,
    env: { [LLM_KEY_ENV]: "test-key" },
    callModel: async () => "Sure, Blake's cell is (337) 378-4046. You can also try 337-405-9945.",
  });
  noSecrets(turn.text);
  assert.equal(containsForbiddenPhone(turn.text, brand), false);
  assert.match(turn.text, /318-712-8733|712-TREE/);
  assert.ok((turn.text.match(/\?/g) || []).length <= 1);
  assert.equal(turn.violations.includes("forbidden_phone"), true);
});

test("scripted cell answer gives only the public number", () => {
  const reply = scriptedReply("What's Blake's cell?", [{ role: "assistant", content: brand.greeting }], brand);
  noSecrets(reply.text);
  assert.match(reply.text, /318-712-8733|712-TREE/);
  assert.match(reply.text, /don't share a personal number/i);
});

test("a dotted private number is still blocked", () => {
  const checked = checkOutput("Try 337.378.4046 today.", {
    brand,
    history: [{ role: "assistant", content: brand.greeting }],
    userMessage: "What's Blake's cell?",
    isGreeting: false,
  });
  noSecrets(checked.text);
  assert.match(checked.text, /318-712-8733/);
});

test("the credential phrase is kept and a second question is dropped", () => {
  const checked = checkOutput(
    "Blake is a licensed contractor. What's your name? What's your phone?",
    {
      brand,
      history: [{ role: "assistant", content: brand.greeting }],
      userMessage: "Is he licensed?",
      isGreeting: false,
    },
  );
  assert.match(checked.text, /Louisiana Licensed Arborist/);
  assert.equal(/licensed contractor/i.test(checked.text), false);
  assert.ok((checked.text.match(/\?/g) || []).length <= 1);
});

test("a question already asked is not asked again", () => {
  const asked = "What's the best number for our team to call?";
  const checked = checkOutput(`You can call ${brand.publicPhone.vanity}. ${asked}`, {
    brand,
    history: [{ role: "assistant", content: asked }],
    userMessage: "Ok",
    isGreeting: false,
  });
  assert.equal(checked.text.includes("?"), false);
  assert.match(checked.text, /712-TREE/);
});

test("AI disclosure is in the greeting and not repeated", async () => {
  const first = await takeTurn({ messages: [], brand, env: {}, callModel: async () => "nope" });
  assert.match(first.text, /I'm Camille, an AI assistant for 3 B's Tree Removal/);
  assert.equal((first.text.match(/\bAI\b/g) || []).length, 1);

  const second = await takeTurn({
    messages: [
      { role: "assistant", content: first.text },
      { role: "user", content: "A pine is leaning toward the house." },
    ],
    brand,
    env: { [LLM_KEY_ENV]: "test-key" },
    callModel: async () => "I'm Camille, an AI assistant for 3 B's Tree Removal. A lean toward the house is a warning. What's your name?",
  });
  assert.equal(/\bAI\b/.test(second.text), false);
  assert.match(second.text, /lean|warning|house/i);
  assert.ok((second.text.match(/\?/g) || []).length <= 1);
});

test("the daily spend kill switch skips the model and names CAMILLE_LLM_KILL_SWITCH", async () => {
  let called = 0;
  const turn = await takeTurn({
    messages: [{ role: "user", content: "A pine is leaning toward the house. What should I do?" }],
    brand,
    env: { [LLM_KEY_ENV]: "test-key", CAMILLE_LLM_KILL_SWITCH: "1" },
    callModel: async () => {
      called += 1;
      return "The model should not run.";
    },
  });
  assert.equal(called, 0);
  assert.equal(turn.source, "scripted");
  assert.equal(turn.llm.ok, false);
  assert.equal(turn.llm.reason, "kill_switch");
  assert.equal(turn.llm.env, "CAMILLE_LLM_KILL_SWITCH");
  assert.match(turn.text, /lean|warning|house/i);
  noSecrets(turn.text);
});

test("per-IP abuse limit blocks the 41st chat in ten minutes", () => {
  const allowed = createIpAbuseLimit();
  const start = 1_700_000_000_000;
  for (let i = 0; i < 40; i += 1) assert.equal(allowed("198.51.100.8", start + i), true);
  assert.equal(allowed("198.51.100.8", start + 40), false);
  assert.equal(allowed("198.51.100.9", start + 40), true);
  assert.equal(allowed("198.51.100.8", start + 10 * 60 * 1000 + 1), true);
});

test("a failed model call uses the scripted flow", async () => {
  const turn = await takeTurn({
    messages: [{ role: "user", content: "Who do you think will win the Super Bowl?" }],
    brand,
    env: { [LLM_KEY_ENV]: "test-key" },
    callModel: async () => {
      throw new Error("down");
    },
  });
  assert.equal(turn.source, "scripted");
  assert.equal(turn.llm.reason, "model_failed");
  assert.equal(turn.llm.env, undefined);
  assert.match(turn.text, /tree|quote/i);
});

test("the page does not ship the private numbers or the old widget", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  const widget = readFileSync(new URL("./js/gg-widget.js", import.meta.url), "utf8");
  noSecrets(html);
  noSecrets(widget);
  assert.equal(/elevenlabs/i.test(html), false);
  assert.match(html, /id="gg-panel"/);
});
