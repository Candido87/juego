/**
 * Cadena logística de un edificio (lógica pura): todo lo que le da material (aguas arriba) y todo lo que lo recibe (aguas
 * abajo) siguiendo cintas y tuberías a través de los puertos. La vista la resalta al pasar el ratón o seleccionar.
 */
import type { Building, Game } from './game';
import { ports } from './puertos';
import { DX, DY, opposite } from './types';

export interface Chain {
  /** Casillas de cinta o tubería de la cadena, con su sentido. */
  lines: { x: number; y: number; dir: number; liquid: boolean }[];
  /** Edificios de la cadena (sin contar el de partida). */
  buildings: Building[];
}

const isLine = (b: Building) => b.kind === 'belt' || b.kind === 'belt_fast' || b.kind === 'pipeline' || b.kind === 'elevator';
/** Tope de nodos recorridos (protege de redes enormes). */
const MAX_NODES = 600;

/** Aristas dirigidas del grafo logístico: línea → lo que tiene delante, y salida de edificio → línea pegada. */
function edges(g: Game): Map<number, number[]> {
  const out = new Map<number, number[]>();
  const add = (a: number, b: number) => {
    const l = out.get(a);
    if (l) l.push(b);
    else out.set(a, [b]);
  };
  for (const b of g.buildings.values()) {
    if (!b.built) continue;
    if (isLine(b)) {
      const f = g.buildingAt(b.x + DX[b.dir], b.y + DY[b.dir]);
      if (f && f.built && !(isLine(f) && f.dir === opposite(b.dir))) add(b.id, f.id);
    } else {
      for (const p of ports(b.kind, b.x, b.y, b.dir)) {
        if (p.io !== 'out') continue;
        const l = g.buildingAt(p.x, p.y);
        if (l && l.built && isLine(l) && l.dir !== opposite(p.dir)) add(b.id, l.id);
      }
    }
  }
  return out;
}

/** Cadena completa de `start`: ascendientes y descendientes en el grafo logístico. */
export function chainOf(g: Game, start: Building): Chain {
  const fwd = edges(g);
  const back = new Map<number, number[]>();
  for (const [a, bs] of fwd) for (const b of bs) (back.get(b) ?? back.set(b, []).get(b)!).push(a);
  const seen = new Set<number>([start.id]);
  for (const adj of [fwd, back]) {
    const stack = [start.id];
    while (stack.length && seen.size < MAX_NODES) {
      const id = stack.pop()!;
      for (const n of adj.get(id) ?? []) {
        if (seen.has(n)) continue;
        seen.add(n);
        // No se sigue a través de los edificios para no recorrer toda la base: se llega hasta ellos y se para.
        const nb = g.buildings.get(n);
        if (nb && isLine(nb)) stack.push(n);
      }
    }
  }
  const lines: Chain['lines'] = [];
  const buildings: Building[] = [];
  for (const id of seen) {
    if (id === start.id) continue;
    const b = g.buildings.get(id);
    if (!b) continue;
    if (isLine(b)) lines.push({ x: b.x, y: b.y, dir: b.dir, liquid: b.kind === 'pipeline' });
    else buildings.push(b);
  }
  return { lines, buildings };
}
