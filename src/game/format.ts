/** Segundos → "m:ss" (redondeando hacia arriba; los infinitos o negativos se muestran como 0:00 o "—"). */
export function formatClock(seconds: number): string {
  if (!isFinite(seconds)) return '—';
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
