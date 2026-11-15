import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUILD_KINDS, ENEMY_KINDS } from '../game/types';
import { BUILDING_PARTS, ENEMY_MODEL, TURRET_GUN, allModels } from './catalog';
import { CameraRig, PITCH } from './camera';
import { LEVEL_H, pickTile3D } from './pick';

describe('catálogo 3D', () => {
  it('cada edificio y enemigo tiene modelo', () => {
    for (const k of [...BUILD_KINDS, 'core' as const]) expect(BUILDING_PARTS[k]?.length, k).toBeGreaterThan(0);
    for (const k of ENEMY_KINDS) expect(ENEMY_MODEL[k], k).toBeTruthy();
    for (const k of ['turret_bullet', 'turret_laser', 'turret_fire', 'turret_frost'] as const) expect(TURRET_GUN[k]).toBeTruthy();
  });
  it('todos los modelos existen en public/assets/3d con su paleta', () => {
    const missing = allModels().filter((m) => !existsSync(join('public', 'assets', '3d', `${m}.glb`)));
    expect(missing).toEqual([]);
    for (const pack of new Set(allModels().map((m) => m.split('/')[0]))) {
      expect(existsSync(join('public', 'assets', '3d', pack, 'Textures', 'colormap.png')) || pack === 'nature', pack).toBe(true);
    }
  });
});

describe('cámara isométrica', () => {
  it('gira en pasos de 90° y normaliza el cuarto', () => {
    const c = new CameraRig();
    c.rotate(1);
    c.rotate(1);
    expect(c.targetYaw - 45 * (Math.PI / 180)).toBeCloseTo(Math.PI, 6);
    c.rotate(-1);
    c.rotate(-1);
    c.rotate(-1);
    expect(c.quarter).toBe(3);
    for (let i = 0; i < 200; i++) c.update(0.05);
    expect(c.yaw).toBeCloseTo(c.targetYaw, 3);
  });
  it('el zoom se limita', () => {
    const c = new CameraRig();
    c.setZoom(100);
    expect(c.zoom).toBe(4);
    c.setZoom(0);
    expect(c.zoom).toBe(0.4);
  });
  it('arrastrar a la derecha mueve el objetivo a la izquierda de la pantalla', () => {
    const c = new CameraRig();
    c.drag(48, 0);
    const r = c.right();
    expect(c.x * r.x + c.z * r.z).toBeCloseTo(-1, 6);
    const d = new CameraRig();
    d.drag(0, 24 * Math.sin(PITCH) * 2);
    const f = d.forward();
    expect(d.x * f.x + d.z * f.z).toBeCloseTo(1, 6);
  });
  it('la cámara mira hacia el objetivo desde arriba', () => {
    const c = new CameraRig();
    c.x = 5;
    c.z = 7;
    const p = c.position(10);
    expect(p.y).toBeCloseTo(5, 6);
    expect(Math.hypot(p.x - 5, p.z - 7)).toBeCloseTo(10 * Math.cos(PITCH), 6);
  });
});

describe('selección con relieve', () => {
  const world = { w: 6, h: 6, levelAt: (x: number, y: number) => (x === 3 && y === 3 ? 2 : 0) };
  const dir = { x: -0.5, y: -0.5, z: -0.5 };
  const shoot = (tx: number, ty: number, h: number) => {
    // rayo isométrico que pasa por el centro de la casilla a altura h
    const target = { x: tx + 0.5, y: h, z: ty + 0.5 };
    const t = 30;
    return pickTile3D({ x: target.x - dir.x * t, y: target.y - dir.y * t, z: target.z - dir.z * t }, dir, world);
  };
  it('acierta en suelo plano', () => {
    expect(shoot(1, 2, 0)).toEqual({ x: 1, y: 2 });
  });
  it('una casilla alta tapa a la que tiene detrás', () => {
    // el rayo que apunta al suelo de (2,2) pasa por la columna alta (3,3) delante de él
    const hit = shoot(2, 2, 0);
    expect(hit).toEqual({ x: 3, y: 3 });
    expect(shoot(3, 3, 2 * LEVEL_H)).toEqual({ x: 3, y: 3 });
  });
  it('fuera del mapa devuelve null', () => {
    expect(pickTile3D({ x: 50, y: 10, z: 50 }, dir, world)).toBeNull();
  });
});

