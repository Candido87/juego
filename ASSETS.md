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

---

# Segunda tanda: tanques, naves y humo (Fase 0 del encargo de torretas/enemigos/efectos)

Misma situación que antes: el encargo hablaba de `public/assets/[CARPETA…]` sin rellenar; los archivos están en
**`assets-juego/`** (que ahora pesa **16 MB**). Nada de esto está en `public/`.

## Packs nuevos

| # | Pack (identificado por contenido) | Dónde | Qué contiene | Licencia | Tamaños | Vista | Direcciones / animación | ¿Encaja con 64×32? |
|---|---|---|---|---|---|---|---|---|
| 7 | **Kenney Tanks** | `PNG/Default size/` (88 PNG, ×1), `PNG/Retina/` (88 PNG, ×2), `Spritesheet/tanks_spritesheet{Default,Retina}.png/.xml` | 5 diseños de tanque × 4 colores (Green, Desert, Grey, **Navy con una X blanca**), cada uno **completo** (`tank*N`) y **sólo casco** (`tank*_bodyN`); 7 orugas; **4 cañones sueltos** (`tanks_turret1–4`); 12 balas; 12 fotogramas de explosión; minas, cajas, barriles | CC0 (Kenney; sin archivo propio) | Tanque 75–92 × 59–69 px (×1); casco 55–84 × 39–53; cañón 20–48 × 9–15; Retina = el doble | **Lateral (perfil)**, mirando a la derecha | Sólo derecha (se voltea). Sin animación (la explosión son 12 fotogramas sueltos) | **No** (perfil, no isométrico) |
| 8 | **Kenney Space Shooter Redux (+ Extension)** | `PNG/{Enemies,Parts,Lasers,Effects,Damage,Meteors,Power-ups,UI}/`, `Backgrounds/`, `Spritesheet/sheet.png|xml` (1024×1024), `Bonus/` (2 fuentes + 7 sonidos `.ogg`) | **20 naves enemigas** (5 diseños × Black/Blue/Green/Red, ≈ 82–104 × 84), **piezas** (8 cabinas × 4 colores, 8 alas × 4, 5 motores, **11 cañones `gun00–10`**, **`turretBase_big` 41×41 y `_small` 26×26**), 48 láseres (≈ 9×54), llamas `fire00–19` (16×40), escudos, estrellas, daños de nave, meteoritos, power-ups, botones, cursor, números | CC0 (Kenney; sin archivo propio) | Naves ≈ 90 px; cañones 14–21 × 33–52 | **Cenital** | Sin giros: se rotan por código. Llamas y escudos son variantes sueltas | **No** (cenital), pero **proyectable sobre el suelo** con transformación afín, como ya hacemos con las cintas |
| 9 | **Kenney Smoke Particle Pack** | `PNG/Black smoke/` (25), `PNG/White puff/` (25), `PNG/Explosion/` (9), `PNG/Flash/` (9), `PNG/Fart/` (9) | Bocanadas de humo negro y blanco (25 formas cada una), 9 fotogramas de explosión, 9 de destello, 9 de humo verde | **CC0** (`assets-juego/License.txt`, ahora es el de este pack) | **340–420 px** (explosión 583×536, destello 550×496) | Sin vista (formas blandas) | Humo = formas sueltas; explosión y destello = secuencia de 9 | Sí (independiente de la proyección) |

## Problemas detectados (tanda 2)

1. **Ni tanques ni naves son isométricos.** Los tanques están de **perfil** (sólo hacia la derecha) y las naves **cenitales**.
   Nada trae las 4 diagonales de nuestra proyección. Soluciones: tanques como figuras de pie volteadas según el movimiento
   en pantalla; naves proyectadas **planas sobre el plano del suelo** (afín, rotadas por código) a una altura de vuelo,
   con su sombra en el suelo.
2. **Un tanque de perfil como base de torreta quedaría raro** (casco lateral con orugas sobre una losa isométrica). Para las
   torretas del jugador el mejor material son las **piezas cenitales de Space Shooter** (`turretBase`, `gun`), que sí se
   proyectan y giran sobre una base prismática.
