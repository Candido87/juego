/**
 * Puntos de conexión de cada edificio (lógica pura): dónde sale y dónde entra el material.
 * La vista dibuja una flecha en cada uno para que se vea dónde conectar cintas y tuberías.
 *
 * `x,y` es la casilla de FUERA del edificio donde debe ir la cinta o la tubería; `dir` es el sentido del flujo en esa
 * casilla (la salida se aleja del edificio; la entrada apunta hacia él).
 */
import { CONFIG } from './config';
import { BuildingKind, DX, DY, Dir, ItemId, opposite } from './types';

export type PortMedium = 'solid' | 'liquid';
export interface Port {
  x: number;
  y: number;
  dir: Dir;
  io: 'in' | 'out';
  medium: PortMedium;
}

const DIRS: Dir[] = [0, 1, 2, 3];

/** Puertos de un edificio de 1×1 en (x,y) mirando a `dir`. Cintas y tuberías no tienen (ellas son la conexión). */
export function ports(kind: BuildingKind, x: number, y: number, dir: Dir): Port[] {
  const out = (medium: PortMedium): Port => ({ x: x + DX[dir], y: y + DY[dir], dir, io: 'out', medium });
  const side = (k: Dir, medium: PortMedium): Port => ({ x: x + DX[k], y: y + DY[k], dir: opposite(k), io: 'in', medium });
  const inputs = (medium: PortMedium, skipFront: boolean) => DIRS.filter((k) => !skipFront || k !== dir).map((k) => side(k, medium));
  switch (kind) {
    case 'drill':
    case 'farm':
      return [out('solid')];
    case 'pump':
      return [out('liquid')];
    case 'factory':
      return [out('solid'), ...inputs('solid', true)];
    case 'refinery':
      return [out('liquid'), ...inputs('liquid', true)];
    case 'storage':
      return inputs('solid', false);
    default: {
      const gen = CONFIG.power.generators[kind as keyof typeof CONFIG.power.generators];
      if (gen?.fuel) return inputs('liquid', false);
      const t = (CONFIG.turrets as Record<string, { ammo?: ItemId }>)[kind];
      if (t?.ammo) return inputs('solid', false);
      return [];
    }
  }
}

/** ¿Tiene el edificio puertos que mostrar? */
export const hasPorts = (kind: BuildingKind): boolean => ports(kind, 0, 0, 0).length > 0;
