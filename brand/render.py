import asyncio, sys
from playwright.async_api import async_playwright
# render.py file.svg out.png size
JOBS = [a.split(":") for a in sys.argv[1:]]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page()
        for src, out, size in JOBS:
            s = int(size)
            svg = open(src).read().replace("<svg ", f'<svg width="{s}" height="{s}" ', 1)
            await pg.set_viewport_size({"width": s, "height": s})
            await pg.set_content(f'<html><body style="margin:0;background:transparent">{svg}</body></html>')
            await pg.locator("svg").screenshot(path=out, omit_background=True)
        await b.close()
asyncio.run(main())
