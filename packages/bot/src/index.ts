import {
  DT,
  MUNITIONS,
  MUNITION_KINDS,
  SHIP_HULL,
  canFire,
  dcos,
  dsin,
  launchPoint,
  predictCrossing,
  previewShot,
  type Input,
  type MunitionKind,
  type PlayerId,
  type World,
} from '@splitfire/sim';

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface BotConfig {
  /** Random angular error added to every shot, in radians. */
  aimNoise: number;
  /** Ticks the bot waits after the launcher is ready before it fires. */
  reactionTicks: number;
  /** Whether the bot moves out of incoming fans. */
  dodge: boolean;
  /** Whether the bot ignites clusters early to intercept incoming fire. */
  intercept: boolean;
  /** Ticks between decisions. */
  thinkEvery: number;
}

export const DIFFICULTY: Record<Difficulty, BotConfig> = {
  easy: { aimNoise: 0.14, reactionTicks: 36, dodge: false, intercept: false, thinkEvery: 8 },
  normal: { aimNoise: 0.06, reactionTicks: 14, dodge: true, intercept: true, thinkEvery: 6 },
  hard: { aimNoise: 0.02, reactionTicks: 4, dodge: true, intercept: true, thinkEvery: 4 },
};

export interface Bot {
  readonly player: PlayerId;
  /** Call once per simulation tick, before stepping. Returns the inputs to apply this tick. */
  update(world: World): Input[];
}

interface Candidate {
  vx: number;
  vy: number;
  score: number;
}

// The bot needs its own randomness; it must not touch the world RNG.
function makeRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HULL_HALF_WIDTH = 24;
const HULL_TOP = SHIP_HULL[0][1] - SHIP_HULL[0][2];

