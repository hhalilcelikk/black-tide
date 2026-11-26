import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildPixelFont } from './tools/pixelfont.mjs';

// Paths are relative to this folder, wherever the build is run from.
process.chdir(path.dirname(fileURLToPath(import.meta.url)));

const r = await build({ entryPoints: ['src/main.js'], bundle: true, format: 'iife', minify: true, write: false, target: 'es2020', legalComments: 'none' });
let html = fs.readFileSync('src/template.html', 'utf8');
const b64 = f => fs.readFileSync(f).toString('base64');
const F = 'node_modules/@fontsource';
html = html
  .replace('__PIXEL__', () => buildPixelFont().toString('base64'))
  .replace('__FELL__', () => b64(`${F}/im-fell-english/files/im-fell-english-latin-400-normal.woff2`))
  .replace('__FELLI__', () => b64(`${F}/im-fell-english/files/im-fell-english-latin-400-italic.woff2`))
  .replace('__FELLSC__', () => b64(`${F}/im-fell-english-sc/files/im-fell-english-sc-latin-400-normal.woff2`));
const js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
html = html.replace('__BUNDLE__', () => '/* Black Tide look development. three.js r170 (MIT). Post-processing approach and pixel-font glyphs after Cinderwatch by kevintngo (MIT). IM Fell fonts by Igino Marini (OFL). */\n' + js);
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/index.html', html);
console.log('built', (html.length / 1024).toFixed(0) + ' KB');
