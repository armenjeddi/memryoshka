// Page chrome: hero (from site.config.js), navigation, theme button, BibTeX, analytics.
(function () {
  const M = window.MEM, S = window.SITE || {};
  const { $, el } = M;

  const ICONS = {
    paper: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>',
    code: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.48 2 2 6.58 2 12.23c0 4.52 2.87 8.35 6.84 9.7.5.1.68-.22.68-.49 0-.24-.01-.87-.01-1.71-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.89 1.57 2.34 1.12 2.91.85.09-.66.35-1.12.63-1.37-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.04 1.03-2.76-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05a9.3 9.3 0 0 1 5 0c1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.64 1.03 2.76 0 3.94-2.34 4.81-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.6.69.49A10.1 10.1 0 0 0 22 12.23C22 6.58 17.52 2 12 2z"/></svg>',
    data: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.66 3.13 3 7 3s7-1.34 7-3V6M5 12v6c0 1.66 3.13 3 7 3s7-1.34 7-3v-6"/></svg>',
    video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M10 9.2v5.6l4.8-2.8z" fill="currentColor"/></svg>',
    bib: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 8h10M7 12h10M7 16h6"/><rect x="3" y="4" width="18" height="16" rx="2"/></svg>'
  };

  function button(kind, label, url, primary) {
    const a = el(url ? "a" : "span", { class: "btn" + (primary ? " primary" : "") + (url ? "" : " soon"), href: url || null });
    a.innerHTML = ICONS[kind]; // static icon markup only
    a.appendChild(document.createTextNode(label));
    if (!url) { a.appendChild(el("span", { class: "tag", text: "Soon" })); a.setAttribute("aria-disabled", "true"); }
    if (url && /^https?:/.test(url)) { a.target = "_blank"; a.rel = "noopener"; }
    return a;
  }

  // ---- hero
  const links = S.links || {};
  const btns = $("#buttons");
  const hasVideo = !!document.getElementById("video");
  if (links.paper || !hasVideo) {
    btns.appendChild(button("paper", "Paper", links.paper, true));
    btns.appendChild(button("code", "Code", links.code));
    if (hasVideo) btns.appendChild(button("video", "Video", "#video"));
  } else {
    // until the paper is out, the intro video is the main link
    btns.appendChild(button("video", "Video", "#video", true));
    btns.appendChild(button("paper", "Paper", links.paper));
    btns.appendChild(button("code", "Code", links.code));
  }
  if (links.data) btns.appendChild(button("data", "Data", links.data));
  btns.appendChild(button("bib", "BibTeX", "#citation"));
  if (S.subtitle) $("#subtitle").textContent = S.subtitle;
  const authors = $("#authors");
  (S.authors || []).forEach((a) => {
    const name = a.url ? el("a", { href: a.url, text: a.name }) : document.createTextNode(a.name);
    authors.appendChild(el("span", { class: "a" }, [name, el("sup", { text: (a.affiliations || []).join(",") + (a.equal ? "*" : "") + (a.corresponding ? "\u2020" : "") })]));
  });
  (S.affiliations || []).forEach((f, i) => $("#affils").appendChild(el("span", {}, [el("sup", { text: String(i + 1) }), " " + f])));
  if (S.authorNote) $("#author-note").textContent = S.authorNote;
  if (S.correspondingEmail) {
    const note = $("#author-note");
    if (note.textContent) note.appendChild(document.createTextNode("\u2003"));
    note.append("\u2020 Corresponding author: ", el("a", { href: "mailto:" + S.correspondingEmail, text: S.correspondingEmail }));
  }
  const logoBox = $("#logos");
  if (logoBox) {
    (S.logos || []).forEach((l) => logoBox.appendChild(el("img", { src: l.src, alt: l.name, title: l.name, height: String(l.height), style: "height:" + l.height + "px", decoding: "async" })));
    if (!logoBox.children.length) logoBox.remove();
  }
  if (S.venue) $("#subtitle").after(el("p", { class: "muted", style: "margin:8px 0 0", text: S.venue }));
  if (S.draftNote) $("#draft-note").appendChild(el("div", { class: "draft-note", text: S.draftNote }));

  // nav buttons
  const nav = $("#nav-actions"), theme = $("#theme-btn");
  [["paper", "Paper", links.paper], ["code", "Code", links.code]].forEach(([k, label, url]) => {
    const a = el("a", { href: url || null, class: url ? null : "soon", title: url ? null : "Coming soon" });
    a.innerHTML = ICONS[k];
    a.firstChild.setAttribute("width", "16"); a.firstChild.setAttribute("height", "16");
    a.appendChild(el("span", { class: "label", text: label }));
    nav.insertBefore(a, theme);
  });

  // ---- theme button (stored per viewer; the page works without storage)
  function currentTheme() {
    const t = document.documentElement.getAttribute("data-theme");
    if (t) return t;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  try { const saved = localStorage.getItem("memryoshka-theme"); if (saved) document.documentElement.setAttribute("data-theme", saved); } catch (e) { /* no storage */ }
  theme.addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("memryoshka-theme", next); } catch (e) { /* no storage */ }
    M.themeChanged();
  });

  // ---- side navigation (wide screens), built from data-toc (sections) and data-toc-sub (figures and steps)
  const toc = $("#toc");
  const tocItems = M.$$("[data-toc], [data-toc-sub]").filter((n) => n.id).map((node) => {
    const sub = node.hasAttribute("data-toc-sub");
    const a = el("a", { href: "#" + node.id, class: sub ? "sub" : "top", text: node.getAttribute(sub ? "data-toc-sub" : "data-toc") });
    // a collapsed section (the ablations) opens when its link is used
    if (node.tagName === "DETAILS") a.addEventListener("click", () => { node.open = true; });
    return { node, a, sub };
  });
  if (toc && tocItems.length) {
    toc.appendChild(el("div", { class: "toc-title", text: "On this page" }));
    toc.appendChild(el("div", { class: "toc-list" }, tocItems.map((it) => it.a)));
  }

  // ---- scroll progress and the active section, in the top bar and the side navigation
  const prog = $("#progress");
  const navWrap = $("#nav-links");
  const navLinks = M.$$(".nav-links a");
  const sections = navLinks.map((a) => document.getElementById(a.getAttribute("href").slice(1)));
  const hero = $("#top");
  let lastTop = -2, ticking = false;
  function update() {
    ticking = false;
    const h = document.documentElement.scrollHeight - window.innerHeight;
    prog.style.width = (h > 0 ? (100 * window.scrollY) / h : 0) + "%";
    const line = Math.min(160, window.innerHeight * 0.3);
    let active = -1;
    sections.forEach((s, i) => { if (s && s.getBoundingClientRect().top < line) active = i; });
    navLinks.forEach((a, i) => a.classList.toggle("active", i === active));
    if (active !== lastTop) {
      lastTop = active;
      // on narrow screens the links scroll sideways: keep the active one in view
      if (active >= 0 && navWrap && navWrap.scrollWidth > navWrap.clientWidth + 2) {
        const a = navLinks[active];
        navWrap.scrollTo({ left: Math.max(0, a.offsetLeft - (navWrap.clientWidth - a.offsetWidth) / 2), behavior: "smooth" });
      }
    }
    if (toc && tocItems.length) {
      let cur = -1;
      tocItems.forEach((it, i) => { if (it.node.getBoundingClientRect().top < line) cur = i; });
      let parent = cur;
      while (parent > 0 && tocItems[parent].sub) parent--;
      tocItems.forEach((it, i) => {
        it.a.classList.toggle("active", i === cur);
        it.a.classList.toggle("in", i === parent && i !== cur);
        if (i === cur) it.a.setAttribute("aria-current", "true"); else it.a.removeAttribute("aria-current");
      });
      toc.classList.toggle("shown", hero ? hero.getBoundingClientRect().bottom < window.innerHeight * 0.35 : true);
    }
  }
  function onScroll() { if (!ticking) { ticking = true; window.requestAnimationFrame(update); } }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  update();

  // ---- BibTeX
  $("#bibtex").textContent = S.bibtex || "";
  $("#copy-bib").addEventListener("click", async (ev) => {
    try { await navigator.clipboard.writeText(S.bibtex || ""); ev.target.textContent = "Copied"; }
    catch (e) { ev.target.textContent = "Select and copy"; }
    setTimeout(() => (ev.target.textContent = "Copy"), 1600);
  });
  const foot = $("#footer-links");
  const footLinks = [["Paper", links.paper], ["Code", links.code]].filter(([, u]) => u);
  footLinks.forEach(([t, u], i) => {
    if (i) foot.appendChild(document.createTextNode("  ·  "));
    foot.appendChild(el("a", { href: u, text: t }));
  });

  M.fillRampCells($("#ramp-cells"));
  M.fillRampCells($("#ramp-cells-2"));

  // ---- analytics, only when an ID is configured
  if (S.analytics && /^G-[A-Z0-9]+$/.test(S.analytics)) {
    const s = document.createElement("script");
    s.async = true; s.src = "https://www.googletagmanager.com/gtag/js?id=" + S.analytics;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date()); window.gtag("config", S.analytics);
  }
})();
