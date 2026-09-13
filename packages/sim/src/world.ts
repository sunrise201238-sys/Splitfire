import { clamp, len, rotate } from './dmath';
import { CHILD_MASS, CHILD_RADIUS, DT, MUNITIONS, type MunitionKind } from './munitions';
import { WORLD_H, WORLD_W, integrate, outOfField } from './physics';
import { createRng, rngInt, rngRange } from './rng';
import type { Bounds, Debris, Input, PlayerId, Shell, Ship, World } from './types';

export const SHIP_MAX_HP = 50;
export const SHIP_MAX_FUEL = 100;
export const SHIP_MOVE_SPEED = 70; // units per second
export const FUEL_PER_UNIT = 0.25; // fuel spent per unit of distance
export const SHIP_LAUNCH_OFFSET_Y = -38;
export const MIN_LAUNCH_SPEED = 150;
export const MAX_LAUNCH_SPEED = 700;
export const GRAVITY = 260;

/** Ship hull approximated by three circles: [offsetX, offsetY, radius]. */
export const SHIP_HULL: ReadonlyArray<readonly [number, number, number]> = [
  [0, -20, 14],
  [0, 8, 18],
  [0, 26, 13],
];

export const DEBRIS_MAX = 3;
export const DEBRIS_HP = 8;
export const DEBRIS_RADIUS = 26;
export const DEBRIS_SPEED = 40;

const SHIP_START: ReadonlyArray<{ x: number; y: number; bounds: Bounds }> = [
  { x: 260, y: 430, bounds: { x0: 150, y0: 250, x1: 420, y1: 600 } },
  { x: 1020, y: 430, bounds: { x0: 860, y0: 250, x1: 1130, y1: 600 } },
];

function createShip(player: PlayerId): Ship {
  const s = SHIP_START[player];
  const ammo: Ship['ammo'] = {};
  for (const def of Object.values(MUNITIONS)) {
    if (def.ammo !== null) ammo[def.kind] = def.ammo;
  }
  return {
    player,
    x: s.x,
    y: s.y,
    hp: SHIP_MAX_HP,
    maxHp: SHIP_MAX_HP,
    fuel: SHIP_MAX_FUEL,
    maxFuel: SHIP_MAX_FUEL,
    cooldown: 0,
    ammo,
    target: null,
    bounds: { ...s.bounds },
    alive: true,
  };
}

export function createWorld(seed: number): World {
  const rng = createRng(seed);
  return {
    tick: 0,
    seed,
    rng,
    gravity: { gx: 0, gy: GRAVITY },
    gravityMods: [],
    ships: [createShip(0), createShip(1)],
    shells: [],
    debris: [],
    nextId: 1,
    nextDebrisTick: rngInt(rng, 90, 180),
    events: [],
    winner: null,
  };
}

export function launchPoint(ship: Ship): { x: number; y: number } {
  return { x: ship.x, y: ship.y + SHIP_LAUNCH_OFFSET_Y };
}

export function canFire(ship: Ship, kind: MunitionKind): boolean {
  if (!ship.alive || ship.cooldown > 0) return false;
  const def = MUNITIONS[kind];
  if (def.ammo === null) return true;
  return (ship.ammo[kind] ?? 0) > 0;
}

/** Clamp a requested launch velocity into the allowed speed band. */
export function clampLaunch(vx: number, vy: number): { vx: number; vy: number } {
  const sp = len(vx, vy);
  if (sp === 0) return { vx: MIN_LAUNCH_SPEED, vy: 0 };
  const k = clamp(sp, MIN_LAUNCH_SPEED, MAX_LAUNCH_SPEED) / sp;
  return { vx: vx * k, vy: vy * k };
}

export function clampToBounds(b: Bounds, x: number, y: number): { x: number; y: number } {
  return { x: clamp(x, b.x0, b.x1), y: clamp(y, b.y0, b.y1) };
}

/** Speed multiplier pattern for child i of n. Deterministic and preview-friendly. */
export function childSpeedMul(i: number): number {
  const k = i % 3;
  return k === 0 ? 1 : k === 1 ? 1.06 : 0.94;
}