3. **No hay torreta de misiles en la lógica.** Las torretas del juego son balas, láser, fuego y hielo (decisión de SPEC). El
   encargo pide "misil": **no lo hago** (sería lógica nueva en `game.ts`/`config.ts`). Si lo quieres, dímelo.
4. **Estilos.** Tanques y Space Shooter son el mismo dibujo plano de Kenney (sombreado suave, **sin contorno**): combinan entre
   sí y con el UI Pack. Chocan con Sketch Town (contorno marrón grueso) y con el pixel art de 16 px. Ya había tres estilos;
   ahora son cinco. Es manejable si cada familia se limita a su función (mundo = Sketch, enemigos/torretas/efectos = Kenney
   plano, NPCs = pixel art).
5. **Escala.** Un tanque mide ≈ 80 px y la losa 64 de ancho: hay que reducirlo a ≈ ×0,45–0,55 (usando los Retina a ×0,25 para
   que queden nítidos). Las naves (≈ 90 px) a ≈ ×0,4.
6. **Peso.** Humos, explosiones y destellos son ≈ **6 MB** de PNG de ≈ 380 px: **inutilizables tal cual** como partículas. Se
   hornean a ≈ 48–64 px (unas 10 formas de cada humo) en una sola textura.
7. **Duplicados y sobrantes.** `Default size` y `Retina` son **el mismo arte a dos tamaños** (88 + 88); las hojas
   `tanks_spritesheet*` y `sheet.png` repiten los PNG sueltos. **Sin usar**: meteoritos, power-ups, vidas, numerales, fondos,
   `Fart`, `Damage`, `Bonus/*.ttf` (otra fuente Kenney); los `.ogg` podrían servir más adelante para el volumen de Opciones.
   `assets-juego/License.txt` se pisó otra vez (ahora es el del pack de humo).
8. **Licencias.** Los tres packs son CC0 (Kenney): se pueden publicar y usar comercialmente; el crédito es voluntario. Sin
   problemas legales. Tanks y Space Shooter no traen archivo de licencia propio (los identifico por contenido).

## Propuesta de reparto

| Uso | Qué usar | Cómo | ¿Encaja? |
|---|---|---|---|
| **Torreta de balas** | Base prismática metálica + `turretBase_big` + cañón `gun03` (doble con nivel ≥ 2) | Cabeza **cenital proyectada sobre la cara superior**, 16 rumbos pre-horneados que giran hacia el objetivo; retroceso y destello (`Flash`) al disparar | **Sí** |
| **Láser** | Base oscura + `turretBase_small` + `gun10` (largo y fino) teñido de cian | Misma técnica; rayo con `laserBlue*` y brillo pulsante | **Sí** |
| **Lanzallamas** | Base ancha cobre + `turretBase_big` + `gun05` corto y grueso | Llamas `fire00–19` al disparar | **Sí** |
| **Hielo** | Base azul + `turretBase_small` + `gun01` + cristales (prisma) | Destello cian | Parcial (sin material propio, se tiñe) |
| **Misil** | — | **No existe en la lógica** | **No** |
| **Nivel visible** | Más cañones, más tamaño y color de la base | Variantes horneadas por nivel (1–3) | Sí |
| **Estados** | Sin munición/energía: cabeza apagada + alarma (ya hay); dañada: humo negro y grietas; en obra: translúcida (ya hay) | | Sí |
| **Enemigos terrestres blindados** | **Tanques Navy** (con la **X blanca**, marca de enemigo) para *blindado* y *tanque* (diseño grande) | Figura de pie volteada por la dirección en pantalla; cañón suelto (`turret*`) apuntando a la torreta más cercana | Parcial (perfil) |
| **Enemigos voladores** | **Naves enemigas Red/Black** | Plano proyectado en el suelo a altura de vuelo, rotado por el rumbo, **sombra en el suelo** | **Sí** |
| **Resto de enemigos** | Seguimos con Tiny Dungeon (normal = limo, rápido = araña) | | Sí |
| **Distinguirlos de las torretas del jugador** | Torretas en tonos **verde/azul/cobre**; enemigos **Navy con X / rojo / negro** | | Sí |
| **Humo de producción** | `White puff` reducido sobre fábricas, refinerías y generadores en marcha | Pocas partículas, más con más actividad; ninguna si están parados o sin energía | Sí |
| **Humo de daño** | `Black smoke` sobre edificios y torretas por debajo del 50 % de vida | | Sí |
| **Chispas** | Generadas por código (generadores) | | Sí |
| **Explosión / destello** | `Explosion` y `Flash` reducidos; `tank_explosion*` como alternativa | Al destruir enemigos y edificios, y fogonazo | Sí |
| **Proyectiles** | `tank_bullet*` (balas), `laser*` (láser) | | Sí |
| **No se usará** | Meteoritos, power-ups, vidas, numerales, fondos, `Fart`, minas, barriles (quizá cajas como decoración) | | — |

