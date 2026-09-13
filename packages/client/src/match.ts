import { createBot, type Bot, type Difficulty } from '@splitfire/bot';
import {
  CHILD_RADIUS,
  DEBRIS_HP,
  DT,
  FUEL_PER_UNIT,
  MAX_LAUNCH_SPEED,
  MIN_LAUNCH_SPEED,
  MUNITIONS,
  MUNITION_KINDS,
  SHIP_HULL,
  clampLaunch,
  clampToBounds,
  createWorld,
  launchPoint,
  predictCrossing,
  previewShot,
  step,
  type Input,
  type MunitionKind,
  type PlayerId,
  type Preview,
  type Pt,
  type World,
} from '@splitfire/sim';
import { Camera } from './camera';
import { drawBundle, drawCone, drawDebris, drawDotted, drawDragUI, drawEdgeArrow, drawHpBar, drawLaunchArrow, drawPath, drawShell, drawShip, drawSplitMarker, roundRect, text } from './draw';
import { Effects } from './effects';
import { HUD, IGNITE_R, chipHit, drawHud, inCircle, inRect, type Rect } from './hud';
import { C, LH, LW } from './palette';
import type { App, PointerInfo, Screen } from './screen';
import { Starfield } from './starfield';

const AIM_SCALE = 1.6;
const HINT_SHOTS = 3;
const MIN_DRAG = 12;
const SHIP_GRAB_RADIUS = 52;
const MAX_TICKS_PER_FRAME = 6;
const OVERLAY_DELAY = 1.4;

type Drag =
  | { mode: 'aim'; id: number; sx: number; sy: number; cx: number; cy: number }
  | { mode: 'move'; id: number; cx: number; cy: number }
  | { mode: 'pan'; id: number; lx: number; ly: number };

interface Pinch {
  a: number;
  b: number;
  d0: number;
  zoom0: number;
  mx: number;
  my: number;
}

const AGAIN: Rect = { x: LW / 2 - 170, y: LH / 2 + 30, w: 160, h: 52 };
const MENU_BTN: Rect = { x: LW / 2 + 10, y: LH / 2 + 30, w: 160, h: 52 };

export class MatchScreen implements Screen {
  private readonly world: World;
  private readonly bot: Bot;
  private readonly me: PlayerId = 0;
  private readonly camera = new Camera();
  private readonly effects = new Effects();
  private readonly stars = new Starfield(4);
  private selected: MunitionKind = 'x5';
  private pending: Input[] = [];
  private acc = 0;
  private drag: Drag | null = null;
  private pinch: Pinch | null = null;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private fuelVisibleUntil = 0;
  private overAt: number | null = null;
  private now = 0;
  private shotsFired = 0;
  private lastFireAt = -10;

  constructor(
    private readonly app: App,
    private readonly difficulty: Difficulty,
    seed = (Date.now() % 1_000_000_007) | 0,
  ) {
    this.world = createWorld(seed);
    this.bot = createBot(1, difficulty, seed ^ 0x5f3759df);
    this.camera.setAuto(true);
  }

  private hasUnsplit(): boolean {
    return this.world.shells.some((s) => s.owner === this.me && s.parent);
  }

  private ignite(): void {
    if (this.hasUnsplit()) this.queue({ type: 'ignite', player: this.me });
  }

  private get ship() {
    return this.world.ships[this.me];
  }

  private get enemy() {
    return this.world.ships[this.me === 0 ? 1 : 0];
  }

  // ---- simulation -------------------------------------------------------

  update(dt: number, now: number): void {
    this.now = now;
    this.acc += dt;
    let ticks = 0;
    while (this.acc >= DT && ticks < MAX_TICKS_PER_FRAME) {
      this.tick(now);
      this.acc -= DT;
      ticks++;
    }
    if (this.acc >= DT) this.acc = 0; // tab was hidden: drop the backlog instead of fast-forwarding
    this.effects.prune(now);
    const focus = this.drag?.mode === 'aim' ? this.previewPoints() : null;
    this.camera.update(dt, now, this.world, this.effects, focus);
    if (this.world.winner !== null && this.overAt === null) this.overAt = now;
  }

