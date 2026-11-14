import { describe, expect, it } from 'vitest';
import { count } from './bag';
import { Ore } from './types';
import { flatGame, instant, powerUp, run } from './testutil';

describe('T1 · cintas obligatorias entre edificios de producción', () => {
  it('un taladro pegado a una fábrica no le pasa la mena', () => {
    const g = flatGame([[3, 3, Ore.Iron]]);
    g.npcs = [];
    const d = instant(g, 'drill', 3, 3, 0);
    const f = instant(g, 'factory', 4, 3, 0);
    g.setRecipe(f.id, 'iron_plate');
    run(g, 20);
    expect(count(d.out, 'iron_ore')).toBeGreaterThan(0);
    expect(count(f.inv, 'iron_ore')).toBe(0);
  });

  it('taladro → cinta → fábrica sí entrega (con energía)', () => {
    const g = flatGame([[3, 3, Ore.Iron]]);
    g.npcs = [];
    powerUp(g, [[4, 5]], [5, 5]);
    const d = instant(g, 'drill', 3, 3, 0);
    instant(g, 'belt', 4, 3, 0);
    instant(g, 'pole', 3, 4);
    const f = instant(g, 'factory', 5, 3, 0);
    g.setRecipe(f.id, 'iron_plate');
    run(g, 20);
    expect(count(d.out, 'iron_ore') + count(f.inv, 'iron_ore') + count(f.out, 'iron_plate')).toBeGreaterThan(0);
    expect(count(f.inv, 'iron_ore') + count(f.out, 'iron_plate')).toBeGreaterThan(0);
  });

  it('sin energía la cinta no se mueve (emergencia: Transportistas)', () => {
    const g = flatGame([[3, 3, Ore.Iron]]);
    g.npcs = [];
    instant(g, 'drill', 3, 3, 0);
    const belt = instant(g, 'belt', 4, 3, 0);
    const f = instant(g, 'factory', 5, 3, 0);
    g.setRecipe(f.id, 'iron_plate');
    run(g, 20);
    expect(belt.item).not.toBeNull();
    expect(count(f.inv, 'iron_ore')).toBe(0);
  });

  it('un taladro pegado al almacén sí le entrega (el almacén no es producción)', () => {
    const g = flatGame([[7, 9, Ore.Iron]]);
    g.npcs = [];
    instant(g, 'drill', 7, 9, 0);
    instant(g, 'storage', 8, 9);
    const before = g.storage.iron_ore ?? 0;
    run(g, 10);
    expect(g.storage.iron_ore ?? 0).toBeGreaterThan(before);
  });
});

describe('T3 · líquidos sólo por tuberías', () => {
  it('el petróleo no entra en una cinta', () => {
    const g = flatGame([[3, 3, Ore.Oil]]);
    g.npcs = [];
    powerUp(g, [[4, 5]], [5, 5]);
    const p = instant(g, 'pump', 3, 3, 0);
    const belt = instant(g, 'belt', 4, 3, 0);
    run(g, 20);
    expect(belt.item).toBeNull();
    expect(count(p.out, 'oil')).toBeGreaterThan(0);
  });

  it('una bomba pegada a la refinería no le pasa petróleo', () => {
    const g = flatGame([[3, 3, Ore.Oil]]);
    g.npcs = [];
    instant(g, 'pump', 3, 3, 0);
    const r = instant(g, 'refinery', 4, 3, 0);
    run(g, 20);
    expect(count(r.inv, 'oil')).toBe(0);
  });

  it('bomba → tuberías → refinería → tuberías → generador: llega gasolina sin energía ni NPCs', () => {
    const g = flatGame([[2, 2, Ore.Oil]]);
    g.npcs = [];
    instant(g, 'pump', 2, 2, 0);
    const pipes = [3, 4, 5].map((x) => instant(g, 'pipeline', x, 2, 0));
    const ref = instant(g, 'refinery', 6, 2, 0);
    for (const x of [7, 8]) instant(g, 'pipeline', x, 2, 0);
    const gen = instant(g, 'generator', 9, 2);
    run(g, 60);
    expect(count(ref.inv, 'oil') + count(ref.out, 'gasoline')).toBeGreaterThanOrEqual(0);
    expect(count(gen.inv, 'gasoline')).toBeGreaterThan(0);
    expect(pipes.length).toBe(3);
  });

  it('una tubería no acepta líquido por delante ni mezcla dos líquidos', () => {
    const g = flatGame();
    g.npcs = [];
    const a = instant(g, 'pipeline', 5, 5, 0);
    // Empujar desde delante (el que viene en dirección contraria a su flujo) es rechazado.
    expect(g.pushItem(5, 5, 'oil', 2)).toBe(false);
    expect(g.pushItem(5, 5, 'oil', 0)).toBe(true);
    expect(g.pushItem(5, 5, 'gasoline', 0)).toBe(false);
    expect(count(a.inv, 'oil')).toBe(1);
  });

  it('las tuberías no consumen energía y no admiten sólidos', () => {
    const g = flatGame();
    g.npcs = [];
    instant(g, 'pipeline', 5, 5, 0);
    expect(g.pushItem(5, 5, 'iron_plate', 0)).toBe(false);
    run(g, 1);
    expect(g.grid.nets.length).toBe(0);
  });

  it('la tubería llena aplica contrapresión (capacidad)', () => {
    const g = flatGame();
    g.npcs = [];
    const p = instant(g, 'pipeline', 5, 5, 0); // delante hay vacío: no puede vaciarse
    for (let i = 0; i < 10; i++) g.pushItem(5, 5, 'oil', 0);
    expect(count(p.inv, 'oil')).toBe(4);
  });
});
