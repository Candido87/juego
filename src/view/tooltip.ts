/**
 * Gestor de tooltips en el DOM. Cualquier elemento con `data-tip="tipo:id"` enseña un panel tras `ui.tipDelay` ms:
 *   build:<edificio>  (botón del menú de construcción; el panel va ENCIMA del menú)
 *   item:<material>   (fila del Almacén; el panel va al lado del panel)
 *   hud:<indicador>   (HUD; el panel va debajo)
 * El contenido sale de `game/tooltips.ts`; la colocación de `tipPlacement.ts` (nunca fuera de pantalla, nunca sobre el botón).
 */
import { CONFIG } from '../game/config';
import type { Game } from '../game/game';
import { recipeTip } from '../game/recetas';
import { HUD_KEYS, HudKey, buildTip, hudTip, itemTip } from '../game/tooltips';
import { BUILD_KINDS, BuildKind, ITEM_IDS, ItemId } from '../game/types';
import { ITEM_COLORS } from './itemColors';
import { Rect, TipMode, placeTip } from './tipPlacement';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const dot = (i: ItemId) => `<span class="dot" style="background:#${ITEM_COLORS[i].toString(16).padStart(6, '0')}"></span>`;
const rect = (el: Element): Rect => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
};
/** Recorta una lista larga: las 6 primeras y "…y N más". */
const list = (items: string[], max = 6) => (items.length <= max ? items : [...items.slice(0, max), `…y ${items.length - max} más`]).map(esc).join('; ');

function buildHtml(g: Game, kind: BuildKind, key?: string): string {
  const t = buildTip(g, kind, key);
  const cost = t.cost
    .map((c) => `<span class="${c.ok ? 'good' : 'bad'}">${dot(c.item)}${c.need} ${esc(CONFIG.items[c.item])} <span class="muted">(${c.have})</span></span>`)
    .join(' · ');
  return `<div class="tt-title">${esc(t.title)}${t.key ? ` <span class="muted">[${t.key}]</span>` : ''}</div>
    <div>${esc(t.que)}</div>
    <div class="muted">${esc(t.sirve)}</div>
    ${t.locked ? `<div class="bad">🔒 ${esc(t.locked)}</div>` : ''}
    <div class="tt-sec">Coste: ${cost || '—'}</div>
    <div class="tt-stats">${t.stats.map((s) => `<div>${esc(s)}</div>`).join('')}</div>`;
}

function itemHtml(g: Game, item: ItemId): string {
  const t = itemTip(g, item);
  const badge =
    t.status === 'falta'
      ? `<span class="bad">▼ Falta</span> <span class="muted">${esc(t.reason)}</span>`
      : t.status === 'sobra'
        ? `<span class="good">▲ Sobra</span> <span class="muted">${esc(t.reason)}</span>`
        : '';
  return `<div class="tt-title">${dot(item)}${esc(t.title)}: <b>${t.amount}</b></div>
    <div>${esc(t.text)}</div>
    ${badge ? `<div>${badge}</div>` : ''}
    <div class="tt-sec"><span class="muted">Se produce en:</span> ${list(t.producedIn) || '—'}</div>
    <div class="tt-sec"><span class="muted">Se usa en:</span> ${list(t.usedIn) || '—'}</div>`;
}

function recipeHtml(g: Game, id: string): string {
  const t = recipeTip(g, id);
  return `<div class="tt-title">${esc(t.title)}</div>
    <div>${esc(t.formula)}</div>
    <div class="muted">Produce: ${esc(t.produces)} · ⏱ ${t.time} s · ⚡ ${t.energy}/s</div>
    ${t.reason ? `<div class="bad">🔒 ${esc(t.reason)}</div>` : ''}
    <div class="tt-sec"><span class="muted">Se necesita en:</span> ${list(t.usedIn) || '—'}</div>`;
}

function hudHtml(g: Game, key: HudKey): string {
  const t = hudTip(g, key);
  return `<div class="tt-title">${esc(t.title)}</div><div>${esc(t.means)}</div><div class="warn tt-sec">${esc(t.zero)}</div>`;
}

export class TooltipManager {
  private el = document.getElementById('tip')!;
  private spec: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private refresh: ReturnType<typeof setInterval> | null = null;

  constructor(private game: () => Game | null) {
    document.addEventListener('mouseover', (ev) => {
      const target = ev.target as Element | null;
      const el = target?.closest?.('[data-tip]') as HTMLElement | null;
      if (!el) return this.hide();
      const spec = el.dataset.tip!;
      if (spec === this.spec) return;
      this.hide();
      this.spec = spec;
      this.timer = setTimeout(() => this.show(), CONFIG.ui.tipDelay);
    });
    document.addEventListener('mouseout', (ev) => {
      if (!(ev as MouseEvent).relatedTarget) this.hide(); // el ratón sale de la ventana
    });
    for (const t of ['mousedown', 'wheel', 'keydown']) document.addEventListener(t, () => this.hide(), { passive: true });
    window.addEventListener('blur', () => this.hide());
  }

  hide(): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.refresh) clearInterval(this.refresh);
    this.timer = null;
    this.refresh = null;
    this.spec = null;
    this.el.style.display = 'none';
  }

  private anchor(): HTMLElement | null {
    return this.spec ? (document.querySelector(`[data-tip="${this.spec}"]`) as HTMLElement | null) : null;
  }

  private show(): void {
    this.timer = null;
    this.render();
    if (this.refresh) clearInterval(this.refresh);
    this.refresh = setInterval(() => this.render(), 250); // el coste en verde/rojo y las cantidades se mantienen al día
  }

  private render(): void {
    const g = this.game();
    const anchor = this.anchor();
    if (!g || !anchor || !this.spec) return this.hide();
    const [type, id] = this.spec.split(':');
    let html = '';
    let mode: TipMode = 'above';
    if (type === 'build' && (BUILD_KINDS as readonly string[]).includes(id)) html = buildHtml(g, id as BuildKind, anchor.dataset.key || undefined);
    else if (type === 'item' && (ITEM_IDS as readonly string[]).includes(id)) {
      html = itemHtml(g, id as ItemId);
      mode = 'side';
    } else if (type === 'recipe') {
      html = recipeHtml(g, id);
      mode = 'side';
    } else if (type === 'hud' && (HUD_KEYS as readonly string[]).includes(id)) {
      html = hudHtml(g, id as HudKey);
      mode = 'below';
    } else return this.hide();
    if (this.el.innerHTML !== html) this.el.innerHTML = html;
    this.el.style.display = 'block';
    this.el.style.left = '0px';
    this.el.style.top = '0px';
    const size = { w: this.el.offsetWidth, h: this.el.offsetHeight };
    const panel = anchor.closest('.panel') ?? anchor;
    const p = placeTip(rect(anchor), rect(panel), size, { w: window.innerWidth, h: window.innerHeight }, mode, CONFIG.ui.tipGap, CONFIG.ui.tipMargin);
    this.el.style.left = `${Math.round(p.x)}px`;
    this.el.style.top = `${Math.round(p.y)}px`;
  }
}
