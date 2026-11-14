import { describe, expect, it } from 'vitest';
import { Game } from './game';
import { guiaBotTick } from './guia-bot';
import { diagnoseLink, diagnoseOutput, diagnosePower, followChain, planRoute } from './guia-flujo';
import {
  GUIA_STEPS,
  L_IRON_STORE,
  L_PUMP_REFINERY,
  L_REFINERY_GEN,
  currentStep,
  newGuiaState,
  powered,
  stepGuia,
} from './guia-inicio';
import { GUIA_TEXT } from './guia-inicio-textos';
import { flatGame, instant, powerUp, run } from './testutil';
import { Ore } from './types';

const step = (id: string) => GUIA_STEPS.find((s) => s.id === id)!;

/** Taladro de hierro en (3,9) que saca a +x, con cintas hasta el almacén (7,9). */
function ironLine(g: Game, belts: [number, number, 0 | 1 | 2 | 3][] = [[4, 9, 0], [5, 9, 0], [6, 9, 0]]) {
  const drill = instant(g, 'drill', 3, 9, 0);
  for (const [x, y, d] of belts) instant(g, 'belt', x, y, d);
  const store = instant(g, 'storage', 7, 9);
  return { drill, store };
}

describe('cadenas de cintas y tuberías', () => {
  it('sigue la cadena hasta el almacén', () => {
    const g = flatGame([[3, 9, Ore.Iron]]);
    const { drill, store } = ironLine(g);
    const c = followChain(g, drill, 'solid');
    expect(c.tiles).toHaveLength(3);
    expect(c.end).toMatchObject({ kind: 'dest', building: store });
    expect(diagnoseOutput(g, drill)).toBeNull();
  });

  it('avisa de la cinta con sentido contrario, con su casilla', () => {
    const g = flatGame([[3, 9, Ore.Iron]]);
    const { drill } = ironLine(g, [[4, 9, 0], [5, 9, 2], [6, 9, 0]]);
    const d = diagnoseOutput(g, drill)!;
    expect(d.code).toBe('reverse');
    expect(d.tile).toEqual({ x: 5, y: 9 });
    expect(d.text).toMatch(/sentido contrario/);
  });

  it('avisa de que la cinta termina en el vacío y de que falta la cinta delante', () => {
    const g = flatGame([[3, 9, Ore.Iron]]);
    const drill = instant(g, 'drill', 3, 9, 0);
    expect(diagnoseOutput(g, drill)).toMatchObject({ code: 'no_conduit', tile: { x: 4, y: 9 } });
    instant(g, 'belt', 4, 9, 0);
    expect(diagnoseOutput(g, drill)).toMatchObject({ code: 'dangling', tile: { x: 5, y: 9 } });
  });

  it('avisa si el líquido va en cinta o el sólido en tubería, y si el destino no lo acepta', () => {
    const g = flatGame([[3, 9, Ore.Oil]]);
    const pump = instant(g, 'pump', 3, 9, 0);
    instant(g, 'belt', 4, 9, 0);
    expect(diagnoseOutput(g, pump)).toMatchObject({ code: 'wrong_conduit' });
    const g2 = flatGame([[3, 9, Ore.Iron]]);
    const d = instant(g2, 'drill', 3, 9, 0);
    instant(g2, 'wall_wood', 4, 9);
    expect(diagnoseOutput(g2, d)).toMatchObject({ code: 'blocked' });
  });

  it('avisa de la fábrica de destino sin receta', () => {
    const g = flatGame([[3, 9, Ore.Iron]]);
    const drill = instant(g, 'drill', 3, 9, 0);
    instant(g, 'belt', 4, 9, 0);
    instant(g, 'factory', 5, 9, 0);
    expect(diagnoseOutput(g, drill)).toMatchObject({ code: 'no_recipe' });
  });

  it('la ruta de ejemplo acaba junto al destino y no pasa por casillas a las que apunta otra salida', () => {
    const g = flatGame([[3, 9, Ore.Iron], [3, 7, Ore.Iron]]);
    const a = instant(g, 'drill', 3, 9, 0);
    instant(g, 'drill', 3, 7, 0); // su salida (4,7)
    const store = instant(g, 'storage', 8, 7);
    const route = planRoute(g, a, (b) => b === store)!;
    expect(route.length).toBeGreaterThan(0);
    expect(route.some((t) => t.x === 4 && t.y === 7)).toBe(false);
    const last = route[route.length - 1];
    expect(Math.abs(last.x - 8) + Math.abs(last.y - 7)).toBe(1);
  });

  it('pegado al destino hace falta al menos una cinta (los edificios no se pasan material solos)', () => {
    const g = flatGame([[3, 9, Ore.Iron]]);
    const drill = instant(g, 'drill', 3, 9, 0);
    const f = instant(g, 'factory', 4, 9, 0);
    const route = planRoute(g, drill, (b) => b === f);
    // El frente está ocupado por la fábrica: el taladro tendría que girar; con su dirección actual no hay ruta.
    expect(route).toBeNull();
  });
});

