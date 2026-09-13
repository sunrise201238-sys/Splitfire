import type { Difficulty } from '@splitfire/bot';
import { C, LH, LW } from './palette';
import { drawShip, roundRect, text } from './draw';
import { inRect, type Rect } from './hud';
import { MatchScreen } from './match';
import { Starfield } from './starfield';
import type { App, PointerInfo, Screen } from './screen';

const LOCAL: Rect = { x: LW / 2 - 170, y: 290, w: 340, h: 64 };
const ONLINE: Rect = { x: LW / 2 - 170, y: 430, w: 340, h: 64 };
const DIFFS: Difficulty[] = ['easy', 'normal', 'hard'];
const DIFF_Y = 372;

function diffRect(i: number): Rect {
  return { x: LW / 2 - 170 + i * 118, y: DIFF_Y, w: 104, h: 34 };
}

export class MenuScreen implements Screen {
  private readonly stars = new Starfield(8);
  private difficulty: Difficulty;

  constructor(
    private readonly app: App,
    difficulty: Difficulty = 'normal',
  ) {
    this.difficulty = difficulty;
  }

  update(): void {}

  draw(ctx: CanvasRenderingContext2D, now: number): void {
    this.stars.draw(ctx, now);
    this.stars.drawPlanet(ctx);
    drawShip(ctx, 400, 560, C.me);
    drawShip(ctx, 880, 560, C.foe);
    text(ctx, 'SPLITFIRE', LW / 2, 170, 56, C.hud, 700);
    text(ctx, 'space battleship duel', LW / 2, 214, 18, C.hudDim, 500);

    this.button(ctx, LOCAL, 'LOCAL', 'play now · vs AI', true);
    for (let i = 0; i < DIFFS.length; i++) {
      const r = diffRect(i);
      const sel = DIFFS[i] === this.difficulty;
      roundRect(ctx, r.x, r.y, r.w, r.h, 9);
      if (sel) {
        ctx.fillStyle = C.hudFaint;
        ctx.fill();
        ctx.strokeStyle = C.hud;
      } else {
        ctx.strokeStyle = C.hudFaint;
      }
      ctx.lineWidth = 1.5;
      ctx.stroke();
      text(ctx, DIFFS[i].toUpperCase(), r.x + r.w / 2, r.y + r.h / 2, 13, sel ? C.hud : C.hudDim);
    }
    this.button(ctx, ONLINE, 'ONLINE', 'coming in a later build', false, true);
    text(ctx, 'pull back anywhere to aim · tap to split early · MOVE, then tap where to go · 1 2 3 select ammo', LW / 2, LH - 28, 13, C.hudDim, 500);
  }

  private button(ctx: CanvasRenderingContext2D, r: Rect, label: string, sub: string, filled: boolean, dim = false): void {
    roundRect(ctx, r.x, r.y, r.w, r.h, 14);
    if (filled) {
      ctx.fillStyle = C.me;
      ctx.fill();
    } else {
      ctx.strokeStyle = dim ? C.hudFaint : C.hudDim;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    text(ctx, label, r.x + r.w / 2, r.y + 24, 20, filled ? C.bg : dim ? C.hudDim : C.hud, 700);
    text(ctx, sub, r.x + r.w / 2, r.y + 46, 13, filled ? 'rgba(11,16,32,0.7)' : dim ? C.hudFaint : C.hudDim, 500);
    if (dim) {
      ctx.fillStyle = C.amber;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(r.x + 32, r.y + 24, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  pointerDown(p: PointerInfo): void {
    if (inRect(LOCAL, p.x, p.y)) {
      this.app.show(new MatchScreen(this.app, this.difficulty));
      return;
    }
    for (let i = 0; i < DIFFS.length; i++) {
      if (inRect(diffRect(i), p.x, p.y)) this.difficulty = DIFFS[i];
    }
  }

  pointerMove(): void {}
  pointerUp(): void {}
  wheel(): void {}

  key(code: string): void {
    if (code === 'Enter' || code === 'Space') this.app.show(new MatchScreen(this.app, this.difficulty));
  }
}
