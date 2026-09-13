import { MUNITIONS, MUNITION_KINDS, type MunitionKind, type Ship } from '@splitfire/sim';
import { C } from './palette';
import { LH, LW } from './palette';
import { roundRect, text } from './draw';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const CHIP_W = 92;
export const CHIP_H = 42;

export const HUD = {
  chip(i: number): Rect {
    return { x: 24 + i * 102, y: LH - 66, w: CHIP_W, h: CHIP_H };
  },
  move: { x: 24 + 3 * 102 + 18, y: LH - 66, w: CHIP_W, h: CHIP_H } as Rect,
  cam: { x: LW - 124, y: 18, w: 106, h: 32 } as Rect,
  fuel: { x: 24, y: LH - 108 },
  /** Where transient hints sit: bottom centre, clear of the chips. */
  hint: { x: LW / 2, y: LH - 46 },
};

export function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

export function inCircle(cx: number, cy: number, r: number, x: number, y: number): boolean {
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

export function chipHit(x: number, y: number): MunitionKind | null {
  for (let i = 0; i < MUNITION_KINDS.length; i++) {
    if (inRect(HUD.chip(i), x, y)) return MUNITION_KINDS[i];
  }
  return null;
}

export interface HudState {
  ship: Ship;
  selected: MunitionKind;
  moveMode: boolean;
  autoCam: boolean;
  fuelAlpha: number;
  fuelCost: number;
}

export function drawHud(ctx: CanvasRenderingContext2D, s: HudState): void {
  const cooling = s.ship.cooldown > 0;
  for (let i = 0; i < MUNITION_KINDS.length; i++) {
    const kind = MUNITION_KINDS[i];
    const def = MUNITIONS[kind];
    const r = HUD.chip(i);
    const sel = kind === s.selected;
    const count = def.ammo === null ? '∞' : String(s.ship.ammo[kind] ?? 0);
    const empty = def.ammo !== null && (s.ship.ammo[kind] ?? 0) <= 0;
    ctx.save();
    ctx.translate(r.x, r.y);
    roundRect(ctx, 0, 0, r.w, r.h, 10);
    if (sel) {
      ctx.fillStyle = empty ? C.hudFaint : C.me;
      ctx.fill();
    } else {
      ctx.strokeStyle = empty ? C.hudFaint : C.hudDim;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    const fg = sel && !empty ? C.bg : empty ? C.hudFaint : C.hud;
    text(ctx, `×${def.children}`, 12, 21, 18, fg, 600, 'left');
    text(ctx, count, r.w - 10, 21, 15, sel && !empty ? 'rgba(11,16,32,0.75)' : empty ? C.hudFaint : C.hudDim, 500, 'right');
    if (sel && cooling) {
      const frac = s.ship.cooldown / MUNITIONS[s.selected].cooldownTicks;
      ctx.save();
      roundRect(ctx, 0, 0, r.w, r.h, 10);
      ctx.clip();
      ctx.fillStyle = 'rgba(11,16,32,0.38)';
      ctx.fillRect(0, 0, r.w * frac, r.h);
      ctx.restore();
    }
    ctx.restore();
  }

  {
    const r = HUD.move;
    const on = s.moveMode;
    const canMove = s.ship.fuel > 0;
    ctx.save();
    ctx.translate(r.x, r.y);
    roundRect(ctx, 0, 0, r.w, r.h, 10);
    if (on) {
      ctx.fillStyle = C.me;
      ctx.fill();
    } else {
      ctx.strokeStyle = canMove ? C.hudDim : C.hudFaint;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    text(ctx, 'MOVE', 12, 18, 16, on ? C.bg : canMove ? C.hud : C.hudFaint, 600, 'left');
    // Mini fuel gauge inside the chip.
    const frac = s.ship.fuel / s.ship.maxFuel;
    ctx.fillStyle = on ? 'rgba(11,16,32,0.25)' : 'rgba(255,255,255,0.12)';
    ctx.fillRect(12, 31, r.w - 24, 4);
    ctx.fillStyle = on ? C.bg : C.me;
    ctx.fillRect(12, 31, (r.w - 24) * frac, 4);
    ctx.restore();
  }

  {
    const r = HUD.cam;
    ctx.save();
    ctx.translate(r.x, r.y);
    roundRect(ctx, 0, 0, r.w, r.h, 8);
    if (s.autoCam) {
      ctx.fillStyle = C.me;
      ctx.fill();
    } else {
      ctx.strokeStyle = C.hudDim;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    text(ctx, 'AUTO CAM', r.w / 2, r.h / 2, 13, s.autoCam ? C.bg : C.hudDim);
    ctx.restore();
  }

  if (s.fuelAlpha > 0.01) {
    const { x, y } = HUD.fuel;
    ctx.save();
    ctx.globalAlpha = s.fuelAlpha;
    ctx.translate(x, y);
    text(ctx, 'FUEL', 0, -14, 12, C.hudDim, 600, 'left');
    const frac = s.ship.fuel / s.ship.maxFuel;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(0, -4, 160, 8);
    ctx.fillStyle = C.me;
    ctx.fillRect(0, -4, 160 * frac, 8);
    if (s.fuelCost > 0) {
      const c = Math.min(frac, s.fuelCost);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(160 * (frac - c), -4, 160 * c, 8);
    }
    ctx.restore();
  }
}
