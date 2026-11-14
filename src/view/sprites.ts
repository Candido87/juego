/**
 * Mapa de sprites del pack "Tiny Factory" de Kenney (CC0, www.kenney.nl).
 * Hoja de 12 x 11 casillas de 16 px; índice = fila * 12 + columna.
 *
 * Este archivo no depende de Phaser (se puede testear). `shapes.ts` lo usa para:
 * - proyectar casillas cenitales sobre la cara superior de los prismas isométricos (TOP_TEXTURES),
 * - crear sprites de pie (BILLBOARDS) para NPCs y marcadores,
 * - iconos de la interfaz (TOOL_ICONS, ROLE_ICONS, JOB_ICONS).
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

/**
 * Casilla proyectada sobre una cara superior.
 * `up`: dirección de la cuadrícula a la que apunta la parte de arriba de la imagen
 * (las cintas giran con el edificio; 3 = −y).
 */
export interface TopTexture {
  frame: number;
  /** Si es true, se gira con la dirección del edificio. */
  directional?: boolean;
}

/** Cintas: el chevrón de la casilla apunta hacia arriba (−v), que en la cuadrícula es la dirección 3. */
export const BELT_UP_DIR = 3;

/** Cara superior de cada modelo (clave del edificio sin dirección). */
export const TOP_TEXTURES: Partial<Record<BuildKind | 'core', TopTexture>> = {
  belt: { frame: 5, directional: true },
  belt_fast: { frame: 53, directional: true },
  storage: { frame: 73 },
  factory: { frame: 57 },
  accumulator: { frame: 86 },
  core: { frame: 22 },
  wall_metal: { frame: 117 },
};

/** Sprites de pie (se escalan x2 y se anclan por los pies). */
export const BILLBOARDS: Record<string, number> = {
  npc_constructor: 120,
  npc_transporter: 110,
  npc_operator: 108,
  marker_spawn: 125,
  icon_alarm: 129,
};

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
};

export const ROLE_ICONS: Record<NpcRole, number> = {
  constructor: 120,
  transporter: 110,
  operator: 108,
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
export function frameRect(frame: number): { x: number; y: number; w: number; h: number } {
  const t = TILESHEET.tile;
  return { x: (frame % TILESHEET.cols) * t, y: Math.floor(frame / TILESHEET.cols) * t, w: t, h: t };
}

/** Giros horarios de 90° que necesita una casilla direccional para apuntar a `dir`. */
export function rotationFor(dir: number): number {
  return (((dir - BELT_UP_DIR) % 4) + 4) % 4;
}
