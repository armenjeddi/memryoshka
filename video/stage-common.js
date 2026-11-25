// Shared drawing code for the videos. Everything is drawn on one 1920 x 1080 canvas, as a pure function of time,
// so render.py can capture any frame exactly. Scenes register themselves with V.scenes[video][id] = draw(local t, d).
(function () {
  const W = 1920, H = 1080;
  const cv = document.getElementById("stage");
  const ctx = cv.getContext("2d");
  const V = (window.V = { W, H, ctx, scenes: { intro: {}, arch: {} }, img: {}, timing: null, which: null });

  V.C = {
    bg: "#ffffff", soft: "#f5f5f2", soft2: "#ececE7", line: "#e2e2dc", ink: "#14181f", ink2: "#4a505b", ink3: "#7d838d",
    ours: "#2a78d6", ours4: "#eb6834", base: "#9a988f", brand: "#b83228", veil: "rgba(8,10,13,0.78)",
    ramp: [[136, 181, 242], [96, 154, 231], [59, 127, 214], [31, 101, 185], [18, 77, 147], [13, 55, 106]] // 128 .. 4,096 bits
  };

  // ---------- small math
  V.clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  V.lerp = (a, b, t) => a + (b - a) * t;
  V.seg = (t, a, b) => V.clamp((t - a) / (b - a));
  V.ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  V.eout = (t) => 1 - Math.pow(1 - V.clamp(t), 3);
  V.fmtTime = (s) => {
    s = Math.max(0, Math.round(s));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0");
  };
  V.fmtInt = (n) => Math.round(n).toLocaleString("en-US");

  // ---------- text and shapes
  V.sans = (size, weight = 400) => `${weight} ${size}px Inter`;
  V.serif = (size, weight = 500, italic = false) => `${italic ? "italic " : ""}${weight} ${size}px Newsreader`;
  V.text = function (s, x, y, o = {}) {
    ctx.save();
    ctx.globalAlpha *= o.alpha === undefined ? 1 : o.alpha;
    ctx.font = o.font || V.sans(32);
    ctx.fillStyle = o.color || V.C.ink;
    ctx.textAlign = o.align || "left";
    ctx.textBaseline = o.base || "alphabetic";
    ctx.fillText(s, x, y);
    ctx.restore();
  };
  V.wrap = function (s, maxW, font) {
    ctx.save(); ctx.font = font;
    const words = s.split(" "), lines = [];
    let cur = "";
    for (const w of words) {
      const t = cur ? cur + " " + w : w;
      if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
    }
    if (cur) lines.push(cur);
    ctx.restore();
    return lines;
  };
  V.rr = function (x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
  V.fillRR = function (x, y, w, h, r, color, alpha = 1) {
    ctx.save(); ctx.globalAlpha *= alpha; ctx.fillStyle = color; V.rr(x, y, w, h, r); ctx.fill(); ctx.restore();
  };
  V.strokeRR = function (x, y, w, h, r, color, lw = 2, alpha = 1) {
    ctx.save(); ctx.globalAlpha *= alpha; ctx.strokeStyle = color; ctx.lineWidth = lw; V.rr(x, y, w, h, r); ctx.stroke(); ctx.restore();
  };
  V.image = function (img, x, y, w, h, r = 12, alpha = 1) {
    if (!img) return;
    ctx.save(); ctx.globalAlpha *= alpha;
    V.rr(x, y, w, h, r); ctx.clip();
    ctx.drawImage(img, x, y, w, h);
    ctx.restore();
  };
  V.arrow = function (x1, y1, x2, y2, color, lw = 3, alpha = 1, head = 12) {
    ctx.save(); ctx.globalAlpha *= alpha; ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lw; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    const a = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath(); ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - head * Math.cos(a - 0.45), y2 - head * Math.sin(a - 0.45));
    ctx.lineTo(x2 - head * Math.cos(a + 0.45), y2 - head * Math.sin(a + 0.45));
    ctx.closePath(); ctx.fill(); ctx.restore();
  };
  V.ramp = function (bits, alpha = 1) {
    const x = V.clamp(Math.log2(Math.max(bits, 1)) - 7, 0, 5), i = Math.min(Math.floor(x), 4), f = x - i, s = V.C.ramp;
    const c = s[i].map((v, j) => Math.round(v + (s[i + 1][j] - v) * f));
    return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
  };
  V.kicker = function (s, x, y, o = {}) {
    V.text(s.toUpperCase(), x, y, { font: V.sans(o.size || 22, 600), color: o.color || V.C.ours, alpha: o.alpha, align: o.align });
  };

  // ---------- data helpers shared by scenes
  V.stream = window.MEM_STREAM;
  V.frames = window.MEM_FRAMES;
  V.code = window.MEM_CODE;
  V.res = window.MEM_RESULTS;
  V.thumb = function (t, x, y, w, h, r = 8, alpha = 1, filter) {
    const S = V.stream, TH = S.thumbs, im = V.img.sprite;
    if (!im) return;
    const k = Math.min(TH.count - 1, Math.max(0, Math.round(t / TH.every_s)));
    ctx.save(); ctx.globalAlpha *= alpha; if (filter) ctx.filter = filter;
    V.rr(x, y, w, h, r); ctx.clip();
    ctx.drawImage(im, (k % TH.cols) * TH.w, Math.floor(k / TH.cols) * TH.h, TH.w, TH.h, x, y, w, h);
    ctx.restore();
  };
  // the writer's rule for one token: best prefix length (or 0 = drop) and its surplus at price theta
  V.decide = function (weight, theta) {
    const F = V.frames;
    let best = 0, gain = 0;
    for (let i = 0; i < F.lengths.length; i++) {
      const g = weight * (F.energies[i] - F.e0) - theta * (F.token_meta_bits + F.lengths[i]);
      if (g > gain) { best = F.lengths[i]; gain = g; }
    }
    return [best, gain];
  };
  V.frameAt = function (frame, theta) {
    let kept = 0, surplus = 0, bits = 0;
    const choice = frame.tokens.map(([pos, a]) => {
      const [b, g] = V.decide(a * frame.novelty, theta);
      if (b) { kept++; surplus += g; bits += b; }
      return [pos, b];
    });
    const frameKept = kept > 0 && surplus > theta * V.frames.frame_header_bits;
    return { choice, kept: frameKept ? kept : 0, bits: frameKept ? bits : 0, frameKept };
  };
  // draws a frame with its token cells: kept cells framed in the code-length color, dropped cells darkened
  V.tokenFrame = function (frame, theta, x, y, w, h, alpha = 1) {
    const img = V.img["frame_" + frame.t];
    V.image(img, x, y, w, h, 14, alpha);
    const st = V.frameAt(frame, theta);
    const rows = frame.grid[1] / 2, cols = frame.grid[2] / 2, cw = w / cols, ch = h / rows;
    const fade = { 4096: 0, 2048: 0.04, 1024: 0.08, 512: 0.13, 256: 0.2, 128: 0.28 };
    ctx.save(); ctx.globalAlpha *= alpha; V.rr(x, y, w, h, 14); ctx.clip();
    st.choice.forEach(([pos, b]) => {
      const cx = x + (pos % cols) * cw, cy = y + Math.floor(pos / cols) * ch;
      if (!b || !st.frameKept) { ctx.fillStyle = V.C.veil; ctx.fillRect(cx, cy, cw, ch); return; }
      ctx.fillStyle = `rgba(10,12,15,${fade[b] || 0})`; ctx.fillRect(cx, cy, cw, ch);
      ctx.strokeStyle = V.ramp(b, 0.95); ctx.lineWidth = 2; ctx.strokeRect(cx + 1.5, cy + 1.5, cw - 3, ch - 3);
    });
    ctx.restore();
    return st;
  };

  // split narration into caption chunks: sentences, and long sentences at the comma nearest their middle
  V.chunks = function (text) {
    const out = [];
    (text.match(/[^.!?]+[.!?]+/g) || [text]).map((s) => s.trim()).forEach((s) => {
      if (s.length <= 96) { out.push(s); return; }
      const commas = [...s.matchAll(/, /g)].map((m) => m.index);
      if (!commas.length) { out.push(s); return; }
      const mid = commas.reduce((b, i) => (Math.abs(i - s.length / 2) < Math.abs(b - s.length / 2) ? i : b), commas[0]);
      out.push(s.slice(0, mid + 1)); out.push(s.slice(mid + 2));
    });
    return out;
  };
  // A frame whose token cells lose detail as their codes shorten: each cell is drawn from a coarser copy of the image
  // (4,096 bits: sharp ... 128 bits: one colour per cell), then fades to dark when the token is dropped. To make the
  // changes smooth, a cell's level is averaged over the writer's decisions at nearby moments (thetaAt is a function of
  // scene time). The pixels only illustrate code length; the memory stores tokens, not pixels.
  const LEVEL = { 4096: 0, 2048: 0.75, 1024: 1.5, 512: 2.25, 256: 3, 128: 3.75 };  // pyramid level per code length
  const pyr = {};
  function pyramid(key) {
    if (pyr[key]) return pyr[key];
    const img = V.img[key], out = [img];
    for (let L = 1; L <= 5; L++) {
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width / 2 ** L)); c.height = Math.max(1, Math.round(img.height / 2 ** L));
      const g = c.getContext("2d"); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
      g.drawImage(out[L - 1], 0, 0, c.width, c.height);
      out.push(c);
    }
    return (pyr[key] = out);
  }
  V.pixelFrame = function (frame, thetaAt, lt, x, y, w, h, o = {}) {
    const key = "frame_" + frame.t, img = V.img[key];
    if (!img) return null;
    const P = pyramid(key), rows = frame.grid[1] / 2, cols = frame.grid[2] / 2, cw = w / cols, ch = h / rows;
    const K = 9, win = o.window || 0.5;
    const samples = [];
    for (let k = 0; k < K; k++) {
      const th = thetaAt(lt + win * (k / (K - 1) - 0.5));
      const st = V.frameAt(frame, th);
      samples.push(st);
    }
    const now = V.frameAt(frame, thetaAt(lt));
    ctx.save(); V.rr(x, y, w, h, 14); ctx.clip();
    ctx.fillStyle = "#000"; ctx.fillRect(x, y, w, h);
    ctx.imageSmoothingEnabled = false;
    for (let p = 0; p < frame.tokens.length; p++) {
      let lev = 0;
      samples.forEach((st) => { const b = st.frameKept ? st.choice[p][1] : 0; lev += b ? LEVEL[b] : 6; });
      lev /= K;                                   // 0 sharp ... 5 coarsest, 6 gone
      const cx = x + (p % cols) * cw, cy = y + Math.floor(p / cols) * ch;
      const sx = ((p % cols) / cols) * img.width, sy = (Math.floor(p / cols) / rows) * img.height;
      const sw = img.width / cols, sh = img.height / rows;
      const l0 = Math.min(5, Math.floor(lev)), l1 = Math.min(5, l0 + 1), f = Math.min(1, lev - l0);
      const draw = (L, a) => {
        if (a <= 0) return;
        const s = 2 ** L; ctx.globalAlpha = a;
        ctx.drawImage(P[L], sx / s, sy / s, Math.max(1 / s, sw / s), Math.max(1 / s, sh / s), cx, cy, cw + 0.6, ch + 0.6);
      };
      draw(l0, 1);
      if (lev < 5) draw(l1, f);
      ctx.globalAlpha = 1;
      // a slight darkening with lost detail, then the drop
      const dark = lev <= 5 ? 0.05 * lev : 0.25 + 0.55 * (lev - 5);
      ctx.fillStyle = `rgba(8,10,13,${dark})`; ctx.fillRect(cx, cy, cw + 0.6, ch + 0.6);
    }
    ctx.imageSmoothingEnabled = true;
    // faint cell grid
    ctx.strokeStyle = "rgba(255,255,255,0.18)"; ctx.lineWidth = 1;
    for (let c = 1; c < cols; c++) { ctx.beginPath(); ctx.moveTo(x + c * cw, y); ctx.lineTo(x + c * cw, y + h); ctx.stroke(); }
    for (let r = 1; r < rows; r++) { ctx.beginPath(); ctx.moveTo(x, y + r * ch); ctx.lineTo(x + w, y + r * ch); ctx.stroke(); }
    ctx.restore();
    return now;
  };

  // ---------- captions (burned in, two lines at most)
  V.caption = function (s, alpha) {
    if (!s || alpha <= 0) return;
    const font = V.sans(36, 500), lines = V.wrap(s, 1480, font), lh = 50;
    ctx.save(); ctx.font = font;
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 56, h = lines.length * lh + 26;
    const x = (W - w) / 2, y = H - 54 - h;
    V.fillRR(x, y, w, h, 18, "rgba(20,24,31,0.86)", alpha);
    lines.forEach((l, i) => V.text(l, W / 2, y + 47 + i * lh, { font, color: "#ffffff", align: "center", alpha }));
    ctx.restore();
  };

  // ---------- loading and the timeline
  V.load = (key, src) => new Promise((res) => {
    const im = new Image();
    im.onload = () => { V.img[key] = im; res(); };
    im.onerror = () => { console.error("image failed: " + src); res(); };
    im.src = src;
  });
  V.setup = async function (which, timing) {
    V.which = which; V.timing = timing;
    const loads = [V.load("logo", "../assets/img/logo.svg"), V.load("sprite", "../" + V.stream.thumbs.src)];
    for (let i = 0; i < 27; i++) loads.push(V.load("strip" + i, `assets/strip_${String(i).padStart(2, "0")}.jpg`));
    V.frames.frames.forEach((f) => loads.push(V.load("frame_" + f.t, "../" + f.img)));
    // institution logos for the title slide (official files; UofT recoloured from its white header version to navy)
    [["uoft", "uoft_navy.svg"], ["vector", "vector.png"], ["york", "york.jpg"], ["ubc", "ubc.png"], ["stanford", "stanford.png"]]
      .forEach(([k, f]) => loads.push(V.load("logo_" + k, "assets/logos/" + f)));
    await Promise.all(loads);
    await Promise.all(["400 32px Inter", "500 32px Inter", "600 32px Inter", "700 32px Inter",
      "500 32px Newsreader", "600 32px Newsreader", "italic 400 32px Newsreader"].map((f) => document.fonts.load(f)));
    await document.fonts.ready;
    return true;
  };
  const FADE = 0.3;
  window.renderAt = function (t) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = V.C.bg; ctx.fillRect(0, 0, W, H);
    const scenes = V.timing.scenes, draws = V.scenes[V.which];
    scenes.forEach((s, i) => {
      const first = i === 0, last = i === scenes.length - 1;
      const a = Math.min(first ? 1 : V.seg(t, s.start - FADE, s.start + FADE), last ? 1 : 1 - V.seg(t, s.end - FADE, s.end + FADE));
      if (a <= 0 || !draws[s.id]) return;
      ctx.save(); ctx.globalAlpha = a;
      draws[s.id](Math.max(0, t - s.start), s.end - s.start, t);
      ctx.restore();
    });
    // caption of the line being spoken, one sentence (or half of a long sentence) at a time
    scenes.forEach((s) => {
      const a = Math.min(V.seg(t, s.voice_start - 0.15, s.voice_start + 0.1), 1 - V.seg(t, s.end - FADE - 0.1, s.end - FADE + 0.15));
      if (a <= 0) return;
      const chunks = V.chunks(s.text), total = chunks.reduce((n, c) => n + c.length, 0);
      let acc = 0, shown = chunks[chunks.length - 1];
      for (const c of chunks) {
        const tEnd = s.voice_start + (s.voice_end - s.voice_start) * ((acc + c.length) / total);
        if (t < tEnd) { shown = c; break; }
        acc += c.length;
      }
      V.caption(shown, a);
    });
  };
})();
