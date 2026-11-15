import { describe, expect, it } from 'vitest';
import { isLineTool, portsAt, previewLine, snapDir } from './conectar';
import { flatGame, instant } from './testutil';

describe('B2 · encaje magnético y comprobación de extremos', () => {
  it('junto a la salida de un taladro la cinta se orienta sola y el extremo de atrás sale verde', () => {
    const g = flatGame([[5, 5, 1]]);
    g.npcs = [];
    instant(g, 'drill', 5, 5, 0);
    expect(portsAt(g, 6, 5)).toHaveLength(1);
    // Mirando al lado contrario, el imán la gira hacia el sentido de la salida.
    expect(snapDir(g, 'belt', 6, 5, 2)).toBe(0);
    expect(snapDir(g, 'belt', 6, 5, 0)).toBeNull(); // ya está bien
    expect(snapDir(g, 'belt', 12, 12, 1)).toBeNull(); // lejos de todo
    const p = previewLine(g, 'belt', 6, 5, 0);
    expect(p.tail.state).toBe('ok');
    expect(p.head.state).toBe('open');
    expect(p.head.reason).toContain('vacío');
  });

  it('una tubería junto a un puerto de sólidos no se imanta y su extremo sale en rojo con el motivo', () => {
    const g = flatGame([[5, 5, 1]]);
    g.npcs = [];
    instant(g, 'drill', 5, 5, 0);
    expect(snapDir(g, 'pipeline', 6, 5, 2)).toBeNull();
    const p = previewLine(g, 'pipeline', 6, 5, 0);
    expect(p.tail.state).toBe('error');
    expect(p.tail.reason).toContain('Tipo de flujo incorrecto');
    expect(p.tail.reason).toContain('sólidos');
  });

  it('delante de una entrada compatible sale verde; de una salida, de otro tipo o de una cara sin entrada, rojo', () => {
    const g = flatGame();
    g.npcs = [];
    instant(g, 'factory', 8, 8, 0); // sólo entra material por las caras oeste, norte (y) y sur; la salida es la este
    // Casilla (7,8) apuntando al este (+x): entra en la fábrica por su cara oeste.
    expect(previewLine(g, 'belt', 7, 8, 0).head.state).toBe('ok');
    // Por la cara de la salida (9,8) apuntando al oeste: salida con salida.
    const out = previewLine(g, 'belt', 9, 8, 2);
    expect(out.head.state).toBe('error');
    expect(out.head.reason).toContain('Salida con salida');
    // Tubería hacia una entrada de sólidos.
    const t = previewLine(g, 'pipeline', 7, 8, 0);
    expect(t.head.state).toBe('error');
    expect(t.head.reason).toContain('Tipo de flujo incorrecto');
    // Una casilla que no es puerto de nadie: el edificio de enfrente no tiene entrada por ahí.
    instant(g, 'storage', 14, 14, 0);
    const w = previewLine(g, 'belt', 14, 14, 0);
    expect(w.head.state).toBe('open');
  });

  it('el líquido: bomba → tubería sale verde por detrás; con una cinta, rojo', () => {
    const g = flatGame([[3, 3, 6]]);
    g.npcs = [];
    instant(g, 'pump', 3, 3, 0);
    expect(previewLine(g, 'pipeline', 4, 3, 0).tail.state).toBe('ok');
    expect(snapDir(g, 'pipeline', 4, 3, 1)).toBe(0);
    expect(previewLine(g, 'belt', 4, 3, 0).tail.state).toBe('error');
  });

  it('un puerto con la salida girada a un lado: la pieza se imanta y el que alimenta cuenta aunque no esté detrás', () => {
    const g = flatGame([[5, 5, 1]]);
    g.npcs = [];
    instant(g, 'drill', 5, 5, 0);
    // La casilla de salida (6,5) con la cinta girando hacia el sur: el taladro la alimenta de lado.
    const p = previewLine(g, 'belt', 6, 5, 1);
    expect(p.tail.state).toBe('ok');
  });

  it('puerto ocupado: la casilla de un puerto que ya tiene una pieza se avisa', () => {
    const g = flatGame([[5, 5, 1]]);
    g.npcs = [];
    instant(g, 'drill', 5, 5, 0);
    expect(previewLine(g, 'belt', 6, 5, 0).occupied).toBeNull();
    instant(g, 'belt', 6, 5, 0);
    expect(previewLine(g, 'belt', 6, 5, 0).occupied).toContain('ocupado');
  });

  it('contra otra línea: sentido contrario es rojo, mismo sentido verde, mezclar cinta y tubería rojo', () => {
    const g = flatGame();
    g.npcs = [];
    const b = instant(g, 'belt', 6, 6, 0);
    expect(previewLine(g, 'belt', 5, 6, 0).head.state).toBe('ok');
    b.dir = 2;
    expect(previewLine(g, 'belt', 5, 6, 0).head.reason).toContain('Sentido contrario');
    b.dir = 0;
    instant(g, 'pipeline', 5, 9, 0);
    expect(previewLine(g, 'belt', 4, 9, 0).head.state).toBe('error');
    expect(previewLine(g, 'pipeline', 4, 9, 0).head.state).toBe('ok');
  });

  it('isLineTool reconoce las tres piezas de línea', () => {
    expect(['belt', 'belt_fast', 'pipeline', 'drill', null].map(isLineTool)).toEqual([true, true, true, false, false]);
  });
});
