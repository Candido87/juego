# SPEC — Fábrica isométrica con defensa

Juego de fábrica + defensa en vista isométrica 3D. TypeScript, Three.js, Vite, Vitest. Sin backend.

> **Nota (15-11-2026):** el juego empezó en 2D con Phaser y se migró a 3D. La vista 2D está borrada. Las secciones
> antiguas de este documento que hablan de Phaser, `shapes.ts`, `GameScene.ts`, sprites o Sketch Town describen esa
> etapa y se conservan como historial; lo vigente para la vista está en las secciones "Migración, Fase N" del final
> y en `CLAUDE.md`. Las reglas del juego (economía, recetas, energía, oleadas) no cambiaron con la migración.

## Arquitectura
- `src/game/*`: lógica pura (sin Phaser ni DOM). Se puede simular sin gráficos (`npm run sim`).
  - `config.ts`: **todos** los números (costes, daños, tiempos, velocidades, árbol, oleadas).
  - `types.ts`, `world.ts` (mapa), `path.ts` (rutas),
    `game.ts` (estado y sistemas), `jobs.ts` (cola de trabajos), `npc.ts` (NPCs), `bot.ts` (jugador automático).
- `src/view/*`: interfaz HTML/CSS compartida y reglas puras de la vista (decoración, muros, iconos). Sólo lee el estado y envía comandos (`place`, `remove`, `research`...).
- `src/view3d/*`: vista 3D con Three.js (`scene3d.ts`, `catalog.ts`, `terrain.ts`, `overlay3d.ts`...). Ver `CLAUDE.md`.

## Vista (hecho)
Proyección isométrica 2:1 (64x32), orden por profundidad (x+y), semitransparencia de objetos altos
que tapan cursor/enemigos/NPCs, cámara con arrastre y zoom, selección con relieve (alturas 0–2),
sombras suaves.

## Economía base (rediseño — encargo "petróleo, población, componentes, taller")
Este bloque manda sobre lo anterior cuando choque. **Qué cambia respecto al diseño previo:**
- Generadores (combustión y turbina) queman **gasolina**, no carbón. El carbón sigue para ladrillos/baterías
  y como munición del lanzallamas.
- **No se contratan NPCs con piezas.** La población empieza en **3** (1 Constructor, 1 Transportista,
  1 Operario) y sólo crece con comida de sobra y vivienda libre. El jugador puede **cambiar el rol** de cualquier NPC.
- **Todos los edificios cuestan componentes** fabricados (bastidor, engranaje, cable, tubería, mecanismo de
  torreta, kit de taller...), no placas ni materias primas sueltas.
- Las **reparaciones** las hacen los Mecánicos del Taller; sin taller, los Constructores (más lento).
- Los enemigos **dañan los edificios** que tienen al lado (antes sólo NPCs y núcleo), para que haya qué reparar.
- Derrota también si la **población llega a 0**.

### 1. Petróleo → gasolina → electricidad
- Mena nueva **petróleo** (yacimientos en el mapa, uno garantizado cerca del núcleo). Se extrae con la **Bomba**
  (sólo sobre petróleo; funciona sin red a ritmo bajo, el doble con red, como el taladro).
- **Refinería**: edificio con receta fija `gasoline` (petróleo → gasolina, ratio y tiempo en config).
  Funciona sin red (lenta) y mejor con ella. Entradas por cinta o Transportista; salida a cinta o recogida.
- **Generadores con gasolina.** El primero se enciende con gasolina llevada a mano (hay gasolina inicial en el
  almacén) y un Operario lo arranca. Toda la cadena es posible sin electricidad: bomba manual → Transportista
  recoge el petróleo → lo lleva a la refinería → recoge la gasolina → la lleva al generador.

### 2. Electricidad y cintas
- Las cintas **sólo se mueven con energía** (multiplicador 0 sin red). Sin red, nada fluye por cinta y la
  salida de taladros/fábricas que da a una cinta parada se considera "no sale sola" → trabajo de **Recoger**.
- Se mantiene todo lo diseñado: redes, postes, apagón proporcional, baterías, críticos.

### 3. Población y comida
- Población = NPCs vivos. Roles: Constructor, Transportista, Operario y **Mecánico** (sólo vía Taller).
- **Comida** (objeto `food`) en el almacén global. Cada persona come `food.perPerson` unidades cada
  `food.interval` s (se descuenta del almacén).
- **Granja**: produce comida (`farm.period`); sin red ×`mult.farm[0]`, con red ×`mult.farm[1]`. Salida como el taladro.
- Si no hay comida: estado **hambre**; trabajo y velocidad × `food.hungryFactor`.
  Tras `food.starveGrace` s de hambre seguida, cada `food.leaveInterval` s una persona **se marcha**.
- **Crecimiento**: cada `growth.interval` s, si hay vivienda libre, no hay hambre y comida ≥ `growth.foodMin`,
  se gastan `growth.foodCost` y llega una persona con el rol que el jugador elija (por defecto el rol con menos gente).
- **Vivienda**: el núcleo aloja `housing.core`; cada **Casa** `housing.house`.
- Población 0 → fin de partida.

### 4. Componentes y fábricas de nivel 1
- Cada edificio define su lista de componentes en `config.buildings[*].cost`. Lista de componentes en
  `config.components`. Test: todo edificio exige al menos un componente y ninguna mena.
- Recetas con `tier`. **Nivel 1** (fábrica normal): placas, ladrillo, engranaje, bastidor, cable, tubería,
  mecanismo de torreta, munición, kit de taller. **Nivel 2+** (circuito, batería, placa de muro, ciencia II)
  quedan bloqueadas hasta el árbol de tecnología (decisión: no hay edificio "fábrica II" aún; el nivel lo marca
  la receta y se desbloqueará investigando).
- La refinería tiene su propia receta (`building: 'refinery'`) que no aparece en la fábrica.

### 5. Taller
- Se construye con kits de taller. Al terminarse toma **2 personas** de la población (las de rol con más gente,
  dejando siempre al menos 1 fuera) y las convierte en **Mecánicos**. Si un mecánico muere, el taller repone
  de la población si puede. Desmontarlo devuelve a los mecánicos como Constructores.
- Los Mecánicos **sólo reparan** (más rápido: `repair.mechanicFactor`). Con taller activo los Constructores no reparan.
- Sin taller, reparan los Constructores a `repair.constructorFactor` (más lento) y compiten con las obras.
- Reparar gasta el primer componente del coste del edificio según el daño (`repair.fractionPerUnit`).
- Prioridad: generadores, torretas, postes y baterías llevan `jobs.criticalRepairBonus`.

### 6. Interfaz
Panel de población (total, libres, trabajando, en el taller, vivienda), comida (almacenada, consumo/min,
estado de hambre), gasolina almacenada, rol de cada NPC cambiable, taller (mecánicos, reparaciones en cola).

## Recursos y piezas
- Menas del mapa (taladro encima): hierro, cobre, carbón, piedra, bosque (madera); **petróleo** (bomba).
- Piezas: placas, ladrillo, componentes (ver arriba), munición, comida, petróleo, gasolina,
  circuito, batería, placa de muro, paquetes de ciencia I y II.
- **No hay créditos.** Todo se paga con piezas del almacén.
- **Almacén global**: el núcleo y los edificios Almacén comparten un único inventario (decisión simple).
  Las cintas que entran en un almacén suman al inventario. Los NPCs recogen/dejan en el almacén más cercano.

## Edificios
Taladro, cinta, cinta rápida, fábrica (receta elegible), almacén, generador (quema carbón),
acumulador (amplía energía), torretas (balas, láser, fuego, hielo), muros (madera, piedra, metal).
- Al colocar algo se crea una **obra** (sitio). No funciona hasta que un Constructor lleva los materiales y la termina.
- Quitar una obra sin terminar la cancela al instante (devuelve lo entregado).
  Quitar un edificio terminado crea un trabajo de **desmontaje** (devuelve el 50 % de las piezas).
- Fábricas: entradas por cinta o por Transportista; salida a la cinta de delante, o se acumula y un
  Transportista la recoge al almacén. Taladros igual (salida a cinta o recogida).

## Electricidad y automatización (sustituye a la antigua "energía global")
Dos modos que conviven:
- **Manual (sin red)**: los NPCs hacen el trabajo físico. Las cintas sin energía **no se mueven**;
  los Transportistas llevan piezas, munición y combustible a mano y recogen salidas.
- **Automático (con red)**: cintas, fábricas, taladros y alimentadores conectados funcionan solos.
  Si se corta la red, lo automatizado se para (o va más lento) y los NPCs vuelven a cubrirlo.

### Red
- **Postes**: se enlazan solos (cable) con otros postes a ≤ `wireRange`. Cada componente conexa de postes es una red.
- Un edificio eléctrico se conecta a la red del **poste más cercano** a ≤ `supplyRadius` (Chebyshev).
  Los edificios no enlazan redes entre sí (sólo los postes).
- **Generadores**: combustión (carbón, por cinta/alimentador o NPC), solar (poca potencia, sin combustible, cara),
  turbina de vapor (avanzada, más potencia por carbón).
- **Baterías** (acumuladores): guardan el excedente y cubren los picos.
- **Consumo** constante por edificio conectado (valores en `config.ts`).
- **Apagón parcial**: satisfacción `s = min(1, (producción + descarga de baterías) / demanda)`.
  Cada consumidor rinde `sinRed + (conRed − sinRed) · s` (multiplicadores en config).
- **Prioridad**: los consumidores marcados como **críticos** (torretas por defecto) reciben energía antes;
  el resto se reparte con la satisfacción que quede.
- **Arranque**: un generador de combustión parado necesita combustible **y** que un Operario lo arranque
  (trabajo "Arrancar"). Así la primera red se enciende sin electricidad previa.

### Qué hace la energía (multiplicador sin red → con red)
| Edificio | Sin red | Con red |
|---|---|---|
| Cinta / cinta rápida | 0 (parada) | 1 |
| Taladro | 1 | 2 (taladro eléctrico) |
| Fábrica | 0.5 (manual) | 1.5 |
| Alimentador | 0 | 1 |
| Torreta láser / hielo | 0 (no disparan aunque haya NPCs) | 1 |
| Torreta de balas / fuego | 1 | 1 (no consumen; se automatizan con alimentador) |

### Alimentador
Edificio orientado: toma de la casilla de **atrás** (cinta, almacén o salida de fábrica/taladro) y mete en la de
**delante** (fábrica, torreta, generador) lo que ésta acepte. Sólo con energía.
- Un edificio **automatizado** (le apunta un alimentador o una cinta con energía) no genera trabajos de
  abastecimiento salvo que esté vacío. Las salidas que caen en una cinta con energía no generan recogidas.

### NPCs y electricidad
- Nuevos trabajos: **Arrancar** generador (Operario), **Abastecer combustible** (Transportista), **Reparar**
  postes/generadores (Constructor) con prioridad extra (`jobs.gridRepairBonus`).
- Los enemigos atacan la infraestructura eléctrica (postes, generadores, baterías, solares) que tengan a
  ≤ `enemies.infraAggroRange`: se paran a romperla y luego siguen.

### Interfaz
Cables entre postes, indicador sobre cada edificio eléctrico (⚡ conectado / bajo / sin energía),
panel de redes (producción, consumo, batería), y marcar críticos.

## Torretas
| Tipo | Construcción | Munición/energía | Rol |
|---|---|---|---|
| Balas | hierro + engranajes | munición | barata, daño constante, alcanza voladores |
| Láser | cobre + componentes | energía | ignora armadura, alcanza voladores |
| Fuego | hierro + ladrillo | carbón | daño en área + quemadura, sólo tierra |
| Hielo | cobre + componentes + batería | energía | daño bajo en área, ralentiza, sólo tierra |
- Niveles: mejoras **globales por tipo** desbloqueadas en el árbol (decisión simple). Cada nivel: +daño, +alcance.
- Armadura: daño recibido = max(20 % del daño, daño − armadura), salvo láser y quemadura.
- Desgaste: disparar desgasta la torreta; con estado < 50 % rinde a la mitad, a 0 se para. Un Operario la mantiene.

