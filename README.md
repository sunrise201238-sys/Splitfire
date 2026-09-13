# Splitfire

A space battleship duel built around cluster munitions. Two ships fly side by side in low orbit
and lob shells at each other. Every shell splits into a fan of children at the top of its arc,
or earlier if you ignite it. Opposing shells cancel each other mass for mass, so the fight is a
tug of war between two streams of fire, and the wall of children you put in the air is both your
attack and your shield.

Runs in the browser. Local mode against an AI opponent is playable now; online play against
another person is planned (see the roadmap).

## Play

```
npm install
npm run dev
```

Open the printed URL. Landscape works best; the battlefield is letterboxed on other aspect ratios.

| Action | Mouse / keyboard | Touch |
| --- | --- | --- |
| Aim and fire | Drag anywhere (pull back like a slingshot), release | Same |
| Choose munition | Click a chip, or keys 1 2 3 | Tap a chip |
| Ignite early | IGNITE button, or Space | Tap IGNITE |
| Move your ship | Drag starting on your ship | Same |
| Zoom | Mouse wheel | Pinch |
| Pan | Right-button drag | Two-finger drag |
| Director camera | AUTO CAM chip, or C | Tap AUTO CAM |
| Reset view | R | |

Munitions: ×5 is unlimited with a 2 s cooldown, ×10 has 10 shots and a 5 s cooldown, ×20 has
5 shots and a 10 s cooldown. The launcher is shared, so firing anything starts that munition's
cooldown. Fuel is limited; moving spends it.

## Repository layout

```
packages/sim     Deterministic simulation. No DOM, no Math.sin/cos/random. Fixed 30 Hz step.
packages/bot     AI opponent. Produces the same inputs a player would.
packages/client  Browser client: Canvas 2D renderer, input, camera, HUD. Vite app.
docs/            Design notes and mockups.
```

The simulation is the single source of truth for physics, for the aim preview and for the bot:
all three run the same integrator, so the preview never lies and the AI plays by the rules.

Commands: `npm run dev`, `npm run build`, `npm test`, `npm run typecheck`, `npm run check` (all three).

## Roadmap

1. **Local** (this build): ship duel vs AI, three munitions, early ignite, movement with fuel,
   orbital debris, manual and director camera.
2. **Online**: a small WebSocket relay on Render's free tier. The client wakes the server on
   demand, then both players run the deterministic simulation in lockstep and only exchange inputs.
3. **Later**: gravity-changing weapons (the gravity field and munition table are already
   data-driven), supply drops, replay and spectator views built on the director camera.

See `docs/design.md` for the design decisions behind all of this.
