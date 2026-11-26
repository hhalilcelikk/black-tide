# Black Tide

An open-world pirate RPG that ships as **one HTML file**. `DESIGN.md` is the game design (pillars, systems, milestones); `README.md` maps the source files. Read the part of `DESIGN.md` that covers a feature before you build it.

Live build: https://hhalilcelikk.github.io/black-tide/ (GitHub Pages, rebuilt by `.github/workflows/pages.yml` on every push to `main`).

## Commands

```
npm install                      # once
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt   # once, for the test harness
node build.mjs                   # src/ -> dist/index.html
npm test                         # build + smoke, port, layout (1280, 1024, 1920 wide), trade, traderun, traffic, save, marque, brethren, ladder, fleet, hunt, polish
.venv/bin/python play.py tests/smoke.json 1280 720 [query]   # gameplay script, query defaults to "test"
.venv/bin/python shoot.py tests/stills.json [w] [h]          # look-dev stills
```

`play.py` and `shoot.py` share `harness.py`. They use Google Chrome if it is installed, otherwise Playwright's Chromium (`.venv/bin/playwright install chromium`). `BT_GL=swiftshader` switches to software WebGL, and `BT_HEADED=1` shows the window. Screenshots go to `shots/`, which git ignores.

## Rules every session follows

1. **One HTML file, no asset files.** The game is `dist/index.html` and nothing else: no images, models, audio, textures or JSON loaded at runtime, and no network requests. Ships, islands, sea, sky, textures, sound and music are generated in code. The only things inlined at build time are three.js, the IM Fell fonts from `node_modules`, and the BT Pixel font, which `tools/pixelfont.mjs` builds from glyph bitmaps in code (edit `GLYPHS` there to change a letter). Never add a file under `assets/`, `public/` or similar, and never `fetch` or `import` one at runtime. It must still open from `file://`. Keep the build under 2 MB (it is about 990 KB now) and check the size `build.mjs` prints. The one exception to "no asset files" is `docs/`: the README's GIF lives there and the game never loads it.
2. **Seeded randomness.** Anything that affects the simulation or what is generated uses `mulberry32(seed)` from `src/util.js`, or the game's `rnd`, never `Math.random()`. The world seed comes from `?seed=` (default 7). The same seed plus the same inputs must replay the same voyage. Things that only affect the picture get their own seeded stream (`boltRnd` in `main.js`, `flagRnd` in `flags.js`), so render rate can never shift the sim RNG. Only `src/audio.js` may use `Math.random()`, for noise grain that never feeds back into the game.
3. **Fixed 1/60 s simulation step.** Game state changes only inside `G.step(STEP)`, with `STEP = 1 / 60` (`src/main.js`). Never read `performance.now()`, `Date.now()` or a frame `dt` inside the simulation. Wall-clock time only feeds the accumulator that decides how many steps to run, plus rendering, camera smoothing and audio. Timers count simulated seconds (`G.t`). The sim never reads render state (uniforms, the camera, the current look): what it needs, it derives from its own state (`G.waveAmp`). `tests/render_independence.py` proves that drawing frames cannot change the game.
4. **Gameplay tests run through `play.py` on `?test`.** `window.__bt.advance(sec)` steps the sim on the fixed clock, and `state()` reports it. Write gameplay checks as `expect` steps in a JSON script under `tests/` (`"equals"` compares the JSON result, so a check can return a list of problems and expect `[]`). Prove a new check can fail by planting the bug once. Run `npm test` after every gameplay change, and add or extend a script whenever you add a mechanic. A failing expect or a page error exits 1. Do not test with `wait` (wall clock) when `advance`/`until` will do.
5. **Stills come from `shoot.py` on `?capture`.** `window.__ld.shot({...})` stages a named look, a fixed isometric camera and a fleet. Use it for look development and before/after comparisons of rendering changes, with the same shot JSON on both sides.
6. **Look at a screenshot before every commit.** Before each commit, take at least one `shot` with `play.py` (for gameplay or HUD changes) or `shoot.py` (for rendering changes) and open the PNG yourself. Check that the scene renders (not black or blank), the HUD isn't clipped or overlapping, and the change is actually visible. For HUD work, look at 1024 and 1920 wide as well as 1280; `tests/layout.json` catches plates overlapping but not text clipped inside a plate. Say in the commit message or to the user what you looked at. A passing test is not enough on its own.

## Conventions

- Source is ES modules in `src/`, bundled by esbuild (`build.mjs`) into `src/template.html`. `dist/` is build output and is never committed.
- URL flags: `?seed=`, `?skip=attract`, `?gold=`, `?test`, `?capture`. New debug switches go behind a URL flag, not a code edit.
- Commit small, working steps. The build must pass and `npm test` must be green before a push, because Pages deploys every push to `main`.

## Pace

Black Tide is for quick sessions, not a long grind: fun has to start at once. The opening takes its first prize by about t=60. A free-play career starts with a prize in sight, and `director()` puts a merchant across your bow after 25 quiet seconds. Sailing uses an arcade polar: head to wind still makes about a third of a ship's speed, with no stalling. Broadsides bear 45 degrees either side of the beam, reload in about 3 s, and a merchant strikes in 10-20 s. Keep changes in this spirit, and keep `tests/combat.json` green.

