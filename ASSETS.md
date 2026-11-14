# ASSETS — inventario de los packs gráficos (Fase 0)

Inventario hecho sin tocar código. Visor para comprobarlo con el juego en marcha:
`/tools/sheets.html` (hojas de 16 px ampliadas y numeradas) y `/tools/atlas.html` (Tiny Factory).

> **Dónde están realmente los archivos.** El encargo decía `public/assets/` con rutas `[CARPETA1]…` sin rellenar.
> En `public/assets/` sólo está el Tiny Factory ya integrado. Los packs nuevos están en **`assets-juego/`** y
> **en la raíz del proyecto** (`Tiles/`, `Tilemap/`, `Map/`, `Preview.png`…), mezclados, y ya están subidos a GitHub
> (entraron en el commit del hito P7). He trabajado con esas dos ubicaciones.

## Resumen por pack

| # | Pack (identificado por contenido) | Dónde | Qué contiene | Licencia | ¿Crédito? | Losa / sprite | ¿Encaja con 64×32? |
|---|---|---|---|---|---|---|---|
| 1 | **Kenney Tiny Factory** (ya integrado) | `public/assets/kenney/tiny-factory.png` (+ `License.txt`) | Cintas, máquinas, obrero, carretilla, robot, iconos | CC0 | No obligatorio (se acredita) | Hoja 12×11 de **16 px**, 1 px de separación | **No** (cenital); usado proyectado y como sprites de pie |
| 2 | **Kenney Sketch Town** 1.0 | `assets-juego/Tiles/*_{N,E,S,W}.png` (87 piezas × 4 giros = 348) | Bloques de hierba/tierra/agua/ríos/caminos/pendientes, castillo (muro, esquina, torre, puerta), edificios, tejados, rocas, árboles, puente | CC0 (archivo incluido) | No obligatorio | **256×352 px** por pieza | **Sí**: cámara 26,565° × 45° = proyección 2:1 exacta |
| 3 | **Kenney Sketch Town Expansion** 1.1 | `Tiles/*_{N,E,S,W}.png` en la raíz (59 × 4 = 236) | Acantilados, vallas de madera, surcos de cultivo (con trigo), pinos, torres/extremos de castillo, balcones, tejados extra | CC0 (archivo incluido) | No obligatorio | **256×352 px** | **Sí** (mismo formato que el 2) |
| 4 | **Kenney Tiny Dungeon** (inferido) | `assets-juego/Tilemap/*.png` y `assets-juego/Tiles/tile_0000–0131.png` | Héroes, monstruos (murciélago, fantasma, araña, limo…), cofres, puertas, armas, pociones, suelos de mazmorra | CC0 en la web de Kenney; **no trae archivo propio** | No obligatorio | **16 px**, 12×11, 1 px de separación | **No** (cenital) |
| 5 | **Kenney Tiny Town** (inferido) | `Tilemap/*.png` y `Tiles/tile_0000–0131.png` en la raíz | Árboles, setos, vallas, coches, farolas, 4 personajes, calles y edificios cenitales | CC0 en la web de Kenney; **sin archivo propio** | No obligatorio | **16 px**, 12×11 | **No** (cenital) |
| 6 | **Kenney UI Pack** (inferido) | `assets-juego/PNG/` (740 PNG), `Vector/` (370 SVG), `Font/` | Botones, barras, paneles, cursores, miras en 5 colores + "Extra"; fuentes Kenney Future | CC0 en la web de Kenney; **sin archivo propio** | No obligatorio | PNG "Default" (8–192 px) y "Double" (×2); SVG | Independiente de la proyección |

Detalle del pack 6: Blue/Green/Grey/Red/Yellow = 60 piezas × 2 tamaños; Extra = 70 × 2. Familias: `bar_*` (40 por color),
`button_*` (16), `crosshair_*` (4), y en Extra además `cursor_a–h`, `panel_glass*`, `panel_rectangle*`, `panel_square*`.
**No hay iconos** en este pack.

