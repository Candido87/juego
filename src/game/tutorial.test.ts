import { describe, expect, it } from 'vitest';
import { count } from './bag';
import { CONFIG } from './config';
import { flatGame, instant, powerUp, run } from './testutil';
import {
  KV,
  TUTORIAL_STEPS,
  clearTutorial,
  createTutorialGame,
  loadTutorial,
  newTutorialState,
  progress,
  saveTutorial,
  setFlag,
  skipAll,
  skipStep,
  stepAt,
  stepTutorial,
  tutorialTick,
} from './tutorial';
import { TUTORIAL_TEXT } from './tutorialText';
import { tutorialBotTick } from './tutorialBot';
import { Ore } from './types';

const memStore = (): KV & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
};

describe('pasos del tutorial (datos)', () => {
  it('cada paso tiene su texto y los ids son únicos', () => {
    const ids = TUTORIAL_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(TUTORIAL_TEXT[id], id).toBeDefined();
      expect(TUTORIAL_TEXT[id].text.length).toBeGreaterThan(10);
    }
  });

  it('los edificios que resaltan o desbloquean existen', () => {
    for (const s of TUTORIAL_STEPS) {
      if (s.highlight?.tool) expect(CONFIG.buildings[s.highlight.tool], s.id).toBeDefined();
      for (const k of s.unlock ?? []) expect(CONFIG.buildings[k], s.id).toBeDefined();
    }
  });
});

describe('máquina de pasos', () => {
  it('avanza sólo cuando se cumple la condición', () => {
    const g = flatGame();
    const s = newTutorialState();
    stepTutorial(g, s);
    expect(stepAt(s)!.id).toBe('camera');
    setFlag(s, 'camera_moved');
    stepTutorial(g, s);
    expect(stepAt(s)!.id).toBe('camera'); // falta el zoom
    setFlag(s, 'zoomed');
    stepTutorial(g, s);
    expect(stepAt(s)!.id).toBe('tool');
    expect(s.completed).toEqual(['camera']);
  });

  it('marca como cumplido lo que el jugador ya hizo antes de tiempo', () => {
    const g = flatGame([[4, 9, Ore.Iron]]);
    instant(g, 'drill', 4, 9);
    const s = newTutorialState();
    setFlag(s, 'camera_moved');
    setFlag(s, 'zoomed');
    setFlag(s, 'tool_selected');
    stepTutorial(g, s);
    // cámara, herramienta y taladro cumplidos de golpe; se queda en el modo manual (aún no llegó mena).
    expect(s.completed).toEqual(['camera', 'tool', 'drill']);
    expect(stepAt(s)!.id).toBe('manual');
  });

  it('repone lo necesario al entrar en un paso (no se queda sin recursos)', () => {
    const g = flatGame([[4, 9, Ore.Iron]]);
    g.storage.frame = 0;
    g.storage.gear = 0;
    const s = newTutorialState();
    s.index = TUTORIAL_STEPS.findIndex((x) => x.id === 'drill');
    stepTutorial(g, s);
    expect(count(g.storage, 'frame')).toBeGreaterThanOrEqual(1);
    expect(count(g.storage, 'gear')).toBeGreaterThanOrEqual(2);
    // sólo la primera vez: si el jugador gasta, no se vuelve a regalar en el mismo paso
    g.storage.frame = 0;
    stepTutorial(g, s);
    expect(count(g.storage, 'frame')).toBe(0);
  });

  it('desbloquea las murallas en el paso de murallas', () => {
    const g = flatGame();
    expect(g.unlockedBuildings.has('wall_wood')).toBe(false);
    const s = newTutorialState();
    s.index = TUTORIAL_STEPS.findIndex((x) => x.id === 'walls');
    stepTutorial(g, s);
    expect(g.unlockedBuildings.has('wall_wood')).toBe(true);
    expect(g.canPlace('wall_wood', 3, 3).ok).toBe(true);
  });

  it('se puede saltar un paso y el tutorial entero, sin romperse', () => {
    const g = flatGame();
    const s = newTutorialState();
    stepTutorial(g, s);
    skipStep(s);
    expect(s.skipped).toEqual(['camera']);
    expect(stepAt(s)!.id).toBe('tool');
    skipAll(s);
    expect(s.finished).toBe(true);
    expect(stepAt(s)).toBeUndefined();
    stepTutorial(g, s); // no pasa nada al llamar con el tutorial acabado
    expect(s.finished).toBe(true);
  });

  it('los pasos sin soporte en este juego (laboratorio) se saltan solos', () => {
    const g = flatGame();
    const s = newTutorialState();
    s.index = TUTORIAL_STEPS.findIndex((x) => x.id === 'lab');
    stepTutorial(g, s);
    const hasLab = 'lab' in CONFIG.buildings;
    expect(stepAt(s)!.id).toBe(hasLab ? 'lab' : 'finish');
    if (!hasLab) expect(s.skipped).toContain('lab');
  });

  it('el progreso cuenta sólo los pasos disponibles', () => {
    const g = flatGame();
    const s = newTutorialState();
    const p = progress(g, s);
    expect(p.n).toBe(1);
    expect(p.total).toBe(TUTORIAL_STEPS.length - ('lab' in CONFIG.buildings ? 0 : 1));
  });
});

