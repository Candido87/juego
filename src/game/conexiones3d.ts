/**
 * Conexiones de tuberías con desnivel (lógica pura): amplía el motor de `conexiones.ts` con la altura.
 *
 * Regla de reparto del escalón (la misma que las cintas, `rampSlope`): cuando dos tuberías unidas están a niveles distintos, **la casilla baja
 * contiene el escalón** (sale horizontal, codo hacia arriba, tramo vertical de un nivel, otro codo y llega horizontal al borde a la altura de la
 * casilla alta). La casilla alta no se entera: su pieza llega al borde a su propia altura como si fuera un vecino a nivel.
 * Por eso cada lado conectado de una casilla es `LEVEL` (a nivel, o el vecino es más bajo) o `UP` (el vecino es un nivel más alto).
 *
 * Una única tabla (`PLAN3`, 81 patrones de 4 lados × {sin unión, a nivel, sube}) decide pieza y giro, también para los giros con desnivel
 * (codo horizontal + codo vertical) y los valles. Las T, cruces y válvulas sólo existen en llano: una T o un cruce con un lado que sube
 * es `invalid` y trae el motivo. Los puertos geométricos (`portsOf`) dicen dónde acaba la pieza en cada lado y a qué altura, y
 * `portsMatch` comprueba que los extremos de dos casillas contiguas coinciden en el mundo.
 */
import { CONFIG } from './config';
import { PIECE_TABLE, PieceId, dirsOf, maskOf, pipeConnections } from './conexiones';
import type { Building, Game } from './game';
import { DX, DY, Dir, opposite } from './types';
import { heightAt } from './world';

export const SIDE = { NONE: 0, LEVEL: 1, UP: 2 } as const;
export type SideKind = (typeof SIDE)[keyof typeof SIDE];
/** Un patrón de 4 lados (dirección 0..3), cada uno `SideKind`. */
export type Sides = readonly [SideKind, SideKind, SideKind, SideKind];

export type PieceId3 =
  | PieceId
  /** Sólo sube por un lado (extremo del trazado): codo, vertical y tapa. */
  | 'stepEnd'
  /** Entra a nivel por el lado opuesto y sube por el otro: codo, vertical, codo. */
  | 'stepStraight'
  /** Giro con escalón: entra a nivel por un lado adyacente (a la derecha o a la izquierda del que sube). */
  | 'stepCornerR'
  | 'stepCornerL'
  /** Valle: sube por dos lados opuestos o adyacentes (la casilla es más baja que dos vecinas unidas). */
  | 'valleyStraight'
  | 'valleyCorner'
  | 'invalid';

export interface Plan3 {
  piece: PieceId3;
  /** Cuartos de vuelta de la forma canónica (lado d canónico → (d + k) mod 4). */
  k: number;
  sides: Sides;
  /** Lados que suben / a nivel (ordenados). */
  up: Dir[];
  level: Dir[];
  valid: boolean;
  reason?: string;
}

const N = SIDE.NONE;
const L = SIDE.LEVEL;
const U = SIDE.UP;

/** Formas canónicas con escalón (giro 0). Los lados no citados no tienen unión. */
const CANON3: { piece: PieceId3; sides: Sides }[] = [
  { piece: 'stepEnd', sides: [U, N, N, N] },
  { piece: 'stepStraight', sides: [U, N, L, N] },
  { piece: 'stepCornerR', sides: [U, L, N, N] },
  { piece: 'stepCornerL', sides: [U, N, N, L] },
  { piece: 'valleyStraight', sides: [U, N, U, N] },
  { piece: 'valleyCorner', sides: [U, U, N, N] },
];

const rotSides = (s: Sides, k: number): Sides => [0, 1, 2, 3].map((d) => s[(((d - k) % 4) + 4) % 4]) as unknown as Sides;
const key = (s: Sides) => s.join('');