describe('detección real del flujo y de la energía', () => {
  it('el HUD marca 0/0 sin energía; con generador en marcha y postes hay producción y consumo', () => {
    const g = flatGame([[3, 9, Ore.Iron]]);
    ironLine(g);
    run(g, 1);
    expect(powered(g)).toBe(false);
    expect(g.grid.nets).toHaveLength(0);
    powerUp(g, [[5, 8]], [5, 7]);
    run(g, 1);
    expect(powered(g)).toBe(true);
    expect(g.grid.nets[0].production).toBeGreaterThan(0);
    expect(g.grid.nets[0].demand).toBeGreaterThan(0);
  });

  it('la cinta sin energía no se completa y avisa de que no tiene poste; con energía llega el material', () => {
    const g = flatGame([[3, 9, Ore.Iron]]);
    g.npcs = [];
    ironLine(g);
    run(g, 15);
    expect(g.stats.beltTo.storage ?? 0).toBe(0);
    expect(step('belt_flow').done(g, newGuiaState())).toBe(false);
    const d = step('belt_flow').diagnose!(g)!;
    expect(d.code).toBe('no_pole');
    expect(d.text).toMatch(/poste/);
    powerUp(g, [[5, 8]], [5, 7]);
    run(g, 20);
    expect(g.stats.beltTo.storage).toBeGreaterThan(0);
    expect(step('belt_flow').done(g, newGuiaState())).toBe(true);
  });

  it('belt_connect se completa al conectar la cadena (aunque aún no haya energía)', () => {
    const g = flatGame([[3, 9, Ore.Iron]]);
    const drill = instant(g, 'drill', 3, 9, 0);
    instant(g, 'storage', 7, 9);
    expect(step('belt_connect').done(g, newGuiaState())).toBe(false);
    expect(step('belt_connect').diagnose!(g)).toMatchObject({ code: 'no_conduit' });
    for (const x of [4, 5, 6]) instant(g, 'belt', x, 9, 0);
    expect(step('belt_connect').done(g, newGuiaState())).toBe(true);
    expect(drill.built).toBe(true);
  });

  it('diagnostica la energía: sin generador, parado, sin gasolina, sin poste y sobrecarga', () => {
    const g = flatGame([[3, 9, Ore.Iron]]);
    g.npcs = [];
    g.storage.gasoline = 0;
    ironLine(g);
    const belt = [...g.buildings.values()].find((b) => b.kind === 'belt')!;
    instant(g, 'pole', 5, 8);
    g.step(1 / 30);
    expect(diagnosePower(g, belt)).toMatchObject({ code: 'no_generator' });
    const gen = instant(g, 'generator', 5, 7);
    g.step(1 / 30);
    expect(diagnosePower(g, belt)?.code).toBe('no_fuel');
    gen.inv = { gasoline: 3 };
    g.step(1 / 30);
    expect(diagnosePower(g, belt)?.code).toBe('gen_stopped');
    gen.running = true;
    g.step(1 / 30);
    expect(diagnosePower(g, belt)).toBeNull();
    // Sobrecarga: muchas fábricas pidiendo más de lo que da un generador.
    for (const [x, y] of [[8, 5], [8, 6], [8, 3], [8, 2]] as [number, number][]) instant(g, 'factory', x, y, 0);
    instant(g, 'pole', 8, 4);
    run(g, 0.2);
    expect(g.grid.nets[0].demand).toBeGreaterThan(g.grid.nets[0].production);
    expect(diagnosePower(g, belt)?.code).toBe('overload');
  });

  it('petróleo con tuberías: bomba → refinería → generador, con los pasos detectados de verdad', () => {
    const g = flatGame([[2, 2, Ore.Oil]]);
    g.npcs = [];
    instant(g, 'pump', 2, 2, 0);
    for (const x of [3, 4, 5]) instant(g, 'pipeline', x, 2, 0);
    instant(g, 'refinery', 6, 2, 0);
    expect(diagnoseLink(g, L_PUMP_REFINERY)).toBeNull();
    for (const x of [7, 8]) instant(g, 'pipeline', x, 2, 0);
    const gen = instant(g, 'generator', 9, 2);
    expect(step('oil_refine').done(g, newGuiaState())).toBe(false);
    run(g, 60);
    expect(g.stats.pipeTo.refinery).toBeGreaterThan(0);
    expect(g.stats.refined).toBeGreaterThan(0);
    expect(g.stats.pipeTo.generator).toBeGreaterThan(0);
    expect(step('oil_refine').done(g, newGuiaState())).toBe(true);
    expect(step('oil_fuel').done(g, newGuiaState())).toBe(true);
    expect(gen.inv.gasoline).toBeGreaterThan(0);
  });

  it('avisa si la tubería sale por el lado equivocado o no llega', () => {
    const g = flatGame([[2, 2, Ore.Oil]]);
    instant(g, 'pump', 2, 2, 0);
    instant(g, 'refinery', 8, 2, 0);
    expect(diagnoseLink(g, L_PUMP_REFINERY)).toMatchObject({ code: 'no_conduit' });
    instant(g, 'pipeline', 3, 2, 0);
    expect(diagnoseLink(g, L_PUMP_REFINERY)).toMatchObject({ code: 'dangling' });
    instant(g, 'generator', 8, 8);
    expect(diagnoseLink(g, L_REFINERY_GEN)).toMatchObject({ code: 'no_conduit' });
    expect(step('oil_refine').diagnose!(flatGame())).toMatchObject({ code: 'no_refinery' });
    expect(L_IRON_STORE.to).toContain('storage');
  });
});

