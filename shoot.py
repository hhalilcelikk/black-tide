# Render look-development stills through the ?capture hook (window.__ld.shot).
#   .venv/bin/python shoot.py shots.json [w] [h]
# shots.json is a list of window.__ld.shot() options, each with an "out" path
# (relative paths land in this folder), e.g.
#   [{"out":"shots/dusk.png","t":12,"look":"dusk","iso":{"target":[0,0,0],"az":40,"el":30,"vh":120},
#     "fleet":[{"id":"a","type":"sloop","livery":"pirate","x":0,"z":0,"psi":0.4}]}]
import asyncio, sys, json, time
from playwright.async_api import async_playwright
from harness import launch, page_url, out_path


async def main():
    shots = json.loads(open(sys.argv[1]).read())
    w = int(sys.argv[2]) if len(sys.argv) > 2 else 1280
    h = int(sys.argv[3]) if len(sys.argv) > 3 else 720
    errors = []
    async with async_playwright() as p:
        b = await launch(p)
        pg = await b.new_page(viewport={'width': w, 'height': h})
        msgs = []
        pg.on('console', lambda m: msgs.append(m.type + ': ' + m.text[:600]))
        pg.on('pageerror', lambda e: (msgs.append('pageerror: ' + str(e)[:800]), errors.append(e)))
        t0 = time.time()
        await pg.goto(page_url('capture'), timeout=180000)
        try:
            await pg.wait_for_function('window.__ld', timeout=180000)
        except Exception as e:
            print('no __ld', e)
            print('\n'.join(msgs[:60]))
            await b.close(); sys.exit(1)
        print('loaded in', round(time.time() - t0, 1), 's')
        for s in shots:
            t1 = time.time()
            await pg.evaluate('o => window.__ld.shot(o)', s)
            out = out_path(s['out'])
            await pg.screenshot(path=out)
            print('shot', out, round(time.time() - t1, 1), 's')
        print('\n'.join(msgs[:60]))
        await b.close()
    if errors: sys.exit(1)

asyncio.run(main())
