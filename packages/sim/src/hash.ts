import type { World } from './types';

/** FNV-1a over the quantized simulation state. Two clients in lockstep must agree on it. */
export function hashWorld(w: World): number {
  let h = 0x811c9dc5;
  const mixInt = (q: number) => {
    h ^= q & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (q >>> 8) & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (q >>> 16) & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (q >>> 24) & 0xff;
    h = Math.imul(h, 0x01000193);
  };
  const mix = (v: number) => mixInt(Math.round(v * 1000) | 0);
  mixInt(w.tick);
  mixInt(w.rng.s);
  mixInt(w.winner === null ? -1 : w.winner);
  for (const s of w.ships) {
    mix(s.x);
    mix(s.y);
    mix(s.hp);
    mix(s.fuel);
    mixInt(s.cooldown);
    mixInt(s.alive ? 1 : 0);
    mixInt(s.ammo.x10 ?? -1);
    mixInt(s.ammo.x20 ?? -1);
    mixInt(s.target ? 1 : 0);
    if (s.target) {
      mix(s.target.x);
      mix(s.target.y);
    }
  }
  for (const s of w.shells) {
    mixInt(s.id);
    mixInt(s.owner);
    mix(s.x);
    mix(s.y);
    mix(s.vx);
    mix(s.vy);
    mix(s.mass);
    mixInt(s.parent ? 1 : 0);
  }
  for (const d of w.debris) {
    mixInt(d.id);
    mix(d.x);
    mix(d.y);
    mix(d.hp);
  }
  return h >>> 0;
}
