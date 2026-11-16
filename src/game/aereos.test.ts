import { describe, expect, it } from 'vitest';
import { flyToward, pickAirTarget } from './aereos';
import { CONFIG } from './config';
import { Enemy } from './game';
import { flatGame, instant, run } from './testutil';
import { ENEMY_KINDS } from './types';

const cand = (id: number, kind: string, x: number, y: number) => ({ id, kind: kind as never, built: true, x, y, w: 1, d: 1 });

function air(g: ReturnType<typeof flatGame>, kind: 'flyer' | 'bomber' | 'heavy', x: number, y: number): Enemy {
  const def = CONFIG.enemies[kind];
  const e: Enemy = {
    id: 900 + g.enemies.length, kind, x, y, tx: Math.floor(x), ty: Math.floor(y), hp: def.hp, maxHp: def.hp, speed: def.speed, armor: def.armor,
    flying: true, slowTimer: 0, slowFactor: 1, burnTimer: 0, burnDps: 0, attacking: null,
  };
  g.enemies.push(e);
  return e;
}

describe('aéreos: lógica pura', () => {
  it('elige el edificio del tipo pedido más cercano; sin ninguno, null (va al núcleo)', () => {
    const bs = [cand(1, 'factory', 2, 2), cand(2, 'factory', 8, 8), cand(3, 'turret_bullet', 5, 5), cand(4, 'wall_wood', 1, 1)];
    expect(pickAirTarget({ x: 7, y: 7 }, bs, 'industry')?.id).toBe(2);
    expect(pickAirTarget({ x: 7, y: 7 }, bs, 'turret')?.id).toBe(3);
    expect(pickAirTarget({ x: 7, y: 7 }, bs, 'core')).toBeNull();
    expect(pickAirTarget({ x: 7, y: 7 }, [cand(4, 'wall_wood', 1, 1)], 'industry')).toBeNull();
    expect(pickAirTarget({ x: 7, y: 7 }, [{ ...cand(5, 'factory', 7, 8), built: false }], 'industry')).toBeNull();
  });
  it('vuela en línea recta y no pasa de largo', () => {
    let p = { x: 0, y: 0, arrived: false };
    for (let i = 0; i < 100 && !p.arrived; i++) p = flyToward(p.x, p.y, 6, 8, 0.5);
    expect(p.arrived).toBe(true);
    expect(Math.hypot(6 - p.x, 8 - p.y)).toBeLessThanOrEqual(0.61);
    // Siempre sobre la recta origen-destino (x/y = 6/8).
    expect(p.x / p.y).toBeCloseTo(6 / 8, 3);
  });
  it('los tres aéreos están definidos con su objetivo', () => {
    expect(ENEMY_KINDS).toEqual(expect.arrayContaining(['flyer', 'bomber', 'heavy']));
    expect(CONFIG.enemies.flyer.flying && CONFIG.enemies.bomber.flying && CONFIG.enemies.heavy.flying).toBe(true);
    expect(CONFIG.enemies.bomber.target).toBe('industry');
    expect(CONFIG.enemies.bomber.bombRadius).toBeGreaterThan(0);
    expect(CONFIG.enemies.heavy.target).toBe('turret');
    expect(CONFIG.enemies.heavy.armor).toBeGreaterThan(CONFIG.enemies.bomber.armor);
  });
});

describe('aéreos: en la partida', () => {
  it('sólo el lanzamisiles los alcanza', () => {
    for (const k of ['turret_bullet', 'turret_laser', 'turret_fire', 'turret_frost'] as const) expect(CONFIG.turrets[k].hitsAir, k).toBe(false);
    expect(CONFIG.turrets.turret_missile.hitsAir).toBe(true);
  });
  it('una torreta de balas no daña a un aéreo; el lanzamisiles sí', () => {
    const g = flatGame();
    instant(g, 'turret_bullet', 4, 4);
    const e = air(g, 'flyer', 6, 5);
    const hp = e.hp;
    run(g, 2);
    expect(e.hp).toBe(hp);
    const g2 = flatGame();
    instant(g2, 'turret_missile', 4, 4);
    const e2 = air(g2, 'heavy', 6, 5);
    run(g2, 4);
    expect(e2.hp).toBeLessThan(CONFIG.enemies.heavy.hp);
  });
  it('el ligero cruza muros hacia el núcleo en línea recta y lo golpea', () => {
    const g = flatGame();
    g.unlockedBuildings.add('wall_stone');
    for (let y = 0; y < 20; y++) {
      const w = g.canPlace('wall_stone', 15, y).ok ? g.place('wall_stone', 15, y, 0) : null;
      if (w) g.completeBuilding(w);
    }
    air(g, 'flyer', 18, 9.5);
    const core0 = g.coreHp;
    run(g, 12);
    expect(g.coreHp).toBeLessThan(core0);
    expect(g.enemies.length).toBe(0);
  });
  it('el bombardero va a la industria y daña en área; sin industria va al núcleo', () => {
    const g = flatGame();
    const f1 = instant(g, 'factory', 3, 3);
    const gen = instant(g, 'generator', 3, 7);
    const hp = f1.hp;
    const hg = gen.hp;
    const e = air(g, 'bomber', 3.5, 3.5);
    run(g, 6);
    expect(e.attacking).toBe(f1.id);
    expect(f1.hp).toBeLessThan(hp);
    expect(gen.hp).toBe(hg); // a más de 1,5 casillas: fuera del radio
    const g2 = flatGame();
    const b2 = air(g2, 'bomber', 15, 15);
    const core0 = g2.coreHp;
    run(g2, 20);
    expect(b2.attacking).toBeNull();
    expect(g2.coreHp).toBeLessThan(core0);
  });
  it('el pesado ataca la torreta más cercana', () => {
    const g = flatGame();
    const t = instant(g, 'turret_bullet', 3, 3);
    const hp = t.hp;
    const e = air(g, 'heavy', 4.2, 3.5);
    run(g, 4);
    expect(e.attacking).toBe(t.id);
    expect(t.hp).toBeLessThan(hp);
  });
});
