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
      const res = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(q)
      });
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

  global.TreeEngine = {
    geocode,
    esriExportUrl,
    streetViewEmbedUrl,
    overpassContext,
    nearestM,
    estimateHeightFt,
    priceTree,
    priceStump,
    stormAlertsForPoint,
    haversineM
  };
})(window);
