/* Address autocomplete.
   No Google Places or Mapbox browser key was found in the box env or secret stores.
   Primary: ArcGIS World Geocoding suggest (free, no key, built for as-you-type US
   house numbers). Fallback: Photon, then Nominatim. Enter selects the top
   suggestion and never navigates. */
(function (global) {
  const PROXIMITY = { lon: -92.5, lat: 31.0 }; // LA / TX center — same as HS
  const MIN_CHARS = 3;
  const DEBOUNCE_MS = 280;
  const PROVIDER_MS = 2000;
  const LIMIT = 6;
  // Louisiana only (3 B's serves Central & Southwest Louisiana).
  const EXTENT = { xmin: -94.05, ymin: 28.9, xmax: -88.8, ymax: 33.03 };

  function preferLocal(list) {
    return (list || []).filter((s) => /,\s*(LA|Louisiana)\b/i.test(s.label || ""));
  }

  function inServiceBox(lat, lon) {
    return lat >= EXTENT.ymin && lat <= EXTENT.ymax && lon >= EXTENT.xmin && lon <= EXTENT.xmax;
  }

  function aborted(signal) {
    return !!(signal && signal.aborted);
  }

  async function fetchJson(url, opts, ms, signal) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms || PROVIDER_MS);
    const onAbort = () => ctrl.abort();
    if (signal) {
      if (signal.aborted) {
        clearTimeout(t);
        throw new DOMException("Aborted", "AbortError");
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }
    try {
      const res = await fetch(url, Object.assign({}, opts || {}, { signal: ctrl.signal }));
      if (!res.ok) throw new Error("http " + res.status);
      return await res.json();
    } finally {
      clearTimeout(t);
      if (signal) signal.removeEventListener("abort", onAbort);
    }
  }

  function formatPhoton(f) {
    const p = f.properties || {};
    const parts = [
      [p.housenumber, p.street].filter(Boolean).join(" "),
      p.name && !p.street ? p.name : null,
      p.city || p.town || p.village || p.county,
      p.state,
      p.postcode
    ].filter(Boolean);
    const label = parts.join(", ") || p.name || "Result";
    const [lon, lat] = f.geometry.coordinates;
    return {
      id: "ph-" + (p.osm_id || label) + lon + lat,
      label,
      lat: Number(lat),
      lon: Number(lon),
      raw: f
    };
  }

  async function esriSuggest(query, signal) {
    const attempts = [
      { category: "Address" },
      {} // short prefixes like "123 Ma" / "401 R" often fail if category is set
    ];
    for (let i = 0; i < attempts.length; i++) {
      if (aborted(signal)) throw new DOMException("Aborted", "AbortError");
      const extra = attempts[i];
      const params = {
        f: "json",
        text: query,
        maxSuggestions: String(LIMIT),
        countryCode: "USA",
        location: PROXIMITY.lon + "," + PROXIMITY.lat,
        searchExtent: JSON.stringify({ xmin: EXTENT.xmin, ymin: EXTENT.ymin, xmax: EXTENT.xmax, ymax: EXTENT.ymax, spatialReference: { wkid: 4326 } })
      };
      if (extra.category) params.category = extra.category;
      const url =
        "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/suggest?" +
        new URLSearchParams(params);
      let data;
      try {
        data = await fetchJson(url, null, PROVIDER_MS, signal);
      } catch (err) {
        if (aborted(signal)) throw err;
        // Timeout or network error: skip the second ArcGIS attempt and let a
        // fallback provider run. Empty results still try without category.
        return [];
      }
      const list = preferLocal(
        (data.suggestions || [])
          .filter((s) => s && s.text)
          .map((s, idx) => ({
            id: "esri-" + (s.magicKey || idx),
            label: s.text,
            magicKey: s.magicKey,
            lat: null,
            lon: null,
            raw: s
          }))
      );
      if (list.length) return list.slice(0, LIMIT);
    }
    return [];
  }

  async function esriResolve(item) {
    if (item && item.lat != null && item.lon != null) return item;
    const params = {
      f: "json",
      maxLocations: "1",
      outSR: "4326",
      sourceCountry: "USA"
    };
    if (item && item.magicKey) {
      params.magicKey = item.magicKey;
      params.singleLine = item.label || "";
    } else {
      params.singleLine = (item && item.label) || String(item || "");
      params.location = PROXIMITY.lon + "," + PROXIMITY.lat;
      params.searchExtent = JSON.stringify({ xmin: EXTENT.xmin, ymin: EXTENT.ymin, xmax: EXTENT.xmax, ymax: EXTENT.ymax, spatialReference: { wkid: 4326 } });
    }
    const url =
      "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?" +
      new URLSearchParams(params);
    const data = await fetchJson(url);
    const c = (data.candidates || [])[0];
    if (!c || !c.location) throw new Error("not found");
    if (!inServiceBox(Number(c.location.y), Number(c.location.x))) throw new Error("outside Louisiana");
    return {
      id: item && item.id,
      label: c.address || (item && item.label) || "",
      lat: Number(c.location.y),
      lon: Number(c.location.x),
      raw: c
    };
  }

  async function photonSuggest(query, signal) {
    const url =
      "https://photon.komoot.io/api/?" +
      new URLSearchParams({
        q: query,
        limit: String(LIMIT),
        lang: "en",
        lat: String(PROXIMITY.lat),
        lon: String(PROXIMITY.lon),
        bbox: [EXTENT.xmin, EXTENT.ymin, EXTENT.xmax, EXTENT.ymax].join(",")
      });
    const data = await fetchJson(url, null, PROVIDER_MS, signal);
    return (data.features || [])
      .map(formatPhoton)
      .filter((f) => {
        const c = (f.raw.properties && f.raw.properties.countrycode) || "";
        if (c && c.toLowerCase() !== "us") return false;
        return inServiceBox(f.lat, f.lon);
      })
      .slice(0, LIMIT);
  }

  async function nominatimSuggest(query, signal) {
    const url =
      "https://nominatim.openstreetmap.org/search?" +
      new URLSearchParams({
        format: "json",
        addressdetails: "1",
        limit: String(LIMIT),
        countrycodes: "us",
        q: query,
        viewbox: [EXTENT.xmin, EXTENT.ymax, EXTENT.xmax, EXTENT.ymin].join(","),
        bounded: "1"
      });
    const data = await fetchJson(url, { headers: { Accept: "application/json" } }, PROVIDER_MS, signal);
    return (data || []).filter((r) => inServiceBox(parseFloat(r.lat), parseFloat(r.lon))).map((r, i) => ({
      id: "nom-" + (r.place_id || i),
      label: r.display_name,
      lat: parseFloat(r.lat),
      lon: parseFloat(r.lon),
      raw: r
    }));
  }

  function delay(ms, signal) {
    return new Promise((resolve, reject) => {
      if (aborted(signal)) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      const t = setTimeout(resolve, ms);
      if (signal) {
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(t);
            reject(new DOMException("Aborted", "AbortError"));
          },
          { once: true }
        );
      }
    });
  }

  async function firstNonEmpty(promises, signal) {
    if (!promises.length) return [];
    return new Promise((resolve) => {
      let pending = promises.length;
      const done = (list) => {
        if (aborted(signal)) { resolve([]); return; }
        if (list && list.length) { resolve(list); return; }
        pending -= 1;
        if (pending <= 0) resolve([]);
      };
      promises.forEach((p) => p.then(done, () => done([])));
    });
  }

  async function fetchSuggestions(query, signal) {
    if (!query || query.trim().length < MIN_CHARS) return [];
    const q = query.trim();
    const esriP = esriSuggest(q, signal).catch((err) => {
      if (aborted(signal)) throw err;
      return [];
    });

    // Give ArcGIS a short head start. If it is still pending, overlap Photon
    // and take the first non-empty list so the UI does not wait out a hang.
    const early = await Promise.race([
      esriP.then((list) => ({ list })),
      delay(600, signal).then(() => null).catch(() => null)
    ]).catch(() => null);
    if (aborted(signal)) return [];
    if (early && early.list && early.list.length) return early.list;

    const photonP = photonSuggest(q, signal).then(preferLocal).catch((err) => {
      if (aborted(signal)) throw err;
      return [];
    });
    const first = await firstNonEmpty([esriP, photonP], signal);
    if (aborted(signal)) return [];
    if (first.length) return first;
    try {
      return preferLocal(await nominatimSuggest(q, signal));
    } catch (_) {
      return [];
    }
  }

  /**
   * Attach autocomplete to an input inside a form.
   * Enter selects highlighted/first suggestion — never submits the form.
   */
  function attach({ input, form, listEl, onSelect, onStatus }) {
    let suggestions = [];
    let open = false;
    let active = 0;
    let confirmed = false;
    let debounceTimer = null;
    let lastQuery = "";
    let reqSeq = 0;
    let searching = false;
    let inflight = null;

    function setStatus(msg, ok) {
      if (onStatus) onStatus(msg, ok);
    }

    // Keep the list in the page flow under the input (CSS: position absolute). The old
    // position:fixed math used window.innerHeight, which on iPhones ignores the keyboard,
    // so the list could land behind it. Only cap the height to the visible viewport.
    function placeList() {
      if (!listEl || listEl.hidden) return;
      const r = input.getBoundingClientRect();
      const vv = window.visualViewport;
      const visibleBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
      const spaceBelow = visibleBottom - r.bottom - 12;
      listEl.style.maxHeight = Math.max(150, Math.min(280, spaceBelow)) + "px";
    }

    function render() {
      if (!listEl) return;
      listEl.innerHTML = "";
      document.body.classList.toggle("addr-list-open", !!(open && suggestions.length));
      if (!open || !suggestions.length) {
        listEl.hidden = true;
        input.setAttribute("aria-expanded", "false");
        return;
      }
      listEl.hidden = false;
      input.setAttribute("aria-expanded", "true");
      suggestions.forEach((s, i) => {
        const li = document.createElement("li");
        li.id = "addr-opt-" + i;
        li.setAttribute("role", "option");
        li.setAttribute("aria-selected", i === active ? "true" : "false");
        li.className = "addr-opt" + (i === active ? " is-active" : "");
        const pin = document.createElement("span");
        pin.className = "pin";
        pin.setAttribute("aria-hidden", "true");
        const text = document.createElement("span");
        text.textContent = s.label;
        li.appendChild(pin);
        li.appendChild(text);
        li.addEventListener("mousedown", (e) => {
          e.preventDefault(); // keep focus; avoid blur race
          selectIndex(i);
        });
        li.addEventListener("click", (e) => {
          e.preventDefault();
          selectIndex(i);
        });
        listEl.appendChild(li);
      });
      placeList();
    }

    async function selectIndex(i) {
      const s = suggestions[i];
      if (!s) return false;
      try {
        setStatus("Pinning that address…", false);
        const resolved = await esriResolve(s);
        input.value = resolved.label;
        confirmed = true;
        open = false;
        suggestions = [];
        render();
        setStatus("Address confirmed", true);
        if (onSelect) onSelect(resolved);
        return true;
      } catch (_) {
        if (s.lat != null && s.lon != null) {
          input.value = s.label;
          confirmed = true;
          open = false;
          suggestions = [];
          render();
          setStatus("Address confirmed", true);
          if (onSelect) onSelect(s);
          return true;
        }
        setStatus("Couldn’t pin that one — try another suggestion.", false);
        return false;
      }
    }

    function selectHighlightedOrFirst() {
      if (!suggestions.length) return Promise.resolve(false);
      return selectIndex(Math.max(0, Math.min(active, suggestions.length - 1)));
    }

    function scheduleFetch(val) {
      confirmed = false;
      if (debounceTimer) clearTimeout(debounceTimer);
      if (inflight) {
        inflight.abort();
        inflight = null;
      }
      if (!val || val.trim().length < MIN_CHARS) {
        suggestions = [];
        open = false;
        searching = false;
        render();
        setStatus("Serving Louisiana & Texas — suggestions appear as you type", false);
        return;
      }
      searching = true;
      setStatus("Searching addresses…", false);
      debounceTimer = setTimeout(async () => {
        const seq = ++reqSeq;
        const ctrl = new AbortController();
        inflight = ctrl;
        lastQuery = val;
        let list = [];
        try {
          list = await fetchSuggestions(val, ctrl.signal);
        } catch (_) {
          list = [];
        }
        if (seq !== reqSeq || input.value.trim() !== lastQuery.trim()) return;
        if (inflight === ctrl) inflight = null;
        searching = false;
        suggestions = list;
        active = 0;
        open = list.length > 0;
        render();
        if (!list.length) {
          setStatus("No matches yet — keep typing the city, like Lake Charles or Lafayette", false);
        } else {
          setStatus("Select your address from the list", false);
        }
      }, DEBOUNCE_MS);
    }

    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("autocomplete", "off");
    input.setAttribute("spellcheck", "false");
    if (listEl) {
      listEl.id = listEl.id || "addr-suggestions";
      input.setAttribute("aria-controls", listEl.id);
    }

    input.addEventListener("input", () => {
      scheduleFetch(input.value);
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        if (!suggestions.length) return;
        e.preventDefault();
        open = true;
        active = (active + 1) % suggestions.length;
        render();
        return;
      }
      if (e.key === "ArrowUp") {
        if (!suggestions.length) return;
        e.preventDefault();
        open = true;
        active = (active - 1 + suggestions.length) % suggestions.length;
        render();
        return;
      }
      if (e.key === "Enter") {
        // Shaun: Enter selects suggestion — NEVER submit/navigate
        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
        if (open && suggestions.length) {
          selectHighlightedOrFirst();
        }
        return;
      }
      if (e.key === "Escape") {
        open = false;
        render();
      }
    });

    input.addEventListener("blur", () => {
      setTimeout(() => {
        open = false;
        render();
      }, 180);
    });

    input.addEventListener("focus", () => {
      if (suggestions.length) {
        open = true;
        render();
      }
    });

    window.addEventListener("resize", placeList);
    if (window.visualViewport) window.visualViewport.addEventListener("resize", placeList);
    window.addEventListener("scroll", placeList, true);

    if (form) {
      form.addEventListener(
        "submit",
        (e) => {
          e.preventDefault();
          e.stopPropagation();
        },
        true
      );
    }

    return {
      isConfirmed: () => confirmed,
      getValue: () => input.value.trim(),
      selectHighlightedOrFirst,
      isSearching: () => searching,
      resolve: esriResolve,
      setConfirmedAddress(label, lat, lon) {
        input.value = label;
        confirmed = true;
        suggestions = [];
        open = false;
        render();
        setStatus("Address confirmed", true);
        if (onSelect) onSelect({ label, lat, lon });
      }
    };
  }

  global.inLouisiana = inServiceBox;
  global.AddressAutocomplete = {
    attach,
    fetchSuggestions,
    resolve: esriResolve,
    DEBOUNCE_MS,
    MIN_CHARS
  };
})(window);