## Decisiones
- Las torretas **sólo cambian de aspecto**: lógica y números de `config.ts` intactos.
- Rendimiento: un `ParticleEmitter` por tipo reutilizando texturas horneadas, tope de emisores visibles (≈ 24) y desactivados
  fuera de cámara.
- Las fases de esta tanda quedan **a la espera de tu visto bueno** (pediste ver el reparto antes de seguir).


---

# Sketch Town integrado en `public/assets` (decisión de la Fase 0)

| Pack | Autor | Enlace | Licencia | Dónde (servido por Vite) | Sprites | Losa | ¿Isométrico 2:1? |
|---|---|---|---|---|---|---|---|
| **Kenney Sketch Town 1.0** | Kenney | https://kenney.nl/assets/sketch-town | CC0 (`LICENSE-NOTICE.txt`: el original se perdió al mezclar carpetas) | `public/assets/sketch-town/Tiles/*_{N,E,S,W}.png` (87 piezas × 4 giros = 348) | PNG 256×352 | cara superior 232×116, grosor ≈103 | **Sí** |
| **Kenney Sketch Town Expansion 1.1** | Kenney | https://kenney.nl/assets/sketch-town | CC0 (`License.txt` incluido) | `public/assets/sketch-town-expansion/Tiles/*_{N,E,S,W}.png` (59 × 4 = 236) | PNG 256×352 | igual | **Sí** |

**Encajan con la proyección 64×32:** Sketch Town y su expansión (rombo exacto 2:1; reescala ×0,276). **No encajan:** Tiny Factory, Tiny Dungeon y Tiny Town (16 px cenitales; sólo como figuras de pie), Kenney Tanks (perfil), Space Shooter (cenital) y el humo (sin vista) — ver las secciones anteriores.

Medidas reescaladas (×0,276): bloque de terreno ≈ 64×60 px (grosor 28), muro/torre 64×65, árbol 36×49, pino 36×65, roca 35×30, casa 64×60, tejado 64×42.


---

# Packs 3D (rama `vista-3d`)

Origen: ZIPs originales de Kenney (CC0) de la carpeta Descargas del usuario. **No se usa `assets-juego/Models/`**: ahí hay una mezcla
(licencia de Factory Kit pero 465 modelos de otros packs) y está sin subir a git. Copias seleccionadas en `public/assets/3d/<pack>/`
(cada una con su `License.txt` y su `Textures/colormap.png`). Todos vienen ya en **.glb** (también FBX y OBJ): no hace falta convertir nada.