## Gráficos: pack "Tiny Factory" de Kenney (CC0)
- Origen: `assets-juego/` (pack original). Se usa `public/assets/kenney/tiny-factory.png` (hoja 12×11 de 16 px).
- El pack es **cenital**, el juego es **isométrico**. Decisión: no se sustituyen los prismas, se combinan:
  - **Caras superiores**: una casilla cenital se proyecta (transformación afín) sobre el rombo superior de un
    prisma: cintas y cintas rápidas (giran con su dirección), almacén, fábrica, batería, núcleo, muro de metal.
  - **Sprites de pie** (x2, anclados por los pies): NPCs (obrero = Constructor, carretilla = Transportista,
    robot = Operario), bandera en los puntos de aparición, luz de alarma sobre torretas sin munición y
    generadores parados.
  - **Iconos** en la barra de construcción, el panel de NPCs y la cola de trabajos.
- El pack no trae hierba, torretas ni enemigos: siguen generados por código.
- Mapa de casillas en `src/view/sprites.ts` (sin Phaser, con test). Visor de índices: `tools/atlas.html`.
- Crédito: Kenney (www.kenney.nl), licencia CC0 (no obligatorio, pero se agradece).

## Aspecto de las torretas
Generado por código (prismas de 3 caras) y registrado en **un único sitio**: `TURRET_LOOKS` en `src/view/shapes.ts`.
Cada torreta se distingue por **silueta, color y animación** (reconocible con el zoom alejado).
- **Balas**: base cuadrada baja y robusta; cabeza con cañón corto (doble desde nivel 2). Gris metálico con amarillo.
  Disparo: retroceso del cañón, fogonazo y bala trazadora.
- **Láser**: torre estrecha y alta, anillos de cobre y cristal brillante en la punta. Azul/cian.
  Disparo: haz continuo; el brillo del cristal sube con la energía de la red.
- **Fuego**: base ancha con depósito visible (marca el nivel de combustible) y boquilla corta. Naranja/rojo ennegrecido.
  Disparo: llamarada en cono con chispas.
- **Hielo**: base hexagonal-ish con cristales azul claro en punta. Disparo: esquirlas y nube helada.
  (No se añade misil: "otros tipos extra que existan" → sólo existe hielo. Decisión simple.)
- **Cabeza que gira**: la base es una imagen fija; la cabeza es otra imagen con **8 orientaciones horneadas**
  (en isométrico no vale rotar el sprite). Se elige la orientación más cercana al objetivo.
- **Niveles 1–3**: cada nivel tiene su variante (más grande, más cañones/anillos, tono nuevo).
- **Estados**: en obra → andamio + translúcida; sin munición/energía → oscurecida + icono de aviso;
  dañada (< 50 % vida) → grietas y humo.
- Interfaz: icono por torreta en el menú (misma silueta) y ficha al pasar el ratón (tipo, nivel, daño, alcance,
  munición/energía).

## Murallas y enemigos
- Muros de madera / piedra / metal con vida y coste distintos. Se reparan con su material (Constructor).
- **Regla elegida**: se permite cortar el camino. Los enemigos calculan su ruta con costes:
  casilla libre 1, muro +`wallCost`, otro edificio sólido +`buildingCost`. Si su ruta pasa por un edificio,
  se paran y lo atacan hasta romperlo. Los voladores ignoran muros y van en línea recta.
- Los enemigos dañan a los NPCs cercanos. Un NPC muerto hay que reponerlo (contratar otro).
- Tipos de enemigo: normal, rápido, blindado, volador, tanque (rompe muros rápido).

## NPCs y cola de trabajos
- Roles: **Constructor** (obras, reparar, desmontar), **Transportista** (abastecer y recoger),
  **Operario** (mantener fábricas y torretas).
- ~~Se contratan pagando piezas~~: son la población (ver "Economía base"). Tienen vida, velocidad y capacidad
  de carga (mejorables en el árbol). **Mecánico**: rol del Taller, sólo repara.
- La cola se recalcula cada `jobs.scanInterval` s a partir del estado: obras, desmontajes, reparaciones,
  abastecimientos (entradas de fábrica, munición, combustible), recogidas y mantenimientos.
- Un NPC libre elige el trabajo de su rol con **mayor prioridad** y, a igualdad, el **más cercano**.
  Sólo coge trabajos factibles (hay material en el almacén). El jugador puede subir/bajar la prioridad.
- Torreta sin munición → trabajo de abastecimiento con prioridad alta. Si nadie llega, deja de disparar.
- Rutas: BFS en la cuadrícula esquivando edificios sólidos, hasta una casilla vecina del objetivo.
- Si no hay NPCs del rol, ese trabajo no se hace.

## Investigación
- Se paga con **paquetes de ciencia** del almacén al empezar; tarda `time` segundos. Una a la vez.
- Ramas: Armamento, Defensa, Industria, Logística, Ingeniería y **Energía y automatización**
  (en orden: generador de combustión → postes y cables → cintas motorizadas → alimentadores → baterías →
  solar → mejoras de rendimiento / turbina). Láser y hielo requieren esta rama. Datos en `config.ts`.
- Pantalla propia (tecla T): nodos bloqueados / disponibles / investigados; coste al pasar el ratón.

## Oleadas
Cada `interval` s. Composición por tabla según el número de oleada; vida crece por oleada.
Aparecen en los bordes; más puntos de aparición con el tiempo.

## Decisiones simples (anotadas por el criterio "si dudas, lo más simple")
1. Inventario global compartido entre núcleo y almacenes.
2. ~~Energía global sin cables~~ → sustituida por redes con postes (ver "Electricidad").
   Postes se enlazan solos por distancia; cada edificio va al poste más cercano.
12. Cintas: un único tipo que **sólo se mueve con energía** (más cinta rápida). Sin red no hay movimiento:
    eso es el "modo manual" y lo cubren los Transportistas.
13. Apagón parcial proporcional (no por prioridad de edificio salvo el flag "crítico").
14. Los enemigos atacan infraestructura eléctrica cercana además de lo que les bloquea.
3. Niveles de torreta globales por tipo.
4. Los Constructores llevan ellos mismos los materiales de la obra (los Transportistas abastecen
   fábricas/torretas/generadores y recogen salidas).
5. Desmontaje devuelve el 50 % directamente al almacén cuando acaba.
6. Se permite bloquear el camino; los enemigos rompen lo que les estorba.
7. Investigación paga al empezar; no hay edificio laboratorio.
8. ~~Contratar NPC es instantáneo en el núcleo~~ → no se contrata: la población crece con comida y vivienda.
15. Los NPCs comen del almacén global (no hace falta llevarles comida).
16. Quien se marcha por hambre es el último en llegar; el taller elige mecánicos del rol con más gente.
17. Fábrica de nivel 2 = recetas con `tier: 2`, bloqueadas hasta el árbol (sin edificio aparte por ahora).
18. Daño a edificios: cada enemigo terrestre daña al edificio construido más cercano a ≤ `enemyHitRadius`+0.5
    con `dps × buildingDamageFactor`; a 0 de vida se destruye.
9. Las obras no son sólidas hasta terminarse.
10. Una sola fábrica genérica con receta elegible (incluye fundición).
11. Mantenimiento por desgaste de uso (no por tiempo).

## Menús e investigación con investigador (encargo "menús y árbol con población")
**Qué cambia respecto a la investigación anterior:** antes se pagaba y avanzaba sola (sin edificio ni persona).
Ahora hace falta un **Laboratorio** con **1 investigador** asignado (sacado de la población); sin él, se para.
El coste en paquetes de ciencia se mantiene (se paga al empezar, como antes) y se añade la rama
**Población y comida**. La antigua sección "Investigación" queda sustituida por ésta.

### Menús
- **Menú principal** (capa DOM sobre el mapa isométrico de fondo): nueva partida, continuar (si hay guardado),
  opciones, salir (cierra la pestaña o muestra "puedes cerrar la ventana").
- **Pausa** (Esc): continuar, guardar, opciones, volver al menú. Esc cierra antes cualquier panel abierto.
- **Opciones** (guardadas en `localStorage`): volumen (efectos simples con WebAudio), cuadrícula, velocidad
  (pausa, x1, x2, x3) y lista de controles.
- **Guardado**: `serialize(game)` / `deserialize(data)` en lógica pura (testeado), una ranura en `localStorage`.
- **Construcción por categorías**: Extracción, Transporte, Industria, Energía, Defensa, Población, Servicios.
  Cada elemento: icono, nombre, componentes y atajo; bloqueado → gris con "Requiere: <tecnología>".
- **HUD**: barra superior con población (libres/ocupados), comida, gasolina, energía producción/consumo,
  oleada y cuenta atrás. Alertas: sin comida, apagón, núcleo atacado. Atajos en los tooltips.

### Laboratorio e investigador
- Laboratorio: edificio de Servicios (componentes). Botón "Asignar investigador": toma a una persona
  (del rol con más gente, dejando al menos 1 fuera) y la convierte en **Investigador**; "Liberar" la devuelve
  como Constructor. El investigador no hace otros trabajos.
- Una tecnología a la vez. Ritmo = suma de laboratorios con investigador × energía del laboratorio ×
  productividad por comida (con hambre se para: factor 0). Sin investigador → pausa, se conserva el progreso.
- Si el investigador muere, el laboratorio queda vacío y la investigación se pausa hasta asignar otro.
- Coste de cada nodo: paquetes de ciencia (Ciencia I en nivel 1, Ciencia II después) pagados al empezar
  + tiempo de estudio.
- Desbloqueos reales: edificios, recetas (incluido nivel 2 = "fábrica nivel 2"), mejoras de NPC,
  capacidad de las casas, granjas mejores. (No hay límite de almacén, así que no hay mejoras de almacén.)
- Ramas: Armamento, Defensa, Industria, Logística, Energía y automatización, Ingeniería, Población y comida.

### Tensión de diseño (decisiones)
- Con 3 personas, el taller (2) y el laboratorio (1) dejarían la colonia sin manos: la regla "dejar al menos 1
  fuera" lo impide, y el jugador debe crecer antes (casas + granjas) para poder usarlos sin parar la obra.
- Números orientativos: casa barata (2 bastidores), crecimiento cada 30 s con comida de sobra; el laboratorio
  cuesta poco (bastidores + engranajes) y funciona sin red a la mitad de ritmo, para que sea viable en las
  primeras oleadas; las primeras tecnologías cuestan 2–4 Ciencia I y 20–30 s de estudio.

### Decisiones del equilibrado (P7)
19. Un **Constructor sin obras echa una mano acarreando** (abastecer/recoger) con menos preferencia que sus
    propios trabajos (`jobs.helpPenalty`). Con 3 personas, sin esto el transporte a mano bloqueaba todo.
20. Números: granja 1 comida/4 s (una granja alimenta ~5 personas sin red), crecimiento cada 30 s si hay
    ≥ 15 de comida (cuesta 8), casa = 4 plazas, núcleo = 3. Vida de NPC 55–60. Munición: 1 placa → 6 balas.
    Daño a edificios = 30 % del dps enemigo. Con esto el bot (`npm run sim`) llega a la oleada ~10.

### Gráficos de enemigos (Fase G1)
- Enemigos: sprites de **Tiny Dungeon** (CC0) como figuras de pie (×2; el tanque ×3): normal = limo, rápido = araña, blindado = bestia acorazada, volador = murciélago (con altura de vuelo), tanque = cíclope. Registro en `sprites.ts` (`ENEMY_SPRITES`); los prismas de `shapes.ts` siguen como respaldo si no carga la hoja.
- El pack no trae animaciones: el sprite se voltea según el movimiento en pantalla, se balancea al andar (más rápido cuanto más veloz) y se tiñe de naranja al arder o de azul al ralentizarse.

## Tutorial dentro del juego (encargo "tutorial paso a paso")
Opción **Tutorial** en el menú principal: partida guiada en un mapa pequeño y fijo (semilla fija, `TUTORIAL_CONFIG`
propio en `tutorial.ts`/`config.ts`; el juego normal no cambia), con las primeras oleadas retrasadas hasta completar los pasos clave.

### Motor (lógica pura, sin Phaser)
- `src/game/tutorial.ts` define los **pasos como datos**: `{ id, title, text (clave de texto), done(game, ctx), highlight, grant? }`.
  Los textos están aparte (`src/game/tutorialText.ts`, español) para poder editarlos o traducirlos.
