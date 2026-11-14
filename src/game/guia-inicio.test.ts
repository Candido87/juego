import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { Game } from './game';
import { guiaBotTick } from './guia-bot';
import {
  GUIA_STEPS,
  GuiaState,
  currentStep,
  disableGuia,
  dismissCurrent,
  guiaProgress,
  loadGuia,
  newGuiaState,
  reopenGuia,
  resetForNewGame,
  saveGuia,
  shortage,
  stepGuia,
  visibleStep,
} from './guia-inicio';
import { GUIA_DONE, GUIA_TEXT, costText, guiaText } from './guia-inicio-textos';
import { flatGame, instant } from './testutil';
import { Ore } from './types';

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe('guía de inicio: datos y textos', () => {
  it('cada paso tiene id único, texto y aviso de cumplido en español', () => {
    expect(new Set(GUIA_STEPS.map((s) => s.id)).size).toBe(GUIA_STEPS.length);
    const g = flatGame();
    for (const s of GUIA_STEPS) {
      const t = GUIA_TEXT[s.id](g);
      expect(t.title.length, s.id).toBeGreaterThan(2);
      expect(t.text.length, s.id).toBeGreaterThan(20);
      expect(GUIA_DONE[s.id], s.id).toBeTruthy();
      if (s.recipe) expect(CONFIG.recipes[s.recipe], s.id).toBeDefined();
      if (s.build) expect(CONFIG.buildings[s.build], s.id).toBeDefined();
    }
  });
  it('los textos llevan cifras concretas', () => {
    const g = flatGame();
    expect(GUIA_TEXT.drill_iron(g).text).toMatch(/\d+ minerales por minuto/);
    expect(GUIA_TEXT.factory_ammo(g).text).toContain('Munición');
    expect(costText({ frame: 1, gear: 2 })).toBe('1× bastidor y 2× engranaje');
  });
});

describe('guía de inicio: avance', () => {
  it('muestra un solo objetivo cada vez y sólo avanza al cumplirse de verdad', () => {
    const g = flatGame([[3, 3, Ore.Iron]]);
    const s = newGuiaState();
    expect(currentStep(g, s)!.id).toBe('drill_iron');
    expect(stepGuia(g, s)).toEqual([]);
    expect(currentStep(g, s)!.id).toBe('drill_iron');
    instant(g, 'drill', 3, 3);
    expect(stepGuia(g, s).map((e) => e.id)).toEqual(['drill_iron']);
    expect(currentStep(g, s)!.id).toBe('storage');
    expect(guiaProgress(s).n).toBe(2);
  });
  it('salta los pasos ya cumplidos, aunque estén más adelante', () => {
    const g = flatGame([[3, 3, Ore.Iron]]);
    instant(g, 'farm', 5, 5);
    const s = newGuiaState();
    stepGuia(g, s);
    expect(s.completed).toContain('farm');
    expect(currentStep(g, s)!.id).toBe('drill_iron');
    instant(g, 'drill', 3, 3);
    stepGuia(g, s);
    expect(currentStep(g, s)!.id).toBe('storage');
  });
  it('indica lo que falta para construir', () => {
    const g = flatGame();
    g.storage.frame = 0;
    const st = GUIA_STEPS.find((x) => x.id === 'storage')!;
    expect(shortage(g, st)).toEqual({ frame: CONFIG.buildings.storage.cost.frame });
    expect(guiaText(g, st).missing).toContain('Te falta');
    g.storage.frame = 99;
    expect(shortage(g, st)).toEqual({});
  });
  it('el aviso de oleada es urgente y aparece al faltar 1 minuto', () => {
    const g = flatGame([], { waves: true });
    const s = newGuiaState();
    expect(currentStep(g, s)!.id).toBe('drill_iron');
    g.nextWaveIn = CONFIG.guia.waveWarning - 1;
    expect(currentStep(g, s)!.id).toBe('wave_soon');
  });
});

describe('guía de inicio: cerrar, saltar, reabrir y guardar', () => {
  it('cerrar el aviso lo oculta pero no completa el paso', () => {
    const g = flatGame();
    const s = newGuiaState();
    dismissCurrent(g, s);
    expect(visibleStep(g, s)).toBeUndefined();
    expect(currentStep(g, s)!.id).toBe('drill_iron');
    expect(s.completed).toEqual([]);
  });
  it('desactivar la guía la apaga y no se repite en otras partidas; reabrir la enciende', () => {
    const g = flatGame();
    const store = mem();
    const s = newGuiaState();
    disableGuia(s);
    saveGuia(store, s);
    const l = loadGuia(store);
    expect(l.disabled).toBe(true);
    expect(currentStep(g, l)).toBeUndefined();
    expect(stepGuia(g, l)).toEqual([]);
    const fresh = resetForNewGame(l);
    expect(fresh.disabled).toBe(true);
    reopenGuia(fresh);
    expect(currentStep(g, fresh)!.id).toBe('drill_iron');
  });
  it('guarda el progreso y tolera datos dañados', () => {
    const store = mem();
    const s: GuiaState = { completed: ['drill_iron', 'nope'], flags: ['wave_seen'], hidden: ['storage'], disabled: false };
    saveGuia(store, s);
    expect(loadGuia(store)).toEqual({ completed: ['drill_iron'], flags: ['wave_seen'], hidden: ['storage'], disabled: false });
    store.setItem(CONFIG.guia.storageKey, '{rota');
    expect(loadGuia(store)).toEqual(newGuiaState());
  });
});

describe('un jugador que sigue la guía llega a la primera oleada con defensa', () => {
  it('con torreta construida y con munición antes de los 5:00', () => {
    const g = new Game({ seed: 7 });
    const s = newGuiaState();
    for (let t = 0; t < CONFIG.waves.firstDelay - 1 && !g.gameOver; t += 0.5) {
      g.update(0.5);
      guiaBotTick(g, s);
      stepGuia(g, s);
    }
    expect(g.wave).toBe(0);
    const turrets = [...g.buildings.values()].filter((b) => b.kind === 'turret_bullet' && b.built);
    expect(turrets.length).toBeGreaterThan(0);
    expect(turrets.some((b) => g.turretReady(b))).toBe(true);
    expect(s.completed).toEqual(expect.arrayContaining(['drill_iron', 'belt_connect', 'power_poles', 'belt_flow', 'farm', 'turret']));
  });
});
