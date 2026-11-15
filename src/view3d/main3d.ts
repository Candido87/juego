/**
 * Arranque de la vista 3D: crea el MISMO `Game` que la 2D, lo avanza y conecta la interfaz HTML
 * compartida (`src/view/ui.ts`, sin Phaser) con la escena de Three.js.
 */
import { botTick } from '../game/bot';
import { HELP_CONTROLS } from '../game/ayuda';
import { Game } from '../game/game';
import { BuildKind, Ore, Tile, dirBetween } from '../game/types';
import { generateWorld, heightAt, oreAt } from '../game/world';
import { getHud, itemName, ui } from '../view/ui';
import { setupBench, wiggle } from './bench';
import { Options, loadOptions, saveOptions } from './options';
import { OPT_OFF, OPT_ON, View3D } from './scene3d';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const ORE_NAMES = ['', 'hierro', 'cobre', 'carbón', 'piedra', 'madera', 'petróleo', 'azufre'];

/** Controles de la ayuda en 3D: los de siempre más los de la cámara y las opciones. */
const HELP_3D: [string, string][] = [
  ...HELP_CONTROLS.slice(0, 3),
  ['Z / C', 'Girar la cámara 90° (también los botones ⟲ ⟳)'],
  ['W A S D / flechas', 'Mover la cámara'],
  ...HELP_CONTROLS.slice(3),
  ['O', 'Opciones (sombras, velocidad, rendimiento)'],
];

/** Escenario de pruebas visuales: cintas con curva, tuberías, torretas de cada tipo, muros y (opcional) una oleada. */
function demo(game: Game, wave: boolean) {
  const put = (kind: BuildKind, x: number, y: number, dir: 0 | 1 | 2 | 3 = 0) => {
    game.unlockedBuildings.add(kind);
    const b = game.place(kind, x, y, dir);
    if (b) game.completeBuilding(b);
    if (b && kind.startsWith('turret')) b.inv = { ammo: 50, battery: 5 };
    return b;
  };
  const cx = game.core.x;
  const cy = game.core.y;
  for (let i = 0; i < 5; i++) put('belt', cx + 4 + i, cy + 4, 0);
  put('belt', cx + 9, cy + 4, 1);
  for (let i = 1; i < 4; i++) put('belt', cx + 9, cy + 4 + i, 1);
  put('belt_fast', cx + 9, cy + 8, 2);
  put('belt_fast', cx + 8, cy + 8, 2);
  for (let i = 0; i < 4; i++) put('pipeline', cx + 4 + i, cy + 6, 0);
  put('pipeline', cx + 7, cy + 7, 0);
  put('pipeline', cx + 7, cy + 5, 0);
  put('pipeline', cx + 8, cy + 6, 0);
  put('pump', cx + 3, cy + 6);
  put('refinery', cx + 9, cy + 6);
  put('drill', cx + 3, cy + 4);
  put('factory', cx + 4, cy + 2);
  put('generator', cx + 6, cy + 2);
  put('storage', cx + 8, cy + 2);
  put('house', cx - 3, cy + 4);
  put('workshop', cx - 5, cy + 4);
  put('solar', cx - 3, cy + 6);
  put('turbine', cx - 5, cy + 6);
  const turrets: BuildKind[] = ['turret_bullet', 'turret_laser', 'turret_fire', 'turret_frost'];
  turrets.forEach((t, i) => put(t, cx - 4 + i * 2, cy - 4));
  for (let i = 0; i < 8; i++) put(i < 3 ? 'wall_wood' : i < 6 ? 'wall_stone' : 'wall_metal', cx - 5 + i, cy - 7);
  for (let i = 1; i < 4; i++) put('wall_stone', cx + 3, cy - 7 + i);
  if (wave) game.callWaveNow();
}

