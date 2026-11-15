/** Opciones de la vista 3D, guardadas en `localStorage` (módulo puro, con tests). */
export interface Options {
  shadows: boolean;
  /** Multiplicador de velocidad del juego: 1, 2 o 4. */
  speed: number;
  /** Contorno oscuro de objetos. */
  outline: boolean;
  /** Mostrar FPS y llamadas de dibujo en el HUD. */
  perf: boolean;
}

export const OPTIONS_KEY = 'iso-factory-td:options3d';
export const DEFAULT_OPTIONS: Options = { shadows: true, outline: true, speed: 1, perf: false };
const SPEEDS = [1, 2, 4];

type Store = Pick<Storage, 'getItem' | 'setItem'>;

/** Lee las opciones; cualquier valor ausente o inválido cae al valor por defecto. */
export function loadOptions(store: Store | null): Options {
  let raw: Partial<Options> = {};
  try {
    raw = JSON.parse(store?.getItem(OPTIONS_KEY) ?? '{}') as Partial<Options>;
  } catch {
    raw = {};
  }
  if (typeof raw !== 'object' || raw === null) raw = {};
  return {
    shadows: typeof raw.shadows === 'boolean' ? raw.shadows : DEFAULT_OPTIONS.shadows,
    outline: typeof raw.outline === 'boolean' ? raw.outline : DEFAULT_OPTIONS.outline,
    speed: SPEEDS.includes(raw.speed as number) ? (raw.speed as number) : DEFAULT_OPTIONS.speed,
    perf: typeof raw.perf === 'boolean' ? raw.perf : DEFAULT_OPTIONS.perf,
  };
}

export function saveOptions(store: Store | null, o: Options): void {
  try {
    store?.setItem(OPTIONS_KEY, JSON.stringify(o));
  } catch {
    /* sin almacenamiento: sólo vale para esta sesión */
  }
}
