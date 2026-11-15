/**
 * Mapa de sprites del pack "Tiny Factory" de Kenney (CC0, www.kenney.nl).
 * Hoja de 12 x 11 casillas de 16 px; índice = fila * 12 + columna.
 *
 * Sólo se usa para iconos de la interfaz: roles (ROLE_ICONS), trabajos (JOB_ICONS) y, como respaldo si no hay
 * miniaturas de los modelos 3D, edificios (TOOL_ICONS y GENERATED_ICONS). Módulo puro, con test.
 */
import type { BuildKind, JobType, NpcRole } from '../game/types';

export const TILESHEET = {
  key: 'tiny-factory',
  url: 'assets/kenney/tiny-factory.png',
  tile: 16,
  cols: 12,
  rows: 11,
};
export const TILE_COUNT = TILESHEET.cols * TILESHEET.rows;

export const TOOL_ICONS: Partial<Record<BuildKind, number>> = {
  drill: 92,
  belt: 5,
  belt_fast: 53,
  storage: 73,
  factory: 87,
  pole: 93,
  generator: 75,
  solar: 111,
  turbine: 94,
  accumulator: 86,
  feeder: 128,
  wall_wood: 124,
  wall_stone: 72,
  wall_metal: 117,
  wall_gate: 124,
};

/**
 * Iconos generados por código (cuadrícula de 16x16) para lo que el pack no trae: [x, y, ancho, alto, color].
 * Mantienen el estilo pixel art del resto de iconos.
 */
export type IconRect = [number, number, number, number, string];
const OUT = '#1a1d24';
const turretIcon = (head: string, barrel: string): IconRect[] => [
  [2, 9, 12, 5, OUT],
  [3, 10, 10, 3, '#6b7482'],
  [5, 5, 6, 6, OUT],
  [6, 6, 4, 4, head],
  [7, 1, 2, 6, OUT],
  [7, 2, 2, 5, barrel],
];
export const GENERATED_ICONS: Partial<Record<BuildKind, IconRect[]>> = {
  turret_bullet: turretIcon('#f2c14e', '#d8dde6'),
  turret_laser: turretIcon('#d94fd9', '#ffb3ff'),
  turret_fire: turretIcon('#e8572a', '#ffb347'),
  turret_frost: turretIcon('#7fd8ff', '#e6f9ff'),
  pipeline: [
    [1, 6, 14, 5, OUT], [2, 7, 12, 3, '#9aa4ae'],
    [10, 4, 3, 9, OUT], [11, 5, 1, 7, '#9aa4ae'], [2, 8, 7, 1, '#e8eef4'],
  ],
  farm: [
    [1, 3, 14, 12, OUT], [2, 4, 12, 10, '#7a5530'],
    [3, 6, 10, 2, '#8fc43f'], [3, 9, 10, 2, '#8fc43f'], [3, 12, 10, 1, '#8fc43f'],
  ],
  pump: [
    [2, 12, 12, 3, OUT], [3, 12, 10, 2, '#55505a'],
    [7, 4, 2, 9, OUT], [7, 5, 2, 7, '#6b7482'],
    [2, 2, 12, 4, OUT], [3, 3, 10, 2, '#d9a42b'],
  ],
  refinery: [
    [1, 6, 8, 9, OUT], [2, 7, 6, 7, '#c9ccd2'],
    [10, 1, 4, 14, OUT], [11, 2, 2, 12, '#8a9099'], [10, 1, 4, 2, '#f4d03f'],
  ],
  workshop: [
    [1, 6, 14, 9, OUT], [2, 7, 12, 7, '#8a6a4a'],
    [0, 3, 16, 4, OUT], [1, 4, 14, 2, '#b5452f'],
    [6, 10, 4, 4, OUT], [7, 10, 2, 4, '#3a2a1a'],
  ],
  house: [
    [2, 7, 12, 8, OUT], [3, 8, 10, 6, '#d9c9a0'],
    [1, 3, 14, 5, OUT], [2, 4, 12, 3, '#a0402a'], [5, 2, 6, 2, OUT],
    [7, 10, 3, 4, '#6a5a4a'],
  ],
};

export const ROLE_ICONS: Record<NpcRole, number> = {
  constructor: 120,
  transporter: 110,
  operator: 108,
  mechanic: 121,
};

export const JOB_ICONS: Record<JobType, number> = {
  build: 122,
  deconstruct: 123,
  repair: 122,
  supply: 110,
  collect: 130,
  maintain: 121,
  start: 129,
};

/** Rectángulo de una casilla dentro de la hoja. */
export function frameRect(frame: number, sheet: typeof TILESHEET = TILESHEET): { x: number; y: number; w: number; h: number } {
  const t = sheet.tile;
  return { x: (frame % sheet.cols) * t, y: Math.floor(frame / sheet.cols) * t, w: t, h: t };
}
