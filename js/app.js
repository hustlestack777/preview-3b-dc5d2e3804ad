(() => {
  const JOBS = {
    smallTrim: { label: "Trim / pruning", hint: "Light canopy work", low: 400, high: 900 },
    mediumRemoval: { label: "Standard removal", hint: "Typical yard tree", low: 700, high: 1900 },
    largeRemoval: { label: "Large / near-structure", hint: "Complex access possible", low: 1500, high: 3500 },
    stormEmergency: { label: "Storm / emergency", hint: "Downed or leaning", low: 560, high: 3290 },
    stumpOnly: { label: "Stump grinding", hint: "Per stump", low: 150, high: 450 }
  };

  const defaults = window.SITE_DEFAULTS || {};
  const variants = window.SITE_VARIANTS || {};

  function readParams() {
    const q = new URLSearchParams(location.search);
    const utm = {};
    q.forEach((val, key) => {
      if (/^utm_/i.test(key)) utm[key.toLowerCase()] = val;
    });
    const src = (q.get("src") || defaults.source || "lrl").toLowerCase();
    let v = (q.get("v") || defaults.variant || "a").toLowerCase();
    if (!variants[v]) v = defaults.variant || "a";
    return { src, v, utm, raw: q };
  }

  const params = readParams();
  const variant = variants[params.v] || variants.a || {
    id: params.v,
    headline: "Get a tree-work estimate.",
    subline: "Enter your property address to get started.",
    cta: "Get started",
    heroImage: "img/hero.jpg"
  };

  function trackingQuery(extra) {
    const out = new URLSearchParams();
    out.set("src", params.src);
    out.set("v", params.v);
    Object.entries(params.utm).forEach(([k, val]) => out.set(k, val));
    if (extra) Object.entries(extra).forEach(([k, val]) => { if (val != null && val !== "") out.set(k, String(val)); });
    return out.toString();
  }

  function blakeUrl(path) {
    const base = defaults.blakeSite || "https://www.3bstreeremoval.com/";
    const u = new URL(path || "", base);
    const t = new URLSearchParams(trackingQuery());
    t.forEach((val, key) => u.searchParams.set(key, val));
    return u.toString();
  }

  /* Apply variant to hero */
  const h1 = document.querySelector(".hero h1");
  const sub = document.querySelector(".hero .sub");
  const cta = document.querySelector("#btn-start");
  const heroImg = document.querySelector(".hero-bg");
  if (h1 && variant.headline) h1.textContent = variant.headline;
  if (sub && variant.subline) sub.textContent = variant.subline;
  if (cta && variant.cta) cta.textContent = variant.cta;
  if (heroImg && variant.heroImage) heroImg.src = variant.heroImage;

  /* Tag outbound Blake links */
  document.querySelectorAll("[data-blake-link]").forEach((a) => {
    a.href = blakeUrl(a.getAttribute("data-blake-path") || "/");
  });

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
      to: defaults.leadEmailTo || "shaun.brasher@gmail.com",
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
      source: params.src,
      variant: params.v,
      utm: params.utm,
      pageUrl: location.href,
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
    $("#range-label").textContent = job.label;
    $("#range-price").textContent = money(job.low) + " – " + money(job.high);
    $("#thanks").hidden = false;
    const cont = $("#blake-continue");
    if (cont) {
      cont.href = blakeUrl("/");
      cont.hidden = false;
    }
    status.textContent = "Estimate ready.";
    status.className = "form-status ok";
  });

  $("#btn-jump").addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => $("#address").focus(), 400);
  });

  /* Expose for debugging / future variants */
  window.__blakeDemo = { params, variant, blakeUrl, trackingQuery };
})();
