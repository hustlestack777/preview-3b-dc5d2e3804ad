/* Camille chat for 3 B's. The conversation stays on the ElevenLabs agent; this file
   handles the 64px launcher, the greeting, our own 44px close X, and restyles the
   ElevenLabs sheet: 380x560 on desktop, full-width bottom sheet under 480px, and
   no orb circle. */
(function () {
  const TALK_DELAY_MS = 1500;
  const widget = document.getElementById("gg-widget");
  const talk = document.getElementById("gg-talk");
  const launcher = document.getElementById("gg-launcher");
  const dismiss = document.getElementById("gg-talk-dismiss");
  const closeBtn = document.getElementById("gg-close");
  const convai = document.querySelector("elevenlabs-convai");
  if (!widget || !launcher) return;

  const SHEET_CSS = `
    .sheet {
      position: fixed !important; top: auto !important; left: auto !important;
      right: 16px !important; bottom: 16px !important;
      width: 380px !important; max-width: calc(100vw - 32px) !important;
      height: min(560px, calc(100dvh - 32px)) !important; max-height: none !important;
      border-radius: 18px !important; box-shadow: 0 18px 50px rgba(0,0,0,.45) !important;
      pointer-events: auto !important;
      margin: 0 !important; translate: none !important; scale: none !important; transform: none !important;
    }
    .sheet::before {
      content: "Camille \\00B7  3 B\\2019s Tree Removal"; position: absolute; top: 20px; left: 18px; z-index: 30;
      font: 700 15px/1.2 "DM Sans", system-ui, sans-serif; color: #1A1A1A;
    }
    @media (max-width: 479px) {
      .sheet {
        right: 0 !important; left: 0 !important; bottom: 0 !important;
        width: 100% !important; max-width: none !important;
        height: min(560px, 85dvh) !important; border-radius: 18px 18px 0 0 !important;
      }
    }
    canvas, .rounded-full.bg-base-border, .rounded-full.overflow-hidden { display: none !important; }
    button[aria-label="Expand widget"], button[aria-label="Collapse"], .rounded-compact-sheet { display: none !important; }
    .overlay { pointer-events: none !important; transform: none !important; filter: none !important; contain: none !important; will-change: auto !important; }
    .overlay > p { display: none !important; }
  `;

  function styleShadow() {
    const sr = convai && convai.shadowRoot;
    if (!sr || sr.getElementById("gg-sheet-style")) return !!sr;
    const st = document.createElement("style");
    st.id = "gg-sheet-style";
    st.textContent = SHEET_CSS;
    sr.appendChild(st);
    let raf = 0;
    new MutationObserver(function () {
      if (raf) return;
      raf = requestAnimationFrame(function () { raf = 0; placeClose(); });
    }).observe(sr, { childList: true, subtree: true });
    return true;
  }

  function sheetOpen() {
    const sr = convai && convai.shadowRoot;
    const sheet = sr && sr.querySelector(".sheet");
    if (!sheet) return false;
    const r = sheet.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  // Pin our 44px X to the sheet's top-right corner, wherever the sheet ends up.
  function placeClose() {
    if (!closeBtn || closeBtn.hidden) return;
    const sr = convai && convai.shadowRoot;
    const sheet = sr && sr.querySelector(".sheet");
    let r = sheet && sheet.getBoundingClientRect();
    let above = false;
    if (!r || !r.width) {
      // First open shows the Terms box (Cancel / Accept): put the X just above it.
      const terms = sr && sr.querySelector('.overlay > div[class*="max-w-"]');
      r = terms && terms.getBoundingClientRect();
      above = true;
    }
    if (!r || !r.width) { closeBtn.style.top = ""; closeBtn.style.left = ""; closeBtn.style.bottom = ""; closeBtn.style.right = ""; return; }
    closeBtn.style.bottom = "auto";
    closeBtn.style.right = "auto";
    closeBtn.style.top = Math.round(above ? Math.max(8, r.top - 52) : r.top + 10) + "px";
    closeBtn.style.left = Math.round(Math.min(r.right, window.innerWidth) - (above ? 44 : 54)) + "px";
  }
  function placeCloseSoon() {
    [0, 120, 300, 600, 1200].forEach(function (t) { setTimeout(placeClose, t); });
  }
  window.addEventListener("resize", placeClose);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", placeClose);

  function setOpen(open) {
    widget.classList.toggle("is-open", open);
    document.body.classList.toggle("gg-chat-open", open);
    launcher.setAttribute("aria-expanded", open ? "true" : "false");
    if (closeBtn) closeBtn.hidden = !open;
    if (open) { hideTalk(); placeCloseSoon(); }
  }

  function hideTalk() { if (talk) talk.hidden = true; }
  function showTalk() {
    if (!talk || widget.classList.contains("is-open")) return;
    talk.hidden = false;
  }

  function findConvaiButton() {
    const sr = convai && convai.shadowRoot;
    if (!sr) return null;
    return sr.querySelector("button[aria-label], button, [role='button']");
  }

  function openAgent() {
    styleShadow();
    setOpen(true);
    if (sheetOpen()) return; // already expanded; don't toggle it shut
    const btn = findConvaiButton();
    if (btn && typeof btn.click === "function") btn.click();
    setTimeout(styleShadow, 300);
    placeCloseSoon();
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

  if (dismiss) {
    dismiss.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      hideTalk();
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

  // Greeting bubble is desktop-only (phones just get the small launcher).
  if (window.matchMedia("(min-width: 640px)").matches) {
    window.setTimeout(showTalk, TALK_DELAY_MS);
  }

  // Phones: tuck Camille away while a field, list or select is in use, so she
  // never sits on top of what they're typing or picking.
  const phone = window.matchMedia("(max-width: 900px)");
  function isField(el) {
    return el && el.matches && el.matches("input:not([type=checkbox]):not([type=radio]):not([type=file]), select, textarea");
  }
  document.addEventListener("focusin", function (e) {
    if (phone.matches && isField(e.target)) document.body.classList.add("gg-field-focus");
  });
  document.addEventListener("focusout", function (e) {
    if (isField(e.target)) setTimeout(function () {
      if (!isField(document.activeElement)) document.body.classList.remove("gg-field-focus");
    }, 120);
  });

  if (convai) {
    if (!styleShadow()) {
      customElements.whenDefined("elevenlabs-convai").then(function () {
        window.setTimeout(styleShadow, 300);
      });
    }
  }
})();
