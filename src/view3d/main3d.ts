/**
 * Arranque de la vista 3D: crea el MISMO `Game` que la 2D, lo avanza y conecta la interfaz HTML
 * compartida (`src/view/ui.ts`, sin Phaser) con la escena de Three.js.
 */
import { botTick } from '../game/bot';
import { HELP_CONTROLS } from '../game/ayuda';
import { isLineTool, previewLine, snapDir } from '../game/conectar';
import { pipeJoinConflict } from '../game/tuberias';
import { Game } from '../game/game';
import type { GuiaState } from '../game/guia-inicio';
import { AutoSaver, SaveFile, SaveSlot, gameFromSave, latestSave, makeSave, readSave, saveSummary, writeSave } from '../game/savegame';
import { createTutorialGame } from '../game/tutorial';
import { BUILD_KINDS, BuildKind, Ore, Tile, TurretKind, dirBetween } from '../game/types';
import { CONFIG } from '../game/config';
import { generateWorld, heightAt, oreAt } from '../game/world';
import { getHud, itemName, setToolIcons, ui } from '../view/ui';
import { setupBench, wiggle } from './bench';
import { Options, loadOptions, saveOptions } from './options';
import type { GuideAids } from './overlay3d';
import { QUALITY, QUALITY_LEVELS, QUALITY_NAME, QualityChoice, QualityGovernor, QualityLevel, detectGl, effectiveLevel, glNotice, lowerLevel } from './quality';
import { OPT_OFF, OPT_ON, View3D } from './scene3d';
import { STATUS_STYLE, beltStopped, statusIcon } from './status';
import { TutorialView } from './tutorial3d';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const ORE_NAMES = ['', 'hierro', 'cobre', 'carbón', 'piedra', 'madera', 'petróleo', 'azufre'];

/** Controles de la ayuda en 3D: los de siempre más los de la cámara y las opciones. */
const HELP_3D: [string, string][] = [
  ...HELP_CONTROLS.slice(0, 3),
  ['Z / C', 'Girar la cámara 90° (también los botones ⟲ ⟳)'],
  ['W A S D / flechas', 'Mover la cámara'],
  ...HELP_CONTROLS.slice(3),
  ['O', 'Opciones (calidad gráfica, sombras, velocidad, guardar y cargar, tutorial)'],
  ['T', 'Investigación: árbol de tecnología (no pausa la partida)'],
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
  // Empalmes en T y un cruce de cintas.
  put('belt', cx + 6, cy + 3, 1);
  put('belt', cx + 5, cy + 5, 3);
  put('belt', cx + 8, cy + 3, 1);
  put('belt', cx + 8, cy + 5, 3);
  // Muralla con esquina, T, cruz, puerta y tramos dañados.
  put('wall_stone', cx + 3, cy - 7);
  put('wall_stone', cx, cy - 8);
  put('wall_stone', cx, cy - 9);
  put('wall_stone', cx, cy - 6);
  put('wall_gate', cx + 3, cy - 3);
  put('wall_stone', cx + 3, cy - 2);
  const hurt = (x: number, y: number, f: number) => {
    const b = game.buildingAt(x, y);
    if (b) b.hp = b.maxHp * f;
  };
  hurt(cx - 4, cy - 7, 0.5);
  hurt(cx - 1, cy - 7, 0.5);
  hurt(cx + 1, cy - 7, 0.2);
  hurt(cx + 2, cy - 7, 0.2);
  // Postes enlazados por cable.
  put('pole', cx + 7, cy + 1);
  put('pole', cx + 2, cy + 3);
  put('pole', cx - 2, cy + 5);
  put('pole', cx - 6, cy + 5);
  if (wave) game.callWaveNow();
}

/**
 * Galería de modelos (`?galeria=1`): todos los edificios y las torretas en cada nivel, dibujados con el mismo código
 * que el juego. Sustituye a las galerías de la vista 2D para revisar el aspecto de un vistazo.
 */
