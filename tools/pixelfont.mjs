// Black Tide Pixel: a 5x7 pixel font built in code as a TrueType file at build time.
// build.mjs inlines it into the page, so the repo holds no font file.
// Glyph shapes after the pixel font in Cinderwatch by kevintngo (MIT).
//
// Glyph format: rows top to bottom joined by "/", "#" = ink, "." = blank. Row 0 is the cap-height row,
// rows 7-8 are descenders. An optional "N:" prefix starts the glyph N rows down. The longest row sets
// the width, and the advance is width + 1 pixel. 1 pixel = 100 units, unitsPerEm 1000, so at
// font-size 20px one pixel is 2 CSS px.

export const GLYPHS = {
  " ": "...",
  "!": "#/#/#/#/#/./#",
  "\"": "#.#/#.#",
  "#": ".#.#./.#.#./#####/.#.#./#####/.#.#./.#.#.",
  "$": "..#../.####/#.#../.###./..#.#/####./..#..",
  "%": "##.../##..#/...#./..#../.#.../#..##/...##",
  "&": ".##../#..#./#.#../.#.../#.#.#/#..#./.##.#",
  "'": "#/#",
  "(": ".#/#./#./#./#./#./.#",
  ")": "#./.#/.#/.#/.#/.#/#.",
  "*": "1:#.#/.#./#.#",
  "+": "2:.#./###/.#.",
  ",": "5:.#/.#/#.",
  "-": "3:###",
  ".": "6:#",
  "/": "..#/..#/.#./.#./.#./#../#..",
  "0": ".###./#...#/#..##/#.#.#/##..#/#...#/.###.",
  "1": ".#.../##.../.#.../.#.../.#.../.#.../###..",
  "2": ".###./#...#/....#/...#./..#../.#.../#####",
  "3": ".###./#...#/....#/..##./....#/#...#/.###.",
  "4": "...#./..##./.#.#./#..#./#####/...#./...#.",
  "5": "#####/#..../####./....#/....#/#...#/.###.",
  "6": "..##./.#.../#..../####./#...#/#...#/.###.",
  "7": "#####/....#/...#./..#../..#../..#../..#..",
  "8": ".###./#...#/#...#/.###./#...#/#...#/.###.",
  "9": ".###./#...#/#...#/.####/....#/...#./.##..",
  ":": "2:#/././#",
  ";": "2:.#/../../.#/.#/#.",
  "<": "1:..#/.#./#../.#./..#",
  "=": "2:###/.../###",
  ">": "1:#../.#./..#/.#./#..",
  "?": ".###./#...#/....#/...#./..#../...../..#..",
  "@": ".###./#...#/#.###/#.#.#/#.###/#..../.###.",
  "A": ".###./#...#/#...#/#####/#...#/#...#/#...#",
  "B": "####./#...#/#...#/####./#...#/#...#/####.",
  "C": ".###./#...#/#..../#..../#..../#...#/.###.",
  "D": "####./#...#/#...#/#...#/#...#/#...#/####.",
  "E": "#####/#..../#..../####./#..../#..../#####",
  "F": "#####/#..../#..../####./#..../#..../#....",
  "G": ".###./#...#/#..../#.###/#...#/#...#/.###.",
  "H": "#...#/#...#/#...#/#####/#...#/#...#/#...#",
  "I": "###/.#./.#./.#./.#./.#./###",
  "J": "...#/...#/...#/...#/...#/#..#/.##.",
  "K": "#...#/#..#./#.#../##.../#.#../#..#./#...#",
  "L": "#.../#.../#.../#.../#.../#.../####",
  "M": "#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#",
  "N": "#...#/#...#/##..#/#.#.#/#..##/#...#/#...#",
  "O": ".###./#...#/#...#/#...#/#...#/#...#/.###.",
  "P": "####./#...#/#...#/####./#..../#..../#....",
  "Q": ".###./#...#/#...#/#...#/#.#.#/#..#./.##.#",
  "R": "####./#...#/#...#/####./#.#../#..#./#...#",
  "S": ".###./#...#/#..../.###./....#/#...#/.###.",
  "T": "#####/..#../..#../..#../..#../..#../..#..",
  "U": "#...#/#...#/#...#/#...#/#...#/#...#/.###.",
  "V": "#...#/#...#/#...#/#...#/#...#/.#.#./..#..",
  "W": "#...#/#...#/#...#/#.#.#/#.#.#/#.#.#/.#.#.",
  "X": "#...#/#...#/.#.#./..#../.#.#./#...#/#...#",
  "Y": "#...#/#...#/.#.#./..#../..#../..#../..#..",
  "Z": "#####/....#/...#./..#../.#.../#..../#####",
  "[": "##/#./#./#./#./#./##",
  "\\": "#../#../.#./.#./.#./..#/..#",
  "]": "##/.#/.#/.#/.#/.#/##",
  "^": ".#./#.#",
  "_": "7:####",
  "`": "#./.#",
  "a": "2:.###./....#/.####/#...#/.####",
  "b": "#..../#..../####./#...#/#...#/#...#/####.",
  "c": "2:.###/#.../#.../#.../.###",
  "d": "....#/....#/.####/#...#/#...#/#...#/.####",
  "e": "2:.###./#...#/#####/#..../.###.",
  "f": "..##/.#../####/.#../.#../.#../.#..",
  "g": "2:.####/#...#/#...#/#...#/.####/....#/.###.",
  "h": "#..../#..../####./#...#/#...#/#...#/#...#",
  "i": "#/./#/#/#/#/#",
  "j": "..#/.../..#/..#/..#/..#/..#/..#/##.",
  "k": "#.../#.../#..#/#.#./##../#.#./#..#",
  "l": "#./#./#./#./#./#./.#",
  "m": "2:####./#.#.#/#.#.#/#.#.#/#.#.#",
  "n": "2:####./#...#/#...#/#...#/#...#",
  "o": "2:.###./#...#/#...#/#...#/.###.",
  "p": "2:####./#...#/#...#/#...#/####./#..../#....",
  "q": "2:.####/#...#/#...#/#...#/.####/....#/....#",
  "r": "2:#.##/##../#.../#.../#...",
  "s": "2:.####/#..../.###./....#/####.",
  "t": "1:.#../####/.#../.#../.#../..##",
  "u": "2:#...#/#...#/#...#/#...#/.####",
  "v": "2:#...#/#...#/#...#/.#.#./..#..",
  "w": "2:#...#/#...#/#.#.#/#.#.#/.#.#.",
  "x": "2:#...#/.#.#./..#../.#.#./#...#",
  "y": "2:#...#/#...#/#...#/#...#/.####/....#/.###.",
  "z": "2:#####/...#./..#../.#.../#####",
  "{": "..#/.#./.#./#../.#./.#./..#",
  "|": "#/#/#/#/#/#/#",
  "}": "#../.#./.#./..#/.#./.#./#..",
  "~": "2:.#.../#.#.#/...#.",
  "©": ".###./#...#/#.#.#/##..#/#.#.#/#...#/.###.",
  "°": "##/##",
  "·": "3:#",
  "×": "3:#.#/.#./#.#",
  "é": ".#.../...../.###./#...#/#####/#..../.###.",
  "–": "3:####",
  "—": "3:#####",
  "‘": "#/#",
  "’": "#/#",
  "“": "#.#/#.#",
  "”": "#.#/#.#",
  "…": "6:#.#.#",
  "←": "1:..#../.#.../#####/.#.../..#..",
  "↑": "..#../.###./#.#.#/..#../..#../..#../..#..",
  "→": "1:..#../...#./#####/...#./..#..",
  "↓": "..#../..#../..#../..#../#.#.#/.###./..#..",
};

