// Videos: a play button over the poster, and only one video plays at a time.
// Without JavaScript the videos keep the browser's own controls.
(function () {
  const cards = Array.from(document.querySelectorAll(".video-card"));
  const videos = cards.map((c) => c.querySelector("video")).filter(Boolean);

  cards.forEach((card) => {
    const v = card.querySelector("video");
    if (!v) return;
    const label = card.dataset.label || "", dur = card.dataset.duration || "";
    v.removeAttribute("controls");

    const b = document.createElement("button");
    b.type = "button";
    b.className = "play";
    b.setAttribute("aria-label", "Play " + (label || v.getAttribute("aria-label") || "the video") + (dur ? " (" + dur + ")" : ""));
    b.innerHTML = '<span class="disc"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg></span>';
    if (label || dur) {
      const l = document.createElement("span");
      l.className = "label";
      if (label) l.appendChild(document.createTextNode(label));
      if (dur) { const d = document.createElement("span"); d.className = "dur"; d.textContent = dur; l.appendChild(d); }
      b.appendChild(l);
    }
    card.appendChild(b);

    function start() {
      card.classList.add("playing");
      v.controls = true;
    }
    b.addEventListener("click", () => {
      start();
      const p = v.play();
      if (p && p.catch) p.catch(() => { /* the controls stay, so the viewer can press play */ });
      v.focus({ preventScroll: true });
    });
    v.addEventListener("play", () => {
      start();
      videos.forEach((o) => { if (o !== v && !o.paused) o.pause(); });
    });
  });
})();