describe('un bot que sigue la guía completa (cintas, energía y tuberías)', () => {
  it('completa cintas, energía, petróleo y las cadenas de producción y de munición, sin oleadas', () => {
    const g = new Game({ seed: 7, noWaves: true });
    const s = newGuiaState();
    for (let t = 0; t < 400; t += 0.5) {
      g.update(0.5);
      guiaBotTick(g, s);
      stepGuia(g, s);
    }
    expect(s.completed).toEqual(
      expect.arrayContaining(['belt_connect', 'power_gen', 'power_fuel', 'power_poles', 'belt_flow', 'oil_pump', 'oil_refine', 'oil_fuel', 'chain_plates', 'chain_ammo']),
    );
    expect(g.stats.beltTo.turret_bullet).toBeGreaterThan(0);
    expect(g.stats.pipeTo.generator).toBeGreaterThan(0);
  });

  it('con oleadas: llega a la primera con una torreta con munición y la guía no se atasca', () => {
    const g = new Game({ seed: 7 });
    const s = newGuiaState();
    for (let t = 0; t < 330 && !g.gameOver; t += 0.5) {
      g.update(0.5);
      guiaBotTick(g, s);
      stepGuia(g, s);
    }
    expect(g.wave).toBeGreaterThanOrEqual(1);
    expect([...g.buildings.values()].some((b) => b.kind === 'turret_bullet' && b.built && g.turretReady(b))).toBe(true);
    expect(currentStep(g, s)?.id).not.toBe('drill_iron');
  });

  it('cada paso nuevo tiene texto y aviso', () => {
    const g = flatGame();
    for (const id of ['belt_connect', 'power_gen', 'power_fuel', 'power_poles', 'belt_flow', 'oil_pump', 'oil_refine', 'oil_fuel', 'chain_plates', 'chain_ammo']) {
      expect(GUIA_TEXT[id](g).text.length, id).toBeGreaterThan(40);
    }
  });
});
