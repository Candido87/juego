# PARIDAD — migración de la vista 2D (Phaser) a 3D (Three.js)

Decisión (15-11-2026): el juego pasa a 3D. La vista 2D se retira cuando todas las líneas de este archivo estén en **hecho**.
Rama de trabajo: `vista-3d`. Entrada 3D: `vista3d.html` + `src/view3d/`. Entrada 2D: `index.html` + `src/view/`.

**Estados:** `hecho` (funciona en 3D) · `parcial` (existe pero le falta lo indicado) · `pendiente` · `no existe` (tampoco lo tiene la 2D hoy; se anota para no perderlo).

**Vista 2D congelada:** desde hoy `src/view/` sólo recibe correcciones graves. Todo lo nuevo que se vea va a `src/view3d/`.

Resumen: **98 hecho · 0 parcial · 0 pendiente · 3 no existe** (101 líneas). Paridad alcanzada: la vista 2D se retira en la Fase 7.

## Hallazgos al inventariar (cambian el plan)
- **(Fase 1 hecha)** La interfaz es una sola para las dos vistas: `vista3d.html` usa `src/view/ui.ts`, `tooltip.ts` y `guia.ts`, que ya no importan Phaser (hay un test que lo vigila).
- **La interfaz 2D ya es HTML/CSS**, no Phaser: `index.html` + `src/view/ui.ts` (`Hud`), `tooltip.ts`, `guia.ts`. Lo que la ata a Phaser es poco: `ui.ts` y `tooltip.ts` importan `ITEM_COLORS` de `shapes.ts` (que importa Phaser) y los iconos salen de la hoja de sprites Tiny Factory (`sprites.ts`). La Fase 1 es desacoplar y reconectar, no reescribir desde cero.
- **Los muros no se pueden construir en una partida normal.** Sólo los desbloquea el tutorial (`tutorial.ts`); con el árbol de tecnología vacío, en la partida libre salen bloqueados, y la puerta nueva igual. Es una decisión de diseño pendiente, no un fallo de la vista.
- **Las torretas de energía (láser y hielo) nunca disparan.** `Game.turretPower` devuelve 0 para toda torreta con `energyPerShot > 0`, así que su efecto de disparo existe en la vista pero no se verá en una partida hasta que la lógica las alimente. Además están bloqueadas (árbol de tecnología vacío). Es lógica pendiente, no un fallo de la vista.
- **`Enemy.attacking` no se rellena nunca** en la lógica: la vista deduce el ataque de que el enemigo lleve un rato parado.
- **Guardado y carga de partida** no existían en la 2D; ya existen (Fase 5) en `game/savegame.ts`, con tests.
- **El árbol de tecnología está vacío** (`CONFIG.tech = []`): el botón "Árbol (T)" existe pero se oculta. No hay pantalla que portar hasta que haya nodos.
- **El tutorial** (`src/game/tutorial.ts`, `tutorialBot.ts`, `tutorialText.ts`) tiene lógica y tests pero **no está conectado a la vista** en esta rama. Lo que sí funciona es la guía de inicio (`guia.ts`).
- **No hay menú principal, opciones ni sonido** en la 2D.

## 1. Arranque, menús y ciclo de partida
| # | Función en 2D | Estado | Nota |
|---|---|---|---|
| 1.1 | Arranca directo en partida (semilla fija 7) | hecho | `?seed=` en 3D |
| 1.2 | Pausa (botón y tecla P) | hecho | botón, tecla P y aviso con Reanudar/Opciones/Ayuda/Nueva partida |
| 1.3 | Pantalla "El núcleo ha caído" + Nueva partida | hecho | recarga con semilla nueva |
| 1.4 | Adelantar oleada (con aviso si no hay torretas) | hecho |  |
| 1.5 | Menú principal | no existe | |
| 1.6 | Opciones (calidad, sombras) | hecho | calidad gráfica (auto, baja, media, alta), sombras, contorno, velocidad y rendimiento, guardadas. El volumen pasa a la línea 1.8: el juego no tiene sonido |
| 1.7 | Guardado/carga y autoguardado | hecho | guardado manual y autoguardado (cada minuto y al cerrar); desde las opciones o con `?load=auto|manual`; al abrir con una partida viva se pregunta Continuar o Nueva; la guía viaja con el guardado |
| 1.8 | Sonido y volumen | no existe | ni la 2D ni la 3D tienen sonido; cuando lo haya, el volumen va en Opciones |