function showGallery(view: View3D, game: Game): void {
  const el = document.createElement('div');
  el.id = 'gallery';
  const cell = (url: string | undefined, name: string) => `<figure><img src="${url ?? ''}" width="150" height="150" alt=""><figcaption>${name}</figcaption></figure>`;
  const all = view.thumbnails(300);
  let html = '<h2>Galería de modelos <button id="galclose">Cerrar</button></h2><h3>Edificios</h3><div class="gal">';
  for (const k of BUILD_KINDS) html += cell(all[k], game.def(k).name);
  html += '</div><h3>Torretas por nivel</h3><div class="gal">';
  const turrets = Object.keys(CONFIG.turrets) as TurretKind[];
  const before = { ...game.turretLevel };
  for (let level = 1; level <= CONFIG.turretLevels.maxLevel; level++) {
    for (const t of turrets) game.turretLevel[t] = level;
    const imgs = view.thumbnails(300, turrets);
    for (const t of turrets) html += cell(imgs[t], `${game.def(t).name} · nivel ${level}`);
  }
  Object.assign(game.turretLevel, before);
  el.innerHTML = html + '</div>';
  document.body.appendChild(el);
  document.getElementById('galclose')!.onclick = () => el.remove();
}

/** Pregunta si se continúa la partida guardada o se empieza otra. */
function askContinue(s: SaveFile): Promise<'continue' | 'new'> {
  return new Promise((resolve) => {
    const el = $('cont');
    $('load').style.display = 'none';
    el.style.display = 'flex';
    el.innerHTML = `<div>Hay una partida guardada</div><div class="csub">${saveSummary(s)}</div><div class="crow"><button data-c="continue">Continuar</button><button data-c="new">Nueva partida</button></div>`;
    el.onclick = (ev) => {
      const c = (ev.target as HTMLElement).closest<HTMLElement>('[data-c]')?.dataset.c as 'continue' | 'new' | undefined;
      if (!c) return;
      el.style.display = 'none';
      $('load').style.display = '';
      resolve(c);
    };
  });
}

/** Aviso a pantalla completa cuando la vista 3D no puede arrancar o pierde el contexto gráfico. */
function showGlNotice(reason: Parameters<typeof glNotice>[0], detail = ''): void {
  const n = glNotice(reason);
  document.getElementById('load')?.remove();
  let el = document.getElementById('glwarn');
  if (!el) {
    el = document.createElement('div');
    el.id = 'glwarn';
    document.body.appendChild(el);
  }
  el.innerHTML =
    `<div class="panel"><h2>${n.title}</h2>${n.lines.map((l, i) => (i === 0 ? `<p>${l}</p>` : `<li>${l}</li>`)).join('')}` +
    (detail ? `<p class="muted">${detail}</p>` : '') +
    `<button id="glretry">Volver a intentarlo</button></div>`;
  document.getElementById('glretry')!.onclick = () => location.reload();
}

