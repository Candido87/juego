/** Arranque de la vista 3D: crea el MISMO Game que la 2D, lo avanza y pinta la interfaz HTML. */
import { botTick } from '../game/bot';
import { CONFIG } from '../game/config';
import { formatClock } from '../game/format';
import { Game } from '../game/game';
import { BuildKind, Ore } from '../game/types';
import { heightAt, oreAt } from '../game/world';
import { View3D } from './scene3d';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const ORE_NAME = ['', 'Hierro', 'Cobre', 'Carbón', 'Piedra', 'Madera', 'Petróleo', 'Azufre'];

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
  const game = new Game({ seed: Number(q.get('seed') ?? 7), noWaves: q.get('waves') === '0' });
  const view = new View3D($('v'), game);
  await view.init((d, t) => ($('load').textContent = `Cargando modelos… ${d}/${t}`));
  $('load').remove();
  (window as unknown as { __v3: unknown }).__v3 = { view, game };
  if (q.get('demo')) demo(game, q.get('demo') === 'wave');

  let speed = Number(q.get('speed') ?? 1);
  let auto = q.get('auto') !== '0';
  const setSpeed = () => ($('sp').textContent = `x${speed}`);
  setSpeed();
  $('sp').onclick = () => ((speed = speed >= 8 ? 1 : speed * 2), setSpeed());
  $('bot').onclick = () => ((auto = !auto), ($('bot').textContent = `Auto: ${auto ? 'sí' : 'no'}`), $('bot').classList.toggle('on', auto));
  $('bot').textContent = `Auto: ${auto ? 'sí' : 'no'}`;
  $('bot').classList.toggle('on', auto);
  $('rl').onclick = () => view.rig.rotate(-1);
  $('rr').onclick = () => view.rig.rotate(1);

  // Paleta de construcción: sólo llama a game.place (la lógica es la del juego).
  const build = $('build');
  const kinds = [...game.unlockedBuildings];
  const refreshBuild = () => {
    build.innerHTML = '';
    for (const k of [...game.unlockedBuildings] as BuildKind[]) {
      const b = document.createElement('button');
      b.textContent = CONFIG.buildings[k]?.name ?? k;
      b.classList.toggle('on', view.buildKind === k);
      b.onclick = () => ((view.buildKind = view.buildKind === k ? null : k), refreshBuild());
      build.appendChild(b);
    }
  };
  refreshBuild();
  void kinds;
  view.onPlace = (kind, x, y) => {
    const c = game.canPlace(kind, x, y);
    if (c.ok) game.place(kind, x, y, view.buildDir);
    else flash(c.reason ?? 'No se puede');
  };
  let flashT = 0;
  const flash = (t: string) => {
    $('info').textContent = t;
    flashT = 1.5;
  };

  const info = () => {
    const t = view.selected;
    if (!t) return 'Clic: seleccionar · arrastrar: mover · rueda: zoom<br>Q/E: girar 90° · WASD: mover · R: girar pieza<br>Clic der./Esc: cancelar construcción';
    const b = game.buildingAt(t.x, t.y);
    const lines = [`Casilla ${t.x},${t.y} · altura ${heightAt(game.world, t.x, t.y)}`];
    const o = oreAt(game.world, t.x, t.y);
    if (o !== Ore.None) lines.push(`Mena: ${ORE_NAME[o]}`);
    if (b) {
      lines.push(`<b>${b.kind === 'core' ? 'Núcleo' : CONFIG.buildings[b.kind]?.name ?? b.kind}</b> · vida ${Math.ceil(b.hp)}/${b.maxHp}`);
      if (!b.built) lines.push(`En obra ${Math.round(b.progress * 100)}%`);
      if (b.recipe) lines.push(`Receta: ${b.recipe}`);
    }
    return lines.join('<br>');
  };

  const hud = () => {
    $('wave').innerHTML = `Oleada <b>${game.wave}</b> · próxima ${formatClock(game.nextWaveIn)}`;
    $('core').innerHTML = `Núcleo <b>${Math.ceil(game.coreHp)}</b> · NPCs ${game.npcs.length} · enemigos ${game.enemies.length}`;
    $('res').innerHTML = Object.entries(game.storage)
      .filter(([, n]) => (n ?? 0) > 0)
      .map(([k, n]) => `<span>${k} ${Math.floor(n ?? 0)}</span>`)
      .join('');
    if (flashT <= 0) $('info').innerHTML = info();
    const i = view.info();
    const c = view.counts();
    $('perf').textContent = `${i.fps.toFixed(0)} FPS\n${i.calls} draw calls\n${(i.triangles / 1000).toFixed(0)}k tris\nedif ${c.buildings} npc ${c.npcs} enem ${c.enemies}`;
  };

  let last = performance.now();
  let botAcc = 0;
  let hudAcc = 0;
  const loop = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    flashT -= dt;
    game.update(dt * speed);
    botAcc += dt * speed;
    if (auto && botAcc > 0.7) {
      botAcc = 0;
      botTick(game);
    }
    view.frame(dt);
    hudAcc += dt;
    if (hudAcc > 0.25) {
      hudAcc = 0;
      hud();
      refreshBuildIfNeeded();
    }
    requestAnimationFrame(loop);
  };
  let known = game.unlockedBuildings.size;
  const refreshBuildIfNeeded = () => {
    if (game.unlockedBuildings.size !== known) {
      known = game.unlockedBuildings.size;
      refreshBuild();
    }
  };
  requestAnimationFrame(loop);
}
start();