- `TutorialState`: `index`, `completed: Set<id>`, `skipped`. `stepTutorial(game, state)` avanza **sólo cuando `done()` es cierto**
  (estado del juego, nunca un botón "siguiente"); si el jugador ya hizo algo antes de tiempo, el paso se marca cumplido y se
  salta. Se puede **saltar un paso** o **todo el tutorial** y reiniciarlo desde el menú de pausa.
- **Progreso guardado** (`localStorage`, clave propia) y recuperable.
- **Nunca atasca**: cada paso tiene un `grant` que regala o repone el recurso necesario (componentes, gasolina, comida, munición)
  si falta; el tutorial no cambia números del juego principal.
- Test de recorrido completo con un bot, y tests de la máquina (avance, salto de cumplidos, guardado, sin bloqueo).

### Interfaz
- Panel en una esquina: objetivo actual, texto corto, "paso N de M". Resalte: borde brillante en el botón/herramienta,
  flecha sobre la casilla de construcción y atenuación del resto de la pantalla cuando haga falta.
- Menú **Ayuda** siempre accesible (controles y conceptos principales).

### Pasos (se adaptan a lo que existe)
1 cámara y zoom · 2 herramienta y categorías · 3 taladro sobre yacimiento · 4 modo manual (cintas paradas, NPCs a mano, cola
de trabajos) · 5 componentes en fábrica nivel 1 · 6 cintas sin energía · 7 petróleo (bomba, refinería, gasolina) ·
8 generador, postes y cables (las cintas se mueven solas) · 9 población y comida (3 personas, granjas, hambre) ·
10 torreta de balas (munición a mano y automática) · 11 murallas · 12 oleada de prueba fácil · 13 taller (2 trabajadores) ·
14 laboratorio y árbol (investigador) · 15 resumen final y objetivo (sobrevivir N oleadas).
**Dependencias:** los pasos 11, 13 y 14 necesitan murallas, laboratorio e investigador, que aún no están (M1–M7 del encargo de
menús; murallas = fase G2). Hasta entonces esos pasos se definen pero se marcan `available: false` y se saltan solos.

## Interfaz: descripciones, tooltips y menú por categorías (encargo "interfaz confusa")
Sólo capa de interfaz: sin cambiar la lógica ni los números.
- **Fase 1 – descripciones** (`src/game/descripciones.ts`): una entrada por edificio, material y rol. Sólo el texto corto (qué es / para qué sirve) es manual; costes, vida, producción por minuto, consumo, alcance, daño, "se produce en" y "se usa en" se **calculan de `config.ts`** (recetas, costes, munición, combustible). Test: todo tiene descripción y los datos coinciden con config.
  - Decisión: los paquetes de ciencia aún no se gastan en nada (árbol pendiente); su "se usa en" dice "Investigación (árbol de tecnología)" y se rellenará solo con `CONFIG.tech`.
  - Decisión: los costes de rol de `config.npc.roles` son un resto (ya no se contrata) y no se muestran.
- **Fase 2 – tooltips**: ~300 ms de espera, dentro de la pantalla y colocados **encima del menú** sin tapar el botón señalado; coste en verde (tienes) / rojo (falta).
- **Fase 3 – menú por categorías**: Extracción, Transporte, Industria, Energía, Defensa, Población, Servicios; una fila por categoría activa; Q/E o rueda para cambiar; el indicador de casilla va a un sitio fijo y pequeño.
- **Fase 4 – paneles**: ayuda plegable (H o ?), Almacén y NPCs plegables con resumen, materiales agrupados por tipo, sin solapes a distintos tamaños.

### Fase 2 de interfaz — tooltips (hecha)
- Gestor `src/view/tooltip.ts` (cualquier elemento con `data-tip="tipo:id"`), contenido en `src/game/tooltips.ts` y colocación en `src/view/tipPlacement.ts` (las tres, con tests).
- Retardo `CONFIG.ui.tipDelay` = 300 ms; se refresca cada 250 ms mientras se muestra (coste verde/rojo y cantidades al día) y se oculta al hacer clic, usar la rueda, pulsar tecla o salir de la ventana.
- Colocación: menú de construcción → **encima del menú**; Almacén → **a un lado** del panel; HUD → **debajo**. Siempre dentro de la pantalla y sin tapar el elemento señalado (test con muchas combinaciones).
- **Falta / sobra** de un material (decisión simple, números en `CONFIG.ui`):
  - *Falta*: las obras pendientes piden más de lo que hay; o hay 0 y se usa en algo desbloqueado; la comida: hambre o menos de 1,5 min de consumo.
  - *Sobra*: sin obras pendientes que lo pidan y ≥ 8× el mayor coste que lo usa (o ≥ 60 si no se gasta construyendo: mena, munición, gasolina); la comida: ≥ 5 min de consumo.
- Los edificios bloqueados muestran el motivo (`Requiere investigar: <tecnología>` cuando exista en el árbol).
- Pendiente (Fase 3): el indicador "Casilla x,y" (`#info`) aún tapa el menú; pasa a un sitio fijo y pequeño.

### Fase 3 de interfaz — menú por categorías (hecha)
- Siete categorías (datos en `descripciones.ts`, lógica en `src/game/menu.ts`, con tests): Extracción, Transporte, Industria, Energía, Defensa, Población, Servicios. Cada edificio está en exactamente una.
- Menú de dos filas: pestañas (con ‹Q y E›) y **una sola fila de botones** con los de la categoría activa. Cada botón: icono, atajo y nombre; los bloqueados van en gris con 🔒 y su tooltip dice el motivo; pulsarlos explica el motivo en vez de seleccionarlos.
- Atajos: **1–9** eligen por posición dentro de la categoría activa (antes eran una lista plana de desbloqueados); **Q/E** cambian de categoría; la **rueda sobre el menú** también. La rueda sobre el mapa sigue siendo el zoom.
- El indicador "Casilla x,y · altura" pasa a la fila superior del propio menú (ancho fijo, pequeño, con puntos suspensivos): ya no se superpone a nada.
- Iconos: casillas del pack cuando existen; para granja, bomba, refinería, taller, casa y las cuatro torretas se **generan por código** (`GENERATED_ICONS` en `sprites.ts`, cuadrícula 16×16). Test: todo edificio tiene icono.
- Decisión: el panel de Selección sube a `bottom: 110px` para no solaparse con el menú de dos filas.

### Fase 4 de interfaz — paneles (hecha)
- **Columnas laterales** (`#leftcol`: HUD + Almacén; `#rightcol`: NPCs/Cola + Selección): los paneles se apilan dentro de ellas, así que no se solapan entre sí; terminan justo encima del menú inferior (variable CSS `--tbh` con el alto real del menú, actualizada con `ResizeObserver`). `tools/overlap-check.js` comprueba solapes y paneles fuera de ventana; revisado a 1280×800, 1024×700, 800×600 y 640×480 sin solapes.
- **Ayuda plegable**: botón "? Ayuda (H)" y tecla **H**; Esc la cierra primero. Contenido en `src/game/ayuda.ts` (controles y conceptos). La línea de controles ya no está en el HUD.
- **Paneles plegables** (clic en el título; se recuerda en `localStorage`): Almacén, NPCs y Cola de trabajos. Plegados muestran un resumen (`src/game/panels.ts`): materiales y los que faltan, personas/libres/hambre, trabajos y los que esperan.
- **Almacén agrupado** por tipo con un título pequeño: Materias primas, Piezas y componentes, Combustible, Comida (los grupos vacíos no salen).
- Decisión: el resumen "en falta" sólo cuenta lo relevante (lo que tienes, lo que piden las obras pendientes y la comida); al empezar no alarma por materias que aún no se tienen.
- Decisión: el panel de ayuda es una capa superpuesta a propósito (se abre bajo el HUD y se cierra con H/Esc); no entra en la comprobación de solapes.


## Torretas con aspecto de arma (T1)
- Decisión: los packs Kenney Tanks (perfil) y Space Shooter (cenital) no encajan en 2:1; las torretas se construyen por código con un mini-renderizador de sólidos (`src/view/solids.ts`: polígonos convexos extruidos, 3 tonos por cara según la luz, contorno oscuro, orden por profundidad) y modelos en `turretModels.ts` (base fija + cabeza que gira).
- La cabeza se hornea a 16 rumbos y gira hacia el último objetivo disparado; retroceso de 0,12 s. Se mantiene el prisma antiguo como respaldo en `SHAPES`.
- Galería de desarrollo: `/galeria-torretas.html` (zoom y 4/8/16 rumbos). Sólo capa visual: no hay torreta de misiles en la lógica, así que no se modela.
- Niveles: la lógica no tiene nivel por torreta aún; el modelo admite 1–3 (más cañones, blindaje y color) y en juego se usa el 1.

## Primera oleada y guía de inicio (GI)
- Primera oleada a los 300 s (`CONFIG.waves.firstDelay`); las siguientes siguen `interval`. La oleada 1 trae `firstCount` = 2 enemigos normales. El HUD muestra la cuenta atrás en m:ss. "Adelantar oleada" pide confirmación (`window.confirm`) si no hay ninguna torreta colocada.
- La guía de inicio (`guia-inicio.ts`) es un modo ligero en la partida normal y NO reutiliza el motor del tutorial guiado (`tutorial.ts`, partida aparte con recursos repuestos y pasos obligatorios). Son dos modos separados: la guía no repone nada, no bloquea y se evalúa sobre el estado real, así que salta lo ya hecho y admite otro orden.
- Un solo objetivo visible cada vez: el primer paso sin cumplir; los pasos con hora (aviso de oleada a 60 s, oleada en curso) tienen prioridad. Cerrar un aviso lo oculta; desactivar la guía se guarda y no se repite en otras partidas; reabrirla (desde la ayuda) la reinicia.
- Adaptación a lo que existe: no hay azufre ni elección de receta por nivel de fábrica todavía, así que el paso "azufre" es un taladro sobre piedra o carbón; la munición usa la receta actual (placa de hierro). Los textos leen costes y recetas de `config.ts`.
- El bot (`guia-bot.ts`) que sigue la guía tiene torreta con munición hacia el segundo 60 en la semilla 7.
- Vista: aviso fijo en la columna izquierda bajo el HUD (nunca tapa el mapa ni los menús), con ✕ (cerrar aviso), "Saltar guía" (desactiva, guardado) y, en la ayuda (H), "Reiniciar/Activar la guía". El progreso se guarda en localStorage, pero como aún no hay partidas guardadas, una partida nueva reinicia los pasos (sólo se conserva "desactivada"); cuando exista el guardado (M1) el progreso se asociará a la partida.
- Equilibrado (GI5): sin retocar números. Con la guía el bot tiene torreta con munición a ~60 s; el bot simple de `npm run sim` llega a los 300 s con 2 torretas, 80 de munición y el núcleo a 300. La oleada 1 (2 normales) es muy holgada; las siguientes mantienen su ritmo (`interval` 35 s).


## Recetas de fábrica y azufre (R)

Cada fábrica produce **una receta a la vez**, elegida al colocarla o al hacer clic en ella; sin receta no produce y avisa "elige una receta". Las recetas disponibles dependen del nivel (`tier`, hoy fábrica de nivel 1) y de las tecnologías investigadas (`unlockedRecipes`); las no disponibles se ven en gris con el motivo. La refinería usa su propia receta (gasolina). Todo vive en `CONFIG.recipes` (materiales, cantidades, tiempo, categoría).

