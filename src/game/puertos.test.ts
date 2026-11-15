import { describe, expect, it } from 'vitest';
import { BUILD_KINDS } from './types';
import { canLink, hasPorts, ports, portStatus, portsWithStatus } from './puertos';
import { flatGame, instant } from './testutil';

describe('T5 · puertos de entrada y salida', () => {
  it('taladro y granja sacan sólido por delante; la bomba, líquido', () => {
    expect(ports('drill', 5, 5, 0)).toEqual([{ x: 6, y: 5, dir: 0, io: 'out', medium: 'solid', flow: 'solid', side: 0 }]);
    expect(ports('farm', 5, 5, 1)[0]).toMatchObject({ x: 5, y: 6, io: 'out', medium: 'solid' });
    expect(ports('pump', 5, 5, 2)[0]).toMatchObject({ x: 4, y: 5, io: 'out', medium: 'liquid' });
  });

  it('la fábrica saca por delante y admite sólido por las otras tres caras, apuntando hacia ella', () => {
    const p = ports('factory', 5, 5, 0);
    expect(p.filter((q) => q.io === 'out')).toHaveLength(1);
    const ins = p.filter((q) => q.io === 'in');
    expect(ins).toHaveLength(3);
    expect(ins.every((q) => q.medium === 'solid')).toBe(true);
    // La entrada de atrás (4,5) apunta hacia la fábrica (+x = dir 0).
    expect(ins.find((q) => q.x === 4 && q.y === 5)?.dir).toBe(0);
    expect(ins.some((q) => q.x === 6 && q.y === 5)).toBe(false);
  });

  it('la refinería es líquida y el generador sólo admite líquido (gasolina)', () => {
    expect(ports('refinery', 5, 5, 3).every((q) => q.medium === 'liquid')).toBe(true);
    const g = ports('generator', 5, 5, 0);
    expect(g).toHaveLength(4);
    expect(g.every((q) => q.io === 'in' && q.medium === 'liquid')).toBe(true);
  });

  it('las torretas de munición admiten sólido; las eléctricas y las cintas no tienen puertos', () => {
    expect(ports('turret_bullet', 5, 5, 0)).toHaveLength(4);
    expect(hasPorts('turret_laser')).toBe(false);
    expect(hasPorts('belt')).toBe(false);
    expect(hasPorts('pipeline')).toBe(false);
  });

  it('cada edificio devuelve una lista (nunca falla)', () => {
    for (const k of BUILD_KINDS) expect(Array.isArray(ports(k, 3, 3, 0))).toBe(true);
  });
});