## The world and its ports

- Ports are data in `src/ports.js`: nation, town layout, governor, tavern, and the goods each market makes (cheap) and needs (dear). Every harbour faces south. `PORTS` derives each pier, mooring line, harbour and exit from the shoreline, so never hard-code a harbour position.
- An island is a set of height blobs in `BLOBS` (`src/world.js`) plus an `isle` rectangle in its port spec. Town houses need gentle ground (height 1.7 to 16 m, slope under 0.42). If a town comes out sparse, add a low shelf blob behind the harbour rather than loosening the rules. After changing an island, check that the berth is at least 4 m deep (`heightAt` at both ends of the moored hull) and shoot `tests/ports-stills.json`.
- `heightAt` skips blobs beyond their reach, using a tile index, so it stays cheap. One 1280² height grid (`heightGrid()`) feeds both the ocean shallows texture and the nav grid.
- Lights are pooled. A lamp, brazier or torch is a spec in `world.lights`, and main.js lights the 8 nearest with a fixed pool of PointLights. Never add a PointLight per object: the light count must stay fixed or every shader recompiles.
- Markets keep a per-port price factor `k` that trades move and time restores. Trade runs, traffic and navies all read the same port list.

## Nations

- `src/nations.js` holds the wars and alliances, the standing thresholds (letter of marque at 8, harbour closed below -8) and the commission ranks. `G.standing` covers the four crowns plus `pirate` for the Brethren.
- `credit()` in game.js is the single place a prize or a sinking changes standing and pays a commission. `G.legal(ship)` decides what is a lawful prize, `G.welcome(port)` which harbours let you in, and `G.colours()` the flag you fly. Navies and pirates read these in `npcThink`, and the AI captain and trade planner only use welcoming ports.
- A new piece of politics goes through these functions rather than special cases in the AI or the HUD, and into the save.

## The Ladder

- `src/ladder.js` owns the fifty rivals. The top twenty move on the chart as positions. One becomes a real ship (role `pirate`, `s.rival` set) within 420 m of you, at most two at a time plus a rumoured one, and goes back to the chart beyond 650 m. Rank is your place in the fame table. `ladder.beat()` gives you a rival's place, and `rerank()` pays every title bracket passed.
- The ladder runs on its own seeded stream (`lrnd`), so its off-screen raids never shift the sim's random numbers, and it saves with the career.

## The fleet

- Your fleet is the flagship (role `player`) plus up to two consorts (role `consort`). Use `G.isFleet(ship)` wherever "you" means the fleet: hostility, credit for prizes and sinkings, wanted status. Keep `role === 'player'` for what only the flagship does (the helm, docking, the camera).
- Upgrades live on each ship (`s.up`). `G.upgrades` is the flagship's. The hold is shared (`G.holdCap()` is the sum of the fleet's holds), and a lost ship takes her share of the cargo with her.
- Consorts keep station astern, fight whoever attacks the fleet (or the flagship's target once she opens fire), and anchor off the pier head in port. If the flagship sinks, the biggest consort takes the flag.

## Things to hunt

- Corvin Vane's Black Wake (boss livery: black hull, red sails) waits in his zone once a tavern rumour has named it (needs a Ladder rank). `bossThink` takes the weather gauge, opens with chain shot and boards a crippled ship; being boarded and beaten strips your hold and half your gold. Beaten once, he stays beaten.
- `src/serpent.js` is not a ship: its own seeded stream, its own ball test (`hitBall`), and `stage()` for stills. In its marked water the sky turns black and it rises; elsewhere it only rises in storms far from port.
- A boarding ends at once if either ship starts to sink.

## Music and quality

- Music runs per context (`sea`, `battle`, `port`, `storm`), each on its own bus. `A.contextFor()` decides, and a new context must hold for 2 s before the crossfade. Songs are data in `audio.js` (notes in beats, 8 beats a line, captions per line). Headless Chrome's audio clock barely runs, so tests check `A.busTarget()`, not live gains.
- Quality Low/Medium/High (`QUALITY` in main.js) sets internal resolution, shadows, mist and AO. It is picked from frames 30-150 on a first visit and saved as `bt-quality`. In chart view ships drop rigging and flags (`setLod`), and torn sails collapse facets of each ship's own sail geometry (`setTorn`).

## Saves

- A career is `G.snapshot()` (plain JSON) and comes back with `G.restore(data, slot)`. `src/save.js` writes it to the `blacktide.save.1`–`3` slots in localStorage on every docking and departure, wraps every storage call in try/catch, and handles export and import. The AI captain's trailer is never saved.
- **Any new career state (fleet, contracts, rivals, standing, flags) must go into `snapshot` and `restore` in the same change**, with a `tests/save.json` check that it survives a reload. Bump `v` and keep loading older saves when the format changes.
- A save carries the sim's RNG position (`rnd.getState()`), so a career resumes on the same random stream. Traffic is not saved: the sea refills around you.

## HUD layout

The HUD is sized in `--px` units (2 px, 3 px on very large screens). Below 1540 px wide, the camera bar stacks into two rows, the helm centres between the side plates and the rank shows without its title. New plates must stay clear of the others at 1024x768 (`tests/layout.json`). Dialogs (`.modal`) sit above the port screen.