## 2. HUD
| # | Función en 2D | Estado | Nota |
|---|---|---|---|
| 2.1 | Vida del núcleo, oleada y cuenta atrás | hecho |  |
| 2.2 | Fila de colonia: población/plazas, comida y consumo, hambre | hecho |  |
| 2.3 | Investigación en curso | hecho | misma interfaz; no se ve mientras el árbol esté vacío |
| 2.4 | Mensajes emergentes (oleada, NPC muerto/llegado/marchado, investigación) | hecho |  |
| 2.5 | Texto de la casilla bajo el ratón (mena, edificio, estado) | hecho |  |
| 2.6 | Estilo UI Pack (paneles, botones, barras, cursor, fuente) | hecho | `ui-pack.css` compartido |
| 2.7 | Columnas que no se solapan (alto real del menú inferior) | hecho | comprobado a 967×853 y 1024×640 con todos los paneles abiertos |

## 3. Menú de construcción
| # | Función en 2D | Estado | Nota |
|---|---|---|---|
| 3.1 | Categorías con pestañas (`menu.ts`, `descripciones.ts`) | hecho |  |
| 3.2 | Cambiar de categoría con Q/E y con la rueda sobre el menú | hecho | Q/E siguen siendo categorías; la cámara gira con Z/C |
| 3.3 | Teclas 1–9 para elegir edificio | hecho |  |
| 3.4 | Iconos por edificio | hecho | miniaturas de los propios modelos 3D, dibujadas al arrancar (`View3D.thumbnails`); roles y trabajos siguen con los iconos del pack |
| 3.5 | Tooltips de edificio (coste, descripción, requisitos) | hecho |  |
| 3.6 | Edificios bloqueados/no asequibles marcados | hecho |  |
| 3.7 | Girar pieza (R) con flecha de dirección | hecho |  |
| 3.8 | Herramienta Quitar (X) con resalte rojo | hecho |  |
| 3.9 | Fantasma verde/rojo y casilla resaltada | hecho | |
| 3.10 | Mayús + arrastrar para pintar cintas y tuberías | hecho |  |
| 3.11 | Alcance de la torreta al colocarla | hecho | anillo verde/rojo al colocar |
| 3.12 | Puertos de entrada/salida al colocar | hecho |  |
| 3.13 | Clic derecho / Esc suelta la herramienta | hecho | |

## 4. Paneles
| # | Función en 2D | Estado | Nota |
|---|---|---|---|
| 4.1 | Almacén agrupado, con resumen y plegable | hecho |  |
| 4.2 | NPCs por rol, reasignar, rol de quien llegue | hecho |  |
| 4.3 | Cola de trabajos con prioridades +/− | hecho |  |
| 4.4 | Ficha del edificio seleccionado: vida, inventario, estado, energía, botones girar/quitar, crítico | hecho |  |
| 4.5 | Panel de recetas por categorías, bloqueadas, fórmula | hecho |  |
| 4.6 | Ayuda (H): controles y conceptos | hecho | con los controles de cámara añadidos |
| 4.7 | Tooltips de objetos y del HUD | hecho |  |
| 4.8 | Paneles plegables que se recuerdan | hecho |  |
| 4.9 | Árbol de tecnología | no existe | botón oculto: `CONFIG.tech` vacío |

## 5. Cámara y selección
| # | Función en 2D | Estado | Nota |
|---|---|---|---|
| 5.1 | Arrastrar para mover, WASD/flechas | hecho | |
| 5.2 | Zoom con rueda hacia el cursor | hecho | `CameraRig.zoomAt`, con test |
| 5.3 | Selección de casilla con relieve | hecho | `pick.ts` |
| 5.4 | Seleccionar edificio con contorno | hecho | marca la huella entera |
| 5.5 | Semitransparencia de lo que tapa | hecho | trama de transparencia en un círculo alrededor del cursor (al construir) y del edificio seleccionado; vale también para árboles |
| 5.6 | Temblor de cámara al golpear el núcleo | hecho | sacudida corta (0,14 s) que se apaga sola |
| 5.7 | Giro de cámara en pasos de 90° | hecho | nuevo en 3D |
| 5.8 | Contorno oscuro de objetos y escalones | hecho | nuevo en 3D; pase de bordes por profundidad, con interruptor en Opciones |
| 5.9 | Personajes visibles cuando algo los tapa | hecho | disco de color (azul NPC, rojo enemigo) que sólo aparece si están ocultos |
| 5.10 | Elegir un edificio haciendo clic en su cuerpo | hecho | además de por su casilla; lo tapado se elige por la casilla |

