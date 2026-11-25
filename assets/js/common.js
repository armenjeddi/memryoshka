// Small helpers shared by the figures. No libraries.
(function () {
  const M = (window.MEM = window.MEM || {});

  M.$ = (sel, root) => (root || document).querySelector(sel);
  M.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  // Create an element. Text always goes in through textContent, never innerHTML.
  M.el = function (tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k === "style") e.style.cssText = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? "" : v);
    }
    for (const c of [].concat(children || [])) {
      if (c === null || c === undefined || c === false) continue;
      e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return e;
  };

  const SVGNS = "http://www.w3.org/2000/svg";
  M.svg = function (tag, attrs, text) {
    const e = document.createElementNS(SVGNS, tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) e.setAttribute(k, v);
    if (text !== undefined) e.textContent = text;
    return e;
  };

  M.css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  M.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  M.fmtInt = (n) => Math.round(n).toLocaleString("en-US");
  M.fmtTime = function (s) {
    s = Math.max(0, Math.round(s));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(sec).padStart(2, "0");
  };
  M.fmtSci = function (x) {
    if (!x) return "0";
    const e = Math.floor(Math.log10(x)), m = x / Math.pow(10, e);
    const sup = String(e).replace(/-/g, "⁻").replace(/\d/g, (d) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[d]);
    return m.toFixed(1) + " × 10" + sup;
  };

  // ---- theme changes: figures redraw their canvases with the new colors
  const themeCbs = [];
  M.onTheme = (cb) => themeCbs.push(cb);
  M.themeChanged = () => themeCbs.forEach((cb) => cb());
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", M.themeChanged);

  // ---- code-length color ramp (128 -> 4,096 bits), read from the CSS tokens
  const RAMP_BITS = [128, 256, 512, 1024, 2048, 4096];
  M.RAMP_BITS = RAMP_BITS;
  function hexToRgb(h) {
    h = h.replace("#", "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  let rampCache = null;
  M.onTheme(() => (rampCache = null));
  M.rampStops = function () {
    if (!rampCache) rampCache = RAMP_BITS.map((b) => hexToRgb(M.css("--b" + b)));
    return rampCache;
  };
  M.rampColor = function (bits, alpha) {
    const stops = M.rampStops();
    const x = Math.min(Math.max(Math.log2(Math.max(bits, 1)) - 7, 0), 5); // 128 bits -> 0, 4,096 -> 5
    const i = Math.min(Math.floor(x), 4), f = x - i;
    const c = stops[i].map((v, j) => Math.round(v + (stops[i + 1][j] - v) * f));
    return alpha === undefined ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
  };
  M.fillRampCells = function (container) {
    if (!container) return;
    container.textContent = "";
    RAMP_BITS.forEach((b) => container.appendChild(M.el("span", { style: `background:var(--b${b})`, title: b + " bits" })));
  };

  // ---- canvas with device-pixel-ratio scaling; returns the context and CSS size
  M.setupCanvas = function (canvas) {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  };

  // ---- one shared tooltip
  const tip = () => document.getElementById("tip");
  M.showTip = function (content, x, y) {
    const t = tip();
    t.textContent = "";
    t.appendChild(content);
    t.classList.add("show");
    const pad = 14, r = t.getBoundingClientRect();
    let left = x + pad, top = y + pad;
    if (left + r.width > window.innerWidth - 8) left = x - r.width - pad;
    if (top + r.height > window.innerHeight - 8) top = y - r.height - pad;
    t.style.left = Math.max(8, left) + "px";
    t.style.top = Math.max(8, top) + "px";
  };
  M.hideTip = () => tip().classList.remove("show");
  // A tooltip row: value first (strong), label second, with a small key mark
  M.tipRow = function (label, value, keyStyle) {
    const k = M.el("span", { class: "k" }, [keyStyle ? M.el("span", { class: "line-key", style: keyStyle }) : null, label]);
    return M.el("div", { class: "t-row" }, [k, M.el("span", { class: "v", text: value })]);
  };

  M.whenVisible = function (node, cb, threshold) {
    if (!("IntersectionObserver" in window)) return cb();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { io.disconnect(); cb(); } });
    }, { threshold: threshold || 0.35 });
    io.observe(node);
  };

  M.onResize = function (cb) {
    let raf = 0, lastW = window.innerWidth;
    window.addEventListener("resize", () => {
      if (window.innerWidth === lastW) return; // ignore mobile toolbar height changes
      lastW = window.innerWidth;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(cb);
    });
  };

  // ---- a play / pause / step / scrub controller for step-through figures
  const ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6.5" y="5.5" width="4" height="13" rx="1"/><rect x="13.5" y="5.5" width="4" height="13" rx="1"/></svg>';
  M.Player = function (opts) {
    const { steps, onStep, play, prev, next, range, speed, stepsPerSecond, loopPause } = opts;
    let i = 0, timer = null, playing = false;
    range.max = steps - 1;
    function set(k) { i = Math.max(0, Math.min(steps - 1, k)); range.value = i; onStep(i); }
    function draw() {
      play.innerHTML = playing ? ICON_PAUSE : ICON_PLAY; // static icon markup, no data
      play.setAttribute("aria-label", playing ? "Pause" : "Play");
      play.appendChild(document.createTextNode(playing ? " Pause" : " Play"));
    }
    function tick() {
      if (i >= steps - 1) {
        timer = setTimeout(() => { if (playing) { set(0); schedule(); } }, loopPause || 1600);
        return;
      }
      set(i + 1);
      schedule();
    }
    function schedule() {
      clearTimeout(timer);
      if (!playing) return;
      const sps = stepsPerSecond * parseFloat(speed ? speed.value : 1);
      timer = setTimeout(tick, 1000 / sps);
    }
    function start() { playing = true; draw(); schedule(); }
    function stop() { playing = false; clearTimeout(timer); draw(); }
    play.addEventListener("click", () => (playing ? stop() : start()));
    prev.addEventListener("click", () => { stop(); set(i - 1); });
    next.addEventListener("click", () => { stop(); set(i + 1); });
    range.addEventListener("input", () => { stop(); set(parseInt(range.value, 10)); });
    if (speed) speed.addEventListener("change", schedule);
    draw();
    return { set, start, stop, get index() { return i; }, get playing() { return playing; } };
  };
})();
