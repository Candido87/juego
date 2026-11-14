import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import {
  GROUP_NAMES,
  ITEM_GROUP,
  ITEM_TEXT,
  QUE,
  ROLE_TEXT,
  SIRVE,
  buildingLines,
  buildingStats,
  describeBuilding,
  describeItem,
  describeRole,
  itemLines,
} from './descripciones';
import { BUILD_KINDS, BuildKind, ITEM_IDS, NPC_ROLES } from './types';

const stat = (kind: Parameters<typeof buildingStats>[0], key: string) => buildingStats(kind).find((s) => s.key === key);

describe('todo tiene descripción', () => {
  it('cada edificio (y el núcleo) tiene texto de qué hace y para qué sirve', () => {
    for (const k of ['core', ...BUILD_KINDS] as const) {
      expect(QUE[k], k).toBeTruthy();
      expect(SIRVE[k], k).toBeTruthy();
      expect(describeBuilding(k).name).toBeTruthy();
    }
    // y no sobran claves de edificios que ya no existen
    expect(Object.keys(QUE).sort()).toEqual(['core', ...BUILD_KINDS].sort());
    expect(Object.keys(SIRVE).sort()).toEqual(['core', ...BUILD_KINDS].sort());
  });

  it('cada material y componente tiene descripción y grupo', () => {
    for (const i of ITEM_IDS) {
      expect(ITEM_TEXT[i], i).toBeTruthy();
      expect(GROUP_NAMES[ITEM_GROUP[i]], i).toBeTruthy();
    }
    expect(Object.keys(ITEM_TEXT).sort()).toEqual([...ITEM_IDS].sort());
  });

  it('cada rol tiene descripción', () => {
    for (const r of NPC_ROLES) {
      expect(ROLE_TEXT[r].que, r).toBeTruthy();
      expect(describeRole(r).name).toBe(CONFIG.npc.roles[r].name);
    }
  });
});

describe('los datos mostrados coinciden con config.ts', () => {
  it('el coste de cada edificio es el de config', () => {
    for (const k of BUILD_KINDS) expect(Object.fromEntries(describeBuilding(k).cost)).toEqual(CONFIG.buildings[k].cost);
  });

  it('vida de cada edificio', () => {
    for (const k of BUILD_KINDS) expect(stat(k, 'hp')!.value).toBe(CONFIG.buildings[k].hp);
  });

  it('taladro, granja y bomba: producción por minuto con y sin electricidad', () => {
    const [dl, dh] = CONFIG.power.mult.drill!;
    expect(stat('drill', 'ratePerMin')!.value).toBeCloseTo((60 / CONFIG.drill.period) * dl, 1);
    expect(stat('drill', 'ratePerMinPowered')!.value).toBeCloseTo((60 / CONFIG.drill.period) * dh, 1);
    expect(stat('farm', 'ratePerMin')!.value).toBeCloseTo((60 / CONFIG.farm.period) * CONFIG.power.mult.farm![0], 1);
    expect(stat('pump', 'ratePerMinPowered')!.value).toBeCloseTo((60 / CONFIG.pump.period) * CONFIG.power.mult.pump![1], 1);
  });

  it('consumo de energía de cada consumidor', () => {
    for (const [k, d] of Object.entries(CONFIG.power.demand)) expect(stat(k as BuildKind, 'energyUse')!.value, k).toBe(d);
    expect(stat('storage', 'energyUse')).toBeUndefined();
  });

  it('generadores: potencia y gasto de gasolina por minuto', () => {
    const g = CONFIG.power.generators.generator!;
    expect(stat('generator', 'power')!.value).toBe(g.power);
    expect(stat('generator', 'fuelPerMin')!.value).toBeCloseTo(60 / g.burnTime!, 1);
    expect(stat('generator', 'fuel')!.value).toBe(CONFIG.items.gasoline);
    expect(stat('solar', 'power')!.value).toBe(CONFIG.power.generators.solar!.power);
    expect(stat('solar', 'fuel')).toBeUndefined();
  });

  it('torretas: alcance, daño, daño por segundo y munición', () => {
    for (const [k, t] of Object.entries(CONFIG.turrets)) {
      expect(stat(k as BuildKind, 'range')!.value, k).toBe(t.range);
      expect(stat(k as BuildKind, 'damage')!.value, k).toBe(t.damage);
      expect(stat(k as BuildKind, 'dps')!.value as number, k).toBeCloseTo(t.damage / t.cooldown, 1);
      if (t.ammo) expect(stat(k as BuildKind, 'ammo')!.value, k).toBe(CONFIG.items[t.ammo]);
      else expect(stat(k as BuildKind, 'ammo'), k).toBeUndefined();
    }
  });

  it('casa, núcleo, taller, postes y batería', () => {
    expect(stat('house', 'housing')!.value).toBe(CONFIG.housing.house);
    expect(stat('core', 'housing')!.value).toBe(CONFIG.housing.core);
    expect(stat('workshop', 'workers')!.value).toBe(CONFIG.workshop.workers);
    expect(stat('pole', 'wireRange')!.value).toBe(CONFIG.power.wireRange);
    expect(stat('accumulator', 'capacity')!.value).toBe(CONFIG.power.batteryCapacity);
  });

  it('refinería: ratio y tiempo de la receta', () => {
    const r = CONFIG.recipes.gasoline;
    expect(stat('refinery', 'ratePerMinPowered')!.value).toBeCloseTo((60 / r.time) * CONFIG.power.mult.refinery![1] * r.outputs.gasoline!, 1);
    expect(stat('refinery', 'recipe')!.value).toContain(`${r.inputs.oil} ${CONFIG.items.oil}`);
  });
});