| Categoría | Receta | Entradas | Salida | Tiempo | Edificio | Nivel |
|---|---|---|---|---|---|---|
| Materiales | Placa de hierro (`iron_plate`) | 1 Mena de hierro | 1 Placa de hierro | 1.5 s | factory | 1 |
| Materiales | Placa de cobre (`copper_plate`) | 1 Mena de cobre | 1 Placa de cobre | 1.5 s | factory | 1 |
| Materiales | Ladrillo (`brick`) | 2 Piedra | 1 Ladrillo | 2 s | factory | 1 |
| Piezas | Engranaje (`gear`) | 1 Placa de hierro | 1 Engranaje | 1.2 s | factory | 1 |
| Piezas | Bastidor (`frame`) | 2 Placa de hierro + 1 Madera | 2 Bastidor | 2 s | factory | 1 |
| Piezas | Cable (`wire`) | 1 Placa de cobre | 2 Cable | 1 s | factory | 1 |
| Piezas | Tubería (`pipe`) | 1 Placa de hierro | 1 Tubería | 1.2 s | factory | 1 |
| Piezas | Circuito (`circuit`) | 3 Cable + 1 Placa de hierro | 1 Circuito | 2.5 s | factory | 2 |
| Piezas | Batería (`battery`) | 1 Placa de cobre + 1 Carbón | 1 Batería | 2.5 s | factory | 2 |
| Piezas | Placa de muro (`wall_plate`) | 3 Placa de hierro | 1 Placa de muro | 2 s | factory | 2 |
| Munición | Munición (`ammo`) | 1 Placa de hierro + 1 Azufre | 6 Munición | 1.5 s | factory | 1 |
| Torretas | Mecanismo de torreta (`gun_part`) | 1 Engranaje + 2 Placa de hierro + 1 Piedra | 1 Mecanismo de torreta | 2.5 s | factory | 1 |
| Construcción | Kit de taller (`tool_kit`) | 2 Engranaje + 1 Bastidor | 1 Kit de taller | 3 s | factory | 1 |
| Combustible | Gasolina (`gasoline`) | 2 Petróleo | 1 Gasolina | 3 s | refinery | 1 |
| Ciencia | Ciencia I (`science_1`) | 1 Placa de cobre + 1 Engranaje | 1 Ciencia I | 4 s | factory | 1 |
| Ciencia | Ciencia II (`science_2`) | 1 Circuito + 1 Ladrillo | 1 Ciencia II | 6 s | factory | 2 |

Decisiones (R):
- **Azufre** (`Ore.Sulfur`, ítem `sulfur`): yacimientos amarillos extraíbles con taladro; ruido propio (se genera después del resto, así las demás menas no cambian con la misma semilla) y parcela garantizada a 7 casillas del núcleo. Munición = placa de hierro + azufre; mecanismo de torreta = engranaje + 2 placas + piedra.
- Búferes: entrada por material = `CONFIG.factory.inputBatches` × lo que pide la receta; salida = `CONFIG.factory.outCap`.
- Cambiar de receta: lo que hay dentro vuelve a la salida (lo recoge un NPC o sale por cinta) y la producción en curso se cancela devolviendo sus entradas (lo más simple).
- Alcanzabilidad: test que comprueba que todas las entradas de recetas y costes de construcción son menas del mapa o salen de otra receta.
- Panel de recetas (R3): se abre al colocar una fábrica o al seleccionarla ("Elegir receta"); categorías Materiales, Piezas, Munición, Torretas, Construcción, Combustible y Ciencia. Las bloqueadas salen en gris con el motivo (sin investigar / nivel de fábrica). Sobre la fábrica: icono del producto y rótulo de estado ("elige una receta", "falta X", "salida llena", "sin energía"). La energía que se muestra es el consumo de la fábrica (`power.demand.factory`) mientras fabrica.
- Equilibrado (R5): sin retocar tiempos; el bot de `npm run sim` (con azufre y piedra) sobrevive 10 min con las semillas 1, 2, 3 y 7 (oleada 9).

## Sketch Town: medir y decidir (Fase 0)
- **Medidas** (PNG 256×352, medidas por píxeles con canvas): cara superior = rombo **2:1 de 232×116** (centro en 128,187); bloque entero 232×219 con ≈103 px de grosor lateral; muros y torres 232×234; árboles 129×179 (pino 130×234); rocas 125×109; vallas 142×118; casa (`building_center`) 232×219 y tejados 231×151.
- **Proyección:** la del pack es exactamente 2:1, igual que la losa del juego (64×32). Opción elegida: **reescalar los sprites** a 0,276 (= 64/232) en lugar de adaptar la proyección al pack. Adaptarla obligaría a ampliar ×3,6 todos los edificios, NPCs, enemigos y cintas. Constantes en `src/view/sketch.ts`.
- **Altura:** el grosor del bloque reescalado es ≈28 px y el relieve del juego sube 16 px por nivel (`Z_STEP`); no se cambia el paso de altura. Se apilarán o se rellenarán por código los huecos laterales entre niveles (Fase 1).
- **Ubicación:** los archivos están dentro del proyecto (`assets-juego/` y la raíz) pero no en `public/`, así que Vite no los servía. Se **copian** (no se mueven) a `public/assets/sketch-town/` (pack 1.0, 348 PNG, 3,4 MB) y `public/assets/sketch-town-expansion/` (236 PNG, 2,1 MB), cada uno con su licencia. Se copian sólo `*_{N,E,S,W}.png`.
- **Terreno de prueba:** `/terreno-prueba.html` (parámetros `ox`, `oy`, `w`, `h`) dibuja piezas reescaladas para valorar el encaje; sólo desarrollo.
- Fases siguientes (terreno con rampas y zonas, murallas con conexiones y daño, decoración y casas, coherencia de estilo) a la espera de visto bueno.

## Transporte, tuberías y guía de cintas/energía/petróleo (encargo "tutorial incompleto")

Reglas (T = transporte):
- **T1. Cintas obligatorias para sólidos.** Taladro → fábrica → almacén, etc. Un edificio de producción (taladro, granja, bomba, fábrica, refinería) **no** pasa material a otro edificio de producción aunque estén juntos: su salida sólo la acepta una **cinta** o un **almacén/núcleo** (el almacén no es producción). Las cintas sí entregan en cualquier edificio que acepte el objeto.
- **T2. Cintas con energía.** Sin energía no se mueven; entonces los Transportistas llevan el material a mano (emergencia). Los NPCs siguen construyendo, reparando, operando, investigando y entregando a mano.
- **T3. Líquidos sólo por tuberías.** `oil` y `gasoline` (`CONFIG.liquids`) no entran en cintas. Edificio nuevo **Tubería** (`pipeline`, coste de la pieza `pipe`): se coloca y gira como una cinta (dirección = sentido del flujo), con capacidad (`CONFIG.pipe.cap`) y caudal (`CONFIG.pipe.rate`, unidades/s). Acepta líquido por detrás y los lados, nunca de frente; un solo líquido a la vez. Los líquidos se sacan de bomba/refinería/tubería sólo hacia una tubería (o, desde una tubería, hacia refinería, generador, almacén). **Las tuberías no consumen energía**; bomba y refinería sí.
- **T4. Arranque sin bloqueo.** El jugador empieza con gasolina (`startItems.gasoline`); un Operario la lleva al generador y lo arranca, así hay energía para bomba y refinería antes de tener gasolina propia.
- **T5. Entradas y salidas visibles.** `puertos(kind,x,y,dir)` (lógica pura, `puertos.ts`) lista cada punto de conexión: casilla, sentido, entrada/salida y medio (sólido, líquido). La vista los dibuja con flecha al colocar, al pasar el ratón y en los pasos de la guía.

Guía (G): pasos reordenados — cintas (tecla 2, arrastrar, R, flechas, completar cuando llega material al destino), energía (generador, gasolina inicial, postes con alcance, HUD 0/0 → produciendo/consumiendo), petróleo (bomba → tubería → refinería → tubería → generador; completar con gasolina recibida), cadena completa (taladro → cinta → fábrica → almacén; munición → cinta → torreta), y los pasos previos. Detección real (cinta con flujo, red con producción > 0, tubería con líquido, refinería produciendo) y **diagnósticos** concretos si se atasca (cinta sin energía, sentido contrario, sin conexión, fábrica sin poste). Todo en lógica separada de Phaser, con tests; números en `config.ts`.

Decisiones simples: la tubería reutiliza `b.inv` para su contenido y `b.craft` no se usa; un solo tipo de tubería (sin válvulas ni bombeo); sin depósito propio (el almacén/núcleo hace de depósito).

## Decoración y zonas de terreno (G4, sólo vista)
- Árboles, rocas, arbustos y flores salen de `generateDecor` (semilla del mapa); **no bloquean la construcción ni se talan** (lo más simple; el bosque que da madera sigue siendo la mena `Wood`). Se excluyen menas, un radio de 5 casillas alrededor del núcleo, 3 en torno a cada aparición y 2 a cada lado de la línea aparición→núcleo; se ocultan bajo cualquier edificio.
- Zonas de terreno: ruido de valor → teñido continuo (tierra seca, hierba, roca grisácea); las menas no se tiñen. Árboles altos pasan a opacidad 0,35 si tapan cursor, fantasma, enemigos o NPCs (misma función `occludes` que los edificios).


---

# Vista 3D (rama `vista-3d`, prototipo)

Decisiones de la Fase 1 (para anotar lo que se eligió ante dudas):
- **No se toca `src/game/`.** `vista3d.html` + `src/view3d/main3d.ts` crean el mismo `Game`, llaman a `game.update(dt)` y leen `buildings`, `npcs`, `enemies`, `world` y `drainEvents()`. Construir desde la paleta HTML usa `game.canPlace` y `game.place`.
- **Proyección:** cámara ortográfica a 30° de elevación (losa 2:1 igual que la 2D), giro en pasos de 90° con animación, zoom con rueda y arrastre para mover (`camera.ts`, con tests). Mundo: x→x, z→y del juego, y→altura; un nivel = 0,5 unidades.
- **Selección con relieve:** rayo avanzado contra las columnas de cada casilla (`pick.ts`, con tests).
- **Terreno:** `ground_grass` a nivel 0, `cliff_block_rock` escalado en altura para niveles 1-2 y `cliff_blockSlope_rock` como rampa cuando una casilla de nivel 1 sólo tiene una vecina más baja. Todo instanciado (un `InstancedMesh` por malla).
- **Agua:** el mundo del juego no tiene casillas de agua, así que no se dibuja. El Nature Kit trae ríos (`ground_river*`, `cliff_waterfall`) listos para cuando la lógica los tenga.
- **Modelos:** un catálogo de datos (`catalog.ts`) con test que comprueba que cada modelo existe. Edificios compuestos por 1-3 piezas; torretas = base `hopper-round` + pivote con `blaster-*` que apunta al enemigo más cercano en su alcance y retrocede al disparar.
- **Colores:** el Nature Kit usa colores de vértice (sin textura) y la hierba sale turquesa; se mantiene tal cual.
- **Pendiente / simplificado:** puertos de entrada/salida (flechas), esquinas de muro, daño visible, partículas, interfaz HTML completa (sólo HUD, paleta y ficha de casilla). La orientación de curvas y cruces de tubería se comprobó a ojo.
- **Demo:** `/vista3d.html?demo=wave` coloca cintas, tuberías, torretas y muros y lanza una oleada; `?auto=0` desactiva el bot; `?speed=4` acelera.

## Fase 2: rendimiento de la vista 3D

**Cómo se mide.** `/vista3d.html?bench=1&map=120&objs=1500&enemies=300&opt=1&auto=0&zoom=0.6`. `bench=1` crea un mapa grande con edificios ya construidos (tiras de cinta, tubería y muro, y edificios sueltos) y enemigos que se mueven; `opt=0` apaga las optimizaciones, `shadows=0` las sombras, `chunk=N` el tamaño de trozo de terreno. En la consola, `__bench(n)` ejecuta *n* frames seguidos esperando a la GPU (`gl.finish`) y devuelve ms por frame, FPS, llamadas de dibujo y triángulos. Se mide así porque con la pestaña oculta `requestAnimationFrame` se frena.

**Qué se hizo.** Terreno instanciado y troceado en chunks (descarte por cámara); edificios estáticos (cintas, tuberías, muros, casas...) agrupados en `InstancedMesh` por malla, material y trozo, reconstruidos como mucho cada 0,3 s; objetos sobre las cintas en un solo `InstancedMesh`; materiales teñidos compartidos (para poder agrupar); personajes fuera de cámara no se animan; con muchos a la vista sólo los 250 más cercanos al centro llevan esqueleto y el resto se dibuja instanciado en pose base. Los modelos ya eran ligeros (de 14 a 280 KB cada uno); no hizo falta tocarlos.

**Resultados** (navegador integrado de la app, GPU del equipo del usuario; ms por frame con GPU sincronizada, ventana ~800x700):

