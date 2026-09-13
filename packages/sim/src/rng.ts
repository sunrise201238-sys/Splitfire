// mulberry32: tiny seeded PRNG built from integer ops only, so it is deterministic everywhere.

export interface Rng {
  s: number;
}

export function createRng(seed: number): Rng {
  return { s: seed | 0 };
}

export function rngNext(r: Rng): number {
  r.s = (r.s + 0x6d2b79f5) | 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function rngRange(r: Rng, lo: number, hi: number): number {
  return lo + (hi - lo) * rngNext(r);
}

export function rngInt(r: Rng, lo: number, hi: number): number {
  return lo + Math.floor(rngNext(r) * (hi - lo + 1));
}
