parcial se reutilizan los iconos 2D de Tiny Factory; faltan miniaturas de los modelos 
| # | Función en 2D | Estado | Nota |
|---|---|---|---|
| 1.1 | Arranca directo en partida (semilla fija 7) | hecho | `?seed=` en 3D |
| 1.2 | Pausa (botón y tecla P) | pendiente | |
| 1.3 | Pantalla "El núcleo ha caído" + Nueva partida | pendiente | |
| 1.4 | Adelantar oleada (con aviso si no hay torretas) | pendiente | |
| 1.5 | Menú principal | no existe | |
| 1.6 | Opciones (calidad, sombras, volumen) | no existe | la 3D tiene un botón de sombras |
| 1.7 | Guardado/carga y autoguardado | no existe | sólo guía y paneles en `localStorage` |

## 2. HUD
| # | Función en 2D | Estado | Nota |
|---|---|---|---|
| 2.1 | Vida del núcleo, oleada y cuenta atrás | parcial | sin tooltips ni estilo UI Pack |
| 2.2 | Fila de colonia: población/plazas, comida y consumo, hambre | pendiente | |
| 2.3 | Investigación en curso | pendiente | depende del árbol (vacío) |
| 2.4 | Mensajes emergentes (oleada, NPC muerto/llegado/marchado, investigación) | pendiente | la 3D sólo avisa de "no se puede construir" |
| 2.5 | Texto de la casilla bajo el ratón (mena, edificio, estado) | parcial | la 3D lo muestra al seleccionar, no al pasar |
| 2.6 | Estilo UI Pack (paneles, botones, barras, cursor, fuente) | pendiente | `ui-pack.css` reutilizable |
| 2.7 | Columnas que no se solapan (alto real del menú inferior) | pendiente | |

## 3. Menú de construcción
| # | Función en 2D | Estado | Nota |
|---|---|---|---|
| 3.1 | Categorías con pestañas (`menu.ts`, `descripciones.ts`) | pendiente | la 3D tiene una lista plana |
| 3.2 | Cambiar de categoría con Q/E y con la rueda sobre el menú | pendiente | en 3D Q/E giran la cámara: hay que reasignar teclas |
| 3.3 | Teclas 1–9 para elegir edificio | pendiente | |
| 3.4 | Iconos por edificio | pendiente | hoy salen de la hoja 2D; harán falta miniaturas de los modelos |
| 3.5 | Tooltips de edificio (coste, descripción, requisitos) | pendiente | `tooltips.ts` es lógica pura, reutilizable |
| 3.6 | Edificios bloqueados/no asequibles marcados | pendiente | |
| 3.7 | Girar pieza (R) con flecha de dirección | parcial | gira, sin indicador en el menú |
| 3.8 | Herramienta Quitar (X) con resalte rojo | pendiente | |
| 3.9 | Fantasma verde/rojo y casilla resaltada | hecho | |
| 3.10 | Mayús + arrastrar para pintar cintas y tuberías | pendiente | |
| 3.11 | Alcance de la torreta al colocarla | pendiente | |
| 3.12 | Puertos de entrada/salida al colocar | pendiente | |
| 3.13 | Clic derecho / Esc suelta la herramienta | hecho | |

## 4. Paneles
| # | Función en 2D | Estado | Nota |
|---|---|---|---|
| 4.1 | Almacén agrupado, con resumen y plegable | parcial | la 3D lista cantidades sin agrupar |
| 4.2 | NPCs por rol, reasignar, rol de quien llegue | pendiente | |
| 4.3 | Cola de trabajos con prioridades +/− | pendiente | |
| 4.4 | Ficha del edificio seleccionado: vida, inventario, estado, energía, botones girar/quitar, crítico | parcial | la 3D muestra nombre, vida, obra y receta |
| 4.5 | Panel de recetas por categorías, bloqueadas, fórmula | pendiente | |
| 4.6 | Ayuda (H): controles y conceptos | parcial | la 3D muestra los controles en la ficha |
| 4.7 | Tooltips de objetos y del HUD | pendiente | |
| 4.8 | Paneles plegables que se recuerdan | pendiente | |
| 4.9 | Árbol de tecnología | no existe | botón oculto: `CONFIG.tech` vacío |

## 5. Cámara y selección
| # | Función en 2D | Estado | Nota |
|---|---|---|---|
| 5.1 | Arrastrar para mover, WASD/flechas | hecho | |
| 5.2 | Zoom con rueda hacia el cursor | parcial | la 3D hace zoom al centro |
| 5.3 | Selección de casilla con relieve | hecho | `pick.ts` |
| 5.4 | Seleccionar edificio con contorno | parcial | marca la casilla, no el edificio entero (núcleo 2×2) |
| 5.5 | Semitransparencia de lo que tapa | pendiente | |
| 5.6 | Temblor de cámara al golpear el núcleo | pendiente | |
| 5.7 | Giro de cámara en pasos de 90° | hecho | nuevo en 3D |

## 6. Terreno y decoración
| # | Función en 2D | Estado | Nota |
|---|---|---|---|
| 6.1 | Relieve por niveles con laterales | hecho | |
| 6.2 | Zonas de terreno (hierba, tierra, roca, arena) | pendiente | la 3D sólo tiene hierba; paleta turquesa por corregir |
| 6.3 | Yacimientos marcados por tipo | parcial | piedras teñidas; falta que se lean bien |
| 6.4 | Árboles y decoración procedural con semilla y regla de bloqueo | parcial | hay árboles y rocas; sin las reglas de `decor.ts` |
| 6.5 | Puntos de aparición de enemigos marcados | pendiente | |
| 6.6 | Ruta prevista de los enemigos | pendiente | |

