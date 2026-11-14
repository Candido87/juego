/**
 * Modelos de las torretas como conjuntos de sólidos (ver solids.ts): una BASE fija y una CABEZA que gira hacia el objetivo.
 * Sólo capa visual: no depende de la lógica del juego. Todo se hornea una vez (16 rumbos) en texturas reutilizables.
 */
import { Solid, chamfer, cyl, drawSolids, rect } from './solids';

export type TurretLook = 'turret_bullet' | 'turret_laser' | 'turret_fire' | 'turret_frost';

export interface TurretModel {
  base: Solid[];
  head: Solid[];
}

/** Rumbos pre-horneados de la cabeza (vueltas completas). */
export const HEAD_STEPS = 16;
/** Niveles con aspecto propio. */
export const LOOK_LEVELS = [1, 2, 3] as const;
export type LookLevel = (typeof LOOK_LEVELS)[number];

/** Modelos ya hechos (el resto de tipos sigue con el prisma de respaldo). */
export const MODELED: TurretLook[] = ['turret_bullet', 'turret_laser', 'turret_fire', 'turret_frost'];

const STEEL = 0x7b8594;
const STEEL_DARK = 0x4c5461;
const STEEL_LIGHT = 0xa7b2c1;
const GUNMETAL = 0x2f343d;
const BRASS = 0xe6b84a;
const OLIVE = 0x65754a;

/** Cañón (caja alargada a lo largo de +x) con luz propia en la cara de arriba. */
function barrel(x0: number, x1: number, y: number, zc: number, r: number, color: number): Solid[] {
  const rz = r * 64 * 0.9;
  return [{ foot: rect((x0 + x1) / 2, y, x1 - x0, r * 2), z0: zc - rz, z1: zc + rz, color }];
}

/** Base común: plataforma achaflanada con remaches, pedestal y aro giratorio. */
function platform(accent: number, level: number): Solid[] {
  const s: Solid[] = [
    { foot: chamfer(0.5, 0.5, 0.94, 0.94, 0.16), z0: 0, z1: 5, color: STEEL_DARK },
    { foot: chamfer(0.5, 0.5, 0.82, 0.82, 0.14), z0: 5, z1: 9, color: STEEL, taper: 0.96 },
    { foot: cyl(0.5, 0.5, 0.26, 10), z0: 9, z1: 17, color: STEEL_DARK },
    { foot: cyl(0.5, 0.5, 0.31, 12), z0: 17, z1: 20, color: GUNMETAL, order: 0 },
  ];
  // Remaches en las cuatro esquinas.
  for (const [x, y] of [[0.19, 0.19], [0.81, 0.19], [0.81, 0.81], [0.19, 0.81]]) s.push({ foot: cyl(x, y, 0.035, 6), z0: 9, z1: 11, color: STEEL_LIGHT, noEdge: true });
  // Franja de color en el borde de la plataforma (más ancha con el nivel).
  s.push({ foot: chamfer(0.5, 0.5, 0.9, 0.9, 0.15), z0: 5, z1: 5 + (level >= 2 ? 2 : 1), color: accent, taper: 0.97, noEdge: true });
  if (level >= 3) {
    for (const [x, y] of [[0.5, 0.1], [0.9, 0.5], [0.5, 0.9], [0.1, 0.5]]) s.push({ foot: rect(x, y, 0.14, 0.14), z0: 9, z1: 14, color: STEEL, taper: 0.8 });
  }
  return s;
}