describe('rampas', () => {
  it('cada giro apunta la bajada del modelo (-z) hacia su dirección', async () => {
    const { SLOPE_YAW } = await import('./terrain');
    const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    SLOPE_YAW.forEach((yaw, d) => {
      // rotación Y de Three: (x, z) → (x·cos + z·sin, -x·sin + z·cos), aplicada a la bajada (0, -1)
      const x = -Math.sin(yaw);
      const z = -Math.cos(yaw);
      expect(x).toBeCloseTo(dirs[d][0], 6);
      expect(z).toBeCloseTo(dirs[d][1], 6);
    });
  });
});

describe('escenario de medición', () => {
  it('coloca los edificios y enemigos pedidos y es determinista', async () => {
    const { setupBench, wiggle } = await import('./bench');
    const { Game } = await import('../game/game');
    const { generateWorld } = await import('../game/world');
    const mk = () => {
      const g = new Game({ world: generateWorld(5, 60, 60), noWaves: true });
      const r = setupBench(g, { objects: 300, enemies: 50, seed: 2 });
      return { g, r };
    };
    const a = mk();
    const b = mk();
    expect(a.r.placed).toBeGreaterThan(250);
    expect(a.r.placed).toBe(b.r.placed);
    expect(a.g.enemies.length).toBe(50);
    const x0 = a.g.enemies[0].x;
    wiggle(a.g, 1);
    expect(a.g.enemies[0].x).not.toBe(x0);
  });
});

describe('zoom hacia el cursor', () => {
  it('el punto del suelo bajo el cursor no se mueve', () => {
    const c = new CameraRig();
    c.x = 10;
    c.z = 20;
    const sx = 120;
    const sy = -80;
    // punto del suelo bajo el cursor: objetivo + derecha·sx/s − adelante·sy/(s·sen)
    const ground = () => {
      const s = c.ppu * c.zoom;
      const r = c.right();
      const f = c.forward();
      return { x: c.x + (r.x * sx) / s + (f.x * -sy) / (s * Math.sin(PITCH)), z: c.z + (r.z * sx) / s + (f.z * -sy) / (s * Math.sin(PITCH)) };
    };
    const before = ground();
    c.zoomAt(1.5, sx, sy);
    const after = ground();
    expect(c.zoom).toBeCloseTo(1.5, 6);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.z).toBeCloseTo(before.z, 6);
  });
});

describe('opciones de la vista 3D', () => {
  it('carga por defecto, guarda y descarta valores inválidos', async () => {
    const { DEFAULT_OPTIONS, OPTIONS_KEY, loadOptions, saveOptions } = await import('./options');
    const data = new Map<string, string>();
    const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    expect(loadOptions(store)).toEqual(DEFAULT_OPTIONS);
    expect(loadOptions(null)).toEqual(DEFAULT_OPTIONS);
    saveOptions(store, { shadows: false, outline: false, speed: 4, perf: true });
    expect(loadOptions(store)).toEqual({ shadows: false, outline: false, speed: 4, perf: true });
    data.set(OPTIONS_KEY, '{"speed":7,"shadows":"x"}');
    expect(loadOptions(store)).toEqual(DEFAULT_OPTIONS);
    data.set(OPTIONS_KEY, 'no es json');
    expect(loadOptions(store)).toEqual(DEFAULT_OPTIONS);
  });
});

describe('interfaz sin Phaser', () => {
  it('los módulos de interfaz que usa la vista 3D no importan Phaser ni la escena 2D', async () => {
    const { readFileSync } = await import('node:fs');
    const seen = new Set<string>();
    const bad: string[] = [];
    const visit = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/from '([^']+)'/g)) {
        const spec = m[1];
        if (spec === 'phaser') bad.push(`${file} → phaser`);
        if (!spec.startsWith('.')) continue;
        const base = join(file, '..', spec);
        const next = existsSync(`${base}.ts`) ? `${base}.ts` : existsSync(join(base, 'index.ts')) ? join(base, 'index.ts') : null;
        if (next) visit(next);
      }
    };
    visit(join('src', 'view3d', 'main3d.ts'));
    expect(bad).toEqual([]);
    expect([...seen].some((f) => f.endsWith('GameScene.ts') || f.endsWith('shapes.ts'))).toBe(false);
    expect([...seen].some((f) => f.endsWith(join('view', 'ui.ts')))).toBe(true);
  });
});

