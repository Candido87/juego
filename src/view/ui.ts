/** Interfaz HTML superpuesta: barra de construcción, almacén, NPCs, cola de trabajos, selección. */
import { count, entries, missing, total } from '../game/bag';
import { CONFIG } from '../game/config';
import type { Building, Game } from '../game/game';
import { JOB_NAMES, JOB_ROLE } from '../game/jobs';
import { BUILD_KINDS, Bag, BuildKind, Dir, ItemId, NPC_ROLES, NpcRole, rotateCW } from '../game/types';
import { ITEM_COLORS } from './shapes';

export type Tool = BuildKind | 'remove' | null;

export const ui = {
  tool: 'belt' as Tool,
  dir: 0 as Dir,
  paused: false,
  selected: null as number | null,
};

/** Flechas en pantalla para cada dirección de la cuadrícula (+x va abajo-derecha en isométrico). */
export const DIR_ARROWS = ['↘', '↙', '↖', '↗'];

const $ = (id: string) => document.getElementById(id)!;
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const dot = (i: ItemId) => `<span class="dot" style="background:${hex(ITEM_COLORS[i])}"></span>`;
export const itemName = (i: ItemId) => CONFIG.items[i];
export const bagText = (b: Bag) =>
  entries(b)
    .map(([i, n]) => `${dot(i)}${n} ${itemName(i)}`)
    .join(', ') || '—';

export class Hud {
  onRestart: () => void = () => {};
  private sim: Game | null = null;
  private last = new Map<string, string>();
  private msgTimer = 0;
  private panelTimer = 0;
  private toolsKey = '';

  constructor() {
    $('toolbar').addEventListener('click', (ev) => {
      const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>('button[data-tool]');
      if (!btn) return;
      const tool = btn.dataset.tool as Tool;
      this.setTool(ui.tool === tool ? null : tool);
    });
    $('pause').addEventListener('click', () => this.togglePause());
    $('restart').addEventListener('click', () => this.onRestart());
    $('callWave').addEventListener('click', () => this.sim?.callWaveNow());
    $('npcs').addEventListener('click', (ev) => {
      const role = (ev.target as HTMLElement).closest<HTMLElement>('[data-hire]')?.dataset.hire as NpcRole | undefined;
      if (role && this.sim) {
        if (!this.sim.hire(role)) this.flash('Faltan piezas para contratar');
        this.panelTimer = 0;
      }
    });
    $('jobs').addEventListener('click', (ev) => {
      const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-prio]');
      if (!el || !this.sim) return;
      const [id, delta] = el.dataset.prio!.split(':').map(Number);
      const job = this.sim.jobs.get(id);
      if (job) this.sim.jobs.setPriority(id, job.priority + delta);
      this.panelTimer = 0;
    });
    $('selected').addEventListener('click', (ev) => {
      const act = (ev.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
      const b = this.selectedBuilding();
      if (!act || !b || !this.sim) return;
      if (act === 'rotate') this.sim.rotate(b.x, b.y, rotateCW(b.dir));
      if (act === 'remove') this.sim.remove(b.x, b.y);
      this.panelTimer = 0;
    });
    $('selected').addEventListener('change', (ev) => {
      const sel = ev.target as HTMLSelectElement;
      const b = this.selectedBuilding();
      if (sel.dataset.act === 'recipe' && b && this.sim) this.sim.setRecipe(b.id, sel.value || null);
      this.panelTimer = 0;
    });
    $('techBtn').style.display = CONFIG.tech.length ? '' : 'none';
    this.setTool(ui.tool);
  }

  bind(sim: Game) {
    this.sim = sim;
    this.toolsKey = '';
    this.panelTimer = 0;
    ui.selected = null;
  }

  togglePause() {
    ui.paused = !ui.paused;
    $('pause').textContent = ui.paused ? 'Reanudar' : 'Pausa';
  }

  setTool(tool: Tool) {
    ui.tool = tool;
    document.querySelectorAll<HTMLButtonElement>('#toolbar button[data-tool]').forEach((b) => {
      b.classList.toggle('active', b.dataset.tool === tool);
    });
  }

  /** Herramientas disponibles (desbloqueadas), en orden. Las teclas 1..9 las seleccionan. */
  tools(): BuildKind[] {
    return this.sim ? BUILD_KINDS.filter((k) => this.sim!.unlockedBuildings.has(k)) : [];
  }

  rotate() {
    ui.dir = rotateCW(ui.dir);
  }

  flash(text: string) {
    const el = $('msg');
    el.textContent = text;
    el.style.display = 'block';
    this.msgTimer = 2;
  }

  selectedBuilding(): Building | undefined {
    return ui.selected === null ? undefined : this.sim?.buildings.get(ui.selected);
  }

  private set(id: string, value: string, html = false) {
    if (this.last.get(id) === value) return;
    this.last.set(id, value);
    if (html) $(id).innerHTML = value;
    else $(id).textContent = value;
  }

  update(sim: Game, info: string, dt: number) {
    this.set('core', String(Math.max(0, Math.ceil(sim.coreHp))));
    this.set('wave', String(sim.wave));
    this.set('next', String(Math.ceil(sim.nextWaveIn)));
    this.set('dir', DIR_ARROWS[ui.dir]);
    this.set('info', info);
    $('info').style.display = info ? 'block' : 'none';
    $('over').style.display = sim.gameOver ? 'flex' : 'none';
    if (sim.gameOver) this.set('overText', `El núcleo ha caído en la oleada ${sim.wave}`);
    if (this.msgTimer > 0) {
      this.msgTimer -= dt;
      if (this.msgTimer <= 0) $('msg').style.display = 'none';
    }
    this.panelTimer -= dt;
    if (this.panelTimer > 0) return;
    this.panelTimer = 0.25;
    this.renderTools(sim);
    this.renderInventory(sim);
    this.renderNpcs(sim);
    this.renderJobs(sim);
    this.renderSelected(sim);
  }

