// Scenes of the architecture video: one diagram that builds up step by step, with the active step highlighted.
(function () {
  const V = window.V, ctx = V.ctx, C = V.C, W = V.W;
  const S = V.scenes.arch;
  const STEP = { encode: 1, signals: 2, code: 3, write: 4, query: 5, read: 6, frozen: 7 };

  function box(x, y, w, h, title, sub, o = {}) {
    const a = o.alpha === undefined ? 1 : o.alpha;
    if (a <= 0) return;
    ctx.save(); ctx.globalAlpha *= a;
    V.fillRR(x, y, w, h, 18, o.fill || C.soft);
    if (o.active) V.strokeRR(x - 4, y - 4, w + 8, h + 8, 22, C.ours, 4);
    if (o.frozen) V.text("❄ frozen", x + w - 16, y + 32, { font: V.sans(20, 600), color: "#4f86c6", align: "right" });
    const ty = o.top ? y + 44 : y + (sub ? h / 2 - 4 : h / 2 + 11);
    if (title) V.text(title, x + 22, ty, { font: V.sans(o.size || 28, 600) });
    if (sub) V.text(sub, x + 22, o.top ? ty + 34 : y + h / 2 + 30, { font: V.sans(o.subSize || 22), color: C.ink3 });
    ctx.restore();
  }
  function flow(x1, y1, x2, y2, t, alpha, active) {
    if (alpha <= 0) return;
    V.arrow(x1, y1, x2, y2, active ? C.ours : C.ink3, 3, alpha);
    if (!active) return;
    for (let k = 0; k < 3; k++) {          // packets moving along the arrow
      const p = ((t * 0.9 + k / 3) % 1);
      ctx.save(); ctx.globalAlpha *= alpha; ctx.fillStyle = C.ours;
      ctx.beginPath(); ctx.arc(V.lerp(x1, x2, p), V.lerp(y1, y2, p), 7, 0, 7); ctx.fill(); ctx.restore();
    }
  }
  function tokenGrid(x, y, w, h, heat, alpha) {
    // the frame itself, cut into its 12 x 21 tokens; with heat > 0, the most-attended tokens get a red outline
    const rows = 12, cols = 21, cw = w / cols, ch = h / rows, F = V.frames.frames.find((f) => f.t === 210);
    const al = F ? F.tokens.map((t) => Math.log2(t[1])) : [];
    const lo = Math.min(...al), hi = Math.max(...al);
    ctx.save(); ctx.globalAlpha *= alpha;
    V.image(V.img.frame_210, x, y, w, h, 10);
    for (let p = 0; p < rows * cols; p++) {
      const a = F ? (al[p] - lo) / (hi - lo || 1) : 0.5;
      const cx = x + (p % cols) * cw, cy = y + Math.floor(p / cols) * ch;
      ctx.fillStyle = `rgba(10,12,15,${0.55 * heat * (1 - a)})`; ctx.fillRect(cx, cy, cw, ch);
      if (heat > 0 && a > 0.72) { ctx.strokeStyle = `rgba(214,48,40,${heat})`; ctx.lineWidth = 2.5; ctx.strokeRect(cx + 1.5, cy + 1.5, cw - 3, ch - 3); }
      ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 1; ctx.strokeRect(cx, cy, cw, ch);
    }
    ctx.restore();
  }

  function diagram(step, lt, d, t) {
    const vis = (k, delay = 0) => (step > k ? 1 : step === k ? V.eout(V.seg(lt, 0.2 + delay, 0.9 + delay)) : 0);
    const act = (k) => step === k;
    const frame = V.img.frame_210;
    // ---------------- write path (top row)
    V.kicker("Writing: every frame, as it arrives", 80, 120, { color: C.ink3, alpha: vis(1) });
    if (vis(1) > 0) V.image(frame, 80, 170, 320, 180, 14, vis(1));
    flow(410, 260, 470, 260, t, vis(1, 0.2), act(1));
    box(480, 190, 250, 140, "Vision encoder", "Qwen2.5-VL", { alpha: vis(1, 0.3), active: act(1), frozen: step >= 7 });
    flow(740, 260, 800, 260, t, vis(1, 0.5), act(1));
    if (vis(1, 0.6) > 0) {
      tokenGrid(810, 170, 320, 180, step >= 2 ? V.eout(V.seg(lt + (step > 2 ? 10 : 0), 0.4, 1.4)) : 0, vis(1, 0.6));
      V.text("252 visual tokens", 810, 385, { font: V.sans(22, 500), color: C.ink2, alpha: vis(1, 0.6) });
      if (step >= 2) V.text("red outline: most attention; dark: least", 810, 413, { font: V.sans(20), color: C.ink3, alpha: vis(2) });
    }
    // search tag
    box(80, 430, 320, 92, "LongCLIP image encoder", null, { alpha: vis(2, 0.4), active: act(2), size: 22, frozen: step >= 7 });
    if (vis(2, 0.4) > 0) {
      flow(240, 360, 240, 422, t, vis(2, 0.4), act(2));
      V.fillRR(420, 462, 120, 26, 13, "#4f86c6", vis(2, 0.8));
      V.text("one search tag", 552, 483, { font: V.sans(20), color: C.ink3, alpha: vis(2, 0.8) });
    }
    // nested code
    flow(1140, 260, 1190, 260, t, vis(3), act(3));
    box(1200, 170, 300, 180, "Nested code", null, { alpha: vis(3, 0.1), active: act(3), top: true });
    if (vis(3, 0.1) > 0) {
      const a = vis(3, 0.1), lines = ["3,584 numbers", "→ 512 PCA directions", "→ 8 bits each, best first"];
      lines.forEach((l, i) => V.text(l, 1222, 250 + i * 28, { font: V.sans(21, i ? 400 : 500), color: i ? C.ink2 : C.ink, alpha: a }));
      const r = act(3) ? [4096, 2048, 1024, 512][Math.min(3, Math.floor(V.seg(lt, 1.5, d - 0.5) * 4))] : 512;
      V.fillRR(1222, 324, 256, 12, 6, C.soft2, a);
      V.fillRR(1222, 324, 256 * r / 4096, 12, 6, C.ours, a);
    }
    // memory
    flow(1510, 260, 1560, 260, t, vis(4), act(4));
    box(1570, 150, 290, 380, "Memory", "fixed size: 7.2 MB", { alpha: vis(4, 0.1), active: act(4), top: true });
    if (vis(4, 0.1) > 0) {
      const a = vis(4, 0.1), D = V.stream, A = D.variants.adaptive.snapshots;
      const p = act(4) ? V.seg(lt, 0.4, d - 0.4) : 1, snap = A[Math.min(A.length - 1, Math.floor(p * (A.length - 1)))];
      const x0 = 1592, w = 246, y0 = 300, h = 120, nb = snap.tok.length, cols = Math.floor(w / 3);
      ctx.save(); ctx.globalAlpha *= a;
      for (let c = 0; c < cols; c++) {
        const b0 = Math.floor((c / cols) * D.n_frames / D.bin_s), b1 = Math.floor(((c + 1) / cols) * D.n_frames / D.bin_s);
        let tok = 0, n = 0, bits = 0, wb = 0;
        for (let b = b0; b < b1 && b < nb; b++) { tok += snap.tok[b]; n++; if (snap.tok[b]) { bits += snap.bits[b] * snap.tok[b]; wb += snap.tok[b]; } }
        if (!n || !tok) continue;
        const bh = Math.max(2, tok / n / 252 * h);
        ctx.fillStyle = V.ramp(wb ? bits / wb : 512); ctx.fillRect(x0 + c * 3, y0 + h - bh, 2, bh);
      }
      // price meter
      V.text("price per bit", 1592, 470, { font: V.sans(20, 500), color: C.ink3 });
      V.fillRR(1592, 484, 246, 14, 7, C.soft2);
      V.fillRR(1592, 484, 246 * V.clamp(p * 1.05), 14, 7, C.brand);
      ctx.restore();
    }
    // ---------------- read path (bottom row)
    V.kicker("Reading: when a question arrives", 80, 650, { color: C.ink3, alpha: vis(5) });
    box(80, 690, 380, 110, "“What did the", "squirrels do?”", { alpha: vis(5, 0.1), active: act(5), size: 26, subSize: 26 });
    flow(470, 745, 520, 745, t, vis(5, 0.3), act(5));
    box(530, 700, 290, 92, "LongCLIP text encoder", null, { alpha: vis(5, 0.4), active: act(5), size: 22, frozen: step >= 7 });
    flow(830, 745, 880, 745, t, vis(5, 0.6), act(5));
    if (vis(5, 0.7) > 0) {
      const a = vis(5, 0.7), sims = [0.92, 0.81, 0.77, 0.52, 0.44, 0.31];
      V.text("match against the tags", 890, 690, { font: V.sans(21, 500), color: C.ink2, alpha: a });
      sims.forEach((s, i) => {
        V.fillRR(890, 708 + i * 18, 240 * s, 12, 6, i < 3 ? C.ours : C.soft2, a);
      });
      flow(1140, 680, 1600, 545, t, a * 0.9, act(5));
    }
    flow(1145, 770, 1190, 770, t, vis(6), act(6));
    box(1200, 690, 260, 160, "Decode", "the chosen codes", { alpha: vis(6, 0.1), active: act(6), size: 26, top: true });
    if (vis(6, 0.1) > 0) V.text("back into tokens,", 1222, 800, { font: V.sans(22), color: C.ink3, alpha: vis(6, 0.1) });
    if (vis(6, 0.1) > 0) V.text("each in its place", 1222, 828, { font: V.sans(22), color: C.ink3, alpha: vis(6, 0.1) });
    flow(1470, 770, 1520, 770, t, vis(6, 0.4), act(6));
    box(1530, 670, 330, 200, "Language model", "Qwen2.5-VL", { alpha: vis(6, 0.5), active: act(6), frozen: step >= 7 });
    if (vis(6, 0.8) > 0) {
      const a = vis(6, 0.8), chips = ["[12:05]", "▦▦", "[31:40]", "▦", "Q"];
      let cx = 1552;
      chips.forEach((ch) => {
        ctx.save(); ctx.font = V.sans(18, 600); const w = ctx.measureText(ch).width + 16; ctx.restore();
        V.fillRR(cx, 810, w, 30, 8, ch === "Q" ? C.ours4 : "#ffffff", a);
        V.text(ch, cx + w / 2, 831, { font: V.sans(18, 600), color: ch === "Q" ? "#fff" : C.ink2, align: "center", alpha: a });
        cx += w + 6;
      });
    }
    if (step >= 7) {
      const a = V.eout(V.seg(lt, 0.6, 1.2));
      V.fillRR(560, 555, 800, 70, 35, C.ink, a);
      V.text("Trained: nothing.  Fitted once: a PCA basis.", W / 2, 601, { font: V.sans(30, 600), color: "#fff", align: "center", alpha: a });
    }
  }

  S.title = function (lt, d) {
    const a = V.eout(V.seg(lt, 0.05, 0.6)), logo = V.img.logo;
    ctx.save(); ctx.globalAlpha *= a;
    if (logo) { const h = 150, w = h * logo.width / logo.height; ctx.drawImage(logo, W / 2 - w / 2, 230, w, h); }
    V.text("How Memryoshka works", W / 2, 500, { font: V.serif(90, 500), align: "center" });
    V.text("with a frozen vision-language model", W / 2, 565, { font: V.serif(40, 400, true), color: C.ink2, align: "center" });
    ctx.restore();
  };
  Object.keys(STEP).forEach((id) => { S[id] = (lt, d, t) => diagram(STEP[id], lt, d, t); });
})();
