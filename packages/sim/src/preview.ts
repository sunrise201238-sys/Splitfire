import { MUNITIONS, STREAM_SPEED_SPREAD, type MunitionKind } from './munitions';
import { integrate, outOfField } from './physics';
import type { Body } from './physics';
import type { PlayerId, World } from './types';
import { childVelocities, clampLaunch, launchPoint } from './world';
import { rotate } from './dmath';

export interface Pt {
  x: number;
  y: number;
}

export interface Preview {
  /** Parent path from the muzzle to the split point. */
  path: Pt[];
  /** Split point (apex), or null if the shell leaves the field first. */
  apex: Pt | null;
  /** One path per child, from the split point until it passes the target's altitude or leaves the field. */
  children: Pt[][];
  /** Where the children cross the enemy ship's altitude. */
  landing: { x0: number; x1: number; y: number } | null;
  /** True if the parent path passes through a debris chunk. */
  blocked: boolean;
  /**
   * Outer edges of the fan: the fastest child on each angular edge. Everything the
   * split produces lands inside the polygon these two paths enclose.
   */
  envelope: { top: Pt[]; bottom: Pt[] } | null;
}

const MAX_PARENT_TICKS = 300;
const MAX_CHILD_TICKS = 300;

function hitsDebris(world: World, x: number, y: number, r: number): boolean {
  for (const d of world.debris) {
    const dx = d.x - x;
    const dy = d.y - y;
    const rr = d.radius + r;
    if (dx * dx + dy * dy < rr * rr) return true;
  }
  return false;
}

/**
 * Predict a shot using the same integrator the simulation uses. Ignores enemy shells,
 * so it is a prediction of geometry, not of the outcome.
 */
export function previewShot(
  world: World,
  player: PlayerId,
  vx: number,
  vy: number,
  kind: MunitionKind,
  splitAt: 'apex' | 'now' = 'apex',
): Preview {
  const ship = world.ships[player];
  const enemy = world.ships[player === 0 ? 1 : 0];
  const def = MUNITIONS[kind];
  const v = clampLaunch(vx, vy);
  const p = launchPoint(ship);
  const body: Body = { x: p.x, y: p.y, vx: v.vx, vy: v.vy };
  const path: Pt[] = [{ x: body.x, y: body.y }];
  let apex: Pt | null = null;
  let blocked = false;

  if (splitAt === 'now' || body.vy >= 0) {
    apex = { x: body.x, y: body.y };
  } else {
    for (let t = 0; t < MAX_PARENT_TICKS; t++) {
      integrate(world, body);
      path.push({ x: body.x, y: body.y });
      if (hitsDebris(world, body.x, body.y, def.radius)) blocked = true;
      if (outOfField(body.x, body.y)) break;
      if (body.vy >= 0) {
        apex = { x: body.x, y: body.y };
        break;
      }
    }
  }

  const children: Pt[][] = [];
  let landing: Preview['landing'] = null;
  let envelope: Preview['envelope'] = null;
  if (apex) {
    const fast = 1 + STREAM_SPEED_SPREAD / 2;
    const edge = (angle: number): Pt[] => {
      const r = rotate(body.vx, body.vy, angle);
      const c: Body = { x: apex!.x, y: apex!.y, vx: r.x * fast, vy: r.y * fast };
      const cp: Pt[] = [{ x: c.x, y: c.y }];
      for (let t = 0; t < MAX_CHILD_TICKS; t++) {
        const py = c.y;
        integrate(world, c);
        cp.push({ x: c.x, y: c.y });
        if ((py < enemy.y && c.y >= enemy.y) || outOfField(c.x, c.y)) break;
      }
      return cp;
    };
    envelope = { top: edge(-def.spread / 2), bottom: edge(def.spread / 2) };
    const vels = childVelocities(kind, body.vx, body.vy, def.children);
    let x0 = Infinity;
    let x1 = -Infinity;
    for (const cv of vels) {
      const c: Body = { x: apex.x, y: apex.y, vx: cv.vx, vy: cv.vy };
      const cp: Pt[] = [{ x: c.x, y: c.y }];
      let crossed = false;
      for (let t = 0; t < MAX_CHILD_TICKS; t++) {
        const py = c.y;
        integrate(world, c);
        cp.push({ x: c.x, y: c.y });
        if (!crossed && py < enemy.y && c.y >= enemy.y) {
          crossed = true;
          if (c.x < x0) x0 = c.x;
          if (c.x > x1) x1 = c.x;
          break;
        }
        if (outOfField(c.x, c.y)) break;
      }
      children.push(cp);
    }
    if (x0 !== Infinity) landing = { x0, x1, y: enemy.y };
  }
  return { path, apex, children, landing, blocked, envelope };
}

export interface Crossing {
  x: number;
  y: number;
  ticks: number;
}

/**
 * Where a body (an in-flight shell, for instance) will cross the given altitude
 * while descending, and in how many ticks. Null if it never does within the horizon.
 */
export function predictCrossing(
  world: World,
  body: Body,
  targetY: number,
  maxTicks = 300,
): Crossing | null {
  const b: Body = { x: body.x, y: body.y, vx: body.vx, vy: body.vy };
  for (let t = 1; t <= maxTicks; t++) {
    const py = b.y;
    integrate(world, b);
    if (py < targetY && b.y >= targetY) return { x: b.x, y: b.y, ticks: t };
    if (outOfField(b.x, b.y)) return null;
  }
  return null;
}
