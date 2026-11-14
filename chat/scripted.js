/* Scripted quote flow. Used when the model is not configured or the call fails.
   One follow-up, no repeated question, site facts only. */

import { isOffTopic } from "../chat-core/guardrails.js";

const JOB_Q = "Is it a trim, a whole tree removal, stumps, or storm cleanup?";
const NAME_Q = "What name should we put on the quote?";
const PHONE_Q = "What's the best number for our team to call?";
const ADDRESS_Q = "What's the address of the property?";

function lastAssistant(history) {
  for (let i = (history || []).length - 1; i >= 0; i -= 1) {
    if (history[i].role === "assistant") return history[i].content || "";
  }
  return "";
}

function asked(history, question) {
  return (history || []).some((m) => m.role === "assistant" && (m.content || "").includes(question.replace(/\?$/, "")));
}

function jobFrom(text) {
  const t = text.toLowerCase();
  if (/\bstump/.test(t)) return "stump grinding";
  if (/\bstorm|hurricane|limb/.test(t) && /\b(down|damage|fell|fallen|knocked)\b/.test(t)) return "storm cleanup";
  if (/\b(trim|trimming|prun)/.test(t)) return "trimming";
  if (/\b(remov|take down|cut down|whole tree)\b/.test(t)) return "whole tree removal";
  if (/\bdirt|skid|lot clearing|land clearing\b/.test(t)) return "dirt work";
  if (/\bstorm|hurricane\b/.test(t)) return "storm cleanup";
  return "";
}

