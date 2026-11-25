// Figure 02 (where the saving comes from) and the table of Figure 07 (higher with less).
(function () {
  const M = window.MEM, R = window.MEM_RESULTS, D = window.MEM_STREAM;
  if (!R || !D) return;
  const { $, el, svg } = M;

  // ---------------- Figure 02: storage after each saving, from the end state of the stream in Figure 01
  function drawSavings() {
    const host = $("#savings-chart");
    if (!host) return;
    host.textContent = "";
    const last = D.variants.adaptive.snapshots[D.variants.adaptive.snapshots.length - 1];
    const N = D.n_frames, TPF = D.tokens_per_frame, TOKB = 3584 * 2;
    const avgBits = last.hist.reduce((s, n, k) => s + n * D.lengths[k], 0) / last.hist.reduce((a, b) => a + b, 0);
    const full = N * TPF * TOKB;
    const afterFrames = last.kept * TPF * TOKB;
    const afterTokens = last.tokens * TOKB;
    const payload = last.tokens * avgBits / 8;
    const steps = [
      { label: "Every visual token at 16 bits", note: `${M.fmtInt(N)} frames × ${TPF} tokens`, bytes: full },
      { label: `Keep ${Math.round(100 * last.kept / N)}% of the frames`, note: `${M.fmtInt(last.kept)} of ${M.fmtInt(N)}`, bytes: afterFrames },
      { label: "Keep each frame's most important tokens", note: `${Math.round(last.tokens / last.kept)} of ${TPF} per frame`, bytes: afterTokens },
      { label: "Shorter codes", note: `${M.fmtInt(57344)} → ${Math.round(avgBits)} bits per token`, bytes: payload, key: true },
      { label: "Plus positions, timestamps and search tags", note: "what the memory actually holds", bytes: last.bytes, ours: true }
    ];
    const W = Math.max(320, host.clientWidth), narrow = W < 640;
    const labelW = narrow ? 0 : 330, rowH = narrow ? 64 : 46, top = 8;
    const H = top + steps.length * rowH + 30;
    const lo = Math.log10(1e6), hi = Math.log10(1e10);
    const x0 = labelW, x1 = W - (narrow ? 70 : 90);
    const x = (b) => x0 + ((Math.log10(b) - lo) / (hi - lo)) * (x1 - x0);
    const s = svg("svg", { class: "chart", width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Storage after each saving, log scale" });
    const ink = M.css("--ink"), ink2 = M.css("--ink-2"), ink3 = M.css("--ink-3"), grid = M.css("--grid");
    [1e6, 1e7, 1e8, 1e9, 1e10].forEach((v) => {
      s.appendChild(svg("line", { x1: x(v), x2: x(v), y1: top, y2: H - 24, stroke: grid, "stroke-width": 1 }));
      s.appendChild(svg("text", { x: x(v), y: H - 8, "text-anchor": "middle", "font-size": 11, fill: ink3 }, { 1e6: "1 MB", 1e7: "10 MB", 1e8: "100 MB", 1e9: "1 GB", 1e10: "10 GB" }[v]));
    });
    steps.forEach((st, i) => {
      const y = top + i * rowH, barY = narrow ? y + 28 : y + 10, bh = 22;
      const strong = st.ours || st.key;
      if (narrow) s.appendChild(svg("text", { x: 0, y: y + 18, "font-size": 12.5, fill: ink, "font-weight": strong ? 600 : 400 }, st.label));
      else {
        s.appendChild(svg("text", { x: 0, y: y + 22, "font-size": 13.5, fill: ink, "font-weight": strong ? 600 : 400 }, st.label));
        s.appendChild(svg("text", { x: 0, y: y + 38, "font-size": 11.5, fill: ink3 }, st.note));
      }
      const w = Math.max(3, x(st.bytes) - x0);
      s.appendChild(svg("rect", { x: x0, y: barY, width: w, height: bh, rx: 4, fill: st.ours ? M.css("--ours") : M.css("--base") }));
      const txt = st.bytes >= 1e9 ? (st.bytes / 1e9).toFixed(1) + " GB" : st.bytes >= 1e7 ? Math.round(st.bytes / 1e6) + " MB" : (st.bytes / 1e6).toFixed(1) + " MB";
      s.appendChild(svg("text", { x: x0 + w + 8, y: barY + 16, "font-size": 12.5, "font-weight": 600, fill: ink2 }, txt));
      if (i > 0 && !st.ours) {
        const f = steps[i - 1].bytes / st.bytes;
        s.appendChild(svg("text", { x: x0 + w + 8 + (txt.length * 7.5) + 10, y: barY + 16, "font-size": 12, "font-weight": st.key ? 700 : 400, fill: st.key ? ink : ink3 }, `÷${f >= 10 ? Math.round(f) : f.toFixed(1)}`));
      }
    });
    host.appendChild(s);
  }

  // ---------------- Figure 07: settings where Memryoshka scores above a larger reference
  function drawHigher() {
    const box = $("#higher-table");
    if (!box) return;
    box.textContent = "";
    const t = el("table", { class: "data" });
    t.appendChild(el("thead", {}, [el("tr", {}, ["Setting", "Memryoshka", "Reference"].map((h) => el("th", { text: h })))]));
    const tb = el("tbody");
    R.higher.forEach((r) => {
      const robot = r.what.startsWith("Robot"), fmt = (v) => (robot ? v.toFixed(0) + "%" : v.toFixed(1));
      tb.appendChild(el("tr", {}, [el("td", {}, [r.what, el("span", { class: "sub", text: "Reference: " + r.refName })]),
        el("td", { class: "best", text: fmt(r.ours) }), el("td", { text: fmt(r.ref) })]));
    });
    t.appendChild(tb);
    box.appendChild(t);
  }

  function all() { drawSavings(); drawHigher(); }
  all();
  M.onResize(all);
  M.onTheme(all);
})();
