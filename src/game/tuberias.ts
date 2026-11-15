/**
 * Redes de tuberías (lógica pura). Una red es un conjunto de tuberías unidas entre sí (una vierte en la siguiente) con los
 * puertos de edificios que tocan. Una red transporta **un solo líquido**: aquí se calcula cuáles lleva cada una, dónde se
 * mezclan dos y si una tubería nueva uniría dos redes de líquidos distintos (en ese caso se impide y se explica).
 */
import { CONFIG } from './config';
import { portsAt } from './conectar';
import type { Building, Game } from './game';
import { FLOW_NAMES, PortFlow } from './puertos';
import { DX, DY, Dir, ItemId, opposite } from './types';

export interface PipeNet {
  pipes: Building[];
  /** Líquidos que pide o da algún puerto de la red, o que ya lleva dentro. */
  flows: Set<PortFlow>;
}

const key = (x: number, y: number) => `${x},${y}`;

/** Líquido (o líquidos) que aporta una tubería en (x,y) mirando a `dir`: puertos que le dan o que alimenta, y lo que lleva. */
function localFlows(g: Game, x: number, y: number, dir: Dir, content?: Building): Set<PortFlow> {
  const out = new Set<PortFlow>();
  for (const { port } of portsAt(g, x, y)) {
    if (port.medium !== 'liquid') continue;
    if (port.io === 'out' ? dir !== opposite(port.dir) : port.dir === dir) out.add(port.flow);
  }
  if (content) for (const k of Object.keys(content.inv)) if ((content.inv[k as ItemId] ?? 0) > 0) out.add(k as PortFlow);
  return out;
}

/** Tuberías vecinas unidas a la de (x,y,dir): la que vierte en ella y aquella en la que vierte. */
function linkedPipes(g: Game, x: number, y: number, dir: Dir): Building[] {
  const res: Building[] = [];
  const front = g.buildingAt(x + DX[dir], y + DY[dir]);
  if (front?.kind === 'pipeline' && front.built && front.dir !== opposite(dir)) res.push(front);
  for (let k = 0; k < 4; k++) {
    const n = g.buildingAt(x + DX[k], y + DY[k]);
    if (n?.kind === 'pipeline' && n.built && n.dir === opposite(k as Dir) && !res.includes(n)) res.push(n);
  }
  return res;
}

/** Todas las redes de tuberías del mapa. */
export function pipeNetworks(g: Game): PipeNet[] {
  const pipes = [...g.buildings.values()].filter((b) => b.kind === 'pipeline' && b.built);
  const seen = new Set<number>();
  const nets: PipeNet[] = [];
  for (const start of pipes) {
    if (seen.has(start.id)) continue;
    const net: PipeNet = { pipes: [], flows: new Set() };
    const stack = [start];
    seen.add(start.id);
    while (stack.length) {
      const p = stack.pop()!;
      net.pipes.push(p);
      for (const f of localFlows(g, p.x, p.y, p.dir, p)) net.flows.add(f);
      for (const n of linkedPipes(g, p.x, p.y, p.dir)) {
        if (!seen.has(n.id)) {
          seen.add(n.id);
          stack.push(n);
        }
      }
    }
    nets.push(net);
  }
  return nets;
}

const names = (fs: Iterable<PortFlow>) => [...fs].map((f) => FLOW_NAMES[f]).join(' y ');

/** Redes que mezclan más de un líquido (con el mensaje para el jugador). */
export function pipeConflicts(g: Game): { net: PipeNet; message: string }[] {
  return pipeNetworks(g)
    .filter((n) => n.flows.size > 1)
    .map((net) => ({ net, message: `Esta red mezcla ${names(net.flows)}: una red de tuberías transporta un solo líquido. Sepáralas con un hueco o con otro recorrido` }));
}

/** Si una tubería nueva en (x,y) mirando a `dir` uniría líquidos distintos, el motivo; si no, null. */
export function pipeJoinConflict(g: Game, x: number, y: number, dir: Dir): string | null {
  const flows = localFlows(g, x, y, dir);
  // El edificio de enfrente también aporta su tipo si esta tubería le entra.
  const linked = linkedPipes(g, x, y, dir);
  if (linked.length) {
    const nets = pipeNetworks(g);
    for (const n of linked) for (const f of nets.find((m) => m.pipes.includes(n))?.flows ?? []) flows.add(f);
  }
  if (flows.size <= 1) return null;
  return `Esta tubería uniría ${names(flows)}: una red de tuberías transporta un solo líquido`;
}

/** Capacidad de una tubería (unidades de líquido) y caudal (unidades por segundo): de `CONFIG.pipe`. */
export const pipeCapacity = (): number => CONFIG.pipe.cap;
export const pipeRate = (): number => CONFIG.pipe.rate;