| Pack | Versión | Modelos (en zip) | Copiados | Tamaño GLB (zip → copiado) | Carpeta |
|---|---|---|---|---|---|
| City Kit Industrial | 2.0 | 37 | 21 | 3,0 MB → ~1,4 MB | `public/assets/3d/industrial/` |
| Factory Kit | 3.0 | 143 | 51 | 2,9 MB → ~1,1 MB | `public/assets/3d/factory/` |
| Mini Characters | 2.0 | 43 | 13 | 5,3 MB → ~2,3 MB | `public/assets/3d/characters/` |
| Blaster Kit | 2.1 | 40 | 26 | 1,2 MB → ~1,0 MB | `public/assets/3d/weapons/` |
| Mini Forest (naturaleza + campamento) | 1.0 | 22 | 22 (todos) | 0,8 MB | `public/assets/3d/forest/` |
| **Total copiado** | | | **133 .glb** | **~6,7 MB** | |

- **Texturas:** todos usan **una paleta compartida** `Textures/colormap.png`, referenciada por ruta relativa (no embebida). Cada carpeta lleva su copia: hay que mantener `Textures/` junto a los `.glb`.
- **Animaciones:** sólo los personajes (Mini Characters y `character-archer` de Mini Forest) traen 32 clips con el mismo esqueleto: `static, idle, walk, sprint, jump, fall, crouch, sit, drive, die, pick-up, emote-yes, emote-no, holding-right, holding-left, holding-both, holding-right-shoot, holding-left-shoot, holding-both-shoot, attack-melee-right, attack-melee-left, attack-kick-right, attack-kick-left, interact-right, interact-left, wheelchair-*`. El resto (edificios, cintas, tuberías, armas, árboles) son mallas estáticas.
- **Escala:** 1 unidad = 1 casilla en los kits de bloque (conveyor 1×0,4×1; pipe-large 1×1×1; machine 1,2×1,3×1,5; platform 1×0,47×1; rocks-ramp 1×0,5×1; tree 0,9×1,7; tree-high 0,9×2,3; edificios industriales 0,9–2,1 de lado y 1,4–2,3 de alto; blaster 0,16×0,3×0,6).

## Packs 3D no copiados (no encajan o sobran)
- **Coaster Kit** (183 modelos, 20 MB): montaña rusa/parque; fuera. Como mucho `tree-large`, `grass`, `flowers`, `bench` de relleno.
- Del Factory Kit se dejan ~92 piezas (cintas largas con vallas, pantallas, puertas, estructuras, indicadores...); del Mini Characters, 30 (sillas de ruedas, ayudas médicas, equipaje); del Blaster Kit, 14; del City Kit, 16. Se copian cuando se usen.
- **Packs 2D (fuera de la vista 3D):** Sketch Town + Expansion, UI Pack (se mantiene para la interfaz HTML), Tanks, Space Shooter, Smoke Particles, Tiny Dungeon/Town/Factory.
- **No hay pack de "campamento" ni de "naturaleza" separados** en la carpeta: Mini Forest cubre ambos (`tent`, `flag`, `fence`, `ladder`, `bridge`, `building-*`, `platform`, `rocks-ramp`, `patch-grass/dirt`, `rocks-*`, `tree`, `tree-high`, `plant`).

## Propuesta de mapa de uso (3D)

**Terreno** (Mini Forest): losa de nivel = `platform` (1×0,47×1, se apila para niveles), rampa = `rocks-ramp`, suelo plano = `patch-grass` / `patch-dirt`, rocas = `rocks-high`/`rocks-low`/`stones`, árboles = `tree` y `tree-high`, matas = `plant`. Agua: plano con color propio (no hay modelo). Se tiñe con `material.color` según la zona.

