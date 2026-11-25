// Figure 04: what the writer keeps of one real frame at a given price per bit.
// The rule is the paper's (and the released writer's):
//   value of a token at prefix length r = importance x novelty x (e(r) - floor) - price x (r + 24)
//   the token takes the best positive option, or is dropped;
//   the frame stays only if its kept tokens' total value is larger than price x 4,152 (its header).
(function () {
  const M = window.MEM, D = window.MEM_FRAMES;
  if (!D) return;
  const { $, el } = M;
  const LEN = D.lengths, EN = D.energies, FLOOR = D.e0, META = D.token_meta_bits, HEADER = D.frame_header_bits;
  const LABELS = { 2550: "Tears of Steel", 2010: "Elephants Dream", 930: "Sintel", 210: "Big Buck Bunny" };
  const ORDER = [2550, 2010, 930, 210]; // a frame with many kept tokens first; the dropped one last
  const frames = ORDER.map((t) => D.frames.find((f) => f.t === t)).filter(Boolean);
  let fi = 0, theta = 0;
  const FADE = { 4096: 0, 2048: 0.04, 1024: 0.08, 512: 0.13, 256: 0.2, 128: 0.28 };
  const VEIL = "rgba(8,10,13,0.78)";

  // slider position 0 -> price 0; 1..1000 -> 1e-8 .. 1e-3 on a log scale
  const posToTheta = (v) => (v <= 0 ? 0 : Math.pow(10, -8 + (5 * v) / 1000));
  const thetaToPos = (t) => (t <= 0 ? 0 : Math.round(((Math.log10(t) + 8) / 5) * 1000));

  function decide(weight, th) {
    let best = 0, gain = 0;
    for (let i = 0; i < LEN.length; i++) {
      const g = weight * (EN[i] - FLOOR) - th * (META + LEN[i]);
      if (g > gain) { best = LEN[i]; gain = g; }
    }
    return [best, gain];
  }

  const img = $("#frame-img"), canvas = $("#frame-canvas"), view = $("#frame-view");
  const tabs = $("#frame-tabs");
  frames.forEach((f, i) => {
    const b = el("button", { type: "button", "aria-pressed": String(i === fi), title: LABELS[f.t] || "",
      onclick: () => { fi = i; selectFrame(); } }, [el("img", { src: f.img, alt: LABELS[f.t] || "frame", loading: "lazy" })]);
    tabs.appendChild(b);
  });

  const range = $("#price-range"), marksBox = $("#price-marks");
  const markBtns = D.marks.map((mk) => {
    const b = el("button", { type: "button", "aria-pressed": "false", text: mk.label, onclick: () => setTheta(mk.theta) });
    marksBox.appendChild(b);
    return b;
  });
  range.addEventListener("input", () => { theta = posToTheta(parseInt(range.value, 10)); draw(); });
  function setTheta(t) { theta = t; range.value = thetaToPos(t); draw(); }

  function selectFrame() {
    M.$$("button", tabs).forEach((b, i) => b.setAttribute("aria-pressed", String(i === fi)));
    img.src = frames[fi].img;
    img.alt = (LABELS[frames[fi].t] || "Frame") + " at " + M.fmtTime(frames[fi].time) + " in the video";
    draw();
  }

  function draw() {
    const f = frames[fi];
    const rows = f.grid[1] / 2, cols = f.grid[2] / 2;
    let kept = 0, surplus = 0, bits = 0;
    const counts = {};
    const choice = f.tokens.map(([pos, alpha]) => {
      const [b, g] = decide(alpha * f.novelty, theta);
      if (b) { kept++; surplus += g; bits += b; counts[b] = (counts[b] || 0) + 1; }
      return [pos, b];
    });
    const headerCost = theta * HEADER;
    const frameKept = kept > 0 && surplus > headerCost;
    // overlay
    const { ctx, w, h } = M.setupCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    const cw = w / cols, ch = h / rows, veil = VEIL;
    choice.forEach(([pos, b]) => {
      const rr = Math.floor(pos / cols), cc = pos % cols;
      const x = cc * cw, y = rr * ch;
      if (!b || !frameKept) { ctx.fillStyle = veil; ctx.fillRect(x, y, cw, ch); return; }
      // fewer bits -> a darker veil over the patch ("fading"), and the border color gives the exact length
      ctx.fillStyle = `rgba(10,12,15,${FADE[b] || 0})`;
      ctx.fillRect(x, y, cw, ch);
      ctx.strokeStyle = M.rampColor(b, 0.95);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 1.25, y + 1.25, cw - 2.5, ch - 2.5);
    });
    view.classList.toggle("dropped", !frameKept);
    $("#frame-gone").textContent = kept === 0
      ? "Frame removed: no token is worth its cost at this price."
      : `Frame removed. After paying for their own bits, its ${kept} best tokens are worth ${(surplus / headerCost).toFixed(2)} times the cost of the frame's 4,152-bit header, which is not enough to keep it.`;
    $("#frame-badge").textContent = `${LABELS[f.t] || "Frame"} · ${M.fmtTime(f.time)} into the video`;
    // price readout
    $("#price-val").textContent = M.fmtSci(theta);
    let note = theta === 0 ? "Before the memory fills, the price is zero and every token keeps its full 4,096-bit code." : "";
    D.marks.forEach((mk, i) => {
      const near = theta > 0 && Math.abs(Math.log10(theta) - Math.log10(mk.theta)) < 0.02;
      markBtns[i].setAttribute("aria-pressed", String(near));
      if (near) note = `The price the stream in Figure 01 had reached ${mk.label.startsWith("end") ? "at the end of the video" : mk.label}.`;
    });
    if (!note) note = "Pick a price the stream reached, or drag.";
    $("#price-note").textContent = note;
    // histogram of chosen lengths
    const hist = $("#price-hist");
    hist.textContent = "";
    const total = f.tokens.length;
    const rowsH = LEN.filter((L) => L >= 128).slice().reverse().map((L) => [M.fmtInt(L) + " bits", frameKept ? counts[L] || 0 : 0, `var(--b${L})`]);
    rowsH.push(["dropped", frameKept ? total - kept : total, "var(--dropped-key)"]);
    rowsH.forEach(([label, n, color]) => {
      hist.appendChild(el("span", { class: "lbl", text: label }));
      hist.appendChild(el("span", {}, [el("span", { class: "bar", style: `display:block;width:${(100 * n) / total}%;background:${color}` })]));
      hist.appendChild(el("span", { class: "cnt", text: String(n) }));
    });
    // the rule, with this frame's numbers
    const box = $("#price-rule");
    box.textContent = "";
    const nov = f.novelty <= 0.0501 ? "at the floor of 0.05: the frame looks like the previous eight" : "above the floor: the frame differs from the previous eight";
    box.appendChild(el("div", {}, [el("b", { text: "This frame's novelty: " }), `${f.novelty.toFixed(2)}, ${nov}.`]));
    box.appendChild(el("div", { style: "margin-top:6px" }, [el("b", { text: "A token's score at r bits: " }),
      "importance × novelty × (share of variance kept at r − 0.5), minus price × (r + 24)."]));
    const kb = frameKept ? (bits + kept * META + HEADER) / 8 / 1000 : 0;
    box.appendChild(el("div", { style: "margin-top:6px" }, [el("b", { text: "Result: " }),
      frameKept ? `${kept} of ${total} tokens kept, ${Math.round(bits / kept)} bits each on average; ${kb.toFixed(1)} KB with header and bookkeeping.`
                : `the whole frame is removed.`]));
  }

  // start at the end-of-stream price, which is checked against the saved end-of-video memory
  img.addEventListener("load", draw);
  selectFrame();
  setTheta(D.marks[D.marks.length - 1].theta);
  M.onResize(draw);
  M.onTheme(draw);
})();
