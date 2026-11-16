# PROGRESS

## Hecho
- [x] Hito 0 — Vista isométrica, lógica pura, cintas, taladros, torre básica, oleadas, tests.

## Hoja de ruta unificada
Tres encargos fusionados en un solo orden según sus dependencias. Entre paréntesis, el hito original:
A = árbol/torretas/murallas/industria/NPCs, E = electricidad y automatización, T = aspecto de torretas.

- [x] 1. (A1) Sistema de NPCs y cola de trabajos (construcción por NPC con una sola torreta de balas).
- [x] 2. (A2) Piezas y recetas nuevas; las construcciones consumen piezas concretas.
- [x] 3. (A3) Transportistas: reparto de munición y piezas por NPC (modo manual).
- [x] 4. (E1) Redes eléctricas: generador de combustión, postes y cables, consumo/producción, apagón parcial.

### Rediseño de la economía base (prioritario, va antes del resto)
- [x] P1. Población de 3 NPCs, comida y granjas (consumo y escasez; derrota con población 0).
- [x] P2. Componentes obligatorios para construir cualquier edificio y fábricas de nivel 1.
- [x] P3. Petróleo, bombas y refinería; generadores con gasolina.
- [x] P4. Cintas que consumen electricidad y modo manual completo por NPCs (absorbe el antiguo 5/E2).
- [x] P5. Taller con 2 trabajadores dedicados y cola de reparaciones (+ enemigos dañan edificios).
- [x] P6. Vivienda y crecimiento de población.
- [x] P7. Interfaz (población, comida, gasolina, taller) y equilibrado con simulaciones.

### Menús y árbol con población (después del rediseño; sustituye al antiguo 14 y parte del 16)
- [ ] M1. Menú principal, pausa y opciones, con guardar y cargar partida.
- [ ] M2. Menú de construcción por categorías, con bloqueo visual por tecnología.
- [ ] M3. HUD y alertas.
- [ ] M4. Laboratorio e investigador: investigación que avanza con un NPC asignado.
- [ ] M5. Pantalla del árbol de tecnología con nodos, estados y tooltips.
- [ ] M6. Desbloqueos reales (edificios, recetas, mejoras) y rama de Población y comida.
- [ ] M7. Equilibrado con simulaciones y pulido de la interfaz.

### Fases de gráficos (packs nuevos de Kenney; sólo capa visual, sin tocar la lógica)
- [x] G0. Inventario de assets → ASSETS.md (problemas y propuesta).
- [x] G1. Enemigos con sprites (balanceo y volteo por dirección; prisma de respaldo).
- [x] G2. Murallas con sprites conectados (piedra/metal = castillo teñido, madera = valla) y 3 estados de daño (muros.ts, wallLook en shapes.ts; prisma de respaldo).
- [x] G3. Interfaz con el UI Pack: marcos de panel, botones (gris/amarillo al pasar/azul activo/rojo), barras, cursor y fuente de títulos vía `public/assets/ui-pack/ui-pack.css` (sin tocar la lógica; iconos faltantes siguen generados por código en sprites.ts).
- [x] G4. Terreno teñido por zonas (tierra seca, hierba, roca; transición continua), árboles, rocas, arbustos y flores procedurales con semilla (decor.ts, decorView.ts); sólo decoración (no bloquea ni se tala), nunca sobre menas, núcleo ni pasillo aparición→núcleo; se oculta bajo edificios y los árboles se vuelven semitransparentes sobre cursor, fantasma y enemigos.

