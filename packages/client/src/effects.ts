import type { SimEvent } from '@splitfire/sim';
import { C } from './palette';
import { drawBurst, drawSparks } from './draw';

export type EffectKind = 'fire' | 'split' | 'annihilate' | 'shipHit' | 'shipDestroyed' | 'debrisHit' | 'debrisDestroyed';

export interface Effect {
  kind: EffectKind;
  x: number;
  y: number;
  t0: number;
  life: number;
  col: string;
  seed: number;
  size: number;
}

const MAX_EFFECTS = 90;

/** Short-lived visual responses to simulation events. Render-side only. */
export class Effects {
  list: Effect[] = [];
  private seed = 1;

  spawn(events: ReadonlyArray<SimEvent>, now: number, me: 0 | 1): number {
    let shake = 0;
    for (const e of events) {
      switch (e.type) {
        case 'fire':
          this.push({ kind: 'fire', x: e.x, y: e.y, t0: now, life: 0.18, col: e.player === me ? C.me : C.foe, seed: this.seed++, size: 1 });
          break;
        case 'split': {
          const big = e.count >= 15 ? 1.4 : e.count >= 8 ? 1.15 : 1;
          this.push({ kind: 'split', x: e.x, y: e.y, t0: now, life: 0.65, col: e.player === me ? C.me : C.foe, seed: this.seed++, size: big });
          if (e.count >= 15) shake += 1.5;
          break;
        }
        case 'annihilate': {
          // Many pairs cancel in the same tick; merge sparks that would overlap.
          const near = this.list.find((f) => f.kind === 'annihilate' && now - f.t0 < 0.12 && Math.abs(f.x - e.x) < 22 && Math.abs(f.y - e.y) < 22);
          if (near) {
            near.size = Math.min(1.6, near.size + 0.15);
            break;
          }
          this.push({ kind: 'annihilate', x: e.x, y: e.y, t0: now, life: 0.38, col: C.white, seed: this.seed++, size: 0.6 + Math.min(1, e.mass * 0.15) });
          if (e.mass >= 3) shake += 1.5;
          break;
        }
        case 'shipHit':
          this.push({ kind: 'shipHit', x: e.x, y: e.y, t0: now, life: e.damage >= 3 ? 0.6 : 0.32, col: C.white, seed: this.seed++, size: 0.6 + Math.min(2.5, e.damage * 0.25) });
          shake += (e.player === me ? 3 : 1.5) + Math.min(6, e.damage * 0.5);
          break;
        case 'shipDestroyed':
          this.push({ kind: 'shipDestroyed', x: e.x, y: e.y, t0: now, life: 1.6, col: e.player === me ? C.me : C.foe, seed: this.seed++, size: 1 });
          shake += 14;
          break;
        case 'debrisHit':
          this.push({ kind: 'debrisHit', x: e.x, y: e.y, t0: now, life: 0.28, col: C.debrisEdge, seed: this.seed++, size: 0.5 });
          break;
        case 'debrisDestroyed':
          this.push({ kind: 'debrisDestroyed', x: e.x, y: e.y, t0: now, life: 0.6, col: C.debrisEdge, seed: this.seed++, size: 1 });
          shake += 1;
          break;
        default:
          break;
      }
    }
    return shake;
  }

  private push(e: Effect): void {
    this.list.push(e);
    if (this.list.length > MAX_EFFECTS) this.list.splice(0, this.list.length - MAX_EFFECTS);
  }

  prune(now: number): void {
    this.list = this.list.filter((e) => now - e.t0 < e.life);
  }

  draw(ctx: CanvasRenderingContext2D, now: number): void {
    for (const e of this.list) {
      const k = Math.min(1, (now - e.t0) / e.life);
      const fade = 1 - k;
      switch (e.kind) {
        case 'fire':
          drawBurst(ctx, e.x, e.y, e.col, 6 + k * 14, fade * 0.7);
          break;
        case 'split':
          drawBurst(ctx, e.x, e.y, e.col, (12 + k * 52) * e.size, fade * 0.85);
          break;
        case 'annihilate':
          drawSparks(ctx, e.x, e.y, 6, e.seed, e.size * (0.7 + k * 0.6), fade);
          break;
        case 'shipHit':
          ctx.globalAlpha = fade;
          ctx.fillStyle = C.white;
          ctx.beginPath();
          ctx.arc(e.x, e.y, 3 + k * 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          drawSparks(ctx, e.x, e.y, 6, e.seed, e.size * (0.5 + k * 0.5), fade);
          break;
        case 'debrisHit':
          drawSparks(ctx, e.x, e.y, 4, e.seed, 0.5 + k * 0.3, fade, C.debrisEdge);
          break;
        case 'debrisDestroyed':
          drawBurst(ctx, e.x, e.y, C.debrisEdge, 10 + k * 40, fade * 0.6);
          drawSparks(ctx, e.x, e.y, 8, e.seed, 1 + k, fade, C.debrisEdge);
          break;
        case 'shipDestroyed': {
          drawBurst(ctx, e.x, e.y, C.white, 10 + k * 160, fade * 0.9);
          drawBurst(ctx, e.x, e.y, e.col, 6 + k * 110, fade * 0.7);
          drawSparks(ctx, e.x, e.y, 14, e.seed, 1.5 + k * 3, fade, C.amber);
          // Embers drifting outward.
          let s = e.seed >>> 0;
          const r = () => {
            s = (s * 1664525 + 1013904223) >>> 0;
            return s / 4294967296;
          };
          ctx.fillStyle = C.amber;
          ctx.globalAlpha = fade;
          for (let i = 0; i < 12; i++) {
            const a = r() * Math.PI * 2;
            const d = (20 + r() * 90) * k;
            ctx.beginPath();
            ctx.arc(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d + k * k * 60, 2 + r() * 2, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
          break;
        }
        default:
          break;
      }
    }
  }
}