describe('elegir un edificio por su cuerpo', () => {
  it('devuelve la caja más cercana que corta el rayo', async () => {
    const { pickBox } = await import('./pick');
    const boxes = [
      { id: 1, minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 2, maxZ: 1 },
      { id: 2, minX: 3, minY: 0, minZ: 0, maxX: 4, maxY: 2, maxZ: 1 },
    ];
    expect(pickBox({ x: 10, y: 1, z: 0.5 }, { x: -1, y: 0, z: 0 }, boxes)).toBe(2);
    expect(pickBox({ x: -10, y: 1, z: 0.5 }, { x: 1, y: 0, z: 0 }, boxes)).toBe(1);
    expect(pickBox({ x: 10, y: 5, z: 0.5 }, { x: -1, y: 0, z: 0 }, boxes)).toBeNull();
    expect(pickBox({ x: 10, y: 1, z: 0.5 }, { x: 1, y: 0, z: 0 }, boxes)).toBeNull();
  });
});

describe('paleta', () => {
  it('la hierba y las hojas son verdes, y el agua azul', async () => {
    const { NATURE_PALETTE, GROUND_TINT, rgb } = await import('./palette');
    for (const k of ['grass', 'leafsGreen', 'leafsDark']) {
      const [r, g, b] = rgb(NATURE_PALETTE[k]);
      expect(g, k).toBeGreaterThan(r);
      expect(g, k).toBeGreaterThan(b * 1.3);
    }
    const [wr, , wb] = rgb(NATURE_PALETTE.water);
    expect(wb).toBeGreaterThan(wr);
    // los tintes de suelo sólo oscurecen o matizan: ninguno pasa de 255 ni deja la hierba sin verde
    for (const tint of Object.values(GROUND_TINT)) expect(rgb(tint)[1]).toBeGreaterThan(120);
  });
});

describe('piezas por conexiones', () => {
  it('orient encuentra el giro que hace coincidir los lados abiertos', async () => {
    const { orient } = await import('./pieces');
    expect(orient([0, 2], [0, 2])).toBe(0);
    expect(orient([0, 2], [1, 3])).not.toBeNull();
    expect(orient([1, 2], [0, 1])).not.toBeNull();
    expect(orient([0, 2], [0, 1])).toBeNull();
    // un giro k lleva la dirección d del modelo a d − k
    for (let k = 0; k < 4; k++) expect(orient([1, 2], [1 - k, 2 - k])).toBe(k);
  });
  it('cinta: recta, curva, T y cruce según las entradas', async () => {
    const { beltPiece, BELT_MODELS, maskOf } = await import('./pieces');
    const open = (p: { piece: keyof typeof BELT_MODELS; k: number }) => maskOf(BELT_MODELS[p.piece].open.map((d) => d - p.k));
    for (const dir of [0, 1, 2, 3] as const) {
      const back = (dir + 2) % 4;
      const left = (dir + 3) % 4;
      const right = (dir + 1) % 4;
      expect(beltPiece(dir, []).piece).toBe('straight');
      expect(beltPiece(dir, [back]).piece).toBe('straight');
      expect(beltPiece(dir, [left]).piece).toBe('corner');
      expect(beltPiece(dir, [back, right]).piece).toBe('tee');
      expect(beltPiece(dir, [left, right]).piece).toBe('tee');
      expect(beltPiece(dir, [back, left, right]).piece).toBe('cross');
      // los lados abiertos de la pieza girada son exactamente la salida más las entradas
      expect(open(beltPiece(dir, [left]))).toBe(maskOf([dir, left]));
      expect(open(beltPiece(dir, [back, right]))).toBe(maskOf([dir, back, right]));
      expect(open(beltPiece(dir, [left, right]))).toBe(maskOf([dir, left, right]));
      expect(open(beltPiece(dir, []))).toBe(maskOf([dir, back]));
    }
  });
  it('tuberías y muros: tramo recto o brazos con pieza central', async () => {
    const { armsFor, maskOf } = await import('./pieces');
    expect(armsFor(0, 1)).toEqual({ arms: [], hub: false, straightAxis: 1 });
    expect(armsFor(maskOf([1]))).toEqual({ arms: [], hub: false, straightAxis: 1 });
    expect(armsFor(maskOf([0, 2]))).toEqual({ arms: [], hub: false, straightAxis: 0 });
    expect(armsFor(maskOf([0, 1]))).toEqual({ arms: [0, 1], hub: true, straightAxis: null });
    expect(armsFor(maskOf([0, 1, 2])).arms.length).toBe(3);
    expect(armsFor(maskOf([0, 1, 2, 3])).arms.length).toBe(4);
    // muros: suelto = sólo poste; extremo = un brazo y poste
    expect(armsFor(0, 0, true)).toEqual({ arms: [], hub: true, straightAxis: null });
    expect(armsFor(maskOf([3]), 0, true)).toEqual({ arms: [3], hub: true, straightAxis: null });
    expect(armsFor(maskOf([1, 3]), 0, true).straightAxis).toBe(1);
  });
});

