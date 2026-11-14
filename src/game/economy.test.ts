import { describe, expect, it } from 'vitest';
import { count } from './bag';
import { CONFIG } from './config';
import { flatGame, instant, run } from './testutil';

const F = CONFIG.food;

describe('población y comida', () => {
  it('la partida empieza con 3 personas, una de cada rol', () => {
    const g = flatGame();
    expect(g.population).toBe(3);
    expect(g.npcs.map((n) => n.role).sort()).toEqual(['constructor', 'operator', 'transporter']);
  });

  it('la población consume comida del almacén con el tiempo', () => {
    const g = flatGame();
    const food = count(g.storage, 'food');
    run(g, F.interval + 0.5);
    expect(count(g.storage, 'food')).toBe(food - 3 * F.perPerson);
    expect(g.foodPerMinute()).toBeCloseTo((3 * F.perPerson * 60) / F.interval);
  });

  it('sin comida hay hambre: trabajan y andan más despacio', () => {
    const g = flatGame();
    const n = g.npcs[0];
    const speed = g.npcSpeed(n);
    const work = g.npcWork(n);
    g.storage.food = 0;
    run(g, F.interval);
    expect(g.hungry).toBe(true);
    expect(g.npcSpeed(n)).toBeCloseTo(speed * F.hungryFactor);
    expect(g.npcWork(n)).toBeCloseTo(work * F.hungryFactor);
    // Al volver a haber comida, se recupera.
    g.storage.food = 10;
    run(g, 0.1);
    expect(g.hungry).toBe(false);
  });

  it('con hambre prolongada la gente se marcha, y con 0 se pierde la partida', () => {
    const g = flatGame();
    g.storage.food = 0;
    run(g, F.interval / 3 + F.starveGrace + 1);
    expect(g.population).toBe(2);
    expect(g.stats.npcLeft).toBe(1);
    run(g, F.leaveInterval * 2 + 1);
    expect(g.population).toBe(0);
    expect(g.gameOver).toBe(true);
  });

  it('si los enemigos matan a todos, se pierde la partida', () => {
    const g = flatGame();
    for (const n of [...g.npcs]) g.killNpc(n);
    expect(g.gameOver).toBe(true);
    expect(g.drainEvents().some((e) => e.type === 'gameOver')).toBe(true);
  });
});

describe('granjas', () => {
  it('una granja pegada al núcleo produce comida sin electricidad', () => {
    const g = flatGame();
    g.npcs = [];
    const food = count(g.storage, 'food');
    instant(g, 'farm', 8, 9, 0); // apunta al núcleo (9,9)
    run(g, CONFIG.farm.period * 4 + 0.5);
    expect(count(g.storage, 'food') - food).toBe(4);
  });

  it('con electricidad la granja rinde más', () => {
    const g = flatGame();
    const farm = instant(g, 'farm', 8, 9, 0);
    const [lo, hi] = CONFIG.power.mult.farm!;
    expect(hi).toBeGreaterThan(lo);
    expect(lo).toBeGreaterThan(0);
    farm.power = 1;
    expect(g.producerOf(farm)!.item).toBe('food');
  });

  it('la granja necesita tierra libre de mena', () => {
    const g = flatGame([[3, 3, 1]]);
    expect(g.canPlace('farm', 3, 3).ok).toBe(false);
    expect(g.canPlace('farm', 4, 3).ok).toBe(true);
  });

  it('una granja lejos del almacén: un Transportista recoge la comida', () => {
    const g = flatGame();
    g.storage.food = 100;
    instant(g, 'farm', 3, 3, 3);
    run(g, 60);
    // Come 3 cada 20 s (9 en 60 s); la granja da 12 y se recogen en tandas de ≥ collectMin.
    expect(count(g.storage, 'food')).toBeGreaterThan(100 - 9);
  });
});
