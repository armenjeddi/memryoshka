// Figures 05 and 07 and the ablation table, drawn from assets/data/results.js (numbers copied from the paper).
(function () {
  const M = window.MEM, R = window.MEM_RESULTS;
  if (!R) return;
  const { $, el, svg } = M;

  // ======================= Figure 05: dot plot per benchmark =======================
  const main = R.main;
  let budget = 0, view = "table";
  const seg = $("#budget-seg");
  const segBtns = main.budgets.map((b, i) => {
    const btn = el("button", { type: "button", "aria-pressed": String(i === budget), text: b.label,
      onclick: () => { budget = i; segBtns.forEach((x, j) => x.setAttribute("aria-pressed", String(j === i))); drawMainTable(); if (view === "chart") drawMain(); } });
    seg.appendChild(btn);
    return btn;
  });
  // the table is the default view; the dot plot is one click away
  const vseg = $("#view-seg");
  const viewBtns = [["table", "Table"], ["chart", "Chart"]].map(([id, label]) => {
    const b = el("button", { type: "button", "aria-pressed": String(id === view), text: label,
      onclick: () => {
        view = id;
        viewBtns.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        $("#main-table-view").hidden = id !== "table";
        $("#main-chart-view").hidden = id !== "chart";
        if (id === "chart") drawMain();
      } });
    vseg.appendChild(b);
    return b;
  });
  const methodsById = Object.fromEntries(main.methods.map((m) => [m.id, m]));
  const baselines = main.methods.filter((m) => m.role === "baseline").map((m) => m.id);

  const legend = $("#main-legend");
  legend.appendChild(el("span", { class: "key" }, [el("span", { class: "dot", style: "background:var(--ours)" }), "Memryoshka"]));
  legend.appendChild(el("span", { class: "key" }, [el("span", { class: "dot", style: "background:var(--ours4)" }), "Memryoshka + 4 recent frames"]));
  legend.appendChild(el("span", { class: "key" }, [el("span", { class: "dot", style: "background:var(--base)" }), "Bounded baselines"]));
  legend.appendChild(el("span", { class: "key" }, [el("span", { class: "tick-key" }), "Uncapped memory (reference)"]));

  function drawMain() {
    const host = $("#main-chart");
    host.textContent = "";
    const B = main.budgets[budget], rows = B.rows;
    const W = Math.max(320, host.clientWidth), narrow = W < 560;
    const labelW = narrow ? 112 : 168, rowH = narrow ? 38 : 42, top = 30, groupGap = 18;
    const nb = main.benchmarks.length;
    const H = top + nb * rowH + groupGap * 2 + 26;
    const x0 = labelW, x1 = W - 16, lo = 20, hi = 100;
    const x = (v) => x0 + ((v - lo) / (hi - lo)) * (x1 - x0);
    const rowY = (i) => top + i * rowH + (i >= 4 ? groupGap : 0) + (i >= 6 ? groupGap : 0) + rowH / 2;
    const s = svg("svg", { class: "chart", width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img",
      "aria-label": `Accuracy per benchmark at ${B.label} memory and ${B.readout} readout positions` });
    const ink = M.css("--ink"), ink2 = M.css("--ink-2"), ink3 = M.css("--ink-3"), grid = M.css("--grid"), surface = M.css("--card");
    // gridlines and ticks
    for (let v = lo; v <= hi; v += 10) {
      s.appendChild(svg("line", { x1: x(v), x2: x(v), y1: top - 6, y2: H - 22, stroke: grid, "stroke-width": 1 }));
      if (!narrow || v % 20 === 0) s.appendChild(svg("text", { x: x(v), y: H - 6, "text-anchor": "middle", "font-size": 11, fill: ink3 }, String(v)));
    }
    s.appendChild(svg("text", { x: x1, y: 14, "text-anchor": "end", "font-size": 11, fill: ink3 }, "accuracy (%)"));
    // group labels
    main.groups.forEach((g) => {
      const yy = rowY(g.from) - rowH / 2 - 2;
      s.appendChild(svg("text", { x: 0, y: yy + 4, "font-size": 10.5, "font-weight": 600, "letter-spacing": "0.08em", fill: ink3 }, g.label.toUpperCase()));
    });
    main.benchmarks.forEach((bm, i) => {
      const y = rowY(i);
      const isAvg = i === nb - 1;
      s.appendChild(svg("text", { x: 0, y: y + 4, "font-size": narrow ? 12 : 13.5, "font-weight": isAvg ? 600 : 400, fill: ink }, bm));
      // a faint row track spanning the values of this row
      const vals = Object.keys(rows).filter((k) => k !== "uniform").map((k) => rows[k][i]);
      s.appendChild(svg("line", { x1: x(Math.min(...vals)), x2: x(Math.max(...vals)), y1: y, y2: y, stroke: M.css("--line-2"), "stroke-width": 1 }));
      baselines.forEach((id) => s.appendChild(svg("circle", { cx: x(rows[id][i]), cy: y, r: 4.5, fill: M.css("--base"), stroke: surface, "stroke-width": 2 })));
      s.appendChild(svg("line", { x1: x(rows.full[i]), x2: x(rows.full[i]), y1: y - 9, y2: y + 9, stroke: M.css("--ref"), "stroke-width": 2, "stroke-linecap": "round" }));
      s.appendChild(svg("circle", { cx: x(rows.ours4[i]), cy: y, r: 6, fill: M.css("--ours4"), stroke: surface, "stroke-width": 2 }));
      s.appendChild(svg("circle", { cx: x(rows.ours[i]), cy: y, r: 6, fill: M.css("--ours"), stroke: surface, "stroke-width": 2 }));
      if (isAvg && !narrow) {
        // direct labels on the summary row only
        const best = Math.max(...baselines.map((id) => rows[id][i]));
        const items = [[rows.ours[i], "Memryoshka"], [rows.ours4[i], "+4 recent"], [best, "best baseline"]].sort((a, b) => a[0] - b[0]);
        items.forEach(([v, name], k) => {
          const above = k % 2 === 1;
          s.appendChild(svg("text", { x: x(v), y: above ? y - 12 : y + 21, "text-anchor": "middle", "font-size": 11.5, "font-weight": 600, fill: ink2 }, v.toFixed(1)));
        });
      }
      // row hit area: one tooltip with every method's value for this benchmark
      const hit = svg("rect", { x: 0, y: y - rowH / 2, width: W, height: rowH, fill: "transparent", tabindex: 0, role: "button",
        "aria-label": `${bm}: values for every method` });
      const show = (ev) => {
        const box = el("div", {}, [el("div", { class: "t-title", text: `${bm} · ${B.label}` })]);
        const order = ["ours", "ours4", "full", ...baselines].map((id) => [id, rows[id][i]]).sort((a, b) => b[1] - a[1]);
        order.forEach(([id, v]) => {
          const color = id === "ours" ? "var(--ours)" : id === "ours4" ? "var(--ours4)" : id === "full" ? "var(--ref)" : "var(--base)";
          box.appendChild(M.tipRow(id === "full" ? "Uncapped memory (reference)" : methodsById[id].name, v.toFixed(1), `background:${color}`));
        });
        const r = ev.clientX !== undefined ? [ev.clientX, ev.clientY] : (() => { const b = hit.getBoundingClientRect(); return [b.left + 40, b.top]; })();
        M.showTip(box, r[0], r[1]);
      };
      hit.addEventListener("pointermove", show);
      hit.addEventListener("focus", show);
      hit.addEventListener("pointerleave", M.hideTip);
      hit.addEventListener("blur", M.hideTip);
      s.appendChild(hit);
    });
    host.appendChild(s);
  }

  function drawMainTable() {
    const box = $("#main-table");
    box.textContent = "";
    const B = main.budgets[budget];
    const t = el("table", { class: "data" });
    t.appendChild(el("caption", { class: "sr-only", text: `Accuracy (%) at ${B.label} memory, ${B.readout} readout positions` }));
    t.appendChild(el("thead", {}, [el("tr", {}, [el("th", { text: `${B.label}, readout ${M.fmtInt(B.readout)}` }), ...main.benchmarks.map((b) => el("th", { text: b }))])]));
    const tb = el("tbody");
    const ranked = ["simplestream", "keyrec", "causalmem", "savemem", "ours", "ours4"];
    const best = main.benchmarks.map((_, i) => Math.max(...ranked.map((id) => B.rows[id][i])));
    main.methods.forEach((m) => {
      const cls = m.role === "ours" || m.role === "ours4" ? "ours" : m.role === "reference" || m.role === "hidden" ? "ref" : null;
      const tr = el("tr", { class: cls });
      tr.appendChild(el("td", { text: m.name }));
      B.rows[m.id].forEach((v, i) => tr.appendChild(el("td", { class: ranked.includes(m.id) && v === best[i] ? "best" : null, text: v.toFixed(1) })));
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    box.appendChild(t);
  }

  // ======================= Figure 07: small multiples =======================
  const T = R.tradeoff;
  let ret = "clip";
  const rseg = $("#ret-seg");
  const retBtns = [["clip", "LongCLIP retrieval (the real system)"], ["oracle", "Oracle retrieval (annotated evidence times)"]].map(([id, label]) => {
    const b = el("button", { type: "button", "aria-pressed": String(id === ret), text: label,
      onclick: () => { ret = id; retBtns.forEach((x) => x.setAttribute("aria-pressed", String(x === b))); drawTrade(); } });
    rseg.appendChild(b);
    return b;
  });
  $("#trade-legend").append(
    el("span", { class: "key" }, [el("span", { class: "line-key", style: "background:var(--base)" }), "One fixed code length, same writer"]),
    el("span", { class: "key" }, [el("span", { class: "line-key", style: "background:var(--ours)" }), "Memryoshka (adaptive)"])
  );

  function drawTrade() {
    const host = $("#trade-chart");
    host.textContent = "";
    const dom = ret === "clip" ? [34, 48] : [38, 62];
    T.caps.forEach((cap, ci) => {
      const panel = el("div");
      panel.appendChild(el("h5", { text: "Memory " + cap }));
      const W = Math.max(240, panel.clientWidth || (host.clientWidth - 36) / 3 || 300);
      host.appendChild(panel);
      const Wp = Math.max(240, panel.clientWidth || W), H = 210;
      const m = { l: 34, r: 12, t: 14, b: 32 };
      const x = (bits) => m.l + ((Math.log2(bits) - 8) / 4) * (Wp - m.l - m.r);
      const y = (v) => m.t + (1 - (v - dom[0]) / (dom[1] - dom[0])) * (H - m.t - m.b);
      const s = svg("svg", { class: "chart", width: Wp, height: H, viewBox: `0 0 ${Wp} ${H}`, role: "img",
        "aria-label": `LVBench accuracy against code length at ${cap}` });
      const ink3 = M.css("--ink-3"), grid = M.css("--grid"), surface = M.css("--card");
      for (let v = dom[0]; v <= dom[1]; v += ret === "clip" ? 2 : 4) {
        s.appendChild(svg("line", { x1: m.l, x2: Wp - m.r, y1: y(v), y2: y(v), stroke: grid, "stroke-width": 1 }));
        s.appendChild(svg("text", { x: m.l - 6, y: y(v) + 4, "text-anchor": "end", "font-size": 10.5, fill: ink3 }, String(v)));
      }
      T.fixed.forEach((f) => s.appendChild(svg("text", { x: x(f.bits), y: H - m.b + 15, "text-anchor": "middle", "font-size": 10.5, fill: ink3 }, f.bits >= 1024 ? f.bits / 1024 + "k" : String(f.bits))));
      s.appendChild(svg("text", { x: Wp - m.r, y: H - 3, "text-anchor": "end", "font-size": 10.5, fill: ink3 }, "bits per token"));
      // adaptive: a horizontal line at its accuracy (its average length varies, 545 to 624 bits)
      const av = T.adaptive[ret][ci];
      s.appendChild(svg("line", { x1: m.l, x2: Wp - m.r, y1: y(av), y2: y(av), stroke: M.css("--ours"), "stroke-width": 2, "stroke-linecap": "round" }));
      s.appendChild(svg("text", { x: m.l + 4, y: y(av) - 6, "font-size": 11.5, "font-weight": 600, fill: M.css("--ink-2") }, av.toFixed(1)));
      // fixed lengths
      const pts = T.fixed.map((f) => [x(f.bits), y(f[ret][ci])]);
      s.appendChild(svg("polyline", { points: pts.map((p) => p.join(",")).join(" "), fill: "none", stroke: M.css("--base"), "stroke-width": 2, "stroke-linejoin": "round" }));
      T.fixed.forEach((f) => {
        const v = f[ret][ci], cx = x(f.bits), cy = y(v);
        s.appendChild(svg("circle", { cx, cy, r: 4.5, fill: M.css("--base"), stroke: surface, "stroke-width": 2 }));
        const hit = svg("circle", { cx, cy, r: 13, fill: "transparent", tabindex: 0 });
        const show = (ev) => {
          const box = el("div", {}, [el("div", { class: "t-title", text: `Fixed ${M.fmtInt(f.bits)}-bit code · ${cap}` })]);
          box.appendChild(M.tipRow("Accuracy", v.toFixed(1) + "%", "background:var(--base)"));
          box.appendChild(M.tipRow("Frames still in memory", f.frames[ci].toFixed(1) + "%"));
          box.appendChild(M.tipRow("Tokens per kept frame", String(f.tok[ci])));
          box.appendChild(M.tipRow("Memryoshka, same memory", av.toFixed(1) + "%", "background:var(--ours)"));
          const b = hit.getBoundingClientRect();
          M.showTip(box, ev.clientX !== undefined ? ev.clientX : b.right, ev.clientY !== undefined ? ev.clientY : b.top);
        };
        hit.addEventListener("pointermove", show); hit.addEventListener("focus", show);
        hit.addEventListener("pointerleave", M.hideTip); hit.addEventListener("blur", M.hideTip);
        s.appendChild(hit);
      });
      // hover on the adaptive line
      const lineHit = svg("rect", { x: m.l, y: y(av) - 7, width: Wp - m.l - m.r, height: 14, fill: "transparent" });
      lineHit.addEventListener("pointermove", (ev) => {
        const box = el("div", {}, [el("div", { class: "t-title", text: `Memryoshka · ${cap}` })]);
        box.appendChild(M.tipRow("Accuracy", av.toFixed(1) + "%", "background:var(--ours)"));
        box.appendChild(M.tipRow("Frames still in memory", T.adaptive.frames[ci].toFixed(1) + "%"));
        box.appendChild(M.tipRow("Tokens per kept frame", String(T.adaptive.tok[ci])));
        M.showTip(box, ev.clientX, ev.clientY);
      });
      lineHit.addEventListener("pointerleave", M.hideTip);
      s.insertBefore(lineHit, s.firstChild);
      panel.appendChild(s);
    });
  }

  function drawTradeTable() {
    const box = $("#trade-table");
    box.textContent = "";
    const t = el("table", { class: "data" });
    const head = ["Code", ...T.caps.flatMap((c) => [c + " frames", c + " LongCLIP", c + " oracle"])];
    t.appendChild(el("thead", {}, [el("tr", {}, head.map((h) => el("th", { text: h })))]));
    const tb = el("tbody");
    const best = {};
    ["clip", "oracle"].forEach((k) => { best[k] = T.caps.map((_, ci) => Math.max(T.adaptive[k][ci], ...T.fixed.map((f) => f[k][ci]))); });
    const row = (name, d, cls) => {
      const tr = el("tr", { class: cls });
      tr.appendChild(el("td", { text: name }));
      T.caps.forEach((_, ci) => {
        tr.appendChild(el("td", { text: d.frames[ci].toFixed(1) + "%" }));
        ["clip", "oracle"].forEach((k) => tr.appendChild(el("td", { class: d[k][ci] === best[k][ci] ? "best" : null, text: d[k][ci].toFixed(1) })));
      });
      tb.appendChild(tr);
    };
    T.fixed.forEach((f) => row(`Fixed ${M.fmtInt(f.bits)} bits`, f));
    row("Memryoshka (adaptive)", T.adaptive, "ours");
    t.appendChild(tb);
    box.appendChild(el("p", { class: "table-note" }, [el("b", { text: "Bold:" }), " best accuracy in each column. Frames: share of frames still in memory."]));
    box.appendChild(t);
  }
  const tradeBtn = $("#trade-table-btn");
  tradeBtn.addEventListener("click", () => {
    const box = $("#trade-table"), open = box.hidden;
    box.hidden = !open; tradeBtn.setAttribute("aria-expanded", String(open));
    tradeBtn.textContent = open ? "Hide the table" : "Show the numbers as a table";
  });

  // ======================= ablation table =======================
  (function () {
    const A = R.ablations, box = $("#abl-table");
    const t = el("table", { class: "data" });
    t.appendChild(el("thead", {}, [el("tr", {}, [el("th", { text: "Configuration" }), ...A.columns.map((c) => el("th", { text: c }))])]));
    const tb = el("tbody");
    const best = A.columns.map((_, j) => Math.max(...A.rows.map((r) => r.v[j])));
    let g = undefined;
    A.rows.forEach((r) => {
      if (r.group !== g && r.group) tb.appendChild(el("tr", { class: "group" }, [el("td", { colspan: A.columns.length + 1, text: r.group })]));
      g = r.group;
      const tr = el("tr", { class: r.isDefault ? "ours" : null });
      tr.appendChild(el("td", { text: r.name }));
      r.v.forEach((v, j) => tr.appendChild(el("td", { class: v === best[j] ? "best" : null, text: v.toFixed(1) })));
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    box.appendChild(t);
  })();

  function all() { drawMainTable(); if (view === "chart") drawMain(); drawTrade(); drawTradeTable(); }
  all();
  M.onResize(all);
  M.onTheme(all);
})();
