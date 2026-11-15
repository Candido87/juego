# Fábrica Isométrica

Juego de fábrica + defensa en vista isométrica 3D (TypeScript, Three.js, Vite). Funciona en el navegador (necesita
WebGL2) y como aplicación de escritorio para Windows (Electron).

## Navegador
| Comando | Qué hace |
|---|---|
| `npm install` | Instala las dependencias (una sola vez). |
| `npm run dev` | Servidor de desarrollo en http://localhost:5173 (el juego es `vista3d.html`; la raíz redirige). Sin parámetros abre el menú principal |
| `npm run build` | Comprueba tipos y genera `dist/` |
| `npm test` | Tests (Vitest) |
| `npm run sim` | Simulación sin gráficos con el bot |

## Aplicación de escritorio (Electron)
| Comando | Qué hace |
|---|---|
| `npm run electron:dev` | Abre el juego en una ventana de escritorio conectada al servidor de Vite (con recarga en caliente). F12 abre las herramientas de desarrollo. |
| `npm run electron:start` | Compila el juego y lo abre en Electron como en producción (sin instalador). |
| `npm run dist` | Compila y genera el instalador de Windows en `release/` (`Fabrica-Isometrica-Setup-<versión>.exe`). |

- **F11** alterna pantalla completa; no hay barra de menú.
- El guardado de partida usa `localStorage`, que en la app se guarda en la carpeta de datos del usuario
  (`%APPDATA%\Fábrica Isométrica`) y persiste entre sesiones. El de la app y el del navegador son independientes.
- El icono sale de `build/icon.png` (se regenera con `npm run icon`). `release/` está en `.gitignore`.
- El instalador no está firmado: Windows SmartScreen puede avisar la primera vez ("Más información → Ejecutar de todos modos").

## Créditos
Gráficos de terceros de Kenney (CC0): ver [CREDITS.md](CREDITS.md). Diseño en [SPEC.md](SPEC.md), progreso en
[PROGRESS.md](PROGRESS.md), inventario de gráficos en [ASSETS.md](ASSETS.md), guía para trabajar en el código en
[CLAUDE.md](CLAUDE.md). La antigua vista 2D (Phaser) se retiró al alcanzar la paridad: ver [PARIDAD.md](PARIDAD.md).
