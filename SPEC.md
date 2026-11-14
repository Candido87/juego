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

## Recursos y piezas
- Menas del mapa (taladro encima): hierro, cobre, carbón, piedra, bosque (madera).
- Piezas: placa de hierro, placa de cobre, engranaje, munición (balas), componente (circuito),
  ladrillo, batería, placa de muro (metal), paquete de ciencia I y II.
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
- Se contratan en el núcleo pagando piezas. Tienen vida, velocidad y capacidad de carga (mejorables en el árbol).
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
8. Contratar NPC es instantáneo en el núcleo.
9. Las obras no son sólidas hasta terminarse.
10. Una sola fábrica genérica con receta elegible (incluye fundición).
11. Mantenimiento por desgaste de uso (no por tiempo).
