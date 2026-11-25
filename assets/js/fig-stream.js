// Figure 01: the memory over a 48-minute stream, from a real replay of the paper's writer.
(function () {
  const M = window.MEM, D = window.MEM_STREAM;
  if (!D) return;
  const { $, el } = M;
  const A = D.variants.adaptive.snapshots, F = D.variants.fixed4096.snapshots;
  const N = D.n_frames, BIN = D.bin_s, TPF = D.tokens_per_frame, FULL = D.full_precision_frames;
  const BUDGET = D.budget_bytes;
  const lanes = { ours: $("#lane-ours canvas"), fixed: $("#lane-fixed canvas"), full: $("#lane-full canvas") };
  let cur = 0, hoverT = null;

  // ---- thumbnails (one every 10 s, in one sprite)
  const TH = D.thumbs, sprite = new Image();
  sprite.src = TH.src;
  function drawThumb(ctx, t, w, h) {
    const k = Math.min(TH.count - 1, Math.max(0, Math.round(t / TH.every_s)));
    ctx.drawImage(sprite, (k % TH.cols) * TH.w, Math.floor(k / TH.cols) * TH.h, TH.w, TH.h, 0, 0, w, h);
  }
  const SLOTS = 12, strip = $("#strip"), slotEls = [];
  for (let j = 0; j < SLOTS; j++) {
    const c = el("canvas", { width: TH.w, height: TH.h });
    const s = el("div", { class: "slot future" }, [c, el("span", { class: "ts" })]);
    strip.appendChild(s);
    slotEls.push({ s, c, t: Math.round(((j + 0.5) * N) / SLOTS) });
  }

  // ---- per-column aggregation of the 3-second bins
  function columnStats(snap, c, W, withBits) {
    const t0 = (c * N) / W, t1 = ((c + 1) * N) / W;
    let b0 = Math.floor(t0 / BIN), b1 = Math.max(b0 + 1, Math.floor(t1 / BIN));
    const nb = snap.tok.length;
    let tok = 0, n = 0, bits = 0, wb = 0;
    for (let b = b0; b < b1 && b < nb; b++) {
      tok += snap.tok[b]; n++;
      if (withBits && snap.tok[b]) { bits += snap.bits[b] * snap.tok[b]; wb += snap.tok[b]; }
    }
    return n ? { tok: tok / n, bits: wb ? bits / wb : 0 } : null;
  }

  function drawLane(kind) {
    const canvas = lanes[kind];
    const { ctx, w, h } = M.setupCanvas(canvas);
    const snapA = A[cur], seen = snapA.t, xNow = (seen / N) * w;
    const padTop = kind === "ours" ? 8 : 6, base = h - 1, H = base - padTop;
    ctx.clearRect(0, 0, w, h);
    // grid: a hairline at full height and the baseline
    ctx.fillStyle = M.css("--grid");
    ctx.fillRect(0, padTop, w, 1);
    ctx.fillStyle = M.css("--axis");
    ctx.fillRect(0, base, xNow, 1);
    // not yet seen
    ctx.fillStyle = M.css("--future");
    ctx.fillRect(xNow, padTop, w - xNow, H + 1);
    if (w - xNow > 120 && kind === "ours") {
      ctx.fillStyle = M.css("--ink-3");
      ctx.font = "500 12px " + M.css("--sans");
      ctx.textAlign = "center";
      ctx.fillText("not yet seen", xNow + (w - xNow) / 2, padTop + H / 2 + 4);
    }
    if (kind === "full") {
      // what 7.2 MB holds at 16 bits: the newest FULL (about 3.97) frames, each with all of its tokens
      const x0 = ((seen - FULL) / N) * w;
      ctx.fillStyle = M.css("--ink");
      ctx.fillRect(Math.max(0, Math.min(x0, xNow - 2)), padTop, Math.max(2, xNow - x0), H);
      ctx.fillStyle = M.css("--ink-2");
      ctx.font = "500 12px " + M.css("--sans");
      ctx.textAlign = xNow > 200 ? "right" : "left";
      ctx.fillText("the newest 4 seconds", xNow > 200 ? xNow - 8 : xNow + 8, padTop + H / 2 + 4);
    } else {
      const snap = kind === "ours" ? snapA : F[cur];
      const cols = Math.ceil(xNow);
      const fixedColor = M.rampColor(4096);
      for (let c = 0; c < cols; c++) {
        const s = columnStats(snap, c, w, kind === "ours");
        if (!s || s.tok <= 0) continue;
        const bh = Math.max(1, (s.tok / TPF) * H);
        ctx.fillStyle = kind === "ours" ? M.rampColor(s.bits) : fixedColor;
        ctx.fillRect(c, base - bh, 1, bh);
      }
    }
    // now line
    ctx.fillStyle = M.css("--ink");
    ctx.fillRect(Math.min(w - 1, xNow), padTop - 4, 1, H + 5);
    // hover crosshair
    if (hoverT !== null) {
      const xh = (hoverT / N) * w;
      ctx.fillStyle = M.css("--ink-3");
      ctx.fillRect(xh, padTop, 1, H);
    }
  }

  function setText(id, t) { const n = document.getElementById(id); if (n) n.textContent = t; }

  function render(i) {
    cur = i;
    const a = A[i], f = F[i], seen = a.t;
    ["ours", "fixed", "full"].forEach(drawLane);
    // lane stats
    setText("lane-ours-stat", `${M.fmtInt(a.kept)} frames · ${Math.round(a.tokens / Math.max(1, a.kept))} tokens each`);
    setText("lane-fixed-stat", `${M.fmtInt(f.kept)} frames · ${Math.round(f.tokens / Math.max(1, f.kept))} tokens each`);
    setText("lane-full-stat", "fewer than 4 frames fit");
    // stats row
    setText("st-seen", M.fmtTime(seen));
    setText("st-seen-s", "of " + M.fmtTime(N) + ", one frame per second");
    setText("st-mem", (a.bytes / 1e6).toFixed(1) + " MB");
    $("#st-mem-bar").style.width = Math.min(100, (100 * a.bytes) / BUDGET).toFixed(1) + "%";
    setText("st-frames", M.fmtInt(a.kept));
    setText("st-frames-s", `${Math.round((100 * a.kept) / seen)}% of the ${M.fmtInt(seen)} seen`);
    const tot = a.hist.reduce((x, y) => x + y, 0);
    const avg = a.hist.reduce((s, n, k) => s + n * D.lengths[k], 0) / Math.max(1, tot);
    setText("st-bits", Math.round(avg) + " bits on average");
    const sb = $("#st-segbar");
    sb.textContent = "";
    D.lengths.forEach((L, k) => {
      if (!a.hist[k]) return;
      const share = a.hist[k] / tot;
      sb.appendChild(el("i", { style: `flex:${share};background:var(--b${L})`, title: `${M.fmtInt(L)} bits: ${Math.round(100 * share)}% of kept tokens` }));
    });
    setText("s-time", M.fmtTime(seen) + " / " + M.fmtTime(N));
    // strip
    slotEls.forEach(({ s, c, t }) => {
      const visible = t <= seen;
      s.classList.toggle("future", !visible);
      const b = Math.floor(t / BIN);
      s.classList.toggle("gone", visible && !(a.tok[b] > 0));
      s.querySelector(".ts").textContent = visible ? M.fmtTime(t) : "";
      const ctx = c.getContext("2d");
      ctx.clearRect(0, 0, c.width, c.height);
      if (visible && sprite.complete) drawThumb(ctx, t, c.width, c.height);
    });
  }

  // axis labels under the lanes: a tick every 10 minutes, and the names of the stream's parts if it has any
  const axis = $("#axis-row");
  for (let m = 0; m * 60 <= N; m += 10) {
    const left = (100 * m * 60) / N;
    axis.appendChild(el("span", { class: "tick", style: `left:${left}%`, text: m + " min" }));
  }
  if (D.segments) {
    const segRow = el("div", { class: "seg-row" });
    D.segments.forEach(([name, s0, s1]) => segRow.appendChild(el("span", {
      style: `left:${(100 * s0) / N}%;width:${(100 * (s1 - s0)) / N}%`, text: name })));
    axis.after(segRow);
  }

  // ---- hover: crosshair on all lanes plus a tooltip with the thumbnail and the stored state
  function hover(ev) {
    const r = ev.currentTarget.getBoundingClientRect();
    const t = Math.max(0, Math.min(N - 1, ((ev.clientX - r.left) / r.width) * N));
    hoverT = t;
    ["ours", "fixed", "full"].forEach(drawLane);
    const a = A[cur], f = F[cur], b = Math.floor(t / BIN), seen = a.t;
    const box = el("div");
    box.appendChild(el("div", { class: "t-title", text: "At " + M.fmtTime(t) + " in the video" }));
    if (t > seen) {
      box.appendChild(el("div", { class: "muted", text: "Not seen yet at " + M.fmtTime(seen) + "." }));
    } else {
      const c = el("canvas", { width: 192, height: 108, style: "width:192px;height:108px" });
      if (sprite.complete) drawThumb(c.getContext("2d"), t, 192, 108);
      box.appendChild(c);
      const width = Math.min(BIN, seen - b * BIN);
      const keptA = a.kept_n[b] || 0, keptF = f.kept_n[b] || 0;
      const perA = keptA ? Math.round((a.tok[b] * width) / keptA) : 0, perF = keptF ? Math.round((f.tok[b] * width) / keptF) : 0;
      box.appendChild(el("div", { class: "muted", style: "font-size:12px;margin-bottom:2px", text: "Frames kept from these seconds:" }));
      box.appendChild(M.tipRow("Memryoshka", keptA ? `${keptA} of ${width}, ${perA} tokens each, ~${a.bits[b]} bits per token` : `0 of ${width}`));
      box.appendChild(M.tipRow("Fixed 4,096-bit", keptF ? `${keptF} of ${width}, ${perF} tokens each` : `0 of ${width}`));
      box.appendChild(el("div", { class: "muted", style: "margin-top:4px;font-size:12px", text: "Seconds " + M.fmtTime(b * BIN) + " to " + M.fmtTime(b * BIN + width) + ", memory state at " + M.fmtTime(seen) + "." }));
    }
    M.showTip(box, ev.clientX, ev.clientY);
  }
  function leave() { hoverT = null; M.hideTip(); ["ours", "fixed", "full"].forEach(drawLane); }
  Object.values(lanes).forEach((c) => { c.addEventListener("pointermove", hover); c.addEventListener("pointerleave", leave); });

  const player = M.Player({
    steps: A.length, onStep: render, play: $("#s-play"), prev: $("#s-prev"), next: $("#s-next"),
    range: $("#s-range"), speed: $("#s-speed"), stepsPerSecond: 5, loopPause: 2200
  });
  sprite.onload = () => render(cur);
  player.set(0);
  // start on the last step when motion is reduced; otherwise play once the figure is in view
  if (M.reducedMotion) player.set(A.length - 1);
  else M.whenVisible($("#fig-stream"), () => player.start(), 0.4);
  M.onResize(() => render(cur));
  M.onTheme(() => render(cur));
})();