describe('iconos de estado', () => {
  it('fábrica sin receta, torreta sin munición, generador parado y marcado para desmontar', async () => {
    const { flatGame, instant } = await import('../game/testutil');
    const { statusIcon, statusKey } = await import('./status');
    const g = flatGame();
    const f = instant(g, 'factory', 3, 3);
    expect(statusIcon(g, f)).toEqual({ type: 'norecipe' });
    g.setRecipe(f.id, 'iron_plate');
    expect(statusIcon(g, f)?.type).toBe('missing');
    const t = instant(g, 'turret_bullet', 5, 3);
    expect(statusIcon(g, t)).toBeNull();
    t.inv = {};
    t.shots = 0;
    expect(statusIcon(g, t)).toEqual({ type: 'noammo' });
    const gen = instant(g, 'generator', 7, 3);
    expect(statusIcon(g, gen)).toEqual({ type: 'nofuel' });
    gen.running = true;
    expect(statusIcon(g, gen)).toBeNull();
    f.markedForRemoval = true;
    expect(statusKey(statusIcon(g, f))).toBe('remove');
    g.unlockedBuildings.add('house');
    const site = g.place('house', 9, 3)!;
    expect(statusIcon(g, site)).toBeNull();
    expect(statusKey(null)).toBe('');
  });
});

describe('partículas', () => {
  it('nacen, se mueven, caen con la gravedad y mueren al acabar su vida', async () => {
    const { ParticlePool, particleSize } = await import('./particles');
    const pool = new ParticlePool(3);
    expect(pool.spawn({ kind: 0, x: 0, y: 1, z: 0, color: 1, vx: 2, max: 1, s0: 0.2, s1: 0.6 })).toBe(true);
    expect(pool.spawn({ kind: 1, x: 0, y: 1, z: 0, color: 2, gravity: -10, max: 0.5 })).toBe(true);
    expect(pool.spawn({ kind: 2, x: 0, y: 0, z: 0, color: 3, max: 2 })).toBe(true);
    // lleno: la cuarta no entra y se cuenta
    expect(pool.spawn({ kind: 0, x: 0, y: 0, z: 0, color: 4 })).toBe(false);
    expect(pool.dropped).toBe(1);
    pool.step(0.25);
    const [a, b] = pool.list;
    expect(a.x).toBeCloseTo(0.5);
    expect(b.y).toBeLessThan(1);
    // crece de s0 a s1 mientras no entra en el último 30 %
    expect(particleSize(a)).toBeCloseTo(0.3);
    pool.step(0.3);
    expect(pool.list.length).toBe(2);
    expect(pool.count(1)).toBe(0);
    pool.step(0.4);
    // al final se encoge hasta desaparecer
    expect(particleSize(pool.list[0])).toBeLessThan(0.2);
    pool.step(5);
    expect(pool.list.length).toBe(0);
  });
  it('el emisor por ritmo reparte las partículas sin perder fracciones', async () => {
    const { Rate } = await import('./particles');
    const r = new Rate();
    let n = 0;
    for (let i = 0; i < 60; i++) n += r.take(3, 1 / 60);
    expect(n).toBeGreaterThanOrEqual(2);
    expect(n).toBeLessThanOrEqual(3);
  });
});

