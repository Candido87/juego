import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { flatGame, instant, powerUp, run } from './testutil';
import type { Game } from './game';

/** Cinta recta por y=9 de x=2 a x=8 hacia el núcleo, con postes y generador; `heights` fija el nivel de cada casilla de x. */
function lane(heights: Record<number, number>, elevatorAt?: number) {
  const g = flatGame();
  g.npcs = [];
  for (const [x, h] of Object.entries(heights)) g.world.height[9 * g.world.w + Number(x)] = h;
  const belts = [2, 3, 4, 5, 6, 7, 8].map((x) => instant(g, x === elevatorAt ? 'elevator' : 'belt', x, 9, 0));
  powerUp(g, [[3, 10], [6, 10]], [1, 10]);
  run(g, 0.3);
  return { g, belts };
}
function feed(g: Game, first: { item: unknown; beltProgress: number }, seconds: number): number {
  const before = g.storage.iron_ore ?? 0;
  for (let i = 0; i < seconds / CONFIG.step; i++) {
    if (first.item === null) {
      (first as { item: string | null }).item = 'iron_ore';
      first.beltProgress = 0;
    }
    g.step(CONFIG.step);
  }
  return (g.storage.iron_ore ?? 0) - before;
}

describe('CIN3 · rampas y pendientes', () => {
  it('un desnivel de 1 se sube con rampa: pasa todo, pero más despacio que en llano', () => {
    const flat = lane({});
    const up = lane({ 5: 1, 6: 1, 7: 1, 8: 1 });
    const a = feed(flat.g, flat.belts[0], 60);
    const b = feed(up.g, up.belts[0], 60);
    expect(b).toBeGreaterThan(10);
    expect(b).toBeLessThan(a * 0.8);
  });

  it('bajar un nivel no frena', () => {
    const flat = lane({});
    const down = lane({ 2: 1, 3: 1, 4: 1 });
    const a = feed(flat.g, flat.belts[0], 60);
    const b = feed(down.g, down.belts[0], 60);
    expect(Math.abs(a - b)).toBeLessThanOrEqual(3);
  });

  it('un desnivel de 2 niveles o más bloquea la cinta: el material espera y no se pierde', () => {
    const { g, belts } = lane({ 5: 2, 6: 2, 7: 2, 8: 2 });
    expect(feed(g, belts[0], 30)).toBe(0);
    expect(belts[2].item).not.toBeNull(); // la cinta antes del salto se queda con su objeto
    expect(g.slopeAhead(belts[2])).toBe(2);
    expect(g.slopeOk(belts[2], belts[3])).toBe(false);
  });
});

describe('CIN4 · ascensor de cintas', () => {
  it('salva un salto de 3 niveles que la cinta sola no puede', () => {
    const { g, belts } = lane({ 5: 3, 6: 3, 7: 3, 8: 3 }, 4);
    expect(belts[2].kind).toBe('elevator');
    const n = feed(g, belts[0], 60);
    expect(n).toBeGreaterThan(10);
    expect(g.slopeOk(belts[2], belts[3])).toBe(true);
  });

  it('es más lento que una cinta', () => {
    const flat = lane({});
    const lift = lane({ 5: 3, 6: 3, 7: 3, 8: 3 }, 4);
    const a = feed(flat.g, flat.belts[0], 60);
    const b = feed(lift.g, lift.belts[0], 60);
    expect(b).toBeLessThan(a);
    expect(b).toBeLessThanOrEqual(Math.ceil(CONFIG.elevator.speed * 60) + 2);
  });

  it('más allá de su alcance tampoco sube', () => {
    const { g, belts } = lane({ 5: CONFIG.elevator.maxRise + 1, 6: 5, 7: 5, 8: 5 }, 4);
    expect(g.slopeOk(belts[2], belts[3])).toBe(false);
  });

  it('las tuberías tampoco pasan un desnivel de 2', () => {
    const g = flatGame();
    g.npcs = [];
    g.world.height[3 * g.world.w + 5] = 2;
    const a = instant(g, 'pipeline', 4, 3, 0);
    const b = instant(g, 'pipeline', 5, 3, 0);
    expect(g.slopeOk(a, b)).toBe(false);
    a.inv = { oil: 1 };
    run(g, 5);
    expect(b.inv.oil ?? 0).toBe(0);
  });
});
