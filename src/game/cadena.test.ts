import { describe, expect, it } from 'vitest';
import { chainOf } from './cadena';
import { buildRoute, findRoute, freeInPorts, freeOutPorts } from './ruta';
import { flatGame, instant } from './testutil';
import type { Game } from './game';
import { makeSave, gameFromSave } from './savegame';
import { portStatus, ports } from './puertos';
import { pipeNetworks } from './tuberias';

const completeAll = (g: Game) => {
  for (const b of [...g.buildings.values()]) if (!b.built) g.completeBuilding(b);
};

describe('B5 · cadenas logísticas', () => {
  it('desde un taladro se ve su cinta y el almacén; desde el almacén, la cinta y el taladro', () => {
    const g = flatGame([[3, 5, 1]]);
    g.npcs = [];
    const drill = instant(g, 'drill', 3, 5, 0);
    const store = instant(g, 'storage', 9, 5, 0);
    const r = findRoute(g, freeOutPorts(g, drill)[0], { port: freeInPorts(g, store).find((p) => p.side === 2)! });
    if (!r.ok) throw new Error(r.reason);
    buildRoute(g, r.route);
    completeAll(g);
    const down = chainOf(g, drill);
    expect(down.lines).toHaveLength(5);
    expect(down.buildings.map((b) => b.kind)).toEqual(['storage']);
    const up = chainOf(g, store);
    expect(up.lines).toHaveLength(5);
    expect(up.buildings.map((b) => b.kind)).toEqual(['drill']);
    // Un edificio sin conexiones tiene la cadena vacía.
    const lonely = instant(g, 'house', 14, 14, 0);
    expect(chainOf(g, lonely)).toEqual({ lines: [], buildings: [] });
  });

  it('con un empalme, la cadena del almacén incluye los dos ramales', () => {
    const g = flatGame([[3, 3, 1], [3, 12, 1]]);
    g.npcs = [];
    const store = instant(g, 'storage', 12, 8, 0);
    const a = instant(g, 'drill', 3, 3, 0);
    const b = instant(g, 'drill', 3, 12, 0);
    const west = freeInPorts(g, store).find((p) => p.side === 2)!;
    const r1 = findRoute(g, freeOutPorts(g, a)[0], { port: west });
    if (!r1.ok) throw new Error(r1.reason);
    buildRoute(g, r1.route);
    completeAll(g);
    const trunk = g.buildingAt(r1.route.pieces[Math.floor(r1.route.pieces.length / 2)].x, r1.route.pieces[Math.floor(r1.route.pieces.length / 2)].y)!;
    const r2 = findRoute(g, freeOutPorts(g, b)[0], { line: trunk });
    if (!r2.ok) throw new Error(r2.reason);
    buildRoute(g, r2.route);
    completeAll(g);
    const c = chainOf(g, store);
    expect(c.buildings.map((x) => x.kind).sort()).toEqual(['drill', 'drill']);
    expect(c.lines.length).toBe(r1.route.pieces.length + r2.route.pieces.length);
  });

  it('guardar y cargar conserva puertos, conexiones y redes (todo se deriva del estado de los edificios)', () => {
    const g = flatGame([[3, 5, 6]]);
    g.npcs = [];
    const pump = instant(g, 'pump', 3, 5, 0);
    const ref = instant(g, 'refinery', 9, 5, 0);
    const r = findRoute(g, freeOutPorts(g, pump)[0], { port: freeInPorts(g, ref).find((p) => p.side === 2)! });
    if (!r.ok) throw new Error(r.reason);
    buildRoute(g, r.route);
    completeAll(g);
    const h = gameFromSave(JSON.parse(JSON.stringify(makeSave(g, 1))));
    const pump2 = [...h.buildings.values()].find((b) => b.kind === 'pump')!;
    expect(portStatus(h, pump2, ports('pump', pump2.x, pump2.y, pump2.dir)[0]).state).toBe('connected');
    expect(pipeNetworks(h)).toHaveLength(1);
    expect(pipeNetworks(h)[0].pipes).toHaveLength(r.route.pieces.length);
    expect([...pipeNetworks(h)[0].flows]).toEqual(['oil']);
  });
});