const U = 100, CAP = 7, LINE = 9, FAMILY = 'Black Tide Pixel';
const STAMP = Date.UTC(2026, 10, 25) / 1000 + 2082844800; // seconds since 1904-01-01

function parse(src) {
  let off = 0;
  const m = /^(\d):/.exec(src);
  if (m) { off = +m[1]; src = src.slice(2); }
  const rows = src.split('/');
  return { off, rows, w: Math.max(...rows.map(r => r.length)) };
}

// Outline of a set of pixels: each pixel contributes a clockwise square (y up), edges shared by two
// pixels cancel, and the rest chain into closed contours (outer clockwise, holes counter-clockwise),
// so neighbouring pixels never leave hairline seams.
function outline(cells) {
  const key = (ax, ay, bx, by) => `${ax},${ay},${bx},${by}`;
  const edges = new Map();
  const add = (ax, ay, bx, by) => {
    const rev = key(bx, by, ax, ay);
    if (edges.has(rev)) edges.delete(rev); else edges.set(key(ax, ay, bx, by), [ax, ay, bx, by]);
  };
  for (const [x, y] of cells) { // x, y in pixels with y up
    add(x, y, x, y + 1); add(x, y + 1, x + 1, y + 1); add(x + 1, y + 1, x + 1, y); add(x + 1, y, x, y);
  }
  const from = new Map();
  for (const e of edges.values()) { const k = e[0] + ',' + e[1]; if (!from.has(k)) from.set(k, []); from.get(k).push(e); }
  const contours = [];
  for (const start of [...edges.values()]) {
    if (start.used) continue;
    const pts = [];
    let e = start;
    while (!e.used) {
      e.used = true; pts.push([e[0], e[1]]);
      const next = from.get(e[2] + ',' + e[3]).find(n => !n.used);
      if (!next) break;
      e = next;
    }
    // drop points in the middle of straight runs
    const keep = pts.filter((p, i) => {
      const a = pts[(i + pts.length - 1) % pts.length], b = pts[(i + 1) % pts.length];
      return (p[0] - a[0]) * (b[1] - p[1]) !== (p[1] - a[1]) * (b[0] - p[0]);
    });
    contours.push(keep.map(([x, y]) => [x * U, y * U]));
  }
  return contours;
}