## 6. Terreno y decoración
| # | Función en 2D | Estado | Nota |
|---|---|---|---|
| 6.1 | Relieve por niveles con laterales | hecho | |
| 6.2 | Zonas de terreno (hierba, tierra, roca, arena) | hecho | arena o tierra seca, hierba y roca con transición continua (mismo ruido y umbrales que `decor.ts`); los yacimientos conservan su color |
| 6.3 | Yacimientos marcados por tipo | hecho | suelo teñido por recurso más piedras de color |
| 6.4 | Árboles y decoración procedural con semilla y regla de bloqueo | hecho | sale de `generateDecor` (`decor.ts`): por semilla, nunca sobre menas, junto al núcleo, en las apariciones ni en el pasillo hasta el núcleo; se esconde bajo toda la huella del edificio |
| 6.5 | Puntos de aparición de enemigos marcados | hecho | bandera roja y disco en el suelo (`threat3d.ts`) |
| 6.6 | Ruta prevista de los enemigos | hecho | un punto rojo por casilla desde cada aparición; se rehace cuando la lógica recalcula los caminos |

## 7. Edificios y logística
| # | Función en 2D | Estado | Nota |
|---|---|---|---|
| 7.1 | Un aspecto por cada edificio (25 tipos + núcleo) | hecho | poste, batería, alimentador y casa ya no comparten modelo con otros (poste y batería hechos con figuras simples); se revisan todos en `?galeria=1` |
| 7.2 | Obra en curso (transparente, progreso) | hecho | transparente, crece con la obra y lleva barra azul de progreso |
| 7.3 | Marcado para desmontar | hecho | icono ✕ rojo sobre el edificio |
| 7.4 | Cintas rectas y curvas | hecho | orientación comprobada a ojo |
| 7.5 | Cintas con cruces y empalmes | hecho | T y cruce elegidos por las entradas; giro calculado con los lados abiertos de cada modelo (con tests) |
| 7.6 | Objetos sobre las cintas | hecho | forma por familia (terrón, tronco, losa, disco, cilindro, caja) y color del objeto, como en la 2D |
| 7.7 | Cinta parada sin energía (modo manual) | hecho | cinta apagada con piloto rojo intermitente y aviso en el texto de la casilla |
| 7.8 | Tuberías con curvas, T y cruces | hecho | tramo recto, o medios tramos con codo central para curva, T y cruz; el líquido no se ve |
| 7.9 | Cables entre postes | hecho | cable con caída entre postes enlazados |
| 7.10 | Alcance de los postes | hecho | al seleccionar un poste y al colocar postes o edificios eléctricos |
| 7.11 | Flechas de puertos de entrada/salida (`puertos.ts`) | hecho | flecha llena = salida, tenue = entrada; amarillo sólidos, celeste líquidos; en selección, al pasar el ratón y al colocar |
| 7.12 | Icono de lo que produce y aviso de estado sobre la fábrica | hecho | icono con el color del objeto si produce; aviso si no |
| 7.13 | Sin energía / sin gasolina / sin material | hecho | se añade el aviso de "sin conexión a la red" (cuando ya existe alguna red o el edificio no hace nada sin energía); el texto del aviso sale al pasar el ratón |
| 7.14 | Barras de vida de edificios dañados | hecho | barra naranja sobre el edificio; los muros no la llevan (ya tienen estados de daño) |
| 7.15 | Desgaste y mantenimiento (condición) | hecho | icono de engranaje: amarillo desgastado (rinde la mitad), rojo averiado; el porcentaje sigue en la ficha |

## 8. Murallas
| # | Función en 2D | Estado | Nota |
|---|---|---|---|
| 8.1 | Tres materiales (madera, piedra, metal) | hecho | muros macizos de tres alturas y colores |
| 8.2 | Conexión por vecinos: recta, esquina, T, cruz, extremo (`muros.ts`) | hecho | brazos hacia cada vecino y poste central; recta, esquina, T, cruz, extremo y suelto |
| 8.3 | Estados de daño | hecho | dos niveles: más bajo y más oscuro |
| 8.4 | Puertas | hecho | edificio nuevo `wall_gate` en la lógica: la colonia la cruza, los enemigos no (con tests) |

## 9. Torretas
| # | Función en 2D | Estado | Nota |
|---|---|---|---|
| 9.1 | Cuatro tipos con aspecto propio | hecho | arma, color y accesorio propios: caja de munición, lente, depósito o cristal |
| 9.2 | La cabeza apunta al objetivo | hecho | |
| 9.3 | Retroceso y fogonazo al disparar | hecho | retroceso, fogonazo y humo en la boca del cañón |
| 9.4 | Proyectil/efecto por tipo (bala, láser, fuego, hielo) | hecho | bala trazadora con chispa; rayo láser que se afina; chorro de llamas; pulso de hielo con anillo y esquirlas |
| 9.5 | Niveles visibles | hecho | un anillo de color por nivel y cañón más grande |
| 9.6 | Estados: sin munición, sin energía, dañada (humo), lista (brillo) | hecho | sin munición o sin energía: icono y cabezal gris caído; dañada: humo negro y chispas; lista: brillo (láser, hielo) o llama piloto (fuego) |
| 9.7 | Alcance al seleccionar | hecho |  |

