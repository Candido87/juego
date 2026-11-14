import { describe, expect, it } from 'vitest';
import { botTick } from './bot';
import { CONFIG } from './config';
import { Game } from './game';
import { Ore } from './types';
import { MAX_HEIGHT, createFlatWorld, generateWorld } from './world';

function flatGame(oreTiles: [number, number, Ore][] = []) {
  const world = createFlatWorld(20, 20);
  for (const [x, y, o] of oreTiles) world.ore[y * 20 + x] = o;
  return new Game({ world });
}

describe('mundo', () => {
  it('es determinista por semilla y respeta alturas 0..2 con desnivel ≤ 1', () => {
    const a = generateWorld(5, 40, 40);
    const b = generateWorld(5, 40, 40);
    expect(Array.from(a.height)).toEqual(Array.from(b.height));
    for (let y = 0; y < 40; y++)
      for (let x = 0; x < 40; x++) {
        const h = a.height[y * 40 + x];
        expect(h).toBeLessThanOrEqual(MAX_HEIGHT);
        if (x + 1 < 40) expect(Math.abs(h - a.height[y * 40 + x + 1])).toBeLessThanOrEqual(1);
        if (y + 1 < 40) expect(Math.abs(h - a.height[(y + 1) * 40 + x])).toBeLessThanOrEqual(1);
      }
  });
});

describe('economía y cintas (sin gráficos)', () => {
  it('taladro → cintas → núcleo genera créditos', () => {
    // Núcleo en (9,9)-(10,10). Mena en (4,9); cintas (5..8, 9) hacia +x.
    const g = flatGame([[4, 9, Ore.Copper]]);
    expect(g.place('drill', 4, 9, 0)).not.toBeNull();
    for (let x = 5; x <= 8; x++) expect(g.place('belt', x, 9, 0)).not.toBeNull();
    const after = g.credits;
    g.update(0); // nada
    for (let i = 0; i < 30 * 20; i++) g.step(CONFIG.step); // 20 s
    expect(g.stats.delivered).toBeGreaterThanOrEqual(7);
    expect(g.credits).toBe(after + g.stats.delivered * CONFIG.oreValue[Ore.Copper]);
  });

  it('una cinta no acepta objetos de una cinta enfrentada', () => {
    const g = flatGame([[4, 9, Ore.Iron]]);
    g.place('drill', 4, 9, 0);
    g.place('belt', 5, 9, 2); // apunta hacia el taladro
    for (let i = 0; i < 30 * 5; i++) g.step(CONFIG.step);
    expect(g.buildingAt(5, 9)!.item).toBe(Ore.None);
  });

  it('el taladro necesita mena y cuesta créditos', () => {
    const g = flatGame([[2, 2, Ore.Iron]]);
    expect(g.canPlace('drill', 3, 3).ok).toBe(false);
    const before = g.credits;
    g.place('drill', 2, 2, 0);
    expect(g.credits).toBe(before - CONFIG.cost.drill);
    expect(g.remove(2, 2)).toBe(true);
    expect(g.credits).toBe(before - CONFIG.cost.drill + Math.floor(CONFIG.cost.drill * CONFIG.refund));
  });

  it('no deja bloquear por completo el camino al núcleo', () => {
    const g = flatGame();
    g.credits = 1e6;
    // Rodear el núcleo (9,9)-(10,10) con torres: la última debe rechazarse.
    const ring: [number, number][] = [];
    for (let x = 8; x <= 11; x++) ring.push([x, 8], [x, 11]);
    for (let y = 9; y <= 10; y++) ring.push([8, y], [11, y]);
    const results = ring.map(([x, y]) => g.place('tower', x, y) !== null);
    expect(results.filter((r) => !r).length).toBeGreaterThan(0);
    for (const s of g.spawns) expect(g.distAt(s.x, s.y)).toBeGreaterThan(0);
  });
});

describe('oleadas', () => {
  it('sin defensas los enemigos dañan el núcleo', () => {
    const g = flatGame();
    g.callWaveNow();
    for (let i = 0; i < 30 * 40; i++) g.step(CONFIG.step);
    expect(g.wave).toBeGreaterThanOrEqual(1);
    expect(g.coreHp).toBeLessThan(CONFIG.coreHp);
  });

  it('las torres matan enemigos y dan recompensa', () => {
    const g = flatGame();
    g.credits = 1e6;
    for (const [x, y] of [[8, 7], [12, 7], [7, 12], [12, 12], [8, 12], [12, 8]]) g.place('tower', x, y);
    g.callWaveNow();
    for (let i = 0; i < 30 * 40; i++) g.step(CONFIG.step);
    expect(g.stats.kills).toBeGreaterThan(0);
    expect(g.coreHp).toBe(CONFIG.coreHp);
  });

  it('simulación completa con el bot es determinista', () => {
    const run = () => {
      const g = new Game({ seed: 3 });
      for (let t = 0; t < 180; t += 0.5) {
        g.update(0.5);
        botTick(g);
      }
      return { credits: g.credits, hp: g.coreHp, wave: g.wave, kills: g.stats.kills, delivered: g.stats.delivered };
    };
    const a = run();
    expect(a).toEqual(run());
    expect(a.delivered).toBeGreaterThan(0);
    expect(a.wave).toBeGreaterThan(0);
  });
});