describe('"se produce en" y "se usa en" se generan solos', () => {
  it('cada material se produce en algún sitio (o es mena/comida con su extractor)', () => {
    for (const i of ITEM_IDS) expect(describeItem(i).producedIn.length, i).toBeGreaterThan(0);
  });

  it('cada material se usa en algo', () => {
    for (const i of ITEM_IDS) expect(describeItem(i).usedIn.length, i).toBeGreaterThan(0);
  });

  it('la gasolina sale de la refinería y se quema en los generadores', () => {
    const g = describeItem('gasoline');
    expect(g.producedIn.join()).toContain(CONFIG.buildings.refinery.name);
    expect(g.usedIn.join()).toContain(CONFIG.buildings.generator.name);
    expect(g.usedIn.join()).toContain(CONFIG.buildings.turbine.name);
    expect(g.usedIn.join()).not.toContain(CONFIG.buildings.turret_fire.name);
  });

  it('el engranaje lo usan exactamente los edificios que lo piden en su coste', () => {
    const esperado = BUILD_KINDS.filter((k) => (CONFIG.buildings[k].cost.gear ?? 0) > 0).map((k) => CONFIG.buildings[k].name);
    const usado = describeItem('gear').usedIn.filter((u) => u.endsWith('(construcción)')).map((u) => u.replace(' (construcción)', ''));
    expect(usado.sort()).toEqual(esperado.sort());
  });

  it('el carbón lo usa el lanzallamas como munición y se extrae con taladro', () => {
    const c = describeItem('coal');
    expect(c.usedIn.join()).toContain(`${CONFIG.buildings.turret_fire.name} (munición)`);
    expect(c.producedIn).toContain(CONFIG.buildings.drill.name);
  });

  it('la comida se produce en la granja y la consume la población', () => {
    const f = describeItem('food');
    expect(f.producedIn).toContain(CONFIG.buildings.farm.name);
    expect(f.usedIn.join()).toContain('población');
  });

  it('al cambiar una receta, el texto cambia solo', () => {
    const r = CONFIG.recipes.gear;
    const antes = describeItem('iron_plate').usedIn.join();
    expect(antes).toContain(`receta ${r.name}`);
    const original = r.inputs;
    r.inputs = { copper_plate: 1 };
    try {
      expect(describeItem('iron_plate').usedIn.join()).not.toContain(`receta ${r.name}`);
      expect(describeItem('copper_plate').usedIn.join()).toContain(`receta ${r.name}`);
    } finally {
      r.inputs = original;
    }
  });
});

describe('líneas de texto', () => {
  it('el taladro menciona su producción y su consumo reales', () => {
    const txt = buildingLines('drill').join('\n');
    expect(txt).toContain(String((60 / CONFIG.drill.period) * CONFIG.power.mult.drill![0]));
    expect(txt).toContain(`Consume: ${CONFIG.power.demand.drill}`);
  });

  it('un material lista dónde se produce y dónde se usa', () => {
    const txt = itemLines('frame').join('\n');
    expect(txt).toContain('Se produce en:');
    expect(txt).toContain('Se usa en:');
    expect(txt).toContain(CONFIG.recipes.frame.name);
  });
});
