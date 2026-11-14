import { describe, expect, it } from 'vitest';
import { count } from './bag';
import { CONFIG } from './config';
import { flatGame, instant, powerUp, run } from './testutil';

const R = CONFIG.recipes;

describe('fábrica con receta elegible', () => {
  it('una fábrica nueva sin receta no produce y lo avisa', () => {
    const g = flatGame();
    g.npcs = [];
    const f = instant(g, 'factory', 6, 6, 3);
    f.inv = { iron_ore: 5 };
    expect(g.factoryStatus(f).state).toBe('norecipe');
    run(g, 20);
    expect(count(f.out, 'iron_plate')).toBe(0);
    expect(count(f.inv, 'iron_ore')).toBe(5);
  });

  it('con receta y materiales produce, y el estado lo dice', () => {
    const g = flatGame();
    g.npcs = [];
    const f = instant(g, 'factory', 6, 6, 3);
    g.setRecipe(f.id, 'iron_plate');
    f.inv = { iron_ore: 2 };
    run(g, 0.2);
    expect(g.factoryStatus(f).state).toBe('producing');
    run(g, (2 * R.iron_plate.time) / g.factorySpeed(f) + 0.5);
    expect(count(f.out, 'iron_plate')).toBe(2);
  });

  it('al faltar un material se detiene y avisa de cuál', () => {
    const g = flatGame();
    g.npcs = [];
    const f = instant(g, 'factory', 6, 6, 3);
    g.setRecipe(f.id, 'ammo');
    f.inv = { iron_plate: 3 }; // falta azufre
    run(g, 10);
    expect(count(f.out, 'ammo')).toBe(0);
    const st = g.factoryStatus(f);
    expect(st.state).toBe('missing');
    expect(st.missing).toEqual(['sulfur']);
    f.inv.sulfur = 1;
    run(g, R.ammo.time / g.factorySpeed(f) + 0.5);
    expect(count(f.out, 'ammo')).toBe(R.ammo.outputs.ammo);
  });

  it('con la salida llena se detiene ("salida llena") y vuelve a producir al vaciarse', () => {
    const g = flatGame();
    g.npcs = [];
    const f = instant(g, 'factory', 6, 6, 3);
    g.setRecipe(f.id, 'ammo');
    f.out = { ammo: CONFIG.factory.outCap };
    f.inv = { iron_plate: 3, sulfur: 3 };
    run(g, 5);
    expect(g.factoryStatus(f).state).toBe('full');
    expect(count(f.inv, 'iron_plate')).toBe(3);
    f.out = {};
    run(g, 0.3);
    expect(g.factoryStatus(f).state).toBe('producing');
  });

  it('cambiar de receta devuelve los materiales (y los de la producción en curso)', () => {
    const g = flatGame();
    g.npcs = [];
    const f = instant(g, 'factory', 6, 6, 3);
    g.setRecipe(f.id, 'ammo');
    f.inv = { iron_plate: 2, sulfur: 2 };
    run(g, 0.5); // ya empezó una tanda: gastó 1 + 1
    expect(f.craft).toBeGreaterThan(0);
    expect(g.setRecipe(f.id, 'gear')).toBe(true);
    expect(f.craft).toBe(0);
    expect(f.recipe).toBe('gear');
    expect(count(f.out, 'iron_plate')).toBeGreaterThanOrEqual(2);
    expect(count(f.out, 'sulfur')).toBeGreaterThanOrEqual(2);
    expect(Object.values(f.inv).reduce((a, b) => a + (b ?? 0), 0)).toBe(0);
  });

  it('no deja elegir recetas de otro nivel o que no están desbloqueadas', () => {
    const g = flatGame();
    const f = instant(g, 'factory', 6, 6, 3);
    expect(g.setRecipe(f.id, 'circuit')).toBe(false); // nivel 2
    expect(g.setRecipe(f.id, 'gasoline')).toBe(false); // sólo la refinería
    expect(g.recipesFor(f)).toContain('ammo');
  });
});

describe('búferes', () => {
  it('la entrada de cada material no pasa de tandas × lo que pide la receta', () => {
    const g = flatGame();
    const f = instant(g, 'factory', 6, 6, 3);
    g.setRecipe(f.id, 'gun_part');
    for (const [item, n] of Object.entries(R.gun_part.inputs)) expect(g.capacityFor(f, item as 'gear')).toBe(n! * CONFIG.factory.inputBatches);
    expect(g.capacityFor(f, 'ammo')).toBe(0); // lo que no pide la receta no se acepta
  });

  it('un Transportista abastece sólo hasta el límite del búfer', () => {
    const g = flatGame();
    g.storage.iron_plate = 200;
    g.storage.sulfur = 200;
    const f = instant(g, 'factory', 3, 3, 3);
    g.setRecipe(f.id, 'ammo');
    run(g, 40);
    for (const i of ['iron_plate', 'sulfur'] as const) expect(count(f.inv, i)).toBeLessThanOrEqual(g.capacityFor(f, i));
  });
});

describe('transporte con recetas', () => {
  it('modo manual: un NPC lleva los materiales y recoge el producto', () => {
    const g = flatGame();
    g.storage.iron_plate = 50;
    g.storage.sulfur = 50;
    const ammo0 = count(g.storage, 'ammo');
    const f = instant(g, 'factory', 3, 3, 3); // lejos del núcleo y sin cinta
    g.setRecipe(f.id, 'ammo');
    run(g, 120);
    expect(count(g.storage, 'ammo')).toBeGreaterThan(ammo0);
  });

  it('modo automático: con red, la cinta mete el material en la fábrica', () => {
    const g = flatGame();
    g.npcs = [];
    const f = instant(g, 'factory', 8, 6, 0);
    g.setRecipe(f.id, 'iron_plate');
    const belt = instant(g, 'belt', 7, 6, 0);
    powerUp(g, [[7, 7]], [6, 8]);
    belt.item = 'iron_ore';
    run(g, 4);
    expect(count(f.inv, 'iron_ore') + count(f.out, 'iron_plate') + f.craft).toBeGreaterThan(0);
  });
});