/** Cabeza de la torreta de balas: cuerpo achaflanado, cañones múltiples con camisa y freno de boca, cajón con cinta de munición. */
function bulletHead(level: number): Solid[] {
  const z0 = 20;
  const n = level >= 3 ? 3 : 2;
  const accent = level === 1 ? BRASS : level === 2 ? 0xf08a3c : 0xd94a4a;
  const body = level >= 3 ? 0x5b6676 : STEEL;
  const s: Solid[] = [];
  // Cuerpo bajo y cuerpo alto (pirámide truncada: caras inclinadas).
  s.push({ foot: chamfer(0.46, 0.5, 0.52, 0.5, 0.11), z0, z1: z0 + 9, color: body, taper: 0.94 });
  s.push({ foot: chamfer(0.44, 0.5, 0.4, 0.4, 0.1), z0: z0 + 9, z1: z0 + 17, color: STEEL_LIGHT, taper: 0.78 });
  // Placas laterales de blindaje (nivel 2+).
  if (level >= 2) {
    s.push({ foot: rect(0.46, 0.2, 0.34, 0.05), z0: z0 + 1, z1: z0 + 13, color: STEEL_DARK, taper: 0.9 });
    s.push({ foot: rect(0.46, 0.8, 0.34, 0.05), z0: z0 + 1, z1: z0 + 13, color: STEEL_DARK, taper: 0.9 });
  }
  // Rendijas de refrigeración en la tapa.
  for (const dx of [-0.07, -0.01, 0.05]) s.push({ foot: rect(0.4 + dx, 0.5, 0.025, 0.24), z0: z0 + 17, z1: z0 + 18, color: GUNMETAL, noEdge: true });
  // Mirilla con lente.
  s.push({ foot: rect(0.52, 0.5, 0.1, 0.08), z0: z0 + 17, z1: z0 + 22, color: STEEL_DARK });
  s.push({ foot: rect(0.58, 0.5, 0.02, 0.05), z0: z0 + 18, z1: z0 + 21, color: 0x7be3ff, glow: 0.35, noEdge: true });
  // Contrapeso trasero.
  s.push({ foot: rect(0.2, 0.5, 0.1, 0.3), z0: z0 + 2, z1: z0 + 11, color: GUNMETAL });
  // Cuna de los cañones.
  s.push({ foot: rect(0.68, 0.5, 0.1, 0.34 + 0.07 * (n - 2)), z0: z0 + 3, z1: z0 + 13, color: STEEL_DARK, taper: 0.92 });
  // Cañones: camisa (con rebordes), tubo y freno de boca.
  const spacing = n === 3 ? 0.13 : 0.18;
  for (let i = 0; i < n; i++) {
    const y = 0.5 + (i - (n - 1) / 2) * spacing;
    const raised = n === 3 && i === 1 ? 3 : 0;
    const zc = z0 + 8 + raised;
    s.push(...barrel(0.72, level >= 2 ? 1.12 : 1.02, y, zc, 0.03, GUNMETAL));
    s.push(...barrel(0.72, 0.86, y, zc, 0.05, STEEL));
    s.push(...barrel(1.0, level >= 2 ? 1.16 : 1.06, y, zc, 0.05, STEEL_DARK));
    s.push({ foot: rect(level >= 2 ? 1.15 : 1.05, y, 0.025, 0.07), z0: zc - 3, z1: zc + 3, color: accent, glow: 0.1, noEdge: true });
  }
  // Cajón de munición (lado izquierdo del cañón) con cinta de balas hasta la recámara.
  s.push({ foot: rect(0.38, 0.14, 0.22, 0.16), z0: z0 + 1, z1: z0 + 12, color: OLIVE, taper: 0.95 });
  s.push({ foot: rect(0.38, 0.14, 0.2, 0.05), z0: z0 + 12, z1: z0 + 13, color: accent, noEdge: true });
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    s.push({ foot: rect(0.46 + t * 0.2, 0.2 + t * 0.14, 0.035, 0.035), z0: z0 + 8 + t * 2, z1: z0 + 11 + t * 2, color: BRASS, glow: 0.1, noEdge: true });
  }
  if (level >= 3) s.push({ foot: rect(0.38, 0.86, 0.22, 0.16), z0: z0 + 1, z1: z0 + 12, color: OLIVE, taper: 0.95 });
  return s;
}

const COPPER = 0xc8793a;

