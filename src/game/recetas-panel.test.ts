import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { factoryRecipeIds, recipeBlockedReason, recipeCategories, recipeEntries, recipeFormula, recipeTip } from './recetas';
import { flatGame, instant } from './testutil';

describe('panel de recetas (lógica)', () => {
  it('lista las recetas de fábrica con nombre, entradas, salida, tiempo y energía', () => {
    const g = flatGame();
    const list = recipeEntries(g, null);
    expect(list.map((e) => e.id).sort()).toEqual(factoryRecipeIds().sort());
    expect(list.some((e) => e.id === 'gasoline')).toBe(false); // la gasolina es de la refinería
    const ammo = list.find((e) => e.id === 'ammo')!;
    expect(ammo.name).toBe('Munición');
    expect(ammo.inputs.map(([i]) => i).sort()).toEqual(['iron_plate', 'sulfur']);
    expect(ammo.outputs).toEqual([['ammo', 6]]);
    expect(ammo.time).toBe(CONFIG.recipes.ammo.time);
    expect(ammo.energy).toBe(CONFIG.power.demand.factory);
  });

  it('marca las no disponibles con el motivo y la receta elegida', () => {
    const g = flatGame();
    const f = instant(g, 'factory', 6, 6, 3);
    g.setRecipe(f.id, 'gear');
    const list = recipeEntries(g, f);
    expect(list.find((e) => e.id === 'gear')!.selected).toBe(true);
    expect(list.filter((e) => e.selected)).toHaveLength(1);
    const circuit = list.find((e) => e.id === 'circuit')!;
    expect(circuit.available).toBe(false);
    expect(circuit.reason).toContain('Requiere investigar «Circuitos» (Industria, 20 puntos)');
    expect(list.find((e) => e.id === 'gear')!.available).toBe(true);
    // Desbloqueada pero de nivel 2: la fábrica de nivel 1 no la hace.
    g.unlockedRecipes.add('circuit');
    expect(recipeBlockedReason(g, 'circuit')).toMatch(/nivel 2/);
    expect(g.setRecipe(f.id, 'circuit')).toBe(false);
  });

  it('agrupa por categorías (Munición, Torretas, Piezas, Construcción...) sin categorías vacías', () => {
    const g = flatGame();
    const cats = recipeCategories(g);
    expect(cats.map((c) => c.name)).toEqual(expect.arrayContaining(['Munición', 'Torretas', 'Piezas', 'Construcción', 'Materiales']));
    for (const c of cats) expect(c.total).toBeGreaterThan(0);
    expect(recipeEntries(g, null, 'municion').map((e) => e.id)).toEqual(['ammo']);
    const piezas = cats.find((c) => c.id === 'piezas')!;
    expect(piezas.available).toBeLessThan(piezas.total); // circuito, batería y placa de muro están bloqueadas
  });

  it('el texto automático dice qué produce, para qué sirve y dónde se necesita', () => {
    const g = flatGame();
    const t = recipeTip(g, 'ammo');
    expect(t.produces).toContain('Munición');
    expect(t.formula).toBe(recipeFormula(recipeEntries(g, null).find((e) => e.id === 'ammo')!));
    expect(t.usedIn.join(' ')).toContain('Torreta de balas');
    // Se actualiza solo con las recetas: el mecanismo de torreta se necesita para construir torretas.
    expect(recipeTip(g, 'gun_part').usedIn.join(' ')).toContain('Torreta de balas (construcción)');
    expect(recipeTip(g, 'circuit').reason).toBeTruthy();
  });
});