  private renderTools(sim: Game) {
    const tools = this.tools();
    const key = tools.join(',');
    if (key === this.toolsKey) return;
    this.toolsKey = key;
    $('tools').innerHTML = tools
      .map((k, i) => {
        const def = sim.def(k);
        return `<button data-tool="${k}" title="${def.name}: ${entries(def.cost).map(([it, n]) => `${n} ${itemName(it)}`).join(', ')}">${i < 9 ? `${i + 1} · ` : ''}${def.name}</button>`;
      })
      .join('');
    this.setTool(ui.tool && ui.tool !== 'remove' && !tools.includes(ui.tool) ? null : ui.tool);
  }

  private renderInventory(sim: Game) {
    const rows = entries(sim.storage)
      .map(([i, n]) => `<div class="it"><span>${dot(i)}${itemName(i)}</span><b>${n}</b></div>`)
      .join('');
    this.set('invList', rows || '<span class="muted">vacío</span>', true);
  }

  private renderNpcs(sim: Game) {
    const rows = NPC_ROLES.map((role) => {
      const all = sim.npcs.filter((n) => n.role === role);
      const busy = all.filter((n) => n.jobId !== null || total(n.carry) > 0).length;
      const def = CONFIG.npc.roles[role];
      const cost = entries(def.cost).map(([i, n]) => `${n} ${itemName(i)}`).join(', ');
      return `<div class="npcrow"><span>${def.name}: <b>${all.length}</b> <span class="muted">(${all.length - busy} libres)</span></span>
        <button data-hire="${role}" ${sim.canHire(role) ? '' : 'disabled'} title="Contratar: ${cost}">+ Contratar</button></div>`;
    }).join('');
    this.set('npcs', rows, true);
  }

  private renderJobs(sim: Game) {
    const list = sim.jobs.list();
    this.set('jobCount', `(${list.length})`);
    const rows = list
      .slice(0, 14)
      .map((j) => {
        const b = sim.buildings.get(j.buildingId);
        const what = b ? sim.def(b.kind).name : '?';
        const item = j.item ? ` ${dot(j.item)}${j.qty}` : '';
        const who = j.npcId !== null ? '<span class="good" title="Asignado">●</span>' : '<span class="muted" title="Esperando NPC">○</span>';
        const role = CONFIG.npc.roles[JOB_ROLE[j.type]].name;
        return `<div class="job" title="Lo hace: ${role}"><span>${JOB_NAMES[j.type]} ${what}${item}</span>${who}
          <button data-prio="${j.id}:-1">−</button><b>${j.priority}</b><button data-prio="${j.id}:1">+</button></div>`;
      })
      .join('');
    this.set('jobs', rows || '<span class="muted">sin trabajos</span>', true);
  }

  private renderSelected(sim: Game) {
    const b = this.selectedBuilding();
    const el = $('selected');
    if (!b) {
      el.style.display = 'none';
      this.last.delete('selected');
      return;
    }
    el.style.display = 'block';
    if (el.contains(document.activeElement) && document.activeElement?.tagName === 'SELECT') return;
    const def = sim.def(b.kind);
    const lines: string[] = [`<h3>${def.name}</h3>`];
    if (!b.built) {
      lines.push(`Obra: <b>${Math.floor(b.progress * 100)}%</b>`);
      const need = missing(def.cost, b.delivered);
      lines.push(`Faltan: ${total(need) ? bagText(need) : 'nada'}`);
    } else {
      lines.push(`Vida: <b>${Math.ceil(b.hp)}</b> / ${b.maxHp}`);
      if (b.markedForRemoval) lines.push('<span class="bad">Marcado para desmontar</span>');
      if (b.kind === 'factory') {
        const opts = ['<option value="">— sin receta —</option>']
          .concat(
            Object.entries(CONFIG.recipes)
              .filter(([id]) => sim.unlockedRecipes.has(id))
              .map(([id, r]) => {
                const ins = entries(r.inputs).map(([i, n]) => `${n} ${itemName(i)}`).join(' + ');
                const outs = entries(r.outputs).map(([i, n]) => `${n} ${itemName(i)}`).join(' + ');
                return `<option value="${id}" ${b.recipe === id ? 'selected' : ''}>${r.name}: ${ins} → ${outs}</option>`;
              }),
          )
          .join('');
        lines.push(`Receta: <select data-act="recipe" style="max-width:250px">${opts}</select>`);
        if (b.recipe && b.craft > 0) lines.push(`Fabricando: <b>${Math.floor((b.craft / CONFIG.recipes[b.recipe].time) * 100)}%</b>`);
      }
      if (total(b.inv)) lines.push(`Contiene: ${bagText(b.inv)}`);
      if (total(b.out)) lines.push(`Salida: ${bagText(b.out)}`);
    }
    const directional = b.kind === 'belt' || b.kind === 'belt_fast' || b.kind === 'drill' || b.kind === 'factory';
    if (b.kind !== 'core') {
      lines.push(
        `<div style="margin-top:6px;display:flex;gap:4px">${directional ? '<button data-act="rotate">Girar</button>' : ''}
        <button data-act="remove">${b.built ? (b.markedForRemoval ? 'No desmontar' : 'Desmontar') : 'Cancelar obra'}</button></div>`,
      );
    }
    this.set('selected', lines.join('<br>'), true);
  }
}

let hud: Hud | null = null;
export function getHud(): Hud {
  return (hud ??= new Hud());
}

export { count };
