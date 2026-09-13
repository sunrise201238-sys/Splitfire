# Splitfire design notes

Status: local build. This records the decisions made before and during the first implementation,
so later work does not re-litigate them.

## Origin

The starting point was a screen recording of a castle-siege ad: two castles trade streams of
missiles across a gap that holds fixed multiplier gates (×10, ×20, ×50). Whatever passes a gate is
multiplied, both sides use the same gates, and the two streams annihilate each other one for one
where they meet. The visible collision front is the state of the fight.

Two things from that clip carry over: the multiplier is always available, and friendly and enemy
fire cancel each other out. Everything else is redesigned for a space setting.

## Core rules

- **Two battleships**, one per player, side by side and heading the same way. The simulation runs
  in the ships' co-moving frame, so both ships are stationary in it; forward motion is shown by
  the star field and by debris drifting backward.
- **Fixed gravity** pulls shells toward the bottom of the screen (the planet below). Aim is a
  pull-back drag; the preview shows the arc, the split point, the child fan and the landing band.
- **Cluster munitions** replace the multiplier gates. A shell splits into children at the apex of
  its arc by default; the player can split it earlier with a tap anywhere. Early splits spread
  wider by the time they arrive (a wall to intercept with); apex splits stay tighter (a punch).
- **Salvos.** One trigger pull launches four shells a sixth of a second apart, each slightly
  slower than the last, and each splits on its own. That is the "group of missiles, each of which
  spreads" look of the original clip. A tap splits every shell already in the air; shells still
  waiting to launch split at their own apex unless tapped again.
- **Streams, not walls.** The fan is narrow (0.2 to 0.36 rad) and the children fly at speeds
  spread across ±20% of the parent's, so a split strings out along the path like the missile
  streams in the original clip. An unsplit shell is drawn as a bundle of missiles in formation.
- **Tempo.** Gravity 120 and launch speeds 110 to 430 give a flight of roughly four seconds, with
  the director camera on by default so streams are followed at a modest zoom.
- **Annihilation**: opposing shells that touch cancel mass for mass. An unsplit shell's mass is
  its child count; children have mass 1. Whatever survives hits the enemy hull for its mass.
- **Ammo and cooldown**: ×5 unlimited / 2 s, ×10 ten shots / 5 s, ×20 five shots / 10 s. One
  launcher, so the cooldown is global. These numbers are a first draft; tune after playtesting.
- **Movement**: press MOVE, then tap or drag a destination inside a bounded box. Slow, and it
  spends limited fuel. Reasons to move: dodge a fan, change the geometry of the exchange.
  (Dragging from the ship was tried first and rejected in playtesting: everyone drags from the
  ship expecting to fire, so every drag anywhere, ship included, is now an aim.)
- **Orbital debris** drifts through the middle band, blocks shells (absorbing their mass) and can
  be destroyed. It is the soft version of the gap terrain in the original.
- **Victory**: the enemy hull's HP reaches zero.

## Architecture

One deterministic simulation core, three input sources: local human, local bot, remote human.

- `packages/sim` steps a `World` at a fixed 30 Hz. Inputs are three sparse events: `fire`,
  `ignite`, `move`. The step is deterministic across JavaScript engines: no `Math.sin`/`cos`/
  `atan2`/`pow`/`random`; own polynomial trig, mulberry32 RNG, fixed processing order. A state
  hash (`hashWorld`) exists for desync checks.
- Gravity is a queryable field (`gravityAt`), uniform by default, with a list of point-source
  modifiers reserved for future gravity weapons. The aim preview and the bot use the same
  integrator as the simulation, so they stay correct when the field changes.
- Munitions are rows in a table (`MUNITIONS`), not code paths.
- `packages/bot` samples candidate shots with the preview integrator, scores them against the
  enemy's position (and its declared destination), dodges predicted landing bands, ignites early
  to intercept, and budgets finite ammo. Difficulty is aim noise plus reaction delay.
- `packages/client` is Canvas 2D drawn in code (no image assets), which keeps the visuals flat and
  the first load instant. Rendering, camera, effects and the star field are strictly render-side.

## Camera

Director mode ("AUTO CAM") is on by default and frames the union of interesting things: shells
in flight and the ship they fly toward, recent splits, annihilation sparks, hull hits, with
hysteresis and a minimum dwell so it does not jitter. Zoom is capped at 1.7 so the field never
disappears. The player can zoom (wheel, pinch) and pan (right drag, two-finger drag); any manual
camera input leaves director mode. While the player is aiming, the
director frames the preview instead. Off-screen enemy shells get edge arrows when zoomed in.

## Visual rules

- Three colors: you (blue), enemy (red), neutral. No textures, no text during play.
- No split button: a tap anywhere splits, and a hint at the bottom says so for the first three
  salvos. The fuel bar only appears in move mode or while moving; the MOVE chip carries a small
  fuel gauge at all times.
- The aim preview is one solid arc to a labelled split point, a filled fan showing everything the
  split can reach, and a bracket at the enemy's altitude for where the children land.
- Mockups that set the style live in `docs/mockups/`.

## Online plan (not built yet)

Two Render services: a static site for the client (always on) and a free-tier web service for the
relay (sleeps when idle). The client's ONLINE button pings the health endpoint and shows progress
while the server wakes, then opens a WebSocket. The server only matches room codes and relays
tick-stamped inputs; no accounts, no database, no reconnection beyond "opponent left". Clients run
the simulation in lockstep with a small input delay; the ignite action will feel about 100 to
150 ms late online, accepted in exchange for keeping the server trivial. Player 2's view is
mirrored so everyone sees themselves on the left in blue.

## Open tuning questions

- Ship HP (200), child damage (1), fuel (100 at 0.25 per unit) and debris HP (8) are placeholders.
  Bot-vs-bot matches run 80 to 125 s with these values.
- Whether ×10 and ×20 need equal-or-better throughput than ×5 to feel worth spending.
- Whether debris should also damage ships on contact.
