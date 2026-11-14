/** Interfaz HTML superpuesta: barra de construcción, almacén, NPCs, cola de trabajos, selección. */
import { count, entries, missing, total } from '../game/bag';
import { CONFIG } from '../game/config';
import { ROTATABLE, type Building, type Game } from '../game/game';
import { JOB_NAMES, JOB_ROLE } from '../game/jobs';
import { BUILD_KINDS, Bag, BuildKind, Dir, FREE_ROLES, ItemId, NPC_ROLES, NpcRole, rotateCW } from '../game/types';
import { demandOf, isElectric } from '../game/power';
import { ITEM_COLORS } from './shapes';
import { TooltipManager } from './tooltip';
import { JOB_ICONS, ROLE_ICONS, TILESHEET, TOOL_ICONS, frameRect } from './sprites';

// ------------------------------------------------------------------ iconos del pack

const sheet = new Image();
let sheetReady = false;
const iconCache = new Map<number, string>();
const onSheetReady: (() => void)[] = [];
sheet.onload = () => {
  sheetReady = true;
  onSheetReady.forEach((f) => f());
};
sheet.src = TILESHEET.url;

/** <img> con la casilla `frame` del pack, en píxel nítido. Vacío si aún no ha cargado. */
export function iconHtml(frame: number | undefined, size = 20): string {
  if (frame === undefined || !sheetReady) return '';
  let url = iconCache.get(frame);
  if (!url) {
    const c = document.createElement('canvas');
    const t = TILESHEET.tile;
    c.width = t;
    c.height = t;
    const r = frameRect(frame);
    c.getContext('2d')!.drawImage(sheet, r.x, r.y, r.w, r.h, 0, 0, t, t);
    url = c.toDataURL();
    iconCache.set(frame, url);
  }
  return `<img src="${url}" width="${size}" height="${size}" style="image-rendering:pixelated;vertical-align:middle;margin-right:4px">`;
}

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
    new TooltipManager(() => this.sim);
    $('toolbar').addEventListener('click', (ev) => {
      const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>('button[data-tool]');
      if (!btn) return;
      const tool = btn.dataset.tool as Tool;
      this.setTool(ui.tool === tool ? null : tool);
    });
    $('pause').addEventListener('click', () => this.togglePause());
    $('restart').addEventListener('click', () => this.onRestart());
    $('callWave').addEventListener('click', () => this.sim?.callWaveNow());
    $('npcs').addEventListener('change', (ev) => {
      const sel = ev.target as HTMLSelectElement;
      if (sel.dataset.act === 'growthRole' && this.sim) this.sim.growthRole = (sel.value || null) as NpcRole | null;
    });
    $('npcs').addEventListener('click', (ev) => {
      const role = (ev.target as HTMLElement).closest<HTMLElement>('[data-assign]')?.dataset.assign as NpcRole | undefined;
      if (role && this.sim) {
        if (!this.sim.reassignTo(role)) this.flash('No hay nadie a quien reasignar');
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
      if (sel.dataset.act === 'critical' && b && this.sim) this.sim.setCritical(b.id, (sel as unknown as HTMLInputElement).checked);
      this.panelTimer = 0;
    });
    onSheetReady.push(() => {
      this.toolsKey = '';
      this.panelTimer = 0;
      this.last.clear();
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
    if (sim.gameOver) this.set('overText', sim.npcs.length === 0 ? `La colonia se ha quedado sin gente (oleada ${sim.wave})` : `El núcleo ha caído en la oleada ${sim.wave}`);
    if (this.msgTimer > 0) {
      this.msgTimer -= dt;
      if (this.msgTimer <= 0) $('msg').style.display = 'none';
    }
    this.panelTimer -= dt;
    if (this.panelTimer > 0) return;
    this.panelTimer = 0.25;
    this.renderTools(sim);
    this.renderInventory(sim);
    this.renderColony(sim);
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
        return `<button data-tool="${k}" data-tip="build:${k}" data-key="${i < 9 ? i + 1 : ''}">${iconHtml(TOOL_ICONS[k])}${i < 9 ? `${i + 1} · ` : ''}${def.name}</button>`;
      })
      .join('');
    this.setTool(ui.tool && ui.tool !== 'remove' && !tools.includes(ui.tool) ? null : ui.tool);
  }

  /** Población, comida, gasolina, energía y taller de un vistazo. */
  private renderColony(sim: Game) {
    const busy = sim.npcs.filter((n) => n.role !== 'mechanic' && (n.jobId !== null || total(n.carry) > 0)).length;
    const mech = sim.npcs.filter((n) => n.role === 'mechanic').length;
    const free = sim.population - busy - mech;
    const food = count(sim.storage, 'food');
    const perMin = sim.foodPerMinute();
    const mins = perMin > 0 ? food / perMin : Infinity;
    const foodCls = sim.hungry ? 'bad' : mins < CONFIG.ui.foodLowMinutes ? 'warn' : '';
    const foodState = sim.hungry ? ' ¡HAMBRE!' : mins < CONFIG.ui.foodLowMinutes ? ' (queda poca)' : '';
    let prod = 0;
    let dem = 0;
    for (const n of sim.grid.nets) {
      prod += n.production;
      dem += n.demand;
    }
    const repairs = sim.jobs.list().filter((j) => j.type === 'repair').length;
    const shop = sim.workshops().length
      ? `Taller: <b>${mech}</b> mecánicos, ${repairs} reparaciones`
      : `<span class="muted" title="Sin taller reparan los Constructores, más despacio">Sin taller (${repairs} reparaciones)</span>`;
    this.set(
      'colony',
      `<span data-tip="hud:population">Población <b>${sim.population}</b>/${sim.housingCapacity()} <span class="muted">(${free} libres, ${busy} trabajando, ${mech} taller)</span></span>
      <span class="${foodCls}" data-tip="hud:food">Comida <b>${food}</b> <span class="muted">−${perMin.toFixed(0)}/min</span>${foodState}</span>
      <span data-tip="hud:gasoline">Gasolina <b>${count(sim.storage, 'gasoline')}</b></span>
      <span data-tip="hud:energy">Energía <b class="${dem > prod ? 'bad' : ''}">${prod.toFixed(0)}/${dem.toFixed(0)}</b></span>
      <span>${shop}</span>`,
      true,
    );
  }

  private renderInventory(sim: Game) {
    const rows = entries(sim.storage)
      .map(([i, n]) => `<div class="it" data-tip="item:${i}"><span>${dot(i)}${itemName(i)}</span><b>${n}</b></div>`)
      .join('');
    this.set('invList', rows || '<span class="muted">vacío</span>', true);
  }

  private renderNpcs(sim: Game) {
    const head = `<div class="npcrow"><span>Población <b>${sim.population}</b> / vivienda ${sim.housingCapacity()}</span>
      <span class="${sim.hungry ? 'bad' : 'muted'}">${sim.hungry ? '¡Hambre!' : sim.canGrow() ? 'creciendo' : ''}</span></div>`;
    const rows = NPC_ROLES.map((role) => {
      const all = sim.npcs.filter((n) => n.role === role);
      if (role === 'mechanic' && !all.length) return '';
      const busy = all.filter((n) => n.jobId !== null || total(n.carry) > 0).length;
      const def = CONFIG.npc.roles[role];
      const btn = role === 'mechanic' ? '<span class="muted">taller</span>' : `<button data-assign="${role}" title="Pasar a una persona de otro rol a ${def.name}">+1</button>`;
      return `<div class="npcrow"><span>${iconHtml(ROLE_ICONS[role], 22)}${def.name}: <b>${all.length}</b> <span class="muted">(${all.length - busy} libres)</span></span>${btn}</div>`;
    }).join('');
    const opts = ['<option value="">auto (rol con menos gente)</option>']
      .concat(FREE_ROLES.map((r) => `<option value="${r}" ${sim.growthRole === r ? 'selected' : ''}>${CONFIG.npc.roles[r].name}</option>`))
      .join('');
    const growth = `<div class="npcrow"><span class="muted">Quien llegue será:</span><select data-act="growthRole">${opts}</select></div>`;
    if ((document.activeElement as HTMLElement | null)?.dataset?.act === 'growthRole') return;
    this.set('npcs', head + rows + growth, true);
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
        return `<div class="job" title="Lo hace: ${role}"><span>${iconHtml(JOB_ICONS[j.type], 16)}${JOB_NAMES[j.type]} ${what}${item}</span>${who}
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
      if (b.kind === 'factory' || sim.turretDef(b)) {
        const c = Math.round(b.condition * 100);
        lines.push(`Estado: <b class="${b.condition < CONFIG.wear.lowThreshold ? 'bad' : ''}">${c}%</b>`);
      }
      if (isElectric(b.kind) && b.kind !== 'pole') {
        const net = sim.netOf(b);
        if (!net) lines.push('<span class="bad">⚡ Sin conexión a la red</span>');
        else {
          const s = Math.round((b.critical ? net.sCritical : net.sNormal) * 100);
          lines.push(`⚡ Red ${net.id + 1}: ${net.production.toFixed(0)} / ${net.demand.toFixed(0)} · energía ${s}%`);
        }
        if (demandOf(b) > 0)
          lines.push(`<label><input type="checkbox" data-act="critical" ${b.critical ? 'checked' : ''}> Crítico (energía primero)</label>`);
      }
      const gen = CONFIG.power.generators[b.kind as BuildKind];
      if (gen?.fuel) {
        lines.push(b.running ? '<span class="good">En marcha</span>' : `<span class="bad">Parado${count(b.inv, gen.fuel) ? ': esperando a un Operario' : ': sin combustible'}</span>`);
      }
      const t = sim.turretDef(b);
      if (t?.ammo && !sim.turretReady(b)) lines.push('<span class="bad">Sin munición: esperando Transportista</span>');
      if (b.kind === 'factory') {
        const opts = ['<option value="">— sin receta —</option>']
          .concat(
            Object.entries(CONFIG.recipes)
              .filter(([id]) => sim.recipesFor(b).includes(id))
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
    const directional = ROTATABLE.includes(b.kind);
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