function glyphFromSource(src) {
  const { off, rows, w } = parse(src);
  const cells = [];
  rows.forEach((row, r) => {
    const y = off + r;
    if (y >= LINE) return;
    for (let x = 0; x < row.length; x++) if (row[x] === '#') cells.push([x, CAP - y - 1]);
  });
  return { contours: outline(cells), advance: (w + 1) * U };
}

// --- binary helpers -------------------------------------------------------------------------------
class Out {
  constructor() { this.b = []; }
  u8(v) { this.b.push(v & 255); return this; }
  u16(v) { return this.u8(v >> 8).u8(v); }
  i16(v) { return this.u16(v < 0 ? v + 65536 : v); }
  u32(v) { return this.u16(Math.floor(v / 65536)).u16(v % 65536); }
  bytes(a) { for (const v of a) this.u8(v); return this; }
  pad4() { while (this.b.length % 4) this.u8(0); return this; }
  get length() { return this.b.length; }
  buf() { return Buffer.from(this.b); }
}
const checksum = buf => {
  let s = 0;
  for (let i = 0; i < buf.length; i += 4) s = (s + ((buf[i] << 24) | ((buf[i + 1] || 0) << 16) | ((buf[i + 2] || 0) << 8) | (buf[i + 3] || 0)) >>> 0) >>> 0;
  return s;
};
const log2floor = n => Math.floor(Math.log2(n));

