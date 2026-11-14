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

## Energía
Red global sin cables (decisión simple): generadores queman carbón y llenan una batería global;
capacidad = base + acumuladores. Láser y hielo gastan energía por disparo. Sin energía no disparan.

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
- Ramas: Armamento, Defensa, Industria, Logística, Ingeniería (datos en `config.ts`).
- Pantalla propia (tecla T): nodos bloqueados / disponibles / investigados; coste al pasar el ratón.

## Oleadas
Cada `interval` s. Composición por tabla según el número de oleada; vida crece por oleada.
Aparecen en los bordes; más puntos de aparición con el tiempo.

## Decisiones simples (anotadas por el criterio "si dudas, lo más simple")
1. Inventario global compartido entre núcleo y almacenes.
2. Energía global sin cables.
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
