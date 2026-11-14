/**
 * Vista de la guía de inicio: un aviso pequeño y translúcido en un sitio fijo (columna izquierda, bajo el HUD),
 * resalte del botón/categoría recomendados y aviso corto al cumplir cada paso. Toda la lógica está en `game/guia-inicio.ts`.
 */
import { CONFIG } from '../game/config';
import { categoryOf } from '../game/descripciones';
import type { Game } from '../game/game';
import {
  GuiaState,
  GuiaStep,
  disableGuia,
  dismissCurrent,
  guiaProgress,
  guideTargetTile,
  loadGuia,
  reopenGuia,
  resetForNewGame,
  saveGuia,
  stepGuia,
  visibleStep,
} from '../game/guia-inicio';
import { GUIA_DONE, guiaText } from '../game/guia-inicio-textos';
import { Diag, RouteTile, routeFor } from '../game/guia-flujo';
import type { Tile } from '../game/types';

const $ = (id: string) => document.getElementById(id)!;

export class GuiaView {
  state: GuiaState;
  private sim: Game | null = null;
  private toast: { text: string; ttl: number } | null = null;
  private timer = 0;
  private lastHtml = '';
  private lastStepId = '';
  private targetCache: { id: string; at: number; tile: Tile | null } = { id: '', at: -99, tile: null };
  private flowCache: { id: string; at: number; diag: Diag | null; route: RouteTile[] | null } = { id: '', at: -99, diag: null, route: null };

  constructor() {
    this.state = this.load();
    $('guide').addEventListener('click', (ev) => {
      const act = (ev.target as HTMLElement).closest<HTMLElement>('[data-guide]')?.dataset.guide;
      if (!act || !this.sim) return;
      if (act === 'close') dismissCurrent(this.sim, this.state);
      else if (act === 'skip') disableGuia(this.state);
      else if (act === 'next') this.state.flags.push('next_ack');
      this.save();
      this.lastHtml = '';
    });
  }

  private load(): GuiaState {
    try {
      return loadGuia(localStorage);
    } catch {
      return loadGuia({ getItem: () => null, setItem: () => {} });
    }
  }

  private save(): void {
    try {
      saveGuia(localStorage, this.state);
    } catch {
      /* sin almacenamiento: sólo vale para esta sesión */
    }
  }

  /** Nueva partida: la guía empieza de nuevo salvo que el jugador la desactivara. */
  bind(sim: Game): void {
    this.sim = sim;
    this.state = resetForNewGame(this.load());
    this.toast = null;
    this.lastHtml = '';
    this.targetCache = { id: '', at: -99, tile: null };
  }

  /** Vuelve a abrir la guía (botón de la ayuda). */
  reopen(): void {
    reopenGuia(this.state);
    this.save();
    this.lastHtml = '';
  }

  get disabled(): boolean {
    return this.state.disabled;
  }

  /** Paso que se está proponiendo ahora (para resaltar). */
  step(): GuiaStep | undefined {
    return this.sim ? visibleStep(this.sim, this.state) : undefined;
  }

  /** Casilla que señala el paso actual (con caché de 2 s). */
  targetTile(): Tile | null {
    const st = this.step();
    const sim = this.sim;
    if (!st?.highlight?.target || !sim) return null;
    if (this.targetCache.id !== st.id || sim.time - this.targetCache.at > 2) {
      this.targetCache = { id: st.id, at: sim.time, tile: guideTargetTile(sim, st.highlight.target) };
    }
    return this.targetCache.tile;
  }

  /** Diagnóstico y ruta de ejemplo del paso actual (se recalculan cada 0,5 s). */
  private flow(): { diag: Diag | null; route: RouteTile[] | null } {
    const st = this.step();
    const sim = this.sim;
    if (!st || !sim) return { diag: null, route: null };
    const c = this.flowCache;
    if (c.id !== st.id || sim.time - c.at > 0.5) {
      this.flowCache = {
        id: st.id,
        at: sim.time,
        diag: st.diagnose?.(sim) ?? null,
        route: st.highlight?.route && st.link ? routeFor(sim, st.link) : null,
      };
    }
    return this.flowCache;
  }

  /** Aviso concreto de por qué se ha atascado el jugador (con su casilla, si la tiene). */
  diagnosis(): Diag | null {
    return this.flow().diag;
  }

  /** Ruta de ejemplo: casillas con el sentido de la cinta o tubería. */
  route(): RouteTile[] | null {
    return this.flow().route;
  }

  update(sim: Game, dt: number): void {
    this.sim = sim;
    if (this.toast) {
      this.toast.ttl -= dt;
      if (this.toast.ttl <= 0) this.toast = null;
    }
    this.timer -= dt;
    if (this.timer > 0) {
      this.highlight(this.step());
      return;
    }
    this.timer = 0.25;
    for (const ev of stepGuia(sim, this.state)) {
      this.toast = { text: `✓ ${GUIA_DONE[ev.id] ?? 'Paso cumplido'}`, ttl: CONFIG.guia.toastSeconds };
      this.save();
    }
    this.render(sim);
    this.highlight(this.step());
  }

  private render(sim: Game): void {
    const el = $('guide');
    const st = visibleStep(sim, this.state);
    let html = '';
    if (this.toast) {
      html = `<div class="g-done">${this.toast.text}</div>`;
    } else if (st) {
      const t = guiaText(sim, st);
      const diag = this.diagnosis();
      const p = guiaProgress(this.state);
      const next = st.id === 'next' ? '<button data-guide="next">Entendido</button>' : '';
      html =
        `<div class="g-head"><span class="g-title">${t.title}</span><span class="g-n">${st.urgent ? '¡Ahora!' : `Paso ${p.n}/${p.total}`}</span>` +
        `<button data-guide="close" title="Cerrar este aviso">✕</button></div>` +
        `<div class="g-text">${t.text}</div>` +
        (t.missing ? `<div class="g-miss">${t.missing}</div>` : '') +
        (diag ? `<div class="g-miss">⚠ ${diag.text}</div>` : '') +
        `<div class="g-foot">${next}<button data-guide="skip" title="No volver a mostrar la guía (se reabre desde la ayuda)">Saltar guía</button></div>`;
    }
    const key = html;
    if (key !== this.lastHtml) {
      el.innerHTML = html;
      this.lastHtml = key;
    }
    el.style.display = html ? 'block' : 'none';
    el.classList.toggle('g-toast', !!this.toast);
  }

  /** Marca el botón de la herramienta (y su categoría) recomendados. */
  private highlight(st: GuiaStep | undefined): void {
    const hl = st?.highlight;
    const want = new Set<Element>();
    if (hl && !this.toast) {
      if (hl.tool) {
        const tab = document.querySelector(`#cats [data-cat="${categoryOf(hl.tool)}"]`);
        const btn = document.querySelector(`#tools [data-tool="${hl.tool}"]`);
        if (tab) want.add(tab);
        if (btn) want.add(btn);
      }
      const ui = hl.ui ? document.getElementById(hl.ui) : null;
      if (ui) want.add(ui);
    }
    // Idempotente: no se quita y vuelve a poner la clase (reiniciaría la animación).
    document.querySelectorAll('.guide-hl').forEach((e) => {
      if (!want.has(e)) e.classList.remove('guide-hl');
    });
    want.forEach((e) => e.classList.add('guide-hl'));
  }
}
