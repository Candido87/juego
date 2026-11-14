import { describe, expect, it } from 'vitest';
import { count } from './bag';
import { CONFIG } from './config';
import { flatGame, instant, powerUp, run } from './testutil';
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
    a.inv = { gear: 2, iron_plate: 4, stone: 2 };
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

describe('cintas eléctricas y modo manual', () => {
  it('sin red las cintas no mueven nada; con red, sí', () => {
    const g = flatGame();
    g.npcs = [];
    const belts = [5, 6, 7, 8].map((x) => instant(g, 'belt', x, 9, 0));
    belts[0].item = 'iron_ore';
    run(g, 5);
    expect(belts[0].item).toBe('iron_ore');
    expect(count(g.storage, 'iron_ore')).toBe(0);
    powerUp(g, [[6, 8]], [6, 7]);
    run(g, 5);
    expect(count(g.storage, 'iron_ore')).toBe(1);
  });

  it('las cintas consumen electricidad de la red', () => {
    const g = flatGame();
    g.npcs = [];
    powerUp(g, [[6, 8]], [6, 7]);
    for (const x of [5, 6, 7]) instant(g, 'belt', x, 9, 0);
    run(g, 0.2);
    expect(g.grid.nets[0].demand).toBeCloseTo(3 * CONFIG.power.demand.belt!);
  });

  it('modo manual: taladro → cinta parada → un Transportista lo recoge a mano', () => {
    const g = flatGame([[3, 3, Ore.Iron]]);
    instant(g, 'drill', 3, 3, 0);
    instant(g, 'belt', 4, 3, 0);
    instant(g, 'belt', 5, 3, 0);
    expect(g.outputFlows(g.buildingAt(3, 3)!)).toBe(false);
    run(g, 60);
    expect(count(g.storage, 'iron_ore')).toBeGreaterThanOrEqual(CONFIG.jobs.collectMin);
  });

  it('con red la salida fluye sola y no hace falta recoger', () => {
    const g = flatGame([[3, 3, Ore.Iron]]);
    const d = instant(g, 'drill', 3, 3, 0);
    instant(g, 'belt', 4, 3, 0);
    powerUp(g, [[4, 4]], [5, 5]);
    run(g, 0.2);
    expect(g.outputFlows(d)).toBe(true);
  });
});

