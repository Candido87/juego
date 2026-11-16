# Hito 0 — diagnóstico de las tuberías

Mapa de pruebas: `/vista3d.html?demo=tuberias&waves=0` (código: `src/view3d/demoTuberias.ts`; mundo plano 40×40 con un resalte de un nivel).
Captura: `mapa-pruebas.jpg`. Tabla generada con `npx vite-node docs/tuberias/tabla.ts`; prueba de la causa 1 con `npx vite-node docs/tuberias/evidencia.ts`.

## Causas (por orden de importancia)

1. **La vista y la lógica no se ponen de acuerdo sobre qué está conectado.** En la lógica una tubería tiene dirección
   (`tuberias.ts: linkedPipes`): se une con la que tiene **delante** y con las que **apuntan a ella**. La vista
   (`scene3d.ts: pipeLinked` → bits `p` de la firma) dibuja un brazo hacia **cualquier vecina**, mire adónde mire.
   Prueba (`evidencia.ts`): dos tuberías contiguas en paralelo (las dos hacia +x) → la vista dibuja un codo/T entre ellas, la lógica
   cuenta **2 redes**; dos que se alejan (espalda con espalda) → también 2 redes, también dibujadas unidas. En fila, o una que entra de lado
   apuntando a la otra → 1 red (ahí sí coinciden). Es el origen de "piezas o giros incorrectos al unirse".
2. **Los puertos de los edificios no cuentan.** `pipeLinked` acepta cualquier casilla de bomba, refinería, generador, turbina o torreta de fuego,
   tenga o no puerto de líquido por ese lado (`puertos.ts` sí sabe qué lados tienen puerto y de qué sentido). Una tubería pegada al costado
   de una bomba por donde no hay puerto se dibuja "enchufada".
3. **Extremos sin cierre.** Con 0 o 1 vecina la vista pone un tubo **entero** de borde a borde con brida abierta en las dos puntas
   (filas 0000, 0001, 0010, 0100, 1000 de la tabla). El "extremo" debería ser medio tubo hacia la vecina más una tapa. Un tramo aislado queda
   además orientado según `dir` de la pieza (arbitrario).
4. **Las curvas, T y cruces no usan las piezas del kit.** Se componen con medios tubos `pipe-large` y una **esfera** central (`HUB_GEO`);
   `pipe-large-bend`, `-curve`, `-junction`, `-cross`, `-valve` están en `public/assets/3d/factory/` pero no se usan. Los giros de los brazos están bien
   (`yawToDir(d)` coincide con la convención de las cintas); el problema es de forma, no de ángulo.
5. **Desniveles sin resolver.** Las cintas inclinan la pieza (`rampSlope`); las tuberías **no**: cada una se dibuja plana a la altura de su casilla,
   así que entre dos niveles queda un escalón o un hueco. La lógica sí deja pasar 1 nivel (`slopeOk`).
6. **Fallo mío, ya corregido:** el anillo de conexión naranja que añadí en ESC-6 en el extremo de la tubería que da a una máquina **nunca se dibujaba**: la
   expresión regular de su firma estaba mal escrita (`/|k(...)/` en lugar de `/\|k(...)/`), así que siempre leía "ningún lado". Por eso parecía "poco visible".

## Tabla esperado / dibujado (16 máscaras en plano)

| máscara | vecinos conectados | pieza esperada | lo que se dibuja hoy | ¿coincide? |
|---|---|---|---|---|
| 0000 | — | tramo aislado: tubo corto con tapa | tubo ENTERO eje x (brida abierta en las dos puntas) | NO (punta abierta sin tapa) |
| 0001 | E(+x) | extremo: medio tubo hacia el vecino + tapa | tubo ENTERO eje x (brida abierta en las dos puntas) | NO (punta abierta sin tapa) |
| 0010 | S(+y) | extremo | tubo ENTERO eje z | NO |
| 0100 | O(-x) | extremo | tubo ENTERO eje x | NO |
| 1000 | N(-y) | extremo | tubo ENTERO eje z | NO |
| 0101 / 1010 | E+O / N+S | recta | tubo entero en su eje | sí |
| 0011, 0110, 1001, 1100 | dos adyacentes | curva (codo) | 2 medios tubos + esfera | conexiones sí; forma: esfera, no la pieza `bend` |
| 0111, 1011, 1101, 1110 | tres | T | 3 medios tubos + esfera | conexiones sí; forma: esfera |
| 1111 | cuatro | cruce | 4 medios tubos + esfera | conexiones sí; forma: esfera |

(La tabla completa con las 16 filas sale de `docs/tuberias/tabla.ts`.)

## Qué cambiaría en el Hito 1 (resumen)

- Una tabla única de máscaras → (pieza, giro) usada por cintas y tuberías.
- **Decisión de diseño que necesito de la lógica:** como pides, la conexión de tuberías pasa a ser **sin dirección** (cualquier vecina o puerto de líquido compatible).
  Hoy en la lógica tiene dirección, así que `tuberias.ts`, `puertos.ts` y el guardado cambian con ella; lo anoto en SPEC.md cuando llegue.
- Sin direcciones, vista y lógica usarían la misma función de conexión (la de la causa 1 desaparece por construcción).
