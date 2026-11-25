"""Export Figure 01 (the memory over the 48-minute open-film stream) as an MP4 and a GIF for posts and the README.
usage: python tools/export_stream_clip.py   -> assets/media/stream.mp4, assets/media/stream.gif"""
import asyncio, shutil, subprocess, tempfile
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent.parent
CSS = """
  .nav, .hero, .section, footer, .fig:not(#fig-stream), .stream-intro, .stream-foot,
  #fig-stream figcaption, #fig-stream .fig-head { display: none !important; }
  body { background: #ffffff; }
  #fig-stream { margin: 0 !important; padding: 0 !important; max-width: 1100px; }
  #fig-stream .card { box-shadow: none; border: 0; border-radius: 0; padding: 30px 34px 26px; }
  .clip-title { font: 500 30px/1.2 var(--serif); color: var(--ink); margin: 0 0 4px; }
  .clip-sub { font: 400 15.5px/1.4 var(--sans); color: var(--ink-2); margin: 0 0 6px; }
  .clip-foot { display: flex; justify-content: space-between; font: 500 13px var(--sans); color: var(--ink-3); margin-top: 18px; }
  .clip-foot b { color: var(--ink); font-weight: 600; }
"""
JS = """() => {
  const card = document.querySelector('#fig-stream .card');
  const top = card.querySelector('.stream-top');
  const t = document.createElement('div');
  t.innerHTML = '<p class="clip-title">48 minutes of film streaming into a fixed 7.2 MB memory</p>' +
                '<p class="clip-sub">Each column is one moment of the video. Height: visual tokens kept. Color: bits per token.</p>';
  top.prepend(t);
  const f = document.createElement('div');
  f.className = 'clip-foot';
  f.innerHTML = '<span><b>Memryoshka</b> \\u00b7 training-free adaptive-fidelity video memory</span><span>Real run of the writer, Qwen2.5-VL-7B tokens \\u00b7 films \\u00a9 Blender Foundation, CC BY</span>';
  card.appendChild(f);
}"""


async def main():
    out = ROOT / "assets/media"
    tmp = Path(tempfile.mkdtemp(prefix="clip_", dir=str(out)))
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1100, "height": 900}, device_scale_factor=2, color_scheme="light",
                              reduced_motion="reduce")
        await pg.goto((ROOT / "index.html").as_uri(), wait_until="networkidle")
        await pg.add_style_tag(content=CSS)
        await pg.evaluate(JS)
        await pg.wait_for_timeout(500)
        card = await pg.query_selector("#fig-stream .card")
        steps = int(await pg.evaluate("document.getElementById('s-range').max"))
        for i in range(steps + 1):
            await pg.evaluate(f"(() => {{ const r = document.getElementById('s-range'); r.value = {i}; r.dispatchEvent(new Event('input')); }})()")
            await pg.wait_for_timeout(40)
            await card.screenshot(path=str(tmp / f"f_{i:04d}.png"))
        await b.close()
    # 10 steps per second, the last state held for 2.5 seconds
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", "10", "-i", str(tmp / "f_%04d.png"),
                    "-vf", "tpad=stop_mode=clone:stop_duration=2.5,scale=1600:-2:flags=lanczos,format=yuv420p",
                    "-c:v", "libx264", "-crf", "18", "-preset", "slow", "-movflags", "+faststart", str(out / "stream.mp4")], check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", "10", "-i", str(tmp / "f_%04d.png"),
                    "-vf", "tpad=stop_mode=clone:stop_duration=2.5,scale=900:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a",
                    str(out / "stream.gif")], check=True)
    shutil.copy(tmp / f"f_{steps:04d}.png", out / "stream_last_frame.png")
    shutil.rmtree(tmp)
    for f in ("stream.mp4", "stream.gif", "stream_last_frame.png"):
        print(f, round((out / f).stat().st_size / 1e6, 2), "MB")

asyncio.run(main())
