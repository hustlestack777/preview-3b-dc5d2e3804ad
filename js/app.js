(() => {
  const JOBS = {
    smallTrim: { label: "Trim / pruning", hint: "Light canopy work", low: 400, high: 900 },
    mediumRemoval: { label: "Standard removal", hint: "Typical yard tree", low: 700, high: 1900 },
    largeRemoval: { label: "Large / near-structure", hint: "Complex access possible", low: 1500, high: 3500 },
    stormEmergency: { label: "Storm / emergency", hint: "Downed or leaning", low: 560, high: 3290 },
    stumpOnly: { label: "Stump grinding", hint: "Per stump", low: 150, high: 450 }
  };

  const state = {
    address: "",
    lat: null,
    lon: null,
    displayName: "",
    job: "mediumRemoval",
    photos: 0,
    name: "",
    phone: ""
  };

  const $ = (s, r = document) => r.querySelector(s);
  const money = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

  const chips = $("#job-chips");
  Object.entries(JOBS).forEach(([key, job]) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip" + (key === state.job ? " is-on" : "");
    b.innerHTML = `<strong>${job.label}</strong><span>${job.hint}</span>`;
    b.addEventListener("click", () => {
      state.job = key;
      chips.querySelectorAll(".chip").forEach((c) => c.classList.remove("is-on"));
      b.classList.add("is-on");
    });
    chips.appendChild(b);
  });

  $("#photos").addEventListener("change", (e) => {
    const files = Array.from(e.target.files || []).slice(0, 6);
    state.photos = files.length;
    const prev = $("#photo-prev");
    prev.innerHTML = "";
    files.forEach((f) => {
      const img = document.createElement("img");
      img.src = URL.createObjectURL(f);
      img.alt = f.name;
      prev.appendChild(img);
    });
  });

  async function geocode(address) {
    const tries = [
      async () => {
        const res = await fetch("https://photon.komoot.io/api/?limit=1&q=" + encodeURIComponent(address));
        if (!res.ok) throw new Error("photon");
        const data = await res.json();
        const f = data.features && data.features[0];
        if (!f) throw new Error("not found");
        const [lon, lat] = f.geometry.coordinates;
        const p = f.properties || {};
        return {
          lat: Number(lat),
          lon: Number(lon),
          displayName: [p.name, p.street, p.city || p.town || p.village, p.state].filter(Boolean).join(", ") || address
        };
      },
      async () => {
        const res = await fetch(
          "https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=" +
            encodeURIComponent(address)
        );
        if (!res.ok) throw new Error("meteo");
        const data = await res.json();
        const r = data.results && data.results[0];
        if (!r) throw new Error("not found");
        return { lat: r.latitude, lon: r.longitude, displayName: [r.name, r.admin1, r.country].filter(Boolean).join(", ") };
      }
    ];
    let last;
    for (const fn of tries) {
      try { return await fn(); } catch (e) { last = e; }
    }
    throw last || new Error("geocode failed");
  }

  function showMap(lat, lon) {
    const delta = 0.008;
    const bbox = [lon - delta, lat - delta, lon + delta, lat + delta].join("%2C");
    const src =
      "https://www.openstreetmap.org/export/embed.html?bbox=" +
      bbox +
      "&layer=mapnik&marker=" +
      encodeURIComponent(lat + "," + lon);
    const frame = $("#map-frame");
    const fb = $("#map-fallback");
    frame.src = src;
    frame.hidden = false;
    fb.style.display = "none";
  }

  function openQuote() {
    const quote = $("#quote");
    quote.hidden = false;
    $("#addr-chip").textContent = state.displayName || state.address;
    quote.scrollIntoView({ behavior: "smooth", block: "start" });
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
      const geo = await geocode(address);
      state.lat = geo.lat;
      state.lon = geo.lon;
      state.displayName = geo.displayName;
      status.textContent = "Found — continue below.";
      status.className = "form-status ok";
      openQuote();
      showMap(geo.lat, geo.lon);
    } catch (_) {
      state.lat = null;
      state.lon = null;
      state.displayName = address;
      status.textContent = "Address saved — continue below. We’ll verify on-site.";
      status.className = "form-status ok";
      openQuote();
      $("#map-fallback").textContent = "Map unavailable for this address. We’ll verify on-site.";
    } finally {
      $("#btn-start").disabled = false;
    }
  });

  $("#btn-job").addEventListener("click", () => {
    document.querySelector('[data-q="job"]').classList.remove("is-on");
    document.querySelector('[data-q="result"]').classList.add("is-on");
    if (state.lat != null) showMap(state.lat, state.lon);
    $("#quote-card").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  $("#btn-range").addEventListener("click", () => {
    const status = $("#result-status");
    state.name = $("#name").value.trim();
    state.phone = $("#phone").value.trim();
    if (state.name.length < 2) {
      status.textContent = "Enter your name.";
      status.className = "form-status err";
      return;
    }
    if (state.phone.replace(/\D/g, "").length < 10) {
      status.textContent = "Enter a valid mobile number.";
      status.className = "form-status err";
      return;
    }
    if (!$("#consent").checked) {
      status.textContent = "Check the consent box to see your estimate.";
      status.className = "form-status err";
      return;
    }
    const job = JOBS[state.job];
    const payload = {
      business: "3 B's Tree Removal",
      to: "shaun.brasher@gmail.com",
      name: state.name,
      phone: state.phone,
      address: state.address,
      geocode: state.displayName,
      lat: state.lat,
      lon: state.lon,
      job: state.job,
      photos: state.photos,
      rangeLow: job.low,
      rangeHigh: job.high,
      source: "blake-demo-v2",
      createdAt: new Date().toISOString()
    };
    try {
      const key = "blake_tree_leads";
      const prev = JSON.parse(localStorage.getItem(key) || "[]");
      prev.push(payload);
      localStorage.setItem(key, JSON.stringify(prev.slice(-50)));
    } catch (_) {}

    $("#range").hidden = false;
    $("#range-label").textContent = job.label;
    $("#range-price").textContent = money(job.low) + " – " + money(job.high);
    $("#thanks").hidden = false;
    status.textContent = "Estimate ready.";
    status.className = "form-status ok";
  });

  $("#btn-jump").addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => $("#address").focus(), 400);
  });
})();
