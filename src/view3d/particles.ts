/**
 * Partículas de la vista 3D (lógica pura, sin Three): humo, fuego, chispas y anillos.
 * La vista sólo copia posición, tamaño y color de cada una a mallas instanciadas.
 */

/** 0 = bocanada opaca (humo, polvo, escombro); 1 = brillo aditivo (fuego, chispa, fogonazo); 2 = anillo plano en el suelo. */
export type ParticleKind = 0 | 1 | 2;

export interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Segundos que le quedan y duración total. */
  life: number;
  max: number;
  /** Tamaño al nacer y al morir. */
  s0: number;
  s1: number;
  color: number;
  /** Aceleración vertical (negativa = cae). */
  gravity: number;
  /** Frenado por segundo (0 = nada). */
  drag: number;
}

export type ParticleInit = Pick<Particle, 'kind' | 'x' | 'y' | 'z' | 'color'> & Partial<Omit<Particle, 'kind' | 'x' | 'y' | 'z' | 'color' | 'life'>>;

/** Tamaño actual: crece de `s0` a `s1` y se encoge en el último 30 % de su vida (así "se apaga" sin transparencias). */
export function particleSize(p: Particle): number {
  const k = Math.min(1, Math.max(0, 1 - p.life / p.max));
  const base = p.s0 + (p.s1 - p.s0) * k;
  return base * (k > 0.7 ? (1 - k) / 0.3 : 1);
}

export class ParticlePool {
  readonly list: Particle[] = [];
  /** Partículas que no cupieron (para medir). */
  dropped = 0;
  /** Fracción de humo y brillos que se crea (calidad gráfica); los anillos, que marcan zonas de efecto, salen siempre. */
  density = 1;
  constructor(readonly cap: number, private rand: () => number = Math.random) {}

  spawn(p: ParticleInit): boolean {
    if (this.density < 1 && p.kind !== 2 && this.rand() >= this.density) return false;
    if (this.list.length >= this.cap) {
      this.dropped++;
      return false;
    }
    const max = p.max ?? 1;
    this.list.push({ vx: 0, vy: 0, vz: 0, s0: 0.2, s1: 0.2, gravity: 0, drag: 0, ...p, max, life: max });
    return true;
  }

  step(dt: number): void {
    const l = this.list;
    let n = 0;
    for (let i = 0; i < l.length; i++) {
      const p = l[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy += p.gravity * dt;
      if (p.drag > 0) {
        const f = Math.max(0, 1 - p.drag * dt);
        p.vx *= f;
        p.vy *= f;
        p.vz *= f;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      l[n++] = p;
    }
    l.length = n;
  }

  count(kind: ParticleKind): number {
    let n = 0;
    for (const p of this.list) if (p.kind === kind) n++;
    return n;
  }
}

/** Emisor por ritmo: devuelve cuántas partículas tocan este fotograma (acumula las fracciones). */
export class Rate {
  private acc = 0;
  take(perSecond: number, dt: number): number {
    this.acc += perSecond * dt;
    const n = Math.floor(this.acc);
    this.acc -= n;
    return n;
  }
}
