# Memryoshka project page

The project page for **Memryoshka: Adaptive-Fidelity Video Memory for Streaming VLMs**, at
https://armenjeddi.github.io/memryoshka/.

It is a static page: plain HTML, CSS and JavaScript, with no build step and no framework. The data behind the figures
are JavaScript files in `assets/data/`, so the page also works when `index.html` is opened straight from disk.

## Preview

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. Opening `index.html` directly in a browser also works; only the web fonts need an
internet connection.

## What to edit

| To change | Edit |
|---|---|
| Authors, affiliations, links (paper, code, data), venue, BibTeX | `site.config.js` |
| Traffic tracking (Google Tag Manager container `GTM-53S8XPG3`) | the snippet at the top of `index.html` |
| Any text on the page | `index.html` |
| Result numbers (copied from the paper's tables; each block names its table) | `assets/data/results.js` |
| Colors, fonts and spacing (light and dark themes) | `assets/css/style.css` |

An empty link in `site.config.js` shows as a greyed-out "Soon" button.

## Files

```
index.html                 the page
site.config.js             authors, links, BibTeX
assets/css/style.css       all styles; colors are tokens on :root, redefined for dark mode
assets/js/common.js        small helpers (tooltip, canvas setup, play/pause controller, color ramp)
assets/js/page.js          header, navigation, theme button, BibTeX
assets/js/video.js         play button over the video posters; one video plays at a time
assets/js/fig-*.js         the interactive figures
assets/data/*.js           data for the figures
assets/img/                logo, paper figures, thumbnails, video posters, link-preview image
assets/media/              Figure 01 as an MP4 and a GIF
video/                     the two videos, their script (SCRIPT.md) and the code that draws and renders them
tools/                     scripts that produced the figure data and that check the page
```

## Where the figures come from

- Figures 01, 02 and 05 come from running Memryoshka's writer on four open films
  played back to back: Big Buck Bunny, Sintel, Elephants Dream and Tears of Steel (Blender Foundation, CC BY), 47 min
  52 s at one frame per second.
- Figure 04 is computed from the paper's PCA basis.
- Figures 06, 07 and 09 and the ablation table copy numbers from the paper's tables; the text quotes numbers stated in the paper.
- Figures 03, 08 and 10 are the paper's own figures.

## Videos

`video/memryoshka_intro.mp4` (63 s) and `video/memryoshka_architecture.mp4` (62 s) are drawn frame by frame by
`video/stage.html`, from the same data as the figures, and rendered by `video/render.py` with captions burned in.
`video/SCRIPT.md` lists the narration of each scene and where each number comes from.

## Credits

Demo films © Blender Foundation, CC BY. The institution logos belong to their institutions.
