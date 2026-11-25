"""Render the page in headless Chromium: console errors, horizontal overflow, and screenshots (light, dark, phone).
usage: python tools/check_page.py <url> <out dir>"""
import asyncio, sys
from playwright.async_api import async_playwright

URL, OUT = sys.argv[1], sys.argv[2]


async def shoot(p, name, width, height, scheme, sections):
    b = await p.chromium.launch()
    pg = await b.new_page(viewport={"width": width, "height": height}, device_scale_factor=1, color_scheme=scheme,
                          reduced_motion="reduce")
    errors = []
    pg.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type in ("error", "warning") else None)
    pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    await pg.goto(URL, wait_until="networkidle", timeout=60000)
    await pg.wait_for_timeout(800)
    overflow = await pg.evaluate("document.scrollingElement.scrollWidth - window.innerWidth")
    for sel in sections:
        el = await pg.query_selector(sel)
        if el is None:
            errors.append(f"missing {sel}")
            continue
        await el.scroll_into_view_if_needed()
        await pg.wait_for_timeout(400)
        await el.screenshot(path=f"{OUT}/{name}_{sel.strip('#').replace(' ', '_')}.png")
    await pg.screenshot(path=f"{OUT}/{name}_viewport_top.png")
    print(name, "horizontal overflow px:", overflow)
    for e in errors:
        print("  ", e)
    await b.close()


async def main():
    async with async_playwright() as p:
        secs = ["#top", "#video", ".summary", "#fig-stream", "#problem", "#fig-savings", "#fig-code", "#fig-price", "#video-how", "#fig-main", "#fig-higher", "#fig-kv", "#fig-tradeoff",
                "#fig-beyond", "#limits", "#citation"]
        await shoot(p, "desk", 1400, 900, "light", secs)
        await shoot(p, "dark", 1400, 900, "dark", ["#top", "#video", "#video-how", "#fig-stream", "#fig-code", "#fig-price", "#fig-main", "#fig-tradeoff"])
        await shoot(p, "phone", 390, 844, "light", ["#top", "#video", ".summary", "#fig-stream", "#fig-savings", "#fig-price", "#fig-higher", "#fig-beyond"])

asyncio.run(main())
