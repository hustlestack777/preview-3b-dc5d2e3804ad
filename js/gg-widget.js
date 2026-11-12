/* Camille full-torso chat launcher for the 3 B's preview.
   Conversation stays on the ElevenLabs preview agent. This file only
   handles the cutout, greeting, and opening/closing the widget. */
(function () {
  const TALK_DELAY_MS = 1500;
  const widget = document.getElementById("gg-widget");
  const talk = document.getElementById("gg-talk");
  const launcher = document.getElementById("gg-launcher");
  const dismiss = document.getElementById("gg-talk-dismiss");
  const convai = document.querySelector("elevenlabs-convai");
  const fullSrc = "img/gg/gg-outdoor-auburn.webp";
  if (!widget || !launcher) return;
  let seenPanelOpen = false;

  function setOpen(open) {
    seenPanelOpen = false;
    widget.classList.toggle("is-open", open);
    document.body.classList.toggle("gg-chat-open", open);
    launcher.setAttribute("aria-expanded", open ? "true" : "false");
    if (talk) talk.hidden = open ? true : talk.hidden;
    if (open) {
      hideTalk();
      loadFullCutout();
    }
  }

  function loadFullCutout() {
    const img = widget.querySelector(".gg-cutout");
    if (!img || img.getAttribute("data-full-loaded") === "1") return;
    if (window.matchMedia("(min-width: 640px)").matches) return; // desktop already uses the full source
    const probe = new Image();
    probe.decoding = "async";
    probe.onload = function () {
      img.src = fullSrc;
      img.setAttribute("data-full-loaded", "1");
    };
    probe.src = fullSrc;
  }

  function hideTalk() {
    if (!talk) return;
    talk.hidden = true;
  }

  function showTalk() {
    if (!talk || widget.classList.contains("is-open")) return;
    talk.hidden = false;
  }

  function findConvaiButton() {
    if (!convai) return null;
    const sr = convai.shadowRoot;
    if (!sr) return convai;
    return (
      sr.querySelector("button[aria-label], button, [role='button']") || convai
    );
  }

  function openAgent() {
    setOpen(true);
    const btn = findConvaiButton();
    if (btn && typeof btn.click === "function") btn.click();
  }

  function closeAgent() {
    setOpen(false);
  }

  launcher.addEventListener("click", function () {
    if (widget.classList.contains("is-open")) closeAgent();
    else openAgent();
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

  // On phones the compact launcher stays clear of the address field,
  // Get started button, and trust chips. The greeting bubble is desktop-only.
  if (window.matchMedia("(min-width: 640px)").matches) {
    window.setTimeout(showTalk, TALK_DELAY_MS);
  }


  // When the official widget closes, drop our open state. When it shows a
  // typing/listening indicator, nod.
  function watchAgent() {
    if (!convai || !convai.shadowRoot) return false;
    const sr = convai.shadowRoot;
    // Only drop our open state after the chat panel has actually been seen
    // open. The widget first shows its terms sheet, which these selectors do
    // not match; closing on that frame shrank the widget to nothing on phones.
    const mo = new MutationObserver(function () {
      const panel =
        sr.querySelector('[role="dialog"], [class*="panel"], [class*="Sheet"], [class*="chat"]');
      const open =
        !!panel &&
        panel.getAttribute("aria-hidden") !== "true" &&
        getComputedStyle(panel).display !== "none" &&
        getComputedStyle(panel).visibility !== "hidden";
      if (open) seenPanelOpen = true;
      if (!open && seenPanelOpen && widget.classList.contains("is-open")) {
        seenPanelOpen = false;
        setOpen(false);
      }
      const typing = sr.querySelector(
        '[class*="typing"], [class*="Typing"], [aria-label*="typing" i], [class*="listening"]',
      );
      widget.classList.toggle("is-typing", !!(open && typing));
    });
    mo.observe(sr, { childList: true, subtree: true, attributes: true });
    return true;
  }

  if (convai) {
    if (!watchAgent()) {
      const ready = function () {
        if (watchAgent()) convai.removeEventListener("elevenlabs-convai-ready", ready);
      };
      convai.addEventListener("elevenlabs-convai-ready", ready);
      customElements.whenDefined("elevenlabs-convai").then(function () {
        window.setTimeout(watchAgent, 300);
      });
    }
  }
})();
