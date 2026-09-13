import { WORLD_H, WORLD_W, type Pt, type World } from '@splitfire/sim';
import type { Effects } from './effects';
import { LH, LW } from './palette';

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;

/**
 * World-to-screen camera. Default is the full battlefield; the player may zoom and pan,
 * or hand control to the director ("auto"), which frames whatever is most interesting.
 */
export class Camera {
  cx = WORLD_W / 2;
  cy = WORLD_H / 2;
  zoom = 1;
  auto = false;
  shake = 0;
  shakeX = 0;
  shakeY = 0;

  private tx = WORLD_W / 2;
  private ty = WORLD_H / 2;
  private tz = 1;
  private lastRetarget = -10;

  worldToScreen(x: number, y: number): Pt {
    return { x: (x - this.cx) * this.zoom + LW / 2 + this.shakeX, y: (y - this.cy) * this.zoom + LH / 2 + this.shakeY };
  }

  screenToWorld(x: number, y: number): Pt {
    return { x: (x - LW / 2 - this.shakeX) / this.zoom + this.cx, y: (y - LH / 2 - this.shakeY) / this.zoom + this.cy };
  }

  /** Apply the camera transform for world-space drawing. */
  apply(ctx: CanvasRenderingContext2D): void {
    ctx.translate(LW / 2 + this.shakeX, LH / 2 + this.shakeY);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.cx, -this.cy);
  }

  resetView(): void {
    this.cx = this.tx = WORLD_W / 2;
    this.cy = this.ty = WORLD_H / 2;
    this.zoom = this.tz = 1;
  }

  /** Manual zoom around a logical screen point. Leaves auto mode. */
  zoomAt(sx: number, sy: number, factor: number): void {
    this.auto = false;
    const before = this.screenToWorld(sx, sy);
    this.zoom = clampZoom(this.zoom * factor);
    const after = this.screenToWorld(sx, sy);
    this.cx += before.x - after.x;
    this.cy += before.y - after.y;
    this.clampView();
    this.syncTargets();
  }

  /** Manual pan by a logical screen delta. Leaves auto mode. */
  panBy(dx: number, dy: number): void {
    this.auto = false;
    this.cx -= dx / this.zoom;
    this.cy -= dy / this.zoom;
    this.clampView();
    this.syncTargets();
  }

  setAuto(on: boolean): void {
    this.auto = on;
    if (!on) this.syncTargets();
  }

  addShake(amount: number): void {
    this.shake = Math.min(24, this.shake + amount);
  }

  private syncTargets(): void {
    this.tx = this.cx;
    this.ty = this.cy;
    this.tz = this.zoom;
  }

  private clampView(): void {
    const hw = LW / (2 * this.zoom);
    const hh = LH / (2 * this.zoom);
    this.cx = Math.min(Math.max(this.cx, hw), WORLD_W - hw);
    this.cy = Math.min(Math.max(this.cy, hh), WORLD_H - hh);
  }

  /**
   * Advance smoothing and, in auto mode, choose a new framing.
   * `focus` is an optional set of points that must stay in view (the player's aim preview).
   */
  update(dt: number, now: number, world: World, effects: Effects, focus: Pt[] | null): void {
    // Shake decays quickly.
    if (this.shake > 0.05) {
      this.shakeX = (Math.random() * 2 - 1) * this.shake;
      this.shakeY = (Math.random() * 2 - 1) * this.shake;
      this.shake *= Math.exp(-9 * dt);
    } else {
      this.shake = 0;
      this.shakeX = 0;
      this.shakeY = 0;
    }

    if (this.auto) {
      const pts = focus && focus.length > 0 ? focus : this.interestPoints(world, effects, now);
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const p of pts) {
        if (p.x < x0) x0 = p.x;
        if (p.x > x1) x1 = p.x;
        if (p.y < y0) y0 = p.y;
        if (p.y > y1) y1 = p.y;
      }
      let nz = 1;
      let nx = WORLD_W / 2;
      let ny = WORLD_H / 2;
      if (pts.length > 0) {
        const bw = x1 - x0 + 320;
        const bh = y1 - y0 + 260;
        nz = clampZoom(Math.min(LW / bw, LH / bh, 2.4));
        nx = (x0 + x1) / 2;
        ny = (y0 + y1) / 2;
      }
      const changed = Math.abs(nx - this.tx) > 60 || Math.abs(ny - this.ty) > 50 || Math.abs(nz - this.tz) > 0.2;
      if (changed && now - this.lastRetarget > 0.7) {
        this.tx = nx;
        this.ty = ny;
        this.tz = nz;
        this.lastRetarget = now;
      }
      const kc = 1 - Math.exp(-4 * dt);
      const kz = 1 - Math.exp(-3 * dt);
      this.cx += (this.tx - this.cx) * kc;
      this.cy += (this.ty - this.cy) * kc;
      this.zoom += (this.tz - this.zoom) * kz;
      this.clampView();
    }
  }

  private interestPoints(world: World, effects: Effects, now: number): Pt[] {
    const pts: Pt[] = [];
    for (const s of world.shells) pts.push({ x: s.x, y: s.y });
    for (const e of effects.list) {
      if (now - e.t0 > 0.7) continue;
      if (e.kind === 'split' || e.kind === 'shipHit' || e.kind === 'shipDestroyed' || e.kind === 'annihilate') {
        pts.push({ x: e.x, y: e.y });
      }
    }
    if (pts.length === 0) {
      for (const s of world.ships) pts.push({ x: s.x, y: s.y - 40 }, { x: s.x, y: s.y + 40 });
    }
    return pts;
  }
}

function clampZoom(z: number): number {
  return Math.min(Math.max(z, MIN_ZOOM), MAX_ZOOM);
}
