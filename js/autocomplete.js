/* Address autocomplete — Hustle Stack PRD: Nominatim + debounced search.
   Production HS web uses Mapbox (token via /api/config/mapbox).
   This static demo uses Photon (Nominatim OSM data) — free, no key —
   with LA/TX proximity bias matching HS (-92.5, 31.0). */
(function (global) {
  const PROXIMITY = { lon: -92.5, lat: 31.0 }; // LA/TX center — same as HS Mapbox proximity
  const MIN_CHARS = 3;
  const DEBOUNCE_MS = 300;
  const LIMIT = 6;

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
    return { id: f.properties?.osm_id || label + lon + lat, label, lat: Number(lat), lon: Number(lon), raw: f };
  }

  async function fetchSuggestions(query) {
    if (!query || query.trim().length < MIN_CHARS) return [];
    const q = query.trim();
    // Prefer Photon (autocomplete-friendly Nominatim index)
    try {
      const url =
        "https://photon.komoot.io/api/?" +
        new URLSearchParams({
          q,
          limit: String(LIMIT),
          lang: "en",
          lat: String(PROXIMITY.lat),
          lon: String(PROXIMITY.lon)
        });
      const res = await fetch(url);
      if (!res.ok) throw new Error("photon");
      const data = await res.json();
      let feats = (data.features || []).map(formatPhoton);
      // Prefer US / LA-ish
      feats = feats.filter((f) => {
        const c = (f.raw.properties && f.raw.properties.countrycode) || "";
        return !c || c.toLowerCase() === "us";
      });
      if (feats.length) return feats.slice(0, LIMIT);
    } catch (_) {}
    // Fallback Nominatim (PRD-named provider) — slower, still free
    try {
      const url =
        "https://nominatim.openstreetmap.org/search?" +
        new URLSearchParams({
          format: "json",
          addressdetails: "1",
          limit: String(LIMIT),
          countrycodes: "us",
          q
        });
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error("nominatim");
      const data = await res.json();
      return (data || []).map((r, i) => ({
        id: r.place_id || i,
        label: r.display_name,
        lat: parseFloat(r.lat),
        lon: parseFloat(r.lon),
        raw: r
      }));
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

    function setStatus(msg, ok) {
      if (onStatus) onStatus(msg, ok);
    }

    function render() {
      if (!listEl) return;
      listEl.innerHTML = "";
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
        li.innerHTML = `<span class="pin" aria-hidden="true"></span><span>${s.label}</span>`;
        li.addEventListener("mousedown", (e) => {
          e.preventDefault(); // keep focus; avoid blur race
          selectIndex(i);
        });
        listEl.appendChild(li);
      });
    }

    function selectIndex(i) {
      const s = suggestions[i];
      if (!s) return;
      input.value = s.label;
      confirmed = true;
      open = false;
      suggestions = [];
      render();
      setStatus("Address confirmed", true);
      if (onSelect) onSelect(s);
    }

    function selectHighlightedOrFirst() {
      if (!suggestions.length) return false;
      selectIndex(Math.max(0, Math.min(active, suggestions.length - 1)));
      return true;
    }

    function scheduleFetch(val) {
      confirmed = false;
      setStatus("Serving Louisiana & Texas — select from dropdown", false);
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        lastQuery = val;
        const list = await fetchSuggestions(val);
        if (input.value.trim() !== lastQuery.trim()) return; // stale
        suggestions = list;
        active = 0;
        open = list.length > 0;
        render();
      }, DEBOUNCE_MS);
    }

    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("autocomplete", "off");
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
        // PRD/Shaun: Enter selects suggestion — NEVER submit/navigate
        e.preventDefault();
        e.stopPropagation();
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
      }, 150);
    });

    input.addEventListener("focus", () => {
      if (suggestions.length) {
        open = true;
        render();
      }
    });

    if (form) {
      form.addEventListener(
        "submit",
        (e) => {
          // Block native navigation always; app handles start via button handler
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

  global.AddressAutocomplete = { attach, fetchSuggestions, DEBOUNCE_MS, MIN_CHARS };
})(window);