### Segunda tanda de gráficos (tanques, naves, humo) — esperando visto bueno del reparto (ver ASSETS.md)
- [x] T0. Inventario y propuesta (ASSETS.md, CREDITS.md).
- [x] T1. Torretas con aspecto de arma (rediseño por polígonos, base fija + cabeza giratoria de 16 rumbos, galería /galeria-torretas.html).
  - [x] T1.0 Inventario: los packs de tanques/naves no encajan (perfil/cenital) → modelos propios por código.
  - [x] T1.1 Torreta de balas de referencia (3 niveles en galería; nivel 1 en el juego; retroceso al disparar).
  - [x] T1.2 Láser y fuego · [x] T1.3 Hielo (misil no existe en la lógica) · [x] T1.4 Niveles (según turretLevel), estados (apagada, dañada con humo, en obra) y animaciones (retroceso, fogonazo, brillo propio) · [x] T1.5 Pulido: a zoom 1 se distinguen por silueta y color (gris, magenta, rojo, azul hielo).
- [ ] T2. Enemigos: tanques de perfil (blindados) y naves proyectadas con sombra (voladores).
- [ ] T3. Humo y efectos con partículas ligeras.
- Pendiente de lógica (no tocada): **no existe torreta de misiles**; añadirla exige cambiar `game.ts` y `config.ts`.
- Las fases G2 (murallas), G3 (interfaz) y G4 (terreno) de la primera tanda siguen pendientes.

### Tutorial en el juego (depende de menús M1 y del laboratorio M4 para sus últimos pasos)
- [ ] TU1. Motor del tutorial (tutorial.ts, textos aparte, progreso guardado) con tests.
- [ ] TU2. Panel de instrucciones, resalte de elementos y mapa del tutorial.
- [ ] TU3. Pasos 1-9 (cámara, construcción, modo manual, componentes, petróleo y electricidad, población y comida).
- [ ] TU4. Pasos 10-15 (torretas, murallas, oleada de prueba, taller, laboratorio y árbol, final).
- [ ] TU5. Menú de Ayuda, saltar/reiniciar, pulido.

### Aplicación de escritorio (Electron)
- [x] EL1. Electron + electron-builder: `npm run electron:dev`, `npm run dist` (instalador en `release/`).

### Interfaz clara (descripciones, tooltips, menú por categorías)
- [x] UI1. descripciones.ts con datos leídos de config y tests.
- [x] UI2. Tooltips (menú, almacén, HUD) que no tapan el botón señalado.
- [x] UI3. Menú de construcción por categorías, atajos y casilla en sitio fijo.
- [x] UI4. Paneles plegables, ayuda con H, almacén agrupado, sin solapes.

### Resto de la hoja de ruta (después del rediseño)
- [ ] 5. (E2) ~~Cintas motorizadas~~ (hecho en P4); queda sólo la regla "automatizado no pide abastecimiento".
- [ ] 6. (E3) Alimentadores automáticos y torretas con abastecimiento automático.
- [ ] 7. (E4) Baterías, solar y prioridades de consumo.
- [ ] 8. (A4 + E5) Torretas láser (energía) y de fuego (combustible); enemigos que atacan la infraestructura.
- [ ] 9. (T1) Registro de aspectos por torreta y modelos distintos para balas, láser y fuego.
- [ ] 10. (T2) Piezas animadas (cabeza que gira, retroceso, cristal, llamas) y efectos de disparo distintos.
- [ ] 11. (T3) Variantes por nivel y estados (sin munición/energía, en construcción, dañada).
- [ ] 12. (T4) Resto de tipos (hielo) con su modelo y efectos.
- [ ] 13. (A5) Murallas y comportamiento de los enemigos ante ellas.
- [ ] ~~14. (A6 + E6)~~ (sustituido por M4–M6) Árbol de tecnología con pantalla propia, incluida la rama "Energía y automatización".
- [ ] 15. (A7) Variedad de enemigos y oleadas que exijan mezclar torretas.
- [ ] 16. (E7 + T5) Interfaz: paneles de red, indicadores, cables; iconos de torretas en el menú y ficha al pasar el ratón.
- [ ] 17. (A8 + E8) Equilibrado con `npm run sim` y pulido (incluida legibilidad con zoom).

Por qué este orden: el modo manual (transportistas) debe existir antes de que la electricidad lo
automatice; el láser depende de la red; el aspecto de las torretas (T) va cuando ya existen láser, fuego
y la energía (para el estado "sin energía"); el árbol necesita que existan sus desbloqueos.

