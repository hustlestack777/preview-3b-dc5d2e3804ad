/* Shared chat core: code-side output checks.
   The model is asked to follow the system prompt. This module still rewrites
   the reply so a bad completion cannot show a forbidden number, an invented
   price, a swapped credential, a second question, a repeated question, or a
   second AI disclosure. */

const PHONE_RE = /(?:\+?1[\s.\-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/g;
const MONEY_RE = /\$\s?\d[\d,]*(?:\.\d{2})?|\b\d{2,5}\s+dollars\b/gi;

export function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

export function publicDigits(brand) {
  return digitsOnly(brand.publicPhone.digits);
}

export function forbiddenDigitList(brand) {
  return (brand.forbiddenPhones || []).map(digitsOnly).filter(Boolean);
}

export function containsForbiddenPhone(text, brand) {
  const digits = digitsOnly(text);
  return forbiddenDigitList(brand).some((n) => n && digits.includes(n));
}

function phoneLine(brand) {
  return `${brand.publicPhone.vanity} (${brand.publicPhone.digits})`;
}

function replacePhones(text, brand) {
  const allowed = publicDigits(brand);
  const forbidden = forbiddenDigitList(brand);
  return text.replace(PHONE_RE, (match) => {
    const digits = digitsOnly(match);
    const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
    if (national === allowed) return match;
    if (forbidden.some((n) => national === n || digits.includes(n))) return phoneLine(brand);
    return phoneLine(brand);
  });
}

function moneyIsAllowed(sentence, brand) {
  const allowed = brand.prices || [];
  if (!allowed.length) return false;
  return allowed.some((price) => sentence.includes(price));
}

function scrubPrices(text, brand) {
  MONEY_RE.lastIndex = 0;
  if (!MONEY_RE.test(text)) return { text, hit: false };
  const kept = [];
  let hit = false;
  for (const sentence of splitSentences(text)) {
    MONEY_RE.lastIndex = 0;
    if (MONEY_RE.test(sentence) && !moneyIsAllowed(sentence, brand)) {
      hit = true;
      continue;
    }
    kept.push(sentence);
  }
  if (!hit) return { text, hit: false };
  const policy = brand.pricePolicy;
  const body = kept.join(" ").trim();
  const next = body && !body.includes(policy) ? `${body.replace(/[.\s]+$/, "")}. ${policy}` : (body || policy);
  return { text: next.replace(/\s{2,}/g, " ").trim(), hit: true };
}

function scrubCredential(text, brand) {
  const phrase = brand.credential;
  if (!phrase) return { text, hit: false };
  let out = text;
  let hit = false;
  if (/licensed contractor/i.test(out)) {
    out = out.replace(/licensed contractor/gi, phrase);
    hit = true;
  }
  out = out.replace(/LDAF licensed arborist/gi, () => {
    hit = true;
    return phrase;
  });
  out = out.replace(/\blicensed arborist\b/gi, (m) => {
    if (m === phrase) return m;
    hit = true;
    return phrase;
  });
  const sentences = splitSentences(out).map((sentence) => {
    if (/\b(dirt|skid|lot clearing|land clearing)\b/i.test(sentence) && /\b(licensed|arborist|LDAF)\b/i.test(sentence)) {
      hit = true;
      return sentence
        .replace(new RegExp(escapeReg(phrase), "g"), "the crew")
        .replace(/\b(LDAF|licensed|arborist)\b/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim();
    }
    return sentence;
  });
  out = sentences.filter(Boolean).join(" ");
  if (/\b(arborist|LDAF)\b/i.test(out) && !out.includes(phrase)) {
    hit = true;
    out = `${out.replace(/[.?\s]+$/, "")}. ${phrase}.`;
  }
  return { text: out, hit };
}

function scrubNeverSay(text, brand) {
  let out = text;
  let hit = false;
  for (const phrase of brand.neverSay || []) {
    const re = new RegExp(escapeReg(phrase), "gi");
    if (re.test(out)) {
      hit = true;
      out = out.replace(re, "");
    }
  }
  if (/\bfree\b/i.test(out) && !/\bfeel free\b/i.test(out)) {
    hit = true;
    out = out.replace(/\bfree\b/gi, "");
  }
  out = out.replace(/\s{2,}/g, " ").replace(/\s+([,.!?])/g, "$1").trim();
  return { text: out, hit };
}

function disclosureSentence(brand) {
  return String(brand.disclosure || "").trim();
}

function applyDisclosure(text, brand, isGreeting) {
  const disclosure = disclosureSentence(brand);
  if (!disclosure) return { text, hit: false };
  const has = text.includes(disclosure) || /\bAI\b/.test(text);
  if (isGreeting) {
    if (text.includes(disclosure)) return { text, hit: false };
    return { text: `${disclosure} ${text}`.replace(/\s{2,}/g, " ").trim(), hit: true };
  }
  if (!has) return { text, hit: false };
  let out = text.split(disclosure).join("");
  out = out.replace(/[^.?!]*\bI(?:'m| am) an AI\b[^.?!]*[.?!]?/gi, "");
  out = out.replace(/\s{2,}/g, " ").trim();
  return { text: out, hit: true };
}

export function splitSentences(text) {
  return String(text || "")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function normalizeQuestion(sentence) {
  return String(sentence || "")
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/\bwhat's\b/g, "what is")
    .replace(/\bwhat's\b/g, "what is")
    .replace(/\bi'm\b/g, "i am")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function questionsIn(text) {
  return splitSentences(text).filter((s) => s.includes("?"));
}

export function priorQuestions(history) {
  const found = [];
  for (const message of history || []) {
    if (message.role !== "assistant") continue;
    for (const q of questionsIn(message.content || "")) found.push(normalizeQuestion(q));
  }
  return new Set(found.filter(Boolean));
}

function limitQuestions(text, history) {
  const asked = priorQuestions(history);
  const parts = splitSentences(text);
  let kept = false;
  let hit = false;
  const next = [];
  for (const sentence of parts) {
    if (!sentence.includes("?")) {
      next.push(sentence);
      continue;
    }
    const key = normalizeQuestion(sentence);
    if (asked.has(key) || kept) {
      hit = true;
      const statement = sentence.replace(/\?/g, ".").replace(/\.+$/, ".");
      if (!asked.has(key)) next.push(statement);
      continue;
    }
    kept = true;
    next.push(sentence);
  }
  return { text: next.join(" ").replace(/\s{2,}/g, " ").trim(), hit };
}

export function isOffTopic(userMessage) {
  const text = String(userMessage || "").trim();
  if (!text) return false;
  if (/^(hi|hello|hey|thanks|thank you|ok|okay|good morning|good afternoon)\b/i.test(text) && text.length < 48) {
    return false;
  }
  return !/\b(tree|trees|stump|stumps|limb|limbs|branch|branches|oak|pine|storm|hurricane|wind|yard|quote|price|cost|how much|trim|trimming|prun|remov|grind|dirt|skid|clearing|arborist|blake|camille|phone|call|number|address|photo|photos|pitkin|louisiana|house|roof|lean|falling|fall|dead|rot|root|crack|crew|job)\b/i.test(text);
}

function steer(text, brand, userMessage) {
  if (!isOffTopic(userMessage)) return { text, hit: false };
  const line = String(brand.steerBack || "").replace(/\?+$/, "").trim();
  if (!line) return { text, hit: false };
  if (/\b(tree|quote|yard|stump)\b/i.test(text)) return { text, hit: false };
  return { text: `${text.replace(/[.\s]+$/, "")}. ${line}`.replace(/\s{2,}/g, " ").trim(), hit: true };
}

function escapeReg(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function checkOutput(raw, { brand, history = [], userMessage = "", isGreeting = false } = {}) {
  const violations = [];
  let text = String(raw || "").trim();

  if (containsForbiddenPhone(text, brand)) {
    text = `I don't share a personal number. The number for ${brand.businessName} is ${phoneLine(brand)}.`;
    violations.push("forbidden_phone");
  } else {
    const beforePhones = text;
    text = replacePhones(text, brand);
    if (text !== beforePhones) violations.push("phone");
  }

  const priced = scrubPrices(text, brand);
  text = priced.text;
  if (priced.hit) violations.push("invented_price");

  const credential = scrubCredential(text, brand);
  text = credential.text;
  if (credential.hit) violations.push("credential");

  const banned = scrubNeverSay(text, brand);
  text = banned.text;
  if (banned.hit) violations.push("never_say");

  const disclosed = applyDisclosure(text, brand, isGreeting);
  text = disclosed.text;
  if (disclosed.hit) violations.push(isGreeting ? "disclosure_added" : "disclosure_repeat");

  const questions = limitQuestions(text, history);
  text = questions.text;
  if (questions.hit) violations.push("question_limit");

  const steered = steer(text, brand, userMessage);
  text = steered.text;
  if (steered.hit) violations.push("steer_back");

  text = text.replace(/\s{2,}/g, " ").replace(/\s+([,.!?])/g, "$1").trim();
  if (containsForbiddenPhone(text, brand)) {
    text = `I don't share a personal number. The number for ${brand.businessName} is ${phoneLine(brand)}.`;
    violations.push("forbidden_phone");
  }

  return { text, violations };
}

export function sanitizeChips(chips, brand) {
  const out = [];
  for (const chip of chips || []) {
    if (!chip || !chip.label) continue;
    const label = String(chip.label).trim().slice(0, 48);
    if (!label) continue;
    if (containsForbiddenPhone(label, brand)) continue;
    MONEY_RE.lastIndex = 0;
    if (MONEY_RE.test(label) && !(brand.prices || []).some((p) => label.includes(p))) continue;
    MONEY_RE.lastIndex = 0;
    const next = { label };
    if (chip.action === "quote" || chip.action === "call") next.action = chip.action;
    if (chip.send) next.send = String(chip.send).slice(0, 240);
    out.push(next);
    if (out.length >= 3) break;
  }
  return out;
}