| Escena | Sin optimizar (`opt=0`) | Optimizada | Mejora |
|---|---|---|---|
| Mapa 120x120, 1500 edificios, 300 enemigos | 21,3 ms (47 FPS), 984 llamadas, 1,37 M tris | 13,7 ms (73 FPS), 1036 llamadas, 1,10 M tris | 1,55x |
| Igual, sin sombras | — | 10,7 ms (93 FPS), 512 llamadas, 0,55 M tris | |
| Mapa 80x80, 300 edificios, 1500 enemigos | 64,6 ms (15 FPS), 2977 llamadas | 23,2 ms (43 FPS), 1463 llamadas | 2,8x |
| Partida normal 40x40 (demo con oleada) | — | 2,6 ms (>300 FPS), 270 llamadas | |

Con chunks de 16 casillas salió peor (17,1 ms) que con 32 (13,7 ms): más trozos = más llamadas. Se dejó 32.

**Lo que queda caro.**
- **Sombras:** cuestan ~3 ms con el mapa grande (hay un botón "Sombras").
- **Personajes con esqueleto:** son lo más caro por unidad. A 1500 enemigos, 250 animados y 1250 instanciados en pose base (no animan; giran según su id). Una solución real para hordas enormes sería animación por texturas de vértices (no se hizo).
- **Draw calls:** siguen altas (~1000-1500) porque cada modelo tiene 2-4 mallas por material y chunk; fusionar modelos en un atlas de geometrías las bajaría.
- **Lógica del juego:** ~0,5 ms por frame en todas las pruebas; no es el cuello de botella.
- **Medición:** hecha con la GPU de este equipo y una sola ventana; no se probó en equipos modestos ni en móvil.

## Fase 3: comparación honesta, vista 3D frente a vista 2D

Base de la comparación: la 2D son ~4.150 líneas en `src/view/` (Phaser, sprites de Sketch Town, UI Pack, formas dibujadas por código); la 3D son ~1.600 líneas en `src/view3d/` (Three.js) que ya cubren cámara, terreno, edificios, cintas, tuberías, personajes, torretas, selección y construcción básica. **Ninguna de las dos toca `src/game/`**: leen el mismo `Game`, y por eso se pueden mantener a la vez.

### Aspecto
- **3D gana en:** giro de cámara en 90° (la 2D no lo tiene), relieve real con sombras, personajes animados (andar, parar, golpear; la 2D tiene un solo fotograma por personaje y balanceo por código), torretas con cañón que apunta de verdad, coherencia entre packs (todo es Kenney 3D con una paleta compartida, mientras que en 2D se mezclan Sketch Town, Tiny Dungeon y UI Pack con estilos que no combinan).
- **2D gana en:** legibilidad a distancia y nitidez (los sprites dibujados a mano con contorno se leen mejor que modelos "de juguete" sin contorno), control exacto del orden de dibujado, y un aspecto ya pulido (muros conectados, estados de daño, decoración con reglas, UI integrada).
- **Dudoso:** el color. El Nature Kit usa colores de vértice y la hierba sale turquesa; hay que corregirlo con una paleta o un tinte (es una tarde de trabajo, no un bloqueo). El agua no se ve porque la lógica no tiene casillas de agua.
- **Cosas de 3D que no existen en 2D y habría que decidir:** altura de edificios que tapan lo que hay detrás (hace falta atenuar o recortar al seleccionar), y cinta que cruza por debajo de algo alto.

### Rendimiento
Medido sólo en el equipo de desarrollo (ver Fase 2). Con mapa 120x120, 1.500 edificios y 300 enemigos, 73 FPS (13,7 ms) optimizado; con 1.500 enemigos, 43 FPS; la partida normal 40x40 va a más de 300 FPS. **No se midió la vista 2D con las mismas escenas**, así que no hay cifra honesta para compararlas; Phaser con sprites suele ser más barato por objeto, pero la 2D no tiene hoy ningún mecanismo de agrupado y también tendría que optimizarse con mapas grandes. Lo que sí es cierto: la 3D necesita **WebGL con GPU** y trabajo específico (instanciado, presupuesto de esqueletos, sombras opcionales) para aguantar hordas; la 2D sin ese trabajo ya es fluida con los 40x40 actuales. En equipos modestos las sombras serán lo primero que haya que apagar.

### Peso y empaquetado
- Modelos copiados: ~10 MB en `public/assets/3d/` (se podría recortar a ~6 MB quitando el Nature Kit sin usar). Los sprites 2D actuales pesan ~3,5 MB.
- Three.js añade ~660 KB (minificado) en un paquete aparte `vista3d`; la 2D (Phaser) sigue en `main` (1,5 MB). Si se mantienen las dos vistas, el paquete de Electron crece unos 10 MB.

### Trabajo que queda para igualar a la 2D
Estimación gruesa, ordenada por tamaño:
1. **Interfaz:** reutilizar el HTML/UI Pack de la 2D (paneles, tooltips, guía, tutorial, menú de recetas). La 3D sólo tiene HUD, paleta y ficha de casilla. Es lo más grande, pero es trabajo compartido: la UI de `src/view/ui.ts` está acoplada a Phaser y habría que desacoplarla.
2. **Murallas y esquinas:** conexiones por vecinos, esquinas, puertas y estados de daño.
3. **Puertos de entrada/salida** con flechas (`puertos.ts`), indicadores de energía/tubería y cables.
4. **Retroalimentación visual:** barras de vida, explosiones y humo (partículas), daño visible, ruedas de progreso, iconos sobre edificios.
5. **Cintas:** cruces, empalmes en T y cinta rápida con animación de textura; hoy sólo rectas y esquinas, orientación de piezas comprobada a ojo.
6. **Editor de pruebas y tutorial:** el tutorial señala casillas con la cámara 2D; hay que llevarlo a 3D.
7. **Selección con edificios altos** (atenuar los que tapan) y accesibilidad (zoom mínimo, contraste).
8. **Agua y ríos:** si se quiere, la lógica debe aportar casillas de agua; los modelos ya están.

### Qué se reaprovecha de lo hecho
- Toda la lógica y los tests (`src/game/`): cero cambios, 258 tests en verde.
- `catalog.ts` (tabla de qué modelo es cada cosa, con test de existencia), `camera.ts`, `pick.ts` (ambas puras y con test) y el banco de pruebas (`bench.ts`) valen para cualquier iteración 3D.
- El proyecto 2D sigue intacto: se puede volver atrás sin coste.
- Los modelos 3D pueden servir **también en 2D** renderizados a sprites (turntable de 4 giros), como ya se hace con Sketch Town; sería un camino intermedio.

### Riesgos
- **Alcance:** igualar la 2D en 3D es semanas, no días, sobre todo por la interfaz.
- **Compatibilidad:** WebGL2 con buena GPU; portátiles integrados y navegadores antiguos fallarán antes que con Phaser (que puede caer a Canvas).
- **Legibilidad en juego:** sin contornos, los modelos de pequeños objetos se funden con el terreno; hará falta resaltado (outline) o una paleta con más contraste.
- **Mantener dos vistas** duplica el trabajo de cada función nueva visible (nuevo edificio = sprite + modelo).
- **Licencia/créditos:** todo CC0 de Kenney; sin riesgo, pero ya hay licencias duplicadas en `assets-juego/` (dos packs pisados) que conviene limpiar.
- **Animación a escala:** el truco de instanciar en pose base a distancia no anima; para hordas grandes habría que usar animación en texturas de vértices.

### Recomendación
No sustituir la 2D de golpe. Opciones, de menor a mayor riesgo: (a) quedarse con la 2D y usar los modelos 3D como sprites pre-renderizados (reaprovecha el arte, cero cambio de motor); (b) mantener la 3D como modo opcional "vista 3D" y llevarla a paridad por fases, empezando por la interfaz compartida; (c) migrar del todo, sólo si el giro de cámara y los personajes animados son prioridad de diseño. Mi lectura: el salto de aspecto es real y barato de conseguir (esta rama lo muestra en pocas horas), pero el coste está en la interfaz y el pulido, no en el motor.

---

# Migración a 3D (decisión del 15-11-2026)

El juego pasa a 3D con Three.js; la vista 2D de Phaser se retira cuando `PARIDAD.md` esté completo. Plan por fases en `PROGRESS.md`.
- **Vista 2D congelada:** `src/view/` e `index.html` sólo reciben correcciones graves hasta el final de la migración.
- **Estados de PARIDAD.md:** además de pendiente/hecho se usan `parcial` (existe pero incompleto) y `no existe` (la 2D tampoco lo tiene), para no dar por hecho lo que está a medias.
- **Hallazgos que cambian el plan:** la interfaz 2D ya es HTML/CSS (la Fase 1 es desacoplarla de `shapes.ts`/`sprites.ts`, no reescribirla); no hay guardado de partida, ni menú principal, ni opciones, ni sonido; el árbol de tecnología está vacío (`CONFIG.tech = []`); el tutorial tiene lógica y tests pero no vista en esta rama.
- **No hay `CLAUDE.md`** en el repositorio: se creará en la Fase 7.

## Migración, Fase 1: interfaz
- **Una sola interfaz.** No se reescribió: `vista3d.html` copia el DOM y el CSS de `index.html` y usa el mismo `Hud` (`src/view/ui.ts`), `TooltipManager` y `GuiaView`. Para quitarles Phaser bastó mover `ITEM_COLORS` de `shapes.ts` a `src/view/itemColors.ts` (lo reexporta `shapes.ts`, así la 2D no cambia). Un test recorre los imports desde `main3d.ts` y falla si aparece `phaser`, `GameScene` o `shapes`.
- **Teclas.** Q/E siguen cambiando de categoría (como dice la ayuda); **la cámara gira con Z/C** y con los botones ⟲ ⟳. O abre las opciones. El resto igual que en 2D (R, X, P, H, Esc, 1–9, Mayús + arrastrar).
- **Opciones** (nuevo, `options.ts` con test): sombras, velocidad x1/x2/x4, mostrar rendimiento y reiniciar la guía. Se guardan en `localStorage`. La calidad gráfica llegó en la Fase 6 (ver más abajo); volumen no hay porque el juego no tiene sonido.
- **Pausa:** aviso central con Reanudar, Opciones, Ayuda y Nueva partida; se aparta si hay un panel flotante abierto.
- **Nueva partida:** recarga la página con otra semilla (lo más simple; no hay estado que conservar hasta que exista el guardado).
- **Sin solapamientos:** los paneles flotantes (recetas, ayuda, opciones, avisos) se colocan debajo del alto real del HUD (`--hudh`) y entre las dos columnas. Comprobado por script con todos abiertos a 967×853 y 1024×640.
- **Iconos del menú:** siguen siendo los de la hoja 2D Tiny Factory. Las miniaturas de los modelos 3D quedan anotadas en PARIDAD 3.4.
- **El bot ya no arranca solo:** `?auto=1` lo activa (antes era el modo por defecto del prototipo).

## Migración, Fase 2: aspecto y legibilidad
- **Paleta** (`palette.ts`, con test): el Nature Kit no trae textura, así que al cargar se sustituye el color de cada material por nombre (hierba y hojas verdes, tierra, madera, piedra, agua). Todos los materiales pasan a mate (metalness 0, roughness 1) para que los cinco packs reaccionen igual a la luz.
- **Zonas:** la cara de hierba de cada casilla se tiñe según su recurso (hierro, cobre, carbón, piedra, bosque, petróleo, azufre) con una variación suave por casilla. Arena y roca como zonas propias quedan pendientes: la lógica no las define.
- **Contorno:** se eligió un **pase de bordes por profundidad** en vez del casco invertido, porque vale igual para mallas instanciadas y con esqueleto y cuesta una sola pasada a pantalla completa (~0,4 ms). Usa el laplaciano de la profundidad, que es cero en planos inclinados y alto en siluetas y escalones; por eso también marca los desniveles del terreno. Umbral ajustado a ojo (0,13–0,36 unidades) para que no dibuje las juntas entre casillas. Interruptor en Opciones.
- **Lo que tapa:** en vez de volver semitransparente cada objeto (imposible por instancia), los materiales descartan 3 de cada 4 píxeles dentro de un círculo de 1,7 casillas cuando el fragmento queda por delante del punto de interés. Hay dos puntos: la casilla bajo el cursor (sólo al construir o quitar, o si no se apunta a ningún edificio) y el edificio seleccionado. El suelo nunca se trama. Margen de 1,25 unidades para no tramar lo que está en la propia casilla.
- **Seleccionar:** sin herramienta, un clic elige el edificio de la casilla o, si está vacía, el edificio cuyo cuerpo se ve bajo el cursor (`pickBox`, con test). Con herramienta, siempre manda la casilla, así que se puede construir detrás de algo alto.
- **Personajes tapados:** un disco de color con la prueba de profundidad invertida; sólo se ve si algo oculta al personaje.
- **Cámara:** planos de recorte 1–320 (antes −200–400) para dar más precisión a la profundidad del contorno.

