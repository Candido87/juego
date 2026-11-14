/** Búsqueda de rutas en la cuadrícula (pura). */
import { DX, DY, Tile } from './types';

/**
 * BFS de 4 vecinos desde `start` hasta la primera casilla que cumpla `isGoal`.
 * Devuelve el camino sin incluir `start` ([] si ya está en la meta) o null si no hay ruta.
 * La casilla de salida no necesita ser transitable (un NPC puede estar dentro de una obra).
 */
export function bfsPath(
  w: number,
  h: number,
  start: Tile,
  isGoal: (x: number, y: number) => boolean,
  passable: (x: number, y: number) => boolean,
): Tile[] | null {
  if (isGoal(start.x, start.y)) return [];
  const prev = new Int32Array(w * h).fill(-2);
  const s = start.y * w + start.x;
  prev[s] = -1;
  const q = [s];
  for (let head = 0; head < q.length; head++) {
    const i = q[head];
    const x = i % w;
    const y = (i / w) | 0;
    for (let k = 0; k < 4; k++) {
      const nx = x + DX[k];
      const ny = y + DY[k];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (prev[ni] !== -2 || !passable(nx, ny)) continue;
      prev[ni] = i;
      if (isGoal(nx, ny)) {
        const path: Tile[] = [];
        for (let c = ni; c !== s; c = prev[c]) path.unshift({ x: c % w, y: (c / w) | 0 });
        return path;
      }
      q.push(ni);
    }
  }
  return null;
}

/**
 * Dijkstra desde varias fuentes con coste por casilla de entrada.
 * cost(x,y) = Infinity → intransitable. Devuelve distancias (Infinity si inalcanzable).
 */
export function dijkstra(
  w: number,
  h: number,
  sources: Tile[],
  cost: (x: number, y: number, fromX: number, fromY: number) => number,
): Float64Array {
  const dist = new Float64Array(w * h).fill(Infinity);
  const heap: [number, number][] = [];
  const push = (d: number, i: number) => {
    heap.push([d, i]);
    let c = heap.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (heap[p][0] <= heap[c][0]) break;
      [heap[p], heap[c]] = [heap[c], heap[p]];
      c = p;
    }
  };
  const pop = (): [number, number] => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let c = 0;
      for (;;) {
        const l = 2 * c + 1;
        const r = l + 1;
        let m = c;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === c) break;
        [heap[m], heap[c]] = [heap[c], heap[m]];
        c = m;
      }
    }
    return top;
  };
  for (const s of sources) {
    dist[s.y * w + s.x] = 0;
    push(0, s.y * w + s.x);
  }
  while (heap.length) {
    const [d, i] = pop();
    if (d > dist[i]) continue;
    const x = i % w;
    const y = (i / w) | 0;
    for (let k = 0; k < 4; k++) {
      const nx = x + DX[k];
      const ny = y + DY[k];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const c = cost(nx, ny, x, y);
      if (!isFinite(c)) continue;
      const ni = ny * w + nx;
      const nd = d + c;
      if (nd < dist[ni]) {
        dist[ni] = nd;
        push(nd, ni);
      }
    }
  }
  return dist;
}
