(function () {
  const cfg = window.SITE_CONFIG;
  if (!cfg) return;

  document.querySelectorAll("[data-brand]").forEach((el) => {
    el.textContent = cfg.businessName;
  });
  document.querySelectorAll("[data-brand-short]").forEach((el) => {
    el.textContent = cfg.businessNameShort;
  });
  document.querySelectorAll("[data-phone-display]").forEach((el) => {
    el.textContent = cfg.phoneDisplay;
  });
  document.querySelectorAll("[data-phone-tel]").forEach((el) => {
    el.setAttribute("href", "tel:" + cfg.phoneTel);
  });
  const areaLabel = document.querySelector("[data-area-label]");
  if (areaLabel) areaLabel.textContent = cfg.serviceAreaLabel;
  const areaNote = document.querySelector("[data-area-note]");
  if (areaNote) areaNote.textContent = cfg.serviceAreaNote;
  const towns = document.querySelector("[data-towns]");
  if (towns) {
    towns.innerHTML = "";
    cfg.towns.forEach((t) => {
      const span = document.createElement("span");
      span.textContent = t;
      towns.appendChild(span);
    });
  }

  const toggle = document.querySelector("[data-menu-toggle]");
  const mobile = document.querySelector("[data-mobile-nav]");
  if (toggle && mobile) {
    toggle.addEventListener("click", () => {
      const open = mobile.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    mobile.querySelectorAll("a").forEach((a) => {
      a.addEventListener("click", () => {
        mobile.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }
})();
