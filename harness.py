# Shared launch code for play.py and shoot.py.
# Paths resolve from this folder, so the scripts work from any working directory.
#
# Environment switches:
#   BT_BROWSER=chrome|chromium   which browser (default: installed Google Chrome, else Playwright's Chromium)
#   BT_GL=gpu|swiftshader        WebGL backend (default gpu; swiftshader is slow but matches a GPU-less CI box)
#   BT_HEADED=1                  show the browser window
import os, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DIST = ROOT / 'dist' / 'index.html'
MAC_CHROME = Path('/Applications/Google Chrome.app')


def page_url(query):
    if not DIST.exists():
        sys.exit(f'{DIST} is missing: run `node build.mjs` first')
    return DIST.as_uri() + ('?' + query if query else '')


async def launch(p):
    which = os.environ.get('BT_BROWSER') or ('chrome' if MAC_CHROME.exists() else 'chromium')
    args = ['--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required']
    if os.environ.get('BT_GL', 'gpu') == 'swiftshader':
        args += ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    opts = dict(headless=os.environ.get('BT_HEADED') != '1', args=args)
    if which == 'chrome':
        opts['channel'] = 'chrome'
    try:
        return await p.chromium.launch(**opts)
    except Exception as e:
        if which != 'chrome':
            raise
        print('Google Chrome failed to launch, trying Playwright Chromium:', str(e).splitlines()[0])
        opts.pop('channel')
        return await p.chromium.launch(**opts)


def out_path(path):
    # relative "out" paths in scripts land under this folder; parent dirs are created
    q = Path(path)
    if not q.is_absolute():
        q = ROOT / q
    q.parent.mkdir(parents=True, exist_ok=True)
    return str(q)
