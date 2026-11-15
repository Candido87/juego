/**
 * Paleta de la vista 3D (datos puros, con test).
 * El Nature Kit no trae textura: cada material lleva un color propio y su hierba es turquesa.
 * Aquí se sustituyen por nombre de material para que el terreno sea verde y combine con los otros packs.
 */
import { Ore } from '../game/types';

/** Color (sRGB) por nombre de material del Nature Kit. Los que no aparecen se dejan como vienen. */
export const NATURE_PALETTE: Record<string, number> = {
  grass: 0x7cc04a,
  leafsGreen: 0x4f9e3c,
  leafsDark: 0x2f7d3a,
  leafsFall: 0xd98a32,
  dirt: 0xb07a4a,
  dirtDark: 0x8a5a36,
  woodBark: 0x8a5a3a,
  woodBarkDark: 0x6c442c,
  wood: 0xb47a4a,
  woodDark: 0x8c5a36,
  woodInner: 0xe2c79e,
  woodBirch: 0xe9e1d0,
  stone: 0xa9afb6,
  stoneDark: 0x80878f,
  water: 0x4aa6d6,
};

/** Tinte del suelo (multiplica el verde de la hierba) según lo que hay en la casilla: marca las zonas de un vistazo. */
export const GROUND_TINT: Record<number, number> = {
  [Ore.None]: 0xffffff,
  [Ore.Iron]: 0xc9c2b4,
  [Ore.Copper]: 0xd9b48a,
  [Ore.Coal]: 0x9a9a8e,
  [Ore.Stone]: 0xd6d0bc,
  [Ore.Wood]: 0xc4e0b0,
  [Ore.Oil]: 0x8a8a78,
  [Ore.Sulfur]: 0xe6dc8c,
};

/** Color de las piedras que marcan cada yacimiento. */
export const ORE_COLOR: Record<number, number> = {
  [Ore.Iron]: 0xb9c6dc,
  [Ore.Copper]: 0xe0894a,
  [Ore.Coal]: 0x34343c,
  [Ore.Stone]: 0xe2ddcc,
  [Ore.Wood]: 0x6fbf5a,
  [Ore.Oil]: 0x1c1c26,
  [Ore.Sulfur]: 0xf0e04a,
};

/** Línea del contorno de objetos. */
export const OUTLINE_COLOR = 0x1a2030;

export const rgb = (hex: number): [number, number, number] => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];

/** Color del suelo de las zonas sin hierba: arena o tierra seca, y roca. */
export const ZONE_COLOR = { dry: 0xd9c27e, rock: 0x9aa1a8 };

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linear = (hex: number): [number, number, number] => rgb(hex).map((v) => toLinear(v / 255)) as [number, number, number];

/**
 * Multiplicador (en lineal, puede pasar de 1) que convierte el verde de la hierba en el color de la zona:
 * `dry` y `rock` son pesos 0..1. Con ambos a 0 devuelve [1, 1, 1].
 */
export function zoneMultiplier(dry: number, rock: number): [number, number, number] {
  const g = linear(NATURE_PALETTE.grass);
  const d = linear(ZONE_COLOR.dry);
  const r = linear(ZONE_COLOR.rock);
  return [0, 1, 2].map((i) => {
    let c = g[i] + (d[i] - g[i]) * dry;
    c += (r[i] - c) * rock;
    return c / g[i];
  }) as [number, number, number];
}
