/* Gallery lightbox + tap-to-play reels */
(function () {
  // ----- Lightbox -----
  var tiles = Array.prototype.slice.call(document.querySelectorAll(".work-tile"));
  var lb = document.getElementById("lightbox");
  if (lb && tiles.length) {
    var img = lb.querySelector(".lb-img");
    var count = lb.querySelector(".lb-count");
    var idx = 0;
    function show(i) {
      idx = (i + tiles.length) % tiles.length;
      var t = tiles[idx];
      img.src = t.getAttribute("data-full");
      img.alt = t.querySelector("img").alt;
      count.textContent = (idx + 1) + " / " + tiles.length;
      var nx = tiles[(idx + 1) % tiles.length].getAttribute("data-full");
      var pre = new Image(); pre.src = nx;
    }
    function open(i) {
      show(i);
      if (typeof lb.showModal === "function") lb.showModal(); else lb.setAttribute("open", "");
      document.documentElement.classList.add("lb-open");
    }
    function close() {
      if (typeof lb.close === "function") lb.close(); else lb.removeAttribute("open");
      document.documentElement.classList.remove("lb-open");
    }
    tiles.forEach(function (t, i) { t.addEventListener("click", function () { open(i); }); });
    lb.querySelector(".lb-close").addEventListener("click", close);
    lb.querySelector(".lb-prev").addEventListener("click", function (e) { e.stopPropagation(); show(idx - 1); });
    lb.querySelector(".lb-next").addEventListener("click", function (e) { e.stopPropagation(); show(idx + 1); });
    lb.addEventListener("click", function (e) { if (e.target === lb) close(); });
    lb.addEventListener("close", function () { document.documentElement.classList.remove("lb-open"); });
    document.addEventListener("keydown", function (e) {
      if (!lb.open) return;
      if (e.key === "ArrowRight") show(idx + 1);
      else if (e.key === "ArrowLeft") show(idx - 1);
    });
    var sx = null;
    lb.addEventListener("touchstart", function (e) { sx = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener("touchend", function (e) {
      if (sx === null) return;
      var dx = e.changedTouches[0].clientX - sx; sx = null;
      if (Math.abs(dx) > 45) show(idx + (dx < 0 ? 1 : -1));
    });
  }

  // ----- Reels: poster until tapped, then load + play -----
  var current = null;
  Array.prototype.forEach.call(document.querySelectorAll(".reel-play"), function (btn) {
    btn.addEventListener("click", function () {
      var v = document.createElement("video");
      v.src = btn.getAttribute("data-src");
      v.poster = btn.querySelector("img").getAttribute("src");
      v.preload = "none";
      v.playsInline = true;
      v.setAttribute("playsinline", "");
      v.controls = true;
      v.loop = true;
      v.muted = btn.getAttribute("data-sound") !== "1";
      v.className = "reel-video";
      btn.replaceWith(v);
      if (current && current !== v) { try { current.pause(); } catch (e) {} }
      current = v;
      var p = v.play(); if (p && p.catch) p.catch(function () { v.muted = true; v.play().catch(function () {}); });
      v.addEventListener("play", function () {
        if (current && current !== v) { try { current.pause(); } catch (e) {} }
        current = v;
      });
    });
  });
})();
