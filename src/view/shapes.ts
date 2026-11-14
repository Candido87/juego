/**
 * ÚNICO archivo donde se define el aspecto visual de todo lo que hay en el mapa.
 *
 * Cada modelo es una lista de prismas isométricos (cajas) generados por código; cada
 * prisma se pinta con 3 caras de distinto tono (arriba, izquierda, derecha) para dar volumen.
 * En `buildTextures` se "hornean" a texturas de Phaser con una clave (p. ej. 'tower', 'belt_2').
 *
 * PARA PASAR A SPRITES REALES: carga imágenes con las mismas claves (this.load.image('tower', ...))
 * y registra su punto de anclaje en SHAPE_INFO (originX/originY = dónde cae la esquina superior
 * de la casilla a altura 0). El resto del código sólo usa shapeKey()/shapeInfo().
 */
import Phaser from 'phaser';
import { HALF_H, HALF_W, Z_STEP } from '../game/iso';
import { BuildingKind, DX, DY, Dir, Ore } from '../game/types';

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
}

type P3 = (gx: number, gy: number, gz: number) => { x: number; y: number };

export interface ShapeDef {
  parts: Part[];
  /** Detalles extra pintados encima (flechas, vetas de mena...). */
  decal?: (g: Phaser.GameObjects.Graphics, P: P3) => void;
  /** Prismas invisibles que sólo amplían el tamaño de la textura. */
  bounds?: Part[];
  /** Objetos altos: se vuelven semitransparentes si tapan al jugador/cursor. */
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
  iron: 0x7f8794,
  ironVein: 0xc9d1dc,
  copper: 0x9a6a3e,
  copperVein: 0xf0a35a,
  belt: 0x353a42,
  beltArrow: 0xf2c14e,
  drill: 0xd08a2e,
  drillHead: 0x5d636e,
  tower: 0x7d8796,
  towerCol: 0x9aa5b4,
  towerTop: 0x4fc3f7,
  core: 0x3d5a80,
  coreTop: 0x98c1d9,
  coreGem: 0xffd166,
  enemy: 0xd64545,
  enemyHead: 0x7a1f1f,
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
  return (g: Phaser.GameObjects.Graphics, P: P3) => {
    const fx = DX[dir];
    const fy = DY[dir];
    const sx = -fy;
    const sy = fx;
    const c = 0.5;
    const pts = [
      P(c + fx * 0.3 * size, c + fy * 0.3 * size, z),
      P(c - fx * 0.15 * size + sx * 0.2 * size, c - fy * 0.15 * size + sy * 0.2 * size, z),
      P(c - fx * 0.15 * size - sx * 0.2 * size, c - fy * 0.15 * size - sy * 0.2 * size, z),
    ];
    g.fillStyle(color, 1);
    g.fillPoints(pts, true);
  };
}

function beltShape(dir: Dir): ShapeDef {
  return {
    parts: [{ x: 0.06, y: 0.06, w: 0.88, d: 0.88, z: 0, h: 4, color: COLORS.belt }],
    decal: (g, P) => {
      // Raíles laterales en la dirección de avance.
      g.lineStyle(1, 0x15181d, 0.8);
      const along = DX[dir] !== 0;
      for (const o of [0.18, 0.82]) {
        const a = along ? P(0.1, o, 4) : P(o, 0.1, 4);
        const b = along ? P(0.9, o, 4) : P(o, 0.9, 4);
        g.lineBetween(a.x, a.y, b.x, b.y);
      }
      arrowDecal(dir, 4, COLORS.beltArrow, 0.9)(g, P);
    },
  };
}

function drillShape(dir: Dir): ShapeDef {
  return {
    parts: [
      { x: 0.08, y: 0.08, w: 0.84, d: 0.84, z: 0, h: 14, color: COLORS.drill },
      { x: 0.28, y: 0.28, w: 0.44, d: 0.44, z: 14, h: 16, color: COLORS.drillHead },
    ],
    decal: arrowDecal(dir, 30, COLORS.beltArrow, 0.7),
    tall: true,
    shadow: 'shadow_1',
  };
}

const enemyShape: ShapeDef = {
  parts: [
    { x: -0.17, y: -0.17, w: 0.34, d: 0.34, z: 0, h: 14, color: COLORS.enemy },
    { x: -0.1, y: -0.1, w: 0.2, d: 0.2, z: 14, h: 8, color: COLORS.enemyHead },
  ],
};

function itemShape(ore: Ore): ShapeDef {
  const color = ore === Ore.Copper ? COLORS.copperVein : COLORS.ironVein;
  return { parts: [{ x: -0.1, y: -0.1, w: 0.2, d: 0.2, z: 4, h: 7, color }] };
}

export const SHAPES: Record<string, ShapeDef> = {
  core: {
    parts: [
      { x: 0.1, y: 0.1, w: 1.8, d: 1.8, z: 0, h: 26, color: COLORS.core },
      { x: 0.45, y: 0.45, w: 1.1, d: 1.1, z: 26, h: 30, color: COLORS.coreTop },
      { x: 0.8, y: 0.8, w: 0.4, d: 0.4, z: 56, h: 16, color: COLORS.coreGem },
    ],
    tall: true,
    shadow: 'shadow_2',
  },
  tower: {
    parts: [
      { x: 0.12, y: 0.12, w: 0.76, d: 0.76, z: 0, h: 10, color: COLORS.tower },
      { x: 0.3, y: 0.3, w: 0.4, d: 0.4, z: 10, h: 40, color: COLORS.towerCol },
      { x: 0.2, y: 0.2, w: 0.6, d: 0.6, z: 50, h: 8, color: COLORS.towerTop },
    ],
    tall: true,
    shadow: 'shadow_1',
  },
  enemy: enemyShape,
  item_1: itemShape(Ore.Iron),
  item_2: itemShape(Ore.Copper),
};
for (let d = 0; d < 4; d++) {
  SHAPES[`belt_${d}`] = beltShape(d as Dir);
  SHAPES[`drill_${d}`] = drillShape(d as Dir);
}

