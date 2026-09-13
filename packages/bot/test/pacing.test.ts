import { describe, it } from 'vitest';
import { createBot } from '@splitfire/bot';
import { TICK_RATE, createWorld, step, type Input } from '@splitfire/sim';

// Not an assertion: prints match pacing so balance changes are visible in the test log.
describe('pacing report', () => {
  it('reports bot-vs-bot match lengths', () => {
    const rows: string[] = [];
    for (const [a, b] of [['normal', 'normal'], ['hard', 'easy'], ['easy', 'hard']] as const) {
      for (const seed of [1, 2, 3]) {
        const world = createWorld(seed);
        const bots = [createBot(0, a, seed), createBot(1, b, seed + 100)];
        while (world.winner === null && world.tick < TICK_RATE * 400) {
          const inputs: Input[] = [...bots[0].update(world), ...bots[1].update(world)];
          step(world, inputs);
        }
        const hp = world.ships.map((s) => s.hp).join('/');
        rows.push(`${a} vs ${b} seed ${seed}: winner ${world.winner ?? 'none'} after ${(world.tick / TICK_RATE).toFixed(0)}s, hp ${hp}`);
      }
    }
    console.log(rows.join('\n'));
  });
});