/** Child velocities for a shell split with the given remaining mass. */
export function childVelocities(
  kind: MunitionKind,
  vx: number,
  vy: number,
  count: number,
): Array<{ vx: number; vy: number }> {
  const def = MUNITIONS[kind];
  const out: Array<{ vx: number; vy: number }> = [];
  for (let i = 0; i < count; i++) {
    const a = count === 1 ? 0 : (i / (count - 1) - 0.5) * def.spread;
    const r = rotate(vx, vy, a);
    const m = childSpeedMul(i);
    out.push({ vx: r.x * m, vy: r.y * m });
  }
  return out;
}

function splitShell(world: World, shell: Shell, out: Shell[]): void {
  const count = Math.max(1, Math.round(shell.mass));
  const vels = childVelocities(shell.kind, shell.vx, shell.vy, count);
  for (const v of vels) {
    out.push({
      id: world.nextId++,
      owner: shell.owner,
      kind: shell.kind,
      x: shell.x,
      y: shell.y,
      vx: v.vx,
      vy: v.vy,
      mass: CHILD_MASS,
      radius: CHILD_RADIUS,
      parent: false,
      age: 0,
    });
  }
  world.events.push({ type: 'split', player: shell.owner, kind: shell.kind, x: shell.x, y: shell.y, count });
  shell.mass = 0; // consumed
}

function applyInput(world: World, input: Input): void {
  const ship = world.ships[input.player];
  if (!ship.alive) return;
  switch (input.type) {
    case 'fire': {
      if (!canFire(ship, input.kind)) return;
      const def = MUNITIONS[input.kind];
      const v = clampLaunch(input.vx, input.vy);
      const p = launchPoint(ship);
      world.shells.push({
        id: world.nextId++,
        owner: ship.player,
        kind: input.kind,
        x: p.x,
        y: p.y,
        vx: v.vx,
        vy: v.vy,
        mass: def.children,
        radius: def.radius,
        parent: true,
        age: 0,
      });
      ship.cooldown = def.cooldownTicks;
      if (def.ammo !== null) ship.ammo[input.kind] = (ship.ammo[input.kind] ?? 0) - 1;
      world.events.push({ type: 'fire', player: ship.player, kind: input.kind, x: p.x, y: p.y });
      return;
    }
    case 'ignite': {
      const born: Shell[] = [];
      for (const s of world.shells) {
        if (s.owner === ship.player && s.parent && s.mass > 0) splitShell(world, s, born);
      }
      world.shells.push(...born);
      return;
    }
    case 'move': {
      const t = clampToBounds(ship.bounds, input.x, input.y);
      if (ship.fuel <= 0) return;
      ship.target = t;
      world.events.push({ type: 'moveStart', player: ship.player });
      return;
    }
  }
}

function stepShips(world: World): void {
  for (const ship of world.ships) {
    if (!ship.alive) continue;
    if (ship.cooldown > 0) ship.cooldown--;
    if (!ship.target) continue;
    const dx = ship.target.x - ship.x;
    const dy = ship.target.y - ship.y;
    const dist = len(dx, dy);
    if (dist < 0.01) {
      ship.target = null;
      world.events.push({ type: 'moveEnd', player: ship.player, outOfFuel: false });
      continue;
    }
    let stepDist = SHIP_MOVE_SPEED * DT;
    if (stepDist > dist) stepDist = dist;
    const fuelNeeded = stepDist * FUEL_PER_UNIT;
    if (ship.fuel < fuelNeeded) {
      // Spend what is left, then stop.
      const partial = ship.fuel / FUEL_PER_UNIT;
      ship.x += (dx / dist) * partial;
      ship.y += (dy / dist) * partial;
      ship.fuel = 0;
      ship.target = null;
      world.events.push({ type: 'moveEnd', player: ship.player, outOfFuel: true });
      continue;
    }
    ship.x += (dx / dist) * stepDist;
    ship.y += (dy / dist) * stepDist;
    ship.fuel -= fuelNeeded;
    if (stepDist >= dist) {
      ship.target = null;
      world.events.push({ type: 'moveEnd', player: ship.player, outOfFuel: false });
    }
  }
}