## Migración, Fase 3: construcción y logística
- **Piezas por conexiones** (`pieces.ts`, con tests): cada modelo declara qué lados tiene abiertos (medidos en los vértices del .glb: un borde alto = lado cerrado) y `orient` busca el giro que los hace coincidir con las conexiones. Sustituye a las tablas ajustadas a ojo de la Fase 1.
- **Cintas:** recta (sin entradas o sólo por detrás), curva (una entrada lateral), **T** (detrás + un lado, o los dos lados) y **cruce** (las tres). La cinta rápida usa el modelo rayado en recta y un tinte azulado en el resto.
- **Tuberías:** los codos y cruces del pack están en un plano vertical y no sirven tumbados, así que se componen: tramo recto, o medios tramos hacia cada vecino con un codo esférico. Grosor al 70 % para que no llenen la casilla.
- **Murallas:** los modelos del Factory Kit resultaron ser barandillas, así que son **cajas macizas** con albardilla: medios tramos hacia cada vecino más un poste central (esquina, T, cruz, extremo, suelto). Tres alturas y colores (madera, piedra, metal). El daño (`wallDamage` de la 2D) las baja y oscurece en dos niveles.
- **Puerta — único cambio en `src/game/`:** edificio nuevo `wall_gate` ("Puerta", 2 bastidores + 1 engranaje, 220 de vida). Es sólido para los enemigos, pero `Game.npcPassable` la deja cruzar a la colonia. Va en la categoría Defensa y se desbloquea junto al muro de madera en el tutorial. Tests nuevos en `game.test.ts`. La 2D congelada recibió lo mínimo para no romperse (un aspecto y un icono).
- **Energía:** cables con caída entre postes enlazados (`grid.wires`); el alcance de suministro de cada poste se ve al seleccionarlo y al colocar postes o edificios eléctricos.
- **Torretas:** anillo de alcance al seleccionarlas y al colocarlas (verde si se puede, rojo si no).
- **Puertos** (`puertos.ts`): flecha llena = salida, tenue = entrada; amarillo = sólidos, celeste = líquidos. Se ven en el edificio seleccionado, en el que está bajo el cursor y al colocar.
- **Iconos de estado** (`status.ts`, con tests): marcado para desmontar; fábrica sin receta, falta material, salida llena, poca energía o produciendo (color del objeto); generador sin combustible; torreta sin munición.
- **Transparencia ajustada:** el círculo pasa a 0,95 casillas y se centra a media altura, porque con 1,7 tramaba cintas y objetos bajos que no tapaban nada.
- **Hallazgo:** en la partida normal los muros (y la puerta) están siempre bloqueados: sólo los desbloquea el tutorial. Anotado en PARIDAD.md.
- **Sin hacer:** la cinta parada sin energía no se distingue; el líquido dentro de las tuberías no se ve; falta el aviso general de "sin conexión a la red".

## Migración, Fase 4: unidades y efectos
- **Efectos en pocas mallas** (`effects3d.ts`): humo, fuego, chispas, anillos, proyectiles y barras de vida van en seis mallas instanciadas (una llamada de dibujo cada una). Sin transparencias que ordenar: el humo son poliedros opacos que se encogen al morir (y así reciben contorno, como el resto) y el fuego es aditivo.
- **Partículas puras** (`particles.ts`, con tests): la simulación no depende de Three; tope de 2.400 partículas, las que no caben se descartan y se cuentan.
- **Decisiones de aspecto puras** (`actors.ts`, con tests): animación de NPC y enemigo, modelo por rol, aspecto por nivel y estado de torreta, y fuentes de humo de cada edificio.
- **NPCs:** un modelo por rol con tinte (constructor = obrero con casco, transportista, operaria, mecánico = soldado). Andan, esperan y, si llevan un rato quietos con tarea, trabajan. Lo que llevan se ve como una caja del color del objeto.
- **Enemigos:** la lógica no rellena `Enemy.attacking`, así que **atacan cuando llevan 0,25 s parados**. Ralentizado = tinte azul, paso lento y escarcha; ardiendo = llamas y humo. Al morir caen (animación `die`) y se encogen; máximo 60 caídas a la vez. Los enemigos lejanos instanciados no cambian de pose ni de tinte, pero sí llevan barra, llamas y escarcha.
- **Torretas:** cada tipo tiene color y accesorio propios. **Nivel** = un anillo de color por nivel y cañón un 14 % mayor por nivel. **Estados:** sin munición o sin energía = cabezal gris y caído, más icono; dañada = humo; lista = brillo en la boca (láser, hielo) o llama piloto (fuego).
- **Disparos:** bala trazadora con fogonazo y chispa; láser = haz que se afina con núcleo blanco; fuego = chorro de llamas que se abre y prende el área; hielo = haz pálido, anillo del radio del área y esquirlas. Salen de la boca del cañón y llegan a media altura del blanco (más arriba si vuela).
- **Humo:** fábrica y refinería mientras fabrican, generador en marcha y núcleo siempre; edificios bajo el 50 % de vida humo negro, bajo el 25 % chispas. Los muros no humean (ya tienen estados de daño).
- **Barras de vida:** enemigos y NPCs heridos (verde, amarilla, roja) y edificios dañados (naranja). Los muros no llevan barra.
- **Pausa:** con la partida en pausa, personajes y partículas se congelan.
- **Medición** (mapa 120×120, 1.500 objetos, 250 enemigos con barras, llamas y escarcha, 150 edificios humeando, sombras y contorno): 16,4 ms por fotograma, 1.126 llamadas. La optimización es la Fase 6.
- **Hallazgo:** las torretas de energía (láser, hielo) nunca disparan en la lógica actual (`turretPower` devuelve 0). Sus efectos están hechos y probados lanzándolos a mano.
- **Sin hacer:** los enemigos voladores no tienen animación propia de vuelo; las llamas aditivas se ven pálidas sobre hierba clara.

## Migración, Fase 5: guía, tutorial, guardado y Electron
- **Guardado** (`game/savegame.ts`, con tests): una partida es JSON con la semilla y el tamaño del mapa (el mundo no cambia y se regenera) más `Game.exportState()`. **Cambio en la lógica:** `Game.exportState/importState` y `JobBoard.exportState/importState`. Un test juega 4 minutos con el bot, guarda, restaura y comprueba que las dos partidas siguen idénticas 200 s más (edificios, NPCs, enemigos, cola de trabajos, oleadas).
- **Ranuras:** manual (botón Guardar de las opciones) y autoguardado (cada 60 s reales sin pausa, al ocultar la pestaña y al cerrarla; no se guarda si la partida ha acabado). Cargar recarga la página con `?load=manual|auto` en vez de cambiar la partida en caliente: así no hay estado a medias en la vista.
- **Arranque:** abrir sin parámetros con una partida viva pregunta Continuar o Nueva partida. Nueva partida (y el botón del final) quitan `load` y usan una semilla nueva. En pruebas (`bench`, `demo`, tutorial) no se guarda.
- **Guía de inicio:** el panel y la detección son los de la 2D. Nuevo en 3D: `GuideAids` en `overlay3d.ts` dibuja la flecha que rebota y el marco de la casilla recomendada, los puertos y el alcance de postes de cada paso, la ruta de ejemplo con flechas (celeste si es tubería) y la casilla del problema en rojo. El progreso de la guía va dentro del guardado.
- **Tutorial** (`view3d/tutorial3d.ts`): `?tutorial=1` o botón en las opciones. Panel propio con "Paso N de M", saltar paso o tutorial y resalte azul de la herramienta o panel. Gestos que anota la vista: mover la cámara (> 0,5 casillas), zoom y elegir herramienta. La guía de inicio se apaga mientras dura. Decisión simple: el tutorial siempre empieza desde cero y no se guarda (su partida no es persistente).
- **Electron:** `electron/main.cjs` abre `vista3d.html` por defecto (`ELECTRON_PAGE=index.html` para la 2D) y activa `ignore-gpu-blocklist` para WebGL2 en gráficas antiguas. `localStorage` persiste porque se sirve por `app://` (ya estaba). **No lo he podido probar en una ventana de Electron en esta sesión.**
- **Sin hacer:** menú principal con pantalla propia; las casillas de ruta y del problema se tapan detrás de árboles altos (sólo las flechas y la flecha rebotando se ven siempre).

## Migración, Fase 6: rendimiento y compatibilidad

**Niveles de calidad** (`src/view3d/quality.ts`, puro y con tests). En Opciones: Auto, Baja, Media o Alta. Se aplican en caliente con `View3D.setQuality`, sin recargar.

| | Baja | Media | Alta |
|---|---|---|---|
| Tope de píxeles por píxel de pantalla | 1 | 1,5 | 2 |
| Suavizado de bordes (muestras) | 0 | 2 | 4 |
| Sombras | no | sí, mapa de 1024 | sí, mapa de 2048 |
| Contorno de objetos | no | sí | sí |
| Partículas que se crean | 40 % | 70 % | 100 % |
| Personajes con esqueleto animado | 80 | 150 | 250 |

- Elegir un nivel pone sus sombras y su contorno; después se pueden cambiar sueltos (p. ej. Baja con contorno).
- **Auto** (por defecto) empieza en Alta y **sólo baja**: si la media de FPS reales se queda por debajo de 30 durante 5 s seguidos baja un nivel y avisa con un mensaje. Espera 3 s tras arrancar y tras cada bajada; no mide con la pestaña oculta, en pausa, a velocidad x2/x4 ni en el banco de pruebas. El nivel alcanzado se guarda, así que no se repite la prueba en cada arranque; volver a pulsar Auto empieza otra vez desde Alta.
- Si el navegador dibuja por software (SwiftShader, llvmpipe, "Basic Render Driver"), Auto arranca directamente en Baja.
- El suavizado ya no lo pone el lienzo sino la textura intermedia del pase de contorno (así se cambia sin recrear el contexto). Sin contorno y sin suavizado se dibuja directo a pantalla, que es lo más barato.
- Los anillos de efecto (hielo, explosiones) no se recortan con la densidad de partículas porque marcan zonas de juego.
- Se quitó `PCFSoftShadowMap`: three 0.187 ya no lo tiene y avisaba en consola en cada arranque; las sombras son PCF en todos los niveles.
- `?quality=low|medium|high` fuerza un nivel sin guardarlo. Con "Mostrar rendimiento" el HUD enseña FPS, ms por fotograma, llamadas, triángulos, tamaño del búfer y nivel.

**Compatibilidad.** Antes de crear la escena, `detectGl` prueba a abrir WebGL2. Si no se puede, en lugar de quedarse en "Cargando modelos…" sale un aviso a pantalla completa que distingue "no hay WebGL" de "sólo hay WebGL1", con tres pasos (actualizar navegador, activar aceleración por hardware, actualizar controlador) y un botón para reintentar. El mismo aviso cubre un fallo al crear el renderizador y la pérdida del contexto gráfico a mitad de partida (pausa el juego y pide recargar; el autoguardado es de cada minuto). `?nowebgl=1` y `?nowebgl=2` simulan los dos primeros casos.

**Mediciones** (`__benchQuality(n)` en la consola: `n` fotogramas por nivel con la GPU sincronizada). Equipo del usuario, Radeon RX 570, navegador integrado, búfer de 1280×800:

| Escena | Baja | Media | Alta |
|---|---|---|---|
| Mapa 120x120, 1500 edificios, 300 enemigos | 9,8 ms (102 FPS), 595 llamadas, 0,57 M tris | 12,3 ms (81 FPS), 1187 llamadas, 1,07 M tris | 13,6 ms (74 FPS), 1187 llamadas, 1,07 M tris |
| Mapa 80x80, 300 edificios, 1500 enemigos | 12,2 ms (82 FPS), 478 llamadas | 14,3 ms (70 FPS), 1242 llamadas | 17,1 ms (58 FPS), 1642 llamadas |
| Partida normal 40x40 (demo con oleada) | 2,5 ms (405 FPS), 166 llamadas | 3,9 ms (259 FPS), 336 llamadas | 3,7 ms (272 FPS), 336 llamadas |

Alta coincide con la cifra de la Fase 2 (13,7 ms), así que mover el suavizado al pase de contorno no ha costado nada. Baja es entre 1,4x y 1,5x más rápida que Alta; casi todo viene de quitar las sombras (la mitad de llamadas y de triángulos). En la partida normal Media y Alta empatan: la diferencia está dentro del ruido.

**Lo que estas cifras no dicen.**
- La pantalla de la prueba tiene 1 píxel real por píxel, así que **el tope de resolución no ha actuado**: en un portátil de pantalla densa la diferencia entre niveles será mayor que la de la tabla, pero no está medida.
- Sólo hay un equipo, con gráfica dedicada. **No se ha probado en gráfica integrada, ni en Electron, ni en otro navegador.**
- La bajada automática está cubierta por tests, pero no se ha visto actuar en el juego porque este equipo nunca baja de 30 FPS. Tampoco se ha provocado una pérdida real de contexto gráfico.
- La calidad Baja pierde el contorno, que ayuda a leer el mapa; se puede volver a activar suelto.

## Migración, Fase 7: cierre de paridad y retirada de la 2D

**Decisión del usuario:** antes de borrar la 2D, llevar a "hecho" las 15 líneas de `PARIDAD.md` que estaban en parcial o pendiente. Cómo quedó cada una:

- **Zonas de terreno.** Las casillas sin recurso se tiñen por zona con el mismo ruido y umbrales que la 2D (`zoneWeights` en `decor.ts`): arena o tierra seca, hierba y roca, con transición continua. En 3D el tinte es un multiplicador en color lineal que puede pasar de 1 (`zoneMultiplier`), porque multiplicar el verde de la hierba por un color normal nunca da arena.
- **Decoración.** Ya no hay regla propia de la 3D: sale de `generateDecor` (determinista por semilla; nunca sobre menas, a 5 casillas del núcleo, a 3 de las apariciones ni a 2 del pasillo recto hasta el núcleo). Cada tipo de `decor.ts` tiene su modelo. Sigue sin bloquear: se esconde al construir encima, ahora en toda la huella del edificio. No reaparece al desmontar (igual de simple que antes).
- **Apariciones y ruta** (`threat3d.ts`). Bandera roja con disco en cada punto de aparición y un punto rojo por casilla de la ruta prevista; sólo se rehace cuando cambia `game.flowVersion`.
- **Cintas paradas.** La cinta sin energía se oscurece y lleva un piloto rojo intermitente en el borde; el texto de la casilla lo dice. No lleva icono flotante: al principio todas las cintas están paradas y habría uno por casilla.
- **Sin conexión a la red** (`offGrid`). Aviso rojo en consumidores sin poste. Regla para no llenar el mapa de avisos: mientras no exista ninguna red sólo avisa lo que no hace nada sin energía.
- **Desgaste.** Engranaje amarillo por debajo del 50 % (rinde la mitad) y rojo a 0 (averiado). El porcentaje sigue en la ficha.
- **Obra.** Barra azul de progreso sobre el edificio a medio levantar.
- **Temblor de cámara** al golpear el núcleo: 0,14 s, en el plano de la pantalla.
- **Objetos en cintas.** Forma por familia (terrón, tronco, losa, disco, cilindro, caja) con el color del objeto; una malla instanciada por forma.
- **Iconos del menú.** Miniaturas de los propios modelos, dibujadas al arrancar a una textura (`View3D.thumbnails`). Los iconos del pack quedan de respaldo.
- **Modelos provisionales.** Poste (antes una chimenea) y batería (antes un depósito igual que la bomba) se hacen con cajas y cilindros (`prim` en `catalog.ts`); el alimentador se distingue de la base de las torretas (tinte y caja encima) y la casa del generador (tinte claro).
- **Galería.** `?galeria=1` enseña todos los edificios y las torretas en sus 3 niveles con el mismo código del juego.
- **Opciones.** El volumen sale de la línea de opciones y se anota aparte como "no existe": no hay sonido.
- **Electron.** Prueba de humo (`ELECTRON_SMOKE`): abre el build por `app://`, guarda captura y resumen. Resultado: arranca, 144 FPS, sin errores de consola.

**Qué se borró.** Phaser (dependencia), `src/main.ts`, `GameScene.ts`, `shapes.ts`, `solids.ts`, `turretModels.ts`, `decorView.ts`, `gallery.ts`, `terrenoPrueba.ts`, `sketch.ts`, `iso.ts`, sus tests, `galeria-torretas.html`, `terreno-prueba.html` y los sprites de Sketch Town y Tiny Dungeon de `public/assets`. `muros.ts`, `decor.ts` y `sprites.ts` se quedan sólo con lo que usa la 3D. `index.html` redirige a `vista3d.html` conservando los parámetros. Los tests bajan de 289 a 260 porque se van los de la 2D.

**Lo que no se ha hecho o no se ha comprobado.**
- El instalador (`npm run dist`) no se ha regenerado ni probado; sólo el build abierto con Electron.
- El aviso de "sin conexión a la red" y el de desgaste están cubiertos por tests y el desgaste se vio en pantalla forzando el valor; no se han visto aparecer en una partida larga.
- Las carpetas de packs descargados de la raíz (`assets-juego/`, `Tiles/`, `Map/`, `Tilemap/`) no se han tocado: el juego no las carga, pero borrarlas es decisión aparte.
- Siguen pendientes de lógica (no de vista): árbol de tecnología vacío, torretas de energía que no disparan, sonido y menú principal.

## Rediseño de las torretas 3D

Encargo del usuario (15-11-2026): las torretas 3D no gustan; las de la vista 2D tenían mucho más carácter. Se rediseñan por hitos, **sólo capa visual** (ni lógica ni números). La referencia 2D está en el tag `v-2d-final` (último commit con la 2D, `b0077c6`): `git show v-2d-final:src/view/turretModels.ts` y `solids.ts`. Capturas lado a lado en `docs/torretas/` (`2d-*.png` son las 2D por tipo, nivel y 4 rumbos; `3d-antes-galeria.png` son las 3D de partida).

### Qué hacía buenas a las torretas 2D
- **Base con volumen y detalle:** plataforma hexagonal achaflanada en dos escalones, franja de color del tipo en el borde (más ancha con el nivel), remaches en las esquinas, pedestal cilíndrico y un aro giratorio oscuro. En nivel 3 salen refuerzos en los cuatro lados.
- **Una cabeza que gira, separada de la base:** el cuerpo es una pirámide truncada (caras inclinadas) en dos pisos, con rendijas de refrigeración y mirilla con lente.
- **Armas con varios tramos:** culata/cuna, camisa, tubo y freno de boca (en las de balas), no un único prisma. Siempre se ve hacia dónde apunta.
- **Una silueta distinta por tipo**, reconocible incluso en negro:
  - balas: cañones dobles o triples, cajón de munición verde oliva con cinta de balas de latón;
  - láser: cristal alto y puntiagudo en magenta, aletas disipadoras detrás, bobinas de cobre a lo largo del cañón;
  - fuego: dos o tres depósitos cilíndricos altos y rojizos, tuberías, boquilla abocinada con brasa y pilotos rojos;
  - hielo: racimo de cristales azules, tubos de refrigerante y boca ancha escarchada.
- **Los niveles cambian el modelo:** más cañones (2 → 3), cañón más largo, placas laterales de blindaje (nivel 2) y cajón de munición doble (nivel 3), cristal o depósitos extra, franja de base más ancha, color de acento que sube de latón a naranja y a rojo.
- **Paleta común:** acero gris azulado para todo lo estructural y **un solo color de acento por tipo**; contorno oscuro en todas las caras y sombreado por cara.
- **Animación y estados** (ya replicados en 3D): cabeza con 16 rumbos, retroceso, fogonazo, brillo propio de cristales y lentes, tinte gris apagado, humo dañada y translúcida en obra.

### Qué falla en las 3D actuales (ver `3d-antes-galeria.png`)
1. **Todas son la misma maceta.** La base es un cono facetado invertido (embudo) que ocupa más de la mitad de la altura y no tiene ni placa, ni pedestal, ni remaches: parece un macetero, no una base de artillería.
2. **El arma es pequeña y suelta.** Un único blaster de Kenney apoyado en el borde, sin culata, sin soporte, sin camisa: "un palo con un cubo". Las proporciones están al revés (base enorme, arma diminuta).
3. **Sin silueta propia por tipo.** Las cuatro son embudo + arma; sólo cambian el color del embudo y un accesorio de pocos píxeles. A zoom alejado se distinguen por el tono, no por la forma.
4. **Faltan los rasgos que definían a cada tipo en 2D:** cañones múltiples y cinta de munición (balas), cristal y bobinas (láser), depósitos y tuberías altos (fuego), racimo de cristales y tubos (hielo).
5. **Los niveles apenas se notan:** un anillo de color más y un 14 % de escala en el cañón; el modelo no cambia.
6. **Sin jerarquía de piezas:** no hay cuerpo giratorio con paneles y chaflanes entre la base y el arma; todo gira como un único bloque pequeño.
7. **Paleta sin acento coherente:** el embudo azul de láser y hielo es casi igual; el de balas es violeta (no gris) y no se parece al resto de metal del juego.

### Reglas de diseño que seguimos
1. **Varias piezas con jerarquía:** base (placa + pedestal + aro) → torreta giratoria (cuerpo con chaflanes y paneles) → arma de varios tramos (culata, camisa, tubo, boca) → accesorios (cajón, depósitos, radiadores, antena, luces). Nada de un arma suelta sobre un cuerpo liso.
2. **Proporciones de la 2D:** base baja y ancha (≈ 30 % de la altura), torreta y arma ocupan el resto; el arma sobresale claramente de la casilla por delante.
3. **Materiales y piezas:** piezas del pack de armas de Kenney (cañones, culatas, miras, cargadores, silenciadores), del kit de fábrica y del industrial (tuberías, depósitos, engranajes, pistones, soportes) y, para lo que falte, primitivas (`prim`) con chaflán o biselado. Se reutiliza el sistema de partes de `catalog.ts`.
4. **Silueta y color por tipo:** un color de acento por tipo sobre acero común; la silueta debe leerse en negro. Balas: cañones múltiples + cajón; láser: cristal + bobinas + aletas; fuego: depósitos altos + boquilla ancha; misil: rack de tubos inclinados; hielo: cristales + tubos.
5. **El nivel cambia el modelo:** más cañones, blindaje, tamaño y detalles nuevos en cada nivel; el color de acento sube con el nivel.
6. **Contorno y sombreado:** se usa el pase de contorno ya existente; las piezas de color (cristales, lentes, brasas) llevan material propio que brilla.
7. **Se lee a zoom alejado:** cada hito se revisa también a zoom 0,5 y desde los 4 giros de cámara.
8. **Animación:** sólo gira la torreta (no la base); retroceso del arma; fogonazo; brillo de cristales según carga; llama piloto; humo si está dañada. Estados: apagada (luces rojas, tinte gris), en obra (translúcida), dañada (humo).

### Decisiones (si dudas, lo más simple)
- **Misil:** la lógica no tiene torreta de misiles (ni se toca). El modelo del hito 3 se hará y se verá en la galería, pero **no se puede colocar en partida** hasta que exista el tipo en `config.ts`.
- **Hielo:** sí existe en la lógica; entra en el hito 3 con el misil.
- Las tres imágenes `2d-*.png` se sacaron con `tools/captura.cjs` (Electron) contra la galería 2D del tag; no se versiona ningún servidor 2D.