async function start() {
  if (!innerWidth || !innerHeight) return requestAnimationFrame(start);
  const q = new URLSearchParams(location.search);
  // Compatibilidad: sin WebGL2 no hay juego; se explica en vez de dejar la pantalla de carga colgada. `?nowebgl=1|2` lo simula.
  const gl = q.get('nowebgl') ? ({ ok: false, reason: q.get('nowebgl') === '2' ? 'webgl1' : 'none' } as const) : detectGl(document.createElement('canvas'));
  if (!gl.ok) return showGlNotice(gl.reason);
  const map = Number(q.get('map') ?? 0);
  const bench = q.get('bench') === '1';
  const tutorialMode = q.get('tutorial') === '1';
  const store = (() => {
    try {
      return localStorage;
    } catch {
      return null;
    }
  })();
  // Partida guardada: con `?load=auto|manual`, o al abrir sin parámetros si hay una viva (se pregunta).
  let loaded: SaveFile | null = null;
  const slot = q.get('load');
  if (slot === 'auto' || slot === 'manual') loaded = readSave(store, slot);
  else if (!location.search) {
    const last = latestSave(store);
    if (last && !last.save.state.gameOver && (await askContinue(last.save)) === 'continue') loaded = last.save;
  }
  const seed = loaded ? loaded.seed : Number(q.get('seed') ?? 7);
  const game = loaded
    ? gameFromSave(loaded)
    : tutorialMode
      ? createTutorialGame()
      : new Game({ seed, noWaves: q.get('waves') === '0' || bench, world: map ? generateWorld(seed, map, map) : undefined });
  const options: Options = loadOptions(store);
  // Calidad: `?quality=low|medium|high` la fuerza sin guardarla (para medir). Sin aceleración por hardware se empieza en baja.
  const forced = QUALITY_LEVELS.includes(q.get('quality') as QualityLevel) ? (q.get('quality') as QualityLevel) : null;
  let softwareNote = false;
  if (gl.software && options.quality === 'auto' && options.autoLevel !== 'low' && !forced) {
    options.autoLevel = 'low';
    options.shadows = QUALITY.low.shadows;
    options.outline = QUALITY.low.outline;
    softwareNote = true;
  }
  const level = (): QualityLevel => forced ?? effectiveLevel(options);
  const opts = q.get('opt') === '0' ? { ...OPT_OFF } : { ...OPT_ON };
  opts.shadows = q.get('shadows') === '0' ? false : options.shadows;
  if (q.get('chunk')) opts.chunk = Number(q.get('chunk'));
  opts.seed = seed;
  opts.outline = q.get('outline') === '0' || q.get('opt') === '0' ? false : options.outline;
  let view: View3D;
  try {
    view = new View3D($('v'), game, opts);
  } catch (err) {
    return showGlNotice('error', String((err as Error)?.message ?? err));
  }
  view.renderer.domElement.addEventListener('webglcontextlost', (ev) => {
    ev.preventDefault();
    ui.paused = true;
    showGlNotice('lost');
  });
  await view.init((d, t) => ($('load').textContent = `Cargando modelos… ${d}/${t}`));
  // Iconos del menú de construcción: miniaturas de los propios modelos.
  setToolIcons(view.thumbnails());
  $('load').remove();
  (window as unknown as { __v3: unknown }).__v3 = { view, game, ui };
  if (bench) setupBench(game, { objects: Number(q.get('objs') ?? 1500), enemies: Number(q.get('enemies') ?? 300) });
  if (bench) view.rig.zoom = Number(q.get('zoom') ?? 0.6);
  if (q.get('demo')) demo(game, q.get('demo') === 'wave');
  if (q.get('galeria')) showGallery(view, game);

  // ---------- interfaz compartida ----------
  const hud = getHud();
  hud.helpControls = HELP_3D;
  hud.bind(game);
  // La guía de inicio viaja con el guardado; en el tutorial se apaga (el tutorial hace su papel).
  if (loaded?.guia) hud.guia.state = loaded.guia as GuiaState;
  if (tutorialMode) hud.guia.state.disabled = true;
  hud.onRestart = () => {
    const p = new URLSearchParams(location.search);
    p.delete('load');
    p.delete('tutorial');
    p.set('seed', String(Math.floor(Math.random() * 1e9)));
    location.search = p.toString();
  };
  // Tutorial guiado: arranca siempre desde cero (la partida del tutorial no se guarda).
  const tut = tutorialMode ? new TutorialView(game, null, true, () => hud.onRestart()) : null;
  const camStart = { x: view.rig.x, z: view.rig.z, zoom: view.rig.zoom };
  // Guardado: manual desde las opciones y automático cada minuto (también al cerrar la pestaña). Sin guardar en pruebas.
  const canSave = !bench && !tutorialMode && !q.get('demo');
  const save = (s: SaveSlot) => writeSave(store, s, makeSave(game, seed, Date.now(), hud.guia.state));
  const autosaver = new AutoSaver();
  if (canSave) {
    window.addEventListener('beforeunload', () => !game.gameOver && save('auto'));
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && !game.gameOver && save('auto'));
  }
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
    const mix = ui.tool === 'pipeline' ? pipeJoinConflict(game, t.x, t.y, ui.dir) : null;
    if (mix) return hud.flash(mix);
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
    } else if (button === 0 && ui.tool === null) ui.selected = view.hoverBuildingId;
    else if (button === 0 && t) placeAt(t);
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
  let lastSnapKey = '';

  // ---------- opciones y pausa ----------
  const governor = new QualityGovernor();
  const applyOptions = () => {
    saveOptions(store, options);
    if (view.quality !== QUALITY[level()]) view.setQuality(QUALITY[level()]);
    if (view.opts.shadows !== options.shadows) view.setShadows(options.shadows);
    if (view.opts.outline !== options.outline) view.setOutline(options.outline);
    speed = options.speed;
    $('perf').style.display = options.perf ? 'flex' : 'none';
  };
  const saveRows = () => {
    const m = readSave(store, 'manual');
    const a = readSave(store, 'auto');
    const line = (s: SaveFile | null) => (s ? `<span class="muted">${saveSummary(s)}</span>` : '<span class="muted">vacío</span>');
    return (
      `<div class="orow"><span>Guardar partida</span><button data-save>Guardar</button></div>` +
      `<div class="orow"><span>Cargar ${line(m)}</span><button data-load="manual" ${m ? '' : 'disabled'}>Manual</button></div>` +
      `<div class="orow"><span>Autoguardado ${line(a)}</span><button data-load="auto" ${a ? '' : 'disabled'}>Cargar</button></div>`
    );
  };
  const renderOptions = () => {
    const seg = (key: string, vals: [string, string][], cur: string) =>
      `<span class="oseg">${vals.map(([v, n]) => `<button data-opt="${key}:${v}" class="${v === cur ? 'active' : ''}">${n}</button>`).join('')}</span>`;
    $('options').innerHTML =
      `<h3>Opciones <button data-optclose title="Cerrar (O o Esc)">✕</button></h3>` +
      `<div class="orow"><span>Calidad gráfica${options.quality === 'auto' ? ` <span class="muted">(ahora: ${QUALITY_NAME[level()].toLowerCase()})</span>` : ''}</span>${seg('quality', (['auto', ...QUALITY_LEVELS] as QualityChoice[]).map((c): [string, string] => [c, QUALITY_NAME[c]]), options.quality)}</div>` +
      `<div class="orow"><span>Sombras</span>${seg('shadows', [['1', 'Sí'], ['0', 'No']], options.shadows ? '1' : '0')}</div>` +
      `<div class="orow"><span>Contorno de objetos</span>${seg('outline', [['1', 'Sí'], ['0', 'No']], options.outline ? '1' : '0')}</div>` +
      `<div class="orow"><span>Velocidad del juego</span>${seg('speed', [['1', 'x1'], ['2', 'x2'], ['4', 'x4']], String(options.speed))}</div>` +
      `<div class="orow"><span>Mostrar rendimiento</span>${seg('perf', [['1', 'Sí'], ['0', 'No']], options.perf ? '1' : '0')}</div>` +
      `<div class="orow"><span>Guía de inicio</span><button data-optguide>${hud.guia.disabled ? 'Activar' : 'Reiniciar'}</button></div>` +
      (canSave ? saveRows() : '') +
      `<div class="orow"><span>Tutorial guiado</span><button data-tutorial>Empezar</button></div>`;
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
    if (t.closest('[data-save]')) {
      hud.flash(save('manual') ? 'Partida guardada' : 'No se ha podido guardar');
      return renderOptions();
    }
    const ld = t.closest<HTMLElement>('[data-load]')?.dataset.load;
    if (ld) {
      const p = new URLSearchParams();
      p.set('load', ld);
      location.search = p.toString();
      return;
    }
    if (t.closest('[data-tutorial]')) {
      location.search = 'tutorial=1';
      return;
    }
    if (t.closest('[data-optguide]')) {
      hud.guia.reopen();
      return toggleOptions(false);
    }
    const o = t.closest<HTMLElement>('[data-opt]')?.dataset.opt;
    if (!o) return;
    const [k, v] = o.split(':');
    if (k === 'quality') {
      // Elegir un nivel pone sus sombras y su contorno (luego se pueden cambiar sueltos); `auto` vuelve a probar desde alta.
      options.quality = v as QualityChoice;
      if (v === 'auto') options.autoLevel = 'high';
      options.shadows = QUALITY[effectiveLevel(options)].shadows;
      options.outline = QUALITY[effectiveLevel(options)].outline;
      governor.reset();
    }
    if (k === 'shadows') options.shadows = v === '1';
    if (k === 'outline') options.outline = v === '1';
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
  if (softwareNote) hud.flash('Sin aceleración por hardware: calidad gráfica baja');

  // ---------- teclado (igual que la 2D; la cámara gira con Z/C) ----------
  window.addEventListener('keydown', (ev) => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes((ev.target as HTMLElement)?.tagName)) return;
    const k = ev.key.toLowerCase();
    if (k === 'r') hud.rotate();
    else if (k === 'h') (toggleOptions(false), hud.toggleHelp());
    else if (k === 'o') toggleOptions();
    else if (k === 'escape') {
      if (hud.tech.isOpen) return hud.toggleTech(false);
      if (optionsOpen()) return toggleOptions(false);
      if (hud.closeHelp()) return;
      hud.setTool(null);
      ui.selected = null;
    } else if (k === 'x') hud.setTool('remove');
    else if (k === 't') hud.toggleTech();
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

  /** Ayudas sobre el mapa del paso actual de la guía o del tutorial. */
  const guideAids = (): GuideAids | null => {
    if (tut) {
      const mark = tut.targetTile();
      return mark ? { mark } : null;
    }
    const st = hud.guia.step();
    if (!st) return null;
    const hl = st.highlight;
    return {
      mark: hud.guia.targetTile(),
      route: hud.guia.route(),
      liquid: st.link?.from === 'pump' || st.link?.from === 'refinery',
      diag: hud.guia.diagnosis()?.tile ?? null,
      portKinds: hl?.ports,
      poleRange: hl?.poleRange,
    };
  };

  /** Texto de la casilla bajo el ratón (mismo que la 2D). */
  const hoverInfo = (): string => {
    const t = view.hover;
    if (!t) return '';
    const parts = [`Casilla ${t.x},${t.y} · altura ${heightAt(game.world, t.x, t.y)}`];
    const ore = oreAt(game.world, t.x, t.y);
    if (ore !== Ore.None) parts.push(`Recurso: ${ORE_NAMES[ore]}`);
    const b = game.buildingAt(t.x, t.y);
    if (b) parts.push(`${game.def(b.kind).name}${b.built ? '' : ' (obra)'}`);
    if ((b?.kind === 'belt' || b?.kind === 'belt_fast') && b.item) parts.push(itemName(b.item));
    // El aviso que lleva encima el edificio, con palabras.
    if (b && beltStopped(b)) parts.push('⚠ Cinta parada: sin energía');
    const st = b ? statusIcon(game, b) : null;
    if (st && st.type !== 'producing') parts.push(`⚠ ${STATUS_STYLE[st.type].title}`);
    if (ui.tool && ui.tool !== 'remove') {
      const c = game.canPlace(ui.tool, t.x, t.y);
      if (!c.ok) parts.push(`✗ ${c.reason}`);
    }
    if (isLineTool(ui.tool)) {
      const pv = previewLine(game, ui.tool, t.x, t.y, ui.dir);
      const mark = { ok: '✓', error: '✗', open: '○' };
      if (pv.occupied) parts.push(`✗ ${pv.occupied}`);
      const mix = ui.tool === 'pipeline' ? pipeJoinConflict(game, t.x, t.y, ui.dir) : null;
      if (mix) parts.push(`✗ ${mix}`);
      for (const [label, e] of [['Salida', pv.head], ['Entrada', pv.tail]] as const) parts.push(`${mark[e.state]} ${label}${e.reason ? `: ${e.reason}` : ' correcta'}`);
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

  /** Mide n frames en cada nivel de calidad (con sus sombras y contorno) y devuelve una fila por nivel; al acabar deja el nivel que había. */
  (window as unknown as { __benchQuality: (n: number) => unknown }).__benchQuality = (n: number) => {
    const run = (window as unknown as { __bench: (n: number) => Record<string, unknown> }).__bench;
    const rows = QUALITY_LEVELS.map((l) => {
      view.setQuality(QUALITY[l]);
      view.setShadows(QUALITY[l].shadows);
      view.setOutline(QUALITY[l].outline);
      run(20);
      const c = view.renderer.domElement;
      return { level: l, buffer: `${c.width}x${c.height}`, ...run(n) };
    });
    view.setQuality(QUALITY[level()]);
    view.setShadows(options.shadows);
    view.setOutline(options.outline);
    return rows;
  };

  // ---------- bucle ----------
  let last = performance.now();
  let botAcc = 0;
  let perfAcc = 0;
  const loop = (now: number) => {
    const real = (now - last) / 1000;
    const dt = Math.min(0.1, real);
    last = now;
    // Calidad automática: si los FPS se quedan por debajo de 30 durante 5 s, baja un nivel (nunca sube sola).
    if (options.quality === 'auto' && !forced && !bench && governor.sample(real, document.visibilityState === 'visible' && !ui.paused && speed === 1)) {
      const down = lowerLevel(options.autoLevel);
      if (down) {
        options.autoLevel = down;
        options.shadows = QUALITY[down].shadows;
        options.outline = QUALITY[down].outline;
        applyOptions();
        if (optionsOpen()) renderOptions();
        hud.flash(`Calidad gráfica bajada a ${QUALITY_NAME[down].toLowerCase()} para ir más fluido (se cambia en Opciones)`);
      }
    }
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
    view.simPaused = ui.paused || game.gameOver;
    if (tut) {
      if (Math.hypot(view.rig.x - camStart.x, view.rig.z - camStart.z) > 0.5) tut.flag('camera_moved');
      if (Math.abs(view.rig.zoom - camStart.zoom) > 0.03) tut.flag('zoomed');
      if (ui.tool) tut.flag('tool_selected');
      tut.tick(dt);
    }
    if (canSave && !ui.paused && autosaver.tick(dt, game)) save('auto');
    view.guide = guideAids();
    view.frame(dt);
    acc.game += t1 - t0;
    acc.view += performance.now() - t1;
    acc.n++;
    // Imán: al pasar sobre la casilla de un puerto compatible, la cinta o tubería se orienta sola (R sigue sirviendo).
    const ht = view.hover;
    const snapKey = ht && isLineTool(ui.tool) && !painting ? `${ui.tool}|${ht.x},${ht.y}` : '';
    if (snapKey !== lastSnapKey) {
      lastSnapKey = snapKey;
      if (snapKey && isLineTool(ui.tool) && ht) {
        const d = snapDir(game, ui.tool, ht.x, ht.y, ui.dir);
        if (d !== null) ui.dir = d;
      }
    }
    hud.update(game, hoverInfo(), dt);
    // El aviso de pausa se aparta cuando hay un panel flotante abierto (opciones, ayuda o recetas).
    const floating = optionsOpen() || $('help').style.display === 'block' || $('recipes').style.display === 'block';
    $('pausebanner').style.display = ui.paused && !game.gameOver && !floating ? 'flex' : 'none';
    perfAcc += dt;
    if (options.perf && perfAcc > 0.5) {
      perfAcc = 0;
      const i = view.info();
      const sz = view.renderer.domElement;
      $('perf').textContent = `${i.fps.toFixed(0)} FPS · ${(1000 / Math.max(i.fps, 1)).toFixed(1)} ms · ${i.calls} llamadas · ${(i.triangles / 1000).toFixed(0)}k triángulos · ${sz.width}×${sz.height} · calidad ${QUALITY_NAME[level()].toLowerCase()}`;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
start();
