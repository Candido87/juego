import { describe, expect, it } from 'vitest';
import { CATEGORIES } from './descripciones';
import { categoryAvailable, categoryOf, cycleCategory, kindForKey, menuEntries } from './menu';
import { flatGame } from './testutil';
import { BUILD_KINDS } from './types';

describe('menú por categorías', () => {
  it('cada edificio está en exactamente una categoría y ninguna está vacía', () => {
    const seen = CATEGORIES.flatMap((c) => c.kinds);
    expect([...seen].sort()).toEqual([...BUILD_KINDS].sort());
    expect(new Set(seen).size).toBe(seen.length);
    for (const c of CATEGORIES) expect(c.kinds.length, c.id).toBeGreaterThan(0);
  });

  it('son las siete categorías pedidas', () => {
    expect(CATEGORIES.map((c) => c.name)).toEqual(['Extracción', 'Transporte', 'Industria', 'Energía', 'Defensa', 'Población', 'Servicios']);
  });

  it('las torretas y los muros están en Defensa; casas y granjas en Población; el taller en Servicios', () => {
    for (const k of BUILD_KINDS.filter((k) => k.startsWith('turret_') || k.startsWith('wall_'))) expect(categoryOf(k)).toBe('defense');
    expect(categoryOf('house')).toBe('population');
    expect(categoryOf('farm')).toBe('population');
    expect(categoryOf('workshop')).toBe('services');
  });

  it('los bloqueados llevan motivo y los disponibles no', () => {
    const g = flatGame();
    const def = menuEntries(g, 'defense');
    expect(def.find((e) => e.kind === 'turret_bullet')!.locked).toBeNull();
    expect(def.find((e) => e.kind === 'turret_laser')!.locked).toBeTruthy();
    g.unlockedBuildings.add('turret_laser');
    expect(menuEntries(g, 'defense').find((e) => e.kind === 'turret_laser')!.locked).toBeNull();
  });

  it('los atajos son la posición en la categoría', () => {
    const g = flatGame();
    const e = menuEntries(g, 'defense');
    expect(e.map((x) => x.key)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    expect(kindForKey('defense', 1)).toBe('turret_bullet');
    expect(kindForKey('defense', 7)).toBe('wall_metal');
    expect(kindForKey('extraction', 5)).toBeUndefined();
  });

  it('cambiar de categoría da la vuelta en los dos sentidos', () => {
    expect(cycleCategory('extraction', 1)).toBe('transport');
    expect(cycleCategory('extraction', -1)).toBe('services');
    expect(cycleCategory('services', 1)).toBe('extraction');
    let c = cycleCategory('industry', 1);
    for (let i = 0; i < CATEGORIES.length - 1; i++) c = cycleCategory(c, 1);
    expect(c).toBe('industry');
  });

  it('una categoría sin nada desbloqueado se marca no disponible', () => {
    const g = flatGame();
    expect(categoryAvailable(g, 'extraction')).toBe(true);
    for (const k of ['pole', 'generator']) g.unlockedBuildings.delete(k as never);
    expect(categoryAvailable(g, 'energy')).toBe(false);
  });
});
