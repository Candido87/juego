/**
 * Pantalla del árbol de tecnología (HTML/CSS, sin Phaser ni Three): nodos conectados por líneas en ramas, con estados,
 * tooltip generado de los datos, zoom con la rueda, arrastre, filtro por rama, búsqueda y marca de lo recomendado.
 * La lógica (compra, estados, textos) vive en `game/`; aquí sólo se dibuja y se recogen los clics.
 */
import { TECH_BRANCHES, TechBranch } from '../game/config';
import type { Game } from '../game/game';
import { TREE, TreeLayout, layoutTree, techIconKind, techTip, techVisible } from '../game/arbol';
import { techNode } from '../game/tecnologia';
import { CONFIG } from '../game/config';
import type { BuildKind } from '../game/types';

export interface TechHost {
  /** Aviso corto en pantalla. */
  flash(msg: string): void;
  /** Pone o quita la pausa de la partida. */
  setPaused(paused: boolean): void;
  /** Icono HTML de un edificio (vacío si no hay). */
  icon(kind: BuildKind): string;
}

const MIN_ZOOM = 0.45;
const MAX_ZOOM = 1.6;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export class TechView {
  private el = document.getElementById('tech')!;
  private game: Game | null = null;
  private open = false;
  private built = false;
  private zoom = 1;
  private panX = 12;
  private panY = 12;
  private branch: TechBranch | null = null;
  private query = '';
  private pauseWhileOpen = false;
  private layout!: TreeLayout;
  private nodes = new Map<string, HTMLElement>();
  private edges = new Map<string, SVGPathElement>();
  private lanes = new Map<TechBranch, HTMLElement>();
  private timer = 0;
  private recommended: string | null = null;
  private view!: HTMLElement;
  private canvas!: HTMLElement;
  private tip!: HTMLElement;
  private drag: { x: number; y: number; px: number; py: number; moved: boolean } | null = null;

  constructor(private host: TechHost) {}

  bind(game: Game): void {
    this.game = game;
    this.built = false;
    if (this.open) this.toggle(false);
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** Abre o cierra la pantalla. No pausa la partida salvo que se marque la casilla. */
  toggle(open = !this.open): void {
    if (open && !this.game) return;
    this.open = open;
    this.el.style.display = open ? 'flex' : 'none';
    if (open) {
      if (!this.built) this.build();
      this.refresh();
      if (this.pauseWhileOpen) this.host.setPaused(true);
    } else {
      this.tip.style.display = 'none';
      if (this.pauseWhileOpen) this.host.setPaused(false);
    }
  }

  /** Refresca los estados mientras está abierta (4 veces por segundo). */
  update(dt: number): void {
    if (!this.open || !this.game) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.25;
    this.refresh();
  }

  // ---------- construcción ----------

  private build(): void {
    this.layout = layoutTree();
    this.nodes.clear();
    this.edges.clear();
    this.lanes.clear();
    const L = this.layout;
    const opts = ['<option value="">Todas las ramas</option>'].concat(TECH_BRANCHES.map((b) => `<option value="${b}">${b}</option>`)).join('');
    this.el.innerHTML = `
      <div class="th">
        <h3>Investigación</h3>
        <span class="tpts" id="tPts"></span>
        <select id="tBranch" title="Mostrar sólo una rama">${opts}</select>
        <input id="tSearch" type="search" placeholder="Buscar (nombre o lo que desbloquea)" />
        <label title="Pausa la partida mientras miras el árbol"><input id="tPause" type="checkbox" ${this.pauseWhileOpen ? 'checked' : ''} /> Pausar</label>
        <button data-tfit title="Ver el árbol entero (arrastra y usa la rueda para acercar)">Ver todo</button>
        <button data-tclose title="Cerrar (T o Esc)">✕</button>
      </div>
      <div class="thint" id="tHint"></div>
      <div class="tview" id="tView"><div class="tcanvas" id="tCanvas" style="width:${L.width}px;height:${L.height}px"></div></div>
      <div class="ttip" id="tTip"></div>`;
    this.view = this.el.querySelector<HTMLElement>('#tView')!;
    this.canvas = this.el.querySelector<HTMLElement>('#tCanvas')!;
    this.tip = this.el.querySelector<HTMLElement>('#tTip')!;
    // Carriles con el nombre de la rama.
    for (const lane of L.lanes) {
      const d = document.createElement('div');
      d.className = 'tlane';
      d.style.cssText = `top:${lane.y}px;height:${lane.h}px;width:${L.width}px`;
      d.innerHTML = `<span>${esc(lane.branch)}</span>`;
      this.canvas.appendChild(d);
      this.lanes.set(lane.branch, d);
    }
    // Líneas de requisito.
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'tlines');
    svg.setAttribute('width', String(L.width));
    svg.setAttribute('height', String(L.height));
    for (const e of L.edges) {
      const path = document.createElementNS(ns, 'path');
      const dx = Math.max(30, Math.abs(e.x2 - e.x1) / 2);
      path.setAttribute('d', `M${e.x1},${e.y1} C${e.x1 + dx},${e.y1} ${e.x2 - dx},${e.y2} ${e.x2},${e.y2}`);
      svg.appendChild(path);
      this.edges.set(`${e.from}>${e.to}`, path);
    }
    this.canvas.appendChild(svg);
    // Nodos.
    for (const n of CONFIG.tech) {
      const p = L.nodes.get(n.id)!;
      const kind = techIconKind(n);
      const d = document.createElement('div');
      d.className = 'tnode';
      d.dataset.id = n.id;
      d.style.cssText = `left:${p.x}px;top:${p.y}px;width:${TREE.nodeW}px;height:${TREE.nodeH}px`;
      d.innerHTML = `<span class="ticon">${kind ? this.host.icon(kind) || '⚙' : '⚙'}</span><span class="tname">${esc(n.name)}</span><span class="tcost"><b>${n.cost}</b> pts</span><i class="tbar"></i><em class="tstar" title="Recomendado como siguiente paso">★</em>`;
      this.canvas.appendChild(d);
      this.nodes.set(n.id, d);
    }
    this.wire();
    this.fit();
    this.built = true;
  }

  private wire(): void {
    // Cabecera.
    this.el.querySelector<HTMLSelectElement>('#tBranch')!.addEventListener('change', (ev) => {
      this.branch = ((ev.target as HTMLSelectElement).value || null) as TechBranch | null;
      // Al elegir una rama el árbol se desplaza hasta ella.
      const lane = this.layout.lanes.find((l) => l.branch === this.branch);
      if (lane) this.panY = 8 - lane.y * this.zoom;
      else this.fit(false);
      this.applyTransform();
      this.refresh();
    });
    this.el.querySelector<HTMLInputElement>('#tSearch')!.addEventListener('input', (ev) => {
      this.query = (ev.target as HTMLInputElement).value;
      this.refresh();
    });
    this.el.querySelector<HTMLInputElement>('#tPause')!.addEventListener('change', (ev) => {
      this.pauseWhileOpen = (ev.target as HTMLInputElement).checked;
      this.host.setPaused(this.pauseWhileOpen);
    });
    this.el.addEventListener('click', (ev) => {
      const t = ev.target as HTMLElement;
      if (t.closest('[data-tclose]')) return this.toggle(false);
      if (t.closest('[data-tfit]')) return this.fit(true);
    });
    // Zoom con la rueda, hacia el cursor.
    this.view.addEventListener(
      'wheel',
      (ev) => {
        ev.preventDefault();
        const r = this.view.getBoundingClientRect();
        const mx = ev.clientX - r.left;
        const my = ev.clientY - r.top;
        const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * (ev.deltaY < 0 ? 1.12 : 1 / 1.12)));
        const k = z / this.zoom;
        this.panX = mx - (mx - this.panX) * k;
        this.panY = my - (my - this.panY) * k;
        this.zoom = z;
        this.applyTransform();
      },
      { passive: false },
    );
    // Arrastre para desplazar; un clic sin arrastre compra el nodo.
    this.view.addEventListener('pointerdown', (ev) => {
      this.drag = { x: ev.clientX, y: ev.clientY, px: this.panX, py: this.panY, moved: false };
      this.view.setPointerCapture(ev.pointerId);
    });
    this.view.addEventListener('pointermove', (ev) => {
      if (this.drag) {
        const dx = ev.clientX - this.drag.x;
        const dy = ev.clientY - this.drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) this.drag.moved = true;
        if (this.drag.moved) {
          this.panX = this.drag.px + dx;
          this.panY = this.drag.py + dy;
          this.applyTransform();
          this.tip.style.display = 'none';
          return;
        }
      }
      this.hover(ev);
    });
    this.view.addEventListener('pointerup', (ev) => {
      const d = this.drag;
      this.drag = null;
      if (d && !d.moved) {
        const id = (ev.target as HTMLElement).closest<HTMLElement>('.tnode')?.dataset.id;
        if (id) this.buy(id);
      }
    });
    this.view.addEventListener('pointerleave', () => (this.tip.style.display = 'none'));
  }

  private applyTransform(): void {
    this.canvas.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
  }

  /**
   * Coloca el árbol. `all` = que quepa entero en la ventana (puede quedar pequeño); si no, al abrir se ajusta al ancho con un
   * zoom que se pueda leer (mínimo 0,8) y se arrastra o se usa la rueda para ver el resto de las ramas.
   */
  fit(all = false): void {
    const r = this.view.getBoundingClientRect();
    const w = r.width || 900;
    const h = r.height || 500;
    const byWidth = w / (this.layout.width + 24);
    const wanted = all ? Math.min(byWidth, h / (this.layout.height + 24)) : Math.max(0.8, Math.min(1, byWidth));
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, wanted));
    this.panX = Math.max(8, (w - this.layout.width * this.zoom) / 2);
    this.panY = all ? Math.max(8, (h - this.layout.height * this.zoom) / 2) : 8;
    this.applyTransform();
  }

  // ---------- compra y tooltip ----------

  private buy(id: string): void {
    const g = this.game;
    if (!g) return;
    const can = g.canResearch(id);
    if (!can.ok) return this.host.flash(can.reason ?? 'No se puede investigar');
    // El aviso lo da el evento `researched` de la vista (con el nombre del nodo); aquí sólo el efecto.
    g.research(id);
    const el = this.nodes.get(id)!;
    el.classList.add('bought');
    setTimeout(() => el.classList.remove('bought'), 1100);
    this.refresh();
  }

  private hover(ev: PointerEvent): void {
    const id = (ev.target as HTMLElement).closest<HTMLElement>('.tnode')?.dataset.id;
    if (!id || !this.game) {
      this.tip.style.display = 'none';
      return;
    }
    const t = techTip(this.game, id);
    const unlocks = t.unlocks.map((u) => `<li>${esc(u)}</li>`).join('');
    const req = t.requires.length ? t.requires.map((r) => `<span class="${r.done ? 'good' : 'bad'}">${r.done ? '✓' : '✗'} ${esc(r.name)}</span>`).join(' · ') : '<span class="muted">ninguno</span>';
    this.tip.innerHTML = `<div class="tt-title">${esc(t.title)}${t.recommended ? ' <em>★ recomendado</em>' : ''}</div>
      <div class="muted">${esc(t.branch)} · <b>${t.cost}</b> puntos</div>
      <div class="tt-sec"><b>Desbloquea</b><ul>${unlocks}</ul></div>
      <div class="tt-sec"><b>Requisitos:</b> ${req}</div>
      <div class="tt-state s-${t.state}">${esc(t.stateText)}${t.reason ? `<br>${esc(t.reason)}` : t.state === 'available' ? '<br>Haz clic para investigar' : ''}</div>`;
    this.tip.style.display = 'block';
    const r = this.el.getBoundingClientRect();
    const w = this.tip.offsetWidth;
    const h = this.tip.offsetHeight;
    let x = ev.clientX - r.left + 16;
    let y = ev.clientY - r.top + 16;
    if (x + w > r.width - 8) x = ev.clientX - r.left - w - 16;
    if (y + h > r.height - 8) y = Math.max(8, r.height - h - 8);
    this.tip.style.left = `${Math.max(8, x)}px`;
    this.tip.style.top = `${y}px`;
  }

  // ---------- estado ----------

  private refresh(): void {
    const g = this.game;
    if (!g || !this.built) return;
    this.recommended = g.recommendedTech();
    const ppm = g.pointsPerMinute();
    const res = g.researchers().length;
    this.el.querySelector('#tPts')!.innerHTML = `Puntos <b>${Math.floor(g.researchPoints)}</b> <span class="${ppm > 0 ? 'good' : 'muted'}">+${ppm.toFixed(1)}/min</span> <span class="muted">· ${g.labs().length} lab., ${res}/${g.researchSlots()} investigadores</span>`;
    const hint = g.labs().length ? (res ? (ppm > 0 ? '' : 'El laboratorio no produce: revisa la energía.') : 'Asigna Investigadores en el panel de NPCs (botón +1 de Investigador).') : 'Construye un Laboratorio (menú Servicios) y asígnale Investigadores para producir puntos.';
    const hintEl = this.el.querySelector<HTMLElement>('#tHint')!;
    hintEl.textContent = hint;
    hintEl.style.display = hint ? 'block' : 'none';
    const visible = new Set<string>();
    for (const n of CONFIG.tech) {
      const el = this.nodes.get(n.id)!;
      const state = g.techState(n.id);
      el.className = `tnode s-${state}${this.recommended === n.id ? ' rec' : ''}${techVisible(n, this.branch, this.query) ? '' : ' dim'}${el.classList.contains('bought') ? ' bought' : ''}`;
      if (techVisible(n, this.branch, this.query)) visible.add(n.id);
      const bar = el.querySelector<HTMLElement>('.tbar');
      if (bar) bar.style.width = state === 'nopoints' ? `${Math.min(100, (g.researchPoints / n.cost) * 100)}%` : state === 'available' || state === 'done' ? '100%' : '0';
    }
    for (const [key, path] of this.edges) {
      const [from, to] = key.split('>');
      const done = g.researched.has(from);
      path.setAttribute('class', `${done ? 'on' : ''}${visible.has(from) && visible.has(to) ? '' : ' dim'}`);
      void techNode;
    }
    for (const [branch, el] of this.lanes) el.classList.toggle('dim', !!this.branch && this.branch !== branch);
  }
}
