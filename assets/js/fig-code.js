// Figure 03: which bits a prefix of the nested code keeps, and the share of variance it keeps.
(function () {
  const M = window.MEM, C = window.MEM_CODE;
  if (!C) return;
  const { $, el, svg } = M;
  const K = C.components, P = C.planes, NB = K * P;
  const LENGTHS = [32, 64, 128, 256, 512, 1024, 2048, 4096];
  const FLOOR = 0.5, TOKEN_BITS_16 = C.dims * 16;

  // rank of each (component, plane) bit in the stored order, and the share of variance kept by every prefix
  const rank = new Int32Array(NB);
  const E = new Float64Array(NB + 1);
  for (let i = 0; i < NB; i++) {
    const k = C.order[2 * i], p = C.order[2 * i + 1];
    rank[k * P + p] = i;
    E[i + 1] = E[i] + C.sigma2[k] * C.gains[p];
  }
  const gainSum = C.gains.reduce((a, b) => a + b, 0);
  const cumS = new Float64Array(K + 1);
  for (let k = 0; k < K; k++) cumS[k + 1] = cumS[k] + C.sigma2[k];
  const plain = (r) => cumS[Math.min(K, Math.floor(r / 8))] * gainSum; // first r/8 directions at 8 bits each
  let r = 512;

  // ---- length buttons
  const picker = $("#len-picker");
  const btns = LENGTHS.map((L) => {
    const below = E[L] < FLOOR;
    const b = el("button", { type: "button", class: below ? "below" : null, "aria-pressed": String(L === r),
      title: below ? "Below the quality floor of 0.5: the writer never stores codes this short" : null,
      text: M.fmtInt(L) + " bits", onclick: () => { r = L; update(); } });
    picker.appendChild(b);
    return b;
  });

  // ---- the 512 x 8 grid
  const canvas = $("#code-grid canvas");
  function drawGrid() {
    const { ctx, w, h } = M.setupCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    const gap = 3, rowH = (h - gap * (P - 1)) / P, colW = w / K;
    const on = M.css("--ours"), off = M.css("--soft-2");
    for (let p = 0; p < P; p++) {
      const y = p * (rowH + gap);
      ctx.fillStyle = off;
      ctx.fillRect(0, y, w, rowH);
      ctx.fillStyle = on;
      // draw kept bits as runs to keep the edges crisp
      let start = -1;
      for (let k = 0; k <= K; k++) {
        const kept = k < K && rank[k * P + p] < r;
        if (kept && start < 0) start = k;
        if (!kept && start >= 0) { ctx.fillRect(Math.floor(start * colW), y, Math.ceil((k - start) * colW), rowH); start = -1; }
      }
    }
  }

  // ---- readout
  const ro = $("#code-readout");
  function cell(k, v, s) { return el("div", {}, [el("div", { class: "k", text: k }), el("div", { class: "v num", text: v }), s ? el("div", { class: "s", text: s }) : null]); }
  function drawReadout() {
    ro.textContent = "";
    const bytes = r / 8;
    ro.appendChild(cell("Stored size of one token", M.fmtInt(bytes) + " bytes", "plus 3 bytes for its position, importance and length"));
    ro.appendChild(cell("Smaller than a 16-bit token", Math.round(TOKEN_BITS_16 / r) + "×", `a 16-bit token is ${M.fmtInt(TOKEN_BITS_16 / 8)} bytes`));
    ro.appendChild(cell("Share of PCA variance kept", Math.round(100 * E[r]) + "%", E[r] < FLOOR ? "below the 0.5 floor, never stored" : "the value the writer uses for this length"));
    ro.appendChild(cell("Plain code of the same size", Math.round(100 * plain(r)) + "%", `the first ${Math.floor(r / 8)} directions at 8 bits each`));
  }

  // ---- share-of-variance curve (SVG, two series, hover)
  const host = $("#er-chart");
  function drawCurve() {
    host.textContent = "";
    const W = Math.max(280, host.clientWidth || 420), H = 230;
    const m = { l: 44, r: 14, t: 26, b: 34 };
    const x = (L) => m.l + ((Math.log2(L) - 5) / 7) * (W - m.l - m.r);
    const y = (v) => m.t + (1 - v) * (H - m.t - m.b);
    const s = svg("svg", { class: "chart", width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img",
      "aria-label": "Share of PCA variance kept against code length, for the nested code and a plain code" });
    const ink3 = M.css("--ink-3"), grid = M.css("--grid"), axis = M.css("--axis");
    [0, 0.25, 0.5, 0.75, 1].forEach((v) => {
      s.appendChild(svg("line", { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), stroke: grid, "stroke-width": 1 }));
      s.appendChild(svg("text", { x: m.l - 8, y: y(v) + 4, "text-anchor": "end", "font-size": 11, fill: ink3 }, Math.round(v * 100) + "%"));
    });
    s.appendChild(svg("line", { x1: m.l, x2: W - m.r, y1: y(0), y2: y(0), stroke: axis, "stroke-width": 1 }));
    LENGTHS.forEach((L) => s.appendChild(svg("text", { x: x(L), y: H - m.b + 16, "text-anchor": "middle", "font-size": 11, fill: ink3 }, L >= 1024 ? L / 1024 + "k" : String(L))));
    s.appendChild(svg("text", { x: W - m.r, y: H - 4, "text-anchor": "end", "font-size": 11, fill: ink3 }, "code length (bits, log scale)"));
    // floor
    s.appendChild(svg("line", { x1: m.l, x2: W - m.r, y1: y(FLOOR), y2: y(FLOOR), stroke: M.css("--ink-2"), "stroke-width": 1, opacity: 0.5 }));
    s.appendChild(svg("text", { x: W - m.r, y: y(FLOOR) - 5, "text-anchor": "end", "font-size": 11, fill: M.css("--ink-2") }, "quality floor 0.5"));
    // current length guide
    s.appendChild(svg("line", { x1: x(r), x2: x(r), y1: m.t - 6, y2: H - m.b, stroke: M.css("--ink-3"), "stroke-width": 1 }));
    const series = [
      { name: "Nested code (Memryoshka)", color: M.css("--ours"), f: (L) => E[L] },
      { name: "Plain code, same size", color: M.css("--base"), f: plain }
    ];
    const surface = M.css("--card");
    series.slice().reverse().forEach((se) => {
      const pts = [];
      for (let L = 32; L <= 4096; L = Math.round(L * 1.0905)) pts.push([x(L), y(se.f(L))]);
      pts.push([x(4096), y(se.f(4096))]);
      s.appendChild(svg("polyline", { points: pts.map((p) => p.join(",")).join(" "), fill: "none", stroke: se.color, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));
      LENGTHS.forEach((L) => s.appendChild(svg("circle", { cx: x(L), cy: y(se.f(L)), r: L === r ? 5.5 : 4, fill: se.color, stroke: surface, "stroke-width": 2 })));
    });
    // legend (two series), direct value labels at the current length only
    const leg = el("div", { class: "legend", style: "margin-bottom:4px" }, series.map((se) =>
      el("span", { class: "key" }, [el("span", { class: "line-key", style: `background:${se.color}` }), se.name])));
    host.appendChild(leg);
    const lab = svg("text", { x: x(r) + (r >= 2048 ? -8 : 8), y: y(E[r]) - 10, "text-anchor": r >= 2048 ? "end" : "start", "font-size": 12, "font-weight": 600, fill: M.css("--ink") }, Math.round(100 * E[r]) + "%");
    s.appendChild(lab);
    // hover: snap to the nearest length, one tooltip with both series
    const hit = svg("rect", { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: "transparent" });
    hit.addEventListener("pointermove", (ev) => {
      const bx = s.getBoundingClientRect();
      const px = ev.clientX - bx.left;
      const L = LENGTHS.reduce((best, Lc) => (Math.abs(x(Lc) - px) < Math.abs(x(best) - px) ? Lc : best), 32);
      const box = el("div", {}, [el("div", { class: "t-title", text: M.fmtInt(L) + "-bit code" })]);
      series.forEach((se) => box.appendChild(M.tipRow(se.name, Math.round(100 * se.f(L)) + "%", `background:${se.color}`)));
      M.showTip(box, ev.clientX, ev.clientY);
    });
    hit.addEventListener("pointerleave", M.hideTip);
    hit.addEventListener("click", (ev) => {
      const bx = s.getBoundingClientRect(), px = ev.clientX - bx.left;
      r = LENGTHS.reduce((best, Lc) => (Math.abs(x(Lc) - px) < Math.abs(x(best) - px) ? Lc : best), 32);
      update();
    });
    s.appendChild(hit);
    host.appendChild(s);
  }

  function update() {
    btns.forEach((b, i) => b.setAttribute("aria-pressed", String(LENGTHS[i] === r)));
    drawGrid(); drawReadout(); drawCurve();
  }
  update();
  M.onResize(update);
  M.onTheme(update);
})();
