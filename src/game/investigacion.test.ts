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
    expect(CONFIG.buildings.laboratory.cost).toEqual({ tool_kit: 3, frame: 3, wire: 4 });
    expect(CONFIG.power.demand.laboratory).toBeGreaterThan(0);
    expect(CONFIG.power.mult.laboratory).toEqual([0, 1]);
    expect(CONFIG.npc.roles.researcher.name).toBe('Investigador');
    // Las tres personas del inicio pueden construirlo con lo que hay en el almacén.
    const g = flatGame();
    expect(g.canPlace('laboratory', 3, 3).ok).toBe(false); // bloqueado hasta que se desbloquee o se use `instant`
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

  it('sólo se puede asignar con puestos libres y dejando gente fuera', () => {
    const g = flatGame();
    // Sin laboratorio.
    expect(g.researcherBlock()).toContain('laboratorio');
    expect(g.reassignTo('researcher')).toBe(false);
    instant(g, 'laboratory', 5, 4);
    // Con tres personas sólo caben las que dejan al menos una fuera.
    expect(g.researcherBlock()).toBeNull();
    expect(g.reassignTo('researcher')).toBe(true);
    expect(g.reassignTo('researcher')).toBe(true);
    expect(g.researchers().length).toBe(2);
    expect(g.generalWorkers().length).toBe(R.minOutside);
    expect(g.reassignTo('researcher')).toBe(false);
    expect(g.researcherBlock()).not.toBeNull();
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
