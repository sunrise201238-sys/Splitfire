export type MunitionKind = 'x5' | 'x10' | 'x20';

export interface MunitionDef {
  kind: MunitionKind;
  /** Number of children the shell splits into. Also the shell's mass before it splits. */
  children: number;
  /** Ticks between shots of this kind (the launcher is shared, so this gates every kind). */
  cooldownTicks: number;
  /** Shots per match, or null for unlimited. */
  ammo: number | null;
  /** Full angular spread of the fan, in radians. */
  spread: number;
  /** Collision radius of the unsplit shell. */
  radius: number;
  /** Shells launched per trigger pull, one after another. Each splits on its own. */
  salvo: number;
}

export const TICK_RATE = 30;
export const DT = 1 / TICK_RATE;

const sec = (s: number) => Math.round(s * TICK_RATE);

/**
 * Munition table. New kinds (and future exotic weapons) are rows here, not code.
 */
export const MUNITIONS: Record<MunitionKind, MunitionDef> = {
  x5: { kind: 'x5', children: 5, cooldownTicks: sec(2), ammo: null, spread: 0.2, radius: 7, salvo: 4 },
  x10: { kind: 'x10', children: 10, cooldownTicks: sec(5), ammo: 10, spread: 0.28, radius: 8, salvo: 4 },
  x20: { kind: 'x20', children: 20, cooldownTicks: sec(10), ammo: 5, spread: 0.36, radius: 9, salvo: 4 },
};

export const MUNITION_KINDS: MunitionKind[] = ['x5', 'x10', 'x20'];

export const CHILD_RADIUS = 4;
export const CHILD_MASS = 1;

/**
 * Children of a split fly at different speeds so the fan strings out along the path
 * like a stream of missiles rather than a wall. The slowest child flies at
 * (1 - STREAM_SPEED_SPREAD / 2) of the parent's speed, the fastest at (1 + ... / 2).
 */
export const STREAM_SPEED_SPREAD = 0.4;

/** Ticks between the shells of one salvo. */
export const SALVO_SPACING_TICKS = 5;
/** Each later shell of a salvo flies this much slower than the one before, so the group strings out. */
export const SALVO_SPEED_STEP = 0.025;
