/**
 * ÚNICO archivo donde se define el aspecto visual de todo lo que hay en el mapa.
 *
 * Cada modelo es una lista de prismas isométricos (cajas) generados por código; cada
 * prisma se pinta con 3 caras de distinto tono (arriba, izquierda, derecha) para dar volumen.
 * En `buildTextures` se "hornean" a texturas de Phaser con una clave (p. ej. 'turret_laser', 'belt_2').
 *
 * SPRITES: el pack "Tiny Factory" de Kenney (CC0) se usa así (mapa de casillas en `sprites.ts`):
 * - una casilla cenital puede proyectarse sobre la cara superior de un prisma (`Part.tex`),
 * - los NPCs y marcadores son sprites de pie (BILLBOARDS), escalados x2.
 * Para cambiar un modelo por un sprite propio: carga la imagen con la misma clave y registra su
 * anclaje en SHAPE_INFO. El resto del código sólo usa shapeKey()/shapeInfo().
 */
import Phaser from 'phaser';
import { HALF_H, HALF_W, Z_STEP } from '../game/iso';
import { BuildingKind, DX, DY, Dir, ENEMY_KINDS, EnemyKind, ITEM_IDS, ItemId, Ore, TurretKind } from '../game/types';
import { HEAD_STEPS, MODELED, TURRET_CANVAS, TurretLook, drawTurretParts, headYaw, turretBaseKey, turretHeadKey, turretModel } from './turretModels';
import { SKETCH_SCALE } from './sketch';
import { WALL_FAMILY, WALL_TINT, WallDamage, wallAssetKey, wallAssetList, wallAssetUrl, wallKey, wallPiece } from './muros';
import type { WallKind } from '../game/types';
import { BILLBOARDS, DUNGEON_SHEET, ENEMY_SPRITES, Sheet, TILESHEET, TOP_TEXTURES, TopTexture, frameRect, rotationFor } from './sprites';

/** Prisma: x,y,w,d en casillas (relativo a la esquina de la huella); z,h en píxeles. */
export interface Part {
  x: number;
  y: number;
  w: number;
  d: number;
  z: number;
  h: number;
  color: number;
  /** Color de las caras laterales si difiere del de arriba (p. ej. tierra bajo la hierba). */
  side?: number;
  /** Opacidad del contorno (0 = sin contorno). */
  edge?: number;
  /** Casilla del pack proyectada sobre la cara superior (rot = giros horarios de 90°). */
  tex?: { frame: number; rot: number };
}

type P3 = (gx: number, gy: number, gz: number) => { x: number; y: number };
type Pt = { x: number; y: number };

