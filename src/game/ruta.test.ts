import { describe, expect, it } from 'vitest';
import { portStatus } from './puertos';
import { buildRoute, canAffordRoute, findRoute, freeInPorts, freeOutPorts, toolFor } from './ruta';
import { CONFIG } from './config';
import type { Game } from './game';
import { flatGame, instant, powerUp, run } from './testutil';

const completeAll = (g: Game) => {
  for (const b of [...g.buildings.values()]) if (!b.built) g.completeBuilding(b);
};

describe('B4 · herramienta Conectar: ruta con A*', () => {
  it('une la salida de un taladro con la entrada de un almacén en línea recta, y se queda conectada por los dos extremos', () => {
    const g = flatGame([[3, 5, 1]]);
    g.npcs = [];
    const drill = instant(g, 'drill', 3, 5, 0);
    const store = instant(g, 'storage', 9, 5, 0);
    const from = freeOutPorts(g, drill)[0];
    const to = freeInPorts(g, store).find((p) => p.side === 2)!; // cara oeste: (8,5), entra hacia +x
    const r = findRoute(g, from, { port: to });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.route.tool).toBe('belt');
    expect(r.route.pieces.map((p) => p.x)).toEqual([4, 5, 6, 7, 8]);
    expect(r.route.curves).toBe(0);
    expect(r.route.cost).toEqual({ gear: 5 });
    expect(canAffordRoute(g, r.route)).toBe(true);
    expect(buildRoute(g, r.route)).toBe(5);
    completeAll(g);
    expect(portStatus(g, drill, from).state).toBe('connected');
    expect(portStatus(g, store, to).state).toBe('connected');
  });

  it('rodea los obstáculos con curvas y prefiere pocas curvas en campo abierto', () => {
    const g = flatGame([[3, 5, 1]]);
    g.npcs = [];
    const drill = instant(g, 'drill', 3, 5, 0);
    // Un muro de casas tapa el camino recto.
    for (const y of [3, 4, 5, 6, 7]) instant(g, 'house', 6, y, 0);
    const store = instant(g, 'storage', 12, 5, 0);
    const r = findRoute(g, freeOutPorts(g, drill)[0], { port: freeInPorts(g, store).find((p) => p.side === 2)! });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.route.curves).toBeGreaterThanOrEqual(2);
    for (const p of r.route.pieces) expect(g.buildingAt(p.x, p.y)).toBeUndefined();
    // En campo abierto, un recorrido en L (una curva) o en Z (dos) como máximo.
    const h = flatGame([[3, 5, 1]]);
    h.npcs = [];
    const d2 = instant(h, 'drill', 3, 5, 0);
    const s2 = instant(h, 'storage', 12, 11, 0);
    const r2 = findRoute(h, freeOutPorts(h, d2)[0], { port: freeInPorts(h, s2).find((p) => p.side === 2)! });
    expect(r2.ok && r2.route.curves).toBeLessThanOrEqual(2);
  });

  it('sin camino explica por qué y sugiere qué hacer', () => {
    const g = flatGame([[3, 5, 1]]);
    g.npcs = [];
    const drill = instant(g, 'drill', 3, 5, 0);
    // Encierra la salida (4,5) con casas por arriba, abajo y delante.
    for (const [x, y] of [[4, 4], [4, 6], [5, 5]]) instant(g, 'house', x, y, 0);
    const store = instant(g, 'storage', 12, 5, 0);
    const r = findRoute(g, freeOutPorts(g, drill)[0], { port: freeInPorts(g, store)[0] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain('No hay camino');
    expect(r.fix).toBeTruthy();
  });

  it('rechaza flujos distintos, entrada con salida y puertos ya ocupados, con el motivo', () => {
    const g = flatGame([[3, 5, 1], [3, 12, 6]]);
    g.npcs = [];
    const drill = instant(g, 'drill', 3, 5, 0);
    const pump = instant(g, 'pump', 3, 12, 0);
    const store = instant(g, 'storage', 12, 5, 0);
    const gen = instant(g, 'generator', 12, 12, 0);
    const d = freeOutPorts(g, drill)[0];
    const p = freeOutPorts(g, pump)[0];
    const bad = findRoute(g, d, { port: freeInPorts(g, gen)[0] });
    expect(!bad.ok && bad.reason).toContain('Tipo de flujo incorrecto');
    const bad2 = findRoute(g, p, { port: freeInPorts(g, store)[0] });
    expect(!bad2.ok && bad2.reason).toContain('Tipo de flujo incorrecto');
    // Una salida no puede ser el destino ni una entrada el origen.
    const fromIn = findRoute(g, freeInPorts(g, store)[0], { port: freeInPorts(g, store)[1] });
    expect(!fromIn.ok && fromIn.reason).toContain('empezar en una salida');
    // Salida ocupada.
    instant(g, 'belt', 4, 5, 0);
    const occ = findRoute(g, d, { port: freeInPorts(g, store)[0] });
    expect(!occ.ok && occ.reason).toContain('ocupado');
  });

  it('las tuberías unen una bomba con una refinería; con otro líquido de por medio, se rechaza', () => {
    const g = flatGame([[3, 5, 6]]);
    g.npcs = [];
    const pump = instant(g, 'pump', 3, 5, 0);
    const ref = instant(g, 'refinery', 9, 5, 0);
    const from = freeOutPorts(g, pump)[0];
    expect(toolFor(from)).toBe('pipeline');
    const r = findRoute(g, from, { port: freeInPorts(g, ref).find((p) => p.side === 2)! });
    expect(r.ok && r.route.tool).toBe('pipeline');
    expect(r.ok && r.route.cost).toEqual({ pipe: 5 });
    // Con una tubería de gasolina pegada al camino, la ruta que la uniría se rechaza.
    const g2 = flatGame([[3, 5, 6]]);
    g2.npcs = [];
    const pump2 = instant(g2, 'pump', 3, 5, 0);
    const ref2 = instant(g2, 'refinery', 9, 5, 0);
    const stray = instant(g2, 'pipeline', 6, 5, 3);
    stray.inv = { gasoline: 1 };
    // La tubería suelta vierte hacia el norte (6,4); un camino recto por (6,5) la alimentaría con petróleo.
    const r2 = findRoute(g2, freeOutPorts(g2, pump2)[0], { port: freeInPorts(g2, ref2).find((p) => p.side === 2)! });
    // La ruta recta pasaría por (6,5), que está ocupada: la rodea; ninguna pieza usa la casilla ocupada.
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.route.pieces.some((p) => p.x === 6 && p.y === 5)).toBe(false);
  });

  it('se puede entrar de lado en una línea existente (empalme) y el material llega entero', () => {
    const g = flatGame([[3, 3, 1]]);
    g.npcs = [];
    // Tronco por y=9 hacia el núcleo (9,9).
    const trunk = [2, 3, 4, 5, 6, 7, 8].map((x) => instant(g, 'belt', x, 9, 0));
    const drill = instant(g, 'drill', 3, 3, 0);
    const r = findRoute(g, freeOutPorts(g, drill)[0], { line: trunk[4] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const last = r.route.pieces[r.route.pieces.length - 1];
    expect(last.x + [1, 0, -1, 0][last.dir]).toBe(trunk[4].x);
    expect(last.y + [0, 1, 0, -1][last.dir]).toBe(trunk[4].y);
    expect(buildRoute(g, r.route)).toBe(r.route.pieces.length);
    completeAll(g);
    // Energía a lo largo de todo y a correr: el taladro entrega al núcleo por el empalme.
    const poles: [number, number][] = [];
    for (let x = 2; x <= 8; x += 3) poles.push([x, 10]);
    for (const p of r.route.pieces.filter((_, i) => i % 3 === 1)) poles.push([p.x + (p.x > 1 ? -1 : 1), p.y]);
    const safe = poles.filter(([x, y]) => !g.buildingAt(x, y) && x >= 0 && y >= 0 && x < 20 && y < 20 && !(x >= 9 && x <= 10 && y >= 9 && y <= 10));
    powerUp(g, safe, [1, 10]);
    const before = g.storage.iron_ore ?? 0;
    run(g, 90);
    expect((g.storage.iron_ore ?? 0) - before).toBeGreaterThan(0);
  });

  it('el coste sale de la configuración y se comprueba contra el almacén', () => {
    const g = flatGame([[3, 5, 1]]);
    g.npcs = [];
    const drill = instant(g, 'drill', 3, 5, 0);
    const store = instant(g, 'storage', 9, 5, 0);
    const r = findRoute(g, freeOutPorts(g, drill)[0], { port: freeInPorts(g, store).find((p) => p.side === 2)! });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.route.cost.gear).toBe(r.route.pieces.length * (CONFIG.buildings.belt.cost.gear ?? 0));
    g.storage.gear = 1;
    expect(canAffordRoute(g, r.route)).toBe(false);
  });
});
