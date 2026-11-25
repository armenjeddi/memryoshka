"""Render tools/og.html to assets/img/og.png (1200 x 630), the image shown in link previews.
usage: python tools/make_og.py   (needs Playwright with Chromium)"""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parent.parent

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1200, "height": 630})
        await pg.goto((ROOT / "tools/og.html").as_uri(), wait_until="networkidle")
        await pg.wait_for_timeout(500)
        await pg.screenshot(path=str(ROOT / "assets/img/og.png"))
        await b.close()

asyncio.run(main())
