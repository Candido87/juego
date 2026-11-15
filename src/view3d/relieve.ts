/**
 * Relieve del terreno (matemática pura, sin Three ni DOM): a qué altura queda la superficie de cada casilla y cuáles son rampas.
 * Lo comparten el terreno (para colocar sus bloques) y la escena (para apoyar edificios, cintas y personajes), de modo que la
 * base de cada pieza descansa exactamente sobre la superficie de su casilla.
 *
 * Los modelos de terreno del Nature Kit no tienen la superficie en y=0: el suelo plano está en y=-0,05 y los bloques van de
 * -0,05 a 0,95 (la rampa igual). `GROUND_OFFSET` es ese desplazamiento: el terreno se sube lo que haga falta para que la
 * superficie quede exactamente en `nivel × LEVEL_H`.
 */
import { CONFIG } from '../game/config';
import { DX, DY } from '../game/types';
import { heightAt, inBounds } from '../game/world';
import type { World } from '../game/world';
import { LEVEL_H } from './pick';

/** Altura (en la escala del modelo) de la que arrancan los modelos de terreno: la base está en -GROUND_OFFSET. */
export const GROUND_OFFSET = 0.05;

/** Si la casilla es una rampa de terreno (nivel 1 con una sola vecina más baja y las demás iguales o más altas): dirección de la vecina baja. */
export function slopeLower(world: World, x: number, y: number): number | null {
  const h = heightAt(world, x, y);
  if (h !== 1) return null;
  let lower = -1;
  let count = 0;
  for (let d = 0; d < 4; d++) {
    const nx = x + DX[d];
    const ny = y + DY[d];
    if (!inBounds(world, nx, ny)) continue;
    const nh = heightAt(world, nx, ny);
    if (nh === h - 1) {
      lower = d;
      count++;
    } else if (nh < h) return null;
  }
  return count === 1 ? lower : null;
}

/** Altura de la superficie donde se apoya lo que se construye en la casilla: su nivel × LEVEL_H (en una rampa, el borde alto). */
export const tileSurface = (world: World, x: number, y: number): number => heightAt(world, x, y) * LEVEL_H;

/** Altura del borde bajo de una rampa (la del nivel de la vecina baja); para las demás casillas, su superficie. */
export const tileLowEdge = (world: World, x: number, y: number): number => (slopeLower(world, x, y) === null ? tileSurface(world, x, y) : 0);

/** Altura a la que se apoya la base de un edificio colocado en (x,y): la superficie más el margen anti parpadeo. */
export const baseHeight = (world: World, x: number, y: number): number => tileSurface(world, x, y) + CONFIG.scale.groundMargin;
