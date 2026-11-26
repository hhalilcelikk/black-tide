# Render independence: the same 20 minutes of trade run, stepped in 2 s chunks (a frame drawn after each)
# and in one 1200 s call, must end in exactly the same state. Fails (exit 1) if drawing frames changes the game.
import asyncio, sys, json
sys.path.insert(0, '/Users/halilcelik/Desktop/blacktide')
from playwright.async_api import async_playwright
from harness import launch, page_url
async def run(p, chunk):
    b = await launch(p); pg = await b.new_page(viewport={'width': 640, 'height': 360})
    await pg.goto(page_url('test&skip=attract')); await pg.wait_for_function('window.__bt')
    await pg.evaluate("window.__bt.G.handHelm('trade')")
    await pg.evaluate(f"(() => {{ for (let t = 0; t < 1200; t += {chunk}) window.__bt.advance({chunk}); }})()")
    r = await pg.evaluate("JSON.stringify([window.__bt.state(), window.__bt.G.trades])"); await b.close(); return r
async def main():
    async with async_playwright() as p:
        a = await run(p, 2); b = await run(p, 1200)
        print('render independence:', 'OK' if a == b else 'FAILED: drawing frames changed the game'); sys.exit(0 if a == b else 1)
asyncio.run(main())
