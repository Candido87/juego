import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { Game } from './game';
import { canTake } from './jobs';
import { npcSummary } from './panels';
import { flatGame, instant, powerUp, run } from './testutil';
import type { NpcRole } from './types';

const R = CONFIG.research;
const addNpc = (g: Game, role: NpcRole) => (g as unknown as { spawnNpc: (r: NpcRole) => { id: number; role: NpcRole } }).spawnNpc(role);

/** Partida con laboratorio y red eléctrica y población de 6 personas (para poder asignar sin dejar la colonia vacía). */
function labGame(withPower = true) {
  const g = flatGame();
  for (let i = 0; i < 3; i++) addNpc(g, 'constructor');
  instant(g, 'pole', 4, 4);
  const lab = instant(g, 'laboratory', 5, 4);
  if (withPower) {
    const gen = instant(g, 'generator', 4, 5);
    gen.inv = { gasoline: 1000 };
    gen.running = true;
  }
  run(g, 0.2);
  return { g, lab };
}

describe('laboratorio, investigadores y puntos', () => {
  it('el laboratorio es un edificio de Servicios con coste en componentes y energía propia', () => {
    expect(CONFIG.buildings.laboratory.cost).toEqual({ frame: 3, gear: 3, wire: 4 });
    expect(CONFIG.power.demand.laboratory).toBeGreaterThan(0);
    expect(CONFIG.power.mult.laboratory).toEqual([0, 1]);
    expect(CONFIG.npc.roles.researcher.name).toBe('Investigador');
    // Viene desbloqueado de inicio (hace falta para empezar a investigar) y se puede construir con lo que hay en el almacén.
    const g = flatGame();
    expect(g.canPlace('laboratory', 3, 3).ok).toBe(true);
  });

  it('sin investigadores no produce nada, aunque tenga energía', () => {
    const { g, lab } = labGame();
    expect(lab.power).toBe(1);
    expect(g.researchers().length).toBe(0);
    expect(g.pointsPerMinute()).toBe(0);
    run(g, 60);
    expect(g.researchPoints).toBe(0);
  });

  it('con un investigador y energía produce pointsPerResearcher por minuto; con dos, el doble', () => {
    const { g } = labGame();
    expect(g.reassignTo('researcher')).toBe(true);
    expect(g.researchers().length).toBe(1);
    expect(g.pointsPerMinute()).toBeCloseTo(R.pointsPerResearcher, 5);
    run(g, 60);
    expect(g.researchPoints).toBeCloseTo(R.pointsPerResearcher, 1);
    expect(g.reassignTo('researcher')).toBe(true);
    expect(g.pointsPerMinute()).toBeCloseTo(R.pointsPerResearcher * 2, 5);
  });

  it('sin energía no produce: la producción cae al instante y vuelve con la red', () => {
    const { g } = labGame(false);
    expect(g.reassignTo('researcher')).toBe(true);
    run(g, 30);
    expect(g.pointsPerMinute()).toBe(0);
    expect(g.researchPoints).toBe(0);
    // Se enciende el generador: produce.
    const gen = instant(g, 'generator', 4, 5);
    gen.inv = { gasoline: 1000 };
    gen.running = true;
    run(g, 0.5);
    expect(g.pointsPerMinute()).toBeGreaterThan(0);
    // Se queda sin combustible: se para otra vez.
    gen.inv = {};
    gen.running = false;
    run(g, 0.5);
    expect(g.pointsPerMinute()).toBe(0);
  });

  it('un investigador menos baja la producción de inmediato: reasignado o muerto', () => {
    const { g } = labGame();
    g.reassignTo('researcher');
    g.reassignTo('researcher');
    expect(g.pointsPerMinute()).toBeCloseTo(R.pointsPerResearcher * 2, 5);
    // Reasignado a otro rol.
    g.setRole(g.researchers()[0].id, 'transporter');
    expect(g.pointsPerMinute()).toBeCloseTo(R.pointsPerResearcher, 5);
    // Muerto: el NPC desaparece de la población.
    const who = g.researchers()[0];
    g.npcs.splice(g.npcs.indexOf(g.npcs.find((n) => n.id === who.id)!), 1);
    expect(g.pointsPerMinute()).toBe(0);
  });

  it('los investigadores no hacen otras tareas y siguen contando como población que come', () => {
    const { g } = labGame();
    g.reassignTo('researcher');
    const r = g.researchers()[0];
    const job = { id: 1, type: 'supply', priority: 5 } as never;
    expect(canTake(g, r, job)).toBe(false);
    expect(canTake(g, r, { id: 2, type: 'build', priority: 5 } as never)).toBe(false);
    expect(canTake(g, r, { id: 3, type: 'repair', priority: 5 } as never)).toBe(false);
    // Sigue en la población (come) y no cuenta como libre.
    expect(g.population).toBe(6);
    expect(npcSummary(g)).toContain('5 libres');
    const food = g.storage.food ?? 0;
    run(g, 30);
    expect(g.storage.food ?? 0).toBeLessThan(food);
  });

  it('sólo se puede asignar con puestos libres, dejando gente fuera y sin vaciar ningún rol', () => {
    const g = flatGame();
    // Sin laboratorio.
    expect(g.researcherBlock()).toContain('laboratorio');
    expect(g.reassignTo('researcher')).toBe(false);
    instant(g, 'laboratory', 5, 4);
    // Con la población inicial (uno de cada rol) nadie puede pasar a Investigador: la colonia se quedaría sin un rol.
    expect(g.researcherBlock()).toContain('más población');
    expect(g.reassignTo('researcher')).toBe(false);
    expect(g.researchers().length).toBe(0);
    expect(g.setRole(g.npcs[0].id, 'researcher')).toBe(false);
    // Con una persona más ya se puede, sacándola del rol con dos (y sólo de ahí).
    addNpc(g, 'transporter');
    expect(g.researcherBlock()).toBeNull();
    expect(g.reassignTo('researcher')).toBe(true);
    expect(g.researchers().length).toBe(1);
    expect(g.npcs.filter((n) => n.role === 'transporter').length).toBe(1);
    for (const r of ['constructor', 'transporter', 'operator'] as const) expect(g.npcs.some((n) => n.role === r), r).toBe(true);
    expect(g.researcherBlock()).toContain('más población');
    // Con más gente, los puestos del laboratorio son el límite.
    const h = flatGame();
    for (let i = 0; i < 5; i++) addNpc(h, 'constructor');
    instant(h, 'laboratory', 5, 4);
    expect(h.reassignTo('researcher')).toBe(true);
    expect(h.reassignTo('researcher')).toBe(true);
    expect(h.researchers().length).toBe(R.labSlots);
    expect(h.researcherBlock()).toContain('puestos');
    expect(h.reassignTo('researcher')).toBe(false);
    instant(h, 'laboratory', 7, 4);
    expect(h.reassignTo('researcher')).toBe(true);
    for (const r of ['constructor', 'transporter', 'operator'] as const) expect(h.npcs.some((n) => n.role === r), r).toBe(true);
  });

  it('varios laboratorios rinden menos cada vez (labFalloff) y las mejoras multiplican', () => {
    const { g } = labGame();
    for (let i = 0; i < 3; i++) addNpc(g, 'constructor');
    const lab2 = instant(g, 'laboratory', 6, 4);
    expect(lab2).toBeDefined();
    run(g, 0.2);
    for (let i = 0; i < 4; i++) expect(g.reassignTo('researcher')).toBe(true);
    // Primer laboratorio con 2 investigadores, segundo con 2 al 80 %.
    const expected = 2 * R.pointsPerResearcher + 2 * R.pointsPerResearcher * R.labFalloff;
    expect(g.pointsPerMinute()).toBeCloseTo(expected, 4);
    expect(expected).toBeCloseTo(21.6, 5);
    g.bonus.researchRate = 0.25;
    expect(g.pointsPerMinute()).toBeCloseTo(expected * 1.25, 4);
  });

  it('si el laboratorio desaparece, los investigadores sin puesto vuelven a Constructor', () => {
    const { g, lab } = labGame();
    g.reassignTo('researcher');
    g.reassignTo('researcher');
    expect(g.researchers().length).toBe(2);
    g.remove(lab.x, lab.y);
    // Marcado para desmontar: ya no cuenta; al paso siguiente se libera a la gente.
    run(g, 0.3);
    expect(g.researchers().length).toBe(0);
    expect(g.npcs.filter((n) => n.role === 'constructor').length).toBeGreaterThanOrEqual(2);
  });

  it('un laboratorio sin terminar no cuenta como puesto', () => {
    const g = flatGame();
    for (let i = 0; i < 3; i++) addNpc(g, 'constructor');
    g.unlockedBuildings.add('laboratory');
    const site = g.place('laboratory', 5, 4, 0);
    expect(site).not.toBeNull();
    expect(g.researchSlots()).toBe(0);
    expect(g.reassignTo('researcher')).toBe(false);
  });

  it('exportar e importar el estado conserva los puntos y los investigadores', () => {
    const { g } = labGame();
    g.reassignTo('researcher');
    run(g, 40);
    const pts = g.researchPoints;
    expect(pts).toBeGreaterThan(3);
    const copy = flatGame();
    copy.importState(g.exportState());
    expect(copy.researchPoints).toBeCloseTo(pts, 8);
    expect(copy.researchers().length).toBe(1);
    // Un guardado antiguo (sin puntos) arranca en cero.
    const old = g.exportState() as { researchPoints?: number };
    delete old.researchPoints;
    const blank = flatGame();
    blank.researchPoints = 99;
    blank.importState(old as never);
    expect(blank.researchPoints).toBe(0);
  });

  it('powerUp de los tests sigue funcionando junto al laboratorio', () => {
    const g = flatGame();
    powerUp(g, [[4, 4]], [4, 5]);
    const lab = instant(g, 'laboratory', 5, 4);
    run(g, 0.2);
    expect(lab.power).toBe(1);
  });
});

