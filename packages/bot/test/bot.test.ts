import { describe, expect, it } from 'vitest';
import { createBot, DIFFICULTY } from '@splitfire/bot';
import { TICK_RATE, createWorld, step, type Input } from '@splitfire/sim';

function play(seed: number, a: keyof typeof DIFFICULTY, b: keyof typeof DIFFICULTY, maxTicks: number) {
  const world = createWorld(seed);
  const bots = [createBot(0, a, seed), createBot(1, b, seed + 1)];
  let fired = 0;
  while (world.winner === null && world.tick < maxTicks) {
    const inputs: Input[] = [...bots[0].update(world), ...bots[1].update(world)];
    fired += inputs.filter((i) => i.type === 'fire').length;
    step(world, inputs);
  }
  return { world, fired };
}

describe('bot', () => {
  it('fires, and two bots finish a match in a reasonable time', () => {
    const seconds: number[] = [];
    for (const seed of [11, 22, 33, 44]) {
      const { world, fired } = play(seed, 'normal', 'normal', TICK_RATE * 300);
      expect(fired).toBeGreaterThan(5);
      expect(world.winner).not.toBeNull();
      seconds.push(world.tick / TICK_RATE);
    }
    // Sanity band for pacing: not a coin flip, not a stalemate.
    for (const s of seconds) {
      expect(s).toBeGreaterThan(15);
      expect(s).toBeLessThan(300);
    }
  });

  it('never emits inputs for a dead ship', () => {
    const world = createWorld(5);
    const bot = createBot(1, 'hard', 5);
    world.ships[1].alive = false;
    for (let t = 0; t < 60; t++) {
      expect(bot.update(world)).toEqual([]);
      step(world, []);
    }
  });

  it('easy bots are worse shots than hard bots', () => {
    expect(DIFFICULTY.easy.aimNoise).toBeGreaterThan(DIFFICULTY.hard.aimNoise);
    expect(DIFFICULTY.easy.reactionTicks).toBeGreaterThan(DIFFICULTY.hard.reactionTicks);
  });
});
