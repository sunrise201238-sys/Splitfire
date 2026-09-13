import type { MunitionKind } from './munitions';
import type { Rng } from './rng';

export type PlayerId = 0 | 1;

export interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Ship {
  player: PlayerId;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  fuel: number;
  maxFuel: number;
  /** Ticks until the launcher can fire again. */
  cooldown: number;
  /** Remaining shots for finite munitions. Unlimited kinds are absent. */
  ammo: Partial<Record<MunitionKind, number>>;
  /** Movement destination, or null when idle. */
  target: { x: number; y: number } | null;
  bounds: Bounds;
  alive: boolean;
}

export interface Shell {
  id: number;
  owner: PlayerId;
  kind: MunitionKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Children remaining (unsplit shell) or 1 (child). Annihilation subtracts from it. */
  mass: number;
  radius: number;
  /** True until the shell splits into children. */
  parent: boolean;
  age: number;
}

export interface Debris {
  id: number;
  x: number;
  y: number;
  vy: number;
  hp: number;
  radius: number;
  seed: number;
}

/** A point-source gravity modifier. Reserved for future gravity weapons. */
export interface GravityMod {
  x: number;
  y: number;
  /** Acceleration at distance `radius`; falls off with the inverse square. Negative repels. */
  strength: number;
  radius: number;
  untilTick: number;
}

export type Input =
  | { type: 'fire'; player: PlayerId; kind: MunitionKind; vx: number; vy: number }
  | { type: 'ignite'; player: PlayerId }
  | { type: 'move'; player: PlayerId; x: number; y: number };

export type SimEvent =
  | { type: 'fire'; player: PlayerId; kind: MunitionKind; x: number; y: number }
  | { type: 'split'; player: PlayerId; kind: MunitionKind; x: number; y: number; count: number }
  | { type: 'annihilate'; x: number; y: number; mass: number }
  | { type: 'shipHit'; player: PlayerId; x: number; y: number; damage: number }
  | { type: 'shipDestroyed'; player: PlayerId; x: number; y: number }
  | { type: 'debrisHit'; x: number; y: number }
  | { type: 'debrisDestroyed'; x: number; y: number }
  | { type: 'moveStart'; player: PlayerId }
  | { type: 'moveEnd'; player: PlayerId; outOfFuel: boolean };

export interface World {
  tick: number;
  seed: number;
  rng: Rng;
  gravity: { gx: number; gy: number };
  gravityMods: GravityMod[];
  ships: [Ship, Ship];
  shells: Shell[];
  debris: Debris[];
  nextId: number;
  nextDebrisTick: number;
  /** Events produced by the most recent step. Cleared at the start of every step. */
  events: SimEvent[];
  winner: PlayerId | null;
}
