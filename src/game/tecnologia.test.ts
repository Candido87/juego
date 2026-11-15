import { describe, expect, it } from 'vitest';
import { CONFIG, TECH_BRANCHES } from './config';
import { Game } from './game';
import { makeSave, gameFromSave } from './savegame';
import { techDependents, techNode, techOfBranch, techPathCost, techUnlockingBuilding, techUnlockingRecipe } from './tecnologia';
import { flatGame, instant, run } from './testutil';
import { BUILD_KINDS, TurretKind } from './types';

const TECH = CONFIG.tech;

/** Compra, sin gastar puntos de verdad, todos los requisitos de un nodo (y los suyos) para dejarlo disponible. */
function researchPrereqs(g: Game, id: string) {
  const walk = (x: string) => {
    for (const r of techNode(x).requires) {
      if (g.researched.has(r)) continue;
      walk(r);
      g.researchPoints += techNode(r).cost;
      expect(g.research(r), r).toBe(true);
    }
  };
  walk(id);
}

describe('árbol de tecnología: datos', () => {
  it('hay nodos en las siete ramas, con ids únicos y coste en puntos (sin componentes ni tiempo)', () => {
    expect(TECH.length).toBeGreaterThanOrEqual(25);
    expect(new Set(TECH.map((n) => n.id)).size).toBe(TECH.length);
    for (const b of TECH_BRANCHES) expect(techOfBranch(b).length, b).toBeGreaterThanOrEqual(2);
    for (const n of TECH) {
      expect(Number.isInteger(n.cost) && n.cost > 0, n.id).toBe(true);
      expect((n as unknown as { time?: number }).time, n.id).toBeUndefined();
      expect(TECH_BRANCHES, n.id).toContain(n.branch);
      expect(n.name.length, n.id).toBeGreaterThan(2);
    }
  });

  it('los requisitos existen, no hay ciclos y dentro de una rama cada nodo está en una columna posterior a la de sus requisitos', () => {
    for (const n of TECH) {
      for (const r of n.requires) {
        expect(TECH.some((x) => x.id === r), `${n.id} requiere ${r}`).toBe(true);
        // La columna es de la rama: sólo cuenta entre nodos de la misma rama (los cruces entre ramas no dibujan columna).
        if (techNode(r).branch === n.branch) expect(techNode(r).tier, `${n.id} después de ${r}`).toBeLessThan(n.tier);
      }
    }
    // Sin ciclos: se puede comprar todo en orden topológico.
    const done = new Set<string>();
    let progress = true;
    while (progress) {
      progress = false;
      for (const n of TECH) if (!done.has(n.id) && n.requires.every((r) => done.has(r))) (done.add(n.id), (progress = true));
    }
    expect(done.size).toBe(TECH.length);
  });

  it('lo bloqueado de inicio lo desbloquea exactamente un nodo: edificios y recetas', () => {
    const start = new Set<string>(CONFIG.startUnlocks.buildings);
    for (const k of BUILD_KINDS) {
      const by = TECH.filter((n) => n.unlocks.buildings?.includes(k));
      if (start.has(k)) expect(by.length, `${k} ya viene desbloqueado`).toBe(0);
      else expect(by.length, `${k}`).toBe(1);
    }
    const startR = new Set(CONFIG.startUnlocks.recipes);
    for (const [id, r] of Object.entries(CONFIG.recipes)) {
      const by = TECH.filter((n) => n.unlocks.recipes?.includes(id));
      // Las recetas de nivel 2 (excepto Ciencia II, que ya no se usa para investigar) salen del árbol.
      if (r.tier >= 2 && id !== 'science_2' && !startR.has(id) && (r.building ?? 'factory') === 'factory') expect(by.length, id).toBe(1);
      if (startR.has(id)) expect(by.length, id).toBe(0);
    }
    expect(techUnlockingBuilding('turret_laser')?.id).toBe('arm_laser');
    expect(techUnlockingRecipe('circuit')?.id).toBe('ind_circuits');
    expect(techUnlockingBuilding('drill')).toBeUndefined();
  });

  it('las rutas son alcanzables: lo que desbloquea cada cosa no depende de sí mismo y los costes escalan por columna', () => {
    for (const n of TECH) expect(techPathCost(n.id, new Set()), n.id).toBeGreaterThanOrEqual(n.cost);
    // Primera columna barata (8-25), la más profunda cara (≥ 60).
    for (const n of TECH.filter((x) => x.tier === 1)) expect(n.cost, n.id).toBeLessThanOrEqual(25);
    expect(Math.max(...TECH.map((n) => n.cost))).toBeGreaterThanOrEqual(60);
    // Con un investigador (6/min) desde el minuto 2, a los 5:00 hay 18 puntos: alcanza para varias de la primera columna.
    const early = TECH.filter((n) => n.requires.length === 0 && n.cost <= CONFIG.research.pointsPerResearcher * 3).length;
    expect(early).toBeGreaterThanOrEqual(3);
    expect(techDependents('ind_tier2').length).toBeGreaterThanOrEqual(3);
  });
});

