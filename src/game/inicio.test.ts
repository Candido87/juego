import { describe, expect, it } from 'vitest';
import { Game } from './game';
import { savedWhen, startMenu, startQuery, wantsMenu } from './inicio';
import { makeSave } from './savegame';

const save = (at: number, over = false) => {
  const g = new Game({ seed: 3 });
  g.gameOver = over;
  return makeSave(g, 3, at);
};

describe('menú principal', () => {
  it('sin partidas: nueva partida destacada y sin continuar ni cargar', () => {
    const m = startMenu({ manual: null, auto: null });
    expect(m.map((e) => e.action)).toEqual(['new', 'tutorial', 'options', 'help', 'quit']);
    expect(m[0].primary).toBe(true);
  });

  it('con una partida viva: continuar va primero y destacado', () => {
    const m = startMenu({ manual: null, auto: save(1000) });
    expect(m[0]).toMatchObject({ action: 'continue', slot: 'auto', primary: true });
    expect(m[0].detail).toContain('Oleada');
    expect(m[1]).toMatchObject({ action: 'new', primary: false });
    expect(m.some((e) => e.action === 'load')).toBe(false);
  });

  it('con dos partidas: continúa la más reciente y ofrece cargar la otra', () => {
    const m = startMenu({ manual: save(5000), auto: save(1000) });
    expect(m[0]).toMatchObject({ action: 'continue', slot: 'manual' });
    expect(m[2]).toMatchObject({ action: 'load', slot: 'auto', label: 'Cargar autoguardado' });
    const n = startMenu({ manual: save(1000), auto: save(5000) });
    expect(n[0].slot).toBe('auto');
    expect(n[2]).toMatchObject({ action: 'load', slot: 'manual', label: 'Cargar guardado manual' });
  });

  it('las partidas terminadas no se ofrecen', () => {
    expect(startMenu({ manual: save(5000, true), auto: null })[0].action).toBe('new');
    const m = startMenu({ manual: save(5000, true), auto: save(1000) });
    expect(m[0]).toMatchObject({ action: 'continue', slot: 'auto' });
    expect(m.some((e) => e.action === 'load')).toBe(false);
  });

  it('cada entrada lleva a su dirección', () => {
    expect(startQuery({ action: 'new' }, 42.9)).toBe('seed=42');
    expect(startQuery({ action: 'continue', slot: 'auto' }, 1)).toBe('load=auto');
    expect(startQuery({ action: 'load', slot: 'manual' }, 1)).toBe('load=manual');
    expect(startQuery({ action: 'tutorial' }, 1)).toBe('tutorial=1');
    for (const a of ['options', 'help', 'quit'] as const) expect(startQuery({ action: a }, 1)).toBeNull();
    expect(startQuery({ action: 'continue' }, 1)).toBeNull();
  });

  it('el menú sale sin parámetros o con menu=1', () => {
    expect(wantsMenu('')).toBe(true);
    expect(wantsMenu('?')).toBe(true);
    expect(wantsMenu('?menu=1')).toBe(true);
    expect(wantsMenu('?menu=1&quality=low')).toBe(true);
    expect(wantsMenu('?seed=7')).toBe(false);
    expect(wantsMenu('?load=auto')).toBe(false);
  });

  it('la fecha del guardado es corta', () => {
    expect(savedWhen(save(new Date(2026, 10, 15, 9, 5).getTime()))).toBe('15/11 09:05');
  });
});