| Edificio / objeto | Modelo | Nota |
|---|---|---|
| Taladro | `factory/machine-connection-hole` + `factory/piston-round` encima | el pistón sube/baja al trabajar |
| Fábrica (taller/componentes) | `factory/machine` + `robot-arm-a` encima | |
| Refinería | `industrial/detail-tank-large` + `factory/pipe-large` + `industrial/chimney-medium` | grupo de 2-3 piezas |
| Generador | `industrial/building-d` o `windmill`; `factory/cog-a` girando | engranaje animado |
| Casa | `industrial/building-a` (o `forest/building-structure` + `building-roof`) | |
| Almacén | `industrial/shipping-container-a/b/c` o `factory/box-large` | |
| Laboratorio | `factory/machine-window` | |
| Poste de energía | `industrial/chimney-small` o `factory/lever-single` | se decide con prueba visual en fase 1 |
| Cinta | `factory/conveyor`, `conveyor-corner`, `conveyor-junction-t`, `conveyor-cross`; `stripe` para animar | rotación en pasos de 90° |
| Tubería | `factory/pipe-large`, `-curve`, `-junction`, `-cross`, `-bend`, `-valve` | |
| Puertos entrada/salida | `factory/arrow` (color verde/rojo) sobre la casilla | |
| Muros | `factory/structure-wall`, `-corner-outer/inner`; torre `structure-tall`; mejorado `structure-yellow-*` | conexión por vecinos como en 2D |
| Decoración | `forest/tent`, `fence`, `flag`, `rocks-*`, `industrial/solar-panel-*`, `water-tower` | |

**Personas** (Mini Characters, un rig con 32 animaciones y una sola textura):
- NPC obrero: `character-worker`, clips `idle` / `walk` / `pick-up` / `interact-right`.
- Enemigos (variedad por modelo, mismo código): `character-zombie` (básico), `character-raider` (rápido), `character-robot` (blindado), `character-alien` (especial), `character-knight` (jefe). Clips `walk`/`sprint`, `die`, `attack-melee-right`.

**Torretas:** base = `factory/hopper-round` (cuerpo fijo) + `factory/cog-b` (anillo). El cañón es un `Object3D` pivote (`yaw`) hijo de la base, con el arma `weapons/blaster-*` como hijo del pivote orientado a +Z local. Reparto: ametralladora = `blaster-a`, escopeta = `blaster-h`, francotirador = `blaster-m` + `scope-large-a`, mortero = `detail-tank` + `blaster-e`; mejoras visibles con `scope-*`/`silencer-*`. Balas = `bullet-foam` escaladas. Cada torreta calcula `atan2(dx,dz)` hacia el objetivo y rota el pivote con suavizado; el retroceso es un desplazamiento corto del arma en su eje local.

**Riesgos de arte:** estilo "juguete" plano; las armas miden ~0,6 frente a una casilla de 1: se escalan ×0,6 sobre la base.

## Fase 0 de cintas y aéreos: texturas de dirección y naves (15-11-2026)

**Dónde están de verdad.** La carpeta `assets-juego/` mezcla varios packs de Kenney que se han ido pisando (Sketch Town, Space Shooter Redux, Tanks, Nature Kit, Pattern Pack Lines...; `License.txt` y `Preview.png` son los del último). Los dos que hacen falta están completos y sin mezcla en los ZIP originales de Descargas, de donde se copia (no se mueve nada ni se toca `assets-juego/`):

| Pack | ZIP | Qué se usa | Copiado a |
|---|---|---|---|
| Pattern Pack Lines 1.0 | `kenney_pattern-pack-lines.zip` | `PNG/Thick/Default (256px)/pattern_0029.png`, `0012`, `0028` (3 de 30) | `public/assets/belts/` + `License.txt` |
| Space Kit | `kenney_space-kit.zip` | `Models/GLTF format/craft_*.glb` (8 de 153 modelos) | `public/assets/3d/space/` + `License.txt` |

Las **naves 2D de Space Shooter Redux** (`assets-juego/PNG/Enemies`, `playerShip*`) no se usan: el juego es 3D y los modelos del Space Kit encajan con el resto.