Regla: tras cada hito, tests + tipos + build en verde, commit y push a `main`.

## Primera oleada a 5:00 y guía de inicio
- [x] GI1. Primera oleada a los 5:00 (config.waves.firstDelay=300), cuenta atrás m:ss en el HUD, oleada 1 suave (firstCount=2), confirmación al adelantar sin torretas.
- [x] GI2. Motor de la guía (guia-inicio.ts, textos en guia-inicio-textos.ts, bot guia-bot.ts) con tests y guardado.
- [x] GI3. Pop-ups (panel fijo bajo el HUD, translúcido), resalte de botón/categoría y flecha sobre la casilla recomendada.
- [x] GI4. Secuencia de 11 pasos en la UI: cerrar aviso, saltar guía y reiniciarla desde la ayuda (H).
- [x] GI5. Comprobado con `npm run sim` (semilla 7): a los 300 s llega la oleada 1 con 2 torretas y 80 de munición, núcleo intacto; sin cambios de números.

## Recetas de fábrica y azufre
- [x] R1. Tabla de recetas en config.ts y SPEC.md (categorías), azufre en el mapa (mena, material, parcela cerca del núcleo), alcanzabilidad por test.
- [x] R2. Motor: estado de fábrica (`factoryStatus`), búferes, cambio de receta que devuelve materiales, tests de manual y automático.
- [x] R3. Panel de recetas (categorías, motivo si no disponible, se abre al colocar o seleccionar una fábrica), estado e icono del producto sobre la fábrica.
- [x] R4. Transporte (NPC y cintas con red) y construcción por componentes comprobados con tests (fabricas.test.ts, recetas.test.ts).
- [x] R5. Tooltip de receta automático (qué produce, dónde se necesita), "se produce/usa en" de materiales al día, bot con azufre y piedra, sim: sobrevive 8 min.

## Sketch Town (terreno, murallas, decoración)
- [x] ST0. Pack copiado a public/assets, medidas, decisión (reescalar ×0,276), ASSETS/CREDITS/SPEC y terreno de prueba (/terreno-prueba.html).
- [ ] ST1. Terreno con rampas y zonas (hierba, tierra, roca, arena, agua), yacimientos marcados.
- [ ] ST2. Murallas con conexiones y daño, decoración con regla de bloqueo, casas.
- [ ] ST3. Coherencia de estilo (sólo lista de propuestas).

## Transporte, tuberías y guía (encargo "tutorial incompleto")
- [x] H1. Reglas de transporte (cintas obligatorias, líquidos fuera de cintas, entradas/salidas `puertos.ts`) con tests.
- [x] H2. Tuberías y petróleo → gasolina → generador funcionando (sim y tests).
- [x] H3. Guía de cintas y de energía con detección real y diagnóstico.
- [x] H4. Guía de petróleo y tuberías.
- [ ] H5. Cadena completa a defensa, orden/tiempos con `npm run sim` (el bot usa cintas, energía y tuberías).
- Gráficos (murallas/interfaz/terreno) van en su propia sesión.
- H5 parcial: `npm run sim` usa el bot de la guía (cintas, postes, bomba y tuberías) junto al bot sencillo, pero ahora **pierde en las oleadas 7-8** (antes sobrevivía 10 min). Pendiente: equilibrar la economía tras la guía (bastidores/engranajes). No verificado en pantalla: flechas de puertos, ruta de ejemplo y alcance de postes.


