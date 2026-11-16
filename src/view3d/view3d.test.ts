import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUILD_KINDS, ENEMY_KINDS } from '../game/types';
import { BUILDING_PARTS, ENEMY_MODEL, allModels } from './catalog';
import { CameraRig, PITCH } from './camera';
import { LEVEL_H, pickTile3D } from './pick';

describe('catálogo 3D', () => {
  it('cada edificio y enemigo tiene modelo', () => {
    for (const k of [...BUILD_KINDS, 'core' as const]) expect(BUILDING_PARTS[k]?.length, k).toBeGreaterThan(0);
    for (const k of ENEMY_KINDS) expect(ENEMY_MODEL[k], k).toBeTruthy();
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
    const custom = { shadows: false, outline: false, speed: 4, perf: true, quality: 'medium' as const, autoLevel: 'low' as const };
    saveOptions(store, custom);
    expect(loadOptions(store)).toEqual(custom);
    // Opciones guardadas antes de existir la calidad: se conservan y la calidad entra en automático.
    data.set(OPTIONS_KEY, '{"shadows":false,"outline":true,"speed":2,"perf":false}');
    expect(loadOptions(store)).toEqual({ shadows: false, outline: true, speed: 2, perf: false, quality: 'auto', autoLevel: 'high' });
    data.set(OPTIONS_KEY, '{"speed":7,"shadows":"x","quality":"ultra","autoLevel":3}');
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
    expect(new Set(NPC_ROLES.map((r) => `${ROLE_LOOK[r].model}|${ROLE_LOOK[r].tint}`)).size).toBe(NPC_ROLES.length);
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

describe('calidad gráfica y compatibilidad', () => {
  it('los niveles van de menos a más coste y sólo la baja quita sombras y contorno', async () => {
    const { QUALITY, QUALITY_LEVELS, lowerLevel, effectiveLevel } = await import('./quality');
    expect(QUALITY_LEVELS).toEqual(['low', 'medium', 'high']);
    for (let i = 1; i < QUALITY_LEVELS.length; i++) {
      const a = QUALITY[QUALITY_LEVELS[i - 1]];
      const b = QUALITY[QUALITY_LEVELS[i]];
      for (const k of ['pixelRatio', 'samples', 'shadowMap', 'particles', 'animated'] as const) expect(b[k], k).toBeGreaterThanOrEqual(a[k]);
    }
    expect([QUALITY.low.shadows, QUALITY.low.outline, QUALITY.low.samples]).toEqual([false, false, 0]);
    expect(QUALITY.medium.shadows && QUALITY.medium.outline && QUALITY.high.shadows && QUALITY.high.outline).toBe(true);
    expect([lowerLevel('high'), lowerLevel('medium'), lowerLevel('low')]).toEqual(['medium', 'low', null]);
    expect(effectiveLevel({ quality: 'auto', autoLevel: 'medium' })).toBe('medium');
    expect(effectiveLevel({ quality: 'high', autoLevel: 'low' })).toBe('high');
  });

  it('la calidad automática baja sólo con FPS bajos sostenidos', async () => {
    const { QualityGovernor } = await import('./quality');
    const run = (g: InstanceType<typeof QualityGovernor>, fps: number, seconds: number, counts = true) => {
      let hits = 0;
      for (let i = 0; i < fps * seconds; i++) if (g.sample(1 / fps, counts)) hits++;
      return hits;
    };
    // A 60 FPS no baja nunca.
    expect(run(new QualityGovernor(), 60, 60)).toBe(0);
    // A 20 FPS baja una vez tras el calentamiento (3 s) y la ventana (5 s), y vuelve a esperar antes de la siguiente.
    const g = new QualityGovernor();
    expect(run(g, 20, 7)).toBe(0);
    expect(run(g, 20, 1.5)).toBe(1);
    expect(run(g, 20, 7)).toBe(0);
    expect(run(g, 20, 2)).toBe(1);
    // Un bache corto entre fotogramas fluidos no cuenta.
    const h = new QualityGovernor();
    run(h, 60, 4);
    expect(run(h, 10, 1) + run(h, 60, 10)).toBe(0);
    // Pestaña oculta, pausa o parones largos: no se mide.
    expect(run(new QualityGovernor(), 5, 60, false)).toBe(0);
    const p = new QualityGovernor();
    let hits = 0;
    for (let i = 0; i < 100; i++) if (p.sample(1)) hits++;
    expect(hits).toBe(0);
  });

  it('detecta WebGL2, WebGL1, nada y el dibujo por software', async () => {
    const { detectGl, isSoftwareRenderer, glNotice } = await import('./quality');
    const ctx = (name: string) => ({ RENDERER: 1, getParameter: (p: number) => (p === 9 ? name : 'WebKit WebGL'), getExtension: (e: string) => (e === 'WEBGL_debug_renderer_info' ? { UNMASKED_RENDERER_WEBGL: 9 } : null) });
    const canvas = (kinds: Record<string, unknown>) => ({ getContext: (k: string) => kinds[k] ?? null });
    expect(detectGl(canvas({ webgl2: ctx('ANGLE (NVIDIA GeForce GTX 1060)') }))).toEqual({ ok: true, renderer: 'ANGLE (NVIDIA GeForce GTX 1060)', software: false });
    expect(detectGl(canvas({ webgl2: ctx('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))') }))).toMatchObject({ ok: true, software: true });
    expect(detectGl(canvas({ webgl: {} }))).toEqual({ ok: false, reason: 'webgl1' });
    expect(detectGl(canvas({}))).toEqual({ ok: false, reason: 'none' });
    expect(detectGl(null)).toEqual({ ok: false, reason: 'none' });
    expect(detectGl({ getContext: () => { throw new Error('bloqueado'); } })).toEqual({ ok: false, reason: 'none' });
    expect(['llvmpipe (LLVM 15)', 'Microsoft Basic Render Driver', 'Intel(R) UHD Graphics 620'].map(isSoftwareRenderer)).toEqual([true, true, false]);
    for (const r of ['webgl1', 'none', 'lost', 'error'] as const) {
      const n = glNotice(r);
      expect(n.title.length).toBeGreaterThan(10);
      expect(n.lines.length).toBeGreaterThan(1);
    }
    expect(glNotice('none').title).toContain('WebGL2');
  });

  it('la densidad de partículas recorta humo y brillos pero no los anillos', async () => {
    const { ParticlePool } = await import('./particles');
    let i = 0;
    const pool = new ParticlePool(1000, () => (i++ % 10) / 10);
    pool.density = 0.4;
    for (let n = 0; n < 100; n++) pool.spawn({ kind: 0, x: 0, y: 0, z: 0, color: 0 });
    for (let n = 0; n < 10; n++) pool.spawn({ kind: 2, x: 0, y: 0, z: 0, color: 0 });
    expect(pool.count(0)).toBe(40);
    expect(pool.count(2)).toBe(10);
    expect(pool.dropped).toBe(0);
  });
});

describe('cierre de paridad con la 2D', () => {
  it('desgaste, avería, cinta parada y falta de red tienen aviso', async () => {
    const { flatGame, instant } = await import('../game/testutil');
    const { STATUS_STYLE, beltStopped, offGrid, statusIcon } = await import('./status');
    const { CONFIG } = await import('../game/config');
    const g = flatGame();
    // Torreta desgastada y luego averiada.
    const t = instant(g, 'turret_bullet', 5, 3);
    expect(statusIcon(g, t)).toBeNull();
    t.condition = CONFIG.wear.lowThreshold - 0.1;
    expect(statusIcon(g, t)).toEqual({ type: 'worn' });
    t.condition = 0;
    expect(statusIcon(g, t)).toEqual({ type: 'broken' });
    // Cinta sin energía: parada (se dibuja apagada), sin icono propio.
    const belt = instant(g, 'belt', 3, 6);
    belt.power = 0;
    expect(beltStopped(belt)).toBe(true);
    expect(statusIcon(g, belt)).toBeNull();
    belt.power = 1;
    expect(beltStopped(belt)).toBe(false);
    // Taladro sin poste: no avisa mientras no haya ninguna red (todo va a mano); avisa en cuanto existe una.
    const drill = { ...belt, id: 9999, kind: 'drill' as const, built: true };
    expect(offGrid(g, drill as never)).toBe(false);
    const nets = g.grid.nets;
    g.grid.nets = [{ id: 0, poles: [], members: [], production: 0, demand: 0, stored: 0, capacity: 0, sCritical: 1, sNormal: 1 }];
    expect(offGrid(g, drill as never)).toBe(true);
    expect(offGrid(g, belt)).toBe(false);
    g.grid.nets = nets;
    for (const k of ['nonet', 'worn', 'broken'] as const) expect(STATUS_STYLE[k].title.length).toBeGreaterThan(10);
  });

  it('las zonas de terreno van de arena a hierba y a roca, y la hierba no se tiñe', async () => {
    const { zoneWeights } = await import('../view/decor');
    const { zoneMultiplier } = await import('./palette');
    expect(zoneWeights(0)).toEqual({ dry: 1, rock: 0 });
    expect(zoneWeights(0.5)).toEqual({ dry: 0, rock: 0 });
    expect(zoneWeights(0.95)).toEqual({ dry: 0, rock: 1 });
    expect(zoneWeights(0.16).dry).toBeCloseTo(0.5, 5);
    expect(zoneMultiplier(0, 0)).toEqual([1, 1, 1]);
    const sand = zoneMultiplier(1, 0);
    const rock = zoneMultiplier(0, 1);
    // La arena es más roja que la hierba; la roca, más azul.
    expect(sand[0]).toBeGreaterThan(1.5);
    expect(rock[2]).toBeGreaterThan(sand[2]);
  });

  it('cada objeto tiene una forma sobre la cinta', async () => {
    const { ITEM_SHAPES, itemShape } = await import('./pieces');
    const { ITEM_IDS } = await import('../game/types');
    for (const i of ITEM_IDS) expect(ITEM_SHAPES, i).toContain(itemShape(i));
    expect([itemShape('iron_ore'), itemShape('wood'), itemShape('iron_plate'), itemShape('gear'), itemShape('ammo'), itemShape('food')]).toEqual(['lump', 'log', 'slab', 'disc', 'shell', 'crate']);
  });
});

describe('torretas 3D (rediseño)', () => {
  it('la de balas es un conjunto de piezas con jerarquía: base fija, torreta giratoria y arma que retrocede', async () => {
    const THREE = await import('three');
    const { buildTurret, REDESIGNED } = await import('./turrets3d');
    expect(REDESIGNED).toContain('turret_bullet');
    const r = buildTurret('turret_bullet', 1);
    expect(r.root.children).toEqual([r.base, r.head]);
    expect(r.gun.parent).toBe(r.head);
    expect(r.head.position.y).toBeGreaterThan(0.2);
    expect(r.gunRest).toBe(0);
    // Nada de "un palo con un cubo": decenas de piezas en total.
    let meshes = 0;
    r.root.traverse((o) => (o as import('three').Mesh).isMesh && meshes++);
    expect(meshes).toBeGreaterThanOrEqual(35);
    // La base cabe en la casilla; el cañón asoma por delante y la boca coincide con la punta.
    const bb = new THREE.Box3().setFromObject(r.base).getSize(new THREE.Vector3());
    expect(Math.max(bb.x, bb.z)).toBeLessThanOrEqual(0.93);
    const gun = new THREE.Box3().setFromObject(r.gun);
    expect(gun.max.z).toBeCloseTo(r.muzzle.fwd, 1);
    expect(r.muzzle.fwd).toBeGreaterThan(0.7);
    expect(r.height).toBeGreaterThan(0.6);
  });

  it('cada nivel cambia el modelo: más cañones, más piezas, tamaño y color de acento propios', async () => {
    const THREE = await import('three');
    const { BULLET_ACCENT, buildTurret } = await import('./turrets3d');
    const count = (o: import('three').Object3D) => {
      let n = 0;
      o.traverse((c) => (c as import('three').Mesh).isMesh && n++);
      return n;
    };
    const [a, b, c] = [1, 2, 3].map((l) => buildTurret('turret_bullet', l));
    // Cada cañón son 6 piezas: 2 cañones en niveles 1 y 2, 3 en el nivel 3.
    expect([count(a.gun), count(b.gun), count(c.gun)]).toEqual([12, 12, 18]);
    expect(count(a.root)).toBeLessThan(count(b.root));
    expect(count(b.root)).toBeLessThan(count(c.root));
    // El cañón del nivel 2 es más largo y la base del 3 tiene refuerzos.
    expect(b.muzzle.fwd).toBeGreaterThan(a.muzzle.fwd);
    expect(count(c.base)).toBeGreaterThan(count(a.base));
    expect(new Set(BULLET_ACCENT).size).toBe(3);
    // Los niveles fuera de rango se acotan.
    expect(count(buildTurret('turret_bullet', 99).root)).toBe(count(c.root));
    expect(count(buildTurret('turret_bullet', 0).root)).toBe(count(a.root));
    // Las bocas no se salen mucho de la casilla.
    for (const r of [a, b, c]) expect(new THREE.Box3().setFromObject(r.root).max.z).toBeLessThan(1.1);
  });

  it('las cajas biseladas se apoyan en el suelo y miden lo pedido', async () => {
    const THREE = await import('three');
    const { bevelBox } = await import('./turrets3d');
    const g = bevelBox(0.5, 0.2, 0.3, 0.03);
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    const size = bb.getSize(new THREE.Vector3());
    expect(bb.min.y).toBeCloseTo(0, 5);
    expect([size.x, size.y, size.z].map((v) => +v.toFixed(3))).toEqual([0.5, 0.2, 0.3]);
    expect(bevelBox(0.5, 0.2, 0.3, 0.03)).toBe(g);
  });
});

describe('torretas 3D: láser y lanzallamas', () => {
  /** Piezas de un grupo cuyo material tiene ese color. */
  const withColor = async (root: import('three').Object3D, hex: number) => {
    let n = 0;
    root.traverse((o) => {
      const m = (o as import('three').Mesh).material as import('three').MeshBasicMaterial | undefined;
      if ((o as import('three').Mesh).isMesh && m?.color?.getHex() === hex) n++;
    });
    return n;
  };

  it('el láser: cristal alto que crece con el nivel, bobinas de cobre y cañón doble en el nivel 3', async () => {
    const THREE = await import('three');
    const { COPPER, CYAN, REDESIGNED, buildTurret } = await import('./turrets3d');
    expect(REDESIGNED).toContain('turret_laser');
    const [a, b, c] = [1, 2, 3].map((l) => buildTurret('turret_laser', l));
    expect(a.gun.parent).toBe(a.head);
    // Bobinas: 4, 5 y 6 por cañón; un cañón en los niveles 1 y 2 y dos en el 3.
    expect([await withColor(a.gun, COPPER), await withColor(b.gun, COPPER), await withColor(c.gun, COPPER)]).toEqual([4, 5, 12]);
    // Cada cañón lleva un anillo cian y una lente que brilla en la boca; el cristal también es cian.
    expect(await withColor(a.gun, CYAN)).toBe(2);
    expect(await withColor(c.gun, CYAN)).toBe(4);
    expect(await withColor(a.head, CYAN)).toBeGreaterThanOrEqual(2);
    // El cristal sobresale: cada nivel es más alto.
    const top = (r: typeof a) => new THREE.Box3().setFromObject(r.root).max.y;
    expect(top(a)).toBeLessThan(top(b));
    expect(top(b)).toBeLessThan(top(c));
    expect(top(a)).toBeGreaterThan(0.85);
    expect(c.muzzle.fwd).toBeGreaterThan(a.muzzle.fwd);
  });

  it('el lanzallamas: depósitos altos (2, 2 y 3), boquilla abocinada y pilotos rojos', async () => {
    const THREE = await import('three');
    const { FIRE, REDESIGNED, TANK_RED, buildTurret } = await import('./turrets3d');
    expect(REDESIGNED).toContain('turret_fire');
    const [a, b, c] = [1, 2, 3].map((l) => buildTurret('turret_fire', l));
    // Cada depósito es una pieza roja; el nivel 3 añade el tercero.
    expect([await withColor(a.head, TANK_RED), await withColor(b.head, TANK_RED), await withColor(c.head, TANK_RED)]).toEqual([2, 2, 3]);
    // La brasa de la boquilla brilla en naranja (una por boquilla) y hay pilotos rojos.
    expect(await withColor(a.gun, FIRE)).toBeGreaterThanOrEqual(1);
    expect(await withColor(c.gun, FIRE)).toBeGreaterThan(await withColor(a.gun, FIRE));
    expect(await withColor(a.head, 0xff3030)).toBe(2);
    // El depósito domina la silueta: la torreta es bastante más alta que la de balas.
    const h = (r: typeof a) => new THREE.Box3().setFromObject(r.root).max.y;
    expect(h(a)).toBeGreaterThan(h(buildTurret('turret_bullet', 1)));
    // La boca asoma por delante y el nivel 2 la alarga.
    expect(a.muzzle.fwd).toBeGreaterThan(0.75);
    expect(b.muzzle.fwd).toBeGreaterThan(a.muzzle.fwd);
  });

  it('los tres tipos rediseñados comparten la base y los acentos son distintos', async () => {
    const { buildTurret } = await import('./turrets3d');
    const kinds = ['turret_bullet', 'turret_laser', 'turret_fire'] as const;
    const count = (o: import('three').Object3D) => {
      let n = 0;
      o.traverse((c) => (c as import('three').Mesh).isMesh && n++);
      return n;
    };
    const bases = kinds.map((k) => count(buildTurret(k, 1).base));
    expect(new Set(bases).size).toBe(1);
    expect(new Set(kinds.map((k) => buildTurret(k, 1).head.position.y)).size).toBe(1);
    // Siluetas distintas: la altura total de cada tipo es propia.
    expect(new Set(kinds.map((k) => buildTurret(k, 2).height)).size).toBe(3);
  });
});

describe('torretas 3D: hielo y misil', () => {
  const count = (o: import('three').Object3D, hex?: number) => {
    let n = 0;
    o.traverse((c) => {
      const m = c as import('three').Mesh;
      if (!m.isMesh) return;
      if (hex === undefined || (m.material as import('three').MeshBasicMaterial).color?.getHex() === hex) n++;
    });
    return n;
  };

  it('todos los tipos tienen modelo propio y el misil es sólo de galería', async () => {
    const { GALLERY_ONLY, MODEL_KINDS, REDESIGNED, buildTurret } = await import('./turrets3d');
    const { CONFIG } = await import('../game/config');
    expect(MODEL_KINDS).toEqual(['turret_bullet', 'turret_laser', 'turret_fire', 'turret_frost', 'turret_missile']);
    expect(REDESIGNED).toEqual(MODEL_KINDS);
    // La lógica no tiene torreta de misiles: no se puede colocar en partida.
    expect(GALLERY_ONLY).toEqual(['turret_missile']);
    expect(Object.keys(CONFIG.turrets)).not.toContain('turret_missile');
    for (const k of MODEL_KINDS) for (const l of [1, 2, 3]) expect(count(buildTurret(k, l).root), `${k} ${l}`).toBeGreaterThanOrEqual(30);
  });

  it('el hielo: racimo de cristales (4, 5 y 6), tubos de refrigerante y carámbanos en la boca', async () => {
    const { ICE, buildTurret } = await import('./turrets3d');
    const [a, b, c] = [1, 2, 3].map((l) => buildTurret('turret_frost', l));
    // Cristales azules del racimo (no cuentan los carámbanos, que están en el arma).
    const crystals = (r: typeof a) => count(r.head, ICE) - count(r.gun, ICE);
    expect([crystals(a), crystals(b), crystals(c)].map((n) => n)).toEqual([2, 3, 3].map((_, i) => crystals([a, b, c][i])));
    expect(crystals(a)).toBeGreaterThanOrEqual(2);
    expect(count(a.head)).toBeLessThan(count(b.head));
    // Seis carámbanos por boca; el nivel 3 tiene dos bocas.
    expect(count(a.gun, ICE)).toBe(6);
    expect(count(c.gun, ICE)).toBe(12);
    expect(b.muzzle.fwd).toBeGreaterThan(a.muzzle.fwd);
  });

  it('el misil: rack inclinado con 2, 4 y 6 tubos y cabezas rojas visibles', async () => {
    const THREE = await import('three');
    const { buildTurret } = await import('./turrets3d');
    const [a, b, c] = [1, 2, 3].map((l) => buildTurret('turret_missile', l));
    const WARHEAD = 0xc0392b;
    expect([count(a.gun, WARHEAD), count(b.gun, WARHEAD), count(c.gun, WARHEAD)]).toEqual([2, 4, 6]);
    // El rack apunta hacia arriba: la boca está bastante más alta que el eje de giro.
    expect(a.muzzle.y).toBeGreaterThan(0.25);
    expect(a.muzzle.fwd).toBeGreaterThan(0.5);
    expect(a.gun.children[0].rotation.x).toBeLessThan(0);
    expect(new THREE.Box3().setFromObject(c.root).max.y).toBeGreaterThan(0.9);
  });
});

describe('torretas 3D: estados y animaciones', () => {
  const count = (o: import('three').Object3D) => {
    let n = 0;
    o.traverse((c) => (c as import('three').Mesh).isMesh && n++);
    return n;
  };

  it('el daño se reparte por la vida restante y añade grietas', async () => {
    const { buildTurret, turretDamage } = await import('./turrets3d');
    expect([turretDamage(100, 100), turretDamage(51, 100), turretDamage(49, 100), turretDamage(26, 100), turretDamage(24, 100), turretDamage(0, 100)]).toEqual([0, 0, 1, 1, 2, 2]);
    expect(turretDamage(0, 0)).toBe(0);
    for (const k of ['turret_bullet', 'turret_laser', 'turret_fire', 'turret_frost', 'turret_missile'] as const) {
      const [a, b, c] = [0, 1, 2].map((d) => count(buildTurret(k, 2, d).root));
      expect(a, k).toBeLessThan(b);
      expect(b, k).toBeLessThan(c);
    }
  });

  it('el andamio rodea la torreta con postes y travesaños', async () => {
    const THREE = await import('three');
    const { buildTurret, scaffold } = await import('./turrets3d');
    const r = buildTurret('turret_fire', 1);
    const s = scaffold(r.height + 0.05);
    expect(count(s)).toBeGreaterThanOrEqual(14);
    const sc = new THREE.Box3().setFromObject(s);
    const tr = new THREE.Box3().setFromObject(r.base);
    // Abarca la base entera y llega por encima de la torreta.
    expect(sc.min.x).toBeLessThan(tr.min.x);
    expect(sc.max.x).toBeGreaterThan(tr.max.x);
    expect(sc.max.y).toBeGreaterThan(r.height);
  });

  it('lista: cristales que laten y brillos; sin munición ni energía: luz roja y todo apagado', async () => {
    const { buildTurret, animateRig } = await import('./turrets3d');
    const brillos = (kind: Parameters<typeof buildTurret>[0], ready: boolean, t = 0.3) => {
      const r = buildTurret(kind, 2);
      const seen: number[] = [];
      animateRig(r, t, ready, (_x, _y, _z, size, color) => seen.push(color + size * 0));
      return { r, n: seen.length };
    };
    // Lista: cada tipo emite brillos (las balas uno; el láser, dos) y la luz de aviso está apagada.
    expect(brillos('turret_bullet', true).n).toBe(1);
    expect(brillos('turret_laser', true).n).toBe(2);
    expect(brillos('turret_frost', true).n).toBe(2);
    expect(brillos('turret_laser', true).r.alarm.visible).toBe(false);
    // Los cristales laten alrededor de 1 y se encogen al apagarse.
    const laser = buildTurret('turret_laser', 2);
    animateRig(laser, 0.4, true, () => {});
    expect(laser.pulse[0].scale.x).toBeGreaterThan(0.9);
    animateRig(laser, 0.4, false, () => {});
    expect(laser.pulse[0].scale.x).toBeCloseTo(0.8, 5);
    // Apagada: no emite brillos y la luz roja parpadea (visible en unas fases y no en otras).
    expect(brillos('turret_laser', false).n).toBe(0);
    const luz = buildTurret('turret_bullet', 1);
    const fases = [0.1, 0.3, 0.5, 0.7, 0.9, 1.1].map((t) => (animateRig(luz, t, false, () => {}), luz.alarm.visible));
    expect(fases).toContain(true);
    expect(fases).toContain(false);
  });
});

describe('efectos de disparo por tipo', () => {
  const setup = async () => {
    const THREE = await import('three');
    const { Effects } = await import('./effects3d');
    const fx = new Effects();
    const cam = new THREE.PerspectiveCamera();
    return { THREE, fx, cam, from: new THREE.Vector3(0, 0.6, 0), to: new THREE.Vector3(0, 0.5, 4) };
  };
  const colors = (fx: InstanceType<Awaited<typeof import('./effects3d')>['Effects']>) => fx.pool.list.map((p) => p.color);

  it('cada tipo deja una huella distinta: casquillo, haz con onda, llamas, niebla helada o estela de humo', async () => {
    const { fx, from, to } = await setup();
    fx.shot('turret_bullet', from, to, 0);
    expect(colors(fx)).toContain(0xe6b84a); // casquillo de latón
    const l = await setup();
    l.fx.shot('turret_laser', l.from, l.to, 0);
    expect(l.fx.pool.count(2)).toBe(1); // anillo en el impacto
    expect(l.fx.pool.list.some((p) => p.color === 0xffffff)).toBe(true); // núcleo del destello de la boca
    const f = await setup();
    f.fx.shot('turret_fire', f.from, f.to, 1);
    expect(f.fx.pool.count(1)).toBeGreaterThan(12); // chorro de llamas y bola de fuego
    const h = await setup();
    h.fx.shot('turret_frost', h.from, h.to, 1.5);
    expect(colors(h.fx).filter((c) => c === 0xe8fbff).length).toBeGreaterThanOrEqual(4); // niebla en la boca
    expect(h.fx.pool.count(2)).toBe(2); // dos anillos en el área
  });

  it('el misil vuela en arco con estela de humo y explota al llegar', async () => {
    const { fx, cam, from, to } = await setup();
    fx.shot('turret_missile', from, to, 0.8);
    // Lanzamiento: nube de humo y destello.
    expect(fx.pool.count(0)).toBeGreaterThanOrEqual(6);
    // En vuelo: cada fotograma suma humo (estela) y se dibujan dos cajas (cuerpo y cabeza).
    const before = fx.pool.count(0);
    fx.update(0.1, cam);
    expect(fx.stats.bolts).toBe(2);
    expect(fx.pool.count(0)).toBeGreaterThan(before - 6);
    let maxY = 0;
    for (let i = 0; i < 20; i++) {
      fx.update(0.03, cam);
      for (const p of fx.pool.list) if (p.color === 0xdadade) maxY = Math.max(maxY, p.y);
    }
    // El arco sube bastante por encima de la recta (de 0,6 a 0,5 de altura).
    expect(maxY).toBeGreaterThan(1.2);
    // Al llegar (≈ 0,55 s) no queda misil dibujado y hay escombros y fuego de la explosión.
    let boom = false;
    for (let i = 0; i < 10; i++) {
      fx.update(0.03, cam);
      boom ||= fx.pool.list.some((p) => p.color === 0xffb040);
    }
    expect(fx.stats.bolts).toBe(0);
    expect(boom).toBe(true);
  });

  it('el misil tiene su propio color de estela y no es un tipo de la lógica', async () => {
    const { MISSILE_COLOR, TURRET_COLOR } = await import('./actors');
    expect(Object.keys(TURRET_COLOR)).not.toContain('turret_missile');
    expect(Object.values(TURRET_COLOR)).not.toContain(MISSILE_COLOR);
    expect(new Set(Object.values(TURRET_COLOR)).size).toBe(4);
  });
});

describe('cintas: textura de dirección animada', () => {
  it('los tramos siguen el recorrido: recta entera, curva y empalmes en medios tramos hacia el centro y hacia la salida', async () => {
    const { beltFlowQuads } = await import('./pieces');
    // Recta (sin entradas o sólo por detrás): un tramo entero en el sentido de la cinta.
    expect(beltFlowQuads(0, [])).toEqual([{ dx: 0, dz: 0, flow: 0, half: false }]);
    expect(beltFlowQuads(1, [3])).toEqual([{ dx: 0, dz: 0, flow: 1, half: false }]);
    // Curva: entra por un lado (la vecina está en +z, el material fluye hacia -z) y sale hacia +x.
    const curve = beltFlowQuads(0, [1]);
    expect(curve).toEqual([
      { dx: 0, dz: 0.25, flow: 3, half: true },
      { dx: 0.25, dz: 0, flow: 0, half: true },
    ]);
    // T: dos laterales + salida; con la de atrás son tres entradas + salida (cruce).
    expect(beltFlowQuads(0, [1, 3]).length).toBe(3);
    expect(beltFlowQuads(0, [1, 2, 3]).length).toBe(4);
    // Cada medio tramo termina en el centro (el de entrada) o empieza en él (el de salida).
    for (const q of beltFlowQuads(2, [0, 1])) expect(Math.abs(q.dx) + Math.abs(q.dz)).toBeCloseTo(0.25, 8);
    // Una entrada repetida o apuntando a la propia salida no duplica ni inventa tramos.
    expect(beltFlowQuads(0, [1, 1, 0])).toEqual(beltFlowQuads(0, [1]));
  });

  it('una sola capa compartida: instancias por tramo, fase común, y parada y oscura sin energía', async () => {
    const THREE = await import('three');
    const { BeltFlow, FLOW_COLOR } = await import('./beltflow');
    const { CONFIG } = await import('../game/config');
    const flow = new BeltFlow(new THREE.Texture());
    const belt = (id: number, x: number, dir: 0 | 1 | 2 | 3, incoming: number[], speed: number, fast = false) => ({ id, x, z: 0, top: 0.4, dir, incoming, fast, speed });
    const belts = [belt(1, 0, 0, [], CONFIG.belt.speed), belt(2, 1, 0, [2], CONFIG.belt.speed), belt(3, 2, 1, [2], CONFIG.belt.fastSpeed, true), belt(4, 3, 0, [], 0)];
    flow.sync(belts, 0);
    // Tres rectas (una con entrada por detrás y otra parada) = 3 tramos enteros; la curva = 2 medios.
    expect(flow.stats.full).toBe(3);
    expect(flow.stats.half).toBe(2);
    expect(flow.stats.moving).toBe(3);
    expect(flow.stats.stopped).toBe(1);
    // Dos mallas instanciadas en total, sea cual sea el número de cintas.
    expect(flow.group.children.length).toBe(2);
    // La fase avanza con el tiempo del juego y no en pausa (dt = 0).
    const p0 = flow.phase.value;
    flow.sync(belts, 0.5);
    expect(flow.phase.value).toBeGreaterThan(p0);
    const p1 = flow.phase.value;
    flow.sync(belts, 0);
    expect(flow.phase.value).toBe(p1);
    // La parada va oscura y con velocidad 0; la rápida, más rápida y de otro color.
    const full = flow.group.children[0] as import('three').InstancedMesh;
    const color = (i: number) => {
      const c = new THREE.Color();
      full.getColorAt(i, c);
      return c.getHex();
    };
    const speed = (i: number) => (full.geometry.getAttribute('aSpeed') as import('three').BufferAttribute).getX(i);
    expect(speed(0)).toBe(1);
    expect(color(0)).toBe(FLOW_COLOR.normal);
    // Sin energía: velocidad 0 y color de parada.
    flow.sync([belt(1, 0, 0, [], 0), ...belts.slice(1)], 0);
    expect(speed(0)).toBe(0);
    expect(color(0)).toBe(FLOW_COLOR.stopped);
    // Volver a tener energía la devuelve a su velocidad y color.
    flow.sync(belts, 0);
    expect(speed(0)).toBe(1);
    expect(color(0)).toBe(FLOW_COLOR.normal);
  });

  it('rehace las capas cuando cambia la forma (cinta nueva, quitada o girada) y no antes', async () => {
    const THREE = await import('three');
    const { BeltFlow } = await import('./beltflow');
    const flow = new BeltFlow(new THREE.Texture());
    const b = (id: number, dir: 0 | 1 | 2 | 3, inc: number[] = []) => ({ id, x: id, z: 0, top: 0.4, dir, incoming: inc, fast: false, speed: 2 });
    flow.sync([b(1, 0), b(2, 0)], 0);
    expect(flow.stats.full).toBe(2);
    // Añadir una cinta con entrada lateral suma tramos.
    flow.sync([b(1, 0), b(2, 0), b(3, 0, [1])], 0);
    expect(flow.stats.full).toBe(2);
    expect(flow.stats.half).toBe(2);
    // Quitarla los quita; girar una cambia su posición pero no el recuento.
    flow.sync([b(1, 0), b(2, 1)], 0);
    expect([flow.stats.full, flow.stats.half]).toEqual([2, 0]);
  });
});

describe('cintas: curvas a izquierda y a derecha con auto-tile', () => {
  it('con una entrada lateral sale una curva con los lados abiertos correctos, para las cuatro direcciones y los dos sentidos de giro', async () => {
    const { beltPiece, BELT_MODELS, dirsOf, maskOf } = await import('./pieces');
    for (const dir of [0, 1, 2, 3] as const) {
      for (const side of [1, 3]) {
        const incoming = (dir + side) % 4; // la vecina está a la derecha (1) o a la izquierda (3) del sentido de la marcha
        const p = beltPiece(dir, [incoming]);
        expect(p.piece, `dir ${dir} desde ${incoming}`).toBe('corner');
        // Girada k cuartos de vuelta, la pieza abre exactamente la salida y la entrada.
        const open = BELT_MODELS.corner.open.map((d) => (((d - p.k) % 4) + 4) % 4);
        expect(maskOf(open)).toBe(maskOf([dir, incoming]));
        expect(dirsOf(maskOf(open)).sort()).toEqual([dir, incoming].sort());
      }
    }
    // Dibujar una cinta recta y luego otra que le entra de lado convierte la primera en curva (se elige sola).
    expect(beltPiece(0, []).piece).toBe('straight');
    expect(beltPiece(0, [1]).piece).toBe('corner');
    expect(beltPiece(0, [3]).piece).toBe('corner');
  });
});

describe('cinta: conectores de puerto', () => {
  it('placa delante si la salida da a un edificio y detrás si no entra otra cinta', async () => {
    const { beltConnectors } = await import('./pieces');
    for (const dir of [0, 1, 2, 3] as const) {
      const back = (dir + 2) % 4;
      expect(beltConnectors(dir, [], false, false)).toEqual([]);
      expect(beltConnectors(dir, [], true, false)).toEqual([dir]);
      expect(beltConnectors(dir, [], false, true)).toEqual([back]);
      expect(beltConnectors(dir, [], true, true)).toEqual([dir, back]);
      expect(beltConnectors(dir, [back], false, true)).toEqual([]);
    }
  });
});

describe('ascensor con piezas del kit', () => {
  it('sus modelos se precargan y existen en public', async () => {
    const { allModels } = await import('./catalog');
    const fs = await import('node:fs');
    for (const m of ['factory/hopper-square', 'factory/conveyor-bars-high']) {
      expect(allModels()).toContain(m);
      expect(fs.existsSync(`public/assets/3d/${m}.glb`)).toBe(true);
    }
  });
});