### Texturas de las cintas (Pattern Pack Lines)
- **Formato:** PNG RGBA, 256×256 (las `Double` son 512×512), **línea blanca sobre fondo transparente**, grosor `Thick` (hay también `Thin`). Treinta patrones numerados 0000-0029; ver `docs/patrones-lineas.png`.
- **Son tileables** (se repiten sin costura en horizontal y vertical): sirven para `RepeatWrapping` y desplazamiento de UV.
- **Qué indican:** casi todos son enlosados (rombos, hexágonos, círculos...) y **no** indican sentido. Los que sí tienen dirección son los chevrones: **`0029`** (tres columnas de chevrones `<`, el mejor indicador de sentido), `0012` (chevrones apilados que apuntan hacia arriba) y `0028` (zigzag). Se elige **`0029`** para las cintas y `0012` para la cinta rápida.
- **Cómo se usan** (hito CIN1): como mapa de transparencia sobre la cara superior del modelo de cinta; se tiñe con el color de la cinta (blanco = línea) y se desplaza su `offset` a lo largo del sentido de la marcha, a la velocidad real de la cinta; sin energía no se desplaza y se oscurece. Un solo uniforme de tiempo compartido por todas las cintas.
- **Pesa:** 0,8-0,9 KB cada una.

### Naves (Space Kit)
- **Formato:** glTF binario (`.glb`) autocontenido, **19-27 KB** cada uno, sin animaciones, con la paleta plana de Kenney (gris y naranja) y sin texturas externas. Orientación hacia +z como los demás modelos.
- **Variantes:** `craft_speederA/B/C/D` (cuatro cazas con alas y toberas), `craft_racer` (compacta), `craft_cargoA/B` (cargueros anchos), `craft_miner` (con dos brazos largos). Se ven en `docs/naves.png` (`tools/galeria3d.html?set=naves`).
- **Propuesta de reparto para los enemigos aéreos** (se decide al hacer el hito AIR5):
  - **Ligero y rápido:** `craft_speederC` (el más pequeño y afilado); variantes `speederA` y `speederD`.
  - **Bombardeo (daño en área):** `craft_cargoA` (panza ancha, parece cargada) con tinte rojizo.
  - **Pesado y blindado:** `craft_cargoB` (ancho y plano, mucho casco) con más escala y tinte oscuro.
  - Sobran `speederB`, `racer` y `miner` para tipos nuevos o jefes.
- **Escala:** a ajustar a la huella de cada tipo (ligero ≈ 0,8 casillas, bombardero ≈ 1,3, pesado ≈ 1,8) y elevarlas sobre el suelo.

## A0 — Inventario del pack de interfaz (15-11-2026)

**Qué pack se ha elegido y por qué.** El encargo traía la ruta como marcador (`[CARPETA-UI]`). En `assets-juego/` hay **tres** juegos de interfaz mezclados:
1. **UI Pack Sci-Fi** (Kenney): `PNG/{Blue,Green,Grey,Red,Yellow,Extra}/{Default,Double}` y su copia en `Vector/` (SVG). **Es el de fecha más reciente** (todos sus archivos son del 15-11-2026 00:28) y **es el elegido**.
2. **UI Pack RPG extension** (Kenney, 2014): los 87 PNG sueltos de la raíz de `PNG/` (`panel_beige`, `buttonLong_*`, `iconCheck_*`, `iconCross_*`, `arrow*`, `bar*_horizontal*`, cursores de guantelete, mano y espada) más `Spritesheet/uipack_rpg_sheet.*` y `Vector/uipack_rpg_vector.*`. Es el dueño del `License.txt` de la raíz (los demás packs lo han ido pisando). Estética beige y marrón de fantasía: no encaja con un juego de fábricas; se descarta, salvo sus iconos de check, cruz y flecha como referencia.
3. Interfaz de **Space Shooter Redux** (`PNG/UI`: `buttonBlue`, `numeral*`, `playerLife*`): descartada.
Las fuentes están en `Font/` (`Kenney Future.ttf`, `Kenney Future Narrow.ttf`) y `Bonus/` (`kenvector_future*.ttf`). No hay ZIP original del Sci-Fi en Descargas, así que lo que se copie a `public/assets/` saldrá de `assets-juego/` (sin tocarlo). Hoja de contacto: `docs/ui-pack-inventario.png`.

