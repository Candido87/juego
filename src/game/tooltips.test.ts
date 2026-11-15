import { describe, expect, it } from 'vitest';
import { count } from './bag';
import { CONFIG } from './config';
import { flatGame, instant, run } from './testutil';
import { HUD_KEYS, buildTip, costText, hudTip, itemStatus, itemTip, lockReason, pendingNeed } from './tooltips';
import { BUILD_KINDS, Ore } from './types';

describe('tooltip de edificio', () => {
  it('el coste marca en verde lo que tienes y en rojo lo que falta', () => {
    const g = flatGame();
    g.storage.frame = 1;
    g.storage.gear = 5;
    const t = buildTip(g, 'drill'); // 1 bastidor + 2 engranajes
    expect(costText(t.cost)).toBe('1 Bastidor, 2 Engranaje');
    expect(t.cost.every((c) => c.ok)).toBe(true);
    g.storage.gear = 1;
    const t2 = buildTip(g, 'drill');
    expect(t2.cost.find((c) => c.item === 'frame')!.ok).toBe(true);
    expect(t2.cost.find((c) => c.item === 'gear')).toMatchObject({ need: 2, have: 1, ok: false });
  });

  it('trae descripción, estadísticas y atajo', () => {
    const g = flatGame();
    const t = buildTip(g, 'turret_bullet', '5');
    expect(t.que.length).toBeGreaterThan(5);
    expect(t.stats.some((s) => s.startsWith('Alcance'))).toBe(true);
    expect(t.key).toBe('5');
  });

  it('un edificio bloqueado dice por qué; uno disponible no', () => {
    const g = flatGame();
    expect(lockReason(g, 'drill')).toBeNull();
    expect(lockReason(g, 'turret_laser')).toMatch(/Bloqueado|Requiere/);
    expect(buildTip(g, 'turret_laser').locked).toBeTruthy();
    g.unlockedBuildings.add('turret_laser');
    expect(buildTip(g, 'turret_laser').locked).toBeNull();
  });

  it('el requisito menciona la tecnología que lo desbloquea en el árbol', () => {
    const g = flatGame();
    expect(lockReason(g, 'turret_laser')).toContain(CONFIG.tech.find((n) => n.id === 'arm_laser')!.name);
  });

  it('todos los edificios generan tooltip sin fallar', () => {
    const g = flatGame();
    for (const k of BUILD_KINDS) expect(buildTip(g, k).title, k).toBeTruthy();
  });
});

describe('tooltip de material: falta o sobra', () => {
  it('muestra cantidad y dónde se produce y se usa', () => {
    const g = flatGame();
    const t = itemTip(g, 'gear');
    expect(t.amount).toBe(count(g.storage, 'gear'));
    expect(t.producedIn.length).toBeGreaterThan(0);
    expect(t.usedIn.length).toBeGreaterThan(0);
  });

  it('falta cuando las obras pendientes piden más de lo que hay', () => {
    const g = flatGame([[3, 3, Ore.Iron]]);
    g.storage.frame = 0;
    g.place('drill', 3, 3); // pide 1 bastidor
    expect(pendingNeed(g, 'frame')).toBe(1);
    expect(itemStatus(g, 'frame').status).toBe('falta');
  });

  it('falta cuando está a cero y se usa en algo que se puede construir', () => {
    const g = flatGame();
    g.storage.wire = 0;
    expect(itemStatus(g, 'wire').status).toBe('falta');
  });

  it('sobra cuando hay muchísimo más de lo que se gasta', () => {
    const g = flatGame();
    g.storage.gear = 500;
    expect(itemStatus(g, 'gear').status).toBe('sobra');
    g.storage.iron_ore = CONFIG.ui.surplusFallback + 1;
    expect(itemStatus(g, 'iron_ore').status).toBe('sobra');
  });

  it('normal en el caso intermedio', () => {
    const g = flatGame();
    g.storage.gear = 6;
    expect(itemStatus(g, 'gear').status).toBe('normal');
  });

  it('la comida: falta con hambre, sobra con mucha', () => {
    const g = flatGame();
    g.storage.food = 0;
    run(g, CONFIG.food.interval);
    expect(itemStatus(g, 'food').status).toBe('falta');
    g.storage.food = 999;
    run(g, 0.2);
    expect(itemStatus(g, 'food').status).toBe('sobra');
  });

  it('una obra ya construida no cuenta como pendiente', () => {
    const g = flatGame([[3, 3, Ore.Iron]]);
    instant(g, 'drill', 3, 3);
    expect(pendingNeed(g, 'frame')).toBe(0);
  });
});

describe('tooltips del HUD', () => {
  it('todos los indicadores explican qué significan y qué pasa en cero', () => {
    const g = flatGame();
    for (const k of HUD_KEYS) {
      const t = hudTip(g, k);
      expect(t.means.length, k).toBeGreaterThan(20);
      expect(t.zero.length, k).toBeGreaterThan(10);
    }
  });

  it('usan los números reales de config.ts', () => {
    const g = flatGame();
    const f = hudTip(g, 'food');
    expect(f.zero).toContain(String(CONFIG.food.starveGrace));
    expect(f.zero).toContain(String(CONFIG.food.hungryFactor));
    expect(f.means).toContain(String(Math.round(g.foodPerMinute() * 10) / 10));
    expect(hudTip(g, 'population').means).toContain(String(CONFIG.housing.house));
    expect(hudTip(g, 'core').means).toContain(String(CONFIG.coreHp));
    expect(hudTip(g, 'gasoline').means).toContain(String(CONFIG.power.generators.generator!.burnTime));
  });
});
