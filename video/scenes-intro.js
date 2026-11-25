// Scenes of the 60-second intro video. Each draw(lt, d) gets the time since the scene started and its length.
(function () {
  const V = window.V, ctx = V.ctx, C = V.C, W = V.W;
  const S = V.scenes.intro;
  const strip = (i) => V.img["strip" + (((i % 27) + 27) % 27)];
  const FILMS = [["Big Buck Bunny", 0, 597], ["Sintel", 597, 1485], ["Elephants Dream", 1485, 2139], ["Tears of Steel", 2139, 2872]];

  // ---------------------------------------------------------------- 0. title slide (silent)
  function glasses(cx, cy, sc) {
    ctx.save(); ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = C.ink; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.roundRect(-118, -34, 96, 70, 26); ctx.stroke();
    ctx.beginPath(); ctx.roundRect(22, -34, 96, 70, 26); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-22, -10); ctx.quadraticCurveTo(0, -24, 22, -10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-118, -22); ctx.lineTo(-150, -32); ctx.moveTo(118, -22); ctx.lineTo(150, -32); ctx.stroke();
    ctx.fillStyle = C.ours; ctx.beginPath(); ctx.arc(-70, 0, 13, 0, 7); ctx.fill();          // a small camera
    ctx.fillStyle = C.brand; ctx.beginPath(); ctx.arc(97, -18, 7, 0, 7); ctx.fill();         // recording light
    ctx.restore();
  }
  function camera(cx, cy, sc) {
    ctx.save(); ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.lineJoin = "round";
    V.fillRR(-90, -50, 180, 100, 18, C.ink);
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(-10, 0, 33, 0, 7); ctx.fill();
    ctx.fillStyle = C.ours; ctx.beginPath(); ctx.arc(-10, 0, 21, 0, 7); ctx.fill();
    ctx.fillStyle = C.ink; ctx.beginPath(); ctx.moveTo(90, -22); ctx.lineTo(132, -46); ctx.lineTo(132, 46); ctx.lineTo(90, 22); ctx.fill();
    ctx.fillStyle = C.brand; ctx.beginPath(); ctx.arc(62, -30, 8, 0, 7); ctx.fill();
    ctx.restore();
  }
  S.title = function (lt, d) {
    const logo = V.img.logo;
    const a1 = V.eout(V.seg(lt, 0.0, 0.7)), a2 = V.eout(V.seg(lt, 0.35, 1.0));
    if (logo) { const h = 150, w = h * logo.width / logo.height; ctx.save(); ctx.globalAlpha *= a1; ctx.drawImage(logo, W / 2 - w / 2, 64 + (1 - a1) * 16, w, h); ctx.restore(); }
    V.text("Memryoshka", W / 2, 322 + (1 - a1) * 12, { font: V.serif(104, 500), align: "center", alpha: a1 });
    V.text("Adaptive-Fidelity Video Memory for Streaming VLMs", W / 2, 382, { font: V.serif(40, 400, true), color: C.ink2, align: "center", alpha: a2 });
    // use cases
    const cards = [
      ["Smart glasses", (x, y) => glasses(x, y, 0.95)],
      ["Robots", (x, y) => robotArm(x + 18, y - 6, 0.54, lt)],
      ["Audio and video", (x, y) => {
        const im = strip(1); V.image(im, x - 88, y - 82, 176, 99, 8);
        const wv = window.WAVE || [], ww = 240, st = ww / 90; ctx.fillStyle = C.ours;
        for (let k = 0; k < 90; k++) { const v = wv[(k * 4) % wv.length] || 0.2, hh = Math.max(3, Math.sqrt(v) * 40); ctx.fillRect(x - 120 + k * st, y + 46 - hh / 2, Math.max(1, st - 1), hh); }
      }],
      ["Live video streams", (x, y) => { camera(x - 30, y - 12, 0.62); for (let k = 0; k < 3; k++) V.image(strip(8 + k * 5), x + 64, y - 66 + k * 46, 72, 40, 5); }],
    ];
    const cw = 360, chh = 238, gap = 34, total = cards.length * cw + (cards.length - 1) * gap, x0 = (W - total) / 2, cy = 440;
    cards.forEach(([label, draw], i) => {
      const a = V.eout(V.seg(lt, 0.9 + 0.22 * i, 1.4 + 0.22 * i));
      if (a <= 0) return;
      const x = x0 + i * (cw + gap);
      ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, (1 - a) * 18);
      V.fillRR(x, cy, cw, chh, 22, C.soft);
      draw(x + cw / 2, cy + 98);
      V.text(label, x + cw / 2, cy + chh - 28, { font: V.sans(28, 600), align: "center" });
      ctx.restore();
    });
    // work done by
    const la = V.eout(V.seg(lt, 2.0, 2.7));
    if (la > 0) {
      V.text("WORK DONE BY", W / 2, 806, { font: V.sans(22, 600), color: C.ink3, align: "center", alpha: la });
      const L = [["uoft", 80], ["vector", 70], ["york", 42], ["ubc", 56], ["stanford", 44]];
      const sizes = L.map(([k, h]) => { const im = V.img["logo_" + k]; return im ? [im, h * im.width / im.height, h] : null; }).filter(Boolean);
      const lg = 74, lw = sizes.reduce((s, z) => s + z[1], 0) + lg * (sizes.length - 1);
      let lx = (W - lw) / 2;
      ctx.save(); ctx.globalAlpha *= la;
      sizes.forEach(([im, w, h]) => { ctx.drawImage(im, lx, 900 - h / 2, w, h); lx += w + lg; });
      ctx.restore();
    }
  };

  // ---------------------------------------------------------------- 1. always-on video
  S.watch = function (lt, d) {
    const total = V.stream.n_frames;
    const secs = V.ease(V.seg(lt, 0.2, d - 0.4)) * total;
    V.kicker("Always-on video", W / 2, 120, { align: "center" });
    V.text(V.fmtTime(secs), W / 2, 230, { font: V.sans(96, 700), align: "center" });
    V.text("of video seen so far", W / 2, 280, { font: V.sans(30), color: C.ink3, align: "center" });
    const fw = 432, fh = 243, gap = 22, y = 345, x0 = 80 - lt * 380;
    for (let i = 0; i < 27; i++) {
      const x = x0 + i * (fw + gap);
      if (x > W || x + fw < 0) continue;
      V.image(strip(i), x, y, fw, fh, 14);
    }
    const qa = V.eout(V.seg(lt, d - 2.4, d - 1.8));
    if (qa > 0) {
      const bx = W / 2 - 330, by = 640;
      ctx.save(); ctx.globalAlpha *= qa;
      V.fillRR(bx, by, 660, 92, 46, C.ink);
      ctx.beginPath(); ctx.moveTo(W / 2 - 20, by); ctx.lineTo(W / 2, by - 22); ctx.lineTo(W / 2 + 20, by); ctx.fillStyle = C.ink; ctx.fill();
      V.text("“What happened 40 minutes ago?”", W / 2, by + 60, { font: V.sans(38, 500), color: "#fff", align: "center" });
      ctx.restore();
    }
  };

  // ---------------------------------------------------------------- 2. video is heavy
  S.heavy = function (lt, d) {
    const fx = 130, fy = 190, fw = 800, fh = 450, img = strip(0);
    V.image(img, fx, fy, fw, fh, 16);
    // the frame's 12 x 21 token grid sweeps in
    const p = V.seg(lt, 0.3, 1.8), rows = 12, cols = 21, cw = fw / cols, ch = fh / rows;
    ctx.save(); V.rr(fx, fy, fw, fh, 16); ctx.clip();
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const a = V.clamp((p * (cols + rows) - (c + r)) / 3);
      if (a <= 0) continue;
      ctx.strokeStyle = `rgba(255,255,255,${0.75 * a})`; ctx.lineWidth = 2;
      ctx.strokeRect(fx + c * cw + 1, fy + r * ch + 1, cw - 2, ch - 2);
    }
    ctx.restore();
    V.text("One frame = 252 visual tokens of 3,584 numbers each", fx, fy + fh + 50, { font: V.sans(28, 500), color: C.ink2, alpha: V.seg(lt, 1.0, 1.6) });
    // counters
    const x = 1040, k = V.ease(V.seg(lt, 1.2, d - 1.0));
    V.kicker("One hour of video", x, 250, { alpha: V.seg(lt, 0.8, 1.3) });
    V.text(V.fmtInt(920000 * k), x, 380, { font: V.sans(120, 700) });
    V.text("visual tokens", x, 432, { font: V.sans(32), color: C.ink3 });
    V.text((6.6 * k).toFixed(1) + " GB", x, 590, { font: V.sans(120, 700), color: C.brand });
    V.text("at 16 bits per number", x, 642, { font: V.sans(32), color: C.ink3 });
  };

  // ---------------------------------------------------------------- 3. most memories forget
  S.forget = function (lt, d) {
    const P = 0.95, fw = 330, fh = 186, gap = 18, slots = 4;
    const bw = slots * fw + (slots - 1) * gap + 48, bx = (W - bw) / 2, by = 300, bh = fh + 48;
    V.kicker("A fixed memory, full precision", W / 2, 190, { align: "center" });
    V.text("keep some frames in full, drop the rest", W / 2, 240, { font: V.sans(32), color: C.ink3, align: "center" });
    V.strokeRR(bx, by, bw, bh, 22, C.ink, 3);
    const k = Math.floor(lt / P), p = V.ease(V.seg(lt - k * P, 0.15, 0.75));
    const slotX = (j) => bx + 24 + j * (fw + gap);
    for (let i = k - slots; i <= k + 1; i++) {
      const s = i - k + slots - 1;               // slot before this step's move (k = newest)
      let x, y = by + 24, a = 1;
      if (i === k + 1) { x = V.lerp(W + 40, slotX(slots - 1), p); }            // arriving
      else if (s === 0) { x = slotX(0) - p * 60; y += p * 300; a = 1 - p; }    // falling out
      else if (s < 0) continue;
      else { x = V.lerp(slotX(s), slotX(s - 1), p); }
      V.image(strip(i + 3), x, y, fw, fh, 12, a);
      if (s === 0 && p > 0.05) V.text("dropped", x + fw / 2, y + fh + 44, { font: V.sans(28, 600), color: C.brand, align: "center", alpha: a });
    }
  };

  // ---------------------------------------------------------------- 4. nested codes
  const C8 = V.code, K = C8.components, P8 = C8.planes, NB = K * P8;
  const rank = new Int32Array(NB), E = new Float64Array(NB + 1);
  for (let i = 0; i < NB; i++) {
    const k = C8.order[2 * i], p = C8.order[2 * i + 1];
    rank[k * P8 + p] = i; E[i + 1] = E[i] + C8.sigma2[k] * C8.gains[p];
  }
  function bitGrid(x, y, w, h, r, alpha) {
    const gap = 4, rowH = (h - gap * (P8 - 1)) / P8, colW = w / K;
    ctx.save(); ctx.globalAlpha *= alpha;
    for (let p = 0; p < P8; p++) {
      const yy = y + p * (rowH + gap);
      ctx.fillStyle = C.soft2; ctx.fillRect(x, yy, w, rowH);
      ctx.fillStyle = C.ours;
      let start = -1;
      for (let k = 0; k <= K; k++) {
        const on = k < K && rank[k * P8 + p] < r;
        if (on && start < 0) start = k;
        if (!on && start >= 0) { ctx.fillRect(x + start * colW, yy, Math.ceil((k - start) * colW), rowH); start = -1; }
      }
    }
    ctx.restore();
  }
  S.nested = function (lt, d) {
    const move = V.ease(V.seg(lt, 1.4, 2.4));
    const logo = V.img.logo, lh = V.lerp(300, 170, move), lw = lh * (logo ? logo.width / logo.height : 1.37);
    const lx = V.lerp(W / 2 - lw / 2, 120, move), ly = V.lerp(230, 210, move);
    if (logo) ctx.drawImage(logo, lx, ly, lw, lh);
    V.text("Memryoshka", V.lerp(W / 2, 120 + lw / 2, move), V.lerp(620, 440, move), { font: V.serif(V.lerp(84, 48, move), 500), align: "center" });
    const ga = V.seg(lt, 2.0, 2.6);
    if (ga <= 0) return;
    const steps = [[2.4, 4096], [3.5, 2048], [4.5, 1024], [5.5, 512]];
    let r = 4096;
    steps.forEach(([ts, rr]) => { if (lt >= ts) r = rr; });
    const gx = 520, gy = 250, gw = 1260, gh = 230;
    V.kicker("One token's code: 512 directions × 8 bits", gx, gy - 40, { alpha: ga });
    bitGrid(gx, gy, gw, gh, r, ga);
    V.text("most important bits first →", gx, gy + gh + 40, { font: V.sans(26), color: C.ink3, alpha: ga });
    // the stored prefix as one bar, cut at r
    const by = gy + gh + 90, bw = gw;
    V.fillRR(gx, by, bw, 34, 17, C.soft2, ga);
    V.fillRR(gx, by, bw * (r / 4096), 34, 17, C.ours, ga);
    V.text(V.fmtInt(r) + " bits", gx, by + 110, { font: V.sans(64, 700), alpha: ga });
    V.text("keeps " + Math.round(100 * E[r]) + "% of the detail", gx + 380, by + 103, { font: V.sans(36, 500), color: C.ink2, alpha: ga });
    V.text("shorter code = same token, less detail, nothing re-encoded", gx, by + 165, { font: V.sans(28), color: C.ink3, alpha: V.seg(lt, 3.6, 4.2) });
  };

  // ---------------------------------------------------------------- 5. one price per bit
  S.price = function (lt, d) {
    const F = V.frames, frame = F.frames.find((f) => f.t === 2550) || F.frames[0];
    const endL = Math.log10(F.marks[F.marks.length - 1].theta);
    // pacing: hold sharp, raise the price through the shortening range, then through the dropping range, then hold
    const t1 = 0.7, t2 = 0.7 + 0.5 * (d - 2.0), t3 = d - 1.3;
    const thetaAt = (u) => {
      if (u < t1) return 0;
      if (u < t2) return Math.pow(10, V.lerp(-7.2, -4.75, V.ease(V.seg(u, t1, t2))));
      return Math.pow(10, V.lerp(-4.75, endL, V.ease(V.seg(u, t2, t3))));
    };
    const x = 120, y = 150, w = 1040, h = 585;
    const st = V.pixelFrame(frame, thetaAt, lt, x, y, w, h, { window: 0.45 });
    V.text("coarser = fewer bits per token  ·  dark = dropped  ·  the pixels illustrate code length", x, y + h + 40,
      { font: V.sans(22), color: C.ink3 });
    const px = 1260, phase = lt < t1 ? "every token at full detail" : lt < t2 ? "first, codes get shorter" : "then the least useful tokens drop";
    V.kicker("One price per bit", px, 190);
    const pnow = lt < t1 ? 0 : V.seg(Math.log10(Math.max(thetaAt(lt), 1e-12)), -7.2, endL);
    const mx = px, my = 240, mw = 26, mh = 420;
    V.fillRR(mx, my, mw, mh, 13, C.soft2);
    V.fillRR(mx, my + mh * (1 - pnow), mw, mh * pnow, 13, C.brand);
    V.text("price", mx + mw / 2, my + mh + 40, { font: V.sans(24, 500), color: C.ink3, align: "center" });
    V.text(String(st.kept), px + 80, 330, { font: V.sans(96, 700) });
    V.text("of 252 tokens kept", px + 80, 375, { font: V.sans(30), color: C.ink3 });
    const avg = st.kept ? Math.round(st.bits / st.kept) : 0;
    V.text(V.fmtInt(avg), px + 80, 510, { font: V.sans(96, 700), color: C.ours });
    V.text("bits per kept token", px + 80, 555, { font: V.sans(30), color: C.ink3 });
    V.text(phase, px + 80, 640, { font: V.sans(30, 600), color: C.ink2 });
  };

  // ---------------------------------------------------------------- 6. the stream
  S.stream = function (lt, d) {
    const D = V.stream, A = D.variants.adaptive.snapshots, Fx = D.variants.fixed4096.snapshots, N = D.n_frames, BIN = D.bin_s;
    const prog = V.seg(lt, 0.4, d - 1.6), idx = Math.min(A.length - 1, Math.floor(prog * (A.length - 1) + 1e-9));
    const a = A[idx], f = Fx[idx], seen = a.t;
    V.text("48 minutes of film, one 7.2 MB memory", 120, 108, { font: V.serif(52, 500) });
    V.text(`${V.fmtTime(seen)} seen  \u00b7  ${(a.bytes / 1e6).toFixed(1)} of 7.2 MB used  \u00b7  ${Math.round((100 * a.kept) / seen)}% of frames kept`,
      1800, 250, { font: V.sans(24, 600), color: C.ink2, align: "right" });
    const X0 = 460, X1 = 1800, LW = X1 - X0, xNow = X0 + (seen / N) * LW;
    // thumbnails
    const slots = 12, tw = (LW - (slots - 1) * 10) / slots, th = tw * 9 / 16;
    for (let j = 0; j < slots; j++) {
      const t = Math.round(((j + 0.5) * N) / slots), tx = X0 + j * (tw + 10), ty = 150;
      if (t > seen) { V.fillRR(tx, ty, tw, th, 8, C.soft); continue; }
      const gone = !(a.tok[Math.floor(t / BIN)] > 0);
      V.thumb(t, tx, ty, tw, th, 8, 1, gone ? "grayscale(1) brightness(0.55)" : null);
    }
    function lane(y, h, snap, colorFn, label, sub, statLine) {
      ctx.fillStyle = C.soft; ctx.fillRect(xNow, y, X1 - xNow, h);
      ctx.fillStyle = C.line; ctx.fillRect(X0, y + h, xNow - X0, 2);
      if (snap) {
        const cols = Math.ceil(xNow - X0), nb = snap.tok.length;
        for (let c = 0; c < cols; c++) {
          const b0 = Math.floor((c / LW) * N / BIN), b1 = Math.max(b0 + 1, Math.floor(((c + 1) / LW) * N / BIN));
          let tok = 0, n = 0, bits = 0, wb = 0;
          for (let b = b0; b < b1 && b < nb; b++) { tok += snap.tok[b]; n++; if (snap.bits && snap.tok[b]) { bits += snap.bits[b] * snap.tok[b]; wb += snap.tok[b]; } }
          if (!n || tok <= 0) continue;
          const bh = Math.max(1.5, (tok / n / 252) * h);
          ctx.fillStyle = colorFn(wb ? bits / wb : 4096); ctx.fillRect(X0 + c, y + h - bh, 1, bh);
        }
      }
      V.text(label, 120, y + 34, { font: V.sans(30, 600) });
      if (sub) V.text(sub, 120, y + 70, { font: V.sans(24), color: C.ink3 });
      if (statLine) V.text(statLine, 120, y + (sub ? 104 : 70), { font: V.sans(24, 500), color: C.ink2 });
    }
    lane(270, 230, a, (b) => V.ramp(b), "Memryoshka", null, `${V.fmtInt(a.kept)} frames · ${Math.round(a.tokens / Math.max(1, a.kept))} tokens each`);
    lane(540, 90, f, () => V.ramp(4096), "Fixed 4,096-bit code", "same writer, keep or drop", `${V.fmtInt(f.kept)} frames`);
    // full precision: the newest ~4 frames
    const fy = 670, fh = 80;
    ctx.fillStyle = C.soft; ctx.fillRect(xNow, fy, X1 - xNow, fh);
    ctx.fillStyle = C.line; ctx.fillRect(X0, fy + fh, xNow - X0, 2);
    ctx.fillStyle = C.ink; ctx.fillRect(Math.max(X0, xNow - Math.max(3, (D.full_precision_frames / N) * LW)), fy, Math.max(3, (D.full_precision_frames / N) * LW), fh);
    V.text("the newest 3 frames", xNow > X0 + 300 ? xNow - 14 : xNow + 14, fy + 50, { font: V.sans(24, 500), color: C.ink2, align: xNow > X0 + 300 ? "right" : "left" });
    V.text("Full precision", 120, fy + 34, { font: V.sans(30, 600) });
    V.text("16-bit tokens", 120, fy + 70, { font: V.sans(24), color: C.ink3 });
    // now line
    ctx.fillStyle = C.ink; ctx.fillRect(xNow - 1, 262, 2, fy + fh - 262 + 6);
    // film names under the axis
    FILMS.forEach(([name, s0, s1], i) => {
      const xa = X0 + (s0 / N) * LW, xb = X0 + (s1 / N) * LW;
      if (i) { ctx.fillStyle = C.line; ctx.fillRect(xa, 262, 1, fy + fh - 262); }
      V.text(name, (xa + xb) / 2, fy + fh + 40, { font: V.sans(24, 500), color: s0 <= seen ? C.ink2 : C.ink3, align: "center" });
    });
  };

  // ---------------------------------------------------------------- 7. the numbers
  S.numbers = function (lt, d) {
    const cols = [
      { at: 0.3, big: "≈1,000×", line: "less storage on", line2: "hour-long videos",
        notes: ["codes: 57,344 → ~580 bits per token", "tokens: 252 → ~48 per frame", "frames: 58% kept"], color: C.ink },
      { at: d * 0.36, big: "Same accuracy", line: "as a memory that keeps", line2: "every token",
        notes: ["average over 6 benchmarks,", "within 1 point"], color: C.ours },
      { at: d * 0.66, big: "+6 to 8", line: "points over existing", line2: "memory methods",
        notes: ["same memory size,", "6 benchmarks"], color: C.ink }
    ];
    cols.forEach((c, i) => {
      const a = V.eout(V.seg(lt, c.at, c.at + 0.6)), x = 330 + i * 630, y = 330 + (1 - a) * 30;
      if (a <= 0) return;
      V.text(c.big, x, y, { font: V.sans(i === 1 ? 88 : 110, 700), color: c.color, align: "center", alpha: a });
      V.text(c.line, x, y + 70, { font: V.sans(34, 500), color: C.ink2, align: "center", alpha: a });
      V.text(c.line2, x, y + 114, { font: V.sans(34, 500), color: C.ink2, align: "center", alpha: a });
      c.notes.forEach((n, j) => {
        const na = a * V.seg(lt, c.at + 0.5 + j * 0.35, c.at + 0.9 + j * 0.35);
        if (i === 0) {
          if (j === 0) V.text("in the 48-minute demo:", x, y + 146, { font: V.sans(22), color: C.ink3, align: "center", alpha: na });
          ctx.save(); ctx.font = V.sans(26, 500); const tw = ctx.measureText(n).width + 36; ctx.restore();
          V.fillRR(x - tw / 2, y + 166 + j * 62, tw, 46, 23, C.soft, na);
          V.text(n, x, y + 198 + j * 62, { font: V.sans(26, 500), color: C.ink2, align: "center", alpha: na });
        } else V.text(n, x, y + 190 + j * 40, { font: V.sans(26), color: C.ink3, align: "center", alpha: na });
      });
    });
  };

  // ---------------------------------------------------------------- 8. robots, audio and video
  function robotArm(x, y, sc, t) {
    // a two-link arm holding a small cube; it sways slowly so the scene is not static
    ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc); ctx.lineCap = "round"; ctx.lineJoin = "round";
    V.fillRR(-90, 150, 180, 22, 8, C.ink2);
    V.fillRR(-34, 118, 68, 40, 10, C.ink);
    const a1 = -2.05 + 0.12 * Math.sin(t * 1.3), a2 = 1.25 + 0.18 * Math.sin(t * 1.3 + 0.8);
    const j1 = [0, 118], j2 = [j1[0] + 150 * Math.cos(a1), j1[1] + 150 * Math.sin(a1)], j3 = [j2[0] + 125 * Math.cos(a1 + a2), j2[1] + 125 * Math.sin(a1 + a2)];
    ctx.strokeStyle = C.ink; ctx.lineWidth = 26;
    ctx.beginPath(); ctx.moveTo(...j1); ctx.lineTo(...j2); ctx.stroke();
    ctx.lineWidth = 20; ctx.beginPath(); ctx.moveTo(...j2); ctx.lineTo(...j3); ctx.stroke();
    ctx.fillStyle = C.ours; [j1, j2].forEach((q) => { ctx.beginPath(); ctx.arc(q[0], q[1], 13, 0, 7); ctx.fill(); });
    const ang = a1 + a2;
    ctx.save(); ctx.translate(...j3); ctx.rotate(ang);
    ctx.strokeStyle = C.ink; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(30, -22); ctx.moveTo(0, 22); ctx.lineTo(30, 22); ctx.moveTo(0, -24); ctx.lineTo(0, 24); ctx.stroke();
    V.fillRR(10, -15, 30, 30, 5, C.ours4);
    ctx.restore(); ctx.restore();
  }
  S.beyond = function (lt, d) {
    const cards = [{ x: 120, title: "Robot policy memory" }, { x: 990, title: "Audio and video, one budget" }];
    cards.forEach((c, i) => {
      const a = V.eout(V.seg(lt, 0.15 + i * 0.5, 0.7 + i * 0.5));
      if (a <= 0) return;
      ctx.save(); ctx.globalAlpha *= a;
      V.fillRR(c.x, 150, 810, 640, 28, C.soft);
      V.kicker(c.title, c.x + 50, 215);
      if (i === 0) {
        robotArm(c.x + 600, 345, 0.85, lt);
        V.text("95% success", c.x + 50, 600, { font: V.sans(64, 700) });
        V.text("with 256 KiB of memory", c.x + 50, 648, { font: V.sans(30, 500), color: C.ink2 });
        V.text("the policy's own 14 MB history: 94%", c.x + 50, 700, { font: V.sans(26), color: C.ink3 });
        V.text("RMBench, 10 tasks", c.x + 50, 745, { font: V.sans(22), color: C.ink3 });
      } else {
        for (let j = 0; j < 4; j++) V.image(strip(j * 6 + 1), c.x + 50 + j * 182, 250, 172, 97, 8);
        const wv = window.WAVE || [], wx = c.x + 50, ww = 710, wy = 430, step = ww / wv.length;
        ctx.fillStyle = C.ours;
        wv.forEach((v, k) => { const hh = Math.max(2, Math.sqrt(v) * 80); ctx.fillRect(wx + k * step, wy - hh / 2, Math.max(1, step - 0.6), hh); });
        V.text("frames and sound share one 7.2 MB memory", wx, 500, { font: V.sans(24), color: C.ink3 });
        V.text("33.7% accuracy", c.x + 50, 600, { font: V.sans(64, 700) });
        V.text("with 7.2 MB of memory", c.x + 50, 648, { font: V.sans(30, 500), color: C.ink2 });
        V.text("the model reading its full input (1.1 GB): 32.0%", c.x + 50, 700, { font: V.sans(26), color: C.ink3 });
        V.text("LVOmniBench, Qwen2.5-Omni-7B", c.x + 50, 745, { font: V.sans(22), color: C.ink3 });
      }
      ctx.restore();
    });
  };

  // ---------------------------------------------------------------- 9. end card
  S.end = function (lt, d) {
    const a = V.eout(V.seg(lt, 0.1, 0.8)), logo = V.img.logo;
    ctx.save(); ctx.globalAlpha *= a;
    if (logo) { const h = 210, w = h * logo.width / logo.height; ctx.drawImage(logo, W / 2 - w / 2, 150, w, h); }
    V.text("Memryoshka", W / 2, 500, { font: V.serif(112, 500), align: "center" });
    V.text("Adaptive-Fidelity Video Memory for Streaming VLMs", W / 2, 570, { font: V.serif(42, 400, true), color: C.ink2, align: "center" });
    V.text("Visit https://armenjeddi.github.io/memryoshka", W / 2, 680, { font: V.sans(36, 600), color: C.ours, align: "center" });
    V.text("Narration: the author’s voice, generated from a recording of it with Chatterbox (open source). Films © Blender Foundation, CC BY.",
      W / 2, 60, { font: V.sans(20), color: C.ink3, align: "center" });
    ctx.restore();
  };
})();