## Vista 3D (rama `vista-3d`, prototipo, no se mezcla con `main`)
- [x] 3D-0. Inventario de packs 3D, copia a `public/assets/3d/`, `ASSETS.md`/`CREDITS.md` y propuesta de mapa de uso. **Parado a la espera del visto bueno.**
- [x] 3D-1. Three.js (`vista3d.html`, `src/view3d/`): cámara isométrica con giro de 90°, zoom y arrastre; terreno con bloques/rampas/rocas/árboles (Nature Kit); edificios, cintas y tuberías con conexión por vecinos; NPC y enemigos animados; torretas con cañón que apunta. Lee el mismo `Game`.
- [x] 3D-2. Rendimiento: terreno por chunks, edificios estáticos y objetos de cinta instanciados, descarte y presupuesto de personajes animados; mediciones en SPEC.md (1500 edificios + 300 enemigos: 47 → 73 FPS; 1500 enemigos: 15 → 43 FPS).
- [x] 3D-3. Comparación honesta con la vista 2D en `SPEC.md` (aspecto, rendimiento, trabajo que queda, qué se reaprovecha y riesgos).

## Migración a 3D (rama `vista-3d`; terminada: la 2D se retiró al llegar a paridad, ver `PARIDAD.md`)
- [x] M3D-0. `PARIDAD.md` con todo lo que hace la 2D y su estado en 3D; vista 2D congelada. **Parado para enseñar PARIDAD.md.**
- [x] M3D-1. Interfaz HTML/CSS compartida y sin Phaser conectada a la 3D: HUD, menú por categorías con tooltips, almacén, NPCs, trabajos, ficha, recetas, ayuda, opciones, pausa, fin de partida, quitar, pintar cintas, zoom al cursor. Sin solapamientos.
- [x] M3D-2. Aspecto y legibilidad: paleta corregida (hierba verde, zonas por recurso), contorno de objetos, transparencia de lo que tapa el cursor o la selección, marca de personajes tapados, clic en el cuerpo del edificio.
- [x] M3D-3. Construcción y logística: murallas con esquinas, T, cruces, daño y puerta (edificio nuevo `wall_gate`); cintas con T y cruce; tuberías con codos; cables y alcance de postes; alcance de torretas; flechas de puertos; iconos de estado.
- [x] M3D-4. Unidades y efectos: NPCs por rol que andan, esperan, trabajan y enseñan su carga; enemigos que atacan, se ralentizan, arden y caen al morir; torretas con niveles, estados y accesorio propio; un proyectil por tipo; humo de chimeneas y de daño, explosiones y barras de vida.
- [x] M3D-5. Guía y tutorial en 3D con ayudas sobre el mapa, guardado/carga y autoguardado, Electron abre la vista 3D.
- [x] M3D-6. Rendimiento y compatibilidad: calidad auto/baja/media/alta en las opciones (`quality.ts`, se aplica en caliente; la automática baja sola con FPS bajos), aviso si no hay WebGL2 o se pierde el contexto gráfico, mediciones por nivel en SPEC.md (`__benchQuality`). Sin probar en gráfica integrada ni en Electron.
- [x] M3D-7. Cierre. (a) Paridad completa: las 15 líneas que quedaban en parcial o pendiente pasan a hecho (zonas y decoración con las reglas de `decor.ts`, apariciones y ruta de enemigos, desgaste, falta de red, cintas paradas, barra de obra, temblor de cámara, formas de objetos en cintas, miniaturas de modelos en el menú, galería `?galeria=1`, modelos propios para poste, batería, alimentador y casa, prueba en Electron). (b) Borrados Phaser, `src/main.ts`, la escena 2D y sus galerías, `iso.ts` y los sprites de Sketch Town y Tiny Dungeon. (c) `CLAUDE.md`, README, SPEC y pull request.

## Rediseño de las torretas 3D (rama `vista-3d`; sólo capa visual)
- [x] TR0. Referencia 2D (tag `v-2d-final`), capturas en `docs/torretas/`, qué falla y reglas de diseño en SPEC.md.
- [x] TR1. Torreta de balas de referencia (`turrets3d.ts`, galería `/galeria-torretas.html`, capturas comparadas en `docs/torretas/`). **Parado: esperando visto bueno antes de seguir con TR2.**
- [x] TR2. Láser y lanzallamas (`turrets3d.ts`, fotos en `docs/torretas/`; `tools/fotos-torreta.cjs` para repetirlas).
- [x] TR3. Hielo y misil (el misil sólo en galería: la lógica no lo tiene). Ya no queda ningún tipo con el aspecto anterior.
- [x] TR4. Niveles, estados (apagada con luz roja, en obra con andamio, dañada con grietas y humo) y animaciones (cristales que laten, brillos, pilotos).
- [x] TR5. Efectos de disparo por tipo (casquillo, haz con onda, bola de fuego, niebla helada, estela de misil) y pulido a zoom alejado. **Rediseño de torretas terminado.**