### Medidas de las piezas isométricas (packs 2 y 3), medidas sobre los PNG
- Bloque de hierba/tierra/agua/muro: caja visible **232×219 px** (x 12–243, y 129–347); cara superior ≈ 232×116, grosor lateral ≈ 103 px.
- Para que la cara superior mida 64 px de ancho como nuestra losa: **escala ≈ 0,276** → sprite de 71×97 px, grosor ≈ 28 px.
- Ancla para colocar un bloque: centro del rombo de suelo ≈ (128, 289) del PNG.
- Árboles: `tree_single` 129×179, `tree_multiple` 202×179, `tree_pine` 130×234, `tree_pineLarge` 145×247 (a escala 0,276: 36×49 hasta 40×68 px).
- `rocks_grass` 125×109; `fence_wood` 142×118; `furrow_cropWheat` 179×161; `castle_wall`/`castle_corner` 232×234 (bloque entero).
- Cada pieza viene en 4 giros (`_N _E _S _W`), útil para los muros que se conectan.

### Animaciones
**Ninguno de los packs trae animaciones** (ni hojas de fotogramas ni fotogramas sueltos): todo son imágenes estáticas.
Los personajes de los packs 4 y 5 son un solo fotograma por personaje. Habrá que animar con balanceo/volteo por código.

## Problemas detectados

1. **Estilos que no combinan.** Sketch Town (dibujo a mano, contorno marrón grueso, colores planos y suaves) frente a
   Tiny Dungeon/Town/Factory (pixel art de 16 px, contorno oscuro) y al UI Pack (vectorial limpio). Mezclar terreno
   Sketch con enemigos en pixel art se nota. Recomendación: Sketch para el mundo, UI Pack para los menús, y los
   sprites de 16 px sólo como "figuras de pie" pequeñas (como ya hacemos con los NPCs).
2. **Sin enemigos isométricos.** Los únicos monstruos son los de Tiny Dungeon (cenitales, 16 px, un fotograma). Se
   usarían como sprites de pie ×2, con balanceo y volteo por dirección. Alternativa: mantener los prismas.
3. **Sin muros de metal ni de madera maciza.** Hay muro de castillo (piedra gris) y vallas de madera. El metal tendría
   que ser el muro de castillo teñido, o prismas con textura.
4. **Sin arena, flores ni arbustos** (sólo `rocks_grass`/`rocks_dirt` y hierba/tierra/agua). La arena puede tintarse
   desde la tierra; flores y arbustos, generados por código.
5. **Altura de los bloques ≠ altura de nuestros niveles.** Un bloque Sketch tiene ≈ 28 px de grosor a escala; el
   relieve del juego sube 16 px por nivel. Opciones: recortar sólo la cara superior (losa plana) y seguir dibujando
   el lateral por código, o usar bloques completos sólo en acantilados. Cambiar el paso de altura sería lógica de vista
   (`iso.ts`, con tests); lo evitaría.
6. **Archivos mezclados y licencias pisadas.** Los archivos informativos (`License.txt`, `Overview.html`,
   `Tilesheet.txt`, `Preview.png`, `Sample.png`) de los distintos packs tienen el mismo nombre y se pisaron entre sí:
   en la raíz manda "Sketch Town Expansion", en `assets-juego/` "Sketch Town 1.0". De Tiny Dungeon, Tiny Town y UI Pack
   **no queda ningún archivo de licencia**. Todos los packs de Kenney son CC0 según su web, pero conviene guardar su
   `License.txt` original (los de packs 4–6 no los tengo; los identifico por contenido).
7. **Tiny Factory original perdido en `assets-juego/`.** La hoja que integré (`public/assets/kenney/tiny-factory.png`)
   **ya no coincide** con ninguna de las dos `tilemap_packed.png` de las carpetas (se reemplazó). Su única copia es
   la de `public/` (y la de `dist/`, que es salida de build). No la borres.