describe('taller y reparaciones', () => {
  it('al terminar el taller toma 2 personas como Mecánicos y deja 1 fuera', () => {
    const g = flatGame();
    instant(g, 'workshop', 6, 6);
    run(g, 0.1);
    const roles = g.npcs.map((n) => n.role);
    expect(roles.filter((r) => r === 'mechanic').length).toBe(CONFIG.workshop.workers);
    expect(g.generalWorkers().length).toBe(1);
  });

  it('con sólo 2 personas el taller toma 1 (siempre queda alguien fuera)', () => {
    const g = flatGame();
    g.npcs = g.npcs.slice(0, 2);
    instant(g, 'workshop', 6, 6);
    run(g, 0.1);
    expect(g.npcs.filter((n) => n.role === 'mechanic').length).toBe(1);
  });

  it('los Mecánicos reparan gastando componentes; el Constructor no repara ni ellos construyen', () => {
    const g = flatGame();
    g.storage.food = 100;
    instant(g, 'workshop', 6, 6);
    const t = instant(g, 'turret_bullet', 4, 4);
    t.hp = t.maxHp * 0.3;
    const site = g.place('farm', 14, 14)!;
    g.storage.gear = 0; // a la obra le faltarán engranajes: no se puede terminar
    const frames = 5;
    g.storage.frame = frames; // la torreta se repara con su primer componente (bastidor)
    run(g, 0.1);
    const constructor = g.npcs.find((n) => n.role !== 'mechanic')!;
    run(g, 30);
    expect(t.hp).toBe(t.maxHp);
    expect(count(g.storage, 'frame')).toBeLessThan(frames - 2);
    expect(site.built).toBe(false);
    expect(constructor.jobId === null || g.jobs.get(constructor.jobId)!.type !== 'repair').toBe(true);
  });

  it('sin taller repara el Constructor, más despacio', () => {
    const fix = (withShop: boolean) => {
      const g = flatGame();
      if (withShop) instant(g, 'workshop', 6, 6);
      const t = instant(g, 'turret_bullet', 4, 4);
      t.hp = t.maxHp * 0.3;
      let s = 0;
      while (t.hp < t.maxHp && s < 120) {
        run(g, 0.5);
        s += 0.5;
      }
      return s;
    };
    expect(CONFIG.repair.constructorFactor).toBeLessThan(CONFIG.repair.mechanicFactor);
    expect(fix(false)).toBeGreaterThan(fix(true));
  });

  it('la infraestructura crítica se repara antes', () => {
    const g = flatGame();
    const gen = instant(g, 'generator', 4, 4);
    const st = instant(g, 'storage', 6, 4);
    gen.hp = gen.maxHp * 0.5;
    st.hp = st.maxHp * 0.5;
    g.jobs.refresh(g);
    const pri = (id: number) => g.jobs.list().find((j) => j.type === 'repair' && j.buildingId === id)!.priority;
    expect(pri(gen.id)).toBe(pri(st.id) + CONFIG.jobs.criticalRepairBonus);
  });

  it('los enemigos dañan los edificios que tienen al lado', () => {
    const g = flatGame([], { waves: true });
    g.npcs = [];
    const wall = instant(g, 'farm', 2, 9); // junto al camino desde (0,10)
    g.callWaveNow();
    run(g, 15);
    expect(wall.hp).toBeLessThan(wall.maxHp);
  });

  it('desmontar el taller devuelve a los mecánicos como Constructores', () => {
    const g = flatGame();
    const w = instant(g, 'workshop', 6, 6);
    run(g, 0.1);
    g.deleteBuilding(w);
    run(g, 0.1);
    expect(g.npcs.some((n) => n.role === 'mechanic')).toBe(false);
  });

  it('el jugador puede cambiar el rol de una persona, pero no hacerla Mecánico', () => {
    const g = flatGame();
    const n = g.npcs.find((o) => o.role === 'transporter')!;
    expect(g.setRole(n.id, 'constructor')).toBe(true);
    expect(n.role).toBe('constructor');
    expect(g.setRole(n.id, 'mechanic')).toBe(false);
  });
});

describe('vivienda y crecimiento', () => {
  const G = CONFIG.growth;

  it('sin vivienda libre la población no crece', () => {
    const g = flatGame();
    g.storage.food = 500;
    expect(g.housingCapacity()).toBe(CONFIG.housing.core);
    run(g, G.interval * 3 + 1);
    expect(g.population).toBe(CONFIG.housing.core);
  });

  it('con casa y comida de sobra llega gente, gastando comida', () => {
    const g = flatGame();
    g.storage.food = 500;
    instant(g, 'house', 4, 4);
    expect(g.housingCapacity()).toBe(CONFIG.housing.core + CONFIG.housing.house);
    run(g, G.interval + 0.5);
    expect(g.population).toBe(4);
    expect(g.stats.arrivals).toBe(1);
    expect(g.npcs[3].role).not.toBe('mechanic');
    run(g, G.interval * 10);
    expect(g.population).toBe(g.housingCapacity());
  });

  it('con poca comida no crece', () => {
    const g = flatGame();
    g.storage.food = G.foodMin - 5;
    instant(g, 'house', 4, 4);
    run(g, G.interval + 0.5);
    expect(g.population).toBe(3);
  });

  it('el jugador elige el rol de quien llega', () => {
    const g = flatGame();
    g.storage.food = 500;
    g.growthRole = 'transporter';
    instant(g, 'house', 4, 4);
    run(g, G.interval + 0.5);
    expect(g.npcs[g.npcs.length - 1].role).toBe('transporter');
  });

  it('más población permite el taller sin dejar la colonia sin manos', () => {
    const g = flatGame();
    g.storage.food = 500;
    instant(g, 'house', 4, 4);
    run(g, G.interval * 2 + 1);
    instant(g, 'workshop', 6, 6);
    run(g, 0.1);
    expect(g.npcs.filter((n) => n.role === 'mechanic').length).toBe(2);
    expect(g.generalWorkers().length).toBe(g.population - 2);
    expect(g.generalWorkers().length).toBeGreaterThanOrEqual(2);
  });
});
