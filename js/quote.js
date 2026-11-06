/* Instant tree quote — contact + TCPA required BEFORE price range */
(function () {
  const cfg = window.SITE_CONFIG;
  if (!cfg) return;

  const root = document.getElementById("quote-tool");
  if (!root) return;

  const state = {
    step: 1,
    jobType: "mediumRemoval",
    addOns: [],
    description: "",
    address: "",
    lat: null,
    lon: null,
    displayName: "",
    photos: [],
    name: "",
    phone: "",
    email: "",
    consent: false,
    mapsReady: false,
    skipPhotos: false
  };

  const panels = {
    1: root.querySelector('[data-panel="1"]'),
    2: root.querySelector('[data-panel="2"]'),
    3: root.querySelector('[data-panel="3"]'),
    4: root.querySelector('[data-panel="4"]')
  };
  const pills = Array.from(root.querySelectorAll("[data-step-pill]"));
  const jobChips = root.querySelector("[data-job-chips]");
  const addonsEl = root.querySelector("[data-addons]");
  const rangeCard = root.querySelector("[data-range-card]");
  const fileInput = root.querySelector("#quote-photos");
  const preview = root.querySelector("[data-upload-preview]");
  const mapsWrap = root.querySelector("[data-maps]");
  const mapsContinue = root.querySelector("[data-maps-continue]");

  function statusEl() {
    return root.querySelector(".panel.is-active [data-form-status]");
  }
  function setStatus(msg, kind) {
    const el = statusEl();
    if (!el) return;
    el.textContent = msg || "";
    el.className = "form-status" + (kind ? " " + kind : "");
  }

  function money(n) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    }).format(n);
  }

  function go(step) {
    state.step = step;
    Object.keys(panels).forEach((k) => {
      panels[k].classList.toggle("is-active", Number(k) === step);
    });
    pills.forEach((p) => {
      const n = Number(p.getAttribute("data-step-pill"));
      p.classList.toggle("is-active", n === step);
      p.classList.toggle("is-done", n < step);
    });
    setStatus("");
  }

  Object.values(cfg.quoteRanges.jobs).forEach((job) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip" + (job.key === state.jobType ? " is-selected" : "");
    btn.innerHTML = "<strong>" + job.label + "</strong><span>" + job.sizeHint + "</span>";
    btn.addEventListener("click", () => {
      state.jobType = job.key;
      jobChips.querySelectorAll(".chip").forEach((c) => c.classList.remove("is-selected"));
      btn.classList.add("is-selected");
    });
    jobChips.appendChild(btn);
  });

  Object.entries(cfg.quoteRanges.addOns).forEach(([key, add]) => {
    const row = document.createElement("label");
    row.className = "addon";
    row.innerHTML =
      '<input type="checkbox" data-addon="' + key + '" />' +
      "<span><strong>" + add.label + "</strong> · placeholder +" +
      money(add.low) + "–" + money(add.high) + "</span>";
    addonsEl.appendChild(row);
  });

  function collectAddOns() {
    state.addOns = Array.from(root.querySelectorAll("[data-addon]:checked")).map(
      (el) => el.getAttribute("data-addon")
    );
  }

  function estimateBucketFromText(text) {
    const t = (text || "").toLowerCase();
    if (/stump\s*only|just\s*the\s*stump|grind\s*only/.test(t)) return "stumpOnly";
    if (/storm|emergency|downed|fell|fallen|blocking|on\s*the\s*(house|roof|car)/.test(t))
      return "stormEmergency";
    if (/80|90|100|\bhuge\b|\bmassive\b|crane|hazard|power\s*line|multi[- ]?tree|several trees/.test(t))
      return "xlHazard";
    if (/50|60|70|large|big oak|near (the )?(house|garage|roof)/.test(t)) return "largeRemoval";
    if (/trim|prun|limb|deadwood|thin(ning)?/.test(t) && !/remov/.test(t)) return "smallTrim";
    if (/small|young|under\s*25|sapling/.test(t)) return "smallTrim";
    return null;
  }

  function computeRange() {
    const jobs = cfg.quoteRanges.jobs;
    let jobKey = state.jobType;
    const hinted = estimateBucketFromText(state.description);
    if (hinted && state.jobType === "mediumRemoval") jobKey = hinted;
    if (state.jobType === "stumpOnly" || state.jobType === "stormEmergency" || state.jobType === "smallTrim") {
      jobKey = state.jobType;
    }
    const job = jobs[jobKey] || jobs.mediumRemoval;
    let low = job.low;
    let high = job.high;
    const labels = [job.label];

    state.addOns.forEach((key) => {
      const a = cfg.quoteRanges.addOns[key];
      if (!a) return;
      if (jobKey === "stumpOnly" && key === "stumpGrind") return;
      low += a.low;
      high += a.high;
      labels.push(a.label);
    });

    return { low, high, label: labels.join(" · "), jobKey };
  }

  async function geocodePhoton(address) {
    const url = "https://photon.komoot.io/api/?limit=1&q=" + encodeURIComponent(address);
    const res = await fetch(url);
    if (!res.ok) throw new Error("photon failed");
    const data = await res.json();
    const f = data && data.features && data.features[0];
    if (!f) throw new Error("not found");
    const [lon, lat] = f.geometry.coordinates;
    const p = f.properties || {};
    const displayName = [p.name, p.street, p.city || p.town || p.village, p.state, p.country]
      .filter(Boolean)
      .join(", ");
    return { lat: Number(lat), lon: Number(lon), displayName: displayName || address };
  }

  async function geocodeOpenMeteo(address) {
    const url =
      "https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=" +
      encodeURIComponent(address);
    const res = await fetch(url);
    if (!res.ok) throw new Error("open-meteo failed");
    const data = await res.json();
    const r = data && data.results && data.results[0];
    if (!r) throw new Error("not found");
    const displayName = [r.name, r.admin1, r.country].filter(Boolean).join(", ");
    return { lat: r.latitude, lon: r.longitude, displayName };
  }

  async function geocodeNominatim(address) {
    const url =
      "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" +
      encodeURIComponent(address);
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("nominatim failed");
    const data = await res.json();
    if (!data || !data.length) throw new Error("not found");
    return {
      lat: parseFloat(data[0].lat),
      lon: parseFloat(data[0].lon),
      displayName: data[0].display_name
    };
  }

  async function geocode(address) {
    const errors = [];
    for (const fn of [geocodePhoton, geocodeOpenMeteo, geocodeNominatim]) {
      try {
        return await fn(address);
      } catch (e) {
        errors.push(String(e && e.message ? e.message : e));
      }
    }
    throw new Error(errors.join("; ") || "Geocode failed");
  }

  function showMapFallback(kind, title, msg) {
    const fb = root.querySelector(kind === "sat" ? "[data-sat-fallback]" : "[data-sv-fallback]");
    const img = root.querySelector(kind === "sat" ? "[data-sat-img]" : "[data-sv-img]");
    const msgEl = root.querySelector(kind === "sat" ? "[data-sat-msg]" : "[data-sv-msg]");
    if (img) img.hidden = true;
    const iframe = root.querySelector(kind === "sat" ? "[data-sat-iframe]" : "[data-sv-iframe]");
    if (iframe) iframe.hidden = true;
    if (fb) fb.hidden = false;
    if (msgEl) msgEl.textContent = msg;
  }

  function ensureIframe(kind) {
    const card = root.querySelector(kind === "sat" ? "[data-sat-card]" : "[data-sv-card]");
    if (!card) return null;
    let iframe = card.querySelector(kind === "sat" ? "[data-sat-iframe]" : "[data-sv-iframe]");
    if (!iframe) {
      iframe = document.createElement("iframe");
      iframe.setAttribute(kind === "sat" ? "data-sat-iframe" : "data-sv-iframe", "");
      iframe.title = kind === "sat" ? "Map preview" : "Street area preview";
      iframe.loading = "lazy";
      iframe.referrerPolicy = "no-referrer";
      iframe.style.cssText = "width:100%;height:220px;border:0;border-radius:12px;display:block;background:#0b140e";
      card.appendChild(iframe);
    }
    return iframe;
  }

  function showMapImage(kind, src) {
    const fb = root.querySelector(kind === "sat" ? "[data-sat-fallback]" : "[data-sv-fallback]");
    const img = root.querySelector(kind === "sat" ? "[data-sat-img]" : "[data-sv-img]");
    const iframe = root.querySelector(kind === "sat" ? "[data-sat-iframe]" : "[data-sv-iframe]");
    if (iframe) iframe.hidden = true;
    if (!img) return;
    img.onload = () => {
      img.hidden = false;
      if (fb) fb.hidden = true;
    };
    img.onerror = () => {
      showMapFallback(
        kind,
        "",
        kind === "sat"
          ? "Map image unavailable. Address still saved — continue."
          : "Street View unavailable for this spot."
      );
    };
    img.src = src;
  }

  function showOsmEmbed(lat, lon) {
    const fb = root.querySelector("[data-sat-fallback]");
    const img = root.querySelector("[data-sat-img]");
    if (img) img.hidden = true;
    const delta = 0.008;
    const bbox = [lon - delta, lat - delta, lon + delta, lat + delta].join("%2C");
    const src =
      "https://www.openstreetmap.org/export/embed.html?bbox=" +
      bbox +
      "&layer=mapnik&marker=" +
      encodeURIComponent(lat + "," + lon);
    const iframe = ensureIframe("sat");
    if (iframe) {
      iframe.src = src;
      iframe.hidden = false;
      if (fb) fb.hidden = true;
    }
  }

  function renderMaps(lat, lon) {
    mapsWrap.hidden = false;
    mapsContinue.hidden = false;
    const key = (cfg.googleMapsApiKey || "").trim();

    if (key) {
      const sat =
        "https://maps.googleapis.com/maps/api/staticmap?center=" +
        lat + "," + lon +
        "&zoom=19&size=640x360&maptype=satellite&markers=color:0x3fbf6a%7C" +
        lat + "," + lon +
        "&key=" + encodeURIComponent(key);
      const sv =
        "https://maps.googleapis.com/maps/api/streetview?size=640x360&location=" +
        lat + "," + lon +
        "&fov=90&pitch=0&key=" + encodeURIComponent(key);
      showMapImage("sat", sat);
      showMapImage("sv", sv);
      return;
    }

    /* Graceful fallbacks — no Google spend */
    showOsmEmbed(lat, lon);
    showMapFallback(
      "sv",
      "Street View",
      "Demo mode: Street View needs a Google Maps key. Coordinates saved: " +
        lat.toFixed(5) + ", " + lon.toFixed(5)
    );
    const satMsg = root.querySelector("[data-sat-msg]");
    if (satMsg) {
      satMsg.textContent = "Demo map (OpenStreetMap). Satellite/Street View unlock with a Maps key.";
    }
  }

  root.querySelector("[data-lookup]").addEventListener("click", async () => {
    const address = root.querySelector("#job-address").value.trim();
    if (address.length < 8) {
      setStatus("Enter a full street address.", "err");
      return;
    }
    state.address = address;
    setStatus("Looking up property…");
    try {
      const geo = await geocode(address);
      state.lat = geo.lat;
      state.lon = geo.lon;
      state.displayName = geo.displayName;
      state.mapsReady = true;
      renderMaps(geo.lat, geo.lon);
      setStatus("Found: " + geo.displayName, "ok");
    } catch (err) {
      state.mapsReady = false;
      mapsWrap.hidden = false;
      mapsContinue.hidden = false;
      showMapFallback("sat", "", "Could not geocode that address. You can still continue — Blake will verify.");
      showMapFallback("sv", "", "Street View skipped until address resolves.");
      setStatus("Address lookup failed — you can still continue with the typed address.", "err");
    }
  });

  fileInput.addEventListener("change", () => {
    const files = Array.from(fileInput.files || []).slice(0, 6);
    state.photos = files;
    state.skipPhotos = false;
    preview.innerHTML = "";
    files.forEach((file) => {
      const url = URL.createObjectURL(file);
      const img = document.createElement("img");
      img.src = url;
      img.alt = file.name;
      preview.appendChild(img);
    });
  });

  root.querySelectorAll("[data-next]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = Number(btn.getAttribute("data-next"));
      if (state.step === 1) {
        state.description = root.querySelector("#job-desc").value.trim();
        collectAddOns();
        if (!state.description || state.description.length < 8) {
          setStatus("Add a short description of the tree work.", "err");
          return;
        }
      }
      if (state.step === 2) {
        state.address = root.querySelector("#job-address").value.trim();
        if (state.address.length < 8) {
          setStatus("Enter the property address first.", "err");
          return;
        }
      }
      if (state.step === 3) {
        if (btn.hasAttribute("data-skip-photos")) {
          state.skipPhotos = true;
        } else if (!state.photos.length && !state.skipPhotos) {
          setStatus("Add a photo, or tap Skip photos (demo).", "err");
          return;
        }
      }
      go(next);
    });
  });

  root.querySelectorAll("[data-prev]").forEach((btn) => {
    btn.addEventListener("click", () => go(Number(btn.getAttribute("data-prev"))));
  });

  function buildLeadPayload(range) {
    return {
      business: cfg.businessName,
      to: cfg.leadEmailTo,
      name: state.name,
      phone: state.phone,
      email: state.email || "",
      address: state.address,
      geocode: state.displayName || "",
      lat: state.lat,
      lon: state.lon,
      jobType: range.jobKey,
      addOns: state.addOns,
      description: state.description,
      photoCount: state.photos.length,
      rangeLow: range.low,
      rangeHigh: range.high,
      rangeLabel: range.label,
      consent: true,
      consentText: "TCPA contact consent checked",
      source: "blake-tree-quote-demo-preview",
      createdAt: new Date().toISOString()
    };
  }

  function mailtoLead(payload) {
    const subject = encodeURIComponent(
      "Tree quote lead — " + payload.name + " — " + money(payload.rangeLow) + "–" + money(payload.rangeHigh)
    );
    const body = encodeURIComponent(
      [
        "New tree quote lead (demo tool)",
        "",
        "Name: " + payload.name,
        "Phone: " + payload.phone,
        "Email: " + (payload.email || "(none)"),
        "Address: " + payload.address,
        "Geocode: " + payload.geocode,
        "Coords: " + (payload.lat != null ? payload.lat + ", " + payload.lon : "n/a"),
        "",
        "Job: " + payload.rangeLabel,
        "Description: " + payload.description,
        "Add-ons: " + (payload.addOns.join(", ") || "none"),
        "Photos: " + payload.photoCount,
        "",
        "Ballpark: " + money(payload.rangeLow) + " – " + money(payload.rangeHigh),
        "NOTE: Placeholder range — Blake to confirm pricing table.",
        "",
        "TCPA consent: yes",
        "Time: " + payload.createdAt
      ].join("\n")
    );
    return "mailto:" + cfg.leadEmailTo + "?subject=" + subject + "&body=" + body;
  }

  root.querySelector("[data-submit]").addEventListener("click", () => {
    state.name = root.querySelector("#lead-name").value.trim();
    state.phone = root.querySelector("#lead-phone").value.trim();
    state.email = root.querySelector("#lead-email").value.trim();
    state.consent = root.querySelector("#tcpa").checked;

    if (state.name.length < 2) {
      setStatus("Enter your name.", "err");
      return;
    }
    if (state.phone.replace(/\D/g, "").length < 10) {
      setStatus("Enter a valid mobile number.", "err");
      return;
    }
    if (!state.consent) {
      setStatus("Check the consent box to see your range and send the lead.", "err");
      return;
    }

    collectAddOns();
    state.description = root.querySelector("#job-desc").value.trim();
    const range = computeRange();
    const payload = buildLeadPayload(range);

    try {
      const key = "blake_tree_leads";
      const prev = JSON.parse(localStorage.getItem(key) || "[]");
      prev.push(payload);
      localStorage.setItem(key, JSON.stringify(prev.slice(-50)));
    } catch (_) {}

    rangeCard.hidden = false;
    root.querySelector("[data-range-label]").textContent = range.label;
    root.querySelector("[data-range-price]").textContent =
      money(range.low) + " – " + money(range.high);

    const thanks = root.querySelector("[data-thanks]");
    if (thanks) thanks.hidden = false;

    const mailLink = root.querySelector("[data-mailto-lead]");
    if (mailLink) {
      mailLink.href = mailtoLead(payload);
      mailLink.hidden = false;
    }

    setStatus(
      "Ballpark ready. Demo lead saved on this device (not sent to customers).",
      "ok"
    );
  });
})();