describe('guardado del progreso', () => {
  it('guarda y recupera el estado', () => {
    const store = memStore();
    const s = newTutorialState();
    s.index = 4;
    s.completed = ['camera', 'tool', 'drill', 'manual'];
    setFlag(s, 'zoomed');
    saveTutorial(store, s);
    const r = loadTutorial(store);
    expect(r.index).toBe(4);
    expect(r.completed).toEqual(s.completed);
    expect(r.flags).toEqual(['zoomed']);
    expect(r.entered).toBe(-1);
  });

  it('un guardado dañado o ausente da un tutorial nuevo', () => {
    const store = memStore();
    expect(loadTutorial(store).index).toBe(0);
    store.setItem(CONFIG.tutorial.storageKey, '{no es json');
    expect(loadTutorial(store).index).toBe(0);
    store.setItem(CONFIG.tutorial.storageKey, JSON.stringify({ index: 999, completed: 5 }));
    const s = loadTutorial(store);
    expect(s.index).toBe(0);
    expect(s.completed).toEqual([]);
  });

  it('reiniciar borra el progreso', () => {
    const store = memStore();
    saveTutorial(store, { ...newTutorialState(), index: 3 });
    clearTutorial(store);
    expect(loadTutorial(store).index).toBe(0);
  });
});

describe('partida del tutorial', () => {
  it('usa un mapa pequeño con semilla fija y su propio almacén, sin tocar la configuración principal', () => {
    const a = createTutorialGame();
    const b = createTutorialGame();
    expect(a.world.w).toBe(CONFIG.tutorial.mapW);
    expect(Array.from(a.world.ore)).toEqual(Array.from(b.world.ore));
    expect(count(a.storage, 'iron_ore')).toBe(0);
    expect(count(a.storage, 'gasoline')).toBe(CONFIG.tutorial.startItems.gasoline);
    expect(a.population).toBe(3);
    for (const o of [Ore.Iron, Ore.Copper, Ore.Coal, Ore.Stone, Ore.Wood, Ore.Oil]) expect(Array.from(a.world.ore)).toContain(o);
    expect(CONFIG.mapW).toBe(40);
    expect(CONFIG.startItems.food).toBe(30);
  });

  it('no llegan oleadas hasta el paso de la oleada', () => {
    const g = createTutorialGame();
    const s = newTutorialState();
    for (let i = 0; i < 300 / CONFIG.step; i++) {
      tutorialTick(g, s);
      g.step(CONFIG.step);
    }
    expect(g.wave).toBe(0);
    expect(g.enemies.length).toBe(0);
  });

  it('en el paso de la oleada llega una sola y luego se detienen', () => {
    const g = createTutorialGame();
    const s = newTutorialState();
    s.index = TUTORIAL_STEPS.findIndex((x) => x.id === 'wave');
    for (let i = 0; i < 120 / CONFIG.step; i++) {
      tutorialTick(g, s);
      g.step(CONFIG.step);
    }
    expect(g.wave).toBe(1);
    s.index = TUTORIAL_STEPS.findIndex((x) => x.id === 'workshop');
    for (let i = 0; i < 200 / CONFIG.step; i++) {
      tutorialTick(g, s);
      g.step(CONFIG.step);
    }
    expect(g.wave).toBe(1);
  });

  it('la energía del tutorial: generador con gasolina mueve las cintas (paso power)', () => {
    const g = flatGame();
    instant(g, 'belt', 5, 9, 0);
    powerUp(g, [[6, 8]], [6, 7]);
    run(g, 0.2);
    const s = newTutorialState();
    s.index = TUTORIAL_STEPS.findIndex((x) => x.id === 'power');
    stepTutorial(g, s);
    expect(s.completed).toContain('power');
  });
});

describe('recorrido completo con un bot', () => {
  it('el bot completa todos los pasos disponibles y llega al final sin atascarse', () => {
    const g = createTutorialGame();
    const s = newTutorialState();
    let t = 0;
    let lastStep = '';
    let stuckSince = 0;
    while (!s.finished && t < 3000) {
      tutorialBotTick(g, s);
      tutorialTick(g, s);
      stepTutorial(g, s);
      g.update(0.5);
      t += 0.5;
      const cur = stepAt(s)?.id ?? 'fin';
      if (cur !== lastStep) {
        lastStep = cur;
        stuckSince = t;
      }
      expect(g.gameOver, `partida perdida en el paso ${cur} (t=${t})`).toBe(false);
      expect(t - stuckSince, `atascado en el paso ${cur}`).toBeLessThan(600);
    }
    expect(s.finished).toBe(true);
    const expected = TUTORIAL_STEPS.map((x) => x.id).filter((id) => id !== 'lab' || 'lab' in CONFIG.buildings);
    expect(s.completed.filter((id) => id !== 'lab')).toEqual(expected.filter((id) => id !== 'lab'));
    expect(s.skipped.filter((id) => id !== 'lab')).toEqual([]);
    expect(g.wave).toBe(1);
  });
});
