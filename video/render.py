"""Render a video from stage.html, frame by frame, and mux the narration.
usage: python video/render.py <intro|arch> [fps=30] [--tag _60s] [--preview t1,t2,... [--no-captions]]
  needs build/<name>_timing.json and build/<name>_narration.wav (from voice.py, or your own recording + timing)
  writes build/memryoshka_<name>.mp4; with --preview, only PNG stills of the given times (build/preview_<name>_<t>.png)
Run with the Playwright environment: PLAYWRIGHT_BROWSERS_PATH=~/scratch/claude_tools/pw_browsers ~/scratch/claude_tools/pw_env/bin/python"""
import asyncio, json, shutil, subprocess, sys, tempfile, time
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent
name = sys.argv[1]
rest, preview = sys.argv[2:], None
tag = ""
if "--tag" in rest:  # render the version made by voice.py --tag <tag>
    i = rest.index("--tag"); tag = rest[i + 1]; rest = rest[:i] + rest[i + 2:]
if "--preview" in rest:
    i = rest.index("--preview")
    preview = [float(x) for x in rest[i + 1].split(",")]
    rest = rest[:i] + rest[i + 2:]
no_captions = "--no-captions" in rest  # for poster stills
rest = [r for r in rest if r != "--no-captions"]
fps = int(rest[0]) if rest else 30
timing = json.load(open(ROOT / "build" / f"{name}{tag}_timing.json"))
if no_captions:
    for s in timing["scenes"]:
        s["voice_start"] = 1e9  # captions show only after a line's voice starts


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1920, "height": 1080}, device_scale_factor=1)
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        await pg.goto((ROOT / "stage.html").as_uri(), wait_until="networkidle")
        await pg.evaluate("([n, t]) => V.setup(n, t)", [name, timing])
        if errors:
            print("page errors:", errors[:5])
        if preview:
            for t in preview:
                await pg.evaluate(f"renderAt({t})")
                await pg.screenshot(path=str(ROOT / "build" / f"preview_{name}_{t:05.1f}.png"))
            print("previews written:", len(preview), "errors:", errors[:5])
            await b.close()
            return
        frames = Path(tempfile.mkdtemp(prefix=f"frames_{name}_", dir=str(ROOT / "build")))
        n = int(round(timing["duration"] * fps))
        t0 = time.time()
        for k in range(n):
            await pg.evaluate(f"renderAt({k / fps:.5f})")
            await pg.screenshot(path=str(frames / f"f_{k:05d}.jpg"), type="jpeg", quality=93)
            if k % 300 == 0:
                print(f"frame {k}/{n} ({time.time() - t0:.0f} s)", flush=True)
        await b.close()
    out = ROOT / "build" / f"memryoshka_{name}{tag}.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", str(fps), "-i", str(frames / "f_%05d.jpg"),
                    "-i", str(ROOT / "build" / f"{name}{tag}_narration.wav"),
                    "-c:v", "libx264", "-crf", "19", "-preset", "slow", "-pix_fmt", "yuv420p",
                    "-af", "highpass=f=70,loudnorm=I=-16:TP=-1.5:LRA=11", "-c:a", "aac", "-b:a", "160k", "-ar", "48000",
                    "-movflags", "+faststart", "-shortest", str(out)], check=True)
    shutil.rmtree(frames)
    print(out, round(out.stat().st_size / 1e6, 1), "MB;", "errors:", errors[:5])

asyncio.run(main())
