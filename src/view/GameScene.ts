/**
 * Vista isométrica. Lee el estado de `Game` cada fotograma y lo dibuja; nunca contiene
 * reglas de juego. Toda la interacción se traduce a comandos (place/remove/rotate).
 */
import Phaser from 'phaser';
import { CONFIG } from '../game/config';
import { FOOTPRINT, Game } from '../game/game';
import { HALF_H, HALF_W, Vec2, depthOf, gridToScreen, occludes, pickTile } from '../game/iso';
import { DX, DY, Dir, Ore, Tile, dirBetween } from '../game/types';
import { MAX_HEIGHT, heightAt, heightAtPoint, oreAt } from '../game/world';
import { ENEMY_KEY, MUZZLE_Z, buildTextures, itemKey, shapeInfo, shapeKey, terrainKey } from './shapes';
import { getHud, ui } from './ui';

interface BSprite {
  img: Phaser.GameObjects.Image;
  shadow?: Phaser.GameObjects.Image;
  key: string;
  tall: boolean;
  alpha: number;
}

interface Flash {
  kind: 'shot' | 'pop';
  a: Vec2;
  b: Vec2;
  ttl: number;
  max: number;
}

/** Capas dentro de una misma diagonal (ver depthOf). */
const L = { terrain: 0, shadow: 1, belt: 2, item: 3, building: 5, ghost: 7 };
const OVERLAY_DEPTH = 1e6;
const ORE_NAMES: Record<number, string> = { [Ore.Iron]: 'hierro', [Ore.Copper]: 'cobre' };

export class GameScene extends Phaser.Scene {
  private sim!: Game;
  private bSprites = new Map<number, BSprite>();
  private eSprites = new Map<number, Phaser.GameObjects.Image>();
  private items: Phaser.GameObjects.Image[] = [];
  private flashes: Flash[] = [];
  private fx!: Phaser.GameObjects.Graphics;
  private overlay!: Phaser.GameObjects.Graphics;
  private paths!: Phaser.GameObjects.Graphics;
  private ghost!: Phaser.GameObjects.Image;
  private hover: Tile | null = null;
  private pathsVersion = -1;
  private drag = { down: false, moved: false, sx: 0, sy: 0, scrollX: 0, scrollY: 0 };
  private painting: Tile | null = null;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  constructor() {
    super('game');
  }

  create(data: { seed?: number }) {
    // La escena se reutiliza al reiniciar: limpiar estado.
    this.bSprites = new Map();
    this.eSprites = new Map();
    this.items = [];
    this.flashes = [];
    this.pathsVersion = -1;
    this.painting = null;

    this.sim = new Game({ seed: data?.seed ?? 7 });
    buildTextures(this);
    this.buildTerrain();

    this.paths = this.add.graphics().setDepth(OVERLAY_DEPTH - 3);
    this.overlay = this.add.graphics().setDepth(OVERLAY_DEPTH - 1);
    this.fx = this.add.graphics().setDepth(OVERLAY_DEPTH);
    this.ghost = this.add.image(0, 0, 'tower').setVisible(false).setAlpha(0.6);

    const cam = this.cameras.main;
    const c = this.sim.core;
    const p = gridToScreen(c.x + 1, c.y + 1, 0);
    cam.centerOn(p.x, p.y);
    cam.setZoom(1);

    this.setupInput();

    const hud = getHud();
    hud.onRestart = () => this.scene.restart({ seed: Math.floor(Math.random() * 1e9) });
    hud.onCallWave = () => this.sim.callWaveNow();
  }

  // ------------------------------------------------------------------ terreno

