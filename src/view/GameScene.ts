/**
 * Vista isométrica. Lee el estado de `Game` cada fotograma y lo dibuja; nunca contiene
 * reglas de juego. Toda la interacción se traduce a comandos (place/remove/rotate/hire...).
 */
import Phaser from 'phaser';
import { CONFIG } from '../game/config';
import { Game } from '../game/game';
import { HALF_H, HALF_W, Vec2, depthOf, gridToScreen, occludes, pickTile } from '../game/iso';
import { BuildKind, DX, DY, Ore, Tile, TurretKind, dirBetween } from '../game/types';
import { MAX_HEIGHT, heightAt, heightAtPoint, oreAt } from '../game/world';
import {
  FLY_Z,
  MUZZLE_Z,
  SHOT_COLORS,
  WIRE_Z,
  buildTextures,
  preloadSprites,
  enemyKey,
  itemKey,
  npcKey,
  shapeInfo,
  shapeKey,
  terrainKey,
} from './shapes';
import { getHud, itemName, ui } from './ui';

interface BSprite {
  img: Phaser.GameObjects.Image;
  shadow?: Phaser.GameObjects.Image;
  /** Aviso (sin munición / generador parado). */
  alarm?: Phaser.GameObjects.Image;
  key: string;
  tall: boolean;
  alpha: number;
}

interface Mover {
  img: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
}

interface Flash {
  kind: 'shot' | 'pop' | 'death';
  color: number;
  a: Vec2;
  b: Vec2;
  ttl: number;
  max: number;
}

/** Capas dentro de una misma diagonal (ver depthOf). */
const L = { terrain: 0, shadow: 1, belt: 2, item: 3, building: 5, mover: 6, ghost: 7 };
const OVERLAY_DEPTH = 1e6;
const SITE_ALPHA = 0.42;
const ORE_NAMES: Record<number, string> = {
  [Ore.Iron]: 'hierro',
  [Ore.Copper]: 'cobre',
  [Ore.Coal]: 'carbón',
  [Ore.Stone]: 'piedra',
  [Ore.Wood]: 'bosque',
};

export class GameScene extends Phaser.Scene {
  private sim!: Game;
  private bSprites = new Map<number, BSprite>();
  private eSprites = new Map<number, Mover>();
  private nSprites = new Map<number, Mover>();
  private items: Phaser.GameObjects.Image[] = [];
  private flashes: Flash[] = [];
  private fx!: Phaser.GameObjects.Graphics;
  private overlay!: Phaser.GameObjects.Graphics;
  private paths!: Phaser.GameObjects.Graphics;
  private wires!: Phaser.GameObjects.Graphics;
  private wiresGrid: unknown = null;
  private ghost!: Phaser.GameObjects.Image;
  private hover: Tile | null = null;
  private pathsVersion = -1;
  private drag = { down: false, moved: false, sx: 0, sy: 0, scrollX: 0, scrollY: 0 };
  private painting: Tile | null = null;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  constructor() {
    super('game');
  }

  preload() {
    preloadSprites(this);
  }

  create(data: { seed?: number }) {
    // La escena se reutiliza al reiniciar: limpiar estado.
    this.bSprites = new Map();
    this.eSprites = new Map();
    this.nSprites = new Map();
    this.items = [];
    this.flashes = [];
    this.pathsVersion = -1;
    this.painting = null;

    this.sim = new Game({ seed: data?.seed ?? 7 });
    buildTextures(this);
    this.buildTerrain();
    // Banderas en los puntos de aparición enemiga.
    const flag = shapeInfo('marker_spawn');
    for (const s of this.sim.spawns) {
      const p = gridToScreen(s.x + 0.5, s.y + 0.5, heightAt(this.sim.world, s.x, s.y));
      this.add.image(p.x, p.y, 'marker_spawn').setOrigin(flag.originX, flag.originY).setDepth(depthOf(s.x, s.y, L.building));
    }

    this.paths = this.add.graphics().setDepth(OVERLAY_DEPTH - 3);
    this.wires = this.add.graphics().setDepth(OVERLAY_DEPTH - 4);
    this.wiresGrid = null;
    this.overlay = this.add.graphics().setDepth(OVERLAY_DEPTH - 1);
    this.fx = this.add.graphics().setDepth(OVERLAY_DEPTH);
    this.ghost = this.add.image(0, 0, 'core').setVisible(false).setAlpha(0.6);

    const cam = this.cameras.main;
    const c = this.sim.core;
    const p = gridToScreen(c.x + 1, c.y + 1, 0);
    cam.centerOn(p.x, p.y);
    cam.setZoom(1);

    this.setupInput();

    const hud = getHud();
    hud.bind(this.sim);
    hud.onRestart = () => this.scene.restart({ seed: Math.floor(Math.random() * 1e9) });
  }

