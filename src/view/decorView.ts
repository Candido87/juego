/** Capa de Phaser de la decoración (ver decor.ts): sprites de Sketch Town, arbustos y flores horneados por código. */
import Phaser from 'phaser';
import { Vec2, depthOf, gridToScreen, occludes } from '../game/iso';
import { Tile } from '../game/types';
import { World, heightAt } from '../game/world';
import { SKETCH_SCALE } from './sketch';
import { DECOR_SPRITES, Decor, DecorKind, decorSpriteKey, generateDecor } from './decor';

const BUSH_KEY = 'dec_bush';
const FLOWER_KEYS = ['dec_flower_0', 'dec_flower_1', 'dec_flower_2'];
const DEPTH_LAYER = 4;
/** El suelo de la casilla en el PNG de Sketch Town (128, 289) sobre 256x352. */
const ORIGIN = { x: 0.5, y: 289 / 352 };

export function preloadDecor(scene: Phaser.Scene): void {
  for (const [kind, v] of Object.entries(DECOR_SPRITES) as [DecorKind, ['base' | 'exp', string]][])
    for (let r = 0; r < 4; r++) {
      const key = decorSpriteKey(kind, r);
      if (!scene.textures.exists(key)) scene.load.image(key, `assets/${v[0] === 'base' ? 'sketch-town' : 'sketch-town-expansion'}/Tiles/${v[1]}_${'NESW'[r]}.png`);
    }
}

function bakeSmall(scene: Phaser.Scene) {
  if (scene.textures.exists(BUSH_KEY)) return;
  const bush = scene.textures.createCanvas(BUSH_KEY, 22, 16)!;
  const c = bush.getContext();
  for (const [x, y, r, col] of [[7, 10, 6, '#2f6b2a'], [14, 10, 6, '#3a7d32'], [11, 7, 6, '#4a9040']] as [number, number, number, string][]) {
    c.fillStyle = col;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  }
  bush.refresh();
  ['#ffd166', '#ff7b9c', '#ffffff'].forEach((col, i) => {
    const t = scene.textures.createCanvas(FLOWER_KEYS[i], 12, 10)!;
    const g = t.getContext();
    for (const [x, y] of [[3, 7], [8, 4], [6, 8]]) {
      g.fillStyle = '#2f6b2a';
      g.fillRect(x, y, 1, 2);
      g.fillStyle = col;
      g.fillRect(x - 1, y - 1, 3, 2);
    }
    t.refresh();
  });
}

interface DSprite {
  d: Decor;
  img: Phaser.GameObjects.Image;
  alpha: number;
}

export class DecorLayer {
  private items: DSprite[] = [];

  constructor(private scene: Phaser.Scene, private world: World, seed: number, core: Tile, spawns: Tile[]) {
    bakeSmall(scene);
    for (const d of generateDecor(world, seed, core, spawns)) {
      const p = gridToScreen(d.x + 0.5, d.y + 0.5, heightAt(world, d.x, d.y));
      let img: Phaser.GameObjects.Image;
      if (d.kind === 'bush') img = scene.add.image(p.x, p.y, BUSH_KEY).setOrigin(0.5, 0.8);
      else if (d.kind === 'flower') img = scene.add.image(p.x, p.y, FLOWER_KEYS[d.rot % 3]).setOrigin(0.5, 0.8);
      else {
        const key = decorSpriteKey(d.kind, d.rot);
        if (!scene.textures.exists(key)) continue;
        img = scene.add.image(p.x, p.y, key).setOrigin(ORIGIN.x, ORIGIN.y).setScale(SKETCH_SCALE);
      }
      img.setDepth(depthOf(d.x, d.y, DEPTH_LAYER));
      this.items.push({ d, img, alpha: 1 });
    }
  }

  /** Oculta lo que queda bajo un edificio y vuelve semitransparentes los árboles que tapan el cursor, el fantasma o un enemigo. */
  update(occupied: Set<number>, targets: { p: Vec2; depth: number }[], k: number, view: Phaser.Geom.Rectangle) {
    const w = this.world.w;
    for (const s of this.items) {
      const used = occupied.has(s.d.y * w + s.d.x);
      if (s.img.visible === used) s.img.setVisible(!used);
      if (used || !s.d.tall) continue;
      // Fuera de pantalla no se calcula nada.
      if (!Phaser.Geom.Rectangle.Overlaps(view, s.img.getBounds())) continue;
      const hide = targets.some((t) => occludes(s.img.getBounds(), s.img.depth, t.p, t.depth));
      s.alpha += ((hide ? 0.35 : 1) - s.alpha) * k;
      s.img.setAlpha(s.alpha);
    }
  }
}
