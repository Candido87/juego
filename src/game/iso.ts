/**
 * Matemática isométrica 2:1 pura (sin dependencias de Phaser).
 * Casilla = rombo de TILE_W x TILE_H píxeles. Cada nivel de altura sube Z_STEP píxeles.
 * El origen de pantalla (0,0) es la esquina superior del rombo de la casilla (0,0) a altura 0.
 */
export const TILE_W = 64;
export const TILE_H = 32;
export const HALF_W = TILE_W / 2;
export const HALF_H = TILE_H / 2;
export const Z_STEP = 16;
export const DEPTH_PER_DIAGONAL = 10;

export interface Vec2 {
  x: number;
  y: number;
}
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function gridToScreen(gx: number, gy: number, gz = 0): Vec2 {
  return { x: (gx - gy) * HALF_W, y: (gx + gy) * HALF_H - gz * Z_STEP };
}

/** Inversa exacta de gridToScreen para una altura gz dada. */
export function screenToGrid(sx: number, sy: number, gz = 0): Vec2 {
  const a = sx / HALF_W; // gx - gy
  const b = (sy + gz * Z_STEP) / HALF_H; // gx + gy
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

/** Casilla entera bajo un punto de pantalla, suponiendo altura gz. */
export function screenToTile(sx: number, sy: number, gz = 0): Vec2 {
  const g = screenToGrid(sx, sy, gz);
  return { x: Math.floor(g.x), y: Math.floor(g.y) };
}

/**
 * Selección de casilla teniendo en cuenta el relieve: cada casilla es una columna
 * desde 0 hasta su altura. Se muestrea el rayo de visión a varias alturas y gana la
 * columna más adelantada (la que se dibuja encima).
 */
export function pickTile(
  sx: number,
  sy: number,
  cols: number,
  rows: number,
  heightAt: (x: number, y: number) => number,
  maxZ = 2,
): Vec2 | null {
  let best: Vec2 | null = null;
  let bestKey = -Infinity;
  for (let t = 0; t <= maxZ + 1e-9; t += 0.125) {
    const { x, y } = screenToTile(sx, sy, t);
    if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
    const h = heightAt(x, y);
    if (h + 1e-9 < t) continue;
    const key = (x + y) * 16 + h;
    if (key > bestKey) {
      bestKey = key;
      best = { x, y };
    }
  }
  return best;
}

/** Profundidad de dibujado: mayor x+y = más cerca de la cámara. layer desempata dentro de la diagonal. */
export function depthOf(gx: number, gy: number, layer = 0): number {
  return (gx + gy) * DEPTH_PER_DIAGONAL + layer;
}

export function rectContains(r: Rect, p: Vec2): boolean {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}

/** ¿Tapa el objeto (rect, depth) al punto objetivo? Sólo si está delante y lo cubre en pantalla. */
export function occludes(rect: Rect, depth: number, target: Vec2, targetDepth: number): boolean {
  return targetDepth < depth && rectContains(rect, target);
}
