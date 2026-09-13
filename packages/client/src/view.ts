import { C, LH, LW } from './palette';

/**
 * Letterboxes the 1280x720 logical canvas into the window and converts pointer
 * coordinates into logical space.
 */
export class View {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  scale = 1;
  ox = 0;
  oy = 0;
  dpr = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d canvas unsupported');
    this.ctx = ctx;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    const cw = window.innerWidth;
    const ch = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(cw * this.dpr);
    this.canvas.height = Math.round(ch * this.dpr);
    this.scale = Math.min(cw / LW, ch / LH);
    this.ox = (cw - LW * this.scale) / 2;
    this.oy = (ch - LH * this.scale) / 2;
  }

  /** Reset the transform to logical space and clear the letterbox. */
  begin(): CanvasRenderingContext2D {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const s = this.scale * this.dpr;
    ctx.setTransform(s, 0, 0, s, this.ox * this.dpr, this.oy * this.dpr);
    ctx.beginPath();
    ctx.rect(0, 0, LW, LH);
    ctx.clip();
    return ctx;
  }

  toLogical(clientX: number, clientY: number): { x: number; y: number } {
    return { x: (clientX - this.ox) / this.scale, y: (clientY - this.oy) / this.scale };
  }
}