async function start() {
  if (!innerWidth || !innerHeight) return requestAnimationFrame(start);
  const q = new URLSearchParams(location.search);
  const seed = Number(q.get('seed') ?? 7);
  const map = Number(q.get('map') ?? 0);
  const bench = q.get('bench') === '1';
  const game = new Game({ seed, noWaves: q.get('waves') === '0' || bench, world: map ? generateWorld(seed, map, map) : undefined });
  const options: Options = loadOptions(localStorage);
  const opts = q.get('opt') === '0' ? { ...OPT_OFF } : { ...OPT_ON };
  opts.shadows = q.get('shadows') === '0' ? false : options.shadows;
  if (q.get('chunk')) opts.chunk = Number(q.get('chunk'));
  const view = new View3D($('v'), game, opts);
  await view.init((d, t) => ($('load').textContent = `Cargando modelos… ${d}/${t}`));
  $('load').remove();
  (window as unknown as { __v3: unknown }).__v3 = { view, game, ui };
  if (bench) setupBench(game, { objects: Number(q.get('objs') ?? 1500), enemies: Number(q.get('enemies') ?? 300) });
  if (bench) view.rig.zoom = Number(q.get('zoom') ?? 0.6);
  if (q.get('demo')) demo(game, q.get('demo') === 'wave');

  // ---------- interfaz compartida ----------
  const hud = getHud();
  hud.helpControls = HELP_3D;
  hud.bind(game);
  hud.onRestart = () => {
    const p = new URLSearchParams(location.search);
    p.set('seed', String(Math.floor(Math.random() * 1e9)));
    location.search = p.toString();
  };
  view.onMessage = (t) => hud.flash(t);
  // Alto real del HUD: los paneles flotantes se colocan debajo y no lo pisan.
  new ResizeObserver(() => document.documentElement.style.setProperty('--hudh', `${$('hud').offsetHeight + 8}px`)).observe($('hud'));
  const auto = q.get('auto') === '1';
  let speed = Number(q.get('speed') ?? options.speed);

  // ---------- construir, quitar y seleccionar (misma lógica que la 2D, todo vía Game) ----------
  const placeAt = (t: Tile) => {
    if (ui.tool === 'remove') return void game.remove(t.x, t.y);
    if (!ui.tool) return;
    const check = game.canPlace(ui.tool, t.x, t.y);
    if (!check.ok) return hud.flash(check.reason ?? 'No se puede construir');
    const b = game.place(ui.tool, t.x, t.y, ui.dir);
    // Al colocar una fábrica se abre el panel para elegir su receta.
    if (b && b.kind === 'factory') {
      ui.selected = b.id;
      hud.openRecipes();
    }
  };
  view.onClick = (t, button) => {
    if (button === 2) {
      hud.setTool(null);
      ui.selected = null;
    } else if (button === 0 && t) {
      if (ui.tool === null) ui.selected = game.buildingAt(t.x, t.y)?.id ?? null;
      else placeAt(t);
    }
  };
  // Mayús + arrastrar: traza cintas o tuberías casilla a casilla orientándolas según el movimiento.
  let painting: Tile | null = null;
  const paintable = () => ui.tool === 'belt' || ui.tool === 'belt_fast' || ui.tool === 'pipeline';
  view.onDown = (t, ev) => {
    if (!ev.shiftKey || !paintable() || !t) return false;
    painting = { ...t };
    placeAt(t);
    return true;
  };
  view.onPaint = (target) => {
    if (!painting) return;
    let cur: Tile = painting;
    let guard = 0;
    while ((cur.x !== target.x || cur.y !== target.y) && guard++ < 64) {
      const dx = target.x - cur.x;
      const dy = target.y - cur.y;
      const next: Tile = Math.abs(dx) >= Math.abs(dy) ? { x: cur.x + Math.sign(dx), y: cur.y } : { x: cur.x, y: cur.y + Math.sign(dy) };
      const dir = dirBetween(cur, next)!;
      ui.dir = dir;
      game.rotate(cur.x, cur.y, dir);
      const existing = game.buildingAt(next.x, next.y);
      if (existing?.kind === ui.tool) game.rotate(next.x, next.y, dir);
      else if (!existing) placeAt(next);
      cur = next;
    }
    painting = cur;
  };
  window.addEventListener('pointerup', () => (painting = null));

  // ---------- opciones y pausa ----------
  const applyOptions = () => {
    saveOptions(localStorage, options);
    if (view.opts.shadows !== options.shadows) view.setShadows(options.shadows);
    speed = options.speed;
    $('perf').style.display = options.perf ? 'flex' : 'none';
  };
  const renderOptions = () => {
    const seg = (key: string, vals: [string, string][], cur: string) =>
      `<span class="oseg">${vals.map(([v, n]) => `<button data-opt="${key}:${v}" class="${v === cur ? 'active' : ''}">${n}</button>`).join('')}</span>`;
    $('options').innerHTML =
      `<h3>Opciones <button data-optclose title="Cerrar (O o Esc)">✕</button></h3>` +
      `<div class="orow"><span>Sombras</span>${seg('shadows', [['1', 'Sí'], ['0', 'No']], options.shadows ? '1' : '0')}</div>` +
      `<div class="orow"><span>Velocidad del juego</span>${seg('speed', [['1', 'x1'], ['2', 'x2'], ['4', 'x4']], String(options.speed))}</div>` +
      `<div class="orow"><span>Mostrar rendimiento</span>${seg('perf', [['1', 'Sí'], ['0', 'No']], options.perf ? '1' : '0')}</div>` +
      `<div class="orow"><span>Guía de inicio</span><button data-optguide>${hud.guia.disabled ? 'Activar' : 'Reiniciar'}</button></div>`;
  };
  const optionsOpen = () => $('options').style.display === 'block';
  const toggleOptions = (open = !optionsOpen()) => {
    $('options').style.display = open ? 'block' : 'none';
    if (open) {
      hud.closeHelp();
      renderOptions();
    }
  };
  $('options').addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement;
    if (t.closest('[data-optclose]')) return toggleOptions(false);
    if (t.closest('[data-optguide]')) {
      hud.guia.reopen();
      return toggleOptions(false);
    }
    const o = t.closest<HTMLElement>('[data-opt]')?.dataset.opt;
    if (!o) return;
    const [k, v] = o.split(':');
    if (k === 'shadows') options.shadows = v === '1';
    if (k === 'speed') options.speed = Number(v);
    if (k === 'perf') options.perf = v === '1';
    applyOptions();
    renderOptions();
  });
  $('optBtn').onclick = () => toggleOptions();
  $('rl').onclick = () => view.rig.rotate(-1);
  $('rr').onclick = () => view.rig.rotate(1);
  $('resume').onclick = () => hud.togglePause();
  $('pauseOpt').onclick = () => toggleOptions(true);
  $('pauseHelp').onclick = () => (toggleOptions(false), hud.toggleHelp());
  $('pauseNew').onclick = () => hud.onRestart();
  $('helpBtn').addEventListener('click', () => toggleOptions(false));
  applyOptions();

  // ---------- teclado (igual que la 2D; la cámara gira con Z/C) ----------
  window.addEventListener('keydown', (ev) => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes((ev.target as HTMLElement)?.tagName)) return;
    const k = ev.key.toLowerCase();
    if (k === 'r') hud.rotate();
    else if (k === 'h') (toggleOptions(false), hud.toggleHelp());
    else if (k === 'o') toggleOptions();
    else if (k === 'escape') {
      if (optionsOpen()) return toggleOptions(false);
      if (hud.closeHelp()) return;
      hud.setTool(null);
      ui.selected = null;
    } else if (k === 'x') hud.setTool('remove');
    else if (k === 'p') hud.togglePause();
    else if (k === 'q') hud.cycleCategory(-1);
    else if (k === 'e') hud.cycleCategory(1);
    else if (k === 'z') view.rig.rotate(-1);
    else if (k === 'c') view.rig.rotate(1);
    else if (/^[1-9]$/.test(k)) {
      const t = hud.categoryKinds()[Number(k) - 1];
      if (t) hud.pick(t);
    }
  });

  /** Texto de la casilla bajo el ratón (mismo que la 2D). */
  const hoverInfo = (): string => {
    const t = view.hover;
    if (!t) return '';
    const parts = [`Casilla ${t.x},${t.y} · altura ${heightAt(game.world, t.x, t.y)}`];
    const ore = oreAt(game.world, t.x, t.y);
    if (ore !== Ore.None) parts.push(`Recurso: ${ORE_NAMES[ore]}`);
    const b = game.buildingAt(t.x, t.y);
    if (b) parts.push(`${game.def(b.kind).name}${b.built ? '' : ' (obra)'}`);
    if (b?.kind === 'belt' && b.item) parts.push(itemName(b.item));
    if (ui.tool && ui.tool !== 'remove') {
      const c = game.canPlace(ui.tool, t.x, t.y);
      if (!c.ok) parts.push(`✗ ${c.reason}`);
    }
    return parts.join(' · ');
  };

  // ---------- mediciones ----------
  const acc = { game: 0, view: 0, n: 0, t: performance.now() };
  /** Devuelve y reinicia las medias desde la última llamada (ms por frame de lógica y de vista, FPS reales). */
  (window as unknown as { __perf: () => unknown }).__perf = () => {
    const i = view.info();
    const r = { frames: acc.n, fps: +((acc.n * 1000) / Math.max(performance.now() - acc.t, 1)).toFixed(1), gameMs: +(acc.game / Math.max(acc.n, 1)).toFixed(2), viewMs: +(acc.view / Math.max(acc.n, 1)).toFixed(2), calls: i.calls, tris: i.triangles, ...view.stats, ...view.counts() };
    acc.game = acc.view = acc.n = 0;
    acc.t = performance.now();
    return r;
  };
  /** Mide n frames seguidos sin esperar a requestAnimationFrame (útil con la pestaña oculta): ms por frame con la GPU sincronizada. */
  (window as unknown as { __bench: (n: number) => unknown }).__bench = (n: number) => {
    const gl = view.renderer.getContext();
    let tg = 0;
    let tv = 0;
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      const a = performance.now();
      game.update(1 / 60);
      if (bench) wiggle(game, i / 60);
      const b = performance.now();
      view.frame(1 / 60);
      gl.finish();
      tg += b - a;
      tv += performance.now() - b;
    }
    const total = performance.now() - t0;
    const i = view.info();
    return { frames: n, msPerFrame: +(total / n).toFixed(2), fps: +((n * 1000) / total).toFixed(1), gameMs: +(tg / n).toFixed(2), viewMs: +(tv / n).toFixed(2), calls: i.calls, tris: i.triangles, ...view.stats, ...view.counts() };
  };

  // ---------- bucle ----------
  let last = performance.now();
  let botAcc = 0;
  let perfAcc = 0;
  const loop = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const t0 = performance.now();
    if (!ui.paused && !game.gameOver) {
      game.update(dt * speed);
      if (bench) wiggle(game, now / 1000);
      botAcc += dt * speed;
      if (auto && botAcc > 0.7) {
        botAcc = 0;
        botTick(game);
      }
    }
    const t1 = performance.now();
    view.buildKind = ui.tool && ui.tool !== 'remove' ? ui.tool : null;
    view.buildDir = ui.dir;
    view.removeMode = ui.tool === 'remove';
    view.selectedId = ui.selected;
    view.frame(dt);
    acc.game += t1 - t0;
    acc.view += performance.now() - t1;
    acc.n++;
    hud.update(game, hoverInfo(), dt);
    // El aviso de pausa se aparta cuando hay un panel flotante abierto (opciones, ayuda o recetas).
    const floating = optionsOpen() || $('help').style.display === 'block' || $('recipes').style.display === 'block';
    $('pausebanner').style.display = ui.paused && !game.gameOver && !floating ? 'flex' : 'none';
    perfAcc += dt;
    if (options.perf && perfAcc > 0.5) {
      perfAcc = 0;
      const i = view.info();
      $('perf').textContent = `${i.fps.toFixed(0)} FPS · ${i.calls} llamadas · ${(i.triangles / 1000).toFixed(0)}k triángulos`;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
start();
