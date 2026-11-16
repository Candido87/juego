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
- [x] T2. Enemigos: tanques Navy de perfil (blindado y tanque) y nave Red proyectada en el suelo con 16 rumbos (voladores); assets en public/assets/enemigos. Sin verificar en pantalla con una oleada real.
- [x] T3. Humo (humo.ts, Smoke Particle Pack): blanco en fábricas, refinerías y generadores en marcha, negro bajo el 50 % de vida; pool con tope de 120. Quedan explosiones/destellos con las texturas del pack. Sin verificar en pantalla.
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