## Pendiente, en este orden (diseño en SPEC.md)
- [ ] INV1-INV5. Investigación con puntos y árbol (rama `investigacion`, creada, aún sin código): laboratorio, investigadores, puntos, árbol, pantalla, bloqueos reales, guardado, guía y sim.
- [x] CIN0-CIN4. Cintas: Fase 0 de assets, textura animada, curvas, rampas (CIN3) y ascensor (CIN4). Rampas: una cinta o tubería sólo sube o baja 1 nivel; la cinta que sube va a `CONFIG.belt.rampUpFactor` (0,5). Ascensor de cintas (edificio `elevator`, Logística → `log_elevator`, cuesta bastidor 2, engranaje 4, circuito 1, necesita energía, 1,2 casillas/s, salva hasta 4 niveles); desnivel imposible avisado en rojo y en el texto; Conectar (A*) usa rampas y ascensores; 11 tests nuevos (`pendientes.test.ts`, `ruta.test.ts`).
- [ ] AIR5-AIR9. Enemigos aéreos y lanzamisiles.

## Cuatro mejoras de edificios (parte C, después de los aéreos; reglas en SPEC.md)
- [ ] HUE1. Sistema de huellas y colocación, con migración del guardado.
- [ ] HUE2. Escala de modelos y puertos por lado con flechas.
- [ ] HUE3. Granja nueva (4×4).
- [ ] HUE4. Munición por cinta y alimentador, con respaldo de NPC.
- [ ] HUE5. Diagnóstico de edificios (panel, "Mostrar", resumen en el HUD).
- [ ] HUE6. Guía de inicio, tooltips y equilibrado con simulaciones.

