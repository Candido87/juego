import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { formatClock } from './format';
import { flatGame, run } from './testutil';

describe('cuenta atrás de la primera oleada', () => {
  it('formato m:ss', () => {
    expect(formatClock(300)).toBe('5:00');
    expect(formatClock(299.2)).toBe('5:00');
    expect(formatClock(61)).toBe('1:01');
    expect(formatClock(9)).toBe('0:09');
    expect(formatClock(-3)).toBe('0:00');
    expect(formatClock(Infinity)).toBe('—');
  });
  it('la primera oleada llega a los 5:00 y es suave; las siguientes siguen su intervalo', () => {
    expect(CONFIG.waves.firstDelay).toBe(300);
    const g = flatGame([], { waves: true });
    expect(g.nextWaveIn).toBe(300);
    g.storage.food = 100000;
    run(g, 290);
    expect(g.wave).toBe(0);
    run(g, 12);
    expect(g.wave).toBe(1);
    const queue = (g as unknown as { queue: { kind: string }[] }).queue;
    expect(queue.length + g.enemies.length).toBe(CONFIG.waves.firstCount);
    expect([...queue, ...g.enemies].every((q) => q.kind === 'grunt')).toBe(true);
    expect(g.nextWaveIn).toBeGreaterThan(CONFIG.waves.interval - 5);
  });
  it('adelantar oleada funciona (la pausa es de la vista: no se llama a step)', () => {
    const g = flatGame([], { waves: true });
    expect(g.hasTurret()).toBe(false);
    g.callWaveNow();
    run(g, 0.2);
    expect(g.wave).toBe(1);
  });
});
