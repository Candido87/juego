import { describe, expect, it } from 'vitest';
import { CONFIG, RECIPE_CATEGORIES } from './config';
import { ORE_ITEM } from './game';
import { ITEM_IDS, ItemId, Ore } from './types';
import { coreOrigin, generateWorld, oreAt } from './world';

/** Materiales que se pueden conseguir: las menas del mapa y todo lo que sale de recetas cuyas entradas se pueden conseguir. */
function obtainable(): Set<ItemId> {
  const have = new Set<ItemId>(Object.values(ORE_ITEM).filter((x): x is ItemId => !!x));
  have.add('food'); // la granja
  for (let changed = true; changed; ) {
    changed = false;
    for (const r of Object.values(CONFIG.recipes)) {
      if (!Object.keys(r.inputs).every((i) => have.has(i as ItemId))) continue;
      for (const o of Object.keys(r.outputs) as ItemId[]) if (!have.has(o)) (have.add(o), (changed = true));
    }
  }
  return have;
}

describe('tabla de recetas', () => {
  it('todas tienen categoría válida, tiempo y entradas/salidas conocidas', () => {
    const cats = new Set(RECIPE_CATEGORIES.map((c) => c.id));
    for (const [id, r] of Object.entries(CONFIG.recipes)) {
      expect(cats.has(r.category), id).toBe(true);
      expect(r.time, id).toBeGreaterThan(0);
      for (const i of [...Object.keys(r.inputs), ...Object.keys(r.outputs)]) expect(ITEM_IDS as readonly string[], `${id}:${i}`).toContain(i);
    }
  });
  it('la munición pide hierro y azufre; el mecanismo de torreta, piedra y hierro', () => {
    expect(Object.keys(CONFIG.recipes.ammo.inputs).sort()).toEqual(['iron_plate', 'sulfur']);
    expect(CONFIG.recipes.gun_part.inputs.stone).toBeGreaterThan(0);
    expect(CONFIG.recipes.gun_part.inputs.iron_plate).toBeGreaterThan(0);
  });
});

describe('alcanzabilidad desde el estado inicial', () => {
  it('todo material de las recetas y de los costes de construcción se consigue o se fabrica', () => {
    const have = obtainable();
    for (const [id, r] of Object.entries(CONFIG.recipes)) for (const i of Object.keys(r.inputs)) expect(have.has(i as ItemId), `receta ${id} pide ${i}`).toBe(true);
    for (const [k, d] of Object.entries(CONFIG.buildings)) for (const i of Object.keys(d.cost)) expect(have.has(i as ItemId), `${k} cuesta ${i}`).toBe(true);
  });
  it('los costes sólo exigen componentes que alguna receta produce (o materias primas)', () => {
    const produced = new Set(Object.values(CONFIG.recipes).flatMap((r) => Object.keys(r.outputs)));
    const raw = new Set(Object.values(ORE_ITEM));
    for (const [k, d] of Object.entries(CONFIG.buildings))
      for (const i of Object.keys(d.cost)) expect(produced.has(i) || raw.has(i as ItemId), `${k} cuesta ${i}`).toBe(true);
  });
});

describe('azufre en el mapa', () => {
  it('con semilla fija el mapa es siempre el mismo', () => {
    const a = generateWorld(7, CONFIG.mapW, CONFIG.mapH);
    const b = generateWorld(7, CONFIG.mapW, CONFIG.mapH);
    expect(Array.from(a.ore)).toEqual(Array.from(b.ore));
    expect(Array.from(a.height)).toEqual(Array.from(b.height));
  });
  it('hay azufre cerca del núcleo en cualquier semilla, y junto a hierro, piedra y carbón', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const w = generateWorld(seed, CONFIG.mapW, CONFIG.mapH);
      const c = coreOrigin(w);
      const near = (ore: Ore, r: number) => {
        let n = 0;
        for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) if (oreAt(w, x, y) === ore && Math.hypot(x - c.x, y - c.y) <= r) n++;
        return n;
      };
      expect(near(Ore.Sulfur, 10), `azufre semilla ${seed}`).toBeGreaterThanOrEqual(4);
      for (const o of [Ore.Iron, Ore.Stone, Ore.Coal]) expect(near(o, 10), `mena ${o} semilla ${seed}`).toBeGreaterThanOrEqual(4);
    }
  });
});
