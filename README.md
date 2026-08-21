# Bug Free

A vertical platformer about vibe coding. You're an LLM climbing from an empty file to a
deployed app, and the code you're standing on gets buggier the more ambitious the project
gets. Touch a bug and the run ends with a stack trace.

You never press jump. The climb is automatic — you bounce the instant you land, always to
the same height — and the only thing you control is which way you're drifting when you come
back down. One input, so a keyboard, a tablet and a thumb all play the same game.

Zero dependencies, zero build step, zero assets — plain ES modules, one `<canvas>`, and
every sound synthesised at runtime with WebAudio. Open `index.html` and it runs.

> The game's interface is in Spanish; the code and this README are in English.

## Play

```bash
git clone https://github.com/jorge-erdb/bug-free.git
cd bug-free
python3 -m http.server 8000    # or: npx http-server
```

Then open <http://localhost:8000>.

A static server is required — the game uses ES modules, which browsers refuse to load over
`file://`. Any static host works; `.nojekyll` is included so GitHub Pages serves the
`src/` directory untouched.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Steer | `←` `→` or `A` `D` | hold the left or right half of the screen |
| Jump | *automatic* | *automatic* |
| Restart | `R` | the **reintentar** button |
| Pause | `Esc` or `P` | the ⏸ button, top right |
| Confirm / back | `Space`, `Enter`, `Esc` | tap a menu row or an on-screen button |

Every bounce is identical: a peak rise of ~141px over ~0.78s airborne, during which you can
steer about 203px horizontally. Those three numbers are the whole movement model, and they
are what the generator's limits are derived from — the widest gap it can build is 112px
vertically and 170px horizontally, so both sit comfortably inside one bounce.

Touch play has no on-screen D-pad and no control band. The entire screen is the control,
split down the middle, which keeps the playfield unobstructed on a phone.

## Modes

**Campaign** — five levels, each a project you ship. Every level introduces exactly one new
mechanic and never takes one away.

| Level | Introduces |
| --- | --- |
| `hello_world.py` | nothing but the jump — no hazards at all |
| `todo-app` | moving platforms, crawler bugs |
| `portfolio-site` | crumbling platforms |
| `rest-api` | null-pointer bugs that drop from above |
| `multiplayer-game` | buggy platforms that spawn bugs, infinite-loop bugs |

Finishing a level unlocks the next one. Progress persists in `localStorage`.

**Endless** — one procedurally generated climb with no finish line. Difficulty ramps over
roughly twelve screens, then plateaus. Score is distance climbed plus 25 per `{}` token, and
the best run is saved.

## Hazards and pickups

| | |
| --- | --- |
| 🟩 green platform | solid |
| 🟦 blue platform | moves horizontally |
| 🟧 amber platform | starts crumbling the moment you touch it — single use |
| 🟥 red platform | periodically spawns bugs |
| `e` crawler | patrols its platform — threatens the landing itself |
| `∅` null pointer | hangs beneath a platform, drops when you pass below it on screen |
| `∞` infinite loop | spins in place, making its platform a no-go |
| `{}` token | +25 score, placed slightly off the safe route |
| `git revert` | freezes every bug for 3 seconds |

## How it fits together

```
index.html          canvas + module entry point
styles.css          page chrome only — everything else is drawn on the canvas
src/
  main.js           boot, screen state machine, input routing
  save.js           localStorage persistence, validating every read
  data/
    tuning.js       every physics and difficulty constant, in one file
    levels.js       the campaign, as data
  engine/
    loop.js         fixed 60Hz timestep, decoupled from render rate
    render.js       canvas setup, DPR scaling, palette, draw helpers
    input.js        keyboard + touch normalised into one action map
    audio.js        WebAudio blips, no audio files
    rng.js          seeded mulberry32
  game/
    world.js        the simulation: entity lists, step order, win/death
    generator.js    builds layouts for both modes
    player.js       steering, and the automatic bounce
    platform.js     the four platform variants
    bug.js          the three hazard types
    token.js        score tokens and the git-revert power-up
    collision.js    one-way AABB landing resolution
    camera.js       ratcheting follow camera
    background.js   the editor gutter backdrop
  ui/
    hud.js          in-run status bar and touch zones
    screens.js      menus and overlays
test/               headless node harnesses
```

A few decisions worth knowing before changing anything:

**All tuning lives in `data/tuning.js`.** Nothing else hardcodes a physics or difficulty
constant. Retuning game feel means editing that file and refreshing.

**The simulation is headless.** `world.js` and everything under `game/` touch no browser
APIs — the simulation reports feedback as string events (`'jump'`, `'death'`, …) and
`main.js` turns those into sound. That's what lets the test harnesses run the real game code
under node with no DOM.

**Reachability is structural, not checked afterwards.** Every platform is placed within the
generator's vertical and horizontal caps of the previous one, and those caps are derived from
the bounce arc rather than guessed. There is no such thing as an impossible generated gap.
With no jump button the horizontal cap matters as much as the vertical one: steering is the
only control, so an arc has to be able to *reach* the next platform sideways.

**Bugs can never seal the only route.** The climb is a chain, so a bug on a chain platform
would block the sole path. Whenever a route-blocking bug is placed, a clear bypass platform is
added at the same height; if no bypass fits, the bug isn't placed at all.

**The camera only ever scrolls up.** Its bottom edge is a moving death plane, which is also
what makes culling safe — anything below it is unreachable by definition.

## Tests

```bash
test/run.sh
```

Plain node against the source modules, no dependencies and no test framework.

| Suite | Checks |
| --- | --- |
| `looptest` | the simulation runs at 60Hz from 30 to 144fps, and a long stall is discarded rather than replayed |
| `verify` | the measured bounce envelope clears every gap the generator can produce, vertically and horizontally |
| `reachability` | a safe route to the finish exists on every campaign level, across 300 seeds of the hardest one, and deep into endless runs |
| `playtest` | a bot plays each level end to end using only steering; entity lists stay bounded over a 68s endless climb |
| `savetest` | progress and high scores survive reloads, and corrupt or blocked storage degrades to a valid save |

## Deploying to GitHub Pages

Settings → Pages → Source: *Deploy from a branch*, branch `main`, folder `/ (root)`. There's
nothing to build.

## License

MIT — see [LICENSE](LICENSE).