/** Altura de la "boca" de cada torre, para dibujar los disparos. */
export const MUZZLE_Z = 54;

export function shapeKey(kind: BuildingKind, dir: Dir): string {
  return kind === 'belt' || kind === 'drill' ? `${kind}_${dir}` : kind;
}
export const itemKey = (ore: Ore) => `item_${ore}`;
export const ENEMY_KEY = 'enemy';

// ------------------------------------------------------------------ terreno

export function terrainKey(ore: Ore, z: number, ao: number, alt: number): string {
  return `t_${ore}_${z}_${ao}_${alt}`;
}

function terrainShape(ore: Ore, z: number, ao: number, alt: number): ShapeDef {
  const base = ore === Ore.Iron ? COLORS.iron : ore === Ore.Copper ? COLORS.copper : COLORS.grass[z];
  const top = shade(base, AO[ao] * (alt ? 0.96 : 1));
  const top0 = z * Z_STEP;
  return {
    parts: [{ x: 0, y: 0, w: 1, d: 1, z: -8, h: top0 + 8, color: top, side: shade(COLORS.dirt, 1 - z * 0.04), edge: 0.12 }],
    decal:
      ore === Ore.None
        ? undefined
        : (g, P) => {
            const vein = ore === Ore.Iron ? COLORS.ironVein : COLORS.copperVein;
            for (const [cx, cy, s] of [[0.3, 0.3, 0.12], [0.66, 0.4, 0.1], [0.45, 0.7, 0.13], [0.75, 0.75, 0.08]]) {
              g.fillStyle(vein, 0.9);
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

function drawPart(g: Phaser.GameObjects.Graphics, p: Part, P: P3) {
  const x0 = p.x;
  const y0 = p.y;
  const x1 = p.x + p.w;
  const y1 = p.y + p.d;
  const z0 = p.z;
  const z1 = p.z + p.h;
  const side = p.side ?? p.color;
  const edge = p.edge ?? 0.35;
  const faces: [number, { x: number; y: number }[]][] = [];
  if (p.h > 0) {
    faces.push([shade(side, LIGHT.left), [P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0)]]);
    faces.push([shade(side, LIGHT.right), [P(x1, y0, z1), P(x1, y1, z1), P(x1, y1, z0), P(x1, y0, z0)]]);
  }
  faces.push([p.side ? p.color : shade(p.color, LIGHT.top), [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)]]);
  for (const [color, pts] of faces) {
    g.fillStyle(color, 1);
    g.fillPoints(pts, true);
    if (edge > 0) {
      g.lineStyle(1, shade(color, 0.5), edge);
      g.strokePoints(pts, true);
    }
  }
}

function bake(scene: Phaser.Scene, key: string, def: ShapeDef, extraDraw?: (g: Phaser.GameObjects.Graphics, P: P3) => void) {
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
  const g = scene.add.graphics();
  for (const p of def.parts) drawPart(g, p, P);
  def.decal?.(g, P);
  extraDraw?.(g, P);
  g.generateTexture(key, W, H);
  g.destroy();
  SHAPE_INFO.set(key, { originX: ox / W, originY: oy / H, tall: !!def.tall, shadow: def.shadow });
}

/** Sombra suave: varias capas translúcidas desplazadas hacia abajo-derecha (luz desde arriba-izquierda). */
function bakeShadow(scene: Phaser.Scene, key: string, size: number) {
  bake(scene, key, { parts: [], bounds: [{ x: -0.2, y: -0.2, w: size + 0.8, d: size + 0.8, z: 0, h: 0, color: 0 }] }, (g, P) => {
    for (let k = 0; k < 6; k++) {
      const e = 0.03 * k;
      const s = 0.06 * k;
      const x0 = 0.05 - e + s;
      const y0 = 0.05 - e + s;
      const x1 = size - 0.05 + e + s;
      const y1 = size - 0.05 + e + s;
      g.fillStyle(0x000000, 0.07);
      g.fillPoints([P(x0, y0, 0), P(x1, y0, 0), P(x1, y1, 0), P(x0, y1, 0)], true);
    }
  });
}

/** Genera todas las texturas (una vez por partida de Phaser). */
export function buildTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists('core')) return;
  for (const [key, def] of Object.entries(SHAPES)) bake(scene, key, def);
  bakeShadow(scene, 'shadow_1', 1);
  bakeShadow(scene, 'shadow_2', 2);
  for (const ore of [Ore.None, Ore.Iron, Ore.Copper])
    for (let z = 0; z <= 2; z++)
      for (let ao = 0; ao <= 2; ao++)
        for (let alt = 0; alt <= 1; alt++) bake(scene, terrainKey(ore, z, ao, alt), terrainShape(ore, z, ao, alt));
}