## Estética de interfaz con pack de UI y conexión de transporte (después de la parte C; reglas en SPEC.md)
- [x] UI-A0. Inventario del pack de UI: elegido el UI Pack Sci-Fi (el más reciente por fecha); contenido, tamaños, estados y lo que falta en ASSETS.md; hoja en `docs/ui-pack-inventario.png`.
- [x] UI-A1. Sistema de diseño HTML/CSS (`public/assets/ui-pack/ds/ds.css`, prefijo `.ds-`: paneles, ventanas, botones con estados y colores, pestañas, barras, casilla, deslizador, tooltip, ranura, separador, lista, 14 iconos SVG, distintivos de estado y puertos por tipo/estado) y galería `/galeria-ui.html` (captura en `docs/ui/galeria-ui.png`). **Parado: esperando visto bueno del estilo antes de A2.**
- [x] UI-A2. Aplicación a todos los menús, HUD, paneles y tooltips, con iconos de estado. Hecho con `ds/game.css` sobre el mismo HTML (paneles de cristal, botones del pack, pestañas, barras, tooltips, árbol de investigación, iconos en el HUD e iconos de estado); capturas a 1024×600, 1280×720 y 1920×1080 en `docs/ui/`.
- [x] CON-B1. Puertos tipados (`flow` sólido/petróleo/gasolina en `CONFIG.portFlow`, `side`), `canLink`, `portStatus` (libre, conectado, error con motivo y solución, bloqueado) y conectores siempre visibles con flecha del color del flujo y luz de estado; 7 tests nuevos en `puertos.test.ts`.
- [x] CON-B2. Encaje magnético (`conectar.ts`: `snapDir`, `portsAt`) y previsualización por extremo (`previewLine`: verde/rojo con motivo/naranja abierto, puerto ocupado); los puertos libres compatibles parpadean al elegir cinta o tubería; 8 tests en `conectar.test.ts`; captura `docs/ui/conectar-imam.png`.
- [x] CON-B3. Tuberías más finas (0,5 de casilla) con bridas en las juntas, color del líquido en bridas y tubo, curvas/T/cruz por auto-tile, y **un solo líquido por red** (`tuberias.ts`: `pipeNetworks`, `pipeConflicts`, `pipeJoinConflict`; se rechaza una tubería que mezclaría y se marcan en rojo las redes ya mezcladas); 4 tests. **Pendiente:** subidas y bajadas por desnivel (llegan con CIN3/CIN4, rampas y ascensores) y nivel de llenado visible.
- [x] CON-B4. Herramienta Conectar (tecla V, botón en el menú): `ruta.ts` con A* (casillas libres, sin atravesar puertos ajenos, menos curvas y menos desniveles, empalme de lado en una línea existente, coste y comprobación de materiales, mensajes con solución), vista previa verde con flechas y texto de ruta/coste, clic para aceptar y Esc/clic derecho para cancelar; 7 tests en `ruta.test.ts` (incluye que el material llega por un empalme). **Pendiente:** ajustar arrastrando puntos intermedios y rampas/ascensores en la ruta (dependen de CIN3/CIN4).
- [x] CON-B5. Resaltado de cadenas (`cadena.ts`: aguas arriba y abajo con flechas que corren), vista de logística (tecla L: mapa atenuado, todas las flechas de puertos y líneas por colores), texto de cada puerto bajo el ratón (tipo, sentido, estado, qué conectar), ayuda y guía actualizadas, y 3 tests (cadenas, empalme y guardado/carga de puertos y redes). **No hecho:** el bot de la guía sigue con su propio trazado (`guia-bot.ts connect`); no usa Conectar porque el núcleo aún no tiene puertos en `ports()`.

## Escala de la vista 3D (reglas en SPEC.md; sólo capa visual)
- [x] ESC-0. Auditoría: unidad única (`CONFIG.scale`), medidas de todos los modelos (`docs/escala/medidas.json`), tabla objetivo y informe `docs/escala/informe.md`. Tabla aprobada con cambios (15-11-2026): `CONFIG.scale` actualizada. **Parado: esperando visto bueno de las capturas.**
- [x] ESC-1. Galería de escala `/galeria-escala.html` (isométrica fija y orbital) y capturas en `docs/escala/`. **Parado: esperando visto bueno.**
- [x] ESC-2. Cinta 0,65 × 0,18 (tramos del modelo recto estirados, bordes laterales claros, curva/T/cruce con medios tramos y cubo central), tubería 0,35 con bridas de 0,45 apoyadas en un soporte, objetos 0,15–0,25 sobre la superficie, flechas de dirección y pilotos ajustados; tests en `escala.test.ts`.
- [x] ESC-3. Base sobre el terreno: `relieve.ts` (superficie = nivel × LEVEL_H + margen 0,004), terreno normalizado (los modelos de Kenney arrancan en −0,05), zócalo bajo lo construido en rampas de terreno y verificación en la vista real (`tools/verificar-bases.js`: 72 edificios en 3 alturas, 0 fuera de ±0,006); tests en `relieve.test.ts`.
- [x] ESC-4. Registro de aspectos `src/view3d/aspectos.ts` (factor `f` y estiramiento `sy` por modelo: edificios, personas, enemigos, árboles y muros, generado por `tools/calcular-aspectos.cjs` desde `docs/escala/medidas-base.json` y `CONFIG.scale.targets`), árboles con transparencia por tramado cuando tapan, brazo de la fábrica más bajo; 9 tests en `aspectos.test.ts`.
- [x] ESC-5. Revisión final: galería con las cajas objetivo (todos los modelos dentro de su caja), informe final `docs/escala/informe.md`, escenas del juego a cuatro zoom (`docs/escala/juego-*.png`). **Hecho; el hito ESC-6 (detalles de encaje) queda pendiente.**
- [x] ESC-6 (conos `cone` del kit en las esquinas de las obras y aspa roja `indicator-special-cross` en la casilla prohibida, capturas esc6-conos.jpg y esc6-casilla-prohibida.jpg; NO hecho: flechas `arrow-rounded` del kit en puertos y rutas (se mantienen las flechas generadas por código), brazo del alimentador animado, anillo de tubería poco visible). Antes: hecho también la luz de estado verde/naranja/rojo `statusLight` en fábrica, refinería, generador, turbina, bomba, taladro, alimentador, granja y laboratorio, y un anillo de conexión naranja en el extremo de la tubería que da a una máquina (poco visible: queda casi dentro de la máquina; captura docs/cintas/esc6-luces-tuberia.jpg); hecho el alimentador con brazo `robot-arm-a`, placa y piloto verde, captura docs/cintas/esc6-alimentador.jpg; faltan conectores de tubería, luz de estado general, conos y flechas del kit). Detalles de encaje (conectores físicos en puertos, luz de estado, conos y marcas de suelo, flechas, adornos animados opcionales) según la referencia del Factory Kit; ver SPEC.md.

