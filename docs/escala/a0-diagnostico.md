# A0 — diagnóstico de escala y huellas

Captura: `a0-proporciones.jpg` (`?demo=1`: cintas, tuberías, generador, almacén y torre en la misma vista).

## ¿Existe el sistema de huellas? **No.**
- Todos los edificios de `CONFIG.buildings` miden `size: [1, 1]` (27 de 29; sólo el núcleo y un almacén antiguo son [2, 2]). `Building.w/d` existen y la ocupación, la colocación, los puertos
  (`puertos.ts: ports(kind, x, y, dir)`: "edificio de 1×1") y los caminos de NPCs y enemigos suponen 1×1 para todo lo demás.
- `CONFIG.scale.footprints` (fábrica 3×3, refinería 3×4, granja 4×4...) es sólo una **referencia** para la galería de escala; lo dice su propio comentario ("para cuando exista el sistema de huellas, HUE1").
- Está pendiente en `PROGRESS.md` como HUE1-HUE6.

## Proporciones reales hoy (en casillas; fuente `CONFIG.scale`)
| cosa | medida |
|---|---|
| ancho máx. de un edificio (cualquiera, 1 casilla) | 0,95 |
| ancho de la cinta | 0,65 → **68 % del ancho de la fábrica** (y de cualquier edificio) |
| diámetro de la tubería / brida | 0,35 / 0,45 → 37 % / 47 % |
| altura de una persona | 0,62 → **menor que el ancho de la cinta (0,65)** |
| objetos sobre la cinta | 0,15-0,25 → hasta 38 % del ancho de la cinta |
| altura de la cinta | 0,18 |

En la captura se ve: la tubería es casi tan gruesa como el generador y la cinta casi tan ancha como el almacén.

## Causa
Confirmada la sospecha: **los edificios ocupan una sola casilla**, pero una cinta o una tubería también y a ancho casi completo. Una fábrica que en la vista mide 1,6 de alto y 0,95 de ancho
queda al lado de una cinta de 0,65. No es un fallo de la escala de la cinta en sí (0,65 ya se redujo en ESC-2) sino de que el edificio es pequeño: con una fábrica 3×3 (2,85 de ancho)
la cinta de 0,65 sería el 23 % y la de 0,5 el 18 %, justo la relación buscada (≈ 1/3 o menos).

## Qué implica A1
1. Implementar huellas de verdad (lógica en `src/game/`): ocupación, colisiones, colocación con el fantasma de toda la huella, rotación, selección, demolición,
   caminos de NPCs y enemigos, puertos por lado y migración del guardado con número de versión. Es el trabajo grande (HUE1+HUE2 del plan).
2. Reducir cinta (≈ 0,5 × 0,12), tubería (≈ 0,25-0,3) y objetos (0,12-0,18), y el panel F2 de depuración de escala.
