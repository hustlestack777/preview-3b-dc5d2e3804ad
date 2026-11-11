(() => {
  const defaults = window.SITE_DEFAULTS || {};
  const variants = window.SITE_VARIANTS || {};
  const pricing = window.TREE_PRICING;
  const Eng = window.TreeEngine;

  function readParams() {
    const q = new URLSearchParams(location.search);
    const utm = {};
    q.forEach((val, key) => {
      if (/^utm_/i.test(key)) utm[key.toLowerCase()] = val;
    });
    const src = (q.get("src") || defaults.source || "lrl").toLowerCase();
    let v = (q.get("v") || defaults.variant || "a").toLowerCase();
    if (!variants[v]) v = defaults.variant || "a";
    return { src, v, utm };
  }
  const params = readParams();
  const variant = variants[params.v] || variants.a || {};

  function trackingQuery() {
    const out = new URLSearchParams();
    out.set("src", params.src);
    out.set("v", params.v);
    Object.entries(params.utm).forEach(([k, val]) => out.set(k, val));
    return out.toString();
  }
  function blakeUrl(path) {
    const u = new URL(path || "", defaults.blakeSite || "https://www.3bstreeremoval.com/");
    new URLSearchParams(trackingQuery()).forEach((val, key) => u.searchParams.set(key, val));
    return u.toString();
  }

  const $ = (s, r = document) => r.querySelector(s);
  const money = (n) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

  const heroVideo = document.querySelector(".hero-video");
  if (heroVideo && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    heroVideo.pause();
    heroVideo.removeAttribute("autoplay");
    heroVideo.style.display = "none";
  }

  function compressImage(file, maxDim = 1280, quality = 0.72) {
    return new Promise((resolve) => {
      if (!file || !file.type || !file.type.startsWith("image/")) {
        resolve(null);
        return;
      }
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(url);
          resolve(blob);
        }, "image/jpeg", quality);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
  }

  async function emailLead(payload) {
    const to = payload.to || defaults.leadEmailTo || "shaun.brasher@gmail.com";
    const lines = [
      "New tree-work lead from the 3 B's preview page",
      "",
      "Name: " + payload.name,
      "Phone: " + payload.phone,
      "Address: " + (payload.address || ""),
      "Geocode: " + (payload.geocode || ""),
      payload.lat && payload.lon ? "Map: https://maps.google.com/?q=" + payload.lat + "," + payload.lon : "",
      "Storm / urgent: " + (payload.stormUrgent ? "yes" : "no"),
      "Job types: " + ((payload.jobTypeLabels || []).join(", ") || "(none)"),
      "Ballpark shown: " + (payload.rangeLow ? "$" + payload.rangeLow + " – $" + payload.rangeHigh : "none (follow up)"),
      "Town / address given: " + (payload.town || "(none)"),
      "Best day to call: " + (payload.bestDay || "(any)"),
      "Best time to call: " + (payload.bestTime || "(any)"),
      "How soon: " + (payload.howSoon || "(not given)"),
      "Trees or limbs: " + (payload.treeCount != null ? payload.treeCount : "?") + " · Stumps: " + (payload.stumpCount != null ? payload.stumpCount : "?"),
      "Notes: " + (payload.notes || "(none)"),
      "Photo count: " + (payload.photoCount || 0),
      "Photo names: " + ((payload.photoNames || []).join(", ") || "(none)"),
      "Photos attached: as many as fit under FormSubmit 10 MB limit (images are shrunk first).",
      "Marks: " + JSON.stringify(payload.marks || [], null, 2),
      "Parcel: " + JSON.stringify(payload.parcel || {}, null, 2),
      "Source: " + payload.source + " / variant " + payload.variant,
      "Created: " + payload.createdAt,
      "",
      "Review the photos and the satellite view, then call the customer back at their best time and confirm the real price."
    ].filter((line, i, arr) => line !== "" || (arr[i - 1] !== ""));
    const bodyText = lines.join("\n");
    const fd = new FormData();
    fd.append("_subject", "New tree-work lead — " + payload.name + " — " + (payload.address || "no address"));
    fd.append("_template", "table");
    fd.append("_captcha", "false");
    fd.append("name", payload.name);
    fd.append("phone", payload.phone);
    if (payload.email) fd.append("email", payload.email);
    fd.append("address", payload.address || "");
    fd.append("geocode", payload.geocode || "");
    fd.append("map", payload.lat && payload.lon ? "https://maps.google.com/?q=" + payload.lat + "," + payload.lon : "");
    fd.append("stormUrgent", payload.stormUrgent ? "yes" : "no");
    fd.append("jobTypes", (payload.jobTypeLabels || []).join(", ") || "(none)");
    fd.append("ballparkShown", payload.rangeLow ? "$" + payload.rangeLow + " – $" + payload.rangeHigh : "none (follow up)");
    fd.append("town", payload.town || "");
    fd.append("bestDay", payload.bestDay || "");
    fd.append("bestTime", payload.bestTime || "");
    fd.append("howSoon", payload.howSoon || "");
    fd.append("treesOrLimbs", String(payload.treeCount != null ? payload.treeCount : ""));
    fd.append("stumps", String(payload.stumpCount != null ? payload.stumpCount : ""));
    fd.append("notes", payload.notes || "(none)");
    fd.append("breakdown", (payload.breakdown || []).map((l) => l.label + ": $" + l.low + "–$" + l.high).join("; ") || "(none)");
    fd.append("marks", JSON.stringify(payload.marks || [], null, 2));
    fd.append("parcel", JSON.stringify(payload.parcel || {}, null, 2));
    fd.append("source", (payload.source || "") + " / " + (payload.variant || ""));
    fd.append("createdAt", payload.createdAt || "");
    fd.append("message", bodyText);

    // FormSubmit hard limit is 10 MB total per submission. Stay under it after compression.
    const MAX_ATTACH_BYTES = 9 * 1024 * 1024;
    const images = (state.media || []).filter((m) => m && m.kind === "image" && m.file);
    let usedBytes = 0;
    let attached = 0;
    const skippedNames = [];
    for (let i = 0; i < images.length; i++) {
      const blob = await compressImage(images[i].file);
      if (!blob) continue;
      if (usedBytes + blob.size > MAX_ATTACH_BYTES) {
        skippedNames.push(images[i].name);
        continue;
      }
      usedBytes += blob.size;
      attached += 1;
      fd.append("photo" + attached, blob, "photo-" + attached + ".jpg");
    }
    fd.append("photosAttached", String(attached));
    if (skippedNames.length) {
      fd.append("photosOmitted", skippedNames.length + " photo(s) omitted (10 MB email limit): " + skippedNames.join(", "));
    }

    const endpoint = "https://formsubmit.co/ajax/" + encodeURIComponent(to);
    const res = await fetch(endpoint, { method: "POST", body: fd, headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("lead post failed");
    const json = await res.json().catch(() => ({}));
    if (json.success === "false" || json.success === false) throw new Error(json.message || "lead post failed");
    return true;
  }

  // Wake the free lead server while the customer fills in the form.
  if (defaults.leadApi) {
    fetch(defaults.leadApi.replace(/\/$/, "") + "/health", { mode: "cors" }).catch(() => {});
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  }

  // Shared lead intake: saves the lead, emails the team, and emails the customer their copy.
  async function postLead(payload) {
    if (!defaults.leadApi) throw new Error("no lead api");
    const images = (state.media || []).filter((m) => m && m.kind === "image" && m.file).slice(0, 6);
    const photos = [];
    for (const m of images) {
      const blob = await compressImage(m.file);
      if (!blob) continue;
      const dataUrl = await blobToDataUrl(blob);
      if (dataUrl) photos.push({ name: m.name || "photo-" + (photos.length + 1) + ".jpg", dataUrl });
    }
    const body = Object.assign({}, payload, { photos, page: location.pathname + location.search });
    delete body.to;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 75000);
    try {
      const res = await fetch(defaults.leadApi.replace(/\/$/, "") + "/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok || !json.emailed) throw new Error(json.error || "lead api failed");
      return true;
    } finally {
      clearTimeout(timer);
    }
  }

  // New path first; the old FormSubmit email is the fallback until the new path is proven.
  function submitLead(payload) {
    return postLead(payload).catch(() => emailLead(payload));
  }

  function mailtoFallback(payload) {
    const subject = encodeURIComponent("New tree-work lead — " + payload.name);
    const body = encodeURIComponent(
      "Name: " + payload.name + "\nPhone: " + payload.phone + "\nAddress: " + (payload.address || "") +
      "\nNotes: " + (payload.notes || "") + "\nRange: $" + payload.rangeLow + " – $" + payload.rangeHigh
    );
    const a = document.createElement("a");
    a.href = "mailto:" + (payload.to || defaults.leadEmailTo) + "?subject=" + subject + "&body=" + body;
    a.click();
  }

  if (variant.headline) $(".hero h1").textContent = variant.headline;
  if (variant.subline) $(".hero .sub").textContent = variant.subline;
  if (variant.cta) $("#btn-start").textContent = variant.cta;
  document.querySelectorAll("[data-blake-link]").forEach((a) => {
    a.href = blakeUrl(a.getAttribute("data-blake-path") || "/");
  });

  const svcList = $("#services-list");
  if (svcList && window.BLAKE_SERVICES && !svcList.hasAttribute("data-static")) {
    svcList.innerHTML = "";
    window.BLAKE_SERVICES.forEach((s) => {
      const li = document.createElement("li");
      li.className = s.live ? "" : "off";
      li.innerHTML = s.live
        ? s.label
        : `${s.label} <span class="ask-blake">(${s.note || "ask us"})</span>`;
      svcList.appendChild(li);
    });
  }

  const state = {
    address: "",
    lat: null,
    lon: null,
    displayName: "",
    context: { buildings: [], power: [] },
    marks: [],
    treeCount: 2,
    stumpCount: 0,
    jobTypes: ["removal"],
    countsTouched: false,
    spottedTrees: null,
    spottedStumps: null,
    statusLine: "Looking for trees on the lot…",
    comments: "",
    map: null,
    layerGroup: null,
    parcelLayer: null,
    imageOverlay: null,
    storms: null,
    photos: [],
    media: [],
    notes: "",
    step: 1,
    rangeShown: false,
    parcel: null
  };

  let markSeq = 0;
  let lastNotePrefill = "";
  const DEFAULT_TREES = 2;
  const DEFAULT_STUMPS = 0;
  const MAX_TREES = 40;
  const MAX_STUMPS = 20;

  function plural(n, one, many) {
    return n === 1 ? `1 ${one}` : `${n} ${many}`;
  }

  function spottedSentence(n, m) {
    return `We spotted about ${plural(n, "tree", "trees")} and ${plural(m, "stump", "stumps")}.`;
  }

  function countKind(kind) {
    return state.marks.filter((m) => m.kind === kind).length;
  }

  function goStep(step) {
    state.step = step;
    document.querySelectorAll(".q-step").forEach((el) => {
      const n = Number(el.getAttribute("data-step"));
      el.hidden = n !== step;
      el.classList.toggle("is-on", n === step);
    });
    document.querySelectorAll("[data-step-pill]").forEach((p) => {
      const n = Number(p.getAttribute("data-step-pill"));
      p.classList.toggle("is-on", n === step);
      p.classList.toggle("is-done", n < step);
    });
    if (step === 2 && state.map) {
      setTimeout(() => state.map.invalidateSize(), 80);
      setTimeout(() => state.map.invalidateSize(), 400);
    }
    const card = $("#quote-card");
    if (card && step > 1) card.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function markerStyle(mark) {
    const tree = mark.kind === "tree";
    return {
      radius: tree ? 10 : 8,
      color: "#fff",
      weight: 2,
      fillColor: tree ? "#3fbf6a" : "#e8c15a",
      fillOpacity: 0.78
    };
  }

  function syncCountOutputs() {
    const treesOut = $("#trees-count");
    const stumpsOut = $("#stumps-count");
    if (treesOut) {
      treesOut.textContent = String(state.treeCount);
      treesOut.setAttribute("aria-label", plural(state.treeCount, "tree", "trees"));
    }
    if (stumpsOut) {
      stumpsOut.textContent = String(state.stumpCount);
      stumpsOut.setAttribute("aria-label", plural(state.stumpCount, "stump", "stumps"));
    }
    const treesMinus = $("#trees-minus");
    const treesPlus = $("#trees-plus");
    const stumpsMinus = $("#stumps-minus");
    const stumpsPlus = $("#stumps-plus");
    if (treesMinus) treesMinus.disabled = state.treeCount <= 0;
    if (treesPlus) treesPlus.disabled = state.treeCount >= MAX_TREES;
    if (stumpsMinus) stumpsMinus.disabled = state.stumpCount <= 0;
    if (stumpsPlus) stumpsPlus.disabled = state.stumpCount >= MAX_STUMPS;
    const summary = $("#marks-summary");
    if (summary) {
      summary.textContent = `${plural(state.treeCount, "tree", "trees")} · ${plural(state.stumpCount, "stump", "stumps")}`;
    }
    const total = $("#running-total");
    if (total) total.hidden = false;
    const price = $("#running-price");
    if (price && !state.rangeShown) price.textContent = "Estimate after contact info";
  }

  function renderEstimate() {
    syncCountOutputs();
    const el = $("#spotted-estimate");
    const note = $("#spotted-note");
    if (!el) return;
    if (state.spottedTrees == null) {
      el.textContent = state.statusLine || "Looking for trees on the lot…";
      if (note) note.hidden = true;
      return;
    }
    const fallback = state.spottedTrees === 0 && state.spottedStumps === 0;
    const n = fallback ? DEFAULT_TREES : state.spottedTrees;
    const m = fallback ? DEFAULT_STUMPS : state.spottedStumps;
    el.textContent = spottedSentence(n, m);
    if (note) {
      note.hidden = false;
      note.textContent = fallback
        ? "Couldn’t read the canopy clearly, so this is a typical starting count. Change it anytime — or just describe the work."
        : "Change the counts if we missed one. Or skip the numbers and just describe the work.";
    }
  }

  function applyDetectedCounts() {
    state.spottedTrees = countKind("tree");
    state.spottedStumps = countKind("stump");
    if (!state.countsTouched) {
      const fallback = state.spottedTrees === 0 && state.spottedStumps === 0;
      state.treeCount = fallback ? DEFAULT_TREES : state.spottedTrees;
      state.stumpCount = fallback ? DEFAULT_STUMPS : state.spottedStumps;
    }
    renderEstimate();
  }

  function bumpCount(field, delta, max) {
    state.countsTouched = true;
    const next = Math.min(max, Math.max(0, state[field] + delta));
    state[field] = next;
    renderEstimate();
  }

  function bindStepper(minusId, plusId, field, max) {
    const minus = $(minusId);
    const plus = $(plusId);
    if (minus) minus.addEventListener("click", () => bumpCount(field, -1, max));
    if (plus) plus.addEventListener("click", () => bumpCount(field, 1, max));
  }
  bindStepper("#trees-minus", "#trees-plus", "treeCount", MAX_TREES);
  bindStepper("#stumps-minus", "#stumps-plus", "stumpCount", MAX_STUMPS);

  const JOB_TYPE_LABELS = {
    removal: "Tree removal",
    trim: "Trimming",
    emergency: "Storm cleanup",
    stump: "Stump grinding",
    dirt: "Skid steer & dirt work"
  };
  function selectedJobTypes() {
    return Array.from(document.querySelectorAll('input[name="job-type"]:checked')).map((el) => el.value);
  }
  function jobTypeLabels(ids) {
    return (ids || []).map((id) => JOB_TYPE_LABELS[id] || id);
  }
  function syncJobTypeUi() {
    const selected = new Set(state.jobTypes || []);
    document.querySelectorAll('input[name="job-type"]').forEach((el) => {
      el.checked = selected.has(el.value);
      const lab = el.closest(".job-type");
      if (lab) lab.classList.toggle("is-on", el.checked);
    });
  }
  document.querySelectorAll('input[name="job-type"]').forEach((el) => {
    el.addEventListener("change", () => {
      state.jobTypes = selectedJobTypes();
      syncJobTypeUi();
      renderEstimate();
    });
  });
  renderEstimate();

  function initMap(lat, lon) {
    const el = $("#leaflet-map");
    if (state.map) {
      state.map.setView([lat, lon], 20);
      setTimeout(() => state.map.invalidateSize(), 150);
      return;
    }
    state.map = L.map(el, {
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: true
    }).setView([lat, lon], 20);
    if (state.map.attributionControl) state.map.attributionControl.setPrefix("");
    // Google satellite tiles go to z21 and stay sharp when the map is fitted
    // tightly to the lot (same source GetMowed uses via Static Maps).
    L.tileLayer(
      "https://mt{s}.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}",
      {
        maxZoom: 21,
        maxNativeZoom: 21,
        subdomains: ["0", "1", "2", "3"],
        detectRetina: false,
        attribution: "Satellite imagery"
      }
    ).addTo(state.map);
    if (!state.map.getPane("trees")) {
      state.map.createPane("trees");
      state.map.getPane("trees").style.zIndex = 650;
    }
    state.layerGroup = L.layerGroup().addTo(state.map);
    setTimeout(() => state.map.invalidateSize(), 200);
    setTimeout(() => state.map.invalidateSize(), 700);
  }

  function clearPropertyLayers() {
    if (state.imageOverlay) {
      state.map.removeLayer(state.imageOverlay);
      state.imageOverlay = null;
    }
    if (state.parcelLayer) {
      state.map.removeLayer(state.parcelLayer);
      state.parcelLayer = null;
    }
    if (state.layerGroup) state.layerGroup.clearLayers();
  }

  function housePin(lat, lon) {
    L.circleMarker([lat, lon], {
      radius: 6,
      color: "#fff",
      weight: 2,
      fillColor: "#5ad0ff",
      fillOpacity: 1,
      interactive: false,
      pane: "trees"
    }).addTo(state.layerGroup).bindTooltip("Your house", { permanent: false });
  }

  function showScanner(on) {
    const el = $("#scan-overlay");
    if (!el) return;
    el.hidden = !on;
  }

  async function paintProperty(lat, lon) {
    initMap(lat, lon);
    clearPropertyLayers();
    state.marks = [];
    markSeq = 0;
    state.spottedTrees = null;
    state.spottedStumps = null;
    state.statusLine = "Outlining your property…";
    if (!state.countsTouched) {
      state.treeCount = DEFAULT_TREES;
      state.stumpCount = DEFAULT_STUMPS;
    }
    renderEstimate();

    const caption = $("#parcel-caption");
    showScanner(true);
    if (caption) caption.textContent = "Outlining your property…";

    const started = Date.now();
    let parcel = null;
    try {
      parcel = await Eng.fetchParcel(lat, lon, state.displayName || state.address);
    } catch (_) {}
    state.parcel = parcel;
    const linger = Math.max(0, 1200 - (Date.now() - started));
    if (linger) await new Promise((resolve) => setTimeout(resolve, linger));

    const detectCore = parcel ? parcel.bounds : Eng.boundsFromPoint(lat, lon, 40);
    const detectBounds = Eng.padBounds(detectCore, 0.08);

    if (parcel && (parcel.feature || parcel.ring)) {
      const geo = parcel.feature || {
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: [parcel.ring] }
      };
      state.parcelLayer = L.geoJSON(geo, {
        style: {
          color: "#ff8a2b",
          weight: 3,
          fillColor: "#ff8a2b",
          fillOpacity: 0.1,
          className: "parcel-draw"
        },
        interactive: false
      }).addTo(state.map);
      if (caption) caption.textContent = parcel.label || "Property line from parish records";
      try {
        state.map.fitBounds(state.parcelLayer.getBounds(), { padding: [26, 26], maxZoom: 21 });
      } catch (_) {
        state.map.setView([lat, lon], 20);
      }
    } else {
      if (caption) caption.textContent = "Exact property line not in parish records here";
      state.map.setView([lat, lon], 20);
    }
    showScanner(false);

    housePin(lat, lon);

    state.statusLine = "Looking for trees on the lot…";
    renderEstimate();
    let detected = [];
    try {
      const overlayUrl = Eng.esriBBoxExportUrl(detectBounds);
      detected = await Eng.detectTreesFromExport(overlayUrl, detectBounds);
    } catch (err) {
      console.warn("detectTrees", err);
      detected = [];
    }
    if (parcel && (parcel.ring || (parcel.rings && parcel.rings.length))) {
      detected = detected.filter((t) => Eng.pointInParcel(t.lon, t.lat, parcel, 4));
    }

    detected.forEach((t) => {
      addMark(t.lat, t.lon, "tree", {
        source: "detected",
        canopyFt: t.canopyFt,
        heightFt: Eng.estimateHeightFt(t.canopyFt || 24, "unknown")
      });
    });
    applyDetectedCounts();

    const parcelAtScan = parcel;
    Eng.fetchOsmTrees(lat, lon, 70).then((osm) => {
      if (state.lat !== lat || state.lon !== lon) return;
      let treesAdded = countKind("tree");
      let stumpsAdded = countKind("stump");
      (osm || []).forEach((t) => {
        const kind = t.kind === "stump" ? "stump" : "tree";
        const inside = !parcelAtScan || !(parcelAtScan.ring || (parcelAtScan.rings && parcelAtScan.rings.length))
          ? true
          : Eng.pointInParcel(t.lon, t.lat, parcelAtScan, 4);
        if (!inside) return;
        if (state.marks.some((m) => m.kind === kind && Eng.haversineM(m, t) < 6)) return;
        if (kind === "tree" && treesAdded >= 16) return;
        if (kind === "stump" && stumpsAdded >= 8) return;
        addMark(t.lat, t.lon, kind, {
          source: "detected",
          canopyFt: t.canopyFt,
          heightFt: kind === "tree" ? Eng.estimateHeightFt(t.canopyFt || 24, "unknown") : 0
        });
        if (kind === "tree") treesAdded += 1;
        else stumpsAdded += 1;
      });
      applyDetectedCounts();
    }).catch(() => {});
    setTimeout(() => state.map.invalidateSize(), 200);
  }

  function setStreetView(lat, lon) {
    const frame = $("#sv-frame");
    const fallback = $("#sv-fallback");
    if (!frame) return;
    frame.src = Eng.streetViewEmbedUrl(lat, lon);
    fallback.hidden = true;
    frame.hidden = false;
    frame.onerror = () => {
      fallback.hidden = false;
    };
  }

  function addMark(lat, lon, kind, opts) {
    opts = opts || {};
    markSeq += 1;
    const canopyFt = opts.canopyFt || (kind === "tree" ? 24 : 0);
    const mark = {
      id: markSeq,
      kind,
      lat,
      lon,
      species: "unknown",
      canopyFt,
      heightFt: kind === "tree" ? opts.heightFt || Eng.estimateHeightFt(canopyFt, "unknown") : 0,
      diameterIn: kind === "stump" ? 18 : 0,
      notes: "",
      source: opts.source || "detected"
    };
    state.marks.push(mark);
    if (state.layerGroup) {
      const marker = L.circleMarker([lat, lon], Object.assign(
        { pane: "trees", interactive: false },
        markerStyle(mark)
      )).addTo(state.layerGroup);
      mark._leaflet = marker;
    }
    return mark;
  }

  function meanHeight(trees) {
    if (!trees.length) return 40;
    const sum = trees.reduce((s, t) => s + (Number(t.heightFt) || 40), 0);
    return Math.round(sum / trees.length);
  }

  function quoteItems() {
    const trees = state.marks
      .filter((m) => m.kind === "tree")
      .slice()
      .sort((a, b) => (b.canopyFt || 0) - (a.canopyFt || 0));
    const stumps = state.marks.filter((m) => m.kind === "stump");
    const avgH = meanHeight(trees);
    const items = [];
    for (let i = 0; i < state.treeCount; i++) {
      const src = trees[i];
      if (src) {
        items.push({
          id: src.id,
          kind: "tree",
          lat: src.lat,
          lon: src.lon,
          species: src.species || "unknown",
          canopyFt: src.canopyFt,
          heightFt: src.heightFt || avgH,
          notes: "",
          source: src.source || "detected"
        });
      } else {
        items.push({
          id: "tree-" + (i + 1),
          kind: "tree",
          species: "unknown",
          canopyFt: 24,
          heightFt: avgH,
          notes: "",
          source: "count"
        });
      }
    }
    for (let i = 0; i < state.stumpCount; i++) {
      const src = stumps[i];
      items.push({
        id: src ? src.id : "stump-" + (i + 1),
        kind: "stump",
        lat: src ? src.lat : undefined,
        lon: src ? src.lon : undefined,
        diameterIn: (src && src.diameterIn) || 18,
        notes: "",
        source: src ? src.source || "detected" : "count"
      });
    }
    return items;
  }

  function computeTotals() {
    const emergency = $("#opt-storm") && $("#opt-storm").checked;
    const types = state.jobTypes || selectedJobTypes();
    const has = (t) => types.includes(t);
    const trimOnly = has("trim") && !has("removal");
    let low = 0;
    let high = 0;
    const lines = [];
    const add = (label, r) => {
      low += r.low;
      high += r.high;
      lines.push({ label, low: Math.round(r.low), high: Math.round(r.high) });
    };
    let stumpIdx = 0;
    quoteItems().forEach((m, index) => {
      if (m.kind === "tree") {
        if (trimOnly) {
          add(`Trim tree ${index + 1}`, pricing.trim);
        } else {
          const p = Eng.priceTree(m, pricing, { emergency });
          add(`Remove tree ${index + 1} · ~${m.heightFt} ft · ${p.band}`, p);
        }
      } else {
        const p = Eng.priceStump(m, pricing);
        const extra = pricing.stumps.extraStump;
        const r = stumpIdx > 0 && extra && m.diameterIn <= 24 ? extra : p;
        stumpIdx += 1;
        add(`Grind stump · ${m.diameterIn}"`, r);
      }
    });
    if (has("emergency") && !lines.length && pricing.stormCleanup) {
      add("Storm cleanup (downed limbs)", pricing.stormCleanup);
    }
    if (has("dirt")) {
      const dirt = (pricing && (pricing.dirtWork || pricing.landClearing)) || { low: 500, high: 2400 };
      add("Skid steer dirt work (half day to a full day)", dirt);
    }
    return { low: Math.round(low), high: Math.round(high), lines };
  }

  function renderMedia() {
    const roots = [$("#photo-prev"), $("#photo-prev-extra")].filter(Boolean);
    roots.forEach((root) => {
      root.innerHTML = "";
      state.media.forEach((item) => {
        const wrap = document.createElement("div");
        wrap.className = "media-thumb";
        if (item.kind === "video") {
          const vid = document.createElement("video");
          vid.src = item.url;
          vid.muted = true;
          vid.playsInline = true;
          wrap.appendChild(vid);
        } else {
          const img = document.createElement("img");
          img.src = item.url;
          img.alt = item.name || "Photo";
          wrap.appendChild(img);
        }
        const rm = document.createElement("button");
        rm.type = "button";
        rm.className = "media-x";
        rm.setAttribute("aria-label", "Remove");
        rm.textContent = "×";
        rm.addEventListener("click", () => {
          URL.revokeObjectURL(item.url);
          state.media = state.media.filter((m) => m.id !== item.id);
          renderMedia();
        });
        wrap.appendChild(rm);
        root.appendChild(wrap);
      });
    });
    state.photos = state.media.map((m) => ({ name: m.name, size: m.size, type: m.type, kind: m.kind, file: m.file }));
    updatePhotoLimitNote();
  }

  const MAX_MEDIA_ITEMS = 40; // preview cap; FormSubmit still caps the email at 10 MB total

  function photoLimitEls() {
    return [$("#photo-limit"), $("#photo-limit-extra")].filter(Boolean);
  }

  function updatePhotoLimitNote() {
    const images = state.media.filter((m) => m.kind === "image");
    const videos = state.media.filter((m) => m.kind === "video");
    const parts = [];
    if (state.media.length >= MAX_MEDIA_ITEMS) {
      parts.push("You can add up to " + MAX_MEDIA_ITEMS + " files in this form.");
    }
    if (images.length) {
      parts.push(images.length === 1 ? "1 photo ready." : images.length + " photos ready.");
      parts.push("We'll shrink them and attach as many as the 10 MB email limit allows.");
    }
    if (videos.length) {
      parts.push("Short videos can be selected here, but this form can't email them yet.");
    }
    const text = parts.join(" ");
    photoLimitEls().forEach((el) => {
      el.hidden = !text;
      el.textContent = text;
    });
  }

  function addMediaFiles(fileList) {
    Array.from(fileList || []).forEach((file) => {
      if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) return;
      if (state.media.length >= MAX_MEDIA_ITEMS) return;
      state.media.push({
        id: Date.now() + Math.random(),
        name: file.name,
        size: file.size,
        type: file.type,
        kind: file.type.startsWith("video/") ? "video" : "image",
        url: URL.createObjectURL(file),
        file
      });
    });
    renderMedia();
    updatePhotoLimitNote();
  }

  ["#photos", "#photos-extra"].forEach((sel) => {
    const input = $(sel);
    if (!input) return;
    input.addEventListener("change", () => {
      addMediaFiles(input.files);
      input.value = "";
    });
  });

  async function openQuote() {
    $("#quote").hidden = false;
    $("#addr-chip").textContent = state.displayName || state.address;
    goStep(2);
    $("#quote").scrollIntoView({ behavior: "smooth", block: "start" });

    initMap(state.lat, state.lon);
    setStreetView(state.lat, state.lon);

    // Don't block the satellite / parcel / tree circles on Overpass (often slow).
    Eng.overpassContext(state.lat, state.lon, 90)
      .then((ctx) => { state.context = ctx; })
      .catch(() => { state.context = { buildings: [], power: [], error: true }; });
    try {
      await paintProperty(state.lat, state.lon);
    } catch (err) {
      console.warn("paintProperty failed", err);
      const caption = document.getElementById("parcel-caption");
      if (caption) caption.textContent = "Exact property line not in parish records here";
      if (state.spottedTrees == null) applyDetectedCounts();
    }

    Eng.stormAlertsForPoint(state.lat, state.lon).then((storms) => {
      state.storms = storms;
      const banner = $("#storm-banner");
      if (storms.flag) {
        banner.hidden = false;
        const events = storms.nws.map((n) => n.event).slice(0, 3).join(", ") || "Recent storm reports nearby";
        banner.innerHTML = `<strong>Heads up:</strong> ${events}. A good time to ask about storm work.`;
      } else {
        banner.hidden = true;
      }
    });
  }

  let pendingGeo = null;
  const startBtn = $("#btn-start");

  function markAddressReady(label) {
    startBtn.classList.add("is-ready");
    const status = $("#addr-status");
    status.textContent = (label || "Address selected") + " — tap Get started";
    status.className = "form-status ok";
  }

  window.AddressAutocomplete.attach({
    input: $("#address"),
    form: $("#addr-form"),
    listEl: $("#addr-suggestions"),
    onStatus(msg, ok) {
      const hint = $("#addr-hint");
      if (!hint) return;
      hint.textContent = msg;
      hint.classList.toggle("is-ok", !!ok);
    },
    onSelect(s) {
      pendingGeo = { lat: s.lat, lon: s.lon, displayName: s.label };
      state.address = s.label;
      state.lat = s.lat;
      state.lon = s.lon;
      state.displayName = s.label;
      markAddressReady(s.label);
    }
  });

  async function startFromAddress() {
    const status = $("#addr-status");
    const address = $("#address").value.trim();
    if (address.length < 3) {
      status.textContent = "Start typing your address and pick one from the list.";
      status.className = "form-status err";
      return;
    }
    startBtn.disabled = true;
    status.textContent = "Looking up property…";
    status.className = "form-status";
    try {
      let geo = pendingGeo;
      if (!geo || geo.lat == null || geo.displayName !== address) {
        try {
          geo = await Eng.geocode(address);
        } catch (err) {
          if (geo && geo.lat != null) {
            /* keep pending pin */
          } else {
            throw err;
          }
        }
      }
      const moved = state.lat !== geo.lat || state.lon !== geo.lon;
      state.address = address;
      state.lat = geo.lat;
      state.lon = geo.lon;
      state.displayName = geo.displayName || address;
      pendingGeo = geo;
      if (moved || !state.marks.length) {
        state.marks = [];
        markSeq = 0;
        state.countsTouched = false;
        state.treeCount = DEFAULT_TREES;
        state.stumpCount = DEFAULT_STUMPS;
        state.jobTypes = ["removal"];
        syncJobTypeUi();
        state.spottedTrees = null;
        state.spottedStumps = null;
        state.comments = "";
        state.notes = "";
        lastNotePrefill = "";
        const describeEl = $("#work-describe");
        const commentsEl = $("#work-comments");
        const notesEl = $("#notes");
        if (describeEl) describeEl.value = "";
        if (commentsEl) commentsEl.value = "";
        if (notesEl) notesEl.value = "";
        if (state.layerGroup) state.layerGroup.clearLayers();
        state.rangeShown = false;
        const rng = document.getElementById("range");
        if (rng) rng.hidden = true;
        renderEstimate();
      }
      status.textContent = "Opening your property…";
      status.className = "form-status ok";
      startBtn.classList.remove("is-ready");
      await openQuote();
    } catch (_) {
      status.textContent = "Could not find that address. Pick a suggestion from the list.";
      status.className = "form-status err";
    } finally {
      startBtn.disabled = false;
    }
  }

  startBtn.addEventListener("click", (e) => {
    e.preventDefault();
    startFromAddress();
  });

  function readComments() {
    return ($("#work-comments") && $("#work-comments").value.trim()) || "";
  }
  function readDescribe() {
    return ($("#work-describe") && $("#work-describe").value.trim()) || "";
  }
  function combinedPropertyNotes() {
    return [readComments(), readDescribe()].filter(Boolean).join("\n\n");
  }

  $("#btn-to-photos").addEventListener("click", () => {
    const status = $("#property-status");
    state.comments = readComments();
    const combined = combinedPropertyNotes();
    const notesEl = $("#notes");
    if (notesEl && (!notesEl.value.trim() || notesEl.value.trim() === lastNotePrefill)) {
      notesEl.value = combined;
    }
    lastNotePrefill = combined;
    state.notes = (notesEl && notesEl.value.trim()) || combined;
    if (status) {
      status.textContent = "";
      status.className = "form-status";
    }
    goStep(3);
  });
  $("#btn-back-property").addEventListener("click", () => goStep(2));
  $("#btn-to-contact").addEventListener("click", () => {
    const notesEl = $("#notes");
    state.comments = readComments();
    state.notes = (notesEl && notesEl.value.trim()) || combinedPropertyNotes();
    goStep(4);
  });
  $("#btn-back-photos").addEventListener("click", () => goStep(3));

  function radioVal(name) {
    const el = document.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : "";
  }

  $("#btn-range").addEventListener("click", () => {
    const status = $("#result-status");
    const name = $("#name").value.trim();
    const phone = $("#phone").value.trim();
    if (name.length < 2) {
      status.textContent = "Enter your name.";
      status.className = "form-status err";
      return;
    }
    if (phone.replace(/\D/g, "").length < 10) {
      status.textContent = "Enter a valid mobile number.";
      status.className = "form-status err";
      return;
    }
    if (!$("#consent").checked) {
      status.textContent = "Check the consent box so we can call you.";
      status.className = "form-status err";
      return;
    }
    state.comments = readComments();
    state.notes = ($("#notes") && $("#notes").value.trim()) || combinedPropertyNotes();
    const totals = computeTotals();
    const quoted = quoteItems();
    const payload = {
      business: "3 B's Tree Removal",
      to: defaults.leadEmailTo || "shaun.brasher@gmail.com",
      name,
      phone,
      email: ($("#email") && $("#email").value.trim()) || "",
      website: ($("#website") && $("#website").value) || "",
      town: ($("#town") && $("#town").value.trim()) || "",
      bestDay: radioVal("best-day"),
      bestTime: radioVal("best-time"),
      howSoon: radioVal("how-soon"),
      address: state.address,
      geocode: state.displayName,
      lat: state.lat,
      lon: state.lon,
      treeCount: state.treeCount,
      stumpCount: state.stumpCount,
      jobTypes: state.jobTypes || selectedJobTypes(),
      jobTypeLabels: jobTypeLabels(state.jobTypes || selectedJobTypes()),
      spottedTrees: state.spottedTrees,
      spottedStumps: state.spottedStumps,
      comments: state.comments,
      marks: quoted,
      notes: state.notes,
      photoCount: state.photos.length,
      photoNames: state.photos.map((p) => p.name),
      stormUrgent: !!(document.getElementById("opt-storm") && document.getElementById("opt-storm").checked),
      rangeLow: totals.low,
      rangeHigh: totals.high,
      breakdown: totals.lines,
      storms: state.storms,
      source: params.src,
      variant: params.v,
      utm: params.utm,
      imagery: "satellite",
      parcel: state.parcel
        ? {
            source: state.parcel.source,
            exact: true,
            areaSqFt: state.parcel.areaSqFt,
            widthFt: state.parcel.widthFt,
            depthFt: state.parcel.depthFt
          }
        : { exact: false },
      blakeContinueUrl: blakeUrl("/"),
      createdAt: new Date().toISOString()
    };
    try {
      const key = "blake_tree_leads";
      const prev = JSON.parse(localStorage.getItem(key) || "[]");
      prev.push(payload);
      localStorage.setItem(key, JSON.stringify(prev.slice(-50)));
    } catch (_) {}

    const showRange = () => {
      state.rangeShown = true;
      $("#range").hidden = false;
      const ul = $("#breakdown");
      ul.innerHTML = "";
      const treeN = quoted.filter((m) => m.kind === "tree").length;
      const stumpN = quoted.filter((m) => m.kind === "stump").length;
      const typeBits = jobTypeLabels(state.jobTypes || selectedJobTypes());
      const countBits = [];
      if (treeN) countBits.push(plural(treeN, "tree", "trees"));
      if (stumpN) countBits.push(plural(stumpN, "stump", "stumps"));
      const rangeLead = typeBits.length ? typeBits.join(" · ") : (countBits.join(" · ") || "We'll review what you sent");
      if (!totals.lines.length) {
        $("#range-label").textContent = rangeLead;
        $("#range-price").textContent = "We’ll give you a ballpark on the callback";
      } else {
        $("#range-label").textContent = countBits.length ? rangeLead + " · " + countBits.join(" · ") : rangeLead;
        $("#range-price").textContent = `${money(totals.low)} – ${money(totals.high)}`;
        totals.lines.forEach((line) => {
          const li = document.createElement("li");
          li.textContent = `${line.label}: ${money(line.low)} – ${money(line.high)}`;
          ul.appendChild(li);
        });
      }
      if (state.notes) {
        const li = document.createElement("li");
        li.textContent = "You wrote: " + state.notes;
        ul.appendChild(li);
      }
      const thanks = $("#thanks");
      thanks.hidden = false;
      thanks.textContent = "Thanks, we got your info. We’ll review your photos and the satellite view, and we’ll confirm your real price when we call you back.";
      $("#range").scrollIntoView({ behavior: "smooth", block: "nearest" });
    };

    const btn = $("#btn-range");
    if (btn) btn.disabled = true;
    status.textContent = "Sending your info…";
    status.className = "form-status";
    submitLead(payload)
      .then(() => {
        showRange();
        status.textContent = "Your ballpark range is ready.";
        status.className = "form-status ok";
      })
      .catch(() => {
        mailtoFallback(payload);
        showRange();
        const thanks = $("#thanks");
        thanks.textContent = "If your email app opened, please hit send so we get your info. Then we’ll confirm your real price when we call you back.";
        status.textContent = "Your ballpark range is ready. Please send the email if it appeared.";
        status.className = "form-status ok";
      })
      .finally(() => {
        if (btn) btn.disabled = false;
      });
  });

  $("#btn-jump").addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => $("#address").focus(), 400);
  });

  window.__blakeDemo = { params, variant, blakeUrl, state };
})();
