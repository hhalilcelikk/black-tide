# Black Tide — Game Design v1

Nov 25, 2026 · @Halil

## Pitch

**Black Tide** is an open-world pirate RPG in one HTML file. You start as a nobody with one sloop in the 1600s Caribbean and climb the Ladder of Famous Captains through trade, broadsides and boarding. An AI captain is already sailing when the page loads, and you take the helm with one click.

Title: *Black Tide*, chosen 25 Nov over *Saltwake* and *Lanternwake*.

**Pillars**

1. **The sea feels alive.** Wind, weather, traffic, monsters and other captains all move whether you watch or not.
2. **Real progress in 10 minutes.** First prize, first upgrade and first rank-up all land before minute 10.
3. **A career, not a match.** A 2–4 hour arc from nobody to legend, then open play.
4. **The page is its own trailer.** The AI captain plays on load, and a seed always replays the same way.
5. **Everything made in code.** Ships, islands, sea, sky, sound and shanties are all generated, with zero asset files.

**References**

| Reference | What we take | What we leave |
| --- | --- | --- |
| Sid Meier's Pirates! | Wind-driven ship battles, ports, nations, rank and fame | Sword duels, dancing, town sacking (v1) |
| [Cinderwatch](https://kevintngo.github.io/cinderwatch/) | Single file, attract-mode AI, miniature post-processing, seeded sim | Tower-defence genre |
| [Brushwild](https://kevintngo.github.io/procedural-rpg/) | Open-world wandering, WASD + click-to-move, a turnable camera | Pen-and-pencil art style |

## Core loop and career

One voyage takes 3–8 minutes and always ends in port with something gained. The career strings voyages into a 2–4 hour climb from nobody to legend, then stays open.

&#91;embedded content: core loop · 5 steps\]

Ranks open bigger seas: richer convoys, navies that hunt you, and later storms and monsters.

**The Ladder of Famous Captains** is a public board of 50 named rival captains, each with a ship, a nation and a reputation. You start unranked. Fame from prizes, contracts, bounties and duels with ranked rivals moves you up, and beating a rival at sea takes their spot. Every 10 places brings a title, a reward and a new region.

**Career arc (design targets)**

| Play time | Milestone | What the player gets |
| --- | --- | --- |
| 0–2 min | Take the helm from the AI captain mid-voyage | A sloop, some gold, a prize already in the hold |
| 2–5 min | First port: sell the loot, first repair | Gold for the first upgrade |
| 5–10 min | First upgrade, first solo prize, enter the Ladder at #50 | Rank title "Sea Rat", a nation offers a letter of marque |
| 10–45 min | Climb to #40, capture a second ship | A choice of nation or freedom, second region opens |
| 45 min–2 h | Climb to #20, take on contracts and the first boss captain | Title "Captain of Renown", League of Captains invite |
| 2–4 h | Reach the top 5, defeat the #1 captain | "Legend of the Caribbean", then open play |

## Systems

The game runs at one speed. **Space** pauses the world so you can plan, and orders queued during a pause run when you resume.

**Sailing and controls**

- **WASD:** A/D turns the rudder, W/S raises or lowers sail (stop, half, full).
- **Click the sea** to set a course. The ship sails there and gives control back on any WASD press.
- **Mouse wheel** zooms. **Right-drag** turns the camera. **1/2/3** switches camera mode (see Look, camera and sound).
- **Wind** has a direction and strength that drift over time. Speed depends on the angle to the wind: slowest into it, fastest on a broad reach. Each ship type has a different best angle.

**Ship combat**

- Broadsides only: cannons fire from the port or starboard side. **Q** fires port, **E** fires starboard, and the gun crew reloads over a few seconds.
- Three shot types: round shot (hull), chain shot (sails, slows the enemy), grape shot (crew, sets up boarding).
- Ships carry hull, sails and crew as three separate bars. Hull at zero sinks the ship and loses its cargo, so the smart play is to cripple, then board. If your own flagship sinks, you wash up in the nearest port with half your gold and a free sloop.
- Get the **weather gauge** (be upwind) to fire first and choose the range.

**Boarding**

- Come alongside a slowed ship and press **B**. A 3–4 second animation plays: grapples, a smoke-and-flash melee, a flag change.
- The result is a weighted roll on your crew vs theirs, with modifiers for morale, officers and grape-shot damage. It shows as a bar before you commit, so it's never a surprise.
- Win and you choose: take the cargo, take the ship into your fleet, or let it go (raises standing with that nation).

**Islands and ports**

Sail into a harbour and the 3D view hands off to a 2D port screen: a painted, code-drawn view of the town with buttons, no walking around.

| Place | What you do there |
| --- | --- |
| Governor / Mayor | Letters of marque, nation contracts, rank promotions, rewards |
| Market | Buy and sell goods. Prices differ by island and shift with supply |
| Shipwright | Repair, upgrade (hull, sails, guns), buy and sell ships |
| Tavern | Hire crew, hear rumours (treasure, monster sightings, rich convoys), take side jobs |
| Harbour board | Bounties and the Ladder of Famous Captains |

**Trade**

- About 8 goods (sugar, rum, tobacco, cloth, spices, timber, powder, silver). Each island produces some and needs others.
- Prices move with what players and AI ships sell, so dumping 200 rum in one port crashes its rum price.

**Fleet**

- Capture or buy ships to sail up to 4 at once. Companion ships follow in formation and fight under simple orders (follow, attack target, hold back).
- More ships means more cargo and guns, but more crew to pay and feed.

**Nations and leagues**

- Four nations: England, Spain, France, the Dutch. Each pair is at war, at peace or allied, and that changes over time.
- Each nation tracks a standing with you. Sign a letter of marque to fight for one, or stay free.
- **League of Captains:** an invite-only brotherhood you can join once your fame is high enough. It gives special contracts, safe havens, and enemies among the nations.

**Weather**

- Clear, squall and storm, with a day-night cycle.
- Storms push ships off course, damage sails and hide ships, so they're good for escapes and ambushes.
- Rumours and the sky give some warning before a storm hits.

**Sea monsters**

- A few named beasts (a kraken, a sea serpent, a giant ray) live in the far, deep seas.
- Taverns give leads. Hunting one is a multi-phase fight, and the trophy sells high and adds fame.

## Pirates! mechanics: keep, change, cut

| Pirates! mechanic | Black Tide | Why |
| --- | --- | --- |
| Wind-driven ship battles, broadsides | Keep | The heart of the genre |
| Trading between ports | Keep | A safe way to earn and a reason to sail |
| Nations at war, letters of marque | Keep | Gives every encounter a political meaning |
| Rank and fame | Change: the public Ladder of Famous Captains | A visible ladder of named rivals beats a hidden fame score |
| Boarding | Change: a crew-strength roll with a short animation | Keeps the sea fight flowing |
| Single ship | Change: a fleet of up to 4 | More strategy, more to lose |
| Treasure maps | Change: tavern rumours that mark a spot on the map | Same thrill, no map-piece puzzle |
| Weather | New: storms that change fights and routes | Makes the sea a character |
| Sea monsters | New: huntable named beasts | Late-game goals beyond other ships |
| League of Captains | New: a faction outside the nations | A pirate path, not only a privateer one |
| AI captain autopilot | New | Attract mode, plus auto-farming you can trust |
| Sword duels | Cut (v1) | A separate mini-game; boarding covers it |
| Sacking towns, land battles | Cut (v1) | Large scope; maybe later |
| Dancing, governor's daughters, family hunt | Cut | Dated, and off-tone for this game |
| Captain ageing, forced retirement | Cut | You asked for an open career |

## AI captain

The AI captain does two jobs: it plays the trailer on page load, and it sails on autopilot when you hand it control.

**Attract mode (on load, about 60–90 seconds)**

1. The page opens at dusk on a fixed showcase seed, with the camera on deck.
2. The AI sails a short loop, catching the wind, while the camera drifts to the chase view.
3. It spots a passing merchant or pirate ship and turns to get the weather gauge.
4. It trades broadsides (chain shot, then grape), then boards: animation, win.
5. It loots the cargo, and the camera pulls out to the map view.
6. It sets a course for the nearest merchant island and docks. The port screen flashes up, then the scene loops.

A banner says **Click to take the helm**. Your first click or key hands you control at that exact moment, with no restart. **H** hands control back.

**Autopilot orders (when you hand control back)**

| Order | What the AI does | Stops when |
| --- | --- | --- |
| Hunt nearby | Picks fights it can win (it compares the odds bar), boards and loots | Hold full, hull below 40%, or a stronger ship appears |
| Sail to... | Sails to the island you click and docks | It arrives |
| Trade run | Buys at the best nearby price, sells at the best known one, repeats | You stop it, or prices stop paying |

Autopilot is safe by design: it never picks a fight with odds below a set level, and it heads to port when damaged. A small log shows what it did while you watched ("Took a Spanish merchant: +420 gold").

How it works, Cinderwatch-style: about every 0.5 seconds it scores each option (targets in range, odds, cargo space, distance to port, wind angle) and picks the best one.

## Look, camera and sound

**Look:** a 1600s Caribbean in miniature. The scene renders at about half resolution, then gets ordered dither, depth-aware tilt-shift, vignette and film grain. Light leads: golden hour into dusk, ship lanterns and port fires at night, muzzle flashes lighting the smoke. The water is a code-made shader with wave height driven by the weather, foam trails behind ships, and fog in storms.

**Cameras (1/2/3)**

| Key | Camera | Best for |
| --- | --- | --- |
| 1 | Deck: first person at the helm, looking over the bow | Immersion, close fights |
| 2 | Chase: above and behind the ship, turnable with right-drag | Default for sailing and battles |
| 3 | Chart: a high zoomed-out view of the region, click to set a course | Long voyages, planning on pause |

The mouse wheel moves smoothly between chase and chart, so the step between them doesn't feel like a cut.

**Sound and music**

- **Music is mostly sea shanties**, made in code: a melody synth (fiddle-like and concertina-like voices), a stomp-and-clap rhythm, and an optional hummed choir pad. Shanties are written as note data in a small tune format, so we write originals or use public-domain tunes (e.g. *Drunken Sailor*, *Leave Her, Johnny*).
- Music shifts by context: calm shanty at sea, faster drum-led tune in battle, a tavern tune in port, a low drone in storms.
- **Effects:** wind in the rigging that rises with speed, waves, creaking wood, cannon booms with a generated reverb tail, splashes, crew shouts made from filtered noise, a bell on docking.
- Lyrics scroll on screen as captions while a shanty plays, with a toggle to hide them. Mute and volume settings are saved.

## Tech and build

**Build it in Claude Code**, not in the chat app. The game is about 20 source modules, a build script, a git repo and headless browser tests. Claude Code can run all of that on your machine, and the chat app can't. Folder: `~/Desktop/black-tide`. Public repo on GitHub, playable on GitHub Pages.

**Recipe (from Cinderwatch)**

- Source split into numbered modules in `src/`, built into one `index.html` by a small script, with three.js inlined. It opens from `file://` with no server.
- No asset files: models, textures, sea, sky, sound and music are all generated in code.
- A fixed 1/60 s simulation step with a seeded random generator. The same seed and inputs give the same voyage, which is used for tests, bug repro and trailer capture.
- URL flags for testing: `?seed=`, `?skip=attract`, `?gold=`, `?rank=`, `?fps`.

**Planned modules**

| # | Module | Holds |
| --- | --- | --- |
| 00 | util | Seeded RNG, noise, maths, event bus |
| 10 | materials | Procedural textures: wood, sailcloth, sand, stone |
| 20 | render | Renderer, half-res target, dither, tilt-shift, grain |
| 25 | sea + sky | Water shader, waves, foam, day-night, weather visuals |
| 30 | world | Seeded archipelago: islands, ports, reefs, regions |
| 40 | ships | Ship classes built from parts, sails, damage states |
| 45 | sailing | Wind, physics, WASD and click-to-sail |
| 50 | combat | Broadsides, shot types, boarding roll and animation |
| 55 | fleet | Companion ships, formation, orders |
| 60 | npc | Traffic AI: merchants, navies, pirates, monsters |
| 65 | captain | AI captain: attract mode and autopilot orders |
| 70 | economy | Goods, prices, supply, contracts |
| 75 | factions | Nations, standing, war and peace, League of Captains |
| 78 | career | Fame, Ladder of Famous Captains, milestones |
| 80 | ui | HUD, port screens (2D), menus, pixel font |
| 85 | audio | Effects synth and the shanty engine |
| 90 | main | Cameras, input, save/load, main loop |

**Saves:** a 2–4 hour career needs real saves, unlike Cinderwatch's best-wave score. Autosave in `localStorage` on every docking, with 3 slots and export/import as a file, so a browser wipe doesn't lose a career.

**Size watch:** three.js is about 0.7 MB. Aim to keep the whole file under 2 MB.

## Scope and milestones

**v1 = one region with about 6 islands, sailing, trade, ship combat, boarding, one boss captain and the AI captain.** Each milestone below leaves something playable you can see in the browser.

1. **Sea and sloop:** the build script, the water shader, sky and wind, one ship sailing on WASD, and the chase camera.
2. **Islands:** a seeded archipelago, click-to-sail, and the chart camera with wheel zoom.
3. **Look pass:** dither, tilt-shift, grain, day-night, lanterns. This is the moment it starts to feel like Black Tide.
4. **Broadsides:** cannons, the three shot types, damage bars and sinking against one dummy ship.
5. **Traffic and boarding:** merchant and pirate AI ships, the odds bar, the boarding roll and animation, loot.
6. **Ports:** docking, the 2D port screen, market buy/sell, shipwright repair.
7. **AI captain:** attract mode on load, take the helm, hand back, the three autopilot orders.
8. **Career:** gold to upgrades, fame, the Ladder of Famous Captains, the boss captain, autosave.
9. **Sound:** effects and the shanty engine.
10. **Ship it:** a GitHub repo, GitHub Pages, a README with a GIF.

**Later (v2+):** all four nations with war and peace, the League of Captains, fleets of up to 4, storms, sea monsters, more regions, deck camera polish, touch controls, and maybe town sacking.

**Decided (25 Nov)**

- **Title:** Black Tide.
- **Career:** endless. No credits; the Ladder keeps going and rivals keep climbing back.
- **Losing your ship:** you wash up in the nearest port with half your gold and a free sloop.
- **Shanty lyrics:** shown on screen as captions while a shanty plays, with a toggle to hide them.
