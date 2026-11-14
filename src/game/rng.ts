/** PRNG determinista (mulberry32). Devuelve valores en [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ruido de valor 2D suavizado, en [0, 1]. */
export function valueNoise(rng: () => number): (x: number, y: number) => number {
  const N = 64;
  const vals = new Float32Array(N * N);
  for (let i = 0; i < vals.length; i++) vals[i] = rng();
  const v = (i: number, j: number) => vals[(j & (N - 1)) * N + (i & (N - 1))];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const sx = smooth(x - xi);
    const sy = smooth(y - yi);
    const a = v(xi, yi) + (v(xi + 1, yi) - v(xi, yi)) * sx;
    const b = v(xi, yi + 1) + (v(xi + 1, yi + 1) - v(xi, yi + 1)) * sx;
    return a + (b - a) * sy;
  };
}