// --- the font -------------------------------------------------------------------------------------
export function buildPixelFont() {
  const glyphs = [
    { name: '.notdef', ...glyphFromSource('1:####/#..#/#..#/#..#/#..#/####') },
    { name: 'space', code: 32, ...glyphFromSource(GLYPHS[' ']) },
  ];
  for (const [ch, src] of Object.entries(GLYPHS)) {
    if (ch === ' ') continue;
    glyphs.push({ name: 'uni' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'), code: ch.codePointAt(0), ...glyphFromSource(src) });
  }
  glyphs[0].advance = 500;

  // glyf + loca
  const glyf = new Out(), loca = [];
  let bbox = [Infinity, Infinity, -Infinity, -Infinity], maxPoints = 0, maxContours = 0;
  for (const g of glyphs) {
    loca.push(glyf.length);
    const pts = g.contours.flat();
    g.lsb = 0;
    if (!pts.length) continue;
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const gb = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    g.lsb = gb[0]; g.xMax = gb[2];
    bbox = [Math.min(bbox[0], gb[0]), Math.min(bbox[1], gb[1]), Math.max(bbox[2], gb[2]), Math.max(bbox[3], gb[3])];
    maxPoints = Math.max(maxPoints, pts.length); maxContours = Math.max(maxContours, g.contours.length);
    glyf.i16(g.contours.length).i16(gb[0]).i16(gb[1]).i16(gb[2]).i16(gb[3]);
    let end = -1;
    for (const c of g.contours) { end += c.length; glyf.u16(end); }
    glyf.u16(0); // no instructions
    for (let i = 0; i < pts.length; i++) glyf.u8(1); // on-curve, 16-bit deltas
    let px = 0; for (const [x] of pts) { glyf.i16(x - px); px = x; }
    let py = 0; for (const [, y] of pts) { glyf.i16(y - py); py = y; }
    glyf.pad4();
  }
  loca.push(glyf.length);
  const locaT = new Out(); for (const o of loca) locaT.u32(o);

  const n = glyphs.length;
  const advMax = Math.max(...glyphs.map(g => g.advance));
  const inked = glyphs.filter(g => g.xMax !== undefined);
  const head = new Out().u32(0x00010000).u32(0x00010000).u32(0).u32(0x5F0F3CF5).u16(0x000B).u16(1000)
    .u32(0).u32(STAMP).u32(0).u32(STAMP) // created, modified: a fixed date so the build is reproducible
    .i16(bbox[0]).i16(bbox[1]).i16(bbox[2]).i16(bbox[3]).u16(0).u16(8).i16(2).i16(1).i16(0);
  const hhea = new Out().u32(0x00010000).i16(800).i16(-200).i16(0).u16(advMax)
    .i16(Math.min(...inked.map(g => g.lsb))).i16(Math.min(...inked.map(g => g.advance - g.xMax))).i16(Math.max(...inked.map(g => g.xMax)))
    .i16(1).i16(0).i16(0).i16(0).i16(0).i16(0).i16(0).i16(0).u16(n);
  const maxp = new Out().u32(0x00010000).u16(n).u16(maxPoints).u16(maxContours).u16(0).u16(0).u16(2)
    .u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0);
  const hmtx = new Out(); for (const g of glyphs) hmtx.u16(g.advance).i16(g.lsb);

  // cmap: format 4, one segment per character (plus the 0xFFFF terminator), shared by (0,3) and (3,1)
  const mapped = glyphs.map((g, gid) => [g.code, gid]).filter(([c]) => c !== undefined).sort((a, b) => a[0] - b[0]);
  const segs = [...mapped.map(([c, gid]) => [c, c, (gid - c + 65536) % 65536]), [0xFFFF, 0xFFFF, 1]];
  const sc = segs.length, sr = 2 * 2 ** log2floor(sc);
  const f4 = new Out().u16(4).u16(16 + sc * 8).u16(0).u16(sc * 2).u16(sr).u16(log2floor(sr / 2)).u16(sc * 2 - sr);
  for (const s of segs) f4.u16(s[1]); f4.u16(0);
  for (const s of segs) f4.u16(s[0]);
  for (const s of segs) f4.u16(s[2]);
  for (const s of segs) f4.u16(0);
  const cmap = new Out().u16(0).u16(2).u16(0).u16(3).u32(20).u16(3).u16(1).u32(20).bytes(f4.b);

  // name: Windows Unicode English records
  const names = [[0, 'Glyphs after Cinderwatch by kevintngo (MIT)'], [1, FAMILY], [2, 'Regular'], [3, FAMILY + ' Regular'], [4, FAMILY], [5, 'Version 1.000'], [6, 'BlackTidePixel-Regular']];
  const strs = names.map(([, s]) => Buffer.from(s, 'utf16le').swap16());
  const name = new Out().u16(0).u16(names.length).u16(6 + names.length * 12);
  let so = 0; names.forEach(([id], i) => { name.u16(3).u16(1).u16(0x409).u16(id).u16(strs[i].length).u16(so); so += strs[i].length; });
  for (const s of strs) name.bytes(s);

  const codes = mapped.map(m => m[0]);
  const avg = Math.round(inked.reduce((a, g) => a + g.advance, 0) / inked.length);
  const os2 = new Out().u16(4).i16(avg).u16(400).u16(5).u16(0)
    .i16(650).i16(600).i16(0).i16(75).i16(650).i16(600).i16(0).i16(350).i16(50).i16(300).i16(0)
    .bytes([2, 0, 0, 0, 0, 0, 0, 0, 0, 0]) // panose: text font, rest unspecified
    .u32(0b11).u32(0).u32(0).u32(0) // Basic Latin, Latin-1 Supplement
    .bytes([...Buffer.from('BLTD')]).u16(0x40).u16(Math.min(...codes)).u16(Math.min(Math.max(...codes), 0xFFFF))
    .i16(800).i16(-200).i16(0).u16(800).u16(200).u32(1).u32(0).i16(500).i16(700).u16(0).u16(32).u16(1);
  const post = new Out().u32(0x00030000).u32(0).i16(-100).i16(50).u32(0).u32(0).u32(0).u32(0).u32(0);

  // assemble the sfnt
  const tables = { 'OS/2': os2, cmap, glyf, head, hhea, hmtx, loca: locaT, maxp, name, post };
  const tags = Object.keys(tables).sort();
  const nt = tags.length, tsr = 16 * 2 ** log2floor(nt);
  const dir = new Out().u32(0x00010000).u16(nt).u16(tsr).u16(log2floor(nt)).u16(nt * 16 - tsr);
  let offset = 12 + nt * 16;
  const bodies = [];
  for (const tag of tags) {
    const data = tables[tag].buf();
    dir.bytes([...Buffer.from(tag.padEnd(4))]).u32(checksum(data)).u32(offset).u32(data.length);
    const padded = Buffer.concat([data, Buffer.alloc((4 - data.length % 4) % 4)]);
    bodies.push({ tag, offset, padded }); offset += padded.length;
  }
  const font = Buffer.concat([dir.buf(), ...bodies.map(b => b.padded)]);
  const headAt = bodies.find(b => b.tag === 'head').offset;
  font.writeUInt32BE((0xB1B0AFBA - checksum(font) + 2 ** 32) % 2 ** 32, headAt + 8);
  return font;
}
