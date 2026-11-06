/* Before/after illustration — free Esri imagery + canvas.
   AFTER is an illustration only (tree removed / fade), not a photo-real AI render. */
(function (global) {
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  async function buildPair({ tileUrl, marks }) {
    const img = await loadImage(tileUrl);
    const w = img.naturalWidth || 256;
    const h = img.naturalHeight || 256;
    const before = document.createElement("canvas");
    const after = document.createElement("canvas");
    before.width = after.width = w;
    before.height = after.height = h;
    const bctx = before.getContext("2d");
    const actx = after.getContext("2d");
    bctx.drawImage(img, 0, 0);
    actx.drawImage(img, 0, 0);

    // Marks are in lat/lon; for illustration we draw near center with offsets by index
    const trees = (marks || []).filter((m) => m.kind === "tree");
    trees.forEach((m, i) => {
      const cx = w * (0.35 + (i % 3) * 0.15);
      const cy = h * (0.4 + Math.floor(i / 3) * 0.15);
      const r = Math.max(10, Math.min(36, (m.canopyFt || 28) * 0.55));
      // BEFORE: green canopy mark
      bctx.beginPath();
      bctx.fillStyle = "rgba(40, 160, 70, 0.55)";
      bctx.strokeStyle = "#e8ffe8";
      bctx.lineWidth = 2;
      bctx.arc(cx, cy, r, 0, Math.PI * 2);
      bctx.fill();
      bctx.stroke();
      bctx.fillStyle = "#fff";
      bctx.font = "bold 11px sans-serif";
      bctx.fillText("T" + m.id, cx - 6, cy + 4);

      // AFTER illustration: patch with neighboring grass tone + soft fade (not photoreal)
      const sample = bctx.getImageData(Math.max(0, cx - r - 8), Math.max(0, cy + r + 2), 4, 4).data;
      const fill = `rgb(${sample[0]},${sample[1]},${sample[2]})`;
      actx.beginPath();
      actx.fillStyle = fill;
      actx.arc(cx, cy, r + 4, 0, Math.PI * 2);
      actx.fill();
      // soft ground texture hint
      actx.fillStyle = "rgba(90, 120, 70, 0.25)";
      actx.beginPath();
      actx.ellipse(cx, cy + 2, r * 0.9, r * 0.45, 0, 0, Math.PI * 2);
      actx.fill();
    });

    // Stumps: small brown marks before; gone after
    (marks || []).filter((m) => m.kind === "stump").forEach((m, i) => {
      const cx = w * (0.55 + (i % 2) * 0.12);
      const cy = h * (0.62 + i * 0.08);
      bctx.fillStyle = "rgba(140, 90, 40, 0.85)";
      bctx.beginPath();
      bctx.arc(cx, cy, 7, 0, Math.PI * 2);
      bctx.fill();
      actx.fillStyle = "rgba(100, 130, 70, 0.5)";
      actx.beginPath();
      actx.arc(cx, cy, 9, 0, Math.PI * 2);
      actx.fill();
    });

    return { beforeUrl: before.toDataURL("image/jpeg", 0.85), afterUrl: after.toDataURL("image/jpeg", 0.85) };
  }

  function mountSlider(root, beforeUrl, afterUrl) {
    root.hidden = false;
    root.innerHTML = `
      <div class="ba-head"><strong>Before / after</strong> <span class="ba-tag">Illustration only</span></div>
      <div class="ba-frame">
        <img class="ba-after" alt="After illustration — trees removed" />
        <div class="ba-before-wrap">
          <img class="ba-before" alt="Before — marked trees on satellite" />
        </div>
        <input class="ba-range" type="range" min="0" max="100" value="55" aria-label="Before after slider" />
        <span class="ba-label ba-l">Before</span>
        <span class="ba-label ba-r">After</span>
      </div>
      <p class="ba-note">After view is an illustration (tree cleared), not a photo-real AI render. Final work confirmed on-site.</p>`;
    root.querySelector(".ba-before").src = beforeUrl;
    root.querySelector(".ba-after").src = afterUrl;
    const wrap = root.querySelector(".ba-before-wrap");
    const range = root.querySelector(".ba-range");
    const apply = () => {
      wrap.style.width = range.value + "%";
    };
    range.addEventListener("input", apply);
    apply();
  }

  global.BeforeAfter = { buildPair, mountSlider };
})(window);
