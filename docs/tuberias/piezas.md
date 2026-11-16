# Desniveles en tuberías — Hito 0: las piezas del kit

Medidas en `medidas-piezas.json` (generadas leyendo los .glb), tabla de puertos en `src/view3d/tuberiasPiezas.ts` (con test contra esas medidas) y galería en
`/galeria-tuberias.html` (capturas `galeria-iso.jpg`, `galeria-codo90.jpg`, `galeria-cruce.jpg`). Las versiones `pipe-glass-large*` tienen la **misma forma** (caja idéntica; sólo cambia el material a cristal) y ya están copiadas a `public/assets/3d/factory/`.

## Convenciones comunes
Y arriba; base en y = 0; **eje del tubo a y = 0,5**; origen en el centro; brida de radio 0,5 y 0,1 de ancho; hueco del tubo radio 0,338. Un **puerto** = centro de la cara exterior de una brida + dirección hacia fuera. Dos piezas encajan si sus puertos coinciden y se miran.

| pieza | caja (x × y × z) | puertos (posición → dirección) | qué es |
|---|---|---|---|
| `pipe-large` (recta) | 1 × 1 × 1 | (±0,5; 0,5; 0) → ±x | tramo de 1 a lo largo de x |
| `pipe-large-long` | 2 × 1 × 1 | (±1; 0,5; 0) → ±x | recta de 2 |
| `pipe-large-bump` | 1 × 1 × 1 | igual que la recta | recta con una junta abultada |
| `pipe-large-valve` | 1 × 1 × 1,016 | igual que la recta | recta con válvula (rueda hacia −z) |
| `pipe-large-side` | 2 × 1,5 × 1 | (±1; 0,5; 0) → ±x y (0; 1,5; 0) → +y | **T en el plano vertical XY**: derivación hacia arriba |
| `pipe-large-cross` | 2 × 2 × 1 | (±1; 0,5; 0) → ±x, (0; 1,5; 0) → +y y (0; −0,5; 0) → −y | **cruce en el plano vertical XY** (con un brazo que baja por debajo de y = 0) |
| `pipe-large-junction` | 2,056 × 2,056 × 1 | (±1; 0,5; 0) → ±x y (−0,702; 1,702; 0) → (−0,707; 0,707; 0) | empalme en Y: derivación a 45° |
| `pipe-large-curve` | 1,502 × 1 × 1,246 | (0,5; 0,5; 0) → +x y (−0,649; 0,5; −0,393) → (−0,707; 0; −0,707) | **curva de 45°** en el plano horizontal XZ |
| `pipe-large-bend` | 1,9 × 1 × 1,9 | (1; 0,5; 0) → +x y (−0,4; 0,5; −1,4) → −z | **codo de 90°** en el plano XZ, de radio amplio: brazos de 1,4 hasta la esquina (−0,4; 0) |

### "bend" frente a "curve"
- `bend` = codo de **90°** (dos ejes perpendiculares), `curve` = curva de **45°**. Los dos están modelados **en el plano horizontal**; no hay una versión "horizontal a vertical" aparte, pero **cualquier codo se vuelve vertical girándolo** 90° sobre su eje x o z (la pieza no distingue arriba de adelante).
- `side`, `cross` y `junction` están modelados en el plano **vertical** XY: girados 90° sobre x se convierten en T / cruce / Y horizontales.
- Problema de escala del `bend`: sus brazos miden 1,4 y la pieza ocupa 1,9 × 1,9, o sea casi **dos casillas**; para meterlo en una casilla (brazos de 0,5) habría que escalarlo ×0,357 y el tubo quedaría de diámetro 0,24, más fino que las rectas del juego (0,35). Con un escalado no uniforme se deforma la brida. **No encaja bien en una rejilla de 1×1 con la escala aprobada.**

## Qué falta para el desnivel y cómo lo resolveré
Con alturas 0-2 y salto máximo de 1 nivel (`LEVEL_H` = 0,5 casillas por nivel; hoy está en `view3d/pick.ts`, lo muevo a `CONFIG.scale.levelH` en el Hito 1) hacen falta:

1. **Tramo vertical** de 1 nivel (0,5): *no hace falta pieza nueva* — es la **recta** girada 90° sobre z (eje a lo largo de y) y estirada a 0,5, como ya se estira la recta horizontal (largo × diámetro de `config.ts`). Se conserva la versión de cristal.
2. **Codo horizontal → vertical** (y su inverso), 4 orientaciones × arriba/abajo: **generado por código** como un **cuarto de toro** del mismo diámetro (0,35), con bridas de 0,45 en los dos extremos y el mismo material, tinte por líquido y estilo que el resto (los codos y las curvas horizontales de hoy ya son una esfera central; el cuarto de toro se ve mejor y cierra sin huecos). Motivo para no usar `pipe-large-bend`: ver el problema de escala de arriba.
3. **Codos entre dos direcciones horizontales** (el giro de la tabla del Hito 1 de conexiones): el mismo cuarto de toro, girado.
4. **T, cruces y válvulas** sólo en tramos horizontales (como pides): se siguen componiendo con tubos + pieza central; `side`/`cross`/`junction` del kit no hacen falta (y el `cross` tiene un brazo bajo el suelo).
5. **Soportes/abrazaderas** en verticales y elevados: pieza pequeña por código (caja + abrazadera de la brida de `config.ts`).
6. **Cristal**: versión `pipe-glass-large` para los tramos rectos y verticales (se ve el líquido); los codos de toro llevarán un material translúcido con el color del líquido.

Resumen: **no faltan piezas del kit para el tramo vertical**; los **codos** se generan por código con el mismo diámetro y bridas (el codo del kit no encaja en una casilla a la escala aprobada), y se añaden soportes.

## Reglas de la tabla (para el Hito 1)
- Puertos geométricos de las piezas del juego (no del kit): la recta, el codo de toro, el tramo vertical, la T y el cruce tendrán la misma estructura `PipePort` (posición + dirección unitaria) para que el motor compruebe continuidad: **los puertos de dos piezas contiguas coinciden en el mundo** con tolerancia 0,01.
