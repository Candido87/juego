/**
 * Puertos geométricos de las piezas de tubería del Factory Kit de Kenney (Hito 0 del encargo de desniveles).
 * Medidos sobre los .glb con `docs/tuberias/medidas-piezas.json` (extremos = anillos de brida) y comprobados por `tuberiasPiezas.test.ts`.
 *
 * Convenciones del archivo (iguales en todas las piezas, sin giro): Y arriba y base en y = 0; el eje del tubo está a **y = 0,5**; el origen
 * está en el centro de la pieza; las piezas "de plano vertical" (side, cross, junction) están dibujadas en el plano XY (z es el grosor) y las curvas
 * en el plano XZ. Brida: radio exterior 0,5, ancho 0,1; el hueco del tubo mide radio 0,338. Un puerto es la cara exterior de una brida:
 * posición del centro y dirección hacia fuera (unitaria); dos piezas encajan cuando sus puertos coinciden en posición y se miran (direcciones opuestas).
 */

export type V3 = readonly [number, number, number];

export interface PipePort {
  /** Centro de la cara exterior de la brida (unidades del archivo, pieza sin girar ni escalar). */
  pos: V3;
  /** Dirección hacia fuera de la pieza (vector unitario). */
  dir: V3;
}

export interface PipePiece {
  id: string;
  /** Ruta bajo `public/assets/3d/` sin extensión; la versión de cristal cambia `pipe-large` por `pipe-glass-large` y tiene la misma forma. */
  model: string;
  /** Caja envolvente medida: mínimo y máximo. */
  min: V3;
  max: V3;
  ports: readonly PipePort[];
  /** Qué hace la pieza, en palabras. */
  note: string;
}

/** Medidas comunes. */
export const PIPE_KIT = { axisY: 0.5, flangeR: 0.5, flangeW: 0.1, boreR: 0.338 } as const;

const s = Math.SQRT1_2;
const X: V3 = [1, 0, 0];
const NX: V3 = [-1, 0, 0];
const Y: V3 = [0, 1, 0];
const NY: V3 = [0, -1, 0];
const NZ: V3 = [0, 0, -1];

export const PIPE_PIECES: readonly PipePiece[] = [
  { id: 'recta', model: 'factory/pipe-large', min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5], ports: [{ pos: [-0.5, 0.5, 0], dir: NX }, { pos: [0.5, 0.5, 0], dir: X }], note: 'Tramo recto de 1 a lo largo de x.' },
  { id: 'larga', model: 'factory/pipe-large-long', min: [-1, 0, -0.5], max: [1, 1, 0.5], ports: [{ pos: [-1, 0.5, 0], dir: NX }, { pos: [1, 0.5, 0], dir: X }], note: 'Recta de 2 de largo (dos casillas).' },
  { id: 'bump', model: 'factory/pipe-large-bump', min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5], ports: [{ pos: [-0.5, 0.5, 0], dir: NX }, { pos: [0.5, 0.5, 0], dir: X }], note: 'Recta de 1 con un abultamiento (junta) en medio.' },
  { id: 'valvula', model: 'factory/pipe-large-valve', min: [-0.5, 0, -0.516], max: [0.5, 1, 0.5], ports: [{ pos: [-0.5, 0.5, 0], dir: NX }, { pos: [0.5, 0.5, 0], dir: X }], note: 'Recta de 1 con válvula (la rueda sobresale hacia -z).' },
  { id: 'lateral', model: 'factory/pipe-large-side', min: [-1, 0, -0.5], max: [1, 1.5, 0.5], ports: [{ pos: [-1, 0.5, 0], dir: NX }, { pos: [1, 0.5, 0], dir: X }, { pos: [0, 1.5, 0], dir: Y }], note: 'T en el plano XY: recta de 2 con una derivación hacia +y (arriba). Girada 90° sobre x es una T horizontal.' },
  { id: 'cruce', model: 'factory/pipe-large-cross', min: [-1, -0.5, -0.5], max: [1, 1.5, 0.5], ports: [{ pos: [-1, 0.5, 0], dir: NX }, { pos: [1, 0.5, 0], dir: X }, { pos: [0, 1.5, 0], dir: Y }, { pos: [0, -0.5, 0], dir: NY }], note: 'Cruce en el plano XY (x e y). Girado 90° sobre x es un cruce horizontal.' },
  { id: 'empalme', model: 'factory/pipe-large-junction', min: [-1.056, 0, -0.5], max: [1, 2.056, 0.5], ports: [{ pos: [-1, 0.5, 0], dir: NX }, { pos: [1, 0.5, 0], dir: X }, { pos: [-0.702, 1.702, 0], dir: [-s, s, 0] }], note: 'Empalme en Y: recta de 2 con una derivación a 45° (hacia -x y +y).' },
  { id: 'curva45', model: 'factory/pipe-large-curve', min: [-1.002, 0, -0.746], max: [0.5, 1, 0.5], ports: [{ pos: [0.5, 0.5, 0], dir: X }, { pos: [-0.649, 0.5, -0.393], dir: [-s, 0, -s] }], note: 'Curva de 45° en el plano XZ (el tubo gira 45°; no es un codo de 90°).' },
  { id: 'codo90', model: 'factory/pipe-large-bend', min: [-0.9, 0, -1.4], max: [1, 1, 0.5], ports: [{ pos: [1, 0.5, 0], dir: X }, { pos: [-0.4, 0.5, -1.4], dir: NZ }], note: 'Codo de 90° de radio amplio en el plano XZ: brazos de 1,4 hasta la esquina (-0,4; 0). Girado 90° sobre x o z es un codo vertical.' },
];

/** Misma forma con material de cristal (se ve el líquido): sustituye el prefijo. */
export const glassModel = (model: string): string => model.replace('factory/pipe-large', 'factory/pipe-glass-large');