/** Lápiz sobre canvas 2D con la misma API que usaban los detalles (fillStyle, fillPoints...). */
export class Pen {
  constructor(readonly ctx: CanvasRenderingContext2D) {}
  private rgba(c: number, a: number) {
    return `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
  }
  fillStyle(color: number, alpha = 1): this {
    this.ctx.fillStyle = this.rgba(color, alpha);
    return this;
  }
  lineStyle(width: number, color: number, alpha = 1): this {
    this.ctx.lineWidth = width;
    this.ctx.strokeStyle = this.rgba(color, alpha);
    return this;
  }
  private path(pts: Pt[], close: boolean) {
    const c = this.ctx;
    c.beginPath();
    pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
    if (close) c.closePath();
  }
  fillPoints(pts: Pt[], _close = true): this {
    this.path(pts, true);
    this.ctx.fill();
    return this;
  }
  strokePoints(pts: Pt[], close = false): this {
    this.path(pts, close);
    this.ctx.stroke();
    return this;
  }
  lineBetween(x1: number, y1: number, x2: number, y2: number): this {
    this.path([{ x: x1, y: y1 }, { x: x2, y: y2 }], false);
    this.ctx.stroke();
    return this;
  }
}

/** Casilla con textura del pack para la cara superior de un prisma de `kind`. */
function topTex(kind: BuildingKind, dir: Dir = 0): Part['tex'] {
  const t: TopTexture | undefined = TOP_TEXTURES[kind];
  return t ? { frame: t.frame, rot: t.directional ? rotationFor(dir) : 0 } : undefined;
}

export interface ShapeDef {
  parts: Part[];
  /** Detalles extra pintados encima (flechas, vetas de mena...). */
  decal?: (g: Pen, P: P3) => void;
  /** Prismas invisibles que sólo amplían el tamaño de la textura. */
  bounds?: Part[];
  /** Objetos altos: se vuelven semitransparentes si tapan al cursor, enemigos o NPCs. */
  tall?: boolean;
  /** Clave de la sombra suave a usar (o ninguna). */
  shadow?: string;
}

export interface ShapeInfo {
  originX: number;
  originY: number;
  tall: boolean;
  shadow?: string;
}

// ------------------------------------------------------------------ paleta

export const COLORS = {
  grass: [0x5b8a3c, 0x6b9a45, 0x7caa50],
  dirt: 0x6e5034,
  belt: 0x353a42,
  beltFast: 0x2f3e56,
  beltArrow: 0xf2c14e,
  beltArrowFast: 0x6fd3ff,
  metal: 0x7d8796,
  metalLight: 0x9aa5b4,
  dark: 0x4a505a,
  drill: 0xd08a2e,
  core: 0x3d5a80,
  coreTop: 0x98c1d9,
  coreGem: 0xffd166,
  storage: 0x8b6b45,
  factory: 0x6d7f8f,
  generator: 0x5a4a3a,
  accumulator: 0x3f6f5a,
  farm: 0x7a5530,
  crop: 0x8fc43f,
  laser: 0xd94fd9,
  fire: 0xe8572a,
  frost: 0x7fd8ff,
  bullet: 0xf2c14e,
  wood: 0x8a5a2b,
  stone: 0x9a9a92,
  steel: 0x8fa3b8,
  site: 0xc8d0da,
};

/** Color de cada objeto (cubitos en cintas, iconos). */
export const ITEM_COLORS: Record<ItemId, number> = {
  iron_ore: 0xb7bec9,
  copper_ore: 0xe0915a,
  coal: 0x2a2a2a,
  stone: 0xa8a49a,
  wood: 0x9a6a35,
  iron_plate: 0xd9e0ea,
  copper_plate: 0xf0a35a,
  gear: 0x8d939e,
  ammo: 0xf2c14e,
  circuit: 0x4caf50,
  brick: 0xb5523b,
  battery: 0x66bb6a,
  wall_plate: 0x8fa3b8,
  science_1: 0xe53935,
  science_2: 0x1e88e5,
  food: 0x9ccc65,
  frame: 0x9e7b55,
  wire: 0xff8a3d,
  pipe: 0x7f8c99,
  gun_part: 0x5c6b7a,
  tool_kit: 0xd84b3c,
  oil: 0x1a1420,
  gasoline: 0xf4d03f,
  sulfur: 0xe6d83a,
};

/** Colores de disparo por torreta. */
export const SHOT_COLORS: Record<TurretKind, number> = {
  turret_bullet: 0xfff1a8,
  turret_laser: 0xff66ff,
  turret_fire: 0xff7b2e,
  turret_frost: 0x9be7ff,
};

const ENEMY_COLORS: Record<EnemyKind, [number, number]> = {
  grunt: [0xd64545, 0x7a1f1f],
  runner: [0xf08a3c, 0x7a3f12],
  armored: [0x6b6f7a, 0x2e3138],
  flyer: [0xa05ad6, 0x4b2366],
  tank: [0x8c2a2a, 0x3d1010],
};


/** Multiplicadores de luz por cara (luz desde arriba-izquierda). */
const LIGHT = { top: 1.1, left: 0.82, right: 0.62 };
/** Oscurecimiento por oclusión ambiental del terreno (0, 1 o 2 vecinas más altas). */
const AO = [1, 0.84, 0.72];

export function shade(c: number, f: number): number {
  const r = Math.min(255, ((c >> 16) & 255) * f) | 0;
  const g = Math.min(255, ((c >> 8) & 255) * f) | 0;
  const b = Math.min(255, (c & 255) * f) | 0;
  return (r << 16) | (g << 8) | b;
}

// ------------------------------------------------------------------ modelos

function arrowDecal(dir: Dir, z: number, color: number, size = 1) {
  return (g: Pen, P: P3) => {
    const fx = DX[dir];
    const fy = DY[dir];
    const sx = -fy;
    const sy = fx;
    const c = 0.5;
    g.fillStyle(color, 1);
    g.fillPoints(
      [
        P(c + fx * 0.3 * size, c + fy * 0.3 * size, z),
        P(c - fx * 0.15 * size + sx * 0.2 * size, c - fy * 0.15 * size + sy * 0.2 * size, z),
        P(c - fx * 0.15 * size - sx * 0.2 * size, c - fy * 0.15 * size - sy * 0.2 * size, z),
      ],
      true,
    );
  };
}

/** Cinta: la superficie es la casilla de cinta del pack (con sus chevrones), girada según la dirección. */
function beltShape(dir: Dir, fast: boolean): ShapeDef {
  const kind = fast ? 'belt_fast' : 'belt';
  return {
    parts: [{ x: 0, y: 0, w: 1, d: 1, z: 0, h: 4, color: fast ? COLORS.beltFast : COLORS.belt, tex: topTex(kind, dir), edge: 0 }],
  };
}

/** Tubería: tubo bajo con flecha de flujo; la vista la tiñe según el líquido que lleva. */
function pipeShape(dir: Dir): ShapeDef {
  return {
    parts: [
      { x: 0.12, y: 0.12, w: 0.76, d: 0.76, z: 0, h: 7, color: 0x8a949f, edge: 0.3 },
      { x: 0.3, y: 0.3, w: 0.4, d: 0.4, z: 7, h: 2, color: 0x56606b, edge: 0 },
    ],
    decal: arrowDecal(dir, 9, 0xffffff, 0.8),
  };
}

function drillShape(dir: Dir): ShapeDef {
  return {
    parts: [
      { x: 0.08, y: 0.08, w: 0.84, d: 0.84, z: 0, h: 14, color: COLORS.drill },
      { x: 0.28, y: 0.28, w: 0.44, d: 0.44, z: 14, h: 16, color: COLORS.dark },
    ],
    decal: arrowDecal(dir, 30, COLORS.beltArrow, 0.7),
    tall: true,
    shadow: 'shadow_1',
  };
}

function factoryShape(dir: Dir): ShapeDef {
  return {
    parts: [
      { x: 0.06, y: 0.06, w: 0.88, d: 0.88, z: 0, h: 22, color: COLORS.factory, tex: topTex('factory') },
      { x: 0.12, y: 0.62, w: 0.26, d: 0.26, z: 22, h: 22, color: COLORS.dark },
    ],
    decal: arrowDecal(dir, 22, COLORS.beltArrow, 0.6),
    tall: true,
    shadow: 'shadow_1',
  };
}

/** Bomba de petróleo: base con balancín (cabeza de caballo) y tubo. */
function pumpShape(dir: Dir): ShapeDef {
  return {
    parts: [
      { x: 0.1, y: 0.1, w: 0.8, d: 0.8, z: 0, h: 6, color: 0x3d3a40 },
      { x: 0.44, y: 0.44, w: 0.12, d: 0.12, z: 6, h: 26, color: 0x55505a },
      { x: 0.12, y: 0.42, w: 0.76, d: 0.16, z: 30, h: 6, color: 0xd9a42b },
      { x: 0.12, y: 0.4, w: 0.14, d: 0.2, z: 22, h: 14, color: 0xd9a42b },
    ],
    decal: arrowDecal(dir, 6, COLORS.beltArrow, 0.5),
    tall: true,
    shadow: 'shadow_1',
  };
}

/** Refinería: depósito cilíndrico (prisma) y torre de destilación. */
function refineryShape(dir: Dir): ShapeDef {
  return {
    parts: [
      { x: 0.05, y: 0.05, w: 0.9, d: 0.9, z: 0, h: 10, color: 0x6a6f78 },
      { x: 0.12, y: 0.12, w: 0.42, d: 0.42, z: 10, h: 16, color: 0xc9ccd2 },
      { x: 0.62, y: 0.2, w: 0.22, d: 0.22, z: 10, h: 40, color: 0x8a9099 },
      { x: 0.6, y: 0.18, w: 0.26, d: 0.26, z: 50, h: 4, color: 0xf4d03f },
    ],
    decal: arrowDecal(dir, 10, COLORS.beltArrow, 0.5),
    tall: true,
    shadow: 'shadow_1',
  };
}

/** Granja: bancal de tierra con hileras de cultivo y un silo pequeño. */
function farmShape(dir: Dir): ShapeDef {
  const rows: Part[] = [0.18, 0.42, 0.66].map((y) => ({ x: 0.1, y, w: 0.56, d: 0.14, z: 5, h: 5, color: COLORS.crop }));
  return {
    parts: [
      { x: 0.04, y: 0.04, w: 0.92, d: 0.92, z: 0, h: 5, color: COLORS.farm },
      ...rows,
      { x: 0.72, y: 0.12, w: 0.2, d: 0.2, z: 5, h: 22, color: 0xd9c9a0 },
    ],
    decal: arrowDecal(dir, 10, COLORS.beltArrow, 0.5),
    shadow: 'shadow_1',
  };
}

function turret(base: number, column: number, head: number, extra: Part[] = []): ShapeDef {
  return {
    parts: [
      { x: 0.12, y: 0.12, w: 0.76, d: 0.76, z: 0, h: 10, color: base },
      { x: 0.3, y: 0.3, w: 0.4, d: 0.4, z: 10, h: 36, color: column },
      { x: 0.2, y: 0.2, w: 0.6, d: 0.6, z: 46, h: 8, color: head },
      ...extra,
    ],
    tall: true,
    shadow: 'shadow_1',
  };
}

function wall(color: number, h: number, tex?: Part['tex']): ShapeDef {
  return {
    parts: [
      { x: 0.02, y: 0.02, w: 0.96, d: 0.96, z: 0, h, color },
      { x: 0.1, y: 0.1, w: 0.8, d: 0.8, z: h, h: 4, color: shade(color, 1.1), tex },
    ],
    tall: true,
    shadow: 'shadow_1',
  };
}

function enemyShape(kind: EnemyKind): ShapeDef {
  const [body, head] = ENEMY_COLORS[kind];
  const s = kind === 'tank' ? 0.3 : kind === 'runner' ? 0.13 : 0.17;
  const h = kind === 'tank' ? 18 : kind === 'runner' ? 10 : 14;
  const parts: Part[] = [
    { x: -s, y: -s, w: 2 * s, d: 2 * s, z: 0, h, color: body },
    { x: -s * 0.6, y: -s * 0.6, w: s * 1.2, d: s * 1.2, z: h, h: 8, color: head },
  ];
  if (kind === 'armored') parts.push({ x: -s - 0.04, y: -s - 0.04, w: 2 * s + 0.08, d: 2 * s + 0.08, z: 4, h: 6, color: 0x9aa0aa });
  if (kind === 'flyer') parts.push({ x: -0.32, y: -0.06, w: 0.64, d: 0.12, z: 8, h: 2, color: 0xd8b4ff });
  return { parts };
}


function itemShape(item: ItemId): ShapeDef {
  return { parts: [{ x: -0.1, y: -0.1, w: 0.2, d: 0.2, z: 4, h: 7, color: ITEM_COLORS[item] }] };
}

export const SHAPES: Record<string, ShapeDef> = {
  core: {
    parts: [
      { x: 0.1, y: 0.1, w: 1.8, d: 1.8, z: 0, h: 26, color: COLORS.core },
      { x: 0.45, y: 0.45, w: 1.1, d: 1.1, z: 26, h: 30, color: COLORS.coreTop, tex: topTex('core') },
      { x: 0.8, y: 0.8, w: 0.4, d: 0.4, z: 56, h: 16, color: COLORS.coreGem },
    ],
    tall: true,
    shadow: 'shadow_2',
  },
  storage: {
    parts: [
      { x: 0.06, y: 0.06, w: 0.88, d: 0.88, z: 0, h: 18, color: COLORS.storage },
      { x: 0.06, y: 0.06, w: 0.88, d: 0.88, z: 18, h: 4, color: shade(COLORS.storage, 0.8), tex: topTex('storage') },
    ],
    shadow: 'shadow_1',
  },
  generator: {
    parts: [
      { x: 0.08, y: 0.08, w: 0.84, d: 0.84, z: 0, h: 16, color: COLORS.generator },
      { x: 0.55, y: 0.15, w: 0.25, d: 0.25, z: 16, h: 26, color: COLORS.dark },
      { x: 0.15, y: 0.5, w: 0.3, d: 0.3, z: 16, h: 6, color: 0xff9f43 },
    ],
    tall: true,
    shadow: 'shadow_1',
  },
  house: {
    parts: [
      { x: 0.12, y: 0.12, w: 0.76, d: 0.76, z: 0, h: 18, color: 0xd9c9a0 },
      { x: 0.08, y: 0.08, w: 0.84, d: 0.84, z: 18, h: 5, color: 0xa0402a },
      { x: 0.2, y: 0.2, w: 0.6, d: 0.6, z: 23, h: 5, color: 0xb5452f },
      { x: 0.6, y: 0.25, w: 0.12, d: 0.12, z: 23, h: 12, color: 0x6a5a4a },
    ],
    tall: true,
    shadow: 'shadow_1',
  },
  workshop: {
    parts: [
      { x: 0.05, y: 0.05, w: 0.9, d: 0.9, z: 0, h: 18, color: 0x8a6a4a },
      { x: 0.05, y: 0.05, w: 0.9, d: 0.9, z: 18, h: 6, color: 0xb5452f },
      { x: 0.62, y: 0.15, w: 0.18, d: 0.18, z: 24, h: 12, color: 0x4a505a },
      { x: 0.2, y: 0.82, w: 0.4, d: 0.12, z: 2, h: 12, color: 0x3a2a1a },
    ],
    tall: true,
    shadow: 'shadow_1',
  },
  pole: {
    parts: [
      { x: 0.42, y: 0.42, w: 0.16, d: 0.16, z: 0, h: 44, color: 0x7a5a3a },
      { x: 0.2, y: 0.45, w: 0.6, d: 0.1, z: 40, h: 4, color: 0x5a4030 },
      { x: 0.22, y: 0.44, w: 0.08, d: 0.12, z: 44, h: 4, color: 0xd9a066 },
      { x: 0.7, y: 0.44, w: 0.08, d: 0.12, z: 44, h: 4, color: 0xd9a066 },
    ],
    tall: true,
  },
  solar: {
    parts: [
      { x: 0.1, y: 0.1, w: 0.8, d: 0.8, z: 0, h: 6, color: COLORS.dark },
      { x: 0.06, y: 0.06, w: 0.88, d: 0.88, z: 6, h: 3, color: 0x1e3a6e },
    ],
    decal: (g, P) => {
      g.lineStyle(1, 0x6fa8ff, 0.6);
      for (const t of [0.35, 0.65]) {
        const a = P(0.08, t, 9);
        const b = P(0.92, t, 9);
        const c = P(t, 0.08, 9);
        const d = P(t, 0.92, 9);
        g.lineBetween(a.x, a.y, b.x, b.y);
        g.lineBetween(c.x, c.y, d.x, d.y);
      }
    },
    shadow: 'shadow_1',
  },
  turbine: {
    parts: [
      { x: 0.05, y: 0.05, w: 0.9, d: 0.9, z: 0, h: 14, color: 0x5d6b78 },
      { x: 0.15, y: 0.15, w: 0.5, d: 0.5, z: 14, h: 22, color: 0x8a99a8 },
      { x: 0.68, y: 0.2, w: 0.2, d: 0.2, z: 14, h: 34, color: COLORS.dark },
    ],
    tall: true,
    shadow: 'shadow_1',
  },
  accumulator: {
    parts: [
      { x: 0.12, y: 0.12, w: 0.76, d: 0.76, z: 0, h: 8, color: COLORS.dark },
      { x: 0.2, y: 0.2, w: 0.6, d: 0.6, z: 8, h: 22, color: COLORS.accumulator, tex: topTex('accumulator') },
    ],
    tall: true,
    shadow: 'shadow_1',
  },
  turret_bullet: turret(COLORS.metal, COLORS.metalLight, COLORS.bullet),
  turret_laser: turret(COLORS.dark, 0x6a5a8a, COLORS.laser, [{ x: 0.42, y: 0.42, w: 0.16, d: 0.16, z: 54, h: 10, color: 0xffb3ff }]),
  turret_fire: turret(0x5a4a3a, 0x8a5a3a, COLORS.fire),
  turret_frost: turret(0x4a6a8a, 0x8ab8d8, COLORS.frost),
  wall_wood: wall(COLORS.wood, 24),
  wall_stone: wall(COLORS.stone, 30),
  wall_metal: wall(COLORS.steel, 36, topTex('wall_metal')),
};
for (let d = 0; d < 4; d++) {
  const dir = d as Dir;
  SHAPES[`belt_${d}`] = beltShape(dir, false);
  SHAPES[`belt_fast_${d}`] = beltShape(dir, true);
  SHAPES[`pipeline_${d}`] = pipeShape(dir);
  SHAPES[`drill_${d}`] = drillShape(dir);
  SHAPES[`factory_${d}`] = factoryShape(dir);
  SHAPES[`farm_${d}`] = farmShape(dir);
  SHAPES[`pump_${d}`] = pumpShape(dir);
  SHAPES[`refinery_${d}`] = refineryShape(dir);
  SHAPES[`feeder_${d}`] = {
    parts: [
      { x: 0.15, y: 0.15, w: 0.7, d: 0.7, z: 0, h: 8, color: 0x4a6a5a },
      { x: 0.35, y: 0.35, w: 0.3, d: 0.3, z: 8, h: 10, color: 0x7fbf9f },
    ],
    decal: arrowDecal(dir, 8, COLORS.beltArrowFast, 0.8),
  };
}

/** Altura (px) a la que cuelgan los cables de los postes. */
export const WIRE_Z = 46;
for (const k of ENEMY_KINDS) SHAPES[`enemy_${k}`] = enemyShape(k);
for (const i of ITEM_IDS) SHAPES[`item_${i}`] = itemShape(i);

/** Altura de la "boca" de las torretas, para dibujar los disparos. */
export const MUZZLE_Z = 52;
/** Altura de vuelo de los voladores (px). */
export const FLY_Z = 28;

const DIRECTIONAL = new Set<BuildingKind>(['belt', 'belt_fast', 'pipeline', 'drill', 'factory', 'feeder', 'farm', 'pump', 'refinery']);
export function shapeKey(kind: BuildingKind, dir: Dir): string {
  return DIRECTIONAL.has(kind) ? `${kind}_${dir}` : kind;
}
export const itemKey = (item: ItemId) => `item_${item}`;
/** Prisma de respaldo de cada enemigo. */
export const enemyKey = (k: EnemyKind) => `enemy_${k}`;
/** Sprite de cada enemigo (si el pack no se cargó, no existe y se usa el prisma). */
export const enemySpriteKey = (k: EnemyKind) => `enemy_spr_${k}`;
/** Clave a usar para dibujar un enemigo: sprite si existe, si no el prisma. */
export const enemyLookKey = (scene: Phaser.Scene, k: EnemyKind) => {
  const kenney = kenneyEnemyKey(k);
  if (kenney && scene.textures.exists(kenney)) return kenney;
  return scene.textures.exists(enemySpriteKey(k)) ? enemySpriteKey(k) : enemyKey(k);
};

// ------------------------------------------------------------------ enemigos de Kenney (tanques y naves)
/** Tanques de perfil (Kenney Tanks, Navy con X blanca) para los terrestres blindados; escala de reducción. */
export const TANK_SPRITES: Partial<Record<EnemyKind, { file: string; scale: number }>> = {
  armored: { file: 'tanks_tankNavy3', scale: 0.5 },
  tank: { file: 'tanks_tankNavy5', scale: 0.7 },
};
/** Nave enemiga cenital (Space Shooter) que se proyecta sobre el plano del suelo en 16 rumbos. */
export const SHIP_FILE = 'enemyRed2';
export const SHIP_HEADINGS = 16;
const SHIP_SCALE = 0.42;
const SHIP_CANVAS = { w: 72, h: 52 };
const enemyImgKey = (name: string) => `enemy_img_${name}`;
export const kenneyEnemyKey = (k: EnemyKind): string | undefined => (TANK_SPRITES[k] ? `enemy_tank_${k}` : undefined);
export const shipKey = (i: number) => `enemy_ship_${i}`;
/** Índice de rumbo (0..15) de la nave a partir de un desplazamiento en la cuadrícula. */
export function shipHeading(dx: number, dy: number): number {
  const a = Math.atan2(dy, dx);
  return ((Math.round((a / (Math.PI * 2)) * SHIP_HEADINGS) % SHIP_HEADINGS) + SHIP_HEADINGS) % SHIP_HEADINGS;
}

function bakeKenneyEnemies(scene: Phaser.Scene) {
  for (const [kind, def] of Object.entries(TANK_SPRITES) as [EnemyKind, { file: string; scale: number }][]) {
    const src = scene.textures.exists(enemyImgKey(def.file)) ? scene.textures.get(enemyImgKey(def.file)).getSourceImage() : undefined;
    if (!src) continue;
    const w = Math.round(src.width * def.scale);
    const h = Math.round(src.height * def.scale);
    const [tex, ctx] = canvasTexture(scene, kenneyEnemyKey(kind)!, w, h);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src as CanvasImageSource, 0, 0, w, h);
    tex.refresh();
    SHAPE_INFO.set(kenneyEnemyKey(kind)!, { originX: 0.5, originY: 0.9, tall: false });
  }
  const ship = scene.textures.exists(enemyImgKey(SHIP_FILE)) ? scene.textures.get(enemyImgKey(SHIP_FILE)).getSourceImage() : undefined;
  if (!ship) return;
  const { w, h } = SHIP_CANVAS;
  for (let i = 0; i < SHIP_HEADINGS; i++) {
    const [tex, ctx] = canvasTexture(scene, shipKey(i), w, h);
    const ang = (i / SHIP_HEADINGS) * Math.PI * 2;
    const fx = Math.cos(ang);
    const fy = Math.sin(ang);
    // Ejes "derecha" y "abajo" de la imagen sobre la cuadrícula, luego proyección isométrica 2:1.
    const proj = (gx: number, gy: number): [number, number] => [(gx - gy) * SHIP_SCALE, ((gx + gy) / 2) * SHIP_SCALE];
    const [ax, ay] = proj(-fy, fx);
    const [bx, by] = proj(-fx, -fy);
    ctx.setTransform(ax, ay, bx, by, w / 2, h / 2);
    ctx.drawImage(ship as CanvasImageSource, -ship.width / 2, -ship.height / 2);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    tex.refresh();
    SHAPE_INFO.set(shipKey(i), { originX: 0.5, originY: 0.5, tall: false });
  }
}
export const npcKey = (r: string) => `npc_${r}`;

// ------------------------------------------------------------------ terreno

const ORE_COLORS: Record<number, [number, number]> = {
  [Ore.Iron]: [0x7f8794, 0xc9d1dc],
  [Ore.Copper]: [0x9a6a3e, 0xf0a35a],
  [Ore.Coal]: [0x45474c, 0x1c1c1c],
  [Ore.Stone]: [0x8f8b80, 0xc7c2b4],
  [Ore.Oil]: [0x2b2633, 0x0d0b10],
  [Ore.Sulfur]: [0x8a7f2a, 0xf2e640],
};

export function terrainKey(ore: Ore, z: number, ao: number, alt: number): string {
  return `t_${ore}_${z}_${ao}_${alt}`;
}

function terrainShape(ore: Ore, z: number, ao: number, alt: number): ShapeDef {
  const oc = ORE_COLORS[ore];
  const base = oc ? oc[0] : ore === Ore.Wood ? shade(COLORS.grass[z], 0.85) : COLORS.grass[z];
  const top = shade(base, AO[ao] * (alt ? 0.96 : 1));
  const top0 = z * Z_STEP;
  const parts: Part[] = [{ x: 0, y: 0, w: 1, d: 1, z: -8, h: top0 + 8, color: top, side: shade(COLORS.dirt, 1 - z * 0.04), edge: 0.12 }];
  if (ore === Ore.Wood) {
    // Bosque: dos arbolitos.
    for (const [tx, ty, s] of [[0.22, 0.25, 0.22], [0.58, 0.55, 0.26]]) {
      parts.push({ x: tx + s / 2 - 0.04, y: ty + s / 2 - 0.04, w: 0.08, d: 0.08, z: top0, h: 8, color: 0x6b4423, edge: 0 });
      parts.push({ x: tx, y: ty, w: s, d: s, z: top0 + 8, h: 16, color: shade(0x2f6b2a, alt ? 0.95 : 1.05), edge: 0.2 });
    }
  }
  return {
    parts,
    decal: !oc
      ? undefined
      : (g, P) => {
          for (const [cx, cy, s] of [[0.3, 0.3, 0.12], [0.66, 0.4, 0.1], [0.45, 0.7, 0.13], [0.75, 0.75, 0.08]]) {
            g.fillStyle(oc[1], 0.9);
            g.fillPoints([P(cx, cy - s, top0), P(cx + s, cy, top0), P(cx, cy + s, top0), P(cx - s, cy, top0)], true);
          }
        },
  };
}

// ------------------------------------------------------------------ horneado

const SHAPE_INFO = new Map<string, ShapeInfo>();

export function shapeInfo(key: string): ShapeInfo {
  const info = SHAPE_INFO.get(key);
  if (!info) throw new Error(`Modelo desconocido: ${key}`);
  return info;
}

/** Casilla del pack (ya cargado en Phaser) girada `rot` veces 90° en sentido horario. */
function tileCanvas(scene: Phaser.Scene, frame: number, rot: number, sheet: Sheet = TILESHEET): HTMLCanvasElement {
  const t = sheet.tile;
  const src = scene.textures.get(sheet.key).getSourceImage() as HTMLImageElement;
  const c = document.createElement('canvas');
  c.width = t;
  c.height = t;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.translate(t / 2, t / 2);
  ctx.rotate((rot * Math.PI) / 2);
  const r = frameRect(frame, sheet);
  ctx.drawImage(src, r.x, r.y, r.w, r.h, -t / 2, -t / 2, t, t);
  return c;
}

/** Proyecta una casilla cenital sobre la cara superior (rombo) de un prisma. */
function drawTop(scene: Phaser.Scene, ctx: CanvasRenderingContext2D, p: Part, P: P3) {
  if (!p.tex || !scene.textures.exists(TILESHEET.key)) return;
  const t = TILESHEET.tile;
  const z = p.z + p.h;
  const o = P(p.x, p.y, z);
  const ux = P(p.x + p.w, p.y, z);
  const vy = P(p.x, p.y + p.d, z);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  // Transformación afín: (u,v) de la casilla → cara superior isométrica.
  ctx.setTransform((ux.x - o.x) / t, (ux.y - o.y) / t, (vy.x - o.x) / t, (vy.y - o.y) / t, o.x, o.y);
  ctx.drawImage(tileCanvas(scene, p.tex.frame, p.tex.rot), 0, 0);
  ctx.restore();
}

function drawPart(scene: Phaser.Scene, pen: Pen, p: Part, P: P3) {
  const x0 = p.x;
  const y0 = p.y;
  const x1 = p.x + p.w;
  const y1 = p.y + p.d;
  const z0 = p.z;
  const z1 = p.z + p.h;
  const side = p.side ?? p.color;
  const edge = p.edge ?? 0.35;
  const faces: [number, Pt[]][] = [];
  if (p.h > 0) {
    faces.push([shade(side, LIGHT.left), [P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0)]]);
    faces.push([shade(side, LIGHT.right), [P(x1, y0, z1), P(x1, y1, z1), P(x1, y1, z0), P(x1, y0, z0)]]);
  }
  faces.push([p.side ? p.color : shade(p.color, LIGHT.top), [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)]]);
  faces.forEach(([color, pts], i) => {
    pen.fillStyle(color, 1).fillPoints(pts);
    if (i === faces.length - 1) drawTop(scene, pen.ctx, p, P);
    if (edge > 0) pen.lineStyle(1, shade(color, 0.5), edge).strokePoints(pts, true);
  });
}

/** Crea una textura de canvas con la clave dada (sustituye si existía). */
function canvasTexture(scene: Phaser.Scene, key: string, W: number, H: number): [Phaser.Textures.CanvasTexture, CanvasRenderingContext2D] {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, W, H)!;
  return [tex, tex.getContext()];
}

function bake(scene: Phaser.Scene, key: string, def: ShapeDef, extraDraw?: (g: Pen, P: P3) => void) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of [...def.parts, ...(def.bounds ?? [])]) {
    minX = Math.min(minX, (p.x - (p.y + p.d)) * HALF_W);
    maxX = Math.max(maxX, (p.x + p.w - p.y) * HALF_W);
    minY = Math.min(minY, (p.x + p.y) * HALF_H - (p.z + p.h));
    maxY = Math.max(maxY, (p.x + p.w + p.y + p.d) * HALF_H - p.z);
  }
  const pad = 2;
  const ox = Math.ceil(-minX + pad);
  const oy = Math.ceil(-minY + pad);
  const W = Math.ceil(maxX - minX + pad * 2) + 1;
  const H = Math.ceil(maxY - minY + pad * 2) + 1;
  const P: P3 = (gx, gy, gz) => ({ x: ox + (gx - gy) * HALF_W, y: oy + (gx + gy) * HALF_H - gz });
  const [tex, ctx] = canvasTexture(scene, key, W, H);
  const pen = new Pen(ctx);
  for (const p of def.parts) drawPart(scene, pen, p, P);
  def.decal?.(pen, P);
  extraDraw?.(pen, P);
  tex.refresh();
  SHAPE_INFO.set(key, { originX: ox / W, originY: oy / H, tall: !!def.tall, shadow: def.shadow });
}

/** Sprite de pie del pack, escalado `scale` veces y anclado por los pies (abajo-centro). */
function bakeBillboard(scene: Phaser.Scene, key: string, frame: number, scale = 2, sheet: Sheet = TILESHEET) {
  const t = sheet.tile * scale;
  const [tex, ctx] = canvasTexture(scene, key, t, t);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tileCanvas(scene, frame, 0, sheet), 0, 0, t, t);
  tex.refresh();
  SHAPE_INFO.set(key, { originX: 0.5, originY: 0.94, tall: false });
}

/** Sombra suave: varias capas translúcidas desplazadas hacia abajo-derecha (luz desde arriba-izquierda). */
function bakeShadow(scene: Phaser.Scene, key: string, size: number, center = false) {
  const o = center ? -size / 2 : 0;
  bake(scene, key, { parts: [], bounds: [{ x: o - 0.2, y: o - 0.2, w: size + 0.8, d: size + 0.8, z: 0, h: 0, color: 0 }] }, (g, P) => {
    for (let k = 0; k < 6; k++) {
      const e = 0.03 * k;
      const s = center ? 0 : 0.06 * k;
      const x0 = o + 0.05 - e + s;
      const y0 = o + 0.05 - e + s;
      const x1 = o + size - 0.05 + e + s;
      const y1 = o + size - 0.05 + e + s;
      g.fillStyle(0x000000, 0.07);
      g.fillPoints([P(x0, y0, 0), P(x1, y0, 0), P(x1, y1, 0), P(x0, y1, 0)], true);
    }
  });
}

/** Carga la hoja del pack (llamar en preload). */
export function preloadSprites(scene: Phaser.Scene): void {
  for (const s of [TILESHEET, DUNGEON_SHEET]) if (!scene.textures.exists(s.key)) scene.load.image(s.key, s.url);
  for (const f of [...Object.values(TANK_SPRITES).map((d) => d!.file), SHIP_FILE])
    if (!scene.textures.exists(enemyImgKey(f))) scene.load.image(enemyImgKey(f), `assets/enemigos/${f}.png`);
  for (const [pack, name, rot] of wallAssetList()) {
    const k = wallAssetKey(name, rot);
    if (!scene.textures.exists(k)) scene.load.image(k, wallAssetUrl(pack, name, rot));
  }
}

/** Lienzo de las piezas de Sketch Town reescaladas: 256x352 a escala SKETCH_SCALE; el suelo de la casilla queda en (ox, oy+16). */
const SK_W = Math.ceil(256 * SKETCH_SCALE) + 1;
const SK_H = Math.ceil(352 * SKETCH_SCALE) + 1;
const SK_OX = 128 * SKETCH_SCALE;
const SK_OY = 289 * SKETCH_SCALE - HALF_H;

/** Grietas y desgaste de un muro dañado (deterministas según el modelo, para que no parpadeen). */
function drawWallDamage(ctx: CanvasRenderingContext2D, dmg: WallDamage, seed: number) {
  if (dmg === 0) return;
  let r = seed * 9301 + 49297;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  const cx = SK_OX;
  const cy = SK_OY + HALF_H - 12;
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = dmg === 1 ? 'rgba(40,30,20,0.18)' : 'rgba(30,20,12,0.38)';
  ctx.fillRect(0, 0, SK_W, SK_H);
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(25,18,12,0.85)';
  ctx.lineWidth = 1;
  const n = dmg === 1 ? 2 : 5;
  for (let i = 0; i < n; i++) {
    let x = cx + (rnd() - 0.5) * 34;
    let y = cy + (rnd() - 0.5) * 22;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 3; k++) {
      x += (rnd() - 0.5) * 9;
      y += 3 + rnd() * 5;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  if (dmg === 2) {
    // Casi roto: se recorta un trozo de la parte alta.
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.moveTo(cx - 6, 0);
    ctx.lineTo(cx + 14, 0);
    ctx.lineTo(cx + 9, SK_OY - 8);
    ctx.lineTo(cx + 2, SK_OY - 2);
    ctx.lineTo(cx - 3, SK_OY - 10);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Textura de un muro con sprites de Sketch Town según vecinos (`mask`) y daño; se hornea la primera vez que se pide.
 * Devuelve undefined si las imágenes no se cargaron (entonces se usa el prisma de respaldo).
 */
export function wallLook(scene: Phaser.Scene, kind: WallKind, mask: number, dmg: WallDamage): string | undefined {
  const key = wallKey(kind, mask, dmg);
  if (scene.textures.exists(key)) return key;
  const { piece, rot } = wallPiece(mask);
  const layers = WALL_FAMILY[kind][piece];
  const imgs: HTMLImageElement[] = [];
  for (const l of layers) {
    const k = wallAssetKey(l.name, l.rots[rot]);
    if (!scene.textures.exists(k)) return undefined;
    imgs.push(scene.textures.get(k).getSourceImage() as HTMLImageElement);
  }
  const [tex, ctx] = canvasTexture(scene, key, SK_W, SK_H);
  for (const img of imgs) ctx.drawImage(img, 0, 0, img.width * SKETCH_SCALE, img.height * SKETCH_SCALE);
  const tint = WALL_TINT[kind];
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.globalAlpha = tint.alpha;
  ctx.fillStyle = tint.color;
  ctx.fillRect(0, 0, SK_W, SK_H);
  ctx.restore();
  drawWallDamage(ctx, dmg, mask * 7 + (kind === 'wall_wood' ? 1 : kind === 'wall_stone' ? 2 : 3));
  tex.refresh();
  SHAPE_INFO.set(key, { originX: SK_OX / SK_W, originY: SK_OY / SK_H, tall: true, shadow: 'shadow_1' });
  return key;
}

/** Hornea base y 16 cabezas de cada torreta modelada (el resto sigue con el prisma de respaldo). */
function bakeTurrets(scene: Phaser.Scene, level = 1) {
  const C = TURRET_CANVAS;
  for (const kind of MODELED) {
    const model = turretModel(kind, level);
    const [bt, bctx] = canvasTexture(scene, turretBaseKey(kind, level), C.w, C.h);
    drawTurretParts(bctx, 0, 0, model, 0, 'base');
    bt.refresh();
    SHAPE_INFO.set(turretBaseKey(kind, level), { originX: C.ox / C.w, originY: C.oy / C.h, tall: true, shadow: 'shadow_1' });
    for (let i = 0; i < HEAD_STEPS; i++) {
      const [ht, hctx] = canvasTexture(scene, turretHeadKey(kind, level, i), C.w, C.h);
      drawTurretParts(hctx, 0, 0, model, headYaw(i), 'head');
      ht.refresh();
    }
  }
}

/** Claves de la torreta modelada (base y cabezas) si existen sus texturas; si no, undefined (se usa el prisma). */
export function turretLook(scene: Phaser.Scene, kind: string): TurretLook | undefined {
  return (MODELED as string[]).includes(kind) && scene.textures.exists(turretBaseKey(kind as TurretLook, 1)) ? (kind as TurretLook) : undefined;
}

/** Hornea (una sola vez, al hacer falta) las texturas de un nivel de torreta. */
export function ensureTurretLevel(scene: Phaser.Scene, level: number): void {
  if (!scene.textures.exists(turretBaseKey(MODELED[0], level))) bakeTurrets(scene, level);
}

/** Genera todas las texturas (una vez por partida de Phaser). */
export function buildTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists('core')) return;
  for (const [key, def] of Object.entries(SHAPES)) bake(scene, key, def);
  for (const [key, frame] of Object.entries(BILLBOARDS)) bakeBillboard(scene, key, frame);
  if (scene.textures.exists(DUNGEON_SHEET.key)) {
    for (const k of ENEMY_KINDS) bakeBillboard(scene, enemySpriteKey(k), ENEMY_SPRITES[k].frame, ENEMY_SPRITES[k].scale, DUNGEON_SHEET);
  }
  bakeKenneyEnemies(scene);
  bakeTurrets(scene);
  bakeShadow(scene, 'shadow_1', 1);
  bakeShadow(scene, 'shadow_2', 2);
  bakeShadow(scene, 'shadow_small', 0.5, true);
  for (const ore of [Ore.None, Ore.Iron, Ore.Copper, Ore.Coal, Ore.Stone, Ore.Wood, Ore.Oil, Ore.Sulfur])
    for (let z = 0; z <= 2; z++)
      for (let ao = 0; ao <= 2; ao++)
        for (let alt = 0; alt <= 1; alt++) bake(scene, terrainKey(ore, z, ao, alt), terrainShape(ore, z, ao, alt));
}
