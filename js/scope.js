/* Callback-only jobs (everything except pruning / trimming): scope questions plus an
   outline on the satellite map that works out square feet and acres. Same idea as the
   GetMowed address scan: the lot outline from the parcel scan is the starting point,
   and the customer can trace the work area with a finger or mouse (Draw mode locks the
   map so it doesn't pan), or tap corners as a fallback. No prices here. */
(function () {
  const $ = (s) => document.querySelector(s);
  const SQFT_PER_ACRE = 43560;
  const CLEARING = new Set(["clearing"]);
  const pts = [];
  let layer = null;
  let markers = null;
  let area = null; // { sqft, acres, source: "outline" | "lot", ring: [[lon,lat],...] }

  function demo() { return window.__blakeDemo || {}; }
  function st() { return demo().state || {}; }

  function types() {
    return Array.from(document.querySelectorAll('input[name="job-type"]:checked')).map((el) => el.value);
  }
  function isScopeJob(list) { return (list || types()).some((t) => t !== "trim"); }
  function hasClearing(list) { return (list || types()).some((t) => CLEARING.has(t)); }

  // Geodesic polygon area (square meters) for [[lat,lon],...]; spherical excess formula.
  function ringAreaM2(latlngs) {
    const R = 6378137;
    let total = 0;
    const n = latlngs.length;
    if (n < 3) return 0;
    for (let i = 0; i < n; i++) {
      const [lat1, lon1] = latlngs[i];
      const [lat2, lon2] = latlngs[(i + 1) % n];
      total += ((lon2 - lon1) * Math.PI / 180) * (2 + Math.sin(lat1 * Math.PI / 180) + Math.sin(lat2 * Math.PI / 180));
    }
    return Math.abs((total * R * R) / 2);
  }
  function fmt(n) { return Math.round(n).toLocaleString("en-US"); }
  function label(a) {
    if (!a) return "";
    return `${fmt(a.sqft)} sq ft · ${a.acres.toFixed(a.acres < 1 ? 2 : 1)} acres`;
  }

  function show() {
    const panel = $("#scope-panel");
    if (!panel) return;
    const list = types();
    panel.hidden = !isScopeJob(list);
    const clearing = $("#scope-clearing");
    if (clearing) clearing.hidden = !hasClearing(list);
    const other = $("#scope-other-wrap");
    if (other) other.hidden = !list.includes("other");
    const out = $("#scope-area");
    if (out) out.textContent = area ? label(area) + (area.source === "lot" ? " (whole lot from the property lines)" : " (your outline)") : "No area outlined yet.";
  }

  function redraw() {
    const map = st().map;
    if (!map || !window.L) return;
    if (layer) { map.removeLayer(layer); layer = null; }
    if (markers) { map.removeLayer(markers); markers = null; }
    markers = L.layerGroup().addTo(map);
    pts.forEach((p) => L.circleMarker(p, { radius: 5, color: "#fff", weight: 2, fillColor: "#F86A02", fillOpacity: 1 }).addTo(markers));
    if (pts.length >= 2) {
      layer = (pts.length >= 3 ? L.polygon(pts, { color: "#F86A02", weight: 3, fillOpacity: 0.25 }) : L.polyline(pts, { color: "#F86A02", weight: 3 })).addTo(map);
    }
    if (pts.length >= 3) {
      const sqft = ringAreaM2(pts) * 10.7639;
      area = { sqft, acres: sqft / SQFT_PER_ACRE, source: "outline", ring: pts.map(([la, lo]) => [lo, la]) };
    } else if (area && area.source === "outline") {
      area = null;
    }
    show();
  }

  // Modes: "move" (pan/zoom the map), "draw" (drag a finger or mouse to trace), "corners" (tap corners).
  let mode = "move";
  const history = [];
  let stroke = null;

  function snapshot() { history.push(pts.map((p) => p.slice())); if (history.length > 30) history.shift(); }

  function setMode(next) {
    const map = st().map;
    if (!map) {
      $("#scope-area").textContent = "Enter your address first so the satellite view loads.";
      return;
    }
    hook(map);
    mode = next;
    const lockMap = mode !== "move";
    ["dragging", "touchZoom", "doubleClickZoom", "scrollWheelZoom", "boxZoom", "keyboard"].forEach((h) => {
      if (map[h]) lockMap ? map[h].disable() : map[h].enable();
    });
    const el = map.getContainer();
    el.classList.toggle("scope-drawing", lockMap);
    el.style.touchAction = lockMap ? "none" : "";
    document.querySelectorAll("[data-scope-mode]").forEach((btn) => btn.classList.toggle("is-on", btn.getAttribute("data-scope-mode") === mode));
    const hint = $("#scope-draw-hint");
    if (hint) {
      hint.hidden = mode === "move";
      hint.textContent = mode === "draw" ? "Drag your finger (or mouse) around the work area. We close the shape for you." : "Tap each corner of the area on the map.";
    }
    if (lockMap) { $("#scope-not-sure").checked = false; }
  }

  function hook(map) {
    if (map.__scopeHooked) return;
    map.__scopeHooked = true;
    const el = map.getContainer();
    map.on("click", (e) => {
      if (mode !== "corners") return;
      snapshot();
      pts.push([e.latlng.lat, e.latlng.lng]);
      redraw();
    });
    el.addEventListener("pointerdown", (e) => {
      if (mode !== "draw") return;
      e.preventDefault();
      e.stopPropagation();
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
      snapshot();
      pts.length = 0;
      stroke = { id: e.pointerId, last: null };
      addPoint(map, e);
    }, true);
    el.addEventListener("pointermove", (e) => {
      if (mode !== "draw" || !stroke || stroke.id !== e.pointerId) return;
      e.preventDefault();
      e.stopPropagation();
      addPoint(map, e);
    }, true);
    const end = (e) => {
      if (!stroke || stroke.id !== e.pointerId) return;
      stroke = null;
      if (pts.length > 160) {
        const step = Math.ceil(pts.length / 160);
        const kept = pts.filter((_, i) => i % step === 0);
        pts.length = 0; kept.forEach((p) => pts.push(p));
      }
      if (pts.length < 3) { const prev = history.pop() || []; pts.length = 0; prev.forEach((p) => pts.push(p)); }
      redraw();
    };
    el.addEventListener("pointerup", end, true);
    el.addEventListener("pointercancel", end, true);
  }

  function addPoint(map, e) {
    const rect = map.getContainer().getBoundingClientRect();
    const cp = L.point(e.clientX - rect.left, e.clientY - rect.top);
    if (stroke.last && stroke.last.distanceTo(cp) < 5) return;
    stroke.last = cp;
    const ll = map.containerPointToLatLng(cp);
    pts.push([ll.lat, ll.lng]);
    redraw();
  }

  function undo() {
    const prev = history.pop();
    pts.length = 0;
    (prev || []).forEach((p) => pts.push(p));
    if (!prev) area = null;
    redraw();
  }
  function clearOutline() {
    if (pts.length) snapshot();
    pts.length = 0;
    area = null;
    redraw();
  }
  function finishOutline() { setMode("move"); }
  function useLot() {
    const p = st().parcel;
    if (!p || !p.areaSqFt) {
      $("#scope-area").textContent = "We couldn't find the lot lines here. Draw the area instead, or check “not sure.”";
      return;
    }
    clearOutline();
    if (st().map) setMode("move");
    area = { sqft: p.areaSqFt, acres: p.areaSqFt / SQFT_PER_ACRE, source: "lot", ring: p.ring || null };
    show();
  }

  function radio(name) {
    const el = document.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : "";
  }
  function checks(name) {
    return Array.from(document.querySelectorAll('input[name="' + name + '"]:checked')).map((el) => el.value);
  }

  function collect() {
    const list = types();
    if (!isScopeJob(list)) return null;
    const clearing = hasClearing(list);
    return {
      jobTypes: list.filter((t) => t !== "trim"),
      other: ($("#scope-other") && $("#scope-other").value.trim()) || "",
      notSure: !!($("#scope-not-sure") && $("#scope-not-sure").checked),
      area: area ? { sqft: Math.round(area.sqft), acres: Number(area.acres.toFixed(3)), source: area.source, ring: area.ring } : null,
      cover: checks("scope-cover"),
      debris: clearing ? radio("scope-debris") : "",
      stumpsOut: clearing ? radio("scope-stumps") : "",
      leveling: clearing ? radio("scope-level") : "",
      gateWidth: ($("#scope-gate") && $("#scope-gate").value) || "",
      skidSteer: radio("scope-skid")
    };
  }

  function summaryText(s, labels) {
    if (!s) return "";
    const L = (id) => (labels && labels[id]) || id;
    const lines = ["SCOPE (callback-only, no price shown)"];
    lines.push("Job type: " + (s.jobTypes.map(L).join(", ") || "(none)") + (s.other ? " · Other: " + s.other : ""));
    lines.push("Area: " + (s.area ? `${fmt(s.area.sqft)} sq ft (${s.area.acres} acres), ${s.area.source === "lot" ? "whole lot from parcel lines" : "customer outline"}` : s.notSure ? "Not sure, just call me" : "not outlined"));
    lines.push("What's on it: " + (s.cover.join(", ") || "(not given)"));
    if (s.debris || s.stumpsOut || s.leveling) {
      lines.push("Clearing: debris " + (s.debris || "?") + " · stumps out " + (s.stumpsOut || "?") + " · leveling after " + (s.leveling || "?"));
    }
    lines.push("Access: gate " + (s.gateWidth || "?") + " · skid steer can get in: " + (s.skidSteer || "?"));
    return lines.join("\n");
  }

  // Satellite image of the outlined area with the outline drawn on it, for the lead email.
  async function areaImageBlob() {
    if (!area || !area.ring || area.ring.length < 3) return null;
    const ring = area.ring; // [lon, lat]
    let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
    ring.forEach(([lo, la]) => { west = Math.min(west, lo); east = Math.max(east, lo); south = Math.min(south, la); north = Math.max(north, la); });
    const padX = (east - west) * 0.15 || 0.0004, padY = (north - south) * 0.15 || 0.0004;
    const b = { west: west - padX, east: east + padX, south: south - padY, north: north + padY };
    const url = window.TreeEngine.esriBBoxExportUrl(b, 900, 700);
    const size = new URL(url).searchParams.get("size").split(",").map(Number);
    try {
      const res = await fetch(url, { mode: "cors" });
      if (!res.ok) return null;
      const img = await createImageBitmap(await res.blob());
      const c = document.createElement("canvas");
      c.width = size[0]; c.height = size[1];
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0, c.width, c.height);
      const merc = (la) => Math.log(Math.tan(Math.PI / 4 + (la * Math.PI) / 360));
      const yTop = merc(b.north), yBot = merc(b.south);
      const px = (lo) => ((lo - b.west) / (b.east - b.west)) * c.width;
      const py = (la) => ((yTop - merc(la)) / (yTop - yBot)) * c.height;
      g.beginPath();
      ring.forEach(([lo, la], i) => (i ? g.lineTo(px(lo), py(la)) : g.moveTo(px(lo), py(la))));
      g.closePath();
      g.fillStyle = "rgba(201,137,43,0.25)"; g.fill();
      g.lineWidth = 4; g.strokeStyle = "#F86A02"; g.stroke();
      g.fillStyle = "rgba(15,54,34,0.85)"; g.fillRect(0, c.height - 40, c.width, 40);
      g.fillStyle = "#fff"; g.font = "bold 20px sans-serif";
      g.fillText(label(area), 12, c.height - 13);
      return await new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
    } catch (_) {
      return null;
    }
  }

  document.addEventListener("change", (e) => {
    if (e.target && e.target.name === "job-type") show();
    if (e.target && e.target.id === "scope-not-sure" && e.target.checked) { if (st().map) setMode("move"); clearOutline(); }
  });
  document.addEventListener("click", (e) => {
    const btn = e.target && e.target.closest && e.target.closest("button");
    if (!btn) return;
    const m = btn.getAttribute("data-scope-mode");
    if (m) setMode(m);
    if (btn.id === "btn-scope-undo") undo();
    if (btn.id === "btn-scope-clear") clearOutline();
    if (btn.id === "btn-scope-lot") useLot();
  });
  show();

  window.BlakeScope = { isScopeJob, collect, summaryText, areaImageBlob, show, ringAreaM2 };
})();
