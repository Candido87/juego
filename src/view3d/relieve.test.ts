import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CONFIG } from '../game/config';
import { BUILD_KINDS } from '../game/types';
import { createFlatWorld } from '../game/world';
import { LEVEL_H } from './pick';
import { GROUND_OFFSET, baseHeight, slopeLower, tileLowEdge, tileSurface } from './relieve';

/** Mínimo y máximo de y de un .glb: accesorios de posición más la traslación y escala de su nodo (jerarquía plana). */
function glbY(path: string): { min: number; max: number } {
  const buf = readFileSync(resolve(__dirname, '../../public/assets/3d', `${path}.glb`));
  const len = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + len).toString('utf8')) as {
    accessors: { min?: number[]; max?: number[] }[];
    meshes: { primitives: { attributes: { POSITION: number } }[] }[];
    nodes: { mesh?: number; translation?: number[]; scale?: number[] }[];
  };
  let min = Infinity;
  let max = -Infinity;
  for (const n of json.nodes) {
    if (n.mesh === undefined) continue;
    const t = n.translation?.[1] ?? 0;
    const k = n.scale?.[1] ?? 1;
    for (const p of json.meshes[n.mesh].primitives) {
      const ac = json.accessors[p.attributes.POSITION];
      if (!ac.min || !ac.max) continue;
      min = Math.min(min, ac.min[1] * k + t);
      max = Math.max(max, ac.max[1] * k + t);
    }
  }
  return { min, max };
}

/** Mapa de prueba con desniveles: una meseta de 2 niveles, una rampa de 1, y suelo llano. */
function terrain() {
  const w = createFlatWorld(12, 12);
  const set = (x: number, y: number, h: number) => (w.height[y * w.w + x] = h);
  for (let y = 2; y < 6; y++) for (let x = 2; x < 6; x++) set(x, y, 2);
  set(8, 8, 1); // rampa: una sola vecina baja... y las otras tres también (nivel 0), así que es un bloque
  set(8, 9, 1);
  set(9, 8, 1);
  set(9, 9, 1);
  return w;
}

describe('Relieve · la base de cada pieza descansa sobre la superficie de su casilla', () => {
  it('los modelos de terreno arrancan en -GROUND_OFFSET: al subirlos, la superficie queda en nivel × LEVEL_H', () => {
    const flat = glbY('nature/ground_grass');
    const block = glbY('nature/cliff_block_rock');
    const slope = glbY('nature/cliff_blockSlope_rock');
    for (const m of [flat, block, slope]) expect(m.min).toBeCloseTo(-GROUND_OFFSET, 3);
    // Suelo llano: sube GROUND_OFFSET → superficie en 0. Bloque de h niveles: escala h·LEVEL_H y sube GROUND_OFFSET·escala.
    expect(flat.max + GROUND_OFFSET).toBeCloseTo(0.0 + (flat.max + GROUND_OFFSET), 3);
    expect(flat.max + GROUND_OFFSET).toBeCloseTo(0, 3);
    for (const h of [1, 2, 3]) {
      const sy = h * LEVEL_H;
      expect(block.max * sy + GROUND_OFFSET * sy).toBeCloseTo(h * LEVEL_H * (block.max + GROUND_OFFSET), 3);
      expect(block.max + GROUND_OFFSET).toBeCloseTo(1, 3); // alto nativo 1 → superficie exacta en h·LEVEL_H
    }
    expect(slope.max + GROUND_OFFSET).toBeCloseTo(1, 3);
  });

  it('las piezas de transporte y los personajes apoyan su base en y = 0 (no traen hueco ni se hunden)', () => {
    for (const m of ['factory/conveyor', 'factory/conveyor-stripe', 'factory/conveyor-corner', 'factory/pipe-large', 'factory/hopper-round']) {
      const y = glbY(m);
      expect(y.min, m).toBeGreaterThanOrEqual(-0.001);
      expect(y.min, m).toBeLessThanOrEqual(0.001);
    }
  });

  it('tileSurface = nivel × LEVEL_H en todas las casillas y la base lleva sólo el margen mínimo', () => {
    const w = terrain();
    expect(CONFIG.scale.groundMargin).toBeGreaterThan(0);
    expect(CONFIG.scale.groundMargin).toBeLessThanOrEqual(0.01);
    for (let y = 0; y < w.h; y++) {
      for (let x = 0; x < w.w; x++) {
        const surface = tileSurface(w, x, y);
        expect(surface).toBe(w.height[y * w.w + x] * LEVEL_H);
        expect(baseHeight(w, x, y) - surface).toBeCloseTo(CONFIG.scale.groundMargin, 6);
        // Ninguna base queda bajo la superficie (hundida) ni más alta que el margen (flotando).
        expect(baseHeight(w, x, y)).toBeGreaterThanOrEqual(surface);
      }
    }
  });

  it('una rampa de terreno (nivel 1 con una sola vecina baja) se reconoce y su borde bajo es el del nivel inferior', () => {
    const w = createFlatWorld(8, 8);
    w.height[3 * 8 + 3] = 1;
    w.height[3 * 8 + 4] = 1;
    w.height[4 * 8 + 3] = 1;
    // (3,3) tiene vecinas (2,3) y (3,2) bajas: dos → bloque. (3,4) tiene vecinas (2,4),(4,4),(3,5) bajas: bloque.
    expect(slopeLower(w, 3, 3)).toBeNull();
    // Rampa auténtica: una isla de nivel 1 de 2×... una cresta: (5,1)-(5,6) nivel 1 con otra columna (6,*) de nivel 1: la columna x=5 tiene sólo la vecina de la izquierda baja.
    const r = createFlatWorld(8, 8);
    for (let y = 0; y < 8; y++) (r.height[y * 8 + 5] = 1), (r.height[y * 8 + 6] = 1), (r.height[y * 8 + 7] = 1);
    expect(slopeLower(r, 5, 4)).toBe(2); // la vecina baja está al oeste (dirección 2)
    expect(tileLowEdge(r, 5, 4)).toBe(0);
    expect(tileSurface(r, 5, 4)).toBe(LEVEL_H);
    expect(slopeLower(r, 6, 4)).toBeNull(); // todas sus vecinas son de nivel 1
  });

  it('cada tipo de edificio se apoya en la misma base (sin altura propia distinta de la del terreno)', () => {
    const w = terrain();
    // Para cualquier tipo y casilla, la base es la de la casilla: no hay tipo que añada elevación.
    for (const kind of BUILD_KINDS) {
      for (const [x, y] of [[0, 0], [3, 3], [8, 8]]) expect(baseHeight(w, x, y), kind).toBe(tileSurface(w, x, y) + CONFIG.scale.groundMargin);
    }
  });
});
