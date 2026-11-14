import { describe, expect, it } from 'vitest';
import { HELP_CONCEPTS, HELP_CONTROLS } from './ayuda';
import { GROUP_ORDER, groupInventory, inventorySummary, jobsSummary, npcSummary } from './panels';
import { flatGame, run } from './testutil';
import { ITEM_IDS } from './types';

describe('almacén agrupado por tipo', () => {
  it('agrupa en materias primas, piezas, combustible y comida, en ese orden', () => {
    const g = flatGame();
    g.storage.iron_ore = 5;
    const groups = groupInventory(g);
    expect(groups.map((x) => x.group)).toEqual(GROUP_ORDER);
    expect(groups.find((x) => x.group === 'bruto')!.items.map(([i]) => i)).toContain('iron_ore');
    expect(groups.find((x) => x.group === 'combustible')!.items.map(([i]) => i)).toEqual(['gasoline']);
    expect(groups.find((x) => x.group === 'comida')!.items.map(([i]) => i)).toEqual(['food']);
  });

  it('cada material aparece en exactamente un grupo y los grupos vacíos no salen', () => {
    const g = flatGame();
    for (const i of ITEM_IDS) g.storage[i] = 3;
    const groups = groupInventory(g);
    const all = groups.flatMap((x) => x.items.map(([i]) => i));
    expect([...all].sort()).toEqual([...ITEM_IDS].sort());
    for (const k of Object.keys(g.storage)) delete g.storage[k as keyof typeof g.storage];
    g.storage.food = 2;
    expect(groupInventory(g).map((x) => x.group)).toEqual(['comida']);
    delete g.storage.food;
    expect(groupInventory(g)).toEqual([]);
  });

  it('los materiales a cero no aparecen', () => {
    const g = flatGame();
    g.storage.gear = 0;
    expect(groupInventory(g).flatMap((x) => x.items.map(([i]) => i))).not.toContain('gear');
  });
});

describe('resúmenes de los paneles plegados', () => {
  it('almacén: nº de materiales y los que faltan', () => {
    const g = flatGame();
    const s = inventorySummary(g);
    expect(s).toMatch(/^\d+ materiales/);
    expect(s).not.toContain('en falta'); // al empezar no alarma por materias que aún no tienes
    g.storage.wire = 0;
    g.place('pole', 3, 3); // la obra pide cable y no hay
    expect(inventorySummary(g)).toContain('en falta');
  });

  it('NPCs: personas, vivienda y libres; avisa del hambre', () => {
    const g = flatGame();
    expect(npcSummary(g)).toContain('3/3 personas');
    expect(npcSummary(g)).toContain('3 libres');
    g.storage.food = 0;
    run(g, 25);
    expect(npcSummary(g)).toContain('hambre');
  });

  it('cola de trabajos: cuántos y cuántos esperan', () => {
    const g = flatGame();
    expect(jobsSummary(g)).toBe('0 trabajos');
    g.npcs = [];
    g.place('storage', 3, 3);
    g.jobs.refresh(g);
    expect(jobsSummary(g)).toBe('1 trabajos · 1 esperando');
  });
});

describe('textos de ayuda', () => {
  it('listan los atajos principales', () => {
    const keys = HELP_CONTROLS.map(([k]) => k).join(' ');
    for (const k of ['H', 'Q / E', 'R', 'X', 'Esc', '1–9']) expect(keys).toContain(k);
    for (const [k, t] of [...HELP_CONTROLS, ...HELP_CONCEPTS]) {
      expect(k.length).toBeGreaterThan(0);
      expect(t.length).toBeGreaterThan(3);
    }
  });
});