describe('personajes, torretas y humo', () => {
  it('NPC: anda, espera o trabaja; enseña lo que más lleva', async () => {
    const { npcAnim, carried, STILL_TIME, ROLE_LOOK } = await import('./actors');
    const { NPC_ROLES } = await import('../game/types');
    expect(npcAnim({ jobId: 3 }, true, 0)).toBe('walk');
    expect(npcAnim({ jobId: 3 }, false, 0)).toBe('idle');
    expect(npcAnim({ jobId: 3 }, false, STILL_TIME)).toBe('work');
    expect(npcAnim({ jobId: null }, false, 9)).toBe('idle');
    expect(carried({ carry: {} })).toBeNull();
    expect(carried({ carry: { coal: 2, iron_plate: 5 } })).toBe('iron_plate');
    // cada rol tiene su modelo
    expect(new Set(NPC_ROLES.map((r) => ROLE_LOOK[r].model)).size).toBe(NPC_ROLES.length);
  });
  it('enemigo: ataca si lleva un rato parado, y el frío lo frena', async () => {
    const { enemyLook, STILL_TIME } = await import('./actors');
    const e = { kind: 'grunt' as const, slowTimer: 0, slowFactor: 1, burnTimer: 0 };
    expect(enemyLook(e, true, 0)).toEqual({ anim: 'walk', slowed: false, burning: false, pace: 1 });
    expect(enemyLook(e, false, STILL_TIME / 2).anim).toBe('walk');
    expect(enemyLook(e, false, STILL_TIME).anim).toBe('attack');
    const cold = enemyLook({ ...e, slowTimer: 1, slowFactor: 0.45, burnTimer: 2 }, true, 0);
    expect(cold.slowed).toBe(true);
    expect(cold.burning).toBe(true);
    expect(cold.pace).toBeCloseTo(0.45);
    expect(enemyLook({ ...e, kind: 'runner' }, true, 0).pace).toBeGreaterThan(1);
  });
  it('torreta: el nivel añade anillos y agranda el cañón; estados sin munición y sin energía', async () => {
    const { flatGame, instant } = await import('../game/testutil');
    const { turretLook, turretState } = await import('./actors');
    const { statusIcon } = await import('./status');
    const g = flatGame();
    expect(turretLook(g, 'turret_bullet')).toEqual({ level: 1, rings: 0, gunScale: 1 });
    g.turretLevel.turret_bullet = 3;
    const l3 = turretLook(g, 'turret_bullet');
    expect(l3.rings).toBe(2);
    expect(l3.gunScale).toBeGreaterThan(1.2);
    g.turretLevel.turret_bullet = 99;
    expect(turretLook(g, 'turret_bullet').level).toBe(3);
    const t = instant(g, 'turret_bullet', 5, 3);
    expect(turretState(g, t)).toBe('ready');
    t.inv = {};
    t.shots = 0;
    expect(turretState(g, t)).toBe('noammo');
    const laser = instant(g, 'turret_laser', 7, 3);
    expect(turretState(g, laser)).toBe(g.turretPower(laser) > 0 ? 'ready' : 'nopower');
    if (g.turretPower(laser) <= 0) expect(statusIcon(g, laser)).toEqual({ type: 'nopower' });
  });
  it('humo: chimenea si produce, humo negro si está dañado, chispas si está muy dañado; los muros no humean', async () => {
    const { flatGame, instant } = await import('../game/testutil');
    const { smokeSources } = await import('./actors');
    const g = flatGame();
    const f = instant(g, 'factory', 3, 3);
    expect(smokeSources(f)).toEqual([]);
    f.recipe = 'iron_plate';
    f.craft = 0.5;
    expect(smokeSources(f).length).toBe(1);
    expect(smokeSources(f)[0].fromTop).toBe(true);
    f.hp = f.maxHp * 0.4;
    expect(smokeSources(f).length).toBe(2);
    expect(smokeSources(f)[1].sparks).toBe(false);
    f.hp = f.maxHp * 0.1;
    expect(smokeSources(f)[1].sparks).toBe(true);
    const gen = instant(g, 'generator', 6, 3);
    expect(smokeSources(gen)).toEqual([]);
    gen.running = true;
    expect(smokeSources(gen).length).toBe(1);
    const wall = instant(g, 'wall_stone', 8, 3);
    wall.hp = 1;
    expect(smokeSources(wall)).toEqual([]);
    expect(smokeSources(g.core).length).toBe(1);
    g.unlockedBuildings.add('house');
    const site = g.place('house', 10, 3)!;
    site.hp = 1;
    expect(smokeSources(site)).toEqual([]);
  });
});
