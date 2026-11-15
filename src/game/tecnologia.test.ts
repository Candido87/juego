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
    expect(before.reason).toContain('Sin investigar: «Murallas de madera» (Defensa, 8 puntos)');
    g.researchPoints = 8;
    expect(g.research('def_wood')).toBe(true);
    expect(g.canPlace('wall_wood', 3, 3).ok).toBe(true);
    // Lo demás sigue bloqueado.
    expect(g.canPlace('wall_stone', 4, 3).ok).toBe(false);
    expect(g.canPlace('turret_laser', 5, 3).reason).toContain('«Torreta láser»');
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

import { TREE, layoutTree, techIconKind, techMatches, techTip, techUnlockLines, techVisible } from './arbol';

describe('pantalla del árbol (parte pura)', () => {
  it('cada nodo tiene sitio, sin solaparse, y las líneas van de un requisito al siguiente', () => {
    const L = layoutTree();
    expect(L.nodes.size).toBe(TECH.length);
    const boxes = [...L.nodes.values()];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const overlap = a.x < b.x + TREE.nodeW && b.x < a.x + TREE.nodeW && a.y < b.y + TREE.nodeH && b.y < a.y + TREE.nodeH;
        expect(overlap, `${i} y ${j}`).toBe(false);
      }
    }
    // Un carril por rama, sin solaparse, y cada nodo dentro del suyo.
    expect(L.lanes.map((l) => l.branch)).toEqual([...TECH_BRANCHES]);
    for (let i = 1; i < L.lanes.length; i++) expect(L.lanes[i].y).toBeGreaterThanOrEqual(L.lanes[i - 1].y + L.lanes[i - 1].h);
    for (const n of TECH) {
      const p = L.nodes.get(n.id)!;
      const lane = L.lanes.find((l) => l.branch === n.branch)!;
      expect(p.y, n.id).toBeGreaterThanOrEqual(lane.y);
      expect(p.y + TREE.nodeH, n.id).toBeLessThanOrEqual(lane.y + lane.h);
      expect(p.x + TREE.nodeW, n.id).toBeLessThanOrEqual(L.width);
    }
    expect(L.edges.length).toBe(TECH.reduce((s, n) => s + n.requires.length, 0));
    for (const e of L.edges) {
      const from = techNode(e.from);
      const to = techNode(e.to);
      if (from.branch === to.branch) expect(e.x2).toBeGreaterThan(e.x1);
    }
    expect(L.height).toBeGreaterThan(300);
  });

  it('los textos salen de los datos: desbloqueos, efectos y requisitos', () => {
    expect(techUnlockLines(techNode('arm_laser'))).toEqual(['Edificio: Torreta láser']);
    expect(techUnlockLines(techNode('ind_circuits'))).toEqual(['Receta: Circuito']);
    expect(techUnlockLines(techNode('log_speed_1'))).toEqual(['Personas: +25 % de velocidad al andar']);
    expect(techUnlockLines(techNode('pop_houses_1'))).toEqual(['Casas: +1 plaza cada una']);
    expect(techUnlockLines(techNode('ing_research_2'))[0]).toContain('+25 %');
    expect(techUnlockLines(techNode('arm_bullet_2'))[0]).toContain('Torreta de balas');
    expect(techUnlockLines(techNode('ind_tier2'))[0]).toContain('nivel 2');
    // Todo nodo dice algo, y lo que dice existe en los datos.
    for (const n of TECH) expect(techUnlockLines(n).length, n.id).toBeGreaterThan(0);
    expect(techIconKind(techNode('arm_laser'))).toBe('turret_laser');
    expect(techIconKind(techNode('arm_fire_2'))).toBe('turret_fire');
    expect(techIconKind(techNode('log_speed_1'))).toBeNull();
  });

  it('el tooltip refleja el estado: bloqueado con sus requisitos, sin puntos con el tiempo, disponible y comprado', () => {
    const g = flatGame();
    const locked = techTip(g, 'def_metal');
    expect(locked.state).toBe('locked');
    expect(locked.requires.map((r) => [r.name, r.done])).toEqual([['Murallas de piedra', false], ['Placas de muro', false]]);
    expect(locked.reason).toContain('Faltan requisitos');
    expect(locked.cost).toBe(50);
    const poor = techTip(g, 'def_wood');
    expect(poor.state).toBe('nopoints');
    expect(poor.reason).toMatch(/Faltan 8 puntos/);
    expect(poor.recommended).toBe(true);
    g.researchPoints = 20;
    const ok = techTip(g, 'def_wood');
    expect(ok.state).toBe('available');
    expect(ok.reason).toBeUndefined();
    g.research('def_wood');
    const done = techTip(g, 'def_wood');
    expect([done.state, done.stateText, done.reason]).toEqual(['done', 'Investigado', undefined]);
    expect(done.recommended).toBe(false);
  });

  it('la búsqueda y el filtro de rama ignoran acentos y mayúsculas y miran lo que desbloquea', () => {
    expect(techMatches(techNode('arm_laser'), 'LASER')).toBe(true);
    expect(techMatches(techNode('ind_circuits'), 'circuito')).toBe(true);
    expect(techMatches(techNode('def_wood'), 'láser')).toBe(false);
    expect(techMatches(techNode('def_wood'), '')).toBe(true);
    expect(TECH.filter((n) => techMatches(n, 'casa')).map((n) => n.id).sort()).toEqual(['pop_houses_1', 'pop_houses_2']);
    expect(techVisible(techNode('arm_laser'), 'Armamento', '')).toBe(true);
    expect(techVisible(techNode('arm_laser'), 'Defensa', '')).toBe(false);
    expect(techVisible(techNode('arm_laser'), null, 'torreta')).toBe(true);
  });
});