/** Tabla única de 81 patrones → pieza y giro. */
export const PLAN3: ReadonlyMap<string, Plan3> = (() => {
  const map = new Map<string, Plan3>();
  const all: SideKind[] = [N, L, U];
  for (const a of all) for (const b of all) for (const c of all) for (const d of all) {
    const sides: Sides = [a, b, c, d];
    const up = ([0, 1, 2, 3] as Dir[]).filter((i) => sides[i] === U);
    const level = ([0, 1, 2, 3] as Dir[]).filter((i) => sides[i] === L);
    let plan: Plan3 | null = null;
    if (!up.length) {
      // En llano: la tabla de conexiones planas.
      const mask = maskOf(level);
      const p = PIECE_TABLE[mask];
      plan = { piece: p.piece, k: p.k, sides, up, level, valid: true };
    } else {
      for (const c3 of CANON3) {
        for (let k = 0; k < 4 && !plan; k++) if (key(rotSides(c3.sides, k)) === key(sides)) plan = { piece: c3.piece, k, sides, up, level, valid: true };
        if (plan) break;
      }
      if (!plan) {
        const n = up.length + level.length;
        plan = {
          piece: 'invalid',
          k: 0,
          sides,
          up,
          level,
          valid: false,
          reason: n >= 3 ? 'Una T o un cruce no puede ir en un desnivel: sólo en tramos horizontales' : 'Esta combinación de uniones con desnivel no existe',
        };
      }
    }
    map.set(key(sides), plan);
  }
  return map;
})();

export const planFor3 = (sides: Sides): Plan3 => PLAN3.get(key(sides))!;

/**
 * Lados de la tubería `b` con la regla de la lógica de redes (`pipeConnections`) más la altura: a nivel si el vecino está a la misma altura o
 * más bajo (su casilla absorbe el escalón), "sube" si está un nivel más alto. Con más de un nivel de diferencia no hay unión (la lógica tampoco
 * deja pasar el líquido, `slopeOk`).
 */
export function pipeSides(g: Game, b: Building): Sides {
  const { mask } = pipeConnections(g, b);
  const h = heightAt(g.world, b.x, b.y);
  const sides: SideKind[] = [N, N, N, N];
  for (const d of dirsOf(mask)) {
    const dh = heightAt(g.world, b.x + DX[d], b.y + DY[d]) - h;
    if (dh === 0 || dh === -1) sides[d] = L;
    else if (dh === 1) sides[d] = U;
  }
  return sides as unknown as Sides;
}

export const pipePlan3 = (g: Game, b: Building): Plan3 => planFor3(pipeSides(g, b));

// ---------------------------------------------------------------- puertos geométricos

export interface PortGeom {
  side: Dir;
  /** Posición en la casilla (origen en el centro, y = altura sobre la base de la casilla) del centro del extremo y dirección hacia fuera. */
  x: number;
  y: number;
  z: number;
  dir: readonly [number, number, number];
}

/** Altura del eje del tubo sobre la base de la casilla (la misma de la vista: la brida apoya en el suelo). */
export const pipeAxisY = (): number => CONFIG.scale.pipeFlange / 2;

/** Dónde acaba una pieza en cada lado unido: en el centro del borde, a la altura del eje (+ un nivel si sube). Ejes: x → +x del juego, z → +y del juego. */
export function portsOf(plan: Plan3): PortGeom[] {
  const out: PortGeom[] = [];
  for (const d of [0, 1, 2, 3] as Dir[]) {
    const s = plan.sides[d];
    if (s === N) continue;
    out.push({ side: d, x: 0.5 * DX[d], y: pipeAxisY() + (s === U ? CONFIG.scale.levelH : 0), z: 0.5 * DY[d], dir: [DX[d], 0, DY[d]] });
  }
  return out;
}

/** Los dos extremos (casilla A en `a`, B contigua por el lado `d` de A) coinciden en el mundo (posición con tolerancia) y se miran. */
export function portsMatch(ax: number, ay: number, pa: PortGeom, bx: number, by: number, pb: PortGeom, heightA: number, heightB: number, tol = 0.001): boolean {
  const lh = CONFIG.scale.levelH;
  const wa = [ax + 0.5 + pa.x, heightA * lh + pa.y, ay + 0.5 + pa.z];
  const wb = [bx + 0.5 + pb.x, heightB * lh + pb.y, by + 0.5 + pb.z];
  const faces = pa.dir[0] === -pb.dir[0] && pa.dir[1] === -pb.dir[1] && pa.dir[2] === -pb.dir[2];
  return faces && Math.hypot(wa[0] - wb[0], wa[1] - wb[1], wa[2] - wb[2]) <= tol;
}

/** Casillas que hay que recalcular al colocar, girar o borrar una tubería en (x, y): ella y sus cuatro vecinas (incluidas las de otro nivel). */
export function affectedTiles(x: number, y: number): { x: number; y: number }[] {
  return [{ x, y }, ...([0, 1, 2, 3] as Dir[]).map((d) => ({ x: x + DX[d], y: y + DY[d] }))];
}

/** Lado por el que la casilla vecina `b` ve a `a` (para recorrer parejas). */
export const facing = (d: Dir): Dir => opposite(d);
