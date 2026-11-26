# Builds "Black Tide Pixel", a 5x7 pixel webfont, from bitmap glyph strings.
# Glyph shapes after the pixel font in Cinderwatch by kevintngo (MIT).
# 1 pixel = 100 units, unitsPerEm 1000: at font-size 20px one pixel is 2 CSS px.
import re, sys
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
import pathops

SRC_JS = sys.argv[1]
OUT = sys.argv[2]

js = open(SRC_JS, encoding='utf8').read()
block = js[js.index('const SRC = {'):js.index('const UNKNOWN_SRC')]
glyphs = {}
for m in re.finditer(r"""^\s*(?:'((?:\\.|[^'])*)'|"((?:\\.|[^"])*)")\s*:\s*'([^']*)',""", block, re.M):
    ch = m.group(1) if m.group(1) is not None else m.group(2)
    ch = ch.encode().decode('unicode_escape') if '\\' in ch else ch
    glyphs[ch] = m.group(3)

# extra glyphs for Black Tide
glyphs.update({
    '°': '##/##',
    '’': "#/#", '‘': "#/#", '“': '#.#/#.#', '”': '#.#/#.#',
    '—': '3:#####',
    '©': '.###./#...#/#.#.#/##..#/#.#.#/#...#/.###.',
    'é': '.#../..../.###./#...#/#####/#..../.###.',
})

LINE, CAP = 9, 7
def parse(d):
    off = 0
    if len(d) > 1 and d[1] == ':' and d[0].isdigit():
        off = int(d[0]); d = d[2:]
    rows = d.split('/')
    w = max(len(r) for r in rows)
    return off, rows, w

U = 100
names = {' ': 'space'}
order = ['.notdef', 'space']
cmap = {32: 'space'}
adv = {'.notdef': (500, 0), 'space': (400, 0)}
outlines = {}

def glyph_name(ch):
    return 'uni%04X' % ord(ch)

def draw(off, rows, w):
    path = pathops.Path()
    pen = path.getPen()
    for r, row in enumerate(rows):
        y = off + r
        if y >= LINE: break
        x = 0
        while x < len(row):
            if row[x] == '#':
                x0 = x
                while x < len(row) and row[x] == '#': x += 1
                top = (CAP - y) * U; bot = top - U
                pen.moveTo((x0 * U, bot)); pen.lineTo((x0 * U, top)); pen.lineTo((x * U, top)); pen.lineTo((x * U, bot)); pen.closePath()
            else:
                x += 1
    path.simplify(fix_winding=True)
    tp = TTGlyphPen(None)
    path.draw(tp)
    return tp.glyph()

for ch, d in glyphs.items():
    if len(ch) != 1: continue
    off, rows, w = parse(d)
    n = glyph_name(ch)
    order.append(n); cmap[ord(ch)] = n
    outlines[n] = draw(off, rows, w)
    adv[n] = ((w + 1) * U, 0)

# notdef box
nd = pathops.Path(); p = nd.getPen()
p.moveTo((0, 0)); p.lineTo((0, 600)); p.lineTo((400, 600)); p.lineTo((400, 0)); p.closePath()
p.moveTo((100, 100)); p.lineTo((300, 100)); p.lineTo((300, 500)); p.lineTo((100, 500)); p.closePath()
nd.simplify(fix_winding=True); tp = TTGlyphPen(None); nd.draw(tp); outlines['.notdef'] = tp.glyph()
outlines['space'] = TTGlyphPen(None).glyph()

fb = FontBuilder(1000, isTTF=True)
fb.setupGlyphOrder(order)
fb.setupCharacterMap(cmap)
fb.setupGlyf(outlines)
fb.setupHorizontalMetrics({n: adv[n] for n in order})
fb.setupHorizontalHeader(ascent=800, descent=-200)
fb.setupNameTable({'familyName': 'Black Tide Pixel', 'styleName': 'Regular', 'copyright': 'Glyphs after Cinderwatch by kevintngo (MIT)'})
fb.setupOS2(sTypoAscender=800, sTypoDescender=-200, sTypoLineGap=0, usWinAscent=800, usWinDescent=200, sxHeight=500, sCapHeight=700)
fb.setupPost()
fb.font.flavor = 'woff2'
fb.save(OUT)
print('glyphs', len(order), '->', OUT)