describe('B1 · puertos tipados: flujo, lado y estado', () => {
  it('cada puerto lleva su tipo de flujo y el lado de la huella por el que está', () => {
    expect(ports('pump', 5, 5, 1)[0]).toMatchObject({ flow: 'oil', medium: 'liquid', side: 1 });
    const r = ports('refinery', 5, 5, 0);
    expect(r.find((q) => q.io === 'out')).toMatchObject({ flow: 'gasoline', side: 0 });
    expect(r.filter((q) => q.io === 'in').every((q) => q.flow === 'oil')).toBe(true);
    expect(ports('generator', 5, 5, 0).every((q) => q.flow === 'gasoline' && q.io === 'in')).toBe(true);
    // El lado es la dirección del edificio a la casilla del puerto.
    for (const q of ports('factory', 5, 5, 0)) expect([q.x - 5, q.y - 5]).toEqual([[1, 0, -1, 0][q.side], [0, 1, 0, -1][q.side]]);
  });

  it('una salida sólo se une a una entrada del mismo flujo, y dice por qué no si no', () => {
    const [drillOut] = ports('drill', 5, 5, 0);
    const factoryIn = ports('factory', 8, 5, 0).find((q) => q.io === 'in')!;
    expect(canLink(drillOut, factoryIn)).toEqual({ ok: true });
    const [pumpOut] = ports('pump', 2, 2, 0);
    const genIn = ports('generator', 8, 8, 0)[0];
    const refIn = ports('refinery', 8, 2, 0).find((q) => q.io === 'in')!;
    expect(canLink(pumpOut, refIn)).toEqual({ ok: true });
    const bad = canLink(pumpOut, genIn);
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.reason).toContain('petróleo');
    expect(!bad.ok && bad.reason).toContain('gasolina');
    expect(canLink(drillOut, refIn).ok).toBe(false);
    const o = canLink(drillOut, ports('drill', 9, 9, 0)[0]);
    expect(!o.ok && o.reason).toContain('Salida con salida');
    const i = canLink(factoryIn, factoryIn);
    expect(!i.ok && i.reason).toContain('Entrada con entrada');
    const rev = canLink(factoryIn, drillOut);
    expect(!rev.ok && rev.reason).toContain('Sentido contrario');
  });

  it('estado libre, conectado y error por sentido contrario en una salida de sólidos', () => {
    const g = flatGame([[5, 5, 1]]);
    g.npcs = [];
    const d = instant(g, 'drill', 5, 5, 0);
    const [p] = ports('drill', 5, 5, 0);
    expect(portStatus(g, d, p).state).toBe('free');
    const belt = instant(g, 'belt', 6, 5, 0);
    expect(portStatus(g, d, p).state).toBe('connected');
    belt.dir = 1; // gira hacia un lado: sigue conectada (la cinta hace una curva)
    expect(portStatus(g, d, p).state).toBe('connected');
    belt.dir = 2; // va hacia el taladro
    const s = portStatus(g, d, p);
    expect(s.state).toBe('error');
    expect(s.reason).toContain('Sentido contrario');
    expect(s.fix).toBeTruthy();
  });

  it('una cinta en un puerto de líquido, o una tubería en uno de sólido, es error con su solución', () => {
    const g = flatGame([[3, 3, 6], [3, 8, 1]]);
    g.npcs = [];
    const pump = instant(g, 'pump', 3, 3, 0);
    instant(g, 'belt', 4, 3, 0);
    const a = portStatus(g, pump, ports('pump', 3, 3, 0)[0]);
    expect(a.state).toBe('error');
    expect(a.reason).toContain('no transporta líquidos');
    expect(a.fix).toContain('tubería');
    const drill = instant(g, 'drill', 3, 8, 0);
    instant(g, 'pipeline', 4, 8, 0);
    const b = portStatus(g, drill, ports('drill', 3, 8, 0)[0]);
    expect(b.state).toBe('error');
    expect(b.reason).toContain('no transporta sólidos');
  });

  it('entradas: conectada si la línea apunta al edificio, error si se aleja o no apunta', () => {
    const g = flatGame();
    g.npcs = [];
    const f = instant(g, 'factory', 8, 8, 0);
    const west = ports('factory', 8, 8, 0).find((q) => q.side === 2)!; // casilla (7,8), el flujo ha de ir a +x
    const belt = instant(g, 'belt', 7, 8, 0);
    expect(portStatus(g, f, west).state).toBe('connected');
    belt.dir = 2;
    expect(portStatus(g, f, west).reason).toContain('Sentido contrario');
    belt.dir = 1;
    expect(portStatus(g, f, west).reason).toContain('no apunta');
    expect(portsWithStatus(g, f).filter((x) => x.status.state === 'error')).toHaveLength(1);
  });

  it('una tubería con otro líquido en un puerto es error; el mismo líquido, conectado', () => {
    const g = flatGame();
    g.npcs = [];
    const gen = instant(g, 'generator', 8, 8, 0);
    const west = ports('generator', 8, 8, 0).find((q) => q.side === 2)!;
    const pipe = instant(g, 'pipeline', 7, 8, 0);
    pipe.inv = { oil: 1 };
    const e = portStatus(g, gen, west);
    expect(e.state).toBe('error');
    expect(e.reason).toContain('Petróleo');
    expect(e.reason).toContain('gasolina');
    pipe.inv = { gasoline: 1 };
    expect(portStatus(g, gen, west).state).toBe('connected');
  });

  it('bloqueado: salida con la línea llena y material pendiente', () => {
    const g = flatGame([[5, 5, 1]]);
    g.npcs = [];
    const d = instant(g, 'drill', 5, 5, 0);
    const belt = instant(g, 'belt', 6, 5, 0);
    const [p] = ports('drill', 5, 5, 0);
    belt.item = 'iron_ore';
    belt.beltProgress = 1;
    expect(portStatus(g, d, p).state).toBe('connected'); // la cinta llena pero el taladro no tiene nada que sacar
    d.out = { iron_ore: 2 };
    const s = portStatus(g, d, p);
    expect(s.state).toBe('blocked');
    expect(s.fix).toBeTruthy();
  });
});
