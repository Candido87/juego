import { describe, expect, it } from 'vitest';
import { count, entries } from './bag';
import { botTick } from './bot';
import { CONFIG } from './config';
import { Game } from './game';
import { bfsPath } from './path';
import { flatGame, instant, powerUp, run } from './testutil';
import { Ore } from './types';
import { MAX_HEIGHT, generateWorld } from './world';

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
    const before = { ...g.storage };
    const b = g.place('turret_bullet', 4, 4)!;
    expect(b.built).toBe(false);
    run(g, 30);
    expect(b.built).toBe(true);
    for (const [i, n] of entries(CONFIG.buildings.turret_bullet.cost)) expect(count(g.storage, i)).toBe(count(before, i) - n);
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
    expect({ ...g.storage, food: 0 }).toEqual({ ...before, food: 0 }); // la comida se come
    expect(g.buildingAt(3, 3)).toBeUndefined();
  });

  it('desmontar lo hace un Constructor y devuelve el 50 %', () => {
    const g = flatGame();
    const [item, n] = entries(CONFIG.buildings.turret_bullet.cost)[0];
    const before = count(g.storage, item);
    const b = instant(g, 'turret_bullet', 4, 4);
    g.remove(4, 4);
    expect(b.markedForRemoval).toBe(true);
    run(g, 20);
    expect(g.buildingAt(4, 4)).toBeUndefined();
    expect(count(g.storage, item)).toBe(before + Math.floor(n * CONFIG.deconstruct.refund));
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
    powerUp(g, [[6, 8]], [6, 7]); // las cintas necesitan electricidad
    run(g, 20);
    expect(count(g.storage, 'iron_ore')).toBeGreaterThanOrEqual(7);
  });
});

describe('piezas y recetas', () => {
  it('el mapa tiene hierro, cobre, carbón, piedra y bosque', () => {
    const w = generateWorld(7, 40, 40);
    for (const o of [Ore.Iron, Ore.Copper, Ore.Coal, Ore.Stone, Ore.Wood]) expect(Array.from(w.ore)).toContain(o);
  });

  it('mena → fábrica (placas) → cinta → núcleo', () => {
    // Taladro (2,9) → cintas (3,9),(4,9) → fábrica (5,9) → cintas (6..8,9) → núcleo (9,9).
    const g = flatGame([[2, 9, Ore.Iron]]);
    instant(g, 'drill', 2, 9, 0);
    instant(g, 'belt', 3, 9, 0);
    instant(g, 'belt', 4, 9, 0);
    const f = instant(g, 'factory', 5, 9, 0);
    for (let x = 6; x <= 8; x++) instant(g, 'belt', x, 9, 0);
    powerUp(g, [[3, 8], [7, 8]], [5, 7]);
    expect(g.setRecipe(f.id, 'iron_plate')).toBe(true);
    const before = count(g.storage, 'iron_plate');
    run(g, 30);
    expect(count(g.storage, 'iron_plate') - before).toBeGreaterThanOrEqual(8);
    expect(count(g.storage, 'iron_ore')).toBe(0);
  });

  it('la fábrica sólo acepta las entradas de su receta, con tope', () => {
    const g = flatGame();
    const f = instant(g, 'factory', 5, 5, 0);
    g.setRecipe(f.id, 'gun_part');
    expect(g.capacityFor(f, 'iron_plate')).toBe(2 * CONFIG.factory.inputBatches);
    expect(g.capacityFor(f, 'iron_ore')).toBe(0);
    expect(g.pushItem(5, 5, 'iron_ore', 0)).toBe(false);
    expect(g.pushItem(5, 5, 'iron_plate', 0)).toBe(true);
  });

  it('una receta transforma entradas en salidas en su tiempo', () => {
    const g = flatGame();
    g.npcs = []; // sin Transportistas que traigan más placas
    const f = instant(g, 'factory', 5, 5, 0);
    g.setRecipe(f.id, 'gear');
    f.inv = { iron_plate: 2 * CONFIG.recipes.gear.inputs.iron_plate! };
    run(g, (CONFIG.recipes.gear.time * 2) / g.factorySpeed(f) + 0.2);
    expect(count(f.out, 'gear')).toBe(2);
    expect(count(f.inv, 'iron_plate')).toBe(0);
  });

  it('no deja poner recetas bloqueadas ni en otros edificios', () => {
    const g = flatGame();
    const t = instant(g, 'turret_bullet', 5, 5);
    const f = instant(g, 'factory', 6, 6);
    g.unlockedRecipes.delete('science_2');
    expect(g.setRecipe(t.id, 'gear')).toBe(false);
    expect(g.setRecipe(f.id, 'science_2')).toBe(false);
    expect(g.setRecipe(f.id, 'nope')).toBe(false);
  });
});

describe('transportistas y operarios (modo manual)', () => {
  it('un Transportista lleva munición del almacén a una torreta vacía', () => {
    const g = flatGame();
    const t = instant(g, 'turret_bullet', 4, 4);
    t.inv = {};
    const ammo = count(g.storage, 'ammo');
    run(g, 20);
    expect(count(t.inv, 'ammo')).toBeGreaterThan(0);
    expect(count(g.storage, 'ammo')).toBe(ammo - count(t.inv, 'ammo'));
  });

  it('torreta sin munición pide abastecimiento urgente y no dispara', () => {
    const g = flatGame([], { waves: true });
    g.npcs = g.npcs.filter((n) => n.role !== 'transporter');
    for (const [x, y] of [[8, 7], [12, 7], [7, 12], [12, 12]]) instant(g, 'turret_bullet', x, y).inv = {};
    g.jobs.refresh(g);
    const supply = g.jobs.list().find((j) => j.type === 'supply')!;
    expect(supply.priority).toBe(CONFIG.jobs.priority.supply + CONFIG.jobs.urgentBonus);
    g.callWaveNow();
    run(g, 30);
    expect(g.stats.kills).toBe(0);
  });

  it('la salida de una fábrica sin cinta la recoge un Transportista', () => {
    const g = flatGame();
    const f = instant(g, 'factory', 4, 4, 3); // apunta a una casilla vacía
    f.out = { gear: 6 };
    const gears = count(g.storage, 'gear');
    run(g, 20);
    expect(count(g.storage, 'gear')).toBe(gears + 6);
    expect(f.out).toEqual({});
  });

  it('fábrica abastecida a mano: placas del almacén → engranajes al almacén', () => {
    const g = flatGame();
    const f = instant(g, 'factory', 6, 6, 3);
    g.setRecipe(f.id, 'gear');
    const gears = count(g.storage, 'gear');
    run(g, 60);
    expect(count(g.storage, 'gear')).toBeGreaterThan(gears + 4);
  });

  it('el desgaste baja el rendimiento y un Operario lo repone', () => {
    const g = flatGame();
    const f = instant(g, 'factory', 5, 5);
    f.condition = 0.2;
    expect(g.factorySpeed(f)).toBe(CONFIG.power.mult.factory![0] * CONFIG.wear.lowEfficiency);
    run(g, 20);
    expect(f.condition).toBe(1);
  });

  it('un taladro sin cinta acumula y un Transportista lo recoge', () => {
    const g = flatGame([[3, 3, Ore.Coal]]);
    instant(g, 'drill', 3, 3, 3);
    run(g, 40);
    expect(count(g.storage, 'coal')).toBeGreaterThanOrEqual(CONFIG.jobs.collectMin);
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