  private buildTerrain() {
    const { w, h } = this.sim.world;
    const world = this.sim.world;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
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
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT') as Record<string, Phaser.Input.Keyboard.Key>;

    this.input.keyboard!.on('keydown', (ev: KeyboardEvent) => {
      const hud = getHud();
      if (ev.key === 'r' || ev.key === 'R') hud.rotate();
      else if (ev.key === 'Escape') hud.setTool(null);
      else if (ev.key === '1') hud.setTool('drill');
      else if (ev.key === '2') hud.setTool('belt');
      else if (ev.key === '3') hud.setTool('tower');
      else if (ev.key === '4') hud.setTool('remove');
    });

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.updateHover();
      if (p.button === 0 && p.event.shiftKey && ui.tool === 'belt' && this.hover) {
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
      if (p.button === 2) getHud().setTool(null);
      else if (p.button === 0) this.onClick();
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
      // Sin herramienta: clic gira cintas y taladros.
      const b = this.sim.buildingAt(t.x, t.y);
      if (b && (b.kind === 'belt' || b.kind === 'drill')) this.sim.rotate(t.x, t.y, ((b.dir + 1) % 4) as Dir);
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
    let guard = 0;
    while ((this.painting.x !== this.hover.x || this.painting.y !== this.hover.y) && guard++ < 64) {
      const dx = this.hover.x - this.painting.x;
      const dy = this.hover.y - this.painting.y;
      const next = Math.abs(dx) >= Math.abs(dy)
        ? { x: this.painting.x + Math.sign(dx), y: this.painting.y }
        : { x: this.painting.x, y: this.painting.y + Math.sign(dy) };
      const dir = dirBetween(this.painting, next)!;
      ui.dir = dir;
      this.sim.rotate(this.painting.x, this.painting.y, dir);
      const existing = this.sim.buildingAt(next.x, next.y);
      if (existing?.kind === 'belt') this.sim.rotate(next.x, next.y, dir);
      else if (!existing) this.placeAt(next);
      this.painting = next;
    }
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
    this.syncEnemies();
    this.consumeEvents();
    this.drawPaths();
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
        const [fw, fd] = FOOTPRINT[b.kind];
        const img = this.add
          .image(pos.x, pos.y, key)
          .setOrigin(info.originX, info.originY)
          .setDepth(depthOf(b.x + fw - 1, b.y + fd - 1, b.kind === 'belt' ? L.belt : L.building));
        let shadow: Phaser.GameObjects.Image | undefined;
        if (info.shadow) {
          const si = shapeInfo(info.shadow);
          shadow = this.add
            .image(pos.x, pos.y, info.shadow)
            .setOrigin(si.originX, si.originY)
            .setDepth(depthOf(b.x + fw, b.y + fd, L.shadow));
        }
        s = { img, shadow, key, tall: info.tall, alpha: 1 };
        this.bSprites.set(b.id, s);
      } else if (s.key !== key) {
        const info = shapeInfo(key);
        s.img.setTexture(key).setOrigin(info.originX, info.originY);
        s.key = key;
      }
    }
    for (const [id, s] of this.bSprites) {
      if (seen.has(id)) continue;
      s.img.destroy();
      s.shadow?.destroy();
      this.bSprites.delete(id);
    }
  }

  private syncItems() {
    let i = 0;
    const world = this.sim.world;
    for (const b of this.sim.buildings.values()) {
      if (b.kind !== 'belt' || b.item === Ore.None) continue;
      let img = this.items[i];
      if (!img) {
        img = this.add.image(0, 0, itemKey(Ore.Iron));
        this.items.push(img);
      }
      const key = itemKey(b.item);
      const info = shapeInfo(key);
      const t = b.progress - 0.5;
      const pos = gridToScreen(b.x + 0.5 + t * DX[b.dir], b.y + 0.5 + t * DY[b.dir], heightAt(world, b.x, b.y));
      img.setTexture(key).setOrigin(info.originX, info.originY).setPosition(pos.x, pos.y);
      img.setDepth(depthOf(b.x, b.y, L.item)).setVisible(true);
      i++;
    }
    for (; i < this.items.length; i++) this.items[i].setVisible(false);
  }

  private enemyScreen(x: number, y: number): Vec2 {
    return gridToScreen(x, y, heightAtPoint(this.sim.world, x, y));
  }

  private syncEnemies() {
    const seen = new Set<number>();
    const info = shapeInfo(ENEMY_KEY);
    for (const e of this.sim.enemies) {
      seen.add(e.id);
      let img = this.eSprites.get(e.id);
      if (!img) {
        img = this.add.image(0, 0, ENEMY_KEY).setOrigin(info.originX, info.originY);
        this.eSprites.set(e.id, img);
      }
      const p = this.enemyScreen(e.x, e.y);
      const bob = Math.abs(Math.sin(this.sim.time * 8 + e.id)) * 2;
      img.setPosition(p.x, p.y - bob).setDepth(depthOf(e.x - 0.5, e.y - 0.5, 6));
    }
    for (const [id, img] of this.eSprites) {
      if (seen.has(id)) continue;
      img.destroy();
      this.eSprites.delete(id);
    }
  }

  private consumeEvents() {
    const world = this.sim.world;
    for (const ev of this.sim.drainEvents()) {
      if (ev.type === 'shot') {
        const from = gridToScreen(ev.fromX, ev.fromY, heightAt(world, Math.floor(ev.fromX), Math.floor(ev.fromY)));
        from.y -= MUZZLE_Z;
        const to = this.enemyScreen(ev.toX, ev.toY);
        to.y -= 10;
        this.flashes.push({ kind: 'shot', a: from, b: to, ttl: 0.12, max: 0.12 });
      } else if (ev.type === 'kill') {
        const p = this.enemyScreen(ev.x, ev.y);
        this.flashes.push({ kind: 'pop', a: p, b: p, ttl: 0.35, max: 0.35 });
      } else if (ev.type === 'coreHit') {
        this.cameras.main.shake(120, 0.004);
      } else if (ev.type === 'wave') {
        getHud().flash(`¡Oleada ${ev.wave}!`);
      }
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
      const sp = pts[0];
      g.fillStyle(0xff6b6b, 0.5);
      g.fillEllipse(sp.x, sp.y, 40, 20);
    }
  }

  private tileOutline(x: number, y: number, w: number, d: number, z: number): Vec2[] {
    return [gridToScreen(x, y, z), gridToScreen(x + w, y, z), gridToScreen(x + w, y + d, z), gridToScreen(x, y + d, z)];
  }

  private drawOverlay() {
    const g = this.overlay;
    g.clear();
    this.ghost.setVisible(false);
    const t = this.hover;
    if (!t) return;
    const world = this.sim.world;
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
      if (ui.tool === 'tower') this.drawRange(t, z, color);
    } else {
      const b = this.sim.buildingAt(t.x, t.y);
      if (b?.kind === 'tower') this.drawRange(b, heightAt(world, b.x, b.y), 0x4fc3f7);
    }
    const pts = this.tileOutline(t.x, t.y, 1, 1, z);
    g.fillStyle(color, 0.18).fillPoints(pts, true);
    g.lineStyle(2, color, 0.9).strokePoints(pts, true);
  }

  private drawRange(t: Tile, z: number, color: number) {
    const c = gridToScreen(t.x + 0.5, t.y + 0.5, z);
    const r = CONFIG.tower.range;
    // Un círculo en la cuadrícula es una elipse 2:1 en pantalla.
    this.overlay.lineStyle(1.5, color, 0.7);
    this.overlay.strokeEllipse(c.x, c.y, 2 * r * HALF_W * Math.SQRT2, 2 * r * HALF_H * Math.SQRT2);
  }

  private drawFx(dt: number) {
    const g = this.fx;
    g.clear();
    for (const e of this.sim.enemies) {
      const p = this.enemyScreen(e.x, e.y);
      const f = Math.max(0, e.hp / e.maxHp);
      g.fillStyle(0x000000, 0.6).fillRect(p.x - 11, p.y - 36, 22, 4);
      g.fillStyle(f > 0.5 ? 0x7dff8a : f > 0.25 ? 0xffd166 : 0xff5555, 1).fillRect(p.x - 10, p.y - 35, 20 * f, 2);
    }
    this.flashes = this.flashes.filter((f) => (f.ttl -= dt) > 0);
    for (const f of this.flashes) {
      const a = f.ttl / f.max;
      if (f.kind === 'shot') {
        g.lineStyle(2, 0x9be7ff, a).lineBetween(f.a.x, f.a.y, f.b.x, f.b.y);
      } else {
        const r = 6 + (1 - a) * 18;
        g.lineStyle(2, 0xffd166, a).strokeEllipse(f.a.x, f.a.y - 6, r * 2, r);
      }
    }
  }

  /**
   * Edificios altos que tapan al cursor/fantasma o a un enemigo se vuelven semitransparentes.
   * La comprobación es pura (iso.occludes): está delante en profundidad y cubre el punto en pantalla.
   */
  private updateOcclusion(dt: number) {
    const targets: { p: Vec2; depth: number }[] = [];
    if (this.hover) {
      const z = heightAt(this.sim.world, this.hover.x, this.hover.y);
      const p = gridToScreen(this.hover.x + 0.5, this.hover.y + 0.5, z);
      targets.push({ p, depth: depthOf(this.hover.x, this.hover.y, L.ghost) });
      targets.push({ p: { x: p.x, y: p.y - 20 }, depth: depthOf(this.hover.x, this.hover.y, L.ghost) });
    }
    for (const e of this.sim.enemies) {
      const p = this.enemyScreen(e.x, e.y);
      targets.push({ p: { x: p.x, y: p.y - 8 }, depth: depthOf(e.x - 0.5, e.y - 0.5, 6) });
    }
    const k = Math.min(1, dt * 12);
    for (const s of this.bSprites.values()) {
      if (!s.tall) continue;
      const bounds = s.img.getBounds();
      const hidden = targets.some((t) => occludes(bounds, s.img.depth, t.p, t.depth));
      const want = hidden ? 0.35 : 1;
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
    if (ore !== Ore.None) parts.push(`Mena: ${ORE_NAMES[ore]}`);
    const b = this.sim.buildingAt(t.x, t.y);
    if (b) parts.push(`Edificio: ${b.kind}`);
    if (ui.tool && ui.tool !== 'remove') {
      const c = this.sim.canPlace(ui.tool, t.x, t.y);
      if (!c.ok) parts.push(`✗ ${c.reason}`);
    }
    return parts.join(' · ');
  }
}
