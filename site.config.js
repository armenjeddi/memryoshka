// Everything a maintainer normally edits lives in this file: authors, links, venue, BibTeX.
// An empty link renders as a greyed-out "Soon" button, so the page can go live before the code or paper is out.

window.SITE = {
  name: "Memryoshka",
  subtitle: "Adaptive-Fidelity Video Memory for Streaming VLMs",

  // Each author: { name, url (homepage, optional), affiliations: [numbers into the list below, starting at 1],
  // equal: true for "*", corresponding: true for "†" }.
  authors: [
    { name: "Ahmadreza Jeddi", url: "https://armenjeddi.github.io/", affiliations: [1, 2, 3], equal: true, corresponding: true },
    { name: "Enming Zhang", url: "https://www.linkedin.com/in/enming-z-326a30356/", affiliations: [1, 2], equal: true },
    { name: "Jasper Gerigk", url: "https://jaspergerigk.com/", affiliations: [1, 2] },
    { name: "Shivam Chandhok", url: "https://scholar.google.com/citations?user=ZER2BeIAAAAJ", affiliations: [2, 4] },
    { name: "Mozhgan Nasr Azadani", url: "https://mozhgan91.github.io/", affiliations: [5, 6] },
    { name: "Hakki Can Karaimer", url: "https://karaimer.github.io/", affiliations: [7] },
    { name: "Yize Liu", url: "https://yzliu84.github.io/", affiliations: [5] },
    { name: "Leonid Sigal", url: "https://www.cs.ubc.ca/~lsigal/", affiliations: [2, 4] },
    { name: "Igor Gilitschenski", url: "https://www.gilitschenski.org/igor/", affiliations: [1, 2] },
    { name: "Konstantinos G. Derpanis", url: "https://csprofkgd.github.io/", affiliations: [1, 2, 8] },
    { name: "Marco Pavone", url: "https://web.stanford.edu/~pavone/", affiliations: [5, 9] },
    { name: "Babak Taati", url: "https://www.cs.toronto.edu/~taati/", affiliations: [1, 2, 3] }
  ],
  // Numbered in order of first appearance in the author list.
  affiliations: [
    "University of Toronto",
    "Vector Institute",
    "University Health Network",
    "University of British Columbia",
    "Stanford University",
    "University of Waterloo",
    "Samsung AI Center Toronto",
    "York University",
    "NVIDIA"
  ],

  // Institution logos under the authors (files in assets/img/logos). Heights in pixels balance their visual weight.
  // The same five logos are on the intro video's title slide.
  logos: [
    { name: "University of Toronto", src: "assets/img/logos/uoft_navy.svg", height: 40 },
    { name: "Vector Institute", src: "assets/img/logos/vector.png", height: 25 },
    { name: "York University", src: "assets/img/logos/york.jpg", height: 21 },
    { name: "University of British Columbia", src: "assets/img/logos/ubc.png", height: 28 },
    { name: "Stanford University", src: "assets/img/logos/stanford.png", height: 22 }
  ],
  authorNote: "* Equal contribution",
  // Shown after the note as "† Corresponding author: <email>" with a mailto link; the author gets the † mark.
  correspondingEmail: "ajeddi@cs.toronto.edu",

  // Shown under the title once the paper is published, e.g. the conference name. Empty = not shown.
  venue: "",

  links: {
    paper: "",               // arXiv abstract page, e.g. "https://arxiv.org/abs/26xx.xxxxx"
    code: "https://github.com/armenjeddi/memryoshka",   // GitHub repository (code on main; this page is on gh-pages)
    data: ""                 // optional: Hugging Face page for the PCA basis or memories
  },

  // Until the paper is on arXiv this cites the project page. Replace it with the arXiv BibTeX once the paper is posted.
  bibtex: `@misc{jeddi2026memryoshka,
  title  = {Memryoshka: Adaptive-Fidelity Video Memory for Streaming {VLMs}},
  author = {Jeddi, Ahmadreza and Zhang, Enming and Gerigk, Jasper and Chandhok, Shivam and
            Nasr Azadani, Mozhgan and Karaimer, Hakki Can and Liu, Yize and Sigal, Leonid and
            Gilitschenski, Igor and Derpanis, Konstantinos G. and Pavone, Marco and Taati, Babak},
  year   = {2026},
  url    = {https://armenjeddi.github.io/memryoshka/}
}`,

  // Traffic is tracked by the Google Tag Manager container GTM-53S8XPG3, whose snippet is in index.html (top of
  // <head>, plus a <noscript> line after <body>). This field is only for a separate GA4 ID (G-...); keep it empty.
  analytics: "",

  // Shown in red under the authors while the page is a draft. Keep it "" on the live page.
  draftNote: ""
};
