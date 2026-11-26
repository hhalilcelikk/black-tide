# Black Tide

**Play it:** https://hhalilcelikk.github.io/black-tide/

The playable prototype and look development for Black Tide, a pirate RPG in one HTML file. three.js r170 is bundled into the page and everything else is generated in code: ships, islands, textures, sound and the pixel font.

## Build and run

```
npm install
node build.mjs        # writes dist/index.html (about 930 KB, fonts and script inlined)
```

Open `dist/index.html` in a desktop browser. Every push to `main` rebuilds it and publishes it to GitHub Pages. Useful URL switches:

- `?skip=attract` starts free play in a sloop instead of the AI captain's opening.
- `?seed=7` sets the world's random seed.
- `?test` exposes `window.__bt` (`advance(seconds)`, `render()`, `state()`) for scripted tests. `play.py` drives it.
- `?capture` exposes `window.__ld.shot({...})` for still frames: a named look, a fixed isometric camera and a staged fleet. `shoot.py` drives it, and the key frames were made this way.

## Tests and stills

```
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
npm test                                                  # build, then tests/smoke.json
.venv/bin/python play.py tests/smoke.json 1280 720        # any gameplay script
.venv/bin/python shoot.py tests/stills.json               # look-dev stills
```

Both scripts use Google Chrome if it is installed, otherwise Playwright's Chromium. The script formats are documented at the top of each file, and screenshots go to `shots/`. `CLAUDE.md` has the project rules.

## Where things live

| File | What it does |
| --- | --- |
| `src/main.js` | Renderer, cameras (deck, chase, chart, port), light registry, frame loop, test and capture hooks |
| `src/game.js` | Simulation: wind, sailing polar, tacking and wearing, broadsides, boarding, harbours and markets, traffic between ports, the AI captain (hunt, sail to port, trade run) |
| `src/nations.js` | Wars and alliances between the crowns, what standing means, and the ranks of a letter of marque |
| `src/ladder.js` | The Ladder of Famous Captains: fifty rivals, the top twenty sailing the chart, places taken by beating them, titles and sightings |
| `src/save.js` | Career saves: three localStorage slots written at every port, Continue, export and import as JSON |
| `src/ports.js` | The five ports: nation, town layout and style, governor and tavern, what each market makes and needs |
| `src/hud.js` | Pixel-plate HUD, input, port screens, chart labels, course and target markers |
| `src/ship.js` | Ship generator (seven classes, five liveries) and the game numbers for each class |
| `src/world.js` | Islands, towns, forts, docks, lighthouse, vegetation, and the shared height grid (ocean shallows and navigation) |
| `src/ocean.js`, `src/waves.js` | Faceted Gerstner ocean shared by GPU and CPU (buoyancy), shallows, foam, wakes, glints |
| `src/post.js` | Half-res render, ambient occlusion, lit mist, bloom, ACES, dither, crisp upscale |
| `src/detail.js` | The ten 64-pixel material textures with relief |
| `src/looks.js` | Dawn, day, dusk, night and storm, and the day cycle that blends them |
| `src/fx.js` | Smoke, fires, cannonballs, splashes, rain, lightning, gulls |
| `src/audio.js` | Sea and wind beds, cannon, bells and the shanty with captions |
| `src/nav.js` | Depth grid, A* sea routes, line-of-sight checks |
| `src/template.html` | Page shell and the HUD markup and styles |
| `tools/pixelfont.mjs` | The BT Pixel font: glyph bitmaps and the TrueType builder that `build.mjs` runs |
| `play.py`, `shoot.py`, `harness.py`, `tests/` | Headless test harness. `npm test` runs smoke, port, layout, trade (a sugar run by hand), traderun (the AI captain) traffic (five minutes at sea) save (dock, reload, Continue, export, import), marque (sailing for England), brethren (the pirate path) and ladder (rank, rumour, rival, place taken) and fleet (two consorts in formation, in a fight, in port, at the shipwright, and taking the flag); `tests/ports-stills.json` shoots every harbour |

## Credits

three.js (MIT). The post-processing approach and pixel-font idea follow Cinderwatch by kevintngo (MIT). IM Fell fonts by Igino Marini (SIL OFL). "Drunken Sailor" is a traditional shanty.
