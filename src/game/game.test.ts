import { describe, expect, it } from 'vitest';
import { count } from './bag';
import { botTick } from './bot';
import { CONFIG } from './config';
import { Game } from './game';
import { bfsPath } from './path';
import { BuildKind, Ore } from './types';
import { MAX_HEIGHT, createFlatWorld, generateWorld } from './world';

export function flatGame(oreTiles: [number, number, Ore][] = [], opts: { waves?: boolean } = {}) {
  const world = createFlatWorld(20, 20);
  for (const [x, y, o] of oreTiles) world.ore[y * 20 + x] = o;
  return new Game({ world, noWaves: !opts.waves });
}

export function run(g: Game, seconds: number) {
  for (let i = 0; i < seconds / CONFIG.step; i++) g.step(CONFIG.step);
}

/** Construye al instante (para preparar escenarios de test). */
export function instant(g: Game, kind: BuildKind, x: number, y: number, dir: 0 | 1 | 2 | 3 = 0) {
  g.unlockedBuildings.add(kind);
  const b = g.place(kind, x, y, dir)!;
  expect(b).not.toBeNull();
  g.completeBuilding(b);
  return b;
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

describe('rutas', () => {
  it('BFS esquiva obstáculos', () => {
    const wall = (x: number, y: number) => !(x === 2 && y < 4);
    const p = bfsPath(5, 5, { x: 0, y: 0 }, (x, y) => x === 4 && y === 0, wall)!;
    expect(p).not.toBeNull();
    expect(p.some((t) => t.x === 2 && t.y < 4)).toBe(false);
    expect(p[p.length - 1]).toEqual({ x: 4, y: 0 });
  });
});

describe('NPCs y cola de trabajos', () => {
  it('colocar crea una obra; un Constructor la levanta gastando piezas', () => {
    const g = flatGame();
    const plates = count(g.storage, 'iron_plate');
    const gears = count(g.storage, 'gear');
    const b = g.place('turret_bullet', 4, 4)!;
    expect(b.built).toBe(false);
    run(g, 30);
    expect(b.built).toBe(true);
    expect(count(g.storage, 'iron_plate')).toBe(plates - 6);
    expect(count(g.storage, 'gear')).toBe(gears - 3);
  });

  it('sin NPCs no se construye nada', () => {
    const g = flatGame();
    g.npcs = [];
    const b = g.place('turret_bullet', 4, 4)!;
    run(g, 30);
    expect(b.built).toBe(false);
  });

  it('el trabajo con más prioridad se hace antes', () => {
    const g = flatGame();
    g.npcs = g.npcs.slice(0, 1);
    const near = g.place('turret_bullet', 7, 9)!;
    const far = g.place('turret_bullet', 2, 2)!;
    g.jobs.refresh(g);
    const farJob = g.jobs.list().find((j) => j.buildingId === far.id)!;
    g.jobs.setPriority(farJob.id, 8);
    for (let t = 0; t < 60 && !(near.built || far.built); t += 0.1) run(g, 0.1);
    expect(far.built).toBe(true);
    expect(near.built).toBe(false);
  });

  it('a igual prioridad coge la obra más cercana', () => {
    const g = flatGame();
    g.npcs = g.npcs.slice(0, 1);
    const far = g.place('turret_bullet', 1, 1)!;
    const near = g.place('turret_bullet', 7, 10)!;
    for (let t = 0; t < 60 && !(near.built || far.built); t += 0.1) run(g, 0.1);
    expect(near.built).toBe(true);
  });

  it('cancelar una obra devuelve lo entregado', () => {
    const g = flatGame();
    const before = { ...g.storage };
    g.place('turret_bullet', 3, 3);
    run(g, 3);
    g.remove(3, 3);
    run(g, 15);
    expect(g.storage).toEqual(before);
    expect(g.buildingAt(3, 3)).toBeUndefined();
  });

  it('desmontar lo hace un Constructor y devuelve el 50 %', () => {
    const g = flatGame();
    const before = count(g.storage, 'iron_plate');
    const b = instant(g, 'turret_bullet', 4, 4);
    g.remove(4, 4);
    expect(b.markedForRemoval).toBe(true);
    run(g, 20);
    expect(g.buildingAt(4, 4)).toBeUndefined();
    expect(count(g.storage, 'iron_plate')).toBe(before + Math.floor(6 * CONFIG.deconstruct.refund));
  });

  it('contratar cuesta piezas y añade un NPC', () => {
    const g = flatGame();
    const n = g.npcs.length;
    const plates = count(g.storage, 'iron_plate');
    expect(g.hire('constructor')).not.toBeNull();
    expect(g.npcs.length).toBe(n + 1);
    expect(count(g.storage, 'iron_plate')).toBe(plates - CONFIG.npc.roles.constructor.cost.iron_plate!);
  });

  it('los NPCs no atraviesan edificios sólidos', () => {
    const g = flatGame();
    g.npcs = g.npcs.slice(0, 1);
    // Muro de torretas en x=5 de y=0..8; obra al otro lado.
    for (let y = 0; y <= 8; y++) instant(g, 'turret_bullet', 5, y);
    const target = g.place('turret_bullet', 3, 2)!;
    const n = g.npcs[0];
    for (let i = 0; i < 40 / CONFIG.step && !target.built; i++) {
      g.step(CONFIG.step);
      const b = g.buildingAt(Math.floor(n.x), Math.floor(n.y));
      expect(b && b.built && b.kind === 'turret_bullet').toBeFalsy();
    }
    expect(target.built).toBe(true);
  });

  it('los enemigos pueden matar NPCs', () => {
    const g = flatGame([], { waves: true });
    const n = g.npcs[0];
    g.npcs = [n];
    n.x = 0.5;
    n.y = 10.5; // en el punto de aparición
    n.hp = 10;
    g.callWaveNow();
    run(g, 20);
    expect(g.stats.npcDeaths).toBe(1);
    expect(g.npcs.length).toBe(0);
  });
});

describe('economía y cintas', () => {
  it('taladro → cintas → núcleo mete mena en el almacén', () => {
    const g = flatGame([[4, 9, Ore.Iron]]);
    instant(g, 'drill', 4, 9, 0);
    for (let x = 5; x <= 8; x++) instant(g, 'belt', x, 9, 0);
    run(g, 20);
    expect(count(g.storage, 'iron_ore')).toBeGreaterThanOrEqual(7);
  });
});

describe('oleadas', () => {
  it('sin defensas los enemigos dañan el núcleo', () => {
    const g = flatGame([], { waves: true });
    g.callWaveNow();
    run(g, 40);
    expect(g.coreHp).toBeLessThan(CONFIG.coreHp);
  });

  it('las torretas matan enemigos', () => {
    const g = flatGame([], { waves: true });
    for (const [x, y] of [[8, 7], [12, 7], [7, 12], [12, 12], [8, 12], [12, 8]]) instant(g, 'turret_bullet', x, y);
    g.callWaveNow();
    run(g, 40);
    expect(g.stats.kills).toBeGreaterThan(0);
    expect(g.coreHp).toBe(CONFIG.coreHp);
  });

  it('simulación completa con el bot es determinista', () => {
    const play = () => {
      const g = new Game({ seed: 3 });
      for (let t = 0; t < 180; t += 0.5) {
        g.update(0.5);
        botTick(g);
      }
      return { hp: g.coreHp, wave: g.wave, kills: g.stats.kills, built: g.stats.built, storage: { ...g.storage } };
    };
    const a = play();
    expect(a).toEqual(play());
    expect(a.built).toBeGreaterThan(0);
  });
});