import { menuEntries } from './menu';
import { recipeBlockedReason, recipeEntries } from './recetas';
import { lockReason } from './tooltips';
import { techLabel, techLockText, techUnlockingTier } from './tecnologia';

describe('bloqueos reales: el menú y las recetas dicen qué nodo lo desbloquea', () => {
  it('cada edificio bloqueado del menú nombra su nodo, su rama y su coste, y cambia con el estado', () => {
    const g = flatGame();
    const entries = menuEntries(g, 'defense');
    const wall = entries.find((e) => e.kind === 'wall_wood')!;
    expect(wall.locked).toContain('«Murallas de madera» (Defensa, 8 puntos)');
    expect(wall.locked).toContain('te faltan 8 puntos');
    // Con requisitos pendientes dice cuáles.
    const metal = entries.find((e) => e.kind === 'wall_metal')!;
    expect(metal.locked).toContain('antes investiga «Murallas de piedra» y «Placas de muro»');
    // Con puntos: avisa de que ya se puede comprar.
    g.researchPoints = 8;
    expect(lockReason(g, 'wall_wood')).toContain('ya tienes los puntos');
    // Tras investigarlo deja de estar bloqueado y los demás siguen igual.
    g.research('def_wood');
    expect(lockReason(g, 'wall_wood')).toBeNull();
    expect(lockReason(g, 'wall_stone')).toContain('«Murallas de piedra»');
    // Lo que viene de inicio nunca está bloqueado.
    for (const k of CONFIG.startUnlocks.buildings) expect(lockReason(g, k), k).toBeNull();
  });

  it('todo edificio bloqueado tiene un motivo con nodo (ninguno dice "no hay tecnología")', () => {
    const g = flatGame();
    for (const k of BUILD_KINDS) {
      if (g.unlockedBuildings.has(k)) continue;
      const reason = lockReason(g, k)!;
      expect(reason, k).toContain('Requiere investigar');
      expect(reason, k).toContain(techLabel(techUnlockingBuilding(k)!));
    }
  });

  it('el panel de recetas dice qué nodo desbloquea cada receta bloqueada y qué nivel de fábrica hace falta', () => {
    const g = flatGame();
    const f = instant(g, 'factory', 4, 4);
    const circuit = recipeEntries(g, f).find((e) => e.id === 'circuit')!;
    expect(circuit.available).toBe(false);
    expect(circuit.reason).toContain('«Circuitos» (Industria, 20 puntos)');
    // Desbloqueada pero sin fábrica de nivel 2: el motivo es el nivel, con el nodo que lo da.
    g.unlockedRecipes.add('circuit');
    const tier = recipeBlockedReason(g, 'circuit')!;
    expect(tier).toContain('nivel 2');
    expect(tier).toContain(techLabel(techUnlockingTier(2)!));
    expect(techUnlockingTier(2)?.id).toBe('ind_tier2');
    // Con el nivel, ya se puede elegir.
    g.researchPoints = 25;
    g.research('ind_tier2');
    expect(recipeBlockedReason(g, 'circuit')).toBeUndefined();
    expect(recipeBlockedReason(g, 'iron_plate')).toBeUndefined();
  });

  it('techLockText cubre los cuatro estados', () => {
    const g = flatGame();
    const n = techNode('def_stone');
    expect(techLockText(g, n)).toContain('antes investiga «Murallas de madera»');
    g.researchPoints = 100;
    g.research('def_wood');
    g.researchPoints = 10;
    expect(techLockText(g, n)).toContain('te faltan 15 puntos');
    g.researchPoints = 25;
    expect(techLockText(g, n)).toContain('pulsa T');
    g.research('def_stone');
    expect(techLockText(g, n)).toBe(techLabel(n));
  });
});
