/**
 * Vista del tutorial guiado en 3D: un aviso con el paso actual (texto, avance, saltar), resalte de la herramienta o del
 * panel recomendados y casilla señalada en el mapa. Toda la lógica está en `game/tutorial.ts`; aquí sólo hay DOM.
 */
import { categoryOf } from '../game/descripciones';
import type { Game } from '../game/game';
import { guideTargetTile } from '../game/guia-inicio';
import {
  KV,
  TutorialState,
  TutorialStep,
  loadTutorial,
  progress,
  saveTutorial,
  setFlag,
  skipAll,
  skipStep,
  stepAt,
  stepTutorial,
  tutorialTick,
} from '../game/tutorial';
import { TUTORIAL_TEXT, TUTORIAL_UI } from '../game/tutorialText';
import type { Tile } from '../game/types';

const $ = (id: string) => document.getElementById(id)!;

export class TutorialView {
  state: TutorialState;
  private timer = 0;
  private lastHtml = '';
  private target: { id: string; at: number; tile: Tile | null } = { id: '', at: -99, tile: null };

  constructor(private game: Game, private store: KV | null, fresh: boolean, private onExit: () => void) {
    this.state = fresh || !store ? loadTutorial({ getItem: () => null, setItem: () => {} }) : loadTutorial(store);
    $('tutorial').addEventListener('click', (ev) => {
      const act = (ev.target as HTMLElement).closest<HTMLElement>('[data-tut]')?.dataset.tut;
      if (!act) return;
      if (act === 'skip') skipStep(this.state);
      else if (act === 'skipall') skipAll(this.state);
      else if (act === 'finish') {
        setFlag(this.state, 'finish');
        stepTutorial(this.game, this.state);
      } else if (act === 'exit') return this.onExit();
      this.save();
      this.lastHtml = '';
    });
  }

  private save(): void {
    if (!this.store) return;
    try {
      saveTutorial(this.store, this.state);
    } catch {
      /* sin almacenamiento: sólo vale para esta sesión */
    }
  }

  /** Anota un gesto del jugador ('camera_moved', 'zoomed', 'tool_selected'). */
  flag(f: string): void {
    if (!this.state.flags.includes(f)) setFlag(this.state, f);
  }

  step(): TutorialStep | undefined {
    return this.state.finished ? undefined : stepAt(this.state);
  }

  /** Casilla que señala el paso actual (con caché de 2 s). */
  targetTile(): Tile | null {
    const st = this.step();
    const tg = st?.highlight?.target;
    if (!st || !tg) return null;
    if (this.target.id !== st.id || this.game.time - this.target.at > 2) this.target = { id: st.id, at: this.game.time, tile: guideTargetTile(this.game, tg) };
    return this.target.tile;
  }

  /** Reglas propias del tutorial en cada fotograma: oleada única, vida mínima del núcleo, llegada de gente. */
  tick(dt: number): void {
    tutorialTick(this.game, this.state);
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.25;
    if (stepTutorial(this.game, this.state)) {
      this.save();
      this.lastHtml = '';
    }
    this.render();
    this.highlight();
  }

  private render(): void {
    const el = $('tutorial');
    const st = this.step();
    let html: string;
    if (this.state.finished) {
      html = `<div class="g-head"><span class="g-title">¡Tutorial completado!</span></div><div class="g-text">Ya sabes lo básico. Sigue con una partida normal.</div><div class="g-foot"><button data-tut="exit">Jugar una partida</button></div>`;
    } else if (st) {
      const t = TUTORIAL_TEXT[st.id] ?? { title: st.id, text: '' };
      const p = progress(this.game, this.state);
      const fin = st.id === 'finish' ? `<button data-tut="finish">${TUTORIAL_UI.finish}</button>` : '';
      html =
        `<div class="g-head"><span class="g-title">${t.title}</span><span class="g-n">${TUTORIAL_UI.step(p.n, p.total)}</span></div>` +
        `<div class="g-text">${t.text}</div>` +
        `<div class="g-foot">${fin}<button data-tut="skip">${TUTORIAL_UI.skipStep}</button><button data-tut="skipall">${TUTORIAL_UI.skipAll}</button></div>`;
    } else html = '';
    if (html !== this.lastHtml) {
      el.innerHTML = html;
      this.lastHtml = html;
    }
    el.style.display = html ? 'block' : 'none';
  }

  /** Marca la herramienta (y su categoría) o el panel del paso. */
  private highlight(): void {
    const hl = this.step()?.highlight;
    const want = new Set<Element>();
    if (hl?.tool) {
      const tab = document.querySelector(`#cats [data-cat="${categoryOf(hl.tool)}"]`);
      const btn = document.querySelector(`#tools [data-tool="${hl.tool}"]`);
      if (tab) want.add(tab);
      if (btn) want.add(btn);
    }
    const ui = hl?.ui ? document.getElementById(hl.ui) : null;
    if (ui) want.add(ui);
    document.querySelectorAll('.tut-hl').forEach((e) => {
      if (!want.has(e)) e.classList.remove('tut-hl');
    });
    want.forEach((e) => e.classList.add('tut-hl'));
  }
}
