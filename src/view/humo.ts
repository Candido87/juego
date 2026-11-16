/**
 * Humo ligero (Kenney Smoke Particle Pack, CC0): bocanadas blancas de producción y negras de daño.
 * La decisión de qué edificio echa humo es pura (smokeSource) para poder probarla; las partículas son imágenes
 * reutilizadas de un pequeño pool con tope.
 */
import Phaser from 'phaser';
import type { Building } from '../game/game';

export type SmokeKind = 'white' | 'black';
export interface SmokeSource {
  kind: SmokeKind;
  /** Bocanadas por segundo. */
  rate: number;
}

const PRODUCERS = new Set(['factory', 'refinery']);
const TURRETS = /^turret_/;

/** Qué humo echa un edificio ahora mismo (o null). El daño manda sobre la producción. */
export function smokeSource(b: Pick<Building, 'kind' | 'built' | 'hp' | 'maxHp' | 'craft' | 'power' | 'running'>): SmokeSource | null {
  if (!b.built) return null;
  const frac = b.hp / b.maxHp;
  if (frac < 0.5 && !TURRETS.test(b.kind) && b.kind !== 'core') return { kind: 'black', rate: frac < 0.25 ? 3 : 1.8 };
  if (PRODUCERS.has(b.kind) && b.craft > 0 && b.power > 0) return { kind: 'white', rate: 1.2 };
  if (b.kind === 'generator' && b.running) return { kind: 'white', rate: 1.6 };
  return null;
}

const FILES: Record<SmokeKind, string[]> = {
  white: ['whitePuff00', 'whitePuff01', 'whitePuff02'],
  black: ['blackSmoke00', 'blackSmoke01', 'blackSmoke02'],
};
const SIZE = 48;
const MAX_PARTICLES = 120;
const key = (k: SmokeKind, i: number) => `humo_${k}_${i}`;
const srcKey = (name: string) => `humo_src_${name}`;

export function preloadSmoke(scene: Phaser.Scene): void {
  for (const names of Object.values(FILES))
    for (const n of names) if (!scene.textures.exists(srcKey(n))) scene.load.image(srcKey(n), `assets/humo/${n}.png`);
}

/** Reduce las imágenes originales (≈ 380 px) a 48 px una sola vez. */
export function bakeSmoke(scene: Phaser.Scene): boolean {
  let ok = true;
  for (const kind of Object.keys(FILES) as SmokeKind[]) {
    FILES[kind].forEach((n, i) => {
      if (scene.textures.exists(key(kind, i))) return;
      if (!scene.textures.exists(srcKey(n))) {
        ok = false;
        return;
      }
      const src = scene.textures.get(srcKey(n)).getSourceImage() as CanvasImageSource;
      const tex = scene.textures.createCanvas(key(kind, i), SIZE, SIZE)!;
      const ctx = tex.getContext();
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(src, 0, 0, SIZE, SIZE);
      tex.refresh();
    });
  }
  return ok;
}

interface Puff {
  img: Phaser.GameObjects.Image;
  age: number;
  life: number;
  vx: number;
  vy: number;
  x: number;
  y: number;
  grow: number;
  alpha: number;
}

export class SmokeFx {
  private puffs: Puff[] = [];
  private free: Phaser.GameObjects.Image[] = [];
  private acc = new Map<number, number>();
  private ready = false;

  constructor(private scene: Phaser.Scene, private depth: number) {}

  /** Emite según la tasa de la fuente; (x, y) es la boca del edificio en pantalla. */
  emit(id: number, src: SmokeSource, x: number, y: number, dt: number): void {
    if (!this.ready) this.ready = bakeSmoke(this.scene);
    if (!this.ready) return;
    const a = (this.acc.get(id) ?? Math.random()) + src.rate * dt;
    const n = Math.floor(a);
    this.acc.set(id, a - n);
    for (let i = 0; i < n && this.puffs.length < MAX_PARTICLES; i++) this.spawn(src.kind, x, y);
  }

  forget(id: number): void {
    this.acc.delete(id);
  }

  private spawn(kind: SmokeKind, x: number, y: number) {
    const tex = key(kind, Math.floor(Math.random() * 3));
    const img = this.free.pop() ?? this.scene.add.image(0, 0, tex);
    img.setTexture(tex).setVisible(true).setDepth(this.depth).setRotation(Math.random() * Math.PI * 2);
    const black = kind === 'black';
    this.puffs.push({
      img,
      age: 0,
      life: black ? 1.8 : 2.2,
      x: x + (Math.random() - 0.5) * 8,
      y,
      vx: 4 + Math.random() * 6,
      vy: -(14 + Math.random() * 8),
      grow: black ? 0.5 : 0.6,
      alpha: black ? 0.75 : 0.6,
    });
  }

  update(dt: number): void {
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.age += dt;
      if (p.age >= p.life) {
        p.img.setVisible(false);
        this.free.push(p.img);
        this.puffs.splice(i, 1);
        continue;
      }
      const t = p.age / p.life;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.img.setPosition(p.x, p.y).setScale(0.25 + p.grow * t).setAlpha(p.alpha * Math.sin(Math.min(1, t * 1.2) * Math.PI * 0.5) * (1 - t));
    }
  }
}