**Qué contiene el UI Pack Sci-Fi** (cada archivo existe en `Default` y en `Double` a 2×; todos con transparencia):
| Grupo | Piezas | Tamaño (Default) |
|---|---|---|
| **Paneles** (`Extra`) | `panel_glass` (cuadrado con borde claro), `_notches` (esquinas cortadas), `_notches_top`, `_notch_tl/tr/bl/br` (una esquina cortada), `_screws` (con tornillos), `_tab` y `_tab_blade` (con pestaña), `panel_rectangle(_screws)` (gris), `panel_square(_screws)` | 64×64 (`panel_rectangle` 192×64) |
| **Botones base** (`Extra`) | `button_rectangle`, `button_square` y sus variantes `_depth` (con relieve/sombra inferior) | 192×64 y 64×64 |
| **Botones con cabecera** (uno por color: `Blue`, `Green`, `Grey`, `Red`, `Yellow`) | `button_square_header_{blade,large,notch,small}_{rectangle,square}` con y sin `_screws` (16 por color): cuerpo claro con franja superior de color | 192×64 y 64×64 |
| **Barras** (por color y `Extra`) | `bar_{round,square}_{large,small}` enteras y en tres tramos `_l` / `_m` / `_r` (más `_square`), versión `gloss` con brillo, y fondos `bar_shadow_*` (con y sin contorno) para la parte vacía | 96×24 (large) y 96×16 (small); tramos de 12 o 24 de ancho |
| **Cursores y miras** | `cursor_a`…`cursor_h` (8 flechas y cursores), `crosshair_a`…`d`, `crosshair_color_a`…`d` (en cada color) | 21×21 y 30×30 |
| **Tipografías** | `Kenney Future` y `Kenney Future Narrow` (TTF, 34 KB) | — |
En total, por color: 60 imágenes por tamaño (barras 40, botones 16, miras 4); `Extra`: 70.

**Estados.** El pack **no trae un dibujo distinto por estado** (hover, pulsado, desactivado): sólo hay botón normal y `_depth` (con relieve) y la variante de color. Se resolverán en CSS: normal = cuerpo + franja de color, hover = más brillo, pulsado = versión `_depth` y desplazamiento de 2 px, desactivado = gris (`Grey`) y menor opacidad, seleccionado = franja `Yellow` o `Blue`. **Variantes de color:** sí, cinco (azul, verde, gris, rojo, amarillo) para botones, barras y miras; los paneles sólo en claro y en gris.

**Qué falta** (se construye en CSS o por código con la misma paleta):
- **Iconos**: no hay ninguno (ni aviso, error, check, flecha, rayo, gota, engranaje...). Se dibujan por código (SVG en línea, trazo blanco o gris oscuro sobre un círculo o recuadro de color).
- **Casilla, deslizador, pestaña, separador, lista, tooltip y ranura de icono**: no existen como imagen. Se hacen en CSS: la pestaña con `panel_glass_tab`, el tooltip con `panel_glass_notches`, la ranura con `button_square_depth` invertida, la casilla y el deslizador con las barras y un recuadro `button_square`.
- **Fondo oscuro**: todo el pack es claro (panel gris claro sobre mapa oscuro). Para paneles oscuros hay que teñir con CSS o usar los grises `panel_rectangle` y `Grey`.
- **Hoja de sprites y atlas**: no hay; cada pieza es un PNG suelto, así que en la práctica se usan `border-image` (9-slice) para paneles y botones y se cargan sólo los que se usen.

**Ya aplicado en el juego (fase G3, 2026):** `public/assets/ui-pack/` contiene un subconjunto de este mismo pack (barras, cinco botones, dos cursores, tres paneles y la fuente Kenney Future Narrow). La nueva estética (A1/A2) lo amplía y lo ordena en un sistema de componentes.

**A1:** subconjunto usado copiado a `public/assets/ui-pack/ds/` (38 PNG: paneles de cristal y gris, botones base y con cabecera de color, barras largas por color y fondo de barra; con su `License.txt`). Iconos y puertos hechos en SVG propio (sin assets). Galería en `galeria-ui.html`.