8. **Duplicados y sobrantes.**
   - La raíz repite la estructura de `assets-juego/` (`Tilemap/`, `Tiles/`, `Map/`, `Preview.png`, `Sample.png`,
     `Overview.html`, `Tilesheet.txt`, `License.txt`, tres `.url`): 6 carpetas/archivos de más en la raíz.
   - 132 `tile_XXXX.png` de 16 px **duplican la hoja** `tilemap.png` (mismos gráficos troceados), en ambas ubicaciones.
   - 48 piezas Sketch Town tienen **contenido idéntico** a otra con distinto nombre (sin diferencia visual por giro).
   - `Map/*.tmx|tsx`, `Tiled/` y `Vector/` (370 SVG, ≈ 1 MB) son para otros motores/editores y no los usaría.
   - Peso en el repo: ≈ 3,5 MB (`assets-juego/Tiles`) + 2,3 MB (`Tiles`) + 1,3 MB (`PNG`) + 1 MB (`Vector`).
     Nada de esto debe copiarse tal cual a `public/` (entraría en el build): sólo el atlas que se use.
9. **Licencias y publicación.** Todo es CC0 (dominio público): se puede publicar y usar comercialmente sin permiso. El
   crédito a Kenney no es obligatorio pero lo daremos en `CREDITS.md`. Sin problemas legales detectados.
10. **Rendimiento.** 348 + 236 PNG de 256×352 sueltos serían unos 6 MB y cientos de peticiones. Hay que empaquetar sólo
    las piezas usadas (≈ 40) en un atlas ya reducido a escala 0,276. No hay `sharp`/`pngjs` instalados: o se añade una
    dependencia de desarrollo para generar el atlas, o se hornea al arrancar con canvas (como ya hacemos con Tiny Factory).

## Propuesta: qué usar para cada cosa

| Necesidad | Propuesta | Piezas | Falta / alternativa |
|---|---|---|---|
| **Enemigos** | Tiny Dungeon como sprites de pie ×2 + balanceo y volteo por dirección (sin animación en el pack). Asignación provisional, a confirmar con zoom en la Fase 1: normal = esqueleto/limo, rápido = araña (frame 122), blindado = caballero oscuro, volador = murciélago (120), tanque = el más grande (ogro/guerrero) | `assets-juego/Tilemap/tilemap_packed.png` fotogramas 84–124 | Sin isométricos ni animación. Respaldo: prismas actuales |
| **Murallas** | Piedra = `castle_wall`, `castle_corner`, `castle_end`, `castle_center`, `castle_bend` (giros N/E/S/W para conectar según vecinos). Madera = `fence_wood` (+ `Corner`, `Curve`, `End`). Metal = muro de castillo teñido de azul acero | Packs 2 y 3 | Sin estados de daño: se hacen con grietas/oscurecimiento por código |
| **Interfaz** | UI Pack: `panel_*`, `button_*`, `bar_*`, `cursor_*`, `crosshair_*`; fuente Kenney Future (Narrow para texto denso). Iconos: Tiny Factory (ya) + los de Tiny Dungeon (pociones, armas) | Pack 6 + 1 + 4 | Faltan iconos de comida, gasolina, casa, taller, laboratorio, categorías: generados por código en el mismo estilo |
| **Terreno** | Cara superior de `grass_center`, `dirt_center`, `water_center`, `rocks_*`, transiciones `grass_corner`/`dirt_corner`/`grass_slope*` y camino `grass_path*` | Packs 2 y 3 | Arena: tierra teñida. Mantener lateral y relieve del juego por código (problema 5) |
| **Árboles** | `tree_single`, `tree_multiple`, `tree_pine`, `tree_pineLarge` (isométricos, tamaño correcto) | Packs 2 y 3 | Ninguna |
| **Decoración** | Rocas `rocks_grass`/`rocks_dirt`; surcos `furrow*` (idóneos para la **granja**); vallas | Packs 2 y 3 | Flores y arbustos por código |

Regla de jugabilidad propuesta para la Fase 4 (sin tocar `game.ts`): los árboles de la decoración son **sólo visuales**,
colocados en casillas sin edificio, sin mena y fuera de un pasillo hacia el núcleo; el bosque que ya da madera (Ore.Wood)
sigue siendo el recurso, dibujado con estos árboles. Así no cambia la lógica ni se corta ningún camino.

## Decisiones tomadas (por si dudas)
- Tratar `assets-juego/` y la raíz como los packs nuevos, ya que `[CARPETA…]` no estaba rellenado.
- No mover ni borrar nada todavía; el saneado de duplicados (problema 8) lo propongo para antes de la Fase 4.
- Los PNG grandes se reducen al hornear el atlas (escala 0,276); no se cargan sueltos.