### Hito 1: torreta de balas de referencia (hecho, pendiente de aprobación)
Código en `src/view3d/turrets3d.ts` (`buildTurret(tipo, nivel)`, con tests); la escena y la galería usan el mismo constructor. Fotos en `docs/torretas/`: `comparacion-balas.png` (2D arriba, 3D abajo, tres niveles), `angulos-balas.png` (4 giros × 3 niveles), `3d-balas-alejado.png` (zoom alejado), `3d-balas-disparo.png` (disparo), y las sueltas `3d-balas-n<nivel>-<giro>.png`.

**Cómo está hecha (≈ 40 piezas en el nivel 1):**
- **Base fija:** placa inferior y placa superior achaflanadas, franja de color de acento entre las dos, cuatro remaches, pedestal cilíndrico, plato intermedio y aro giratorio oscuro. Cuarta parte de la altura total.
- **Torreta giratoria (`head`):** cuerpo octogonal, franja de acento, cúpula troncocónica de acero claro con tres rendijas de refrigeración, mirilla lateral con lente cian que brilla, contrapeso trasero y cuna delantera.
- **Arma (`gun`, lo único que retrocede):** dos cañones con tubo, camisa, dos collares, freno de boca y banda de acento. La boca queda a 0,84 casillas del eje (0,94 en niveles 2 y 3), así que asoma por delante de la casilla como en la 2D.
- **Cajón de munición** verde oliva a un lado, con tapa de acento y cinta de balas de latón que sube hasta la recámara.
- **Niveles:** 2 = cañones más largos, blindaje lateral y acento naranja; 3 = tercer cañón, segundo cajón de munición, cuatro refuerzos en la base, cuerpo más oscuro y acento rojo. El nivel se ve a zoom alejado por el color de la franja y por el número de cañones.
- **Estados** (los mismos que el juego): apagada = tinte gris y cabeza caída; en obra = translúcida y más baja; dañada = humo. Disparo = retroceso del arma, fogonazo y trazadora desde la boca real del cañón.

**Decisiones (si dudas, lo más simple):**
- **No uso los blasters de Kenney para las balas.** Son pistolas de juguete de plástico de colores vivos (ver `docs/torretas/piezas-armas.png`): con ellas el resultado volvía a parecer un juguete sobre una maceta. Cañones, camisas, collares, frenos de boca y cajones se hacen con primitivas biseladas (`bevelBox`, cilindros, prismas octogonales). Los packs de Kenney se reservan para los tipos que lo pidan (depósitos, tuberías y bobinas del fuego y el láser).
- Un único acero común (`STEEL*`, `GUNMETAL`) y un solo color de acento por tipo y nivel (latón → naranja → rojo).
- El contorno es el pase de contorno del juego; no hay casco invertido. Las primitivas llevan material plano compartido por color, así que se siguen agrupando y se tiñen igual que el resto.
- El alcance del nivel 3 y los números de daño no se tocan: sólo cambia el modelo.
- Los otros tres tipos (láser, fuego, hielo) siguen con el aspecto anterior (`legacyRig`) hasta los hitos 2 y 3; en la galería llevan una ★ los ya rediseñados.

**Galería** (`/galeria-torretas.html` con el servidor de desarrollo): parrilla de tipos × niveles sobre losas de 1×1 para ver la escala real; cámara orbital (arrastrar = girar, rueda = zoom, botón derecho = desplazar); botones de estado, 4 giros de cámara, zoom parrilla/alejado/cerca, **Disparar**, **Auto** (dispara una vez por segundo) y **Apuntar** (fija la dirección). Filtros por dirección: `?tipo=turret_bullet`, `?nivel=2`, `?limpio=1` (sin interfaz). Para capturas hay un puente `window.__gal` (`view`, `focus`, `state`, `fire`, `aim`, `render`) y `tools/captura.cjs` (Electron, `CAP_URL`/`CAP_SHOTS`, ver el propio archivo).

**Lo que falta de este hito / sin comprobar:** no se ha visto dentro de una partida larga (sí en la galería y en la escena de demostración); la torreta de balas aún no tiene humo propio de la cinta de munición ni de casquillos; a zoom alejado se distingue por silueta y acento, pero no se ha medido con una oleada completa. Esperando tu visto bueno antes de seguir con láser y fuego.

### Hito 2: láser y lanzallamas (hecho)
Misma base y proporciones que las balas (`makeBase`, compartida por todos los tipos) y silueta propia. Fotos: `comparacion-laser.png`, `angulos-laser.png`, `3d-laser-alejado.png`, `3d-laser-disparo.png` y sus equivalentes `-fuego` en `docs/torretas/` (se generan con `node tools/fotos-torreta.cjs <tipo> <nombre>`).
- **Láser:** chasis esbelto azul acero con franja cian; **cristal alto y facetado** (engarce, punta cian y núcleo casi blanco; crece con el nivel) que es lo que lo distingue de lejos; **aletas disipadoras** detrás (4, 5 y 6); dos **cables** del cristal al cañón; **cañón con carcasa, alma, bobinas de cobre** (4, 5 y 6 por cañón) y **lente cian** que brilla en la boca. Nivel 2: blindaje lateral, cristal y cañón mayores. Nivel 3: cañón doble.
- **Lanzallamas:** cuerpo negro con franja naranja; **depósitos de combustible cilíndricos y altos** de color teja (2, 2 y 3), con abrazaderas, tapa, válvula y una ventanilla naranja de nivel; dos **tuberías** a la boquilla; **boquilla abocinada** negra con brida naranja y **brasa** que brilla dentro; **pilotos rojos** y llama piloto amarilla. Nivel 2: blindaje y boquilla más larga. Nivel 3: tercer depósito, más alto, y boquilla doble.
- **Decisión de color del láser:** el encargo pide "azul o cian" y la 2D era magenta. Gana el encargo: el láser pasa a cian (`TURRET_COLOR.turret_laser = 0x45e0ff`, que también tiñe el haz y el brillo de la boca) y las bobinas de cobre dan el contraste. El hielo (hito 3) se distinguirá por los cristales y tubos, y llevará un blanco azulado más pálido.
- **Ajuste tras ver la primera foto:** el cañón láser salió parecido a un palo; se engrosó (carcasa, alma y bobinas más gruesas), se acortó y las aletas pasaron a placas gruesas.
- **Sin comprobar:** los efectos de disparo (haz y llama) siguen siendo los de antes; se rehacen en el hito 5. No se ha visto en una oleada completa.

### Hito 3: hielo y misil (hecho)
Fotos: `angulos-hielo.png`, `comparacion-hielo.png`, `3d-hielo-*`, `angulos-misil.png`, `3d-misil-*` en `docs/torretas/`.
- **Hielo:** cuerpo azul acero con franja blanco hielo; **racimo de cristales azules** detrás (4, 5 y 6) de distinta altura e inclinación, alternando dos azules que brillan; **tubos de refrigerante** blancos con abrazaderas; boca ancha de acero con **seis carámbanos** alrededor y resplandor blanco dentro. Nivel 2: blindaje y boca más larga. Nivel 3: boca doble. Se distingue del láser por el racimo (muchos cristales, no uno solo) y por la boca ancha.
- **Misil (sólo galería):** cuerpo verde militar con franja verde amarillenta; **rack de tubos inclinado 29°** hacia arriba con las **cabezas rojas** de los misiles asomando (2, 4 y 6 tubos), banda blanca y brida de acento; antena con plato rojo (más grande en el nivel 3). La lógica **no tiene torreta de misiles** (`Object.keys(CONFIG.turrets)` no la incluye): el modelo existe (`MODEL_KINDS`, `GALLERY_ONLY`) y se ve en `/galeria-torretas.html`, pero no se puede construir hasta que se añada el tipo a `config.ts` y `game.ts` (decisión de lógica, fuera de este encargo).
- **Limpieza:** ya ningún tipo usa el aspecto anterior; se quitan `legacyRig`, `TURRET_GUN` y la precarga de los blasters de Kenney (menos modelos que cargar al arrancar).

### Hito 4: niveles, estados y animaciones (hecho)
Fotos: `estados.png` (los cinco tipos en cada estado), `en-juego.png` (en la escena real con una oleada) y las hojas por tipo ya mencionadas (`angulos-*`, que enseñan los tres niveles).
- **Niveles.** Cada nivel cambia el modelo, no sólo el color (ver los hitos 1-3): más cañones, depósitos, cristales o tubos, blindaje lateral, bocas más largas, refuerzos en la base y color de acento propio en las balas (latón, naranja, rojo).
- **Animaciones** (`animateRig` en `turrets3d.ts`, compartida por el juego y la galería, con tests): la torreta gira hacia el objetivo; el arma retrocede al disparar; **los cristales laten** (láser y hielo) mientras la torreta está lista y se encogen al apagarse; **brillos puntuales** en lentes, cristales y boca (`halos`, en coordenadas de la torreta, así que giran con ella); **pilotos rojos que parpadean** en el lanzallamas y la antena del misil; **llama piloto** del lanzallamas en la boquilla. Sustituye al brillo de boca que antes se calculaba aparte en la escena.
- **Estados:**
  - *Sin munición ni energía* (`turretState` ≠ `ready`): cabeza caída, tinte gris (cristales y lentes también) y una **luz roja intermitente** en la base, detrás del pedestal, que no se tiñe. A la vez sale el icono de estado de siempre.
  - *En construcción*: modelo translúcido y bajo, con un **andamio de madera** (cuatro postes, dos pisos de travesaños y diagonales; `scaffold`).
  - *Dañada* (< 50 % de vida) y *muy dañada* (< 25 %): **grietas y manchas de quemadura** en la base y la torreta; la muy dañada suma más grietas, un agujero y una chapa suelta en la cúpula. El humo y las chispas siguen siendo los de siempre (`smokeSources`). El aspecto entra en la firma del edificio (`|D0/1/2`), así que se rehace al cruzar cada umbral.
- **Galería:** estados normal, apagada, en obra, dañada y muy dañada; `tools/fotos-estados.cjs` genera la hoja.
- **Sin comprobar:** el parpadeo de la luz roja se ve mal en una foto fija (depende de la fase); las grietas son pequeñas y se leen sólo de cerca. Los efectos de disparo siguen siendo los anteriores (hito 5).

### Hito 5: efectos de disparo y pulido a zoom alejado (hecho)
Fotos: `disparos.png` (los cinco tipos en tres instantes), `alejado-todas.png` (galería a zoom 0,62), `alejado-juego.png` (partida a zoom 0,5).
- **Un efecto propio por tipo** (`Effects.shot`, con test): *balas* = trazadora con fogonazo y **casquillo de latón** que sale de lado y cae; *láser* = haz cian que se afina con núcleo blanco, **destello de carga** en la boca y **onda** en el impacto; *lanzallamas* = **bola de fuego en la boquilla**, ascuas, chorro de llamas y humo; *hielo* = **niebla helada** en la boca, pulso pálido, dos anillos en el área y esquirlas; *misil* = **nube de humo y destello** en el rack, misil (cuerpo blanco y cabeza roja) que sube en **arco** dejando **estela de humo y llama**, y **explosión** al llegar.
- **Misil:** su efecto vive en `effects3d.ts` y se ve en la galería; no se dispara en partida porque la lógica no tiene la torreta (`MISSILE_COLOR` está aparte de `TURRET_COLOR`, que sigue siendo sólo de los cuatro tipos del juego).
- **Zoom alejado:** a zoom 0,5-0,6 se distinguen por la **placa de la base**, que ahora lleva una franja de acento más ancha y gruesa (cian láser, naranja lanzallamas, blanco hielo, verde misil, y latón, naranja o rojo en las balas según el nivel) y por la silueta (cristal en punta, depósitos altos, racimo de cristales, rack inclinado, cañones). Se midió a ojo; con muchos árboles alrededor sigue siendo lo más difícil de leer, y para eso están el icono de estado y el alcance al seleccionar.
- **Galería:** `window.__gal.pause(true)` congela el bucle para capturas deterministas (`tools/fotos-disparos.cjs`).
- **Fin del rediseño:** los cinco tipos, sus tres niveles, estados y animaciones están hechos. Sin comprobar: una oleada larga con muchas torretas a la vez (coste de dibujo de las piezas nuevas: cada torreta ronda 40-60 mallas y no se agrupan porque giran; con unas pocas decenas va sobrado, pero no se ha medido con cientos).