## 7. Edificios y logística
| # | Función en 2D | Estado | Nota |
|---|---|---|---|
| 7.1 | Un aspecto por cada edificio (25 tipos + núcleo) | parcial | todos tienen modelo; varios son provisionales |
| 7.2 | Obra en curso (transparente, progreso) | parcial | falta barra de progreso |
| 7.3 | Marcado para desmontar | pendiente | |
| 7.4 | Cintas rectas y curvas | hecho | orientación comprobada a ojo |
| 7.5 | Cintas con cruces y empalmes | pendiente | |
| 7.6 | Objetos sobre las cintas | parcial | cubos de color, sin icono de objeto |
| 7.7 | Cinta parada sin energía (modo manual) | pendiente | |
| 7.8 | Tuberías con curvas, T y cruces | parcial | sin comprobar todos los casos ni el líquido |
| 7.9 | Cables entre postes | pendiente | |
| 7.10 | Alcance de los postes | pendiente | |
| 7.11 | Flechas de puertos de entrada/salida (`puertos.ts`) | pendiente | |
| 7.12 | Icono de lo que produce y aviso de estado sobre la fábrica | pendiente | |
| 7.13 | Sin energía / sin gasolina / sin material | pendiente | |
| 7.14 | Barras de vida de edificios dañados | pendiente | |
| 7.15 | Desgaste y mantenimiento (condición) | pendiente | |

## 8. Murallas
| # | Función en 2D | Estado | Nota |
|---|---|---|---|
| 8.1 | Tres materiales (madera, piedra, metal) | parcial | un tramo recto teñido por tipo |
| 8.2 | Conexión por vecinos: recta, esquina, T, cruz, extremo (`muros.ts`) | pendiente | la 3D sólo orienta el tramo |
| 8.3 | Estados de daño | pendiente | |
| 8.4 | Puertas | no existe | pedido para la 3D |

## 9. Torretas
| # | Función en 2D | Estado | Nota |
|---|---|---|---|
| 9.1 | Cuatro tipos con aspecto propio | parcial | misma base teñida y arma distinta |
| 9.2 | La cabeza apunta al objetivo | hecho | |
| 9.3 | Retroceso y fogonazo al disparar | parcial | hay retroceso; falta fogonazo |
| 9.4 | Proyectil/efecto por tipo (bala, láser, fuego, hielo) | parcial | una línea de color por tipo |
| 9.5 | Niveles visibles | pendiente | |
| 9.6 | Estados: sin munición, sin energía, dañada (humo), lista (brillo) | pendiente | |
| 9.7 | Alcance al seleccionar | pendiente | |

## 10. Unidades
| # | Función en 2D | Estado | Nota |
|---|---|---|---|
| 10.1 | NPCs que se mueven | hecho | animación de andar y parado |
| 10.2 | NPCs distintos por rol | pendiente | todos son el obrero |
| 10.3 | Lo que lleva el NPC | pendiente | |
| 10.4 | Cinco tipos de enemigo | hecho | un modelo por tipo; voladores elevados |
| 10.5 | Enemigo atacando, ralentizado, ardiendo | pendiente | |
| 10.6 | Barras de vida de enemigos y NPCs | pendiente | |

## 11. Efectos
| # | Función en 2D | Estado | Nota |
|---|---|---|---|
| 11.1 | Destello al matar un enemigo | pendiente | |
| 11.2 | Efecto al morir un NPC y al destruirse un edificio | pendiente | |
| 11.3 | Humo de torreta dañada | pendiente | |
| 11.4 | Humo en fábricas y refinería, explosiones | no existe | pedido para la 3D |
| 11.5 | Sombras | hecho | nuevo en 3D, con interruptor |

## 12. Guía de inicio y tutorial
| # | Función en 2D | Estado | Nota |
|---|---|---|---|
| 12.1 | Panel de guía con pasos y detección real (`guia-inicio.ts`, `guia-flujo.ts`) | pendiente | la lógica es pura |
| 12.2 | Resaltes en el menú y en el mapa, flechas y ruta de ejemplo | pendiente | |
| 12.3 | Diagnósticos de cinta, energía y tubería | pendiente | |
| 12.4 | Progreso de la guía guardado | pendiente | |
| 12.5 | Tutorial guiado (`tutorial.ts`) | pendiente | lógica con tests, sin vista en esta rama |

## 13. Plataforma
| # | Función en 2D | Estado | Nota |
|---|---|---|---|
| 13.1 | Electron: ventana, F11, empaquetado e instalador | pendiente | hoy carga `index.html` |
| 13.2 | Build de Vite con varias páginas | hecho | `vista3d` ya es una entrada |
| 13.3 | Galerías de pruebas (`galeria-torretas.html`, `terreno-prueba.html`, `tools/`) | parcial | existe `tools/galeria3d.html` |
| 13.4 | Aviso si no hay WebGL2 | pendiente | pedido para la 3D |
| 13.5 | Niveles de calidad (bajo, medio, alto) | pendiente | pedido para la 3D |
| 13.6 | Bot y simulación sin gráficos (`npm run sim`) | hecho | no depende de la vista |

## Qué se reutiliza tal cual
`src/game/` entero, incluidos los módulos que alimentan la interfaz: `menu.ts`, `descripciones.ts`, `tooltips.ts`, `panels.ts`, `recetas.ts`, `ayuda.ts`, `guia-inicio.ts`, `guia-flujo.ts`, `puertos.ts`, `format.ts`. De `src/view/`: `ui.ts`, `tooltip.ts`, `tipPlacement.ts`, `guia.ts`, `muros.ts` (reglas de conexión) y `decor.ts` (reglas de decoración), una vez sin dependencias de Phaser.
