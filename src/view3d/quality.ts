/**
 * Niveles de calidad de la vista 3D, bajada automática si el equipo no llega y comprobación de WebGL2.
 * Módulo puro (sin Three ni DOM), con tests.
 */

export type QualityLevel = 'low' | 'medium' | 'high';
/** Lo que elige el jugador: un nivel fijo o `auto` (empieza en alta y baja sola si hace falta). */
export type QualityChoice = QualityLevel | 'auto';

export const QUALITY_LEVELS: QualityLevel[] = ['low', 'medium', 'high'];
export const QUALITY_CHOICES: QualityChoice[] = ['auto', ...QUALITY_LEVELS];
export const QUALITY_NAME: Record<QualityChoice, string> = { auto: 'Auto', low: 'Baja', medium: 'Media', high: 'Alta' };

export interface QualityPreset {
  /** Tope de píxeles reales por píxel de pantalla (en pantallas densas es lo que más pesa). */
  pixelRatio: number;
  /** Muestras de suavizado de bordes (0 = sin suavizado). */
  samples: number;
  /** Valor que toman las sombras y el contorno al elegir el nivel (luego se pueden cambiar sueltos). */
  shadows: boolean;
  outline: boolean;
  /** Lado en píxeles del mapa de sombras. */
  shadowMap: number;
  /** Fracción de partículas (humo, chispas, fuego) que se llegan a crear. */
  particles: number;
  /** Personajes con esqueleto animado a la vez; el resto se dibuja en pose fija. */
  animated: number;
}

export const QUALITY: Record<QualityLevel, QualityPreset> = {
  low: { pixelRatio: 1, samples: 0, shadows: false, outline: false, shadowMap: 1024, particles: 0.4, animated: 80 },
  medium: { pixelRatio: 1.5, samples: 2, shadows: true, outline: true, shadowMap: 1024, particles: 0.7, animated: 150 },
  high: { pixelRatio: 2, samples: 4, shadows: true, outline: true, shadowMap: 2048, particles: 1, animated: 250 },
};

/** Nivel inmediatamente inferior, o null si ya es el más bajo. */
export function lowerLevel(l: QualityLevel): QualityLevel | null {
  const i = QUALITY_LEVELS.indexOf(l);
  return i > 0 ? QUALITY_LEVELS[i - 1] : null;
}

/** Nivel que se aplica de verdad: el fijo, o el que haya alcanzado el modo automático. */
export function effectiveLevel(o: { quality: QualityChoice; autoLevel: QualityLevel }): QualityLevel {
  return o.quality === 'auto' ? o.autoLevel : o.quality;
}

/**
 * Vigila los FPS reales y avisa cuando hay que bajar un nivel: media por debajo de `minFps` durante una
 * ventana entera de `window` segundos. Tras arrancar o tras cada bajada espera `warmup` segundos (carga de
 * modelos y compilación de sombreadores). Los fotogramas con la pestaña oculta o con parones largos no cuentan.
 */
export class QualityGovernor {
  private wait: number;
  private acc = 0;
  private n = 0;
  constructor(readonly minFps = 30, readonly window = 5, readonly warmup = 3) {
    this.wait = warmup;
  }

  /** Empieza de cero (después de cambiar de nivel). */
  reset(): void {
    this.wait = this.warmup;
    this.acc = 0;
    this.n = 0;
  }

  /** `dt` = segundos reales del fotograma; `counts` = false si no es representativo. Devuelve true si toca bajar. */
  sample(dt: number, counts = true): boolean {
    if (!counts || dt <= 0 || dt > 0.5) {
      this.acc = 0;
      this.n = 0;
      return false;
    }
    if (this.wait > 0) {
      this.wait -= dt;
      return false;
    }
    this.acc += dt;
    this.n++;
    if (this.acc < this.window) return false;
    const fps = this.n / this.acc;
    this.acc = 0;
    this.n = 0;
    if (fps >= this.minFps) return false;
    this.wait = this.warmup;
    return true;
  }
}

// ---------- compatibilidad ----------

export type GlSupport =
  | { ok: true; renderer: string; software: boolean }
  /** `webgl1`: el equipo tiene WebGL pero no la versión 2 que necesita el juego. */
  | { ok: false; reason: 'webgl1' | 'none' };

/** Tarjetas "de mentira": el navegador dibuja con el procesador porque no hay aceleración por hardware. */
export function isSoftwareRenderer(name: string): boolean {
  return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
}

interface GlLike {
  RENDERER: number;
  getParameter(p: number): unknown;
  getExtension(name: string): unknown;
}
export interface CanvasLike {
  getContext(kind: string, attrs?: unknown): unknown;
}

/** Comprueba si se puede crear un contexto WebGL2 y qué tarjeta lo dibuja. No lanza nunca. */
export function detectGl(canvas: CanvasLike | null): GlSupport {
  const ctx = (kind: string): GlLike | null => {
    try {
      return (canvas?.getContext(kind) as GlLike | null) ?? null;
    } catch {
      return null;
    }
  };
  const gl = ctx('webgl2');
  if (!gl) return { ok: false, reason: ctx('webgl') || ctx('experimental-webgl') ? 'webgl1' : 'none' };
  let renderer = '';
  try {
    const dbg = gl.getExtension('WEBGL_debug_renderer_info') as { UNMASKED_RENDERER_WEBGL: number } | null;
    renderer = String((dbg && gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || '');
    (gl.getExtension('WEBGL_lose_context') as { loseContext(): void } | null)?.loseContext();
  } catch {
    /* sin datos de la tarjeta: se sigue igual */
  }
  return { ok: true, renderer, software: isSoftwareRenderer(renderer) };
}

/** Texto del aviso cuando el juego no puede arrancar o se queda sin contexto gráfico. */
export function glNotice(reason: 'webgl1' | 'none' | 'lost' | 'error'): { title: string; lines: string[] } {
  if (reason === 'lost')
    return {
      title: 'Se ha perdido la conexión con la tarjeta gráfica',
      lines: ['Suele pasar al actualizar el controlador de vídeo, al suspender el equipo o si la tarjeta se queda sin memoria.', 'Recarga la página para seguir: la partida se autoguarda cada minuto.'],
    };
  const fixes = [
    'Actualiza el navegador a una versión reciente (Chrome, Edge o Firefox).',
    'Activa la aceleración por hardware en los ajustes del navegador y reinícialo.',
    'Actualiza el controlador de la tarjeta gráfica.',
  ];
  if (reason === 'webgl1') return { title: 'Este equipo no admite WebGL2', lines: ['El juego en 3D necesita WebGL2 y aquí sólo está disponible la versión anterior.', ...fixes] };
  if (reason === 'none') return { title: 'Este equipo no puede mostrar gráficos 3D (falta WebGL2)', lines: ['El navegador no ha podido abrir WebGL: está desactivado o la tarjeta gráfica no es compatible.', ...fixes] };
  return { title: 'No se ha podido iniciar la vista 3D', lines: ['La tarjeta gráfica ha rechazado el arranque.', ...fixes] };
}
