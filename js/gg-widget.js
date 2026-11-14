/* Camille chat launcher. The reply comes from POST /api/chat on this server.
   If that request fails, a one-line fallback stays on the public number. */
(function () {
  const TALK_DELAY_MS = 1500;
  const TALK_HOLD_MS = 5000;
  const TALK_FADE_MS = 450;
  const widget = document.getElementById("gg-widget");
  const talk = document.getElementById("gg-talk");
  const ask = document.getElementById("gg-ask");
  const launcher = document.getElementById("gg-launcher");
  const dismiss = document.getElementById("gg-talk-dismiss");
  const closeBtn = document.getElementById("gg-close");
  const panel = document.getElementById("gg-panel");
  const log = document.getElementById("gg-log");
  const chipRow = document.getElementById("gg-panel-chips");
  const form = document.getElementById("gg-form");
  const input = document.getElementById("gg-input");
  if (!widget || !launcher || !panel || !log || !form || !input) return;

  const messages = [];
  let busy = false;
  let greeted = false;

  function setOpen(open) {
    widget.classList.toggle("is-open", open);
    document.body.classList.toggle("gg-chat-open", open);
    launcher.setAttribute("aria-expanded", open ? "true" : "false");
    panel.hidden = !open;
    if (open) {
      hideTalk();
      if (!greeted) loadGreeting();
      window.setTimeout(function () { input.focus(); }, 50);
    }
  }

  let talkTimer = 0;
  function pastHero() {
    const hero = document.querySelector(".hero");
    if (!hero) return false;
    return hero.getBoundingClientRect().bottom <= 0;
  }
  function hideTalk() {
    if (talkTimer) { window.clearTimeout(talkTimer); talkTimer = 0; }
    if (!talk) return;
    talk.hidden = true;
    talk.classList.remove("is-fading");
  }
  function fadeTalk() {
    if (!talk || talk.hidden || talk.classList.contains("is-fading")) return;
    if (talkTimer) { window.clearTimeout(talkTimer); talkTimer = 0; }
    talk.classList.add("is-fading");
    talkTimer = window.setTimeout(hideTalk, TALK_FADE_MS);
  }
  function showTalk() {
    if (!talk || widget.classList.contains("is-open") || pastHero()) return;
    talk.classList.remove("is-fading");
    talk.hidden = false;
    if (talkTimer) window.clearTimeout(talkTimer);
    talkTimer = window.setTimeout(fadeTalk, TALK_HOLD_MS);
  }

  function addBubble(role, text) {
    const p = document.createElement("p");
    p.className = role === "user" ? "gg-msg gg-msg-user" : "gg-msg";
    p.textContent = text;
    log.appendChild(p);
    log.scrollTop = log.scrollHeight;
  }

  function renderChips(chips) {
    if (!chipRow) return;
    chipRow.textContent = "";
    (chips || []).forEach(function (chip) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "gg-chip";
      btn.textContent = chip.label;
      btn.addEventListener("click", function () {
        if (chip.action === "quote") {
          hideTalk();
          window.scrollTo({ top: 0, behavior: "smooth" });
          const addr = document.getElementById("address");
          if (addr) window.setTimeout(function () { addr.focus(); }, 400);
          return;
        }
        if (chip.action === "call") {
          window.location.href = "tel:+13187128733";
          return;
        }
        send(chip.send || chip.label);
      });
      chipRow.appendChild(btn);
    });
  }

  function localFallback() {
    return "I hit a snag. You can start your quote up top, or call (318) 712-TREE.";
  }

  async function askServer() {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: messages }),
    });
    if (!res.ok) throw new Error("chat");
    const data = await res.json();
    if (!data || !data.text) throw new Error("chat");
    return data;
  }

  async function loadGreeting() {
    greeted = true;
    busy = true;
    try {
      const data = await askServer();
      messages.push({ role: "assistant", content: data.text });
      addBubble("assistant", data.text);
      renderChips(data.chips);
    } catch {
      const text = localFallback();
      messages.push({ role: "assistant", content: text });
      addBubble("assistant", text);
    }
    busy = false;
  }

  async function send(text) {
    const value = String(text || "").trim();
    if (!value || busy) return;
    if (!widget.classList.contains("is-open")) setOpen(true);
    busy = true;
    input.value = "";
    messages.push({ role: "user", content: value });
    addBubble("user", value);
    renderChips([]);
    try {
      const data = await askServer();
      messages.push({ role: "assistant", content: data.text });
      addBubble("assistant", data.text);
      renderChips(data.chips);
    } catch {
      const fallback = localFallback();
      messages.push({ role: "assistant", content: fallback });
      addBubble("assistant", fallback);
    }
    busy = false;
  }

  function openAgent() { setOpen(true); }
  function closeAgent() {
    setOpen(false);
    launcher.focus({ preventScroll: true });
  }

  launcher.addEventListener("click", function () {
    if (widget.classList.contains("is-open")) closeAgent();
    else openAgent();
  });
  if (closeBtn) closeBtn.addEventListener("click", closeAgent);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && widget.classList.contains("is-open")) closeAgent();
  });
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    send(input.value);
  });

  if (dismiss) {
    dismiss.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      hideTalk();
    });
  }
  if (ask) {
    ask.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      openAgent();
    });
  }
  widget.querySelectorAll("[data-gg-open]").forEach(function (chip) {
    chip.addEventListener("click", function (event) {
      event.preventDefault();
      openAgent();
    });
  });
  widget.querySelectorAll("[data-gg-quote]").forEach(function (chip) {
    chip.addEventListener("click", function (event) {
      event.preventDefault();
      hideTalk();
      window.scrollTo({ top: 0, behavior: "smooth" });
      const addr = document.getElementById("address");
      if (addr) setTimeout(function () { addr.focus(); }, 400);
    });
  });

  if (window.matchMedia("(min-width: 640px)").matches) {
    window.setTimeout(showTalk, TALK_DELAY_MS);
    function onScrollPast() { if (pastHero()) fadeTalk(); }
    window.addEventListener("scroll", onScrollPast, { passive: true });
    const hero = document.querySelector(".hero");
    if (hero && "IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        const e = entries[0];
        if (e && e.boundingClientRect.bottom <= 0) fadeTalk();
      }).observe(hero);
    }
  }

  function quotePhase() {
    const quote = document.getElementById("quote");
    if (!quote || quote.hidden) return "hero";
    const contact = document.getElementById("step-contact");
    if (contact && contact.classList.contains("is-sent")) return "thanks";
    const photos = document.getElementById("step-photos");
    if (photos && !photos.hidden) return "photos";
    if (contact && !contact.hidden) return "contact";
    return "property";
  }
  function syncFunnel() {
    const quote = document.getElementById("quote");
    const on = !!(quote && !quote.hidden);
    const phase = quotePhase();
    const steps = on && (phase === "property" || phase === "photos" || phase === "contact");
    const thanks = on && phase === "thanks";
    document.body.classList.toggle("gg-funnel", on);
    document.body.classList.toggle("gg-quote-steps", steps);
    document.body.classList.toggle("gg-thanks", thanks);
    document.body.setAttribute("data-quote-phase", on ? phase : "hero");
    const card = document.getElementById("quote-card");
    const scope = document.getElementById("scope-panel");
    if (card) card.style.paddingRight = "";
    if (scope) { scope.style.paddingRight = ""; scope.style.marginRight = ""; }
    if (ask) ask.hidden = !thanks;
    if (steps && widget.classList.contains("is-open")) closeAgent();
  }
  const quoteCard = document.getElementById("quote-card");
  if (quoteCard && "IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      document.body.classList.toggle("gg-quote-in-view", entries.some(function (e) { return e.isIntersecting; }));
    }).observe(quoteCard);
  }
  const quoteSection = document.getElementById("quote");
  if (quoteSection && typeof MutationObserver === "function") {
    new MutationObserver(syncFunnel).observe(quoteSection, { attributes: true, attributeFilter: ["hidden"] });
  }
  window.addEventListener("resize", syncFunnel);
  ["step-property", "step-photos", "step-contact"].forEach(function (id) {
    const el = document.getElementById(id);
    if (el && typeof MutationObserver === "function") {
      new MutationObserver(syncFunnel).observe(el, { attributes: true, attributeFilter: ["hidden", "class"] });
    }
  });
  syncFunnel();
})();
