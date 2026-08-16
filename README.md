# ASCII City

A seeded, walkable first-person **ASCII cyberpunk city**. Characters *are* the texels: neon glyphs on black, rendered by a 2.5D textured DDA raycaster. Vanilla HTML, CSS, and JavaScript — no libraries, no bundler.

Click the view to pointer-lock, then walk the rain.

## Run

Serve the folder over HTTP (ES modules will not load from `file://`):

```bash
python3 -m http.server 8765
```

Open [http://127.0.0.1:8765/](http://127.0.0.1:8765/). Any static server works.

## Controls

| Input | Action |
| --- | --- |
| **WASD** / arrows | Move |
| **Shift** | Sprint |
| **Mouse** | Look (X is inverted; extra pitch for looking up at towers) |
| **Esc** | Release pointer lock |
| **M** | Toggle minimap |
| **K** | Mute / unmute |

Click the overlay or canvas to jack in. Audio starts on first click.

## URL parameters

| Param | Effect |
| --- | --- |
| `?seed=847293` | Deterministic city. Omit to get a random seed (written into the URL). |
| `?preview=1` | Hide the overlay and run the sim without pointer lock (screenshots / smoke). |
| `?x=&y=` | Spawn at a map position (only if both are non-empty numbers). |
| `?yaw=` | Initial look direction in radians. |

Example: `http://127.0.0.1:8765/?seed=847293`

Cache-bust query strings on script tags (`?v=brake1`, etc.) are for local iteration, not part of the public API.

## What v0.1 includes

- **2.5D DDA raycaster** — one ray per character column, ASCII facade textures, variable building heights, floor casting, face shading, distance fog, y-shear pitch
- **Seeded downtown** — 96×96 map, avenues and side streets, lots, parks, alleys, a plaza, neon strips, window patterns, roof masts / dishes
- **Look-only skybridges** — narrow glass tubes between facing lots of similar height; walk under them; not solid
- **Street life** — shop signs with readable labels, traffic lights, moving and parked cars, pedestrians, vendors, dumpsters, park trees, a statue, overhead cables
- **Traffic** — cars stay on streets, stop for red/yellow lights, brake for the player (and honk once), brake for the car ahead (no honk)
- **People** — sidewalks and parks, sidestep instead of walking through you
- **Night pulse** — shared breath/buzz for wet asphalt, neon chatter, headlight cones on the road, rain, rare thunder
- **Audio** — rain, drone, neon buzz, car whoosh, honk, thunder (`K` mutes)
- **HUD** — seed, FPS, looked-at sign label, 15×15 minimap

## Architecture

Locked on purpose: **not** Three.js, voxels, or true 3D. A Wolfenstein-style raycaster with a glyph atlas on Canvas 2D (`drawImage`, no `fillText` in the frame loop).

| File | Role |
| --- | --- |
| `index.html` / `style.css` | Shell, overlay, scanlines, vignette |
| `js/main.js` | Boot, URL seed, game loop |
| `js/rng.js` | Seeded RNG, hashes, noise |
| `js/display.js` | Palette, glyph atlas, framebuffer blit |
| `js/city.js` | Map generation, collision, skybridge spans |
| `js/raycast.js` | Walls, floors, skybridges, rain, minimap |
| `js/player.js` | WASD + mouse, slide collision, unstick |
| `js/input.js` | Pointer lock, keys |
| `js/sprites.js` | Signs, traffic, peds, props, car AI |
| `js/night.js` | Shared night pulse |
| `js/audio.js` | Web Audio ambience |

Sprite kinds: sign `0`, signal `1`, car `2`, ped `3`, beam `4`, tree `5`, vendor `6`, dumpster `7`, statue `8`.

Floors: street `0`, sidewalk `1`, park `2`, alley `3`, plaza `4`.

## Out of scope (v0.1)

Interiors, a day/night sun cycle, intersection queues, walkable bridges, district-name HUD.

## License

Source is provided as-is for this prototype. No license file yet.
