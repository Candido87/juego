/** Interfaz HTML superpuesta (barra de herramientas y marcadores). */
import { CONFIG } from '../game/config';
import type { Game } from '../game/game';
import { BuildKind, Dir, rotateCW } from '../game/types';

export type Tool = BuildKind | 'remove' | null;

export const ui = {
  tool: 'belt' as Tool,
  dir: 0 as Dir,
  paused: false,
};

/** Flechas en pantalla para cada dirección de la cuadrícula (+x va abajo-derecha en isométrico). */
export const DIR_ARROWS = ['↘', '↙', '↖', '↗'];

const $ = (id: string) => document.getElementById(id)!;

export class Hud {
  onRestart: () => void = () => {};
  onCallWave: () => void = () => {};
  private last = new Map<string, string>();
  private msgTimer = 0;

  constructor() {
    document.querySelectorAll<HTMLButtonElement>('#toolbar button[data-tool]').forEach((btn) => {
      const tool = btn.dataset.tool as Tool;
      const cost = tool && tool !== 'remove' ? ` (${CONFIG.cost[tool]})` : '';
      btn.textContent += cost;
      btn.addEventListener('click', () => this.setTool(ui.tool === tool ? null : tool));
    });
    $('pause').addEventListener('click', () => {
      ui.paused = !ui.paused;
      $('pause').textContent = ui.paused ? 'Reanudar' : 'Pausa';
    });
    $('restart').addEventListener('click', () => this.onRestart());
    $('callWave').addEventListener('click', () => this.onCallWave());
    this.setTool(ui.tool);
  }

  setTool(tool: Tool) {
    ui.tool = tool;
    document.querySelectorAll<HTMLButtonElement>('#toolbar button[data-tool]').forEach((b) => {
      b.classList.toggle('active', b.dataset.tool === tool);
    });
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

  private set(id: string, value: string) {
    if (this.last.get(id) === value) return;
    this.last.set(id, value);
    $(id).textContent = value;
  }

  update(sim: Game, info: string, dt: number) {
    this.set('credits', String(sim.credits));
    this.set('core', String(Math.max(0, sim.coreHp)));
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
  }
}

let hud: Hud | null = null;
export function getHud(): Hud {
  return (hud ??= new Hud());
}