import { botTick } from './bot';
import { guiaBotTick } from './guia-bot';
import { GUIA_DONE, GUIA_TEXT } from './guia-inicio-textos';
import { GUIA_STEPS, newGuiaState, stepGuia } from './guia-inicio';

describe('guía de inicio y simulación con investigación', () => {
  it('hay tres pasos nuevos (laboratorio, investigador y primera tecnología) con texto y aviso', () => {
    const ids = GUIA_STEPS.map((s) => s.id);
    for (const id of ['lab_build', 'lab_staff', 'tech_first']) {
      expect(ids).toContain(id);
      const g = flatGame();
      expect(GUIA_TEXT[id](g).text.length, id).toBeGreaterThan(60);
      expect(GUIA_DONE[id], id).toBeTruthy();
    }
    // En orden: laboratorio, investigador, tecnología; después de las cadenas de producción y antes de los muros.
    expect(ids.indexOf('lab_build')).toBeLessThan(ids.indexOf('lab_staff'));
    expect(ids.indexOf('lab_staff')).toBeLessThan(ids.indexOf('tech_first'));
    expect(ids.indexOf('chain_ammo')).toBeLessThan(ids.indexOf('lab_build'));
    expect(ids.indexOf('tech_first')).toBeLessThan(ids.indexOf('walls'));
    // El texto del paso del investigador explica que hace falta población cuando no se puede asignar.
    const g = flatGame();
    instant(g, 'laboratory', 5, 4);
    expect(GUIA_TEXT.lab_staff(g).text).toContain('más población');
    expect(GUIA_TEXT.tech_first(g).text).toContain('Investigación (T)');
  });

  it('el bot construye el laboratorio, asigna investigadores y compra tecnologías, con la curva de puntos prevista', () => {
    const g = new Game({ seed: 7 });
    const s = newGuiaState();
    let spent = 0;
    const firstAt: Record<string, number> = {};
    for (let t = 0; t < 480; t += 0.5) {
      g.update(0.5);
      guiaBotTick(g, s);
      stepGuia(g, s);
      botTick(g);
      for (const id of g.researched) if (!(id in firstAt)) (firstAt[id] = t), (spent += CONFIG.tech.find((n) => n.id === id)!.cost);
    }
    expect(g.labs().length).toBeGreaterThanOrEqual(1);
    expect(g.researchers().length).toBeGreaterThanOrEqual(1);
    expect(g.researched.size).toBeGreaterThanOrEqual(3);
    // La primera tecnología llega antes de la primera oleada (5:00) y la curva no se estanca: puntos totales crecientes.
    expect(Math.min(...Object.values(firstAt))).toBeLessThan(CONFIG.waves.firstDelay);
    expect(spent + g.researchPoints).toBeGreaterThan(30);
    // Los puntos ganados cuadran con lo producido: nunca más de lo que permiten los puestos de los laboratorios.
    const maxPerMin = g.researchSlots() * R.pointsPerResearcher * (1 + g.bonus.researchRate);
    expect((spent + g.researchPoints) / (480 / 60)).toBeLessThanOrEqual(maxPerMin);
  });
});