/** Cabeza láser: chasis esbelto, cristal de energía, bobinas de cobre en el cañón, aletas disipadoras y cables. */
function laserHead(level: number): Solid[] {
  const z0 = 20;
  const body = 0x4a3f6b;
  const s: Solid[] = [];
  s.push({ foot: chamfer(0.42, 0.5, 0.5, 0.38, 0.1), z0, z1: z0 + 10, color: body, taper: 0.92 });
  s.push({ foot: chamfer(0.4, 0.5, 0.34, 0.26, 0.07), z0: z0 + 10, z1: z0 + 14, color: 0x6a5a8a, taper: 0.8 });
  // Aletas disipadoras traseras.
  for (let i = 0; i < 4 + level; i++) s.push({ foot: rect(0.12 + i * 0.045, 0.5, 0.018, 0.32), z0: z0 + 3, z1: z0 + 15, color: STEEL, noEdge: i % 2 === 1 });
  // Cristal de energía (más grande con el nivel).
  s.push({ foot: cyl(0.4, 0.5, 0.05 + level * 0.012, 6), z0: z0 + 14, z1: z0 + 22 + level * 2, color: 0xd94fd9, taper: 0.5, glow: 0.45 });
  const barrels = level >= 3 ? [0.4, 0.6] : [0.5];
  for (const y of barrels) {
    const zc = z0 + 7;
    s.push(...barrel(0.6, 1.1, y, zc, 0.028, STEEL_LIGHT));
    // Bobinas de cobre a lo largo del cañón.
    for (let i = 0; i < 3 + level; i++) s.push({ foot: rect(0.66 + i * 0.1, y, 0.04, 0.12), z0: zc - 6, z1: zc + 6, color: COPPER, noEdge: true });
    s.push({ foot: rect(1.12, y, 0.03, 0.08), z0: zc - 4, z1: zc + 4, color: 0xffb3ff, glow: 0.6, noEdge: true });
  }
  // Cables del cristal al cañón.
  s.push({ foot: rect(0.52, 0.4, 0.22, 0.02), z0: z0 + 10, z1: z0 + 12, color: GUNMETAL, noEdge: true });
  s.push({ foot: rect(0.52, 0.6, 0.22, 0.02), z0: z0 + 10, z1: z0 + 12, color: GUNMETAL, noEdge: true });
  if (level >= 2) {
    s.push({ foot: rect(0.4, 0.22, 0.3, 0.05), z0: z0 + 1, z1: z0 + 12, color: STEEL_DARK, taper: 0.9 });
    s.push({ foot: rect(0.4, 0.78, 0.3, 0.05), z0: z0 + 1, z1: z0 + 12, color: STEEL_DARK, taper: 0.9 });
  }
  return s;
}

/** Cabeza de fuego: depósitos cilíndricos, tuberías, boquilla ancha y pilotos rojos. */
function fireHead(level: number): Solid[] {
  const z0 = 20;
  const s: Solid[] = [];
  s.push({ foot: chamfer(0.46, 0.5, 0.4, 0.36, 0.08), z0, z1: z0 + 9, color: 0x8a4a2a, taper: 0.94 });
  const tanks = level >= 3 ? [0.22, 0.5, 0.78] : [0.3, 0.7];
  for (const y of tanks) {
    s.push({ foot: cyl(0.26, y, 0.1, 10), z0, z1: z0 + 21, color: 0xb5452f, taper: 0.96 });
    s.push({ foot: cyl(0.26, y, 0.105, 10), z0: z0 + 7, z1: z0 + 9, color: STEEL_DARK, noEdge: true });
    s.push({ foot: cyl(0.26, y, 0.05, 8), z0: z0 + 21, z1: z0 + 24, color: STEEL, taper: 0.8 });
  }
  // Tuberías hacia la boquilla.
  s.push({ foot: rect(0.55, 0.38, 0.3, 0.03), z0: z0 + 8, z1: z0 + 11, color: STEEL_DARK, noEdge: true });
  s.push({ foot: rect(0.55, 0.62, 0.3, 0.03), z0: z0 + 8, z1: z0 + 11, color: STEEL_DARK, noEdge: true });
  // Boquilla: tubo, brida y abocinado con brasa.
  s.push(...barrel(0.6, 0.95, 0.5, z0 + 6, 0.06, GUNMETAL));
  s.push({ foot: chamfer(1.0, 0.5, 0.1, 0.24, 0.025), z0: z0 + 1, z1: z0 + 12, color: 0x3a2a22, taper: 0.95 });
  s.push({ foot: rect(1.05, 0.5, 0.02, 0.18), z0: z0 + 3, z1: z0 + 10, color: 0xff7b2e, glow: 0.5, noEdge: true });
  // Pilotos rojos.
  for (const y of [0.4, 0.6]) s.push({ foot: rect(0.62, y, 0.03, 0.03), z0: z0 + 9, z1: z0 + 13, color: 0xff3030, glow: 0.5, noEdge: true });
  s.push({ foot: rect(0.78, 0.5, 0.025, 0.025), z0: z0 + 12, z1: z0 + 16, color: 0xffd166, glow: 0.5, noEdge: true });
  if (level >= 2) {
    s.push({ foot: rect(0.5, 0.18, 0.34, 0.05), z0: z0 + 1, z1: z0 + 10, color: STEEL_DARK, taper: 0.9 });
    s.push({ foot: rect(0.5, 0.82, 0.34, 0.05), z0: z0 + 1, z1: z0 + 10, color: STEEL_DARK, taper: 0.9 });
  }
  return s;
}