## Cintas con el aspecto del Factory Kit (reglas en SPEC.md; sólo capa visual)
- [x] CIN-K0. Inventario: galería `/galeria-cintas.html` con las 36 piezas `conveyor*`, nombre y medidas (`docs/cintas/medidas-kit.json`, capturas `docs/cintas/kit-*.png`) y tabla de mapeo en SPEC.md.
- [x] CIN-K1. Escala y registro: `CINTA_PIEZAS`/`escalaPieza` en `aspectos.ts`; la cinta usa `conveyor-sides` (normal) y `conveyor-stripe-sides` (rápida) a 0,65 × 0,18 con 1 de largo, sobre la altura de su casilla; galería con la sección "a escala" (cinta recta, curvas, T, cruce, cuestas, objetos, persona, árbol y casa). **Parado: esperando visto bueno de las capturas.**
- [x] CIN-K2. Encaje automático: forma por vecinas (recta, curva, T, cruce con medios tramos + pieza de cruce), conectores físicos (placa naranja) en los bordes que dan a un edificio (`beltConnectors`, con test) y previsualización translúcida verde/roja que ya toma la forma real según las vecinas. Sin verificar en captura: el extremo sin entrada es una recta (sin tapa propia).
- [x] CIN-K3. Cuestas: la cinta inclinada sigue el terreno (pieza recta girada, ya en K1/K2). Ascensor compuesto con el kit: tolva de entrada + cinta de barras inclinada + tolva de salida + poste, con la altura real del desnivel (firma `|e<n>`). Captura `docs/cintas/ascensor.png`. Pulido: la cinta inclinada usa `conveyor-sides` (como las cuestas) y lleva dos pares de postes. El alimentador (brazo robot) queda para ESC-6.
- [x] CIN-K4. Objetos en cintas: `beltItemPose` (pieces.ts, con test) los hace recorrer la curva del borde de entrada al de salida (entrada lateral) y subir la cuesta con su inclinación; el piloto de cinta parada sube con la rampa. La capa de dirección y el estado ya cubrían curvas y cuestas (K1-K3). Captura: docs/cintas/k4-curva-objetos.jpg y k4-cuesta-objetos.jpg (la cuesta se veía hundida; arreglado: ahora sólo se inclina la cinta de abajo, `rampSlope`, captura k4-cuesta-arreglada.jpg). En T y cruces el juego no dice por qué lado llegó el objeto (se usa la primera entrada lateral).
- [x] CIN-K5. Galería (ya listaba los 36 modelos `conveyor*`, ahora con test de que existen), tests geométricos en `cintas.test.ts` (recorrido dentro de la casilla, continuo, sin retroceder; tramos de la capa de dirección; conectores; piezas del kit) y medida de rendimiento en SPEC.md (55 FPS con 1500 objetos; sin comparación antes/después).
