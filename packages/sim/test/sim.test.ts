import { describe, expect, it } from 'vitest';
import {
  MUNITIONS,
  SHIP_MAX_HP,
  createWorld,
  dcos,
  dsin,
  hashWorld,
  previewShot,
  step,
  type Input,
  type World,
} from '@splitfire/sim';

function run(world: World, script: Record<number, Input[]>, ticks: number): void {
  for (let t = 0; t < ticks; t++) {
    step(world, script[world.tick + 1] ?? []);
  }
}

const volley: Record<number, Input[]> = {
  1: [{ type: 'fire', player: 0, kind: 'x10', vx: 300, vy: -330 }],
  2: [{ type: 'move', player: 1, x: 900, y: 300 }],
  30: [{ type: 'fire', player: 1, kind: 'x5', vx: -300, vy: -330 }],
  75: [{ type: 'fire', player: 0, kind: 'x20', vx: 292, vy: -324 }],
  76: [{ type: 'ignite', player: 0 }],
  200: [{ type: 'fire', player: 1, kind: 'x20', vx: -292, vy: -324 }],
};

describe('deterministic math', () => {
  it('matches Math.sin and Math.cos closely', () => {
    for (let a = -20; a <= 20; a += 0.137) {
      expect(Math.abs(dsin(a) - Math.sin(a))).toBeLessThan(1e-6);
      expect(Math.abs(dcos(a) - Math.cos(a))).toBeLessThan(1e-6);
    }
  });
});

describe('determinism', () => {
  it('produces identical hashes for identical seeds and inputs', () => {
    const a = createWorld(1234);
    const b = createWorld(1234);
    run(a, volley, 900);
    run(b, volley, 900);
    expect(hashWorld(a)).toBe(hashWorld(b));
    expect(a.shells.length).toBe(b.shells.length);
  });

  it('diverges for different seeds once debris has spawned', () => {
    const a = createWorld(1);
    const b = createWorld(2);
    run(a, {}, 600);
    run(b, {}, 600);
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });
});

describe('firing', () => {
  it('spends ammo and starts the cooldown', () => {
    const w = createWorld(7);
    step(w, [{ type: 'fire', player: 0, kind: 'x10', vx: 300, vy: -300 }]);
    expect(w.ships[0].ammo.x10).toBe(9);
    expect(w.ships[0].cooldown).toBe(MUNITIONS.x10.cooldownTicks - 1);
    expect(w.shells.length).toBe(1);
    expect(w.shells[0].mass).toBe(10);
    // Blocked while cooling down.
    step(w, [{ type: 'fire', player: 0, kind: 'x5', vx: 300, vy: -300 }]);
    expect(w.shells.length).toBe(1);
    expect(w.ships[0].ammo.x10).toBe(9);
  });

  it('refuses finite munitions once they run out', () => {
    const w = createWorld(7);
    w.ships[0].ammo.x20 = 0;
    step(w, [{ type: 'fire', player: 0, kind: 'x20', vx: 300, vy: -300 }]);
    expect(w.shells.length).toBe(0);
  });
});

