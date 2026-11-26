# Drive the playable build headlessly through the ?test hook (window.__bt).
#   .venv/bin/python play.py script.json [w] [h] [query]
# query defaults to "test"; e.g. "test&skip=attract&seed=7".
# script steps:
#   {"do":"advance","sec":10}                 step the sim 10 s on the fixed 1/60 s clock (print state)
#   {"do":"until","js":"...","max":120}       advance in 0.5 s steps until the JS expression is truthy
#   {"do":"shot","out":"shots/a.png"}         render once and screenshot (relative paths land in this folder)
#   {"do":"eval","js":"..."}                  evaluate JS, print the JSON result
#   {"do":"expect","js":"...","msg":"..."}    evaluate JS; a falsy result fails the run (exit 1)
#   {"do":"expect","js":"...","equals":[]}     ...or fail unless the JSON result equals "equals"
#   {"do":"key","key":"d","down":true}        press, or hold/release with down/up
#   {"do":"click","x":..,"y":..}              mouse click
#   {"do":"wait","ms":500}                    wall-clock wait (avoid: it is not on the sim clock)
#   {"do":"reload"}                           reload the page (localStorage survives, as in a real browser)
#   {"do":"download","click":"css","out":"p"} click an element and save the file it downloads
#   {"do":"upload","input":"css","file":"p"}  give a file to an <input type=file>
# Exit code: 1 on page errors, a missing __bt, or a failed expect.
import asyncio, sys, json, time
from playwright.async_api import async_playwright
from harness import launch, page_url, out_path


async def main():
    steps = json.loads(open(sys.argv[1]).read())
    w = int(sys.argv[2]) if len(sys.argv) > 2 else 1600
    h = int(sys.argv[3]) if len(sys.argv) > 3 else 900
    q = sys.argv[4] if len(sys.argv) > 4 else 'test'
    failed = []
    async with async_playwright() as p:
        b = await launch(p)
        pg = await b.new_page(viewport={'width': w, 'height': h})
        msgs = []
        pg.on('console', lambda m: msgs.append(m.type + ': ' + m.text[:400]) if m.type in ('error', 'warning') and 'GPU stall' not in m.text else None)
        pg.on('pageerror', lambda e: (msgs.append('pageerror: ' + str(e)[:1200]), failed.append('pageerror')))
        t0 = time.time()
        await pg.goto(page_url(q), timeout=180000)
        try:
            await pg.wait_for_function('window.__bt', timeout=60000)
        except Exception as e:
            print('no __bt', e); print('\n'.join(msgs[:40])); await b.close(); sys.exit(1)
        print('loaded', round(time.time() - t0, 1), 's')
        async def js(expr, arg=None):
            # a script expression that throws fails the run with its message instead of crashing the harness
            try: return (await pg.evaluate(expr, arg)) if arg is not None else (await pg.evaluate(expr)), None
            except Exception as e: return None, str(e).split('\n')[0][:300]
        for s in steps:
            d = s['do']
            if d == 'advance':
                st, err = await js('s => window.__bt.advance(s)', s['sec'])
                if err: print('advance ERROR:', err); failed.append('the game threw during advance'); break
                if s.get('print', True): print('t=', st['t'], st['mode'], 'auto' if st['auto'] else 'manual', '|', st['ai'], '| p', st['p'], '| gold', st['gold'], 'rank', st['rank'], 'docked', st['docked'])
                if s.get('ships'): print('   ', st['ships'])
                if s.get('log'): print('    log:', st['log'][:5])
            elif d == 'shot':
                await pg.evaluate('() => window.__bt.render()')
                out = out_path(s['out'])
                await pg.screenshot(path=out); print('shot', out)
            elif d == 'eval':
                r, err = await js(s['js'])
                if err: print('eval ERROR:', err); failed.append('eval threw: ' + s['js'][:80]); continue
                if r is not None: print('eval:', json.dumps(r)[:1500])
            elif d == 'expect':
                r, err = await js(s['js'])
                ok = not err and (r == s['equals'] if 'equals' in s else bool(r))
                if err: r = 'ERROR ' + err
                print('expect', 'PASS' if ok else 'FAIL', s.get('msg', s['js']), '' if ok else f'(got {json.dumps(r)[:200]})')
                if not ok: failed.append(s.get('msg', s['js']))
            elif d == 'key':
                if s.get('down', True) and s.get('up', True): await pg.keyboard.press(s['key'])
                elif s.get('down'): await pg.keyboard.down(s['key'])
                else: await pg.keyboard.up(s['key'])
            elif d == 'click':
                await pg.mouse.click(s['x'], s['y'], button=s.get('button', 'left'))
            elif d == 'until':
                ok = False
                for i in range(int(s.get('max', 120) / s.get('step', 0.5))):
                    _, err = await js('s => window.__bt.advance(s)', s.get('step', 0.5))
                    if err: print('advance ERROR:', err); failed.append('the game threw during until'); break
                    r, err = await js(s['js'])
                    if err: print('until ERROR:', err); break
                    if r: ok = True; break
                st = await pg.evaluate('() => window.__bt.state()')
                print('until', 'ok' if ok else 'TIMEOUT', 't=', st['t'], st['mode'], st['ai'])
                if not ok and s.get('required', True): failed.append('until ' + s['js'])
            elif d == 'wait':
                await pg.wait_for_timeout(s['ms'])
            elif d == 'reload':
                await pg.reload(); await pg.wait_for_function('window.__bt', timeout=60000); print('reloaded')
            elif d == 'download':
                async with pg.expect_download() as dl:
                    await pg.click(s['click'])
                f = await dl.value; out = out_path(s['out']); await f.save_as(out); print('downloaded', f.suggested_filename, '->', out)
            elif d == 'upload':
                await pg.set_input_files(s['input'], out_path(s['file'])); print('uploaded', s['file'])
        print('\n'.join(msgs[:40]))
        await b.close()
    if failed:
        print('FAILED:', '; '.join(failed)); sys.exit(1)
    print('OK')

asyncio.run(main())
