/* Free-imagery tree quote engine (client-side).
   Sources: ArcGIS geocode (Photon/Nominatim fallback), satellite imagery tiles,
   Overpass (OSM buildings + power lines), api.weather.gov alerts,
   SPC storm reports. No paid Maps/Planet/Maxar keys. */
(function (global) {
  const EARTH = 6371000;

  function haversineM(a, b) {
    const toR = (d) => (d * Math.PI) / 180;
    const dLat = toR(b.lat - a.lat);
    const dLon = toR(b.lon - a.lon);
    const lat1 = toR(a.lat);
    const lat2 = toR(b.lat);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH * Math.asin(Math.sqrt(h));
  }

  async function geocode(address) {
    const tries = [
      async () => {
        const params = new URLSearchParams({
          f: "json",
          singleLine: address,
          maxLocations: "1",
          outSR: "4326",
          sourceCountry: "USA",
          location: "-92.5,31.0"
        });
        const res = await fetch(
          "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?" + params
        );
        if (!res.ok) throw new Error("esri");
        const data = await res.json();
        const c = data.candidates && data.candidates[0];
        if (!c || !c.location) throw new Error("not found");
        return {
          lat: Number(c.location.y),
          lon: Number(c.location.x),
          displayName: c.address || address
        };
      },
      async () => {
        const res = await fetch(
          "https://photon.komoot.io/api/?limit=1&lat=31&lon=-92.5&q=" + encodeURIComponent(address)
        );
        if (!res.ok) throw new Error("photon");
        const data = await res.json();
        const f = data.features && data.features[0];
        if (!f) throw new Error("not found");
        const [lon, lat] = f.geometry.coordinates;
        const p = f.properties || {};
        return {
          lat: Number(lat),
          lon: Number(lon),
          displayName:
            [p.housenumber, p.street || p.name, p.city || p.town || p.village, p.state, p.postcode]
              .filter(Boolean)
              .join(", ") || address
        };
      },
      async () => {
        const res = await fetch(
          "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=" +
            encodeURIComponent(address),
          { headers: { Accept: "application/json" } }
        );
        if (!res.ok) throw new Error("nominatim");
        const data = await res.json();
        if (!data[0]) throw new Error("not found");
        return {
          lat: parseFloat(data[0].lat),
          lon: parseFloat(data[0].lon),
          displayName: data[0].display_name
        };
      }
    ];
    let last;
    for (const fn of tries) {
      try {
        return await fn();
      } catch (e) {
        last = e;
      }
    }
    throw last || new Error("geocode failed");
  }

  function latLonToTile(lat, lon, z) {
    const n = 2 ** z;
    const x = Math.floor(((lon + 180) / 360) * n);
    const y = Math.floor(
      ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n
    );
    return { x, y, z };
  }

  /** Centered satellite snapshot (free imagery, no key). spanM ~ yard width. */
  function esriExportUrl(lat, lon, size = 800, meters = 160) {
    const width = typeof size === "number" ? size : 800;
    const height = Math.round(width * 0.65);
    const spanM = meters || 160;
    const dLat = spanM / 111320;
    const dLon = spanM / (111320 * Math.cos((lat * Math.PI) / 180));
    const bbox = [lon - dLon, lat - dLat, lon + dLon, lat + dLat].join(",");
    return (
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?" +
      new URLSearchParams({
        bbox,
        bboxSR: "4326",
        imageSR: "3857",
        size: width + "," + height,
        format: "jpg",
        f: "image"
      })
    );
  }

  function streetViewEmbedUrl(lat, lon) {
    // Keyless street-level embed. cbp must be present or the embed renders empty.
    return (
      "https://www.google.com/maps?layer=c&cbll=" +
      lat + "," + lon +
      "&cbp=12,0,0,0,0&hl=en&output=svembed"
    );
  }

  async function overpassContext(lat, lon, radiusM = 80) {
    const q = `
[out:json][timeout:25];
(
  way["building"](around:${radiusM},${lat},${lon});
  relation["building"](around:${radiusM},${lat},${lon});
  way["power"="line"](around:${radiusM},${lat},${lon});
  way["power"="minor_line"](around:${radiusM},${lat},${lon});
  node["power"="tower"](around:${radiusM},${lat},${lon});
  node["power"="pole"](around:${radiusM},${lat},${lon});
);
out center tags;`;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(q),
        signal: ctrl.signal
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error("overpass " + res.status);
      const data = await res.json();
      const buildings = [];
      const power = [];
      (data.elements || []).forEach((el) => {
        const c = el.center || { lat: el.lat, lon: el.lon };
        if (!c || c.lat == null) return;
        const pt = { lat: c.lat, lon: c.lon };
        if (el.tags && el.tags.building) buildings.push(pt);
        if (el.tags && String(el.tags.power || "").length) power.push(pt);
      });
      return { buildings, power };
    } catch (_) {
      return { buildings: [], power: [], error: true };
    }
  }

  function nearestM(origin, pts) {
    if (!pts.length) return null;
    let best = Infinity;
    pts.forEach((p) => {
      const d = haversineM(origin, p);
      if (d < best) best = d;
    });
    return best;
  }

  /** Rough canopy→height estimate by species (demo heuristic). */
  function estimateHeightFt(canopyFt, species) {
    const ratios = {
      pine: 2.2,
      oak: 1.6,
      cypress: 1.8,
      pecan: 1.7,
      sweetgum: 1.9,
      unknown: 1.7
    };
    const r = ratios[species] || 1.7;
    return Math.round(Math.min(120, Math.max(12, canopyFt * r)));
  }

  function priceTree(t, pricing, opts) {
    const bands = pricing.trees.heightBands;
    const band = bands.find((b) => t.heightFt <= b.maxFt) || bands[bands.length - 1];
    let low = band.low;
    let high = band.high;
    const sp = pricing.trees.speciesHardness[t.species] || 1;
    low *= sp;
    high *= sp;
    if (t.nearHouse) {
      low *= pricing.trees.nearStructure;
      high *= pricing.trees.nearStructure;
    }
    if (t.nearLines) {
      low *= pricing.trees.nearLines;
      high *= pricing.trees.nearLines;
    }
    if (t.haulOff) {
      low += pricing.trees.haulOff.low;
      high += pricing.trees.haulOff.high;
    }
    if (t.grind) {
      low += pricing.trees.grindWithRemoval.low;
      high += pricing.trees.grindWithRemoval.high;
    }
    if (opts && opts.emergency) {
      low *= pricing.stormEmergencyMult;
      high *= pricing.stormEmergencyMult;
    }
    return { low: Math.round(low), high: Math.round(high), band: band.label };
  }

  function priceStump(s, pricing) {
    const band =
      pricing.stumps.bands.find((b) => s.diameterIn <= b.maxIn) ||
      pricing.stumps.bands[pricing.stumps.bands.length - 1];
    let low = band.low;
    let high = band.high;
    if (s.haulMulch) {
      low += pricing.stumps.haulMulch.low;
      high += pricing.stumps.haulMulch.high;
    }
    return { low, high };
  }

  async function stormAlertsForPoint(lat, lon) {
    const headers = {
      Accept: "application/geo+json",
      "User-Agent": "3BsTreeDemo/1.0 (shaun.brasher@gmail.com)"
    };
    const out = { nws: [], spc: [], flag: false };
    try {
      const url =
        `https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`;
      const res = await fetch(url, { headers });
      if (res.ok) {
        const data = await res.json();
        out.nws = (data.features || []).map((f) => ({
          event: f.properties.event,
          headline: f.properties.headline,
          severity: f.properties.severity,
          ends: f.properties.ends
        }));
      }
    } catch (_) {}
    try {
      // SPC storm reports — latest day JSON (free)
      const today = new Date();
      const y = today.getUTCFullYear();
      const m = String(today.getUTCMonth() + 1).padStart(2, "0");
      const d = String(today.getUTCDate()).padStart(2, "0");
      const spcUrl = `https://www.spc.noaa.gov/climo/reports/${y}${m}${d}_rpts_filtered.json`;
      const res = await fetch(spcUrl);
      if (res.ok) {
        const data = await res.json();
        const all = []
          .concat(data.wind || [])
          .concat(data.hail || [])
          .concat(data.tornado || []);
        out.spc = all
          .filter((r) => {
            const rlat = parseFloat(r.lat || r.Lat);
            const rlon = parseFloat(r.lon || r.Lon);
            if (!isFinite(rlat) || !isFinite(rlon)) return false;
            return haversineM({ lat, lon }, { lat: rlat, lon: rlon }) < 80000;
          })
          .slice(0, 8)
          .map((r) => ({
            type: r.type || "report",
            location: r.location || r.Location || "",
            comment: r.comment || r.Comment || ""
          }));
      }
    } catch (_) {}
    out.flag = out.nws.length > 0 || out.spc.length > 0;
    // Hook for later HD imagery pulls when flag is true
    out.hdImagerySuggested = out.flag;
    return out;
  }

  const PARCEL_LAYERS = [
    {
      id: "calcasieu",
      url: "https://lak-dc-arcgis2.cppj.net/arcgis/rest/services/HubLayers/Parcels/FeatureServer/0/query",
      contains(lat, lon) {
        return lon <= -92.85 && lon >= -93.95 && lat >= 29.95 && lat <= 30.55;
      }
    },
    {
      id: "lafayette",
      url: "https://maps.lafayettela.gov/arcgis/rest/services/MGO/MGOParcelsService/FeatureServer/0/query",
      contains(lat, lon) {
        return lon <= -91.85 && lon >= -92.25 && lat >= 30.05 && lat <= 30.38;
      }
    }
  ];

  function outerRing(geom) {
    if (!geom) return null;
    if (geom.type === "Polygon") return geom.coordinates[0];
    if (geom.type === "MultiPolygon") return geom.coordinates[0][0];
    return null;
  }

  function ringCentroid(ring) {
    let x = 0, y = 0, n = 0;
    (ring || []).forEach((pt) => {
      x += pt[0];
      y += pt[1];
      n += 1;
    });
    return n ? { lon: x / n, lat: y / n } : { lon: 0, lat: 0 };
  }

  function pointInRing(lon, lat, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1];
      const xj = ring[j][0], yj = ring[j][1];
      const intersect = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function ringBounds(ring) {
    let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
    ring.forEach((pt) => {
      west = Math.min(west, pt[0]);
      east = Math.max(east, pt[0]);
      south = Math.min(south, pt[1]);
      north = Math.max(north, pt[1]);
    });
    return { west, south, east, north };
  }

  function padBounds(b, pad = 0.18) {
    const dx = (b.east - b.west) * pad;
    const dy = (b.north - b.south) * pad;
    return {
      west: b.west - dx,
      south: b.south - dy,
      east: b.east + dx,
      north: b.north + dy
    };
  }

  function expandToMinSize(b, minMeters = 58) {
    const midLat = (b.north + b.south) / 2;
    const midLon = (b.east + b.west) / 2;
    const dLat = minMeters / 111320;
    const dLon = minMeters / (111320 * Math.cos((midLat * Math.PI) / 180));
    return {
      west: Math.min(b.west, midLon - dLon),
      east: Math.max(b.east, midLon + dLon),
      south: Math.min(b.south, midLat - dLat),
      north: Math.max(b.north, midLat + dLat)
    };
  }

  function boundsFromPoint(lat, lon, meters = 48) {
    const dLat = meters / 111320;
    const dLon = meters / (111320 * Math.cos((lat * Math.PI) / 180));
    return { west: lon - dLon, south: lat - dLat, east: lon + dLon, north: lat + dLat };
  }

  function houseNum(s) {
    const m = String(s || "").match(/(\d+)/);
    return m ? m[1] : "";
  }

  function featureKey(f) {
    const p = (f && f.properties) || {};
    return p.OBJECTID || p.OBJECTID_1 || p.ASMNTNUM || f.id || JSON.stringify(outerRing(f.geometry)).slice(0, 48);
  }

  function mergeUniqueFeatures(lists) {
    const out = [];
    const seen = {};
    lists.forEach((list) => {
      (list || []).forEach((f) => {
        const k = featureKey(f);
        if (seen[k]) return;
        seen[k] = true;
        out.push(f);
      });
    });
    return out;
  }

  async function queryParcelLayer(url, lat, lon) {
    const tries = [
      { geometry: lon + "," + lat, geometryType: "esriGeometryPoint" },
      (() => {
        const b = boundsFromPoint(lat, lon, 40);
        return {
          geometry: [b.west, b.south, b.east, b.north].join(","),
          geometryType: "esriGeometryEnvelope"
        };
      })()
    ];
    const collected = [];
    for (let i = 0; i < tries.length; i++) {
      const extra = tries[i];
      const params = new URLSearchParams({
        geometry: extra.geometry,
        geometryType: extra.geometryType,
        inSR: "4326",
        spatialRel: "esriSpatialRelIntersects",
        outFields: "*",
        returnGeometry: "true",
        outSR: "4326",
        f: "geojson"
      });
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      try {
        const res = await fetch(url + "?" + params, { signal: ctrl.signal });
        if (!res.ok) continue;
        const data = await res.json();
        if (data.features && data.features.length) collected.push(data.features);
      } catch (_) {
      } finally {
        clearTimeout(timer);
      }
    }
    return mergeUniqueFeatures(collected);
  }

  function siteAddress(props) {
    return String((props || {}).PHYSICALAD || (props || {}).PROPERTY_LOCATION || (props || {}).SITEADRESS || "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
  }

  function pinStem(props) {
    const pin = String((props || {}).PIN || (props || {}).ASMNTNUM || (props || {}).ASSMT_NUM || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!pin) return "";
    return pin.replace(/\s*-\s*\d{1,4}(\s*-\s*\d{1,2})?$/, "").trim();
  }

  function ringSpan(ring) {
    const b = ringBounds(ring);
    const mid = (b.north + b.south) / 2;
    const w = Math.max(0.1, (b.east - b.west) * 111320 * Math.cos((mid * Math.PI) / 180));
    const h = Math.max(0.1, (b.north - b.south) * 111320);
    return { w, h, aspect: Math.max(w, h) / Math.min(w, h) };
  }

  function convexHull(points) {
    const pts = points
      .filter((p) => p && isFinite(p[0]) && isFinite(p[1]))
      .slice()
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (pts.length <= 2) return pts;
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [];
    pts.forEach((p) => {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
      lower.push(p);
    });
    const upper = [];
    pts.slice().reverse().forEach((p) => {
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
      upper.push(p);
    });
    const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
    if (hull.length && (hull[0][0] !== hull[hull.length - 1][0] || hull[0][1] !== hull[hull.length - 1][1])) {
      hull.push(hull[0]);
    }
    return hull;
  }

  function siblingFeatures(picked, features) {
    const props = picked.f.properties || {};
    const addr = siteAddress(props);
    const stem = pinStem(props);
    return (features || []).filter((f) => {
      const p = f.properties || {};
      return (addr && siteAddress(p) === addr) || (stem && pinStem(p) === stem);
    });
  }

  function pickParcelFeature(features, lat, lon, address) {
    const hn = houseNum(address);
    const scored = features.map((f) => {
      const ring = outerRing(f.geometry) || [];
      const contains = ring.length ? pointInRing(lon, lat, ring) : false;
      const c = ringCentroid(ring);
      const dist = haversineM({ lat, lon }, { lat: c.lat, lon: c.lon });
      const props = f.properties || {};
      const site = siteAddress(props);
      const addrMatch = !!(hn && site.includes(hn));
      const span = ring.length ? ringSpan(ring) : { w: 0, h: 0, aspect: 99 };
      const sliver = span.aspect > 5 && Math.min(span.w, span.h) < 22;
      return { f, contains, dist, addrMatch, ring, sliver, span };
    });
    scored.sort((a, b) => {
      if (a.contains !== b.contains) return a.contains ? -1 : 1;
      if (a.addrMatch !== b.addrMatch) return a.addrMatch ? -1 : 1;
      if (a.sliver !== b.sliver) return a.sliver ? 1 : -1;
      return a.dist - b.dist;
    });
    return scored[0] || null;
  }

  async function fetchParcel(lat, lon, address) {
    const ordered = PARCEL_LAYERS.slice().sort((a, b) => {
      const ao = a.contains(lat, lon) ? 0 : 1;
      const bo = b.contains(lat, lon) ? 0 : 1;
      return ao - bo;
    });
    for (let i = 0; i < ordered.length; i++) {
      const layer = ordered[i];
      if (!layer.contains(lat, lon) && i > 0) continue;
      try {
        const feats = await queryParcelLayer(layer.url, lat, lon);
        const picked = pickParcelFeature(feats, lat, lon, address);
        if (!picked || !picked.ring.length) continue;
        const kin = siblingFeatures(picked, feats);
        const pts = [];
        (kin.length ? kin : [picked.f]).forEach((f) => {
          const ring = outerRing(f.geometry) || [];
          ring.forEach((pt) => pts.push(pt));
        });
        const ring = (kin.length > 1 ? convexHull(pts) : picked.ring) || picked.ring;
        if (!ring.length) continue;
        const bounds = ringBounds(ring);
        return {
          source: layer.id,
          exact: true,
          ring,
          bounds,
          merged: kin.length > 1,
          properties: picked.f.properties || {}
        };
      } catch (_) {}
    }
    return null;
  }

  function ringToLatLngs(ring) {
    return (ring || []).map((pt) => [pt[1], pt[0]]);
  }

  /** Snapshot of a bbox at native public World Imagery resolution (~0.30 m/px).
   *  Requesting finer than that returns HTTP 500 "Error: bytes". */
  function esriBBoxExportUrl(bounds, maxW = 800, maxH = 520) {
    const midLat = (bounds.north + bounds.south) / 2;
    const widthM = Math.max(24, (bounds.east - bounds.west) * 111320 * Math.cos((midLat * Math.PI) / 180));
    const heightM = Math.max(24, (bounds.north - bounds.south) * 111320);
    const minMpp = 0.30;
    let w = Math.round(widthM / minMpp);
    let h = Math.round(heightM / minMpp);
    if (w > maxW) {
      const s = maxW / w;
      w = maxW;
      h = Math.max(160, Math.round(h * s));
    }
    if (h > maxH) {
      const s = maxH / h;
      h = maxH;
      w = Math.max(160, Math.round(w * s));
    }
    w = Math.max(160, Math.min(maxW, w));
    h = Math.max(160, Math.min(maxH, h));
    const bbox = [bounds.west, bounds.south, bounds.east, bounds.north].join(",");
    return (
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?" +
      new URLSearchParams({
        bbox,
        bboxSR: "4326",
        imageSR: "3857",
        size: w + "," + h,
        format: "jpg",
        f: "image"
      })
    );
  }

  function loadCrossImage(src) {
    return new Promise(async (resolve, reject) => {
      const done = (url) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
      };
      try {
        const res = await fetch(src, { mode: "cors" });
        if (!res.ok) throw new Error("img " + res.status);
        const blob = await res.blob();
        done(URL.createObjectURL(blob));
      } catch (err) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => reject(err);
        img.src = src;
      }
    });
  }

  function pixelToLonLat(x, y, width, height, bounds) {
    const lon = bounds.west + (x / width) * (bounds.east - bounds.west);
    const lat = bounds.north - (y / height) * (bounds.north - bounds.south);
    return { lat, lon };
  }

  /**
   * Simple excess-green canopy blobs on a satellite snapshot.
   * Returns up to 16 likely trees with canopy size in feet.
   */
  async function detectTreesFromExport(imageUrl, bounds) {
    const img = await loadCrossImage(imageUrl);
    const scale = 3;
    const w = Math.max(8, Math.floor(img.naturalWidth / scale));
    const h = Math.max(8, Math.floor(img.naturalHeight / scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    const mask = new Uint8Array(w * h);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const exg = 2 * g - r - b;
      mask[p] = exg > 28 && g > 55 && g > r + 10 && g > b + 6 ? 1 : 0;
    }
    const vis = new Uint8Array(w * h);
    const blobs = [];
    const spanM = haversineM(
      { lat: bounds.south, lon: bounds.west },
      { lat: bounds.south, lon: bounds.east }
    );
    const mPerPx = (spanM / img.naturalWidth) * scale;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (!mask[idx] || vis[idx]) continue;
        const stack = [idx];
        vis[idx] = 1;
        let count = 0, sx = 0, sy = 0, minx = x, maxx = x, miny = y, maxy = y;
        while (stack.length) {
          const cur = stack.pop();
          const cy = (cur / w) | 0;
          const cx = cur - cy * w;
          count++;
          sx += cx;
          sy += cy;
          if (cx < minx) minx = cx;
          if (cx > maxx) maxx = cx;
          if (cy < miny) miny = cy;
          if (cy > maxy) maxy = cy;
          for (let ny = cy - 1; ny <= cy + 1; ny++) {
            for (let nx = cx - 1; nx <= cx + 1; nx++) {
              if (ny < 0 || ny >= h || nx < 0 || nx >= w) continue;
              const nidx = ny * w + nx;
              if (mask[nidx] && !vis[nidx]) {
                vis[nidx] = 1;
                stack.push(nidx);
              }
            }
          }
        }
        const bw = maxx - minx + 1;
        const bh = maxy - miny + 1;
        const aspect = Math.max(bw, bh) / Math.max(1, Math.min(bw, bh));
        const diamM = Math.max(bw, bh) * mPerPx;
        const canopyFt = diamM * 3.281;
        if (count < 14 || count > 2800) continue;
        if (aspect > 2.8) continue;
        if (canopyFt < 6 || canopyFt > 85) continue;
        const cx = sx / count;
        const cy = sy / count;
        const ll = pixelToLonLat(cx * scale, cy * scale, img.naturalWidth, img.naturalHeight, bounds);
        blobs.push({
          lat: ll.lat,
          lon: ll.lon,
          canopyFt: Math.round(canopyFt),
          kind: "tree",
          score: count / aspect
        });
      }
    }
    blobs.sort((a, b) => b.score - a.score);
    // de-dupe overlapping detections
    const kept = [];
    blobs.forEach((b) => {
      if (kept.some((k) => haversineM(k, b) < Math.max(4, (b.canopyFt * 0.3048) * 0.55))) return;
      kept.push(b);
    });
    return kept.slice(0, 16);
  }

  async function fetchOsmTrees(lat, lon, radiusM = 70) {
    const q = `[out:json][timeout:15];node["natural"="tree"](around:${radiusM},${lat},${lon});out;`;
    try {
      const res = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(q)
      });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.elements || [])
        .filter((el) => el.lat != null)
        .map((el) => ({ lat: el.lat, lon: el.lon, canopyFt: 22, kind: "tree", source: "osm" }));
    } catch (_) {
      return [];
    }
  }

  global.TreeEngine = {
    geocode,
    esriExportUrl,
    esriBBoxExportUrl,
    streetViewEmbedUrl,
    overpassContext,
    nearestM,
    estimateHeightFt,
    priceTree,
    priceStump,
    stormAlertsForPoint,
    haversineM,
    fetchParcel,
    padBounds,
    expandToMinSize,
    boundsFromPoint,
    ringToLatLngs,
    pointInRing,
    detectTreesFromExport,
    fetchOsmTrees
  };
})(window);
