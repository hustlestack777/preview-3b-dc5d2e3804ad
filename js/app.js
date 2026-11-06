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

  /* Variant + Blake links */
  if (variant.headline) $(".hero h1").textContent = variant.headline;
  if (variant.subline) $(".hero .sub").textContent = variant.subline;
  if (variant.cta) $("#btn-start").textContent = variant.cta;
  document.querySelectorAll("[data-blake-link]").forEach((a) => {
    a.href = blakeUrl(a.getAttribute("data-blake-path") || "/");
  });

  /* Services list */
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
    tool: "tree",
    map: null,
    layerGroup: null,
    storms: null
  };

  let markSeq = 0;

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
    state.marks = [];
    if (state.layerGroup) state.layerGroup.clearLayers();
    renderMarks();
  });

  function initMap(lat, lon) {
    const el = $("#leaflet-map");
    if (state.map) {
      state.map.setView([lat, lon], 19);
      return;
    }
    state.map = L.map(el, { zoomControl: true, attributionControl: true }).setView([lat, lon], 19);
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: 19,
        attribution: "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community"
      }
    ).addTo(state.map);
    state.layerGroup = L.layerGroup().addTo(state.map);
    L.circleMarker([lat, lon], {
      radius: 6,
      color: "#fff",
      weight: 2,
      fillColor: "#3fbf6a",
      fillOpacity: 1
    }).addTo(state.map).bindTooltip("Property pin", { permanent: false });

    state.map.on("click", (e) => {
      addMark(e.latlng.lat, e.latlng.lng, state.tool);
    });
    setTimeout(() => state.map.invalidateSize(), 200);
  }

  function addMark(lat, lon, kind) {
    markSeq += 1;
    const origin = { lat: state.lat, lon: state.lon };
    const pt = { lat, lon };
    const distHouse = Eng.nearestM(pt, state.context.buildings);
    const distLines = Eng.nearestM(pt, state.context.power);
    const nearHouse = distHouse != null ? distHouse < 8 : false; // ~25 ft
    const nearLines = distLines != null ? distLines < 12 : false;

    const mark = {
      id: markSeq,
      kind,
      lat,
      lon,
      species: "unknown",
      canopyFt: kind === "tree" ? 28 : 0,
      heightFt: kind === "tree" ? Eng.estimateHeightFt(28, "unknown") : 0,
      diameterIn: kind === "stump" ? 18 : 0,
      nearHouse,
      nearLines,
      haulOff: $("#opt-haul-default").checked,
      grind: kind === "tree",
      haulMulch: false,
      distHouseM: distHouse,
      distLinesM: distLines
    };
    state.marks.push(mark);

    const color = kind === "tree" ? "#3fbf6a" : "#e8a15a";
    const marker = L.circleMarker([lat, lon], {
      radius: 9,
      color: "#fff",
      weight: 2,
      fillColor: color,
      fillOpacity: 0.95
    }).addTo(state.layerGroup);
    marker.bindTooltip(kind === "tree" ? `Tree #${mark.id}` : `Stump #${mark.id}`);
    mark._leaflet = marker;
    renderMarks();
  }

  function removeMark(id) {
    const idx = state.marks.findIndex((m) => m.id === id);
    if (idx < 0) return;
    const m = state.marks[idx];
    if (m._leaflet) state.layerGroup.removeLayer(m._leaflet);
    state.marks.splice(idx, 1);
    renderMarks();
  }

  function computeTotals() {
    const emergency = $("#opt-emergency").checked;
    let low = 0;
    let high = 0;
    const lines = [];
    state.marks.forEach((m) => {
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
          label: `Stump #${m.id} · ${m.diameterIn}" grind`,
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
    if (!state.marks.length) {
      root.innerHTML = `<p class="hint">No marks yet — tap the map to add a tree or stump.</p>`;
      $("#running-total").hidden = true;
      return;
    }
    state.marks.forEach((m) => {
      const card = document.createElement("div");
      card.className = "mark-card";
      if (m.kind === "tree") {
        card.innerHTML = `
          <header><span>Tree #${m.id}</span><button type="button" class="x" data-rm="${m.id}">Remove</button></header>
          <div class="row">
            <label>Species
              <select data-f="species" data-id="${m.id}">
                ${["unknown","oak","pine","cypress","pecan","sweetgum"].map((s) =>
                  `<option value="${s}" ${m.species===s?"selected":""}>${s}</option>`).join("")}
              </select>
            </label>
            <label>Canopy Ø (ft)
              <input type="number" min="6" max="80" data-f="canopyFt" data-id="${m.id}" value="${m.canopyFt}" />
            </label>
            <label>Est. height (ft)
              <input type="number" min="8" max="140" data-f="heightFt" data-id="${m.id}" value="${m.heightFt}" />
            </label>
            <label>Dist. house
              <input type="text" disabled value="${m.distHouseM==null?'?':Math.round(m.distHouseM*3.281)+' ft'}" />
            </label>
          </div>
          <div class="checks">
            <label><input type="checkbox" data-f="nearHouse" data-id="${m.id}" ${m.nearHouse?"checked":""}/> Near house</label>
            <label><input type="checkbox" data-f="nearLines" data-id="${m.id}" ${m.nearLines?"checked":""}/> Near lines</label>
            <label><input type="checkbox" data-f="haulOff" data-id="${m.id}" ${m.haulOff?"checked":""}/> Haul-off</label>
            <label><input type="checkbox" data-f="grind" data-id="${m.id}" ${m.grind?"checked":""}/> Grind stump</label>
          </div>
          <div class="mini" data-price="${m.id}"></div>`;
      } else {
        card.innerHTML = `
          <header><span>Stump #${m.id}</span><button type="button" class="x" data-rm="${m.id}">Remove</button></header>
          <div class="row">
            <label>Diameter (in)
              <input type="number" min="4" max="72" data-f="diameterIn" data-id="${m.id}" value="${m.diameterIn}" />
            </label>
            <label>Dist. house
              <input type="text" disabled value="${m.distHouseM==null?'?':Math.round(m.distHouseM*3.281)+' ft'}" />
            </label>
          </div>
          <div class="checks">
            <label><input type="checkbox" data-f="haulMulch" data-id="${m.id}" ${m.haulMulch?"checked":""}/> Haul mulch</label>
            <label><input type="checkbox" data-f="nearLines" data-id="${m.id}" ${m.nearLines?"checked":""}/> Near lines</label>
          </div>
          <div class="mini" data-price="${m.id}"></div>`;
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
        if (el.type === "checkbox") m[f] = el.checked;
        else if (f === "species") {
          m.species = el.value;
          m.heightFt = Eng.estimateHeightFt(m.canopyFt, m.species);
        } else {
          m[f] = Number(el.value);
          if (f === "canopyFt") m.heightFt = Eng.estimateHeightFt(m.canopyFt, m.species);
        }
        renderMarks();
      });
    });

    const totals = computeTotals();
    state.marks.forEach((m) => {
      const el = root.querySelector(`[data-price="${m.id}"]`);
      if (!el) return;
      const p =
        m.kind === "tree"
          ? Eng.priceTree(m, pricing, { emergency: $("#opt-emergency").checked })
          : Eng.priceStump(m, pricing);
      el.textContent = `${money(p.low)} – ${money(p.high)} (placeholder)`;
    });
    $("#running-total").hidden = false;
    $("#running-price").textContent = `${money(totals.low)} – ${money(totals.high)}`;
  }

  ["opt-emergency", "opt-haul-default"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", () => renderMarks());
  });

  async function openQuote() {
    $("#quote").hidden = false;
    $("#addr-chip").textContent = state.displayName || state.address;
    $("#sat-img").src = Eng.esriExportUrl(state.lat, state.lon, 640, 70);
    $("#quote").scrollIntoView({ behavior: "smooth", block: "start" });

    initMap(state.lat, state.lon);

    $("#context-note").textContent = "Scanning nearby buildings & power lines (OpenStreetMap)…";
    state.context = await Eng.overpassContext(state.lat, state.lon, 90);
    const b = state.context.buildings.length;
    const p = state.context.power.length;
    $("#context-note").textContent = state.context.error
      ? "Map context unavailable — mark trees manually. Distances can be edited."
      : `Found ${b} building footprint(s) and ${p} power feature(s) nearby (OSM).`;

    Eng.stormAlertsForPoint(state.lat, state.lon).then((storms) => {
      state.storms = storms;
      const banner = $("#storm-banner");
      if (storms.flag) {
        banner.hidden = false;
        const events = storms.nws.map((n) => n.event).slice(0, 3).join(", ") || "Recent SPC storm reports nearby";
        banner.innerHTML = `<strong>Storm desk:</strong> ${events}. Good window to quote tree work. <em>HD imagery pull queued for later.</em>`;
      } else {
        banner.hidden = true;
      }
    });
  }

  $("#addr-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const address = $("#address").value.trim();
    const status = $("#addr-status");
    if (address.length < 8) {
      status.textContent = "Enter a full street address.";
      status.className = "form-status err";
      return;
    }
    state.address = address;
    status.textContent = "Looking up property…";
    status.className = "form-status";
    $("#btn-start").disabled = true;
    try {
      const geo = await Eng.geocode(address);
      state.lat = geo.lat;
      state.lon = geo.lon;
      state.displayName = geo.displayName;
      status.textContent = "Found — mark trees on the map below.";
      status.className = "form-status ok";
      await openQuote();
    } catch (_) {
      status.textContent = "Could not find that address. Try a fuller street + city + ZIP.";
      status.className = "form-status err";
    } finally {
      $("#btn-start").disabled = false;
    }
  });

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
    if (!state.marks.length) {
      status.textContent = "Mark at least one tree or stump on the map.";
      status.className = "form-status err";
      return;
    }

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
      marks: state.marks.map(({ _leaflet, ...rest }) => rest),
      rangeLow: totals.low,
      rangeHigh: totals.high,
      breakdown: totals.lines,
      storms: state.storms,
      source: params.src,
      variant: params.v,
      utm: params.utm,
      imagery: "esri_world_imagery",
      context: "osm_overpass",
      blakeContinueUrl: blakeUrl("/"),
      createdAt: new Date().toISOString()
    };
    try {
      const key = "blake_tree_leads";
      const prev = JSON.parse(localStorage.getItem(key) || "[]");
      prev.push(payload);
      localStorage.setItem(key, JSON.stringify(prev.slice(-50)));
    } catch (_) {}

    $("#range").hidden = false;
    $("#range-label").textContent = `${state.marks.filter((m)=>m.kind==="tree").length} tree(s) · ${state.marks.filter((m)=>m.kind==="stump").length} stump(s)`;
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
  });

  $("#btn-jump").addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => $("#address").focus(), 400);
  });

  window.__blakeDemo = { params, variant, blakeUrl, state };
})();