  private tick(now: number): void {
    const inputs = this.pending;
    this.pending = [];
    inputs.push(...this.bot.update(this.world));
    step(this.world, inputs);
    const shake = this.effects.spawn(this.world.events, now, this.me);
    if (shake > 0) this.camera.addShake(shake);
    for (const e of this.world.events) {
      if (e.type === 'fire' && e.player === this.me) {
        this.shotsFired++;
        this.lastFireAt = now;
      }
      if (e.type === 'moveStart' && e.player === this.me) this.fuelVisibleUntil = Infinity;
      if (e.type === 'moveEnd' && e.player === this.me) this.fuelVisibleUntil = now + 1.5;
    }
  }

  private queue(input: Input): void {
    if (this.world.winner !== null || !this.ship.alive) return;
    this.pending.push(input);
  }

  // ---- preview helpers --------------------------------------------------

  private aimVelocity(d: Extract<Drag, { mode: 'aim' }>): { vx: number; vy: number } {
    return { vx: (d.sx - d.cx) * AIM_SCALE, vy: (d.sy - d.cy) * AIM_SCALE };
  }

  private currentPreview(): Preview | null {
    if (this.drag?.mode !== 'aim') return null;
    const v = this.aimVelocity(this.drag);
    if (Math.hypot(this.drag.sx - this.drag.cx, this.drag.sy - this.drag.cy) < MIN_DRAG) return null;
    return previewShot(this.world, this.me, v.vx, v.vy, this.selected);
  }

  private previewPoints(): Pt[] | null {
    const pv = this.currentPreview();
    if (!pv) return null;
    const pts: Pt[] = [{ x: this.ship.x, y: this.ship.y }];
    for (let i = 0; i < pv.path.length; i += 6) pts.push(pv.path[i]);
    if (pv.landing) pts.push({ x: pv.landing.x0, y: pv.landing.y }, { x: pv.landing.x1, y: pv.landing.y });
    return pts;
  }

  /** X positions where enemy shells will cross the top of my hull. */
  private incomingCrossings(): number[] {
    const y = this.ship.y + SHIP_HULL[0][1] - SHIP_HULL[0][2];
    const xs: number[] = [];
    for (const s of this.world.shells) {
      if (s.owner === this.me) continue;
      const c = predictCrossing(this.world, s, y, 240);
      if (c) xs.push(c.x);
    }
    return xs;
  }

  // ---- drawing ----------------------------------------------------------

