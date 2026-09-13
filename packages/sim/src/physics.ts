import { DT } from './munitions';
import type { Vec2 } from './dmath';
import type { World } from './types';

export const WORLD_W = 1280;
export const WORLD_H = 720;

/** Gravity at a point. The base field is uniform; modifiers add point sources. */
export function gravityAt(world: World, x: number, y: number): Vec2 {
  let gx = world.gravity.gx;
  let gy = world.gravity.gy;
  for (const m of world.gravityMods) {
    if (m.untilTick < world.tick) continue;
    const dx = m.x - x;
    const dy = m.y - y;
    const d2 = dx * dx + dy * dy;
    const minD2 = 24 * 24;
    const dd2 = d2 < minD2 ? minD2 : d2;
    const d = Math.sqrt(dd2);
    const a = (m.strength * m.radius * m.radius) / dd2;
    gx += (dx / d) * a;
    gy += (dy / d) * a;
  }
  return { x: gx, y: gy };
}

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** One semi-implicit Euler step. Used by the simulation, the preview and the bot alike. */
export function integrate(world: World, b: Body): void {
  const g = gravityAt(world, b.x, b.y);
  b.vx += g.x * DT;
  b.vy += g.y * DT;
  b.x += b.vx * DT;
  b.y += b.vy * DT;
}

export function outOfField(x: number, y: number): boolean {
  return x < -300 || x > WORLD_W + 300 || y > WORLD_H + 80 || y < -2400;
}
