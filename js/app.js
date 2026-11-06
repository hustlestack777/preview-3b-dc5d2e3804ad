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

  if (variant.headline) $(".hero h1").textContent = variant.headline;
  if (variant.subline) $(".hero .sub").textContent = variant.subline;
  if (variant.cta) $("#btn-start").textContent = variant.cta;
  document.querySelectorAll("[data-blake-link]").forEach((a) => {
    a.href = blakeUrl(a.getAttribute("data-blake-path") || "/");
  });

  const svcList = $("#services-list");
  if (svcList && window.BLAKE_SERVICES) {
    svcList.innerHTML = "";
    window.BLAKE_SERVICES.forEach((s) => {
      const li = document.createElement("li");
      li.className = s.live ? "" : "off";
      li.innerHTML = s.live
        ? s.label
        : `${s.label} <span class="ask-blake">(${s.note || "ask Blake"})</span>`;
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
    tool: "select",
    map: null,
    layerGroup: null,
    parcelLayer: null,
    imageOverlay: null,
    storms: null,
    photos: [],
    notes: "",
    step: 1,
    rangeShown: false,
    parcel: null
  };

  let markSeq = 0;

  function selectedMarks() {
    return state.marks.filter((m) => m.selected);
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

  function setTool(tool) {
    state.tool = tool;
    document.querySelectorAll(".tool[data-tool]").forEach((b) => {
      b.classList.toggle("is-on", b.getAttribute("data-tool") === tool);
    });
  }
  document.querySelectorAll(".tool[data-tool]").forEach((b) => {
    b.addEventListener("click", () => setTool(b.getAttribute("data-tool")));
  });
  $("#btn-clear-marks").addEventListener("click", () => {
    state.marks = state.marks.filter((m) => m.source === "detected");
    state.marks.forEach((m) => {
      m.selected = false;
      styleMarker(m);
    });
    // remove manual leaflet markers already filtered out
    if (state.layerGroup) {
      state.layerGroup.clearLayers();
      if (state.lat != null) housePin(state.lat, state.lon);
      state.marks.forEach((m) => {
        if (m._leaflet) m._leaflet.addTo(state.layerGroup);
      });
    }
    renderMarks();
    updateOverlayHint();
  });

  function markerStyle(mark) {
    const tree = mark.kind === "tree";
    if (mark.selected) {
      return {
        radius: tree ? 11 : 9,
        color: "#fff",
        weight: 3,
        fillColor: tree ? "#3fbf6a" : "#e8c15a",
        fillOpacity: 0.92
      };
    }
    return {
      radius: tree ? 9 : 8,
      color: tree ? "#3fbf6a" : "#e8c15a",
      weight: 3,
      fillColor: tree ? "#3fbf6a" : "#e8c15a",
      fillOpacity: 0.18
    };
  }

  function styleMarker(mark) {
    if (mark._leaflet) mark._leaflet.setStyle(markerStyle(mark));
  }

  function updateOverlayHint() {
    const overlay = $("#map-hint-overlay");
    const found = state.marks.filter((m) => m.kind === "tree").length;
    const picked = selectedMarks().length;
    if (overlay) overlay.hidden = picked > 0 || found === 0;
    if (overlay && !overlay.hidden) {
      overlay.querySelector("span").textContent =
        found ? `Tap a circled tree to select it` : "Tap Add a tree, then tap it on the map";
    }
  }

  function initMap(lat, lon) {
    const el = $("#leaflet-map");
    if (state.map) {
      state.map.setView([lat, lon], 19);
      setTimeout(() => state.map.invalidateSize(), 150);
      return;
    }
    state.map = L.map(el, {
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: true
    }).setView([lat, lon], 19);
    if (state.map.attributionControl) state.map.attributionControl.setPrefix("");
    // Native z19 only — z20 public tiles are tiny placeholders and look worse.
    // detectRetina would request z20, so it stays off. Sharpness comes from the
    // high-res snapshot overlaid on the lot.
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: 19,
        maxNativeZoom: 19,
        detectRetina: false,
        attribution: "Satellite imagery"
      }
    ).addTo(state.map);
    if (!state.map.getPane("trees")) {
      state.map.createPane("trees");
      state.map.getPane("trees").style.zIndex = 650;
    }
    state.layerGroup = L.layerGroup().addTo(state.map);
    state.map.on("click", (e) => {
      if (state.tool === "tree" || state.tool === "stump") {
        addMark(e.latlng.lat, e.latlng.lng, state.tool, { selected: true, source: "manual" });
        setTool("select");
      }
    });
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

  async function paintProperty(lat, lon) {
    initMap(lat, lon);
    clearPropertyLayers();

    const caption = $("#parcel-caption");
    const hint = $("#map-hint");
    if (hint) hint.textContent = "Finding your property line…";

    let parcel = null;
    try {
      parcel = await Eng.fetchParcel(lat, lon, state.displayName || state.address);
    } catch (_) {}
    state.parcel = parcel;

    const core = parcel ? parcel.bounds : Eng.boundsFromPoint(lat, lon, 40);
    const bounds = Eng.expandToMinSize(Eng.padBounds(core, 0.25), 58);

    const overlayUrl = Eng.esriBBoxExportUrl(bounds);
    state.imageOverlay = L.imageOverlay(
      overlayUrl,
      [
        [bounds.south, bounds.west],
        [bounds.north, bounds.east]
      ],
      { opacity: 1, interactive: false, className: "sat-sharp", pane: "overlayPane" }
    ).addTo(state.map);
    state.imageOverlay.on("error", () => {
      if (state.imageOverlay) {
        try { state.map.removeLayer(state.imageOverlay); } catch (_) {}
        state.imageOverlay = null;
      }
    });

    if (parcel && parcel.ring) {
      const latlngs = Eng.ringToLatLngs(parcel.ring);
      state.parcelLayer = L.polygon(latlngs, {
        color: "#ff8a2b",
        weight: 3,
        fillColor: "#ff8a2b",
        fillOpacity: 0.08,
        interactive: false
      }).addTo(state.map);
      if (caption) caption.textContent = "Property line from parish records";
    } else {
      const bldg = (state.context.buildings || [])[0];
      if (bldg) {
        L.circleMarker([bldg.lat, bldg.lon], {
          radius: 14,
          color: "#ff8a2b",
          weight: 2,
          fillOpacity: 0.05,
          interactive: false,
          pane: "trees"
        }).addTo(state.layerGroup);
      }
      const approx = L.rectangle(
        [
          [core.south, core.west],
          [core.north, core.east]
        ],
        {
          color: "#ff8a2b",
          weight: 2,
          dashArray: "6 5",
          fillColor: "#ff8a2b",
          fillOpacity: 0.05,
          interactive: false
        }
      ).addTo(state.map);
      state.parcelLayer = approx;
      if (caption) caption.textContent = "Approximate lot — exact property line not available here";
    }
    state.map.fitBounds(
      [
        [bounds.south, bounds.west],
        [bounds.north, bounds.east]
      ],
      { padding: [18, 18], maxZoom: 19 }
    );

    housePin(lat, lon);

    if (hint) hint.textContent = "Looking for trees on the lot…";
    let detected = [];
    try {
      detected = await Eng.detectTreesFromExport(overlayUrl, bounds);
    } catch (err) {
      console.warn("detectTrees", err);
      detected = [];
    }
    if (parcel && parcel.ring) {
      detected = detected.filter((t) =>
        Eng.pointInRing(t.lon, t.lat, parcel.ring) || Eng.haversineM(t, { lat, lon }) < 28
      );
    }

    detected.forEach((t) => {
      addMark(t.lat, t.lon, "tree", {
        selected: false,
        source: "detected",
        canopyFt: t.canopyFt,
        heightFt: Eng.estimateHeightFt(t.canopyFt || 24, "unknown")
      });
    });

    if (hint) {
      const n = detected.length;
      hint.textContent = n
        ? `We spotted ${n} possible tree${n === 1 ? "" : "s"}. Tap the ones you want quoted — or add a tree / stump yourself.`
        : "We couldn’t automatically spot trees here. Tap Add a tree, then tap each one on the map.";
    }
    updateOverlayHint();
    // OSM tree nodes, if any, without blocking the map.
    Eng.fetchOsmTrees(lat, lon, 70).then((osm) => {
      (osm || []).forEach((t) => {
        const inside = !parcel || !parcel.ring || Eng.pointInRing(t.lon, t.lat, parcel.ring) || Eng.haversineM(t, { lat, lon }) < 28;
        if (!inside) return;
        if (state.marks.some((m) => Eng.haversineM(m, t) < 6)) return;
        addMark(t.lat, t.lon, "tree", {
          selected: false,
          source: "detected",
          canopyFt: t.canopyFt,
          heightFt: Eng.estimateHeightFt(t.canopyFt || 24, "unknown")
        });
      });
      if (hint && state.marks.some((m) => m.source === "detected")) {
        const n = state.marks.filter((m) => m.kind === "tree").length;
        hint.textContent = `We spotted ${n} possible tree${n === 1 ? "" : "s"}. Tap the ones you want quoted — or add a tree / stump yourself.`;
      }
      updateOverlayHint();
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
      selected: opts.selected !== false && opts.source === "manual" ? true : !!opts.selected,
      source: opts.source || "manual"
    };
    if (opts.selected === false) mark.selected = false;
    if (opts.source === "manual") mark.selected = true;
    state.marks.push(mark);

    const marker = L.circleMarker([lat, lon], Object.assign({ pane: "trees" }, markerStyle(mark))).addTo(state.layerGroup);
    marker.bindTooltip(kind === "tree" ? `Tree #${mark.id}` : `Stump #${mark.id}`);
    marker.on("click", (e) => {
      if (e.originalEvent) L.DomEvent.stopPropagation(e);
      mark.selected = !mark.selected;
      styleMarker(mark);
      renderMarks();
      updateOverlayHint();
    });
    mark._leaflet = marker;
    renderMarks();
    updateOverlayHint();
    return mark;
  }

  function removeMark(id) {
    const idx = state.marks.findIndex((m) => m.id === id);
    if (idx < 0) return;
    const m = state.marks[idx];
    if (m._leaflet) state.layerGroup.removeLayer(m._leaflet);
    state.marks.splice(idx, 1);
    renderMarks();
    updateOverlayHint();
  }

  function computeTotals() {
    const emergency = $("#opt-storm") && $("#opt-storm").checked;
    let low = 0;
    let high = 0;
    const lines = [];
    selectedMarks().forEach((m) => {
      if (m.kind === "tree") {
        const p = Eng.priceTree(m, pricing, { emergency });
        low += p.low;
        high += p.high;
        lines.push({
          label: `Tree #${m.id} · ${m.species} · ~${m.heightFt} ft · ${p.band}`,
          low: p.low,
          high: p.high
        });
      } else {
        const p = Eng.priceStump(m, pricing);
        low += p.low;
        high += p.high;
        lines.push({
          label: `Stump #${m.id} · ${m.diameterIn}" `,
          low: p.low,
          high: p.high
        });
      }
    });
    return { low, high, lines };
  }

  function renderMarks() {
    const root = $("#marks-list");
    root.innerHTML = "";
    const picked = selectedMarks();
    const trees = picked.filter((m) => m.kind === "tree").length;
    const stumps = picked.filter((m) => m.kind === "stump").length;
    if (!picked.length) {
      root.innerHTML = `<p class="hint">No trees selected yet — tap a green circle, or add one yourself.</p>`;
      $("#running-total").hidden = true;
      return;
    }
    picked.forEach((m) => {
      const card = document.createElement("div");
      card.className = "mark-card";
      if (m.kind === "tree") {
        card.innerHTML = `
          <header><span>Tree #${m.id}</span><button type="button" class="x" data-rm="${m.id}">Remove</button></header>
          <div class="row">
            <label>Type
              <select data-f="species" data-id="${m.id}">
                ${["unknown","oak","pine","cypress","pecan","sweetgum"].map((s) =>
                  `<option value="${s}" ${m.species===s?"selected":""}>${s}</option>`).join("")}
              </select>
            </label>
            <label>Rough height (ft)
              <input type="number" min="8" max="140" data-f="heightFt" data-id="${m.id}" value="${m.heightFt}" />
            </label>
          </div>
          <label class="notes-mini">Notes
            <input type="text" data-f="notes" data-id="${m.id}" value="${(m.notes || "").replace(/"/g, "&quot;")}" placeholder="Anything about this tree" />
          </label>`;
      } else {
        card.innerHTML = `
          <header><span>Stump #${m.id}</span><button type="button" class="x" data-rm="${m.id}">Remove</button></header>
          <div class="row">
            <label>Diameter (in)
              <input type="number" min="4" max="72" data-f="diameterIn" data-id="${m.id}" value="${m.diameterIn}" />
            </label>
          </div>
          <label class="notes-mini">Notes
            <input type="text" data-f="notes" data-id="${m.id}" value="${(m.notes || "").replace(/"/g, "&quot;")}" placeholder="Anything about this stump" />
          </label>`;
      }
      root.appendChild(card);
    });

    root.querySelectorAll("[data-rm]").forEach((b) =>
      b.addEventListener("click", () => removeMark(Number(b.getAttribute("data-rm"))))
    );
    root.querySelectorAll("[data-f]").forEach((el) => {
      el.addEventListener("change", () => {
        const id = Number(el.getAttribute("data-id"));
        const f = el.getAttribute("data-f");
        const m = state.marks.find((x) => x.id === id);
        if (!m) return;
        if (f === "notes" || f === "species") m[f] = el.value;
        else m[f] = Number(el.value);
        if (f === "species") m.heightFt = Eng.estimateHeightFt(m.canopyFt || 24, m.species);
      });
    });

    $("#running-total").hidden = false;
    $("#marks-summary").textContent =
      `${trees} tree${trees === 1 ? "" : "s"} · ${stumps} stump${stumps === 1 ? "" : "s"} selected`;
    $("#running-price").textContent = state.rangeShown ? "" : "Estimate after contact info";
  }

  const photosInput = $("#photos");
  if (photosInput) {
    photosInput.addEventListener("change", () => {
      const files = Array.from(photosInput.files || []).slice(0, 6);
      state.photos = files.map((f) => ({ name: f.name, size: f.size, type: f.type }));
      const prev = $("#photo-prev");
      prev.innerHTML = "";
      files.forEach((file) => {
        const img = document.createElement("img");
        img.alt = file.name;
        img.src = URL.createObjectURL(file);
        prev.appendChild(img);
      });
    });
  }

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
      if (caption) caption.textContent = "Approximate lot — exact property line not available here";
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
        if (state.layerGroup) state.layerGroup.clearLayers();
        state.rangeShown = false;
        const rng = document.getElementById("range");
        if (rng) rng.hidden = true;
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

  $("#btn-to-photos").addEventListener("click", () => {
    const status = $("#property-status");
    if (!selectedMarks().length) {
      status.textContent = "Tap at least one circled tree (or add a tree / stump) to continue.";
      status.className = "form-status err";
      return;
    }
    status.textContent = "";
    goStep(3);
  });
  $("#btn-back-property").addEventListener("click", () => goStep(2));
  $("#btn-to-contact").addEventListener("click", () => {
    state.notes = ($("#notes") && $("#notes").value.trim()) || "";
    goStep(4);
  });
  $("#btn-back-photos").addEventListener("click", () => goStep(3));

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
      status.textContent = "Check the consent box to see your estimate.";
      status.className = "form-status err";
      return;
    }
    if (!selectedMarks().length) {
      status.textContent = "Select at least one tree or stump.";
      status.className = "form-status err";
      return;
    }

    state.notes = ($("#notes") && $("#notes").value.trim()) || "";
    const totals = computeTotals();
    const payload = {
      business: "3 B's Tree Removal",
      to: defaults.leadEmailTo || "shaun.brasher@gmail.com",
      name,
      phone,
      address: state.address,
      geocode: state.displayName,
      lat: state.lat,
      lon: state.lon,
      marks: selectedMarks().map(({ _leaflet, ...rest }) => rest),
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
      parcel: state.parcel ? { source: state.parcel.source, exact: true } : { exact: false },
      blakeContinueUrl: blakeUrl("/"),
      createdAt: new Date().toISOString()
    };
    try {
      const key = "blake_tree_leads";
      const prev = JSON.parse(localStorage.getItem(key) || "[]");
      prev.push(payload);
      localStorage.setItem(key, JSON.stringify(prev.slice(-50)));
    } catch (_) {}

    state.rangeShown = true;
    $("#range").hidden = false;
    $("#range-label").textContent = `${selectedMarks().filter((m)=>m.kind==="tree").length} tree(s) · ${selectedMarks().filter((m)=>m.kind==="stump").length} stump(s)`;
    $("#range-price").textContent = `${money(totals.low)} – ${money(totals.high)}`;
    const ul = $("#breakdown");
    ul.innerHTML = "";
    totals.lines.forEach((line) => {
      const li = document.createElement("li");
      li.textContent = `${line.label}: ${money(line.low)} – ${money(line.high)}`;
      ul.appendChild(li);
    });
    $("#thanks").hidden = false;
    const cont = $("#blake-continue");
    cont.href = blakeUrl("/");
    cont.hidden = false;
    status.textContent = "Estimate ready.";
    status.className = "form-status ok";
    $("#range").scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  $("#btn-jump").addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => $("#address").focus(), 400);
  });

  window.__blakeDemo = { params, variant, blakeUrl, state };
})();
