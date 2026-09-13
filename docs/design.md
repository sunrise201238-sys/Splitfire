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
  its arc by default; the player can ignite it earlier. Early splits spread wider by the time they
  arrive (a wall to intercept with); apex splits stay tighter (a punch).
- **Annihilation**: opposing shells that touch cancel mass for mass. An unsplit shell's mass is
  its child count; children have mass 1. Whatever survives hits the enemy hull for its mass.
- **Ammo and cooldown**: ×5 unlimited / 2 s, ×10 ten shots / 5 s, ×20 five shots / 10 s. One
  launcher, so the cooldown is global. These numbers are a first draft; tune after playtesting.
- **Movement**: drag from your own ship to a destination inside a bounded box. Slow, and it spends
  limited fuel. Reasons to move: dodge a fan, change the geometry of the exchange.
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

Default is the full battlefield. The player can zoom (wheel, pinch) and pan (right drag,
two-finger drag); any manual camera input leaves director mode. Director mode ("AUTO CAM") frames
the union of interesting things: shells in flight, recent splits, annihilation sparks, hull hits,
with hysteresis and a minimum dwell so it does not jitter. While the player is aiming, the
director frames the preview instead. Off-screen enemy shells get edge arrows when zoomed in.

## Visual rules

- Three colors: you (blue), enemy (red), neutral. No textures, no text during play.
- Progressive disclosure: the IGNITE button only exists while you have an unsplit shell in the
  air; the fuel bar only appears while moving or dragging your ship.
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

- Ship HP (50), child damage (1), fuel (100 at 0.25 per unit) and debris HP (8) are placeholders.
- Whether ×10 and ×20 need equal-or-better throughput than ×5 to feel worth spending.
- Whether debris should also damage ships on contact.