## 10. Unidades
| # | Función en 2D | Estado | Nota |
|---|---|---|---|
| 10.1 | NPCs que se mueven | hecho | andar, esperar y trabajar (cuando está quieto con tarea) |
| 10.2 | NPCs distintos por rol | hecho | un modelo por rol, con tinte |
| 10.3 | Lo que lleva el NPC | hecho | caja del color del objeto que más lleva |
| 10.4 | Cinco tipos de enemigo | hecho | un modelo por tipo; voladores elevados |
| 10.5 | Enemigo atacando, ralentizado, ardiendo | hecho | ataca cuando lleva un rato parado; ralentizado: azulado, lento y con escarcha; ardiendo: llamas y humo. Al morir cae al suelo |
| 10.6 | Barras de vida de enemigos y NPCs | hecho | verde, amarilla o roja según la vida; sólo si está herido |

## 11. Efectos
| # | Función en 2D | Estado | Nota |
|---|---|---|---|
| 11.1 | Destello al matar un enemigo | hecho | destello amarillo con chispas |
| 11.2 | Efecto al morir un NPC y al destruirse un edificio | hecho | destello rojo y caída del NPC; explosión con humo, escombros y onda al destruirse un edificio; destello rojo en el núcleo al recibir daño |
| 11.3 | Humo de torreta dañada | hecho | cualquier edificio por debajo del 50 % de vida humea; por debajo del 25 % además chispea |
| 11.4 | Humo en fábricas y refinería, explosiones | hecho | chimeneas de fábrica, refinería, generador y núcleo mientras están en marcha; explosiones |
| 11.5 | Sombras | hecho | nuevo en 3D, con interruptor |

## 12. Guía de inicio y tutorial
| # | Función en 2D | Estado | Nota |
|---|---|---|---|
| 12.1 | Panel de guía con pasos y detección real (`guia-inicio.ts`, `guia-flujo.ts`) | hecho | el mismo panel de la 2D, sin cambios |
| 12.2 | Resaltes en el menú y en el mapa, flechas y ruta de ejemplo | hecho | resalte de botón y categoría; flecha que rebota y marco en la casilla; puertos, alcance de postes y ruta de ejemplo con flechas sobre el mapa |
| 12.3 | Diagnósticos de cinta, energía y tubería | hecho | aviso de texto en el panel y casilla del problema marcada en rojo |
| 12.4 | Progreso de la guía guardado | hecho | dentro de cada guardado y en `localStorage` |
| 12.5 | Tutorial guiado (`tutorial.ts`) | hecho | `?tutorial=1` o botón en las opciones: panel con paso N de M, saltar paso o tutorial, resalte y casilla señalada; sin guardar la partida del tutorial |

## 13. Plataforma
| # | Función en 2D | Estado | Nota |
|---|---|---|---|
| 13.1 | Electron: ventana, F11, empaquetado e instalador | hecho | probado con `ELECTRON_SMOKE` (abre el build por `app://`, captura y resumen: arranca, 144 FPS, sin errores); el instalador `npm run dist` no se ha regenerado en esta fase |
| 13.2 | Build de Vite con varias páginas | hecho | `vista3d` ya es una entrada |
| 13.3 | Galerías de pruebas | hecho | `vista3d.html?galeria=1` (todos los edificios y las torretas por nivel, con el código del juego), `?demo=wave` y `tools/galeria3d.html` (modelos sueltos de los packs) |
| 13.4 | Aviso si no hay WebGL2 | hecho | aviso a pantalla completa con qué hacer (sin WebGL, sólo WebGL1, fallo al arrancar o contexto perdido); `?nowebgl=1` lo simula; sin aceleración por hardware se arranca en calidad baja |
| 13.5 | Niveles de calidad (bajo, medio, alto) | hecho | `quality.ts`: resolución, suavizado, sombras, contorno, partículas y personajes animados; se cambia en caliente; el modo automático baja un nivel si los FPS se quedan por debajo de 30 durante 5 s |
| 13.6 | Bot y simulación sin gráficos (`npm run sim`) | hecho | no depende de la vista |

## Qué se reutiliza tal cual
`src/game/` entero, incluidos los módulos que alimentan la interfaz: `menu.ts`, `descripciones.ts`, `tooltips.ts`, `panels.ts`, `recetas.ts`, `ayuda.ts`, `guia-inicio.ts`, `guia-flujo.ts`, `puertos.ts`, `format.ts`. De `src/view/`: `ui.ts`, `tooltip.ts`, `tipPlacement.ts`, `guia.ts`, `muros.ts` (reglas de conexión) y `decor.ts` (reglas de decoración), una vez sin dependencias de Phaser.
