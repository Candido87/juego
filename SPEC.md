# SPEC — Fábrica isométrica con defensa

Juego de fábrica + defensa en vista isométrica 2D. TypeScript, Phaser 3, Vite, Vitest.
Sin backend ni assets externos.

## Arquitectura
- `src/game/*`: lógica pura (sin Phaser ni DOM). Se puede simular sin gráficos (`npm run sim`).
  - `config.ts`: **todos** los números (costes, daños, tiempos, velocidades, árbol, oleadas).
  - `types.ts`, `world.ts` (mapa), `iso.ts` (matemática isométrica), `path.ts` (rutas),
    `game.ts` (estado y sistemas), `jobs.ts` (cola de trabajos), `npc.ts` (NPCs), `bot.ts` (jugador automático).
- `src/view/*`: Phaser + DOM. Sólo lee el estado y envía comandos (`place`, `remove`, `hire`, `research`...).
  - `shapes.ts`: único archivo con el aspecto de todo (prismas isométricos generados por código).

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
