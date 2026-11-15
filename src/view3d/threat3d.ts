/**
 * Amenaza a la vista: una bandera roja en cada punto de aparición de enemigos y la ruta prevista hasta el núcleo
 * (un punto rojo por casilla). La ruta se rehace sólo cuando la lógica recalcula los caminos.
 */
import * as THREE from 'three';
import type { Game } from '../game/game';
import { heightAtPoint } from '../game/world';
import { LEVEL_H } from './pick';

const RED = 0xff4d4d;
const MAX_DOTS = 4096;

export class ThreatMarks {
  readonly group = new THREE.Group();
  private dots: THREE.InstancedMesh;
  private version = -1;
  readonly stats = { spawns: 0, dots: 0 };

  constructor(private game: Game) {
    const flat = (r: number, seg: number) => new THREE.CircleGeometry(r, seg).rotateX(-Math.PI / 2);
    const ground = new THREE.MeshBasicMaterial({ color: RED, transparent: true, opacity: 0.55, depthWrite: false });
    const pole = new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 1, metalness: 0 });
    const cloth = new THREE.MeshStandardMaterial({ color: RED, roughness: 1, metalness: 0, side: THREE.DoubleSide });
    const flag = new THREE.BufferGeometry();
    flag.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0.34, 0, 0.5, 0.17, 0], 3));
    flag.computeVertexNormals();
    for (const s of game.spawns) {
      const y = this.y(s.x + 0.5, s.y + 0.5);
      const g = new THREE.Group();
      g.position.set(s.x + 0.5, y, s.y + 0.5);
      const disc = new THREE.Mesh(flat(0.46, 24), ground);
      disc.position.y = 0.07;
      disc.renderOrder = 3;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.3, 8), pole);
      post.position.y = 0.65;
      post.castShadow = true;
      // Dos paños cruzados: la bandera se ve desde los cuatro giros de la cámara.
      const f = new THREE.Mesh(flag, cloth);
      f.position.y = 0.94;
      const f2 = f.clone();
      f2.rotation.y = Math.PI / 2;
      g.add(disc, post, f, f2);
      this.group.add(g);
    }
    this.stats.spawns = game.spawns.length;
    this.dots = new THREE.InstancedMesh(flat(0.14, 12), new THREE.MeshBasicMaterial({ color: 0xd42020, transparent: true, opacity: 0.8, depthWrite: false }), MAX_DOTS);
    this.dots.count = 0;
    this.dots.frustumCulled = false;
    this.dots.renderOrder = 3;
    this.group.add(this.dots);
  }

  private y(x: number, z: number): number {
    return heightAtPoint(this.game.world, x, z) * LEVEL_H;
  }

  /** Rehace la ruta si la lógica ha recalculado los caminos (al construir o quitar algo que los corta). */
  update(): void {
    if (this.version === this.game.flowVersion) return;
    this.version = this.game.flowVersion;
    const m = new THREE.Matrix4();
    let n = 0;
    for (const s of this.game.spawns) {
      const path = this.game.pathFrom(s);
      // La primera casilla es la propia aparición (ya lleva su disco) y la última el núcleo.
      for (let i = 1; i < path.length - 1 && n < MAX_DOTS; i++) {
        const t = path[i];
        m.makeTranslation(t.x + 0.5, this.y(t.x + 0.5, t.y + 0.5) + 0.07, t.y + 0.5);
        this.dots.setMatrixAt(n++, m);
      }
    }
    this.dots.count = n;
    this.dots.instanceMatrix.needsUpdate = true;
    this.stats.dots = n;
  }
}