function stepDebris(world: World): void {
  if (world.tick >= world.nextDebrisTick) {
    world.nextDebrisTick = world.tick + rngInt(world.rng, 240, 420);
    if (world.debris.length < DEBRIS_MAX) {
      world.debris.push({
        id: world.nextId++,
        x: rngRange(world.rng, 470, 810),
        y: -60,
        vy: DEBRIS_SPEED,
        hp: DEBRIS_HP,
        radius: DEBRIS_RADIUS,
        seed: rngInt(world.rng, 1, 1_000_000_000),
      });
    }
  }
  for (const d of world.debris) d.y += d.vy * DT;
  world.debris = world.debris.filter((d) => d.hp > 0 && d.y < WORLD_H + 80);
}

function stepShells(world: World): void {
  const born: Shell[] = [];
  for (const s of world.shells) {
    if (s.mass <= 0) continue;
    const wasRising = s.vy < 0;
    integrate(world, s);
    s.age++;
    if (s.parent && wasRising && s.vy >= 0) splitShell(world, s, born);
    else if (s.parent && !wasRising && s.age === 1) splitShell(world, s, born); // launched downward: apex is the muzzle
  }
  world.shells.push(...born);
}

function circleHit(ax: number, ay: number, ar: number, bx: number, by: number, br: number): boolean {
  const dx = ax - bx;
  const dy = ay - by;
  const r = ar + br;
  return dx * dx + dy * dy < r * r;
}

function shipHitBy(ship: Ship, s: Shell): boolean {
  for (const [ox, oy, r] of SHIP_HULL) {
    if (circleHit(ship.x + ox, ship.y + oy, r, s.x, s.y, s.radius)) return true;
  }
  return false;
}

function stepCollisions(world: World): void {
  const shells = world.shells;
  // Shell vs shell: opposing owners annihilate mass for mass.
  for (let i = 0; i < shells.length; i++) {
    const a = shells[i];
    if (a.mass <= 0) continue;
    for (let j = i + 1; j < shells.length; j++) {
      const b = shells[j];
      if (b.mass <= 0 || b.owner === a.owner) continue;
      if (!circleHit(a.x, a.y, a.radius, b.x, b.y, b.radius)) continue;
      const m = a.mass < b.mass ? a.mass : b.mass;
      a.mass -= m;
      b.mass -= m;
      world.events.push({ type: 'annihilate', x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5, mass: m });
      if (a.mass <= 0) break;
    }
  }
  // Shell vs debris.
  for (const s of shells) {
    if (s.mass <= 0) continue;
    for (const d of world.debris) {
      if (d.hp <= 0) continue;
      if (!circleHit(s.x, s.y, s.radius, d.x, d.y, d.radius)) continue;
      d.hp -= s.mass;
      s.mass = 0;
      world.events.push({ type: 'debrisHit', x: s.x, y: s.y });
      if (d.hp <= 0) world.events.push({ type: 'debrisDestroyed', x: d.x, y: d.y });
      break;
    }
  }
  // Shell vs enemy ship.
  for (const s of shells) {
    if (s.mass <= 0) continue;
    const target = world.ships[s.owner === 0 ? 1 : 0];
    if (!target.alive || !shipHitBy(target, s)) continue;
    const dmg = s.mass;
    target.hp -= dmg;
    s.mass = 0;
    world.events.push({ type: 'shipHit', player: target.player, x: s.x, y: s.y, damage: dmg });
    if (target.hp <= 0) {
      target.hp = 0;
      target.alive = false;
      target.target = null;
      world.events.push({ type: 'shipDestroyed', player: target.player, x: target.x, y: target.y });
      if (world.winner === null) world.winner = target.player === 0 ? 1 : 0;
    }
  }
}

/** Advance the world by one tick, applying the given inputs first. Mutates `world`. */
export function step(world: World, inputs: ReadonlyArray<Input>): void {
  world.events = [];
  world.tick++;
  if (world.winner === null) {
    for (const input of inputs) applyInput(world, input);
  }
  stepShips(world);
  stepDebris(world);
  stepShells(world);
  stepCollisions(world);
  world.shells = world.shells.filter((s) => s.mass > 0 && !outOfField(s.x, s.y));
  world.debris = world.debris.filter((d) => d.hp > 0);
}

export { WORLD_W, WORLD_H };