describe('cluster split', () => {
  it('splits at the apex into the full child count', () => {
    const w = createWorld(3);
    step(w, [{ type: 'fire', player: 0, kind: 'x10', vx: 250, vy: -300 }]);
    let splitEvent = null;
    for (let t = 0; t < 120 && !splitEvent; t++) {
      step(w, []);
      splitEvent = w.events.find((e) => e.type === 'split') ?? null;
    }
    expect(splitEvent).not.toBeNull();
    const children = w.shells.filter((s) => !s.parent);
    expect(children.length).toBe(10);
    expect(w.shells.some((s) => s.parent)).toBe(false);
    // The fan is symmetric about the parent's direction at the apex, which is horizontal.
    const meanVy = children.reduce((a, s) => a + s.vy, 0) / children.length;
    expect(Math.abs(meanVy)).toBeLessThan(15);
  });

  it('ignites early on request', () => {
    const w = createWorld(3);
    step(w, [{ type: 'fire', player: 0, kind: 'x5', vx: 250, vy: -300 }]);
    step(w, []);
    step(w, [{ type: 'ignite', player: 0 }]);
    expect(w.events.some((e) => e.type === 'split')).toBe(true);
    expect(w.shells.filter((s) => !s.parent).length).toBe(5);
  });

  it('preview matches the simulated apex', () => {
    const w = createWorld(3);
    const pv = previewShot(w, 0, 250, -300, 'x10');
    expect(pv.apex).not.toBeNull();
    step(w, [{ type: 'fire', player: 0, kind: 'x10', vx: 250, vy: -300 }]);
    let split: { x: number; y: number } | null = null;
    for (let t = 0; t < 120 && !split; t++) {
      step(w, []);
      const e = w.events.find((ev) => ev.type === 'split');
      if (e && e.type === 'split') split = { x: e.x, y: e.y };
    }
    expect(split).not.toBeNull();
    expect(Math.abs(split!.x - pv.apex!.x)).toBeLessThan(1e-6);
    expect(Math.abs(split!.y - pv.apex!.y)).toBeLessThan(1e-6);
  });
});

describe('annihilation', () => {
  it('cancels opposing shells mass for mass', () => {
    const w = createWorld(3);
    w.shells.push(
      { id: 100, owner: 0, kind: 'x10', x: 600, y: 300, vx: 100, vy: 0, mass: 10, radius: 8, parent: true, age: 5 },
      { id: 101, owner: 1, kind: 'x5', x: 606, y: 300, vx: -100, vy: 0, mass: 1, radius: 4, parent: false, age: 5 },
    );
    step(w, []);
    const ev = w.events.find((e) => e.type === 'annihilate');
    expect(ev).toBeDefined();
    expect(w.shells.length).toBe(1);
    expect(w.shells[0].owner).toBe(0);
    expect(w.shells[0].mass).toBe(9);
  });

  it('same-side shells pass through each other', () => {
    const w = createWorld(3);
    w.shells.push(
      { id: 100, owner: 0, kind: 'x5', x: 600, y: 300, vx: 0, vy: 0, mass: 1, radius: 4, parent: false, age: 5 },
      { id: 101, owner: 0, kind: 'x5', x: 602, y: 300, vx: 0, vy: 0, mass: 1, radius: 4, parent: false, age: 5 },
    );
    step(w, []);
    expect(w.shells.length).toBe(2);
  });
});

describe('damage and victory', () => {
  it('damages the ship by shell mass and declares a winner', () => {
    const w = createWorld(3);
    const enemy = w.ships[1];
    w.shells.push({ id: 100, owner: 0, kind: 'x5', x: enemy.x, y: enemy.y - 60, vx: 0, vy: 300, mass: 1, radius: 4, parent: false, age: 5 });
    for (let t = 0; t < 30 && enemy.hp === SHIP_MAX_HP; t++) step(w, []);
    expect(enemy.hp).toBe(SHIP_MAX_HP - 1);
    enemy.hp = 1;
    w.shells.push({ id: 101, owner: 0, kind: 'x5', x: enemy.x, y: enemy.y - 60, vx: 0, vy: 300, mass: 1, radius: 4, parent: false, age: 5 });
    for (let t = 0; t < 30 && enemy.alive; t++) step(w, []);
    expect(enemy.alive).toBe(false);
    expect(w.winner).toBe(0);
  });
});

describe('movement', () => {
  it('moves toward the target, spends fuel and stays in bounds', () => {
    const w = createWorld(3);
    const ship = w.ships[0];
    step(w, [{ type: 'move', player: 0, x: 5000, y: 5000 }]);
    expect(ship.target).toEqual({ x: ship.bounds.x1, y: ship.bounds.y1 });
    const fuel0 = ship.fuel;
    step(w, []);
    expect(ship.fuel).toBeLessThan(fuel0);
    for (let t = 0; t < 600; t++) step(w, []);
    expect(ship.x).toBeLessThanOrEqual(ship.bounds.x1);
    expect(ship.y).toBeLessThanOrEqual(ship.bounds.y1);
    expect(ship.fuel).toBeGreaterThanOrEqual(0);
  });
});
