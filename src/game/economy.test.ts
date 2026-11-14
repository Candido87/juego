import { describe, expect, it } from 'vitest';
import { count } from './bag';
import { CONFIG } from './config';
import { flatGame, instant, run } from './testutil';
import { Ore } from './types';
import { generateWorld } from './world';

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

describe('componentes y fábricas de nivel 1', () => {
  const ORES = ['iron_ore', 'copper_ore', 'coal', 'stone', 'oil'];

  it('todo edificio exige al menos un componente y ninguna mena', () => {
    for (const [kind, def] of Object.entries(CONFIG.buildings)) {
      const items = Object.keys(def.cost);
      expect(items.some((i) => CONFIG.components.includes(i as never)), kind).toBe(true);
      expect(items.some((i) => ORES.includes(i)), kind).toBe(false);
    }
  });

  it('sin los componentes la obra no se termina; al llegar, sí', () => {
    const g = flatGame();
    g.storage.gun_part = 0;
    const t = g.place('turret_bullet', 4, 4)!;
    run(g, 20);
    expect(t.built).toBe(false);
    g.storage.gun_part = 2;
    run(g, 20);
    expect(t.built).toBe(true);
  });

  it('los componentes salen de recetas de nivel 1 en la fábrica', () => {
    const g = flatGame();
    const f = instant(g, 'factory', 5, 5);
    for (const c of ['frame', 'gear', 'wire', 'pipe', 'gun_part', 'tool_kit', 'ammo']) {
      expect(CONFIG.recipes[c].tier, c).toBe(1);
      expect(g.setRecipe(f.id, c), c).toBe(true);
    }
  });

  it('la fábrica de nivel 1 no hace recetas de nivel 2 aunque estén desbloqueadas', () => {
    const g = flatGame();
    const f = instant(g, 'factory', 5, 5);
    g.unlockedRecipes.add('circuit');
    expect(CONFIG.recipes.circuit.tier).toBe(2);
    expect(g.setRecipe(f.id, 'circuit')).toBe(false);
    expect(g.recipesFor(f)).not.toContain('circuit');
  });

  it('cadena manual: placas → engranajes → mecanismos de torreta', () => {
    const g = flatGame();
    g.storage.gear = 0;
    const a = instant(g, 'factory', 6, 6, 3);
    g.setRecipe(a.id, 'gun_part');
    a.inv = { gear: 2, iron_plate: 4 };
    g.npcs = [];
    run(g, (2 * CONFIG.recipes.gun_part.time) / g.factorySpeed(a) + 0.5);
    expect(count(a.out, 'gun_part')).toBe(2);
  });
});

describe('petróleo → gasolina → electricidad', () => {
  it('la bomba sólo va sobre petróleo y el taladro no', () => {
    const g = flatGame([[3, 3, Ore.Oil], [5, 3, Ore.Iron]]);
    expect(g.canPlace('pump', 3, 3).ok).toBe(true);
    expect(g.canPlace('pump', 5, 3).ok).toBe(false);
    expect(g.canPlace('drill', 3, 3).ok).toBe(false);
  });

  it('los generadores queman gasolina, no carbón', () => {
    expect(CONFIG.power.generators.generator!.fuel).toBe('gasoline');
    const g = flatGame();
    const gen = instant(g, 'generator', 5, 4);
    expect(g.capacityFor(gen, 'gasoline')).toBeGreaterThan(0);
    expect(g.capacityFor(gen, 'coal')).toBe(0);
  });

  it('cadena completa a mano, sin red: bomba → refinería → generador encendido', () => {
    // Bomba lejos del núcleo; refinería suelta; generador con poste. Nadie tiene electricidad al empezar.
    const g = flatGame([[2, 2, Ore.Oil], [2, 3, Ore.Oil]]);
    g.storage.gasoline = 0;
    g.storage.food = 200;
    instant(g, 'pump', 2, 2, 3);
    instant(g, 'pump', 2, 3, 2);
    const ref = instant(g, 'refinery', 5, 15, 1);
    expect(ref.recipe).toBe('gasoline');
    instant(g, 'pole', 14, 4);
    const gen = instant(g, 'generator', 15, 4);
    instant(g, 'factory', 14, 5);
    run(g, 240);
    expect(g.stats.delivered + count(g.storage, 'gasoline') + count(gen.inv, 'gasoline')).toBeGreaterThan(0);
    expect(gen.running).toBe(true);
    expect(g.grid.nets[0].production).toBe(CONFIG.power.generators.generator!.power);
  });

  it('la refinería convierte petróleo en gasolina con su ratio y tiempo', () => {
    const g = flatGame();
    g.npcs = [];
    const r = CONFIG.recipes.gasoline;
    const ref = instant(g, 'refinery', 5, 5, 3);
    ref.inv = { oil: r.inputs.oil! * 2 };
    run(g, (2 * r.time) / g.factorySpeed(ref) + 0.5);
    expect(count(ref.out, 'gasoline')).toBe(2 * r.outputs.gasoline!);
    expect(count(ref.inv, 'oil')).toBe(0);
  });

  it('apagón sin gasolina: el generador se para y las fábricas pierden la energía', () => {
    const g = flatGame();
    g.npcs = [];
    g.storage.gasoline = 0;
    instant(g, 'pole', 4, 4);
    const gen = instant(g, 'generator', 5, 4);
    const f = instant(g, 'factory', 4, 5);
    gen.inv = { gasoline: 1 };
    gen.running = true;
    run(g, 1);
    expect(f.power).toBe(1);
    run(g, CONFIG.power.generators.generator!.burnTime!);
    expect(gen.running).toBe(false);
    expect(f.power).toBe(0);
    expect(g.factorySpeed(f)).toBe(CONFIG.power.mult.factory![0]);
  });

  it('el mapa tiene yacimientos de petróleo', () => {
    const w = generateWorld(7, 40, 40);
    expect(Array.from(w.ore)).toContain(Ore.Oil);
  });
});
