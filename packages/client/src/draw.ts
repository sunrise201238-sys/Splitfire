import type { Debris, Pt } from '@splitfire/sim';
import { C, FONT } from './palette';

export function drawShip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  col: string,
  opt: { ghost?: boolean; damage?: number } = {},
): void {
  ctx.save();
  ctx.translate(x, y);
  if (opt.ghost) {
    ctx.globalAlpha = 0.45;
    ctx.setLineDash([5, 4]);
  }
  ctx.beginPath();
  ctx.moveTo(0, -42);
  ctx.lineTo(13, -4);
  ctx.lineTo(24, 18);
  ctx.lineTo(24, 26);
  ctx.lineTo(10, 22);
  ctx.lineTo(8, 34);
  ctx.lineTo(-8, 34);
  ctx.lineTo(-10, 22);
  ctx.lineTo(-24, 26);
  ctx.lineTo(-24, 18);
  ctx.lineTo(-13, -4);
  ctx.closePath();
  if (opt.ghost) {
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.stroke();
  } else {
    ctx.fillStyle = col;
    ctx.fill();
    ctx.fillStyle = C.bg;
    ctx.beginPath();
    ctx.arc(0, 4, 4, 0, Math.PI * 2);
    ctx.fill();
    const g = ctx.createRadialGradient(0, 40, 0, 0, 40, 16);
    g.addColorStop(0, col);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 42, 7, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    // Damage state: embers appear as the hull wears down.
    const d = opt.damage ?? 0;
    if (d > 0.35) {
      ctx.fillStyle = C.amber;
      const spots: Array<[number, number]> = [
        [9, 10],
        [-14, 20],
        [4, -18],
        [-6, 14],
        [16, 22],
      ];
      const n = d > 0.7 ? 5 : d > 0.5 ? 3 : 1;
      for (let i = 0; i < n; i++) {
        ctx.beginPath();
        ctx.arc(spots[i][0], spots[i][1], 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

export function drawHpBar(ctx: CanvasRenderingContext2D, x: number, y: number, frac: number, col: string, h = 6): void {
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(x - 60, y, 120, h);
  ctx.fillStyle = col;
  ctx.fillRect(x - 60, y, 120 * Math.max(0, frac), h);
}

export function drawShell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  vx: number,
  vy: number,
  col: string,
  rgb: string,
  r: number,
  trail: number,
): void {
  const sp = Math.hypot(vx, vy) || 1;
  const ux = vx / sp;
  const uy = vy / sp;
  // Soft wide exhaust behind a bright core, so a stream of children reads as a stream.
  const g = ctx.createLinearGradient(x, y, x - ux * trail, y - uy * trail);
  g.addColorStop(0, `rgba(${rgb},0.55)`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.strokeStyle = g;
  ctx.lineWidth = r * 2.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - ux * trail, y - uy * trail);
  ctx.stroke();
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.white;
  ctx.beginPath();
  ctx.arc(x + ux * r * 0.3, y + uy * r * 0.3, r * 0.38, 0, Math.PI * 2);
  ctx.fill();
}

/** An unsplit shell drawn as a tight bundle of missiles flying in formation. */
export function drawBundle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  vx: number,
  vy: number,
  col: string,
  rgb: string,
  count: number,
): void {
  const sp = Math.hypot(vx, vy) || 1;
  const ux = vx / sp;
  const uy = vy / sp;
  const px = -uy;
  const py = ux;
  const n = Math.min(6, Math.max(2, count));
  const offsets: Array<[number, number]> = [
    [0, 0],
    [-9, 5],
    [-9, -5],
    [-18, 2],
    [-18, -8],
    [-27, -3],
  ];
  const g = ctx.createLinearGradient(x, y, x - ux * 70, y - uy * 70);
  g.addColorStop(0, `rgba(${rgb},0.5)`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.strokeStyle = g;
  ctx.lineWidth = 18;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - ux * 6, y - uy * 6);
  ctx.lineTo(x - ux * 70, y - uy * 70);
  ctx.stroke();
  for (let i = 0; i < n; i++) {
    const [a, b] = offsets[i];
    const cx = x + ux * a + px * b;
    const cy = y + uy * a + py * b;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(cx, cy, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.white;
    ctx.beginPath();
    ctx.arc(cx + ux * 1.2, cy + uy * 1.2, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Filled fan between two boundary paths (the outermost children of a split). */
export function drawCone(ctx: CanvasRenderingContext2D, left: Pt[], right: Pt[], fill: string, edge: string): void {
  if (left.length < 2 || right.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(left[0].x, left[0].y);
  for (const p of left) ctx.lineTo(p.x, p.y);
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(left[0].x, left[0].y);
  for (const p of left) ctx.lineTo(p.x, p.y);
  ctx.moveTo(right[0].x, right[0].y);
  for (const p of right) ctx.lineTo(p.x, p.y);
  ctx.stroke();
  ctx.setLineDash([]);
}

export function drawPath(ctx: CanvasRenderingContext2D, pts: Pt[], col: string, width: number): void {
  if (pts.length < 2) return;
  ctx.strokeStyle = col;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (const p of pts) ctx.lineTo(p.x, p.y);
  ctx.stroke();
}

/** Launch direction and power, drawn at the muzzle while aiming. */
export function drawLaunchArrow(ctx: CanvasRenderingContext2D, x: number, y: number, vx: number, vy: number, power: number, col: string): void {
  const sp = Math.hypot(vx, vy) || 1;
  const ux = vx / sp;
  const uy = vy / sp;
  const len = 34 + 56 * power;
  const ex = x + ux * len;
  const ey = y + uy * len;
  ctx.strokeStyle = col;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(ex + ux * 10, ey + uy * 10);
  ctx.lineTo(ex - uy * 6, ey + ux * 6);
  ctx.lineTo(ex + uy * 6, ey - ux * 6);
  ctx.closePath();
  ctx.fill();
}

export function drawDotted(ctx: CanvasRenderingContext2D, pts: Pt[], col: string, step = 7, r = 1.6): void {
  if (pts.length === 0) return;
  ctx.fillStyle = col;
  let acc = 0;
  let last = pts[0];
  ctx.beginPath();
  ctx.moveTo(last.x + r, last.y);
  ctx.arc(last.x, last.y, r, 0, Math.PI * 2);
  for (const p of pts) {
    acc += Math.hypot(p.x - last.x, p.y - last.y);
    last = p;
    if (acc >= step) {
      acc = 0;
      ctx.moveTo(p.x + r, p.y);
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    }
  }
  ctx.fill();
}

export function drawSplitMarker(ctx: CanvasRenderingContext2D, x: number, y: number, col: string): void {
  ctx.strokeStyle = col;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, 9, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * 12, y + Math.sin(a) * 12);
    ctx.lineTo(x + Math.cos(a) * 17, y + Math.sin(a) * 17);
    ctx.stroke();
  }
}

export function drawBurst(ctx: CanvasRenderingContext2D, x: number, y: number, col: string, r: number, a: number): void {
  ctx.strokeStyle = col;
  ctx.globalAlpha = a;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = a * 0.4;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

export function drawSparks(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  n: number,
  seed: number,
  scale: number,
  alpha: number,
  col: string = C.white,
): void {
  let s = seed >>> 0;
  const r = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  ctx.strokeStyle = col;
  ctx.lineWidth = 1.5;
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    const d = (6 + r() * 22) * scale;
    const l = (4 + r() * 8) * scale;
    ctx.globalAlpha = alpha * (0.5 + r() * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
    ctx.lineTo(x + Math.cos(a) * (d + l), y + Math.sin(a) * (d + l));
    ctx.stroke();
  }
  ctx.globalAlpha = alpha * 0.22;
  ctx.beginPath();
  ctx.arc(x, y, 12 * scale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

export function drawDebris(ctx: CanvasRenderingContext2D, d: Debris, maxHp: number): void {
  let s = d.seed >>> 0;
  const r = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  ctx.save();
  ctx.translate(d.x, d.y);
  ctx.beginPath();
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rad = d.radius * (0.75 + r() * 0.4);
    ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  ctx.closePath();
  ctx.fillStyle = C.debris;
  ctx.fill();
  ctx.strokeStyle = C.debrisEdge;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  if (d.hp < maxHp * 0.7) {
    ctx.strokeStyle = C.bg;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-6, -18);
    ctx.lineTo(2, -4);
    ctx.lineTo(-4, 8);
    ctx.lineTo(6, 20);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(154,163,184,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -d.radius - 8);
  ctx.lineTo(0, -d.radius - 20);
  ctx.stroke();
  ctx.restore();
}

export function drawDragUI(ctx: CanvasRenderingContext2D, sx: number, sy: number, cx: number, cy: number, col: string): void {
  ctx.strokeStyle = col;
  ctx.lineWidth = 2.5;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(cx, cy);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(sx, sy, 10, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(cx, cy, 7, 0, Math.PI * 2);
  ctx.fill();
}

export function drawEdgeArrow(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, col: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.lineTo(-6, -9);
  ctx.lineTo(-6, 9);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = col;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.arc(-2, 0, 18, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function text(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  size: number,
  col: string,
  weight = 600,
  align: CanvasTextAlign = 'center',
): void {
  ctx.fillStyle = col;
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