export function createBot(player: PlayerId, difficulty: Difficulty | BotConfig = 'normal', seed = 42): Bot {
  const cfg: BotConfig = typeof difficulty === 'string' ? DIFFICULTY[difficulty] : difficulty;
  const rnd = makeRandom(seed);
  const enemyId: PlayerId = player === 0 ? 1 : 0;
  let readySince = -1;
  let lastMoveTick = -1000;
  let lastIgniteTick = -1000;

  function pickKind(world: World): MunitionKind {
    const me = world.ships[player];
    const enemy = world.ships[enemyId];
    const usable = MUNITION_KINDS.filter((k) => canFire(me, k));
    if (usable.length === 0) return 'x5';
    const hpFrac = enemy.hp / enemy.maxHp;
    const r = rnd();
    // Bigger clusters when the enemy sits still or is weak; otherwise keep the rhythm with x5.
    const still = enemy.target === null;
    if (usable.includes('x20') && (hpFrac < 0.35 || (still && r < 0.2))) return 'x20';
    if (usable.includes('x10') && (hpFrac < 0.6 || r < 0.35)) return 'x10';
    return 'x5';
  }

  function enemyFuturePos(world: World): { x: number; y: number } {
    const enemy = world.ships[enemyId];
    return enemy.target ?? { x: enemy.x, y: enemy.y };
  }

  function aim(world: World, kind: MunitionKind): { vx: number; vy: number } | null {
    const goal = enemyFuturePos(world);
    const dir = enemyId === 1 ? 1 : -1;
    let best: Candidate | null = null;
    // Sample launch angles (from horizontal, toward the enemy) and speeds.
    for (let ai = 0; ai < 9; ai++) {
      const ang = 0.45 + (ai / 8) * 0.75; // 26° .. 69°
      for (let si = 0; si < 6; si++) {
        const speed = 380 + si * 60;
        const vx = dir * speed * dcos(ang);
        const vy = -speed * dsin(ang);
        const pv = previewShot(world, player, vx, vy, kind);
        if (!pv.landing) continue;
        const cx = (pv.landing.x0 + pv.landing.x1) * 0.5;
        const width = pv.landing.x1 - pv.landing.x0;
        let score = -Math.abs(cx - goal.x);
        if (pv.blocked) score -= 400;
        // Prefer fans that cover the hull rather than tight ones that might all miss.
        if (width < HULL_HALF_WIDTH * 2) score -= 20;
        if (!best || score > best.score) best = { vx, vy, score };
      }
    }
    if (!best) return null;
    // Aim noise: rotate the launch vector by a random angle.
    const noise = (rnd() - 0.5) * 2 * cfg.aimNoise;
    const c = dcos(noise);
    const s = dsin(noise);
    return { vx: best.vx * c - best.vy * s, vy: best.vx * s + best.vy * c };
  }

  interface Threat {
    x: number;
    ticks: number;
    mass: number;
  }

  function incomingAt(world: World, y: number): Threat[] {
    const out: Threat[] = [];
    for (const s of world.shells) {
      if (s.owner === player || s.mass <= 0) continue;
      const c = predictCrossing(world, s, y, 240);
      if (c) out.push({ x: c.x, ticks: c.ticks, mass: s.mass });
    }
    return out;
  }

  function threatsOn(threats: Threat[], x: number): number {
    let m = 0;
    for (const t of threats) if (Math.abs(t.x - x) < HULL_HALF_WIDTH + 6) m += t.mass;
    return m;
  }

  function considerDodge(world: World): Input | null {
    const me = world.ships[player];
    if (me.target || me.fuel < 8 || world.tick - lastMoveTick < 45) return null;
    const threats = incomingAt(world, me.y + HULL_TOP);
    const here = threatsOn(threats, me.x);
    if (here < 3) return null;
    const soonest = Math.min(...threats.map((t) => t.ticks));
    if (soonest < 12) return null; // too late to matter
    let best: { x: number; y: number; m: number; cost: number } | null = null;
    for (const dx of [-120, -80, 80, 120]) {
      const x = Math.min(Math.max(me.x + dx, me.bounds.x0), me.bounds.x1);
      if (Math.abs(x - me.x) < 30) continue;
      const m = threatsOn(threats, x);
      const cost = Math.abs(x - me.x);
      if (!best || m < best.m || (m === best.m && cost < best.cost)) best = { x, y: me.y, m, cost };
    }
    if (!best || best.m >= here) return null;
    lastMoveTick = world.tick;
    return { type: 'move', player, x: best.x, y: best.y };
  }

  function considerIgnite(world: World): Input | null {
    if (world.tick - lastIgniteTick < 10) return null;
    const mine = world.shells.filter((s) => s.owner === player && s.parent && s.mass > 0);
    if (mine.length === 0) return null;
    for (const p of mine) {
      // Enemy shells ahead of this shell, within the range a fan would cover after splitting.
      for (const e of world.shells) {
        if (e.owner === player || e.mass <= 0) continue;
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        const ahead = dx * p.vx + dy * p.vy > 0;
        if (!ahead) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 < 170 * 170 && (e.mass >= 3 || e.parent)) {
          lastIgniteTick = world.tick;
          return { type: 'ignite', player };
        }
      }
    }
    return null;
  }

  return {
    player,
    update(world: World): Input[] {
      const me = world.ships[player];
      if (!me.alive || world.winner !== null) return [];
      const inputs: Input[] = [];
      if (world.tick % cfg.thinkEvery !== 0) return inputs;

      if (cfg.dodge) {
        const mv = considerDodge(world);
        if (mv) inputs.push(mv);
      }
      if (cfg.intercept) {
        const ig = considerIgnite(world);
        if (ig) inputs.push(ig);
      }

      if (me.cooldown === 0) {
        if (readySince < 0) readySince = world.tick;
        if (world.tick - readySince >= cfg.reactionTicks) {
          const kind = pickKind(world);
          const v = aim(world, kind);
          if (v) {
            inputs.push({ type: 'fire', player, kind, vx: v.vx, vy: v.vy });
            readySince = -1;
          }
        }
      } else {
        readySince = -1;
      }
      return inputs;
    },
  };
}

export { DT, launchPoint };
