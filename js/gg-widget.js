/* Camille chat for 3 B's. The conversation is our own panel, backed by
   POST /api/camille-chat on this site. This file handles the launcher,
   the greeting, the 44px close X, and the sheet placement. */
(function () {
  const TALK_DELAY_MS = 1500;
  const TALK_HOLD_MS = 5000;
  const TALK_FADE_MS = 450;
  const GREETING = "Hi, I’m Camille. Enter your address up top for an InstaQuote, or ask me anything.";
  const widget = document.getElementById("gg-widget");
  const talk = document.getElementById("gg-talk");
  const ask = document.getElementById("gg-ask");
  const launcher = document.getElementById("gg-launcher");
  const dismiss = document.getElementById("gg-talk-dismiss");
  const closeBtn = document.getElementById("gg-close");
  const panel = document.getElementById("gg-panel");
  const log = document.getElementById("gg-log");
  const form = document.getElementById("gg-compose");
  const input = document.getElementById("gg-input");
  if (!widget || !launcher) return;

  const history = [{ role: "assistant", content: GREETING }];
  let sending = false;

  function pageSrc() {
    const src = window.CamilleSrc && window.CamilleSrc.current && window.CamilleSrc.current.page_src;
    if (src) return src;
    return (panel && panel.getAttribute("data-page-src")) || "";
  }

  function addLine(role, text) {
    if (!log) return;
    const p = document.createElement("p");
    p.className = "gg-msg " + (role === "user" ? "gg-msg-user" : "gg-msg-assistant");
    p.textContent = text;
    log.appendChild(p);
    log.scrollTop = log.scrollHeight;
  }

  function placeClose() {
    if (!closeBtn || closeBtn.hidden || !panel) return;
    const r = panel.getBoundingClientRect();
    if (!r || !r.width) return;
    const viewW = window.visualViewport ? window.visualViewport.width : window.innerWidth;
    const edge = Math.min(r.right, viewW);
    closeBtn.style.bottom = "auto";
    closeBtn.style.right = "auto";
    closeBtn.style.top = Math.round(Math.max(8, r.top + 8)) + "px";
    closeBtn.style.left = Math.round(Math.max(8, Math.min(edge - 54, viewW - 52))) + "px";
  }
  function syncViewport() {
    const vv = window.visualViewport;
    if (vv) {
      const bottom = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      document.documentElement.style.setProperty("--vv-bottom", bottom + "px");
      document.documentElement.style.setProperty("--vv-height", Math.round(vv.height) + "px");
    }
    requestAnimationFrame(placeClose);
  }
  function placeCloseSoon() {
    [0, 120, 300, 600, 1200].forEach(function (t) { setTimeout(placeClose, t); });
  }
  window.addEventListener("resize", syncViewport);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", syncViewport);
    window.visualViewport.addEventListener("scroll", syncViewport);
  }
  syncViewport();

  function setOpen(open) {
    widget.classList.toggle("is-open", open);
    document.body.classList.toggle("gg-chat-open", open);
    launcher.setAttribute("aria-expanded", open ? "true" : "false");
    if (panel) panel.hidden = !open;
    if (closeBtn) closeBtn.hidden = !open;
    if (open) {
      hideTalk();
      placeCloseSoon();
      if (input) setTimeout(function () { input.focus({ preventScroll: true }); }, 50);
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

  function openAgent() {
    setOpen(true);
  }
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

  if (form) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      const text = input ? input.value.trim() : "";
      if (!text || sending) return;
      if (input) input.value = "";
      history.push({ role: "user", content: text });
      addLine("user", text);
      sending = true;
      if (input) input.disabled = true;
      fetch("/api/camille-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.slice(-16), pageSrc: pageSrc() }),
      }).then(function (res) {
        return res.json().catch(function () { return {}; });
      }).then(function (data) {
        const reply = (data && data.reply) || "Call (318) 712-TREE or start your InstaQuote up top.";
        history.push({ role: "assistant", content: reply });
        addLine("assistant", reply);
      }).catch(function () {
        const reply = "Sorry, chat's having trouble. Call (318) 712-TREE or start your InstaQuote up top.";
        history.push({ role: "assistant", content: reply });
        addLine("assistant", reply);
      }).then(function () {
        sending = false;
        if (input) {
          input.disabled = false;
          input.focus({ preventScroll: true });
        }
      });
    });
  }

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
