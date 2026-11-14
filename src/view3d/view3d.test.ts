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