  // ------------------------------------------------------------------ terreno

  private buildTerrain() {
    const world = this.sim.world;
    for (let y = 0; y < world.h; y++) {
      for (let x = 0; x < world.w; x++) {
        const z = heightAt(world, x, y);
        // Oclusión ambiental: vecinas más altas hacia la luz (arriba-izquierda) oscurecen la casilla.
        let ao = 0;
        if (heightAt(world, x - 1, y) > z) ao++;
        if (heightAt(world, x, y - 1) > z) ao++;
        if (ao === 0 && heightAt(world, x - 1, y - 1) > z) ao = 1;
        const key = terrainKey(oreAt(world, x, y), z, Math.min(ao, 2), (x + y) & 1);
        const info = shapeInfo(key);
        const pos = gridToScreen(x, y, 0);
        this.add.image(pos.x, pos.y, key).setOrigin(info.originX, info.originY).setDepth(depthOf(x, y, L.terrain));
      }
    }
  }

  // ------------------------------------------------------------------ entrada

  private setupInput() {
    const cam = this.cameras.main;
    this.input.mouse?.disableContextMenu();
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>;

    this.input.keyboard!.on('keydown', (ev: KeyboardEvent) => {
      const hud = getHud();
      const k = ev.key.toLowerCase();
      if (k === 'r') hud.rotate();
      else if (k === 'escape') {
        hud.setTool(null);
        ui.selected = null;
      } else if (k === 'x') hud.setTool('remove');
      else if (k === 'p') hud.togglePause();
      else if (/^[1-9]$/.test(k)) {
        const t = hud.tools()[Number(k) - 1];
        if (t) hud.setTool(t);
      }
    });

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.updateHover();
      if (p.button === 0 && p.event.shiftKey && (ui.tool === 'belt' || ui.tool === 'belt_fast') && this.hover) {
        this.painting = { ...this.hover };
        this.placeAt(this.hover);
        return;
      }
      this.drag = { down: true, moved: false, sx: p.x, sy: p.y, scrollX: cam.scrollX, scrollY: cam.scrollY };
    });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.drag.down || !p.isDown) return;
      const dx = p.x - this.drag.sx;
      const dy = p.y - this.drag.sy;
      if (!this.drag.moved && Math.hypot(dx, dy) > 6) this.drag.moved = true;
      if (this.drag.moved) {
        cam.scrollX = this.drag.scrollX - dx / cam.zoom;
        cam.scrollY = this.drag.scrollY - dy / cam.zoom;
      }
    });

    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (this.painting) {
        this.painting = null;
        return;
      }
      const wasClick = this.drag.down && !this.drag.moved;
      this.drag.down = false;
      if (!wasClick) return;
      if (p.button === 2) {
        getHud().setTool(null);
        ui.selected = null;
      } else if (p.button === 0) this.onClick();
    });

    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      const before = cam.getWorldPoint(p.x, p.y);
      cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.88 : 1.14), 0.35, 3));
      cam.preRender();
      const after = cam.getWorldPoint(p.x, p.y);
      cam.scrollX += before.x - after.x;
      cam.scrollY += before.y - after.y;
    });
  }

  private onClick() {
    const t = this.hover;
    if (!t) return;
    if (ui.tool === null) {
      // Sin herramienta: seleccionar edificio.
      ui.selected = this.sim.buildingAt(t.x, t.y)?.id ?? null;
      return;
    }
    this.placeAt(t);
  }

  private placeAt(t: Tile) {
    const hud = getHud();
    if (ui.tool === 'remove') {
      this.sim.remove(t.x, t.y);
      return;
    }
    if (!ui.tool) return;
    const check = this.sim.canPlace(ui.tool, t.x, t.y);
    if (!check.ok) hud.flash(check.reason ?? 'No se puede construir');
    else this.sim.place(ui.tool, t.x, t.y, ui.dir);
  }

  /** Mayús + arrastrar: traza cintas casilla a casilla orientándolas según el movimiento. */
  private paintBelts() {
    if (!this.painting || !this.hover) return;
    const target = this.hover;
    let cur: Tile = this.painting;
    let guard = 0;
    while ((cur.x !== target.x || cur.y !== target.y) && guard++ < 64) {
      const dx: number = target.x - cur.x;
      const dy: number = target.y - cur.y;
      const next: Tile =
        Math.abs(dx) >= Math.abs(dy) ? { x: cur.x + Math.sign(dx), y: cur.y } : { x: cur.x, y: cur.y + Math.sign(dy) };
      const dir = dirBetween(cur, next)!;
      ui.dir = dir;
      this.sim.rotate(cur.x, cur.y, dir);
      const existing = this.sim.buildingAt(next.x, next.y);
      if (existing?.kind === ui.tool) this.sim.rotate(next.x, next.y, dir);
      else if (!existing) this.placeAt(next);
      cur = next;
    }
    this.painting = cur;
  }

  private updateHover() {
    const p = this.input.activePointer;
    const wp = this.cameras.main.getWorldPoint(p.x, p.y);
    const { w, h } = this.sim.world;
    const t = pickTile(wp.x, wp.y, w, h, (x, y) => heightAt(this.sim.world, x, y), MAX_HEIGHT);
    this.hover = t ? { x: t.x, y: t.y } : null;
  }

  // ------------------------------------------------------------------ bucle

  update(_time: number, deltaMs: number) {
    const dt = Math.min(deltaMs / 1000, 0.1);
    if (!ui.paused) this.sim.update(dt);
    this.panWithKeys(dt);
    this.updateHover();
    this.paintBelts();

    this.syncBuildings();
    this.syncItems();
    this.syncMovers();
    this.consumeEvents();
    this.drawPaths();
    this.drawWires();
    this.drawOverlay();
    this.drawFx(dt);
    this.updateOcclusion(dt);

    getHud().update(this.sim, this.hoverInfo(), dt);
  }

  private panWithKeys(dt: number) {
    const k = this.keys;
    const cam = this.cameras.main;
    const v = (600 * dt) / cam.zoom;
    if (k.A.isDown || k.LEFT.isDown) cam.scrollX -= v;
    if (k.D.isDown || k.RIGHT.isDown) cam.scrollX += v;
    if (k.W.isDown || k.UP.isDown) cam.scrollY -= v;
    if (k.S.isDown || k.DOWN.isDown) cam.scrollY += v;
  }

  private syncBuildings() {
    const world = this.sim.world;
    const seen = new Set<number>();
    for (const b of this.sim.buildings.values()) {
      seen.add(b.id);
      const key = shapeKey(b.kind, b.dir);
      let s = this.bSprites.get(b.id);
      if (!s) {
        const info = shapeInfo(key);
        const pos = gridToScreen(b.x, b.y, heightAt(world, b.x, b.y));
        const flat = b.kind === 'belt' || b.kind === 'belt_fast';
        const img = this.add
          .image(pos.x, pos.y, key)
          .setOrigin(info.originX, info.originY)
          .setDepth(depthOf(b.x + b.w - 1, b.y + b.d - 1, flat ? L.belt : L.building));
        let shadow: Phaser.GameObjects.Image | undefined;
        if (info.shadow) {
          const si = shapeInfo(info.shadow);
          shadow = this.add
            .image(pos.x, pos.y, info.shadow)
            .setOrigin(si.originX, si.originY)
            .setDepth(depthOf(b.x + b.w, b.y + b.d, L.shadow));
        }
        s = { img, shadow, key, tall: info.tall, alpha: 1 };
        this.bSprites.set(b.id, s);
      } else if (s.key !== key) {
        const info = shapeInfo(key);
        s.img.setTexture(key).setOrigin(info.originX, info.originY);
        s.key = key;
      }
      s.shadow?.setVisible(b.built);
      if (!b.built) s.img.setTint(0xbfd4ff);
      else if (b.markedForRemoval) s.img.setTint(0xff8080);
      else s.img.clearTint();
      // Luz de alarma: torreta sin munición o generador parado.
      const gen = CONFIG.power.generators[b.kind as BuildKind];
      const warn = b.built && ((!!this.sim.turretDef(b) && !this.sim.turretReady(b)) || (!!gen?.fuel && !b.running));
      if (warn && !s.alarm) {
        const ai = shapeInfo('icon_alarm');
        s.alarm = this.add.image(0, 0, 'icon_alarm').setOrigin(ai.originX, ai.originY).setDepth(OVERLAY_DEPTH - 2).setScale(0.8);
      }
      if (s.alarm) {
        s.alarm.setVisible(warn);
        if (warn) {
          const top = gridToScreen(b.x + b.w / 2, b.y + b.d / 2, heightAt(world, b.x, b.y));
          s.alarm.setPosition(top.x, top.y - 58 - Math.abs(Math.sin(this.sim.time * 4)) * 4);
        }
      }
    }
    for (const [id, s] of this.bSprites) {
      if (seen.has(id)) continue;
      s.img.destroy();
      s.shadow?.destroy();
      s.alarm?.destroy();
      this.bSprites.delete(id);
    }
  }

  private syncItems() {
    let i = 0;
    const world = this.sim.world;
    for (const b of this.sim.buildings.values()) {
      if ((b.kind !== 'belt' && b.kind !== 'belt_fast') || b.item === null) continue;
      let img = this.items[i];
      if (!img) {
        img = this.add.image(0, 0, itemKey('iron_ore'));
        this.items.push(img);
      }
      const key = itemKey(b.item);
      const info = shapeInfo(key);
      const t = b.beltProgress - 0.5;
      const pos = gridToScreen(b.x + 0.5 + t * DX[b.dir], b.y + 0.5 + t * DY[b.dir], heightAt(world, b.x, b.y));
      img.setTexture(key).setOrigin(info.originX, info.originY).setPosition(pos.x, pos.y);
      img.setDepth(depthOf(b.x, b.y, L.item)).setVisible(true);
      i++;
    }
    for (; i < this.items.length; i++) this.items[i].setVisible(false);
  }

  private groundScreen(x: number, y: number): Vec2 {
    return gridToScreen(x, y, heightAtPoint(this.sim.world, x, y));
  }

  private moverDepth(x: number, y: number): number {
    return depthOf(x - 0.5, y - 0.5, L.mover);
  }

  /** Enemigos y NPCs: imagen + sombrita, mismo orden de profundidad que el resto. */
  private syncMover(map: Map<number, Mover>, id: number, key: string, x: number, y: number, lift: number, bob: number) {
    let m = map.get(id);
    if (!m) {
      const info = shapeInfo(key);
      const si = shapeInfo('shadow_small');
      m = {
        img: this.add.image(0, 0, key).setOrigin(info.originX, info.originY),
        shadow: this.add.image(0, 0, 'shadow_small').setOrigin(si.originX, si.originY),
      };
      map.set(id, m);
    }
    const p = this.groundScreen(x, y);
    m.shadow.setPosition(p.x, p.y).setDepth(depthOf(x - 0.5, y - 0.5, L.shadow));
    m.img.setPosition(p.x, p.y - lift - bob).setDepth(this.moverDepth(x, y) + (lift > 0 ? 2 : 0));
  }

  private syncMovers() {
    const seenE = new Set<number>();
    for (const e of this.sim.enemies) {
      seenE.add(e.id);
      const bob = Math.abs(Math.sin(this.sim.time * 8 + e.id)) * 2;
      this.syncMover(this.eSprites, e.id, enemyKey(e.kind), e.x, e.y, e.flying ? FLY_Z : 0, bob);
    }
    const seenN = new Set<number>();
    for (const n of this.sim.npcs) {
      seenN.add(n.id);
      const moving = n.path.length > 0;
      const bob = moving ? Math.abs(Math.sin(this.sim.time * 12 + n.id)) * 1.5 : 0;
      this.syncMover(this.nSprites, n.id, npcKey(n.role), n.x, n.y, 0, bob);
    }
    for (const [map, seen] of [
      [this.eSprites, seenE],
      [this.nSprites, seenN],
    ] as const) {
      for (const [id, m] of map) {
        if (seen.has(id)) continue;
        m.img.destroy();
        m.shadow.destroy();
        map.delete(id);
      }
    }
  }

  private consumeEvents() {
    const world = this.sim.world;
    for (const ev of this.sim.drainEvents()) {
      if (ev.type === 'shot') {
        const from = gridToScreen(ev.fromX, ev.fromY, heightAt(world, Math.floor(ev.fromX), Math.floor(ev.fromY)));
        from.y -= MUZZLE_Z;
        const to = this.groundScreen(ev.toX, ev.toY);
        to.y -= 10;
        this.flashes.push({ kind: 'shot', color: SHOT_COLORS[ev.kind as TurretKind], a: from, b: to, ttl: 0.12, max: 0.12 });
      } else if (ev.type === 'kill') {
        const p = this.groundScreen(ev.x, ev.y);
        this.flashes.push({ kind: 'pop', color: 0xffd166, a: p, b: p, ttl: 0.35, max: 0.35 });
      } else if (ev.type === 'npcDied') {
        const p = this.groundScreen(ev.x, ev.y);
        this.flashes.push({ kind: 'death', color: 0xff5555, a: p, b: p, ttl: 0.8, max: 0.8 });
        getHud().flash('¡Un NPC ha muerto!');
      } else if (ev.type === 'npcLeft') {
        getHud().flash('Alguien se ha marchado por el hambre');
      } else if (ev.type === 'destroyed') {
        const p = this.groundScreen(ev.x + 0.5, ev.y + 0.5);
        this.flashes.push({ kind: 'death', color: 0xff9f43, a: p, b: p, ttl: 0.6, max: 0.6 });
      } else if (ev.type === 'coreHit') {
        this.cameras.main.shake(120, 0.004);
      } else if (ev.type === 'wave') {
        getHud().flash(`¡Oleada ${ev.wave}!`);
      } else if (ev.type === 'researched') {
        getHud().flash('Investigación completada');
      }
    }
  }

  /** Cables entre postes (curva con caída) — se redibujan cuando cambia la topología. */
  private drawWires() {
    if (this.wiresGrid === this.sim.grid) return;
    this.wiresGrid = this.sim.grid;
    const g = this.wires;
    g.clear();
    const world = this.sim.world;
    for (const [a, b] of this.sim.grid.wires) {
      const pa = this.sim.buildings.get(a);
      const pb = this.sim.buildings.get(b);
      if (!pa || !pb) continue;
      const A = gridToScreen(pa.x + 0.5, pa.y + 0.5, heightAt(world, pa.x, pa.y));
      const B = gridToScreen(pb.x + 0.5, pb.y + 0.5, heightAt(world, pb.x, pb.y));
      A.y -= WIRE_Z;
      B.y -= WIRE_Z;
      const sag = 6 + Math.hypot(A.x - B.x, A.y - B.y) * 0.05;
      const pts: Vec2[] = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        pts.push({ x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t + sag * 4 * t * (1 - t) });
      }
      g.lineStyle(1.5, 0x1a1a1a, 0.8).strokePoints(pts, false);
    }
  }

  /** Ruta prevista de los enemigos desde cada punto de aparición (líneas tenues). */
  private drawPaths() {
    if (this.pathsVersion === this.sim.flowVersion) return;
    this.pathsVersion = this.sim.flowVersion;
    const g = this.paths;
    g.clear();
    const world = this.sim.world;
    for (const s of this.sim.spawns) {
      const pts = this.sim.pathFrom(s).map((t) => gridToScreen(t.x + 0.5, t.y + 0.5, heightAt(world, t.x, t.y)));
      g.lineStyle(2, 0xff6b6b, 0.25);
      g.strokePoints(pts, false);
      g.fillStyle(0xff6b6b, 0.5);
      g.fillEllipse(pts[0].x, pts[0].y, 40, 20);
    }
  }

  private tileOutline(x: number, y: number, w: number, d: number, z: number): Vec2[] {
    return [gridToScreen(x, y, z), gridToScreen(x + w, y, z), gridToScreen(x + w, y + d, z), gridToScreen(x, y + d, z)];
  }

  private drawOverlay() {
    const g = this.overlay;
    g.clear();
    this.ghost.setVisible(false);
    const world = this.sim.world;

    const sel = ui.selected !== null ? this.sim.buildings.get(ui.selected) : undefined;
    if (ui.selected !== null && !sel) ui.selected = null;
    if (sel) {
      const pts = this.tileOutline(sel.x, sel.y, sel.w, sel.d, heightAt(world, sel.x, sel.y));
      g.lineStyle(2, 0x6fd3ff, 1).strokePoints(pts, true);
      if (sel.kind in CONFIG.turrets) this.drawRange(sel, heightAt(world, sel.x, sel.y), CONFIG.turrets[sel.kind as TurretKind].range, 0x6fd3ff);
    }

    const t = this.hover;
    if (!t) return;
    const z = heightAt(world, t.x, t.y);
    let color = 0xffffff;

    if (ui.tool === 'remove') {
      const b = this.sim.buildingAt(t.x, t.y);
      color = b && b.kind !== 'core' ? 0xff5555 : 0x888888;
      const pts = b ? this.tileOutline(b.x, b.y, b.w, b.d, heightAt(world, b.x, b.y)) : this.tileOutline(t.x, t.y, 1, 1, z);
      g.fillStyle(color, 0.25).fillPoints(pts, true);
      g.lineStyle(2, color, 0.9).strokePoints(pts, true);
      return;
    }

    if (ui.tool) {
      const ok = this.sim.canPlace(ui.tool, t.x, t.y).ok;
      color = ok ? 0x7dff8a : 0xff5555;
      const key = shapeKey(ui.tool, ui.dir);
      const info = shapeInfo(key);
      const pos = gridToScreen(t.x, t.y, z);
      this.ghost
        .setTexture(key)
        .setOrigin(info.originX, info.originY)
        .setPosition(pos.x, pos.y)
        .setDepth(depthOf(t.x, t.y, L.ghost))
        .setTint(ok ? 0xb8ffbf : 0xff8080)
        .setVisible(true);
      if (ui.tool in CONFIG.turrets) this.drawRange(t, z, CONFIG.turrets[ui.tool as TurretKind].range, color);
    }
    const pts = this.tileOutline(t.x, t.y, 1, 1, z);
    g.fillStyle(color, 0.18).fillPoints(pts, true);
    g.lineStyle(2, color, 0.9).strokePoints(pts, true);
  }

  private drawRange(t: Tile, z: number, r: number, color: number) {
    const c = gridToScreen(t.x + 0.5, t.y + 0.5, z);
    // Un círculo en la cuadrícula es una elipse 2:1 en pantalla.
    this.overlay.lineStyle(1.5, color, 0.7);
    this.overlay.strokeEllipse(c.x, c.y, 2 * r * HALF_W * Math.SQRT2, 2 * r * HALF_H * Math.SQRT2);
  }

  private bar(g: Phaser.GameObjects.Graphics, x: number, y: number, f: number, color: number) {
    g.fillStyle(0x000000, 0.6).fillRect(x - 11, y, 22, 4);
    g.fillStyle(color, 1).fillRect(x - 10, y + 1, 20 * Math.max(0, Math.min(1, f)), 2);
  }

  private drawFx(dt: number) {
    const g = this.fx;
    g.clear();
    const world = this.sim.world;
    for (const e of this.sim.enemies) {
      const p = this.groundScreen(e.x, e.y);
      const f = e.hp / e.maxHp;
      this.bar(g, p.x, p.y - 36 - (e.flying ? FLY_Z : 0), f, f > 0.5 ? 0x7dff8a : f > 0.25 ? 0xffd166 : 0xff5555);
    }
    for (const n of this.sim.npcs) {
      if (n.hp >= n.maxHp) continue;
      const p = this.groundScreen(n.x, n.y);
      this.bar(g, p.x, p.y - 34, n.hp / n.maxHp, 0x6fd3ff);
    }
    for (const b of this.sim.buildings.values()) {
      const top = gridToScreen(b.x + b.w / 2, b.y + b.d / 2, heightAt(world, b.x, b.y));
      if (!b.built) this.bar(g, top.x, top.y - 10, b.progress, 0x6fd3ff);
      else if (b.hp < b.maxHp) this.bar(g, top.x, top.y - 50, b.hp / b.maxHp, 0xff9f43);
    }
    this.flashes = this.flashes.filter((f) => (f.ttl -= dt) > 0);
    for (const f of this.flashes) {
      const a = f.ttl / f.max;
      if (f.kind === 'shot') {
        g.lineStyle(2, f.color, a).lineBetween(f.a.x, f.a.y, f.b.x, f.b.y);
      } else {
        const r = 6 + (1 - a) * (f.kind === 'death' ? 26 : 18);
        g.lineStyle(2, f.color, a).strokeEllipse(f.a.x, f.a.y - 6, r * 2, r);
      }
    }
  }

  /**
   * Edificios altos que tapan al cursor, a un enemigo o a un NPC se vuelven semitransparentes.
   * La comprobación es pura (iso.occludes): está delante en profundidad y cubre el punto en pantalla.
   */
  private updateOcclusion(dt: number) {
    const targets: { p: Vec2; depth: number }[] = [];
    if (this.hover) {
      const z = heightAt(this.sim.world, this.hover.x, this.hover.y);
      const p = gridToScreen(this.hover.x + 0.5, this.hover.y + 0.5, z);
      const depth = depthOf(this.hover.x, this.hover.y, L.ghost);
      targets.push({ p, depth }, { p: { x: p.x, y: p.y - 20 }, depth });
    }
    for (const m of [...this.sim.enemies, ...this.sim.npcs]) {
      const p = this.groundScreen(m.x, m.y);
      targets.push({ p: { x: p.x, y: p.y - 10 }, depth: this.moverDepth(m.x, m.y) });
    }
    const k = Math.min(1, dt * 12);
    for (const [id, s] of this.bSprites) {
      const b = this.sim.buildings.get(id);
      const base = b && !b.built ? SITE_ALPHA : 1;
      let want = base;
      if (s.tall) {
        const bounds = s.img.getBounds();
        if (targets.some((t) => occludes(bounds, s.img.depth, t.p, t.depth))) want = Math.min(base, 0.35);
      }
      s.alpha += (want - s.alpha) * k;
      s.img.setAlpha(s.alpha);
    }
  }

  private hoverInfo(): string {
    const t = this.hover;
    if (!t) return '';
    const world = this.sim.world;
    const parts = [`Casilla ${t.x},${t.y} · altura ${heightAt(world, t.x, t.y)}`];
    const ore = oreAt(world, t.x, t.y);
    if (ore !== Ore.None) parts.push(`Recurso: ${ORE_NAMES[ore]}`);
    const b = this.sim.buildingAt(t.x, t.y);
    if (b) parts.push(`${this.sim.def(b.kind).name}${b.built ? '' : ' (obra)'}`);
    if (b?.kind === 'belt' && b.item) parts.push(itemName(b.item));
    if (ui.tool && ui.tool !== 'remove') {
      const c = this.sim.canPlace(ui.tool, t.x, t.y);
      if (!c.ok) parts.push(`✗ ${c.reason}`);
    }
    return parts.join(' · ');
  }
}