  draw(ctx: CanvasRenderingContext2D, now: number): void {
    const w = this.world;
    const alpha = Math.min(1, this.acc / DT);
    const ex = alpha * DT; // extrapolation time for smooth motion between ticks

    ctx.save();
    this.camera.apply(ctx);
    this.stars.draw(ctx, now);
    this.stars.drawPlanet(ctx);

    // Movement affordances.
    if (this.drag?.mode === 'move') {
      const b = this.ship.bounds;
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = `rgba(${C.meRgb},0.35)`;
      ctx.lineWidth = 1.5;
      roundRect(ctx, b.x0 - 30, b.y0 - 50, b.x1 - b.x0 + 60, b.y1 - b.y0 + 100, 18);
      ctx.stroke();
      ctx.setLineDash([]);
      const xs = this.incomingCrossings();
      if (xs.length > 0) {
        const x0 = Math.min(...xs);
        const x1 = Math.max(...xs);
        ctx.fillStyle = `rgba(${C.foeRgb},0.18)`;
        ctx.beginPath();
        ctx.ellipse((x0 + x1) / 2, this.ship.y + 6, (x1 - x0) / 2 + 24, 26, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (const d of w.debris) drawDebris(ctx, { ...d, y: d.y + d.vy * ex }, DEBRIS_HP);

    for (const s of w.ships) {
      if (!s.alive) continue;
      const col = s.player === this.me ? C.me : C.foe;
      drawShip(ctx, s.x, s.y, col, { damage: 1 - s.hp / s.maxHp });
      drawHpBar(ctx, s.x, s.y - 64, s.hp / s.maxHp, col);
    }

    if (this.drag?.mode === 'move') {
      const t = clampToBounds(this.ship.bounds, this.drag.cx, this.drag.cy);
      const n = 40;
      const pts: Pt[] = [];
      for (let i = 0; i <= n; i++) pts.push({ x: this.ship.x + ((t.x - this.ship.x) * i) / n, y: this.ship.y + ((t.y - this.ship.y) * i) / n });
      drawDotted(ctx, pts, C.me, 8, 1.8);
      drawShip(ctx, t.x, t.y, C.me, { ghost: true });
      drawDragUI(ctx, this.ship.x, this.ship.y, t.x, t.y, C.me);
    }

    for (const s of w.shells) {
      const mine = s.owner === this.me;
      const col = mine ? C.me : C.foe;
      const rgb = mine ? C.meRgb : C.foeRgb;
      const x = s.x + s.vx * ex;
      const y = s.y + s.vy * ex;
      if (s.parent) drawBundle(ctx, x, y, s.vx, s.vy, col, rgb, s.mass);
      else drawShell(ctx, x, y, s.vx, s.vy, col, rgb, CHILD_RADIUS, 34);
    }

    this.effects.draw(ctx, now);

    const pv = this.currentPreview();
    if (pv && this.drag?.mode === 'aim') {
      const av = this.aimVelocity(this.drag);
      const v = clampLaunch(av.vx, av.vy);
      const power = (Math.hypot(v.vx, v.vy) - MIN_LAUNCH_SPEED) / (MAX_LAUNCH_SPEED - MIN_LAUNCH_SPEED);
      const lp = launchPoint(this.ship);
      // Fan envelope first, so the parent path and markers sit on top of it.
      if (pv.envelope) {
        drawCone(ctx, pv.envelope.top, pv.envelope.bottom, `rgba(${C.meRgb},0.12)`, `rgba(${C.meRgb},0.5)`);
      }
      drawPath(ctx, pv.path, `rgba(${C.meRgb},0.9)`, 2.5);
      drawLaunchArrow(ctx, lp.x, lp.y, v.vx, v.vy, power, C.me);
      if (pv.apex) {
        drawSplitMarker(ctx, pv.apex.x, pv.apex.y, pv.blocked ? C.amber : C.me);
        text(ctx, pv.blocked ? 'BLOCKED' : 'SPLIT', pv.apex.x, pv.apex.y - 28, 12, pv.blocked ? C.amber : C.me);
      }
      if (pv.landing) {
        const { x0, x1, y } = pv.landing;
        ctx.fillStyle = `rgba(${C.meRgb},0.2)`;
        ctx.beginPath();
        ctx.ellipse((x0 + x1) / 2, y + 6, (x1 - x0) / 2 + 24, 26, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = C.me;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x0 - 12, y + 44);
        ctx.lineTo(x0 - 12, y + 36);
        ctx.lineTo(x1 + 12, y + 36);
        ctx.lineTo(x1 + 12, y + 44);
        ctx.stroke();
      }
    }
    ctx.restore();

    // Screen-space layer.
    if (this.drag?.mode === 'aim') drawDragUI(ctx, this.drag.sx, this.drag.sy, this.drag.cx, this.drag.cy, C.me);
    if (this.camera.zoom > 1.05) this.drawEdgeIndicators(ctx);

    const showFuel = this.drag?.mode === 'move' || this.ship.target !== null || now < this.fuelVisibleUntil;
    let fuelCost = 0;
    if (this.drag?.mode === 'move') {
      const t = clampToBounds(this.ship.bounds, this.drag.cx, this.drag.cy);
      fuelCost = (Math.hypot(t.x - this.ship.x, t.y - this.ship.y) * FUEL_PER_UNIT) / this.ship.maxFuel;
    }
    const unsplit = this.hasUnsplit();
    drawHud(ctx, {
      ship: this.ship,
      selected: this.selected,
      igniteActive: unsplit,
      pulse: (now * 1.4) % 1,
      autoCam: this.camera.auto,
      fuelAlpha: showFuel ? 1 : 0,
      fuelCost,
    });
    if (unsplit && this.shotsFired <= HINT_SHOTS && now - this.lastFireAt < 4) {
      const a = 0.6 + 0.4 * Math.sin(now * 6);
      text(ctx, 'tap anywhere to split early', LW / 2, HUD.ignite.y - IGNITE_R - 26, 16, `rgba(230,233,245,${a})`, 600);
    }

    if (this.overAt !== null && now - this.overAt > OVERLAY_DELAY) this.drawOverlay(ctx);
  }

  private drawEdgeIndicators(ctx: CanvasRenderingContext2D): void {
    let drawn = 0;
    for (const s of this.world.shells) {
      if (s.owner === this.me || drawn >= 4) continue;
      const p = this.camera.worldToScreen(s.x, s.y);
      if (p.x >= 0 && p.x <= LW && p.y >= 0 && p.y <= LH) continue;
      // Keep the arrows inside a band that stays clear of the HUD.
      const cx = LW / 2;
      const cy = LH / 2 - 30;
      const dx = p.x - cx;
      const dy = p.y - cy;
      const k = Math.min(1, (LW / 2 - 40) / Math.abs(dx || 1e-6), (LH / 2 - 130) / Math.abs(dy || 1e-6));
      drawEdgeArrow(ctx, cx + dx * k, cy + dy * k, Math.atan2(dy, dx), C.foe);
      drawn++;
    }
  }

  private drawOverlay(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = 'rgba(11,16,32,0.72)';
    ctx.fillRect(0, 0, LW, LH);
    const won = this.world.winner === this.me;
    text(ctx, won ? 'VICTORY' : 'DEFEAT', LW / 2, LH / 2 - 50, 56, won ? C.me : C.foe, 700);
    this.button(ctx, AGAIN, 'PLAY AGAIN', true);
    this.button(ctx, MENU_BTN, 'MENU', false);
  }

  private button(ctx: CanvasRenderingContext2D, r: Rect, label: string, filled: boolean): void {
    roundRect(ctx, r.x, r.y, r.w, r.h, 12);
    if (filled) {
      ctx.fillStyle = C.me;
      ctx.fill();
    } else {
      ctx.strokeStyle = C.hudDim;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    text(ctx, label, r.x + r.w / 2, r.y + r.h / 2, 17, filled ? C.bg : C.hud, 700);
  }

  // ---- input ------------------------------------------------------------

  private cancelDrag(): void {
    this.drag = null;
  }

  pointerDown(p: PointerInfo): void {
    if (this.overAt !== null && this.now - this.overAt > OVERLAY_DELAY) {
      if (inRect(AGAIN, p.x, p.y)) this.app.show(new MatchScreen(this.app, this.difficulty));
      else if (inRect(MENU_BTN, p.x, p.y)) this.showMenu();
      return;
    }
    this.pointers.set(p.id, { x: p.x, y: p.y });

    if (this.pointers.size === 2 && p.isTouch) {
      // Second finger: switch to pinch, abandoning whatever the first finger was doing.
      this.cancelDrag();
      const [a, b] = [...this.pointers.entries()];
      this.pinch = { a: a[0], b: b[0], d0: Math.hypot(a[1].x - b[1].x, a[1].y - b[1].y), zoom0: this.camera.zoom, mx: (a[1].x + b[1].x) / 2, my: (a[1].y + b[1].y) / 2 };
      return;
    }
    if (this.pinch) return;

    const kind = chipHit(p.x, p.y);
    if (kind) {
      this.selected = kind;
      return;
    }
    if (inCircle(HUD.ignite.x, HUD.ignite.y, IGNITE_R + 8, p.x, p.y)) {
      this.ignite();
      return;
    }
    if (inRect(HUD.cam, p.x, p.y)) {
      this.camera.setAuto(!this.camera.auto);
      return;
    }
    if (p.button === 2 || p.button === 1) {
      this.drag = { mode: 'pan', id: p.id, lx: p.x, ly: p.y };
      return;
    }
    if (this.world.winner !== null || !this.ship.alive) return;

    const wp = this.camera.screenToWorld(p.x, p.y);
    if (Math.hypot(wp.x - this.ship.x, wp.y - this.ship.y) < SHIP_GRAB_RADIUS) {
      this.drag = { mode: 'move', id: p.id, cx: wp.x, cy: wp.y };
      return;
    }
    this.drag = { mode: 'aim', id: p.id, sx: p.x, sy: p.y, cx: p.x, cy: p.y };
  }

  pointerMove(p: PointerInfo): void {
    if (this.pointers.has(p.id)) this.pointers.set(p.id, { x: p.x, y: p.y });
    if (this.pinch) {
      const a = this.pointers.get(this.pinch.a);
      const b = this.pointers.get(this.pinch.b);
      if (!a || !b) return;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const target = this.pinch.zoom0 * (d / Math.max(1, this.pinch.d0));
      this.camera.zoomAt(mx, my, target / this.camera.zoom);
      this.camera.panBy(mx - this.pinch.mx, my - this.pinch.my);
      this.pinch.mx = mx;
      this.pinch.my = my;
      return;
    }
    const d = this.drag;
    if (!d || d.id !== p.id) return;
    if (d.mode === 'aim') {
      d.cx = p.x;
      d.cy = p.y;
    } else if (d.mode === 'move') {
      const wp = this.camera.screenToWorld(p.x, p.y);
      d.cx = wp.x;
      d.cy = wp.y;
    } else {
      this.camera.panBy(p.x - d.lx, p.y - d.ly);
      d.lx = p.x;
      d.ly = p.y;
    }
  }

  pointerUp(p: PointerInfo): void {
    this.pointers.delete(p.id);
    if (p.cancel) {
      // The browser took the pointer away (gesture, alert, tab switch): drop the gesture without firing.
      if (this.drag?.id === p.id) this.drag = null;
      if (this.pinch && (p.id === this.pinch.a || p.id === this.pinch.b)) this.pinch = null;
      return;
    }
    if (this.pinch && (p.id === this.pinch.a || p.id === this.pinch.b)) {
      this.pinch = null;
      this.pointers.clear();
      return;
    }
    const d = this.drag;
    if (!d || d.id !== p.id) return;
    this.drag = null;
    if (d.mode === 'aim') {
      if (Math.hypot(d.sx - d.cx, d.sy - d.cy) < MIN_DRAG) {
        // A tap, not a drag: split whatever is still in one piece.
        this.ignite();
        return;
      }
      const v = this.aimVelocity(d);
      if (Math.hypot(v.vx, v.vy) < MIN_LAUNCH_SPEED * 0.6) return;
      this.queue({ type: 'fire', player: this.me, kind: this.selected, vx: v.vx, vy: v.vy });
    } else if (d.mode === 'move') {
      const t = clampToBounds(this.ship.bounds, d.cx, d.cy);
      if (Math.hypot(t.x - this.ship.x, t.y - this.ship.y) < 8) return;
      this.queue({ type: 'move', player: this.me, x: t.x, y: t.y });
    }
  }

  wheel(x: number, y: number, deltaY: number): void {
    this.camera.zoomAt(x, y, Math.exp(-deltaY * 0.0015));
  }

  key(code: string): void {
    switch (code) {
      case 'Digit1':
      case 'Digit2':
      case 'Digit3':
        this.selected = MUNITION_KINDS[Number(code.slice(5)) - 1];
        break;
      case 'Space':
        if (this.overAt !== null && this.now - this.overAt > OVERLAY_DELAY) this.app.show(new MatchScreen(this.app, this.difficulty));
        else this.ignite();
        break;
      case 'KeyC':
        this.camera.setAuto(!this.camera.auto);
        break;
      case 'KeyR':
        this.camera.setAuto(false);
        this.camera.resetView();
        break;
      case 'Escape':
        if (this.drag) this.cancelDrag();
        else if (this.overAt !== null) this.showMenu();
        break;
      default:
        break;
    }
  }

  private showMenu(): void {
    this.app.menu(this.difficulty);
  }
}

export { MUNITIONS };