describe('árbol de tecnología: compra y efectos', () => {
  it('sólo se compra con puntos suficientes y requisitos cumplidos; gasta exactamente el coste', () => {
    const g = flatGame();
    const n = techNode('def_wood');
    expect(g.techState('def_wood')).toBe('nopoints');
    expect(g.research('def_wood')).toBe(false);
    expect(g.canResearch('def_wood').reason).toMatch(/Faltan 8 puntos/);
    g.researchPoints = n.cost - 0.5;
    expect(g.research('def_wood')).toBe(false);
    g.researchPoints = n.cost + 2.25;
    expect(g.techState('def_wood')).toBe('available');
    expect(g.research('def_wood')).toBe(true);
    expect(g.researchPoints).toBeCloseTo(2.25, 8);
    expect(g.techState('def_wood')).toBe('done');
    expect(g.research('def_wood')).toBe(false);
    expect(g.canResearch('def_wood').reason).toBe('Ya investigado');
    // Con requisitos sin cumplir: bloqueado aunque sobren puntos, y dice cuáles faltan.
    g.researchPoints = 1000;
    expect(g.techState('def_metal')).toBe('locked');
    expect(g.research('def_metal')).toBe(false);
    expect(g.canResearch('def_metal').reason).toContain('Murallas de piedra');
    expect(g.researchPoints).toBe(1000);
  });

  it('cuando faltan puntos explica cuánto tardarás con la producción actual', () => {
    const g = flatGame();
    expect(g.canResearch('def_wood').reason).toContain('no produces puntos');
    for (let i = 0; i < 3; i++) (g as unknown as { spawnNpc: (r: string) => unknown }).spawnNpc('constructor');
    const gen = instant(g, 'generator', 4, 5);
    gen.inv = { gasoline: 100 };
    gen.running = true;
    instant(g, 'pole', 4, 4);
    instant(g, 'laboratory', 5, 4);
    run(g, 0.2);
    g.reassignTo('researcher');
    g.researchPoints = 2;
    // Faltan 6 puntos a 6/min: 1 minuto.
    expect(g.canResearch('def_wood').reason).toMatch(/Faltan 6 puntos.*1 min.*6\.0\/min/);
  });

  it('cada nodo desbloquea lo que dice y nada más', () => {
    for (const n of TECH) {
      const g = flatGame();
      researchPrereqs(g, n.id);
      const before = {
        b: new Set(g.unlockedBuildings),
        r: new Set(g.unlockedRecipes),
        bonus: { ...g.bonus },
        lv: { ...g.turretLevel },
        tier: g.factoryTier,
        done: new Set(g.researched),
      };
      g.researchPoints = n.cost;
      expect(g.research(n.id), n.id).toBe(true);
      expect(g.researchPoints, n.id).toBeCloseTo(0, 8);
      expect([...g.unlockedBuildings].filter((x) => !before.b.has(x)).sort(), `${n.id} edificios`).toEqual([...(n.unlocks.buildings ?? [])].sort());
      expect([...g.unlockedRecipes].filter((x) => !before.r.has(x)).sort(), `${n.id} recetas`).toEqual([...(n.unlocks.recipes ?? [])].sort());
      expect([...g.researched].filter((x) => !before.done.has(x)), n.id).toEqual([n.id]);
      const e = n.effects ?? {};
      expect(g.bonus.npcSpeed - before.bonus.npcSpeed, `${n.id} velocidad`).toBeCloseTo(e.npcSpeed ?? 0, 8);
      expect(g.bonus.npcCapacity - before.bonus.npcCapacity, `${n.id} capacidad`).toBeCloseTo(e.npcCapacity ?? 0, 8);
      expect(g.bonus.npcWork - before.bonus.npcWork, `${n.id} trabajo`).toBeCloseTo(e.npcWork ?? 0, 8);
      expect(g.bonus.houseCapacity - before.bonus.houseCapacity, `${n.id} casas`).toBeCloseTo(e.houseCapacity ?? 0, 8);
      expect(g.bonus.researchRate - before.bonus.researchRate, `${n.id} investigación`).toBeCloseTo(e.researchRate ?? 0, 8);
      expect(g.factoryTier, `${n.id} nivel de fábrica`).toBe(e.factoryTier ? Math.max(before.tier, e.factoryTier) : before.tier);
      for (const k of ['turret_bullet', 'turret_laser', 'turret_fire', 'turret_frost'] as TurretKind[]) {
        expect(g.turretLevel[k] - before.lv[k], `${n.id} nivel de ${k}`).toBe(e.turretLevel === k ? 1 : 0);
      }
    }
  });

  it('lo bloqueado no se puede construir y se puede tras investigarlo', () => {
    const g = flatGame();
    g.storage.frame = 50;
    g.storage.wood = 50;
    const before = g.canPlace('wall_wood', 3, 3);
    expect(before.ok).toBe(false);
    expect(before.reason).toBe('Sin investigar');
    g.researchPoints = 8;
    expect(g.research('def_wood')).toBe(true);
    expect(g.canPlace('wall_wood', 3, 3).ok).toBe(true);
    // Lo demás sigue bloqueado.
    expect(g.canPlace('wall_stone', 4, 3).ok).toBe(false);
    expect(g.canPlace('turret_laser', 5, 3).reason).toBe('Sin investigar');
  });

  it('el nivel de fábrica 2 habilita las recetas de nivel 2 ya desbloqueadas; las mejoras de torreta suben el nivel (con tope)', () => {
    const g = flatGame();
    const f = instant(g, 'factory', 4, 4);
    g.researchPoints = 500;
    for (const id of ['ind_tier2', 'ind_circuits']) expect(g.research(id), id).toBe(true);
    expect(g.recipesFor(f)).toContain('circuit');
    // Torretas: balas sube dos veces y no pasa del máximo.
    for (const id of ['arm_bullet_2', 'arm_bullet_3']) expect(g.research(id), id).toBe(true);
    expect(g.turretLevel.turret_bullet).toBe(CONFIG.turretLevels.maxLevel);
    expect(g.turretRange('turret_bullet')).toBeGreaterThan(CONFIG.turrets.turret_bullet.range);
    expect(g.turretDamage('turret_bullet')).toBeGreaterThan(CONFIG.turrets.turret_bullet.damage);
  });

  it('las mejoras de producción afectan a la simulación: casas, velocidad y puntos por minuto', () => {
    const g = flatGame();
    g.researchPoints = 500;
    const houses = (n: number) => {
      for (let i = 0; i < n; i++) instant(g, 'house', 2 + i * 2, 2);
    };
    houses(1);
    const cap0 = g.housingCapacity();
    expect(g.research('pop_houses_1')).toBe(true);
    expect(g.housingCapacity()).toBe(cap0 + 1);
    const n = g.npcs[0];
    const sp0 = g.npcSpeed(n);
    expect(g.research('log_speed_1')).toBe(true);
    expect(g.npcSpeed(n)).toBeCloseTo(sp0 * 1.25, 6);
    expect(g.research('ing_research_1')).toBe(true);
    expect(g.bonus.researchRate).toBeCloseTo(0.2, 8);
  });

  it('el recomendado es el más barato de lo que se puede comprar a continuación', () => {
    const g = flatGame();
    expect(g.recommendedTech()).toBe('def_wood');
    g.researchPoints = 100;
    g.research('def_wood');
    expect(techNode(g.recommendedTech()!).requires.every((r) => g.researched.has(r))).toBe(true);
    for (const n of TECH) {
      researchPrereqs(g, n.id);
      g.researchPoints += n.cost;
      g.research(n.id);
    }
    expect(g.recommendedTech()).toBeNull();
    expect(g.researched.size).toBe(TECH.length);
  });

  it('guardar y cargar conserva puntos, nodos comprados, bonificaciones y nivel de fábrica', () => {
    const g = flatGame();
    g.researchPoints = 400;
    for (const id of ['ind_tier2', 'ind_circuits', 'arm_bullet_2', 'ing_research_1', 'def_wood']) expect(g.research(id), id).toBe(true);
    const left = g.researchPoints;
    const save = JSON.parse(JSON.stringify(makeSave(g, 7, 1)));
    const h = gameFromSave(save);
    expect(h.researchPoints).toBeCloseTo(left, 8);
    expect([...h.researched].sort()).toEqual([...g.researched].sort());
    expect(h.factoryTier).toBe(2);
    expect(h.turretLevel.turret_bullet).toBe(2);
    expect(h.bonus.researchRate).toBeCloseTo(0.2, 8);
    expect(h.unlockedBuildings.has('wall_wood')).toBe(true);
    expect(h.unlockedRecipes.has('circuit')).toBe(true);
    // Un guardado antiguo (sin nodos) arranca sin nada investigado.
    const old = JSON.parse(JSON.stringify(save));
    delete old.state.researched;
    delete old.state.factoryTier;
    expect(gameFromSave(old).researched.size).toBe(0);
    expect(gameFromSave(old).factoryTier).toBe(CONFIG.factory.tier);
  });
});
