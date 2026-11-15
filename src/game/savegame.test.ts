import { describe, expect, it } from 'vitest';
import { botTick } from './bot';
import { Game } from './game';
import { AutoSaver, deleteSave, gameFromSave, isSave, latestSave, makeSave, readSave, saveSummary, writeSave } from './savegame';
import { generateWorld } from './world';

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
};

/** Partida con edificios, NPCs, obras y una oleada en marcha. */
function played(seed = 7, seconds = 240): Game {
  const g = new Game({ world: generateWorld(seed, 40, 40) });
  for (let i = 0; i < seconds * 2; i++) {
    if (i % 20 === 0) botTick(g);
    g.update(0.5);
  }
  return g;
}

/** Resumen comparable del estado visible de la partida. */
const digest = (g: Game) =>
  JSON.stringify({
    t: g.time.toFixed(3),
    wave: g.wave,
    core: g.coreHp,
    storage: g.storage,
    b: [...g.buildings.values()].map((b) => [b.id, b.kind, b.x, b.y, b.built, b.hp.toFixed(2), b.item, b.inv, b.out, b.craft.toFixed(2)]),
    n: g.npcs.map((n) => [n.id, n.role, n.x.toFixed(2), n.y.toFixed(2), n.jobId, n.carry]),
    e: g.enemies.map((e) => [e.id, e.kind, e.x.toFixed(2), e.y.toFixed(2), e.hp.toFixed(2)]),
    jobs: g.jobs.list().map((j) => [j.id, j.key, j.npcId]),
  });

describe('guardado de partida', () => {
  it('una partida restaurada es idéntica y sigue igual que la original', () => {
    const a = played();
    expect(a.buildings.size).toBeGreaterThan(3);
    const save = makeSave(a, 7);
    const b = gameFromSave(JSON.parse(JSON.stringify(save)));
    expect(digest(b)).toBe(digest(a));
    // Las dos avanzan lo mismo y siguen iguales (nada se perdió: cola de trabajos, oleadas, rutas, red eléctrica).
    for (let i = 0; i < 400; i++) {
      a.update(0.5);
      b.update(0.5);
    }
    expect(digest(b)).toBe(digest(a));
  });

  it('el núcleo sigue siendo el mismo objeto y sus casillas siguen ocupadas', () => {
    const a = played(3, 60);
    const b = gameFromSave(makeSave(a, 3));
    expect(b.buildingAt(b.core.x, b.core.y)).toBe(b.core);
    for (const x of a.buildings.values()) expect(b.buildingAt(x.x, x.y)?.id).toBe(x.id);
    // un edificio nuevo no reutiliza un id ya guardado
    const ids = new Set([...b.buildings.keys()]);
    expect(ids.has(b.newId())).toBe(false);
  });

  it('guarda desbloqueos, bonificaciones y niveles de torreta', () => {
    const a = new Game({ world: generateWorld(5, 30, 30) });
    a.unlockedBuildings.add('wall_gate');
    a.unlockedRecipes.add('gear');
    a.bonus.npcSpeed = 0.25;
    a.turretLevel.turret_laser = 3;
    a.storage.iron_plate = 123;
    const b = gameFromSave(makeSave(a, 5));
    expect(b.unlockedBuildings.has('wall_gate')).toBe(true);
    expect(b.unlockedRecipes.has('gear')).toBe(true);
    expect(b.bonus.npcSpeed).toBe(0.25);
    expect(b.turretLevel.turret_laser).toBe(3);
    expect(b.storage.iron_plate).toBe(123);
  });

  it('el guardado es JSON y las ranuras se escriben, leen y borran', () => {
    const store = memory();
    const g = played(7, 30);
    expect(readSave(store, 'manual')).toBeNull();
    expect(writeSave(store, 'manual', makeSave(g, 7, 1000))).toBe(true);
    expect(readSave(store, 'manual')?.seed).toBe(7);
    expect(latestSave(store)?.slot).toBe('manual');
    writeSave(store, 'auto', makeSave(g, 7, 2000));
    expect(latestSave(store)?.slot).toBe('auto');
    deleteSave(store, 'auto');
    expect(latestSave(store)?.slot).toBe('manual');
  });

  it('un guardado dañado o de otra versión se ignora', () => {
    const store = memory();
    store.setItem('iso-factory-td:save:manual', '{no es json');
    expect(readSave(store, 'manual')).toBeNull();
    store.setItem('iso-factory-td:save:manual', JSON.stringify({ version: 99, seed: 1, mapW: 5, mapH: 5, state: { buildings: [], npcs: [] } }));
    expect(readSave(store, 'manual')).toBeNull();
    expect(isSave(null)).toBe(false);
    expect(isSave({ version: 1, seed: 1, mapW: 0, mapH: 5, state: { buildings: [], npcs: [] } })).toBe(false);
    expect(writeSave(null, 'manual', makeSave(played(7, 5), 7))).toBe(false);
  });

  it('resumen legible y autoguardado cada minuto, nunca con la partida acabada', () => {
    const g = played(7, 30);
    expect(saveSummary(makeSave(g, 7))).toMatch(/^Oleada \d+ · \d+:\d\d · \d+ personas?$/);
    const auto = new AutoSaver(60);
    expect(auto.tick(30, g)).toBe(false);
    expect(auto.tick(31, g)).toBe(true);
    expect(auto.tick(10, g)).toBe(false);
    g.gameOver = true;
    expect(auto.tick(100, g)).toBe(false);
  });
});
