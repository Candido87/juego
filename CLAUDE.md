# CLAUDE.md — Fábrica Isométrica

Juego de fábrica + defensa por oleadas en vista isométrica **3D** (TypeScript, Three.js, Vite, Vitest; Electron para
escritorio). Todo el texto del juego, los comentarios y los commits están en español.

## Comandos
| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de Vite en http://localhost:5173 (abre `vista3d.html`; `index.html` sólo redirige) |
| `npm test` | Tests (Vitest, entorno node, sin navegador) |
| `npm run build` | `tsc --noEmit` + build de Vite a `dist/` |
| `npm run sim` | Partida sin gráficos con el bot (equilibrado) |
| `npm run electron:dev` / `electron:start` / `dist` | Escritorio: desarrollo, build local, instalador en `release/` |

Regla del proyecto: tras cada hito, **tests + tipos + build en verde**, commit y push.

## Dónde está cada cosa
- `src/game/` — **lógica pura**, sin DOM ni Three. `config.ts` tiene **todos** los números; `game.ts` el estado y los
  sistemas; el resto son módulos pequeños con su test al lado (`power`, `recetas`, `puertos`, `savegame`, `tutorial`,
  `guia-inicio`, `inicio` para el menú principal...). Nada de aquí puede importar de `src/view*`.
- `src/view/` — **interfaz HTML/CSS compartida** y reglas puras de la vista: `ui.ts` (HUD, menú, paneles),
  `tooltip.ts`, `guia.ts`, `decor.ts` (decoración y zonas de terreno por semilla), `muros.ts`, `sprites.ts` (iconos
  de roles y trabajos), `itemColors.ts`. El nombre de la carpeta viene de la antigua vista 2D; ya no hay Phaser.
- `src/view3d/` — **vista 3D**. `main3d.ts` arranca (parámetros de URL, opciones, bucle); `scene3d.ts` es la escena
  (`View3D`); alrededor, módulos pequeños: `catalog.ts` (qué modelo es cada cosa), `terrain.ts`, `overlay3d.ts`
  (cables, puertos, alcances, iconos de estado, ayudas de la guía), `threat3d.ts` (apariciones y ruta), `effects3d.ts`
  + `particles.ts`, `fx.ts` (contorno y transparencia), `quality.ts` (niveles de calidad y WebGL2), `status.ts`,
  `actors.ts`, `pieces.ts`, `camera.ts`, `pick.ts`, `options.ts`, `tutorial3d.ts`, `bench.ts`.
- `public/assets/3d/<pack>/` — modelos de Kenney (CC0). `public/assets/ui-pack/` — estilo de la interfaz.
- `electron/main.cjs` — ventana de escritorio (sirve `dist/` por `app://`).
- `SPEC.md` (diseño y decisiones, por fases), `PROGRESS.md` (hoja de ruta), `PARIDAD.md` (qué hacía la 2D y cómo
  quedó en 3D), `ASSETS.md`, `CREDITS.md`.

## Cómo trabajar aquí
- **La vista no decide nada.** Lee el `Game` y manda órdenes (`place`, `remove`, `setRecipe`...). Si falta un dato,
  se añade a `src/game/` con su test, no se calcula en la vista.
- **Lo que se pueda, puro y con test.** Los módulos de `view3d` sin Three (`quality`, `status`, `pieces`, `actors`,
  `particles`, `options`, `camera`, `pick`, `palette`, `catalog`) se prueban en `view3d.test.ts`. Un test recorre los
  imports desde `main3d.ts` y falla si vuelve a aparecer `phaser`.
- **Modelos nuevos:** se añaden a `catalog.ts`; un test comprueba que el `.glb` existe. Para lo que el pack no trae,
  una parte puede ser una figura simple (`prim: 'box' | 'cyl'`), como el poste y la batería.
- **Rendimiento:** los edificios estáticos se agrupan en `InstancedMesh`; si un edificio cambia de aspecto, el cambio
  debe ir en `signature()` para que se rehaga. Los materiales teñidos se comparten (`tint`, `wallMat`).
- **Números de rendimiento:** `__bench(n)` y `__benchQuality(n)` en la consola; se anotan en `SPEC.md` diciendo en
  qué equipo y qué **no** se midió.

## Parámetros de URL útiles (`vista3d.html`)
sin parámetros o `?menu=1` (menú principal) · `?seed=N` · `?demo=1|wave` (escena de prueba con de todo) · `?galeria=1` (todos los modelos y torretas por nivel) ·
`?tutorial=1` · `?load=auto|manual` · `?quality=low|medium|high` · `?nowebgl=1|2` (simula el aviso) ·
`?bench=1&map=120&objs=1500&enemies=300` · `?auto=1` (juega el bot) · `?speed=4` · `?waves=0`.
En la consola: `__v3` (`view`, `game`, `ui`), `__perf()`, `__bench(n)`, `__benchQuality(n)`.

## Probar en Electron sin mirar la ventana
`ELECTRON_SMOKE=captura.png ELECTRON_QUERY="demo=wave&seed=7" npx electron .` (después de `npm run build`): abre el
juego, guarda una captura, imprime una línea `SMOKE {...}` con FPS, errores de consola y GPU, y sale con código 0 si
arrancó sin errores.

## Pendiente conocido
- El árbol de tecnología está vacío (`CONFIG.tech = []`): muros, puerta, láser y hielo no se desbloquean en partida libre.
- Las torretas de energía no disparan: `Game.turretPower` devuelve 0. Es lógica pendiente.
- No hay sonido.
- `npm run sim`: el bot pierde en las oleadas 7-8 (equilibrado pendiente, H5 en `PROGRESS.md`).
- En la raíz quedan carpetas de packs descargados (`assets-juego/`, `Tiles/`, `Map/`, `Tilemap/`) que el juego no carga.
