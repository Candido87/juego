import { describe, expect, it } from 'vitest';
import { flatGame, instant } from './testutil';
import { pipeConflicts, pipeJoinConflict, pipeNetworks } from './tuberias';

describe('B3 · redes de tuberías con un solo líquido', () => {
  it('una bomba, su tubería y la refinería forman una red de petróleo', () => {
    const g = flatGame([[3, 3, 6]]);
    g.npcs = [];
    instant(g, 'pump', 3, 3, 0);
    for (const x of [4, 5, 6]) instant(g, 'pipeline', x, 3, 0);
    instant(g, 'refinery', 7, 3, 0);
    const nets = pipeNetworks(g);
    expect(nets).toHaveLength(1);
    expect(nets[0].pipes).toHaveLength(3);
    expect([...nets[0].flows]).toEqual(['oil']);
    expect(pipeConflicts(g)).toHaveLength(0);
  });

  it('dos tramos separados son dos redes, cada una con su líquido', () => {
    const g = flatGame([[3, 3, 6]]);
    g.npcs = [];
    instant(g, 'pump', 3, 3, 0);
    instant(g, 'pipeline', 4, 3, 0);
    instant(g, 'refinery', 8, 8, 0); // sale gasolina hacia el este (9,8)
    instant(g, 'pipeline', 9, 8, 0);
    instant(g, 'generator', 10, 8, 0);
    const nets = pipeNetworks(g);
    expect(nets).toHaveLength(2);
    expect(nets.map((n) => [...n.flows].sort().join())).toEqual(expect.arrayContaining(['oil', 'gasoline']));
  });

  it('una tubería que uniría petróleo con gasolina se rechaza y dice qué mezclaría', () => {
    const g = flatGame([[3, 3, 6]]);
    g.npcs = [];
    instant(g, 'pump', 3, 3, 0);
    instant(g, 'pipeline', 4, 3, 0);
    instant(g, 'refinery', 6, 3, 1); // mira al sur: sale gasolina por (6,4); entra petróleo por oeste/norte/este
    instant(g, 'pipeline', 6, 4, 1);
    // Tubería en (5,3) hacia el este: recibe el petróleo de (4,3) y entra en la refinería: red de petróleo, sin conflicto.
    expect(pipeJoinConflict(g, 5, 3, 0)).toBeNull();
    // Tubería en (5,4) hacia el este: no recibe del petróleo (la de (4,3) apunta al este, a (5,3)) y vierte en (6,4) (gasolina): sin conflicto.
    expect(pipeJoinConflict(g, 5, 4, 0)).toBeNull();
    // Tubería en (5,3) hacia el sur vierte en (5,4)... construida antes: une petróleo con lo que haya delante.
    instant(g, 'pipeline', 5, 4, 0); // gasolina: vierte en (6,4)
    const c = pipeJoinConflict(g, 5, 3, 1); // recibe petróleo de (4,3) y vierte en (5,4), de gasolina
    expect(c).toContain('petróleo');
    expect(c).toContain('gasolina');
    expect(c).toContain('un solo líquido');
  });

  it('una red ya mezclada se detecta como conflicto con su mensaje', () => {
    const g = flatGame([[3, 3, 6]]);
    g.npcs = [];
    instant(g, 'pump', 3, 3, 0);
    const a = instant(g, 'pipeline', 4, 3, 0);
    const b = instant(g, 'pipeline', 5, 3, 0);
    a.inv = { oil: 1 };
    b.inv = { gasoline: 1 };
    const c = pipeConflicts(g);
    expect(c).toHaveLength(1);
    expect(c[0].net.pipes).toHaveLength(2);
    expect(c[0].message).toContain('mezcla');
    expect(c[0].message).toContain('petróleo');
  });
});