function nameFrom(text, history) {
  const named = text.match(/\bmy name is\s+([A-Za-z][A-Za-z' -]{1,40})/i);
  if (named) return named[1].trim();
  if (asked(history, NAME_Q) && /^[A-Za-z][A-Za-z' -]{1,40}$/.test(text.trim()) && !text.includes("?")) {
    return text.trim();
  }
  return "";
}

function phoneFrom(text, brand) {
  const matches = String(text).match(/(?:\+?1[\s.\-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/g) || [];
  const pub = String(brand.publicPhone.digits || "").replace(/\D/g, "");
  for (const match of matches) {
    let digits = match.replace(/\D/g, "");
    if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
    if (digits.length === 10 && digits !== pub) return digits;
  }
  return "";
}

function addressFrom(text, history) {
  if (/\d{1,6}\s+[A-Za-z0-9.' ]+\s+(st|street|rd|road|ave|avenue|dr|drive|ln|lane|hwy|highway|blvd|way|court|ct)\b/i.test(text)) {
    return text.trim();
  }
  if (asked(history, ADDRESS_Q) && text.trim().length > 6 && !text.includes("?")) return text.trim();
  return "";
}

function collected(history, latest, brand) {
  const users = (history || []).filter((m) => m.role === "user").map((m) => m.content || "");
  if (latest && users[users.length - 1] !== latest) users.push(latest);
  const blob = users.join("\n");
  return {
    job: jobFrom(blob),
    name: nameFrom(latest || "", history) || nameFrom(blob, history),
    phone: phoneFrom(blob, brand),
    address: addressFrom(latest || "", history) || addressFrom(blob, history),
  };
}

function siteAnswer(text, brand) {
  const t = text.toLowerCase();
  if (/\blean/.test(t)) return "A tree that's started to lean toward the house, garage, or driveway is a warning, not just a quirk of the yard.";
  if (/dead limb|branches dropping|limbs falling/.test(t)) return "Branches dropping in calm weather often mean there's more dead wood waiting above.";
  if (/hollow|rot|fungus|cavit/.test(t)) return "Cavities, fungus, or soft, decaying wood can weaken a tree from the inside.";
  if (/\broot/.test(t)) return "Heaving soil or exposed, lifting roots can mean the tree is losing its hold.";
  if (/crack|split/.test(t)) return "Vertical splits in the trunk are a structural red flag, especially after storms.";
  if (/\bstump/.test(t)) return "We grind stumps below grade so the yard can be used again. Stumps are quoted when we call you back.";
  if (/\bstorm|hurricane|wind/.test(t)) return "We do storm cleanup for downed limbs and storm-damaged trees. That work is quoted when we call you back.";
  if (/\b(trim|trimming|prun)/.test(t)) return "Professional trimming is pruning for health, clearance, and a cleaner look. Trimming gets a ballpark range after the quote form.";
  if (/\b(remov|take down|cut down)/.test(t)) return "Hazardous tree removal is taking down dangerous or unwanted trees, including work near homes. Removals are quoted on the callback.";
  if (/\bdirt|skid|clearing\b/.test(t)) return "We also do skid steer dirt work and lot clearing. That isn't tree-license work, and it's quoted when we call you back.";
  if (/\b(area|where|pitkin|serve)\b/.test(t)) return `${brand.businessName} is based in Pitkin and serves Central and Southwest Louisiana.`;
  if (/\b(who is blake|blake berry|arborist|licensed)\b/.test(t)) return `Blake Berry is a ${brand.credential} for tree work, based in Pitkin.`;
  if (/\b(book|schedule)\b/.test(t)) return "This page never books the job. We take the quote request and the team calls you back.";
  if (/\bphoto/.test(t)) return "Photos help. Add them on the quote form on this page. Please don't text them.";
  return "";
}

function isCellAsk(text) {
  return /\bblake\b/i.test(text) && /\b(cell|personal|private|mobile|his number|phone number)\b/i.test(text);
}

function isPriceAsk(text) {
  return /\b(how much|price|cost|ballpark|estimate|charge|\$)\b/i.test(text);
}

function nextQuestion(info, history) {
  const steps = [
    [!info.job, JOB_Q],
    [!info.name, NAME_Q],
    [!info.phone, PHONE_Q],
    [!info.address, ADDRESS_Q],
  ];
  for (const [missing, question] of steps) {
    if (missing && !asked(history, question)) return question;
  }
  return "";
}

function chips(kind, brand) {
  const call = { label: `Call ${brand.publicPhone.vanity}`, action: "call" };
  const quote = { label: "Start my quote", action: "quote" };
  if (kind === "price") {
    return [
      { label: "Trimming", send: "It's trimming." },
      { label: "Whole tree removal", send: "It's a whole tree removal." },
      quote,
    ];
  }
  if (kind === "cell") return [call, quote];
  if (kind === "off") {
    return [
      { label: "A tree question", send: "I have a tree question." },
      quote,
    ];
  }
  if (kind === "job") {
    return [
      { label: "Trimming", send: "It's trimming." },
      { label: "Removal", send: "It's a whole tree removal." },
      { label: "Storm cleanup", send: "A storm knocked limbs down." },
    ];
  }
  return [quote, { label: "Storm damage", send: "A storm knocked limbs down." }, call];
}

export function scriptedReply(userMessage, history, brand) {
  const text = String(userMessage || "").trim();
  const prior = lastAssistant(history);
  if (!text && !prior) {
    return { text: brand.greeting, chips: chips("greet", brand) };
  }

  if (isCellAsk(text)) {
    return {
      text: `I don't share a personal number. The number for ${brand.businessName} is ${brand.publicPhone.vanity} (${brand.publicPhone.digits}).`,
      chips: chips("cell", brand),
    };
  }

  const info = collected(history, text, brand);
  const follow = nextQuestion(info, history);

  if (isPriceAsk(text)) {
    const answer = `${siteAnswer(text, brand) || "I can tell you how pricing works."} ${brand.pricePolicy}`.replace(/\s{2,}/g, " ");
    return {
      text: follow ? `${answer} ${follow}` : answer,
      chips: chips("price", brand),
    };
  }

  if (isOffTopic(text)) {
    const answer = "I don't want to guess at that, so I won't. I can help with the tree work and getting a quote started.";
    const q = follow && follow === JOB_Q ? follow : (asked(history, JOB_Q) ? "" : "");
    const line = q ? `${answer} ${q}` : `${answer} ${brand.steerBack}`;
    return { text: line.replace(/\s{2,}/g, " "), chips: chips("off", brand) };
  }

  const known = siteAnswer(text, brand);
  if (!follow) {
    const thanks = known
      ? known
      : `Thanks${info.name ? `, ${info.name}` : ""}. Use the quote form up top for ${info.address || "the address"}, add photos if you have them, and the team will call you back at the number you gave. The shop number is ${brand.publicPhone.vanity}.`;
    return { text: thanks, chips: chips("greet", brand) };
  }

  const lead = known || (text ? "Happy to help with that." : brand.greeting);
  return {
    text: `${lead} ${follow}`.replace(/\s{2,}/g, " "),
    chips: follow === JOB_Q ? chips("job", brand) : chips("greet", brand),
  };
}