/** Cabeza de hielo: racimo de cristales azules, tubos de refrigerante y boca ancha escarchada. */
function frostHead(level: number): Solid[] {
  const z0 = 20;
  const ICE = 0x9be7ff;
  const s: Solid[] = [];
  s.push({ foot: chamfer(0.44, 0.5, 0.46, 0.4, 0.1), z0, z1: z0 + 9, color: 0x6a8aa8, taper: 0.93 });
  // Racimo de cristales (pirámides altas).
  const crystals: [number, number, number][] = [[0.3, 0.5, 22], [0.22, 0.36, 15], [0.22, 0.64, 16], [0.36, 0.3, 11], [0.36, 0.7, 12]];
  crystals.slice(0, 3 + level).forEach(([x, y, h], i) => s.push({ foot: chamfer(x, y, 0.13, 0.13, 0.03), z0: z0 + 8, z1: z0 + 8 + h, color: i % 2 ? 0x7fd8ff : ICE, taper: 0.25, glow: 0.25 }));
  // Tubos de refrigerante.
  s.push({ foot: rect(0.55, 0.36, 0.3, 0.035), z0: z0 + 8, z1: z0 + 12, color: 0xd8f4ff, noEdge: true });
  s.push({ foot: rect(0.55, 0.64, 0.3, 0.035), z0: z0 + 8, z1: z0 + 12, color: 0xd8f4ff, noEdge: true });
  // Boca ancha con escarcha.
  s.push(...barrel(0.6, 0.92, 0.5, z0 + 6, 0.07, STEEL));
  s.push({ foot: chamfer(0.98, 0.5, 0.12, 0.28, 0.03), z0: z0 + 1, z1: z0 + 12, color: 0x6a8aa8, taper: 0.92 });
  s.push({ foot: rect(1.04, 0.5, 0.02, 0.2), z0: z0 + 3, z1: z0 + 10, color: 0xe6fbff, glow: 0.5, noEdge: true });
  if (level >= 2) {
    s.push({ foot: rect(0.46, 0.18, 0.32, 0.05), z0: z0 + 1, z1: z0 + 11, color: STEEL_DARK, taper: 0.9 });
    s.push({ foot: rect(0.46, 0.82, 0.32, 0.05), z0: z0 + 1, z1: z0 + 11, color: STEEL_DARK, taper: 0.9 });
  }
  return s;
}

export function turretModel(kind: TurretLook, level: number): TurretModel {
  const lv = Math.max(1, Math.min(3, level));
  switch (kind) {
    case 'turret_bullet':
      return { base: platform(BRASS, lv), head: bulletHead(lv) };
    case 'turret_laser':
      return { base: platform(0xd94fd9, lv), head: laserHead(lv) };
    case 'turret_fire':
      return { base: platform(0xe8572a, lv), head: fireHead(lv) };
    case 'turret_frost':
      return { base: platform(0x7fd8ff, lv), head: frostHead(lv) };
  }
}

/** Rumbo (radianes, 0 = +x del mapa) del índice de cabeza `i`. */
export const headYaw = (i: number) => (i / HEAD_STEPS) * Math.PI * 2;
/** Índice de cabeza más cercano a un ángulo. */
export function headIndex(yaw: number): number {
  const t = ((yaw / (Math.PI * 2)) % 1 + 1) % 1;
  return Math.round(t * HEAD_STEPS) % HEAD_STEPS;
}

export const turretBaseKey = (kind: TurretLook, level: number) => `tbase_${kind}_${level}`;
export const turretHeadKey = (kind: TurretLook, level: number, i: number) => `thead_${kind}_${level}_${i}`;

/** Tamaño y punto de anclaje (esquina (0,0,0) de la casilla) de las texturas de torreta. */
export const TURRET_CANVAS = { w: 128, h: 128, ox: 64, oy: 80 };

/** Dibuja base y/o cabeza de un modelo en un contexto 2D (compartido por el juego y la galería). */
export function drawTurretParts(ctx: CanvasRenderingContext2D, x: number, y: number, model: TurretModel, yaw: number, what: 'base' | 'head' | 'both' = 'both'): void {
  const pr = { ox: x + TURRET_CANVAS.ox, oy: y + TURRET_CANVAS.oy };
  if (what !== 'head') drawSolids(ctx, pr, model.base, 0);
  if (what !== 'base') drawSolids(ctx, pr, model.head, yaw);
}
