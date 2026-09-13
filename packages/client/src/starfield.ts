import { C, LH, LW } from './palette';

interface Star {
  x: number;
  y: number;
  len: number;
  alpha: number;
  speed: number;
}

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Two layers of streaks drifting "backward" (down) to sell forward motion. */
export class Starfield {
  private readonly stars: Star[] = [];

  constructor(seed = 3) {
    const r = seeded(seed);
    for (let i = 0; i < 130; i++) {
      this.stars.push({ x: r() * LW, y: r() * LH, len: 2 + r() * 4, alpha: 0.12 + r() * 0.3, speed: 30 + r() * 20 });
    }
    for (let i = 0; i < 55; i++) {
      this.stars.push({ x: r() * LW, y: r() * LH, len: 5 + r() * 7, alpha: 0.35 + r() * 0.4, speed: 80 + r() * 40 });
    }
  }

  draw(ctx: CanvasRenderingContext2D, time: number): void {
    ctx.lineWidth = 1;
    for (const s of this.stars) {
      const y = (s.y + time * s.speed) % (LH + 20);
      ctx.strokeStyle = `rgba(${C.star},${s.alpha})`;
      ctx.beginPath();
      ctx.moveTo(s.x, y - s.len);
      ctx.lineTo(s.x, y);
      ctx.stroke();
    }
  }

  drawPlanet(ctx: CanvasRenderingContext2D): void {
    const g = ctx.createRadialGradient(640, 1560, 700, 640, 1560, 980);
    g.addColorStop(0, C.planet1);
    g.addColorStop(1, C.planet2);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(640, 1560, 980, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = C.rim;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(640, 1560, 980, 0, Math.PI * 2);
    ctx.stroke();
  }
}
