/**
 * Proceso principal de Electron: abre el juego en una ventana de escritorio.
 * - Desarrollo (`npm run electron:dev`): carga el servidor de Vite (http://localhost:5173).
 * - Producción (instalador): sirve `dist/` mediante un protocolo propio `app://` (origen "normal" y seguro), de modo que
 *   los assets cargan igual que en el navegador, WebGL puede usar las imágenes y `localStorage` (el guardado) persiste.
 */
const { app, BrowserWindow, Menu, protocol, net, shell } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

const DEV_URL = process.env.ELECTRON_DEV_URL || 'http://localhost:5173';
const isDev = !!process.env.ELECTRON_DEV;
// Página que se abre: la vista 3D (por defecto) o, mientras exista, la 2D (`ELECTRON_PAGE=index.html`).
const PAGE = process.env.ELECTRON_PAGE || 'vista3d.html';
const DIST = path.join(__dirname, '..', 'dist');
const ICON = path.join(__dirname, '..', 'build', 'icon.png');

// WebGL2 también en tarjetas gráficas antiguas que Chromium tiene en lista negra.
app.commandLine.appendSwitch('ignore-gpu-blocklist');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: 'Fábrica Isométrica',
    icon: ICON,
    backgroundColor: '#1d2430',
    autoHideMenuBar: true,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.removeMenu();
  win.once('ready-to-show', () => win.show());

  // F11: pantalla completa. (Sin menú no hay atajo por defecto, así que lo capturamos aquí.)
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    } else if (isDev && input.key === 'F12') {
      win.webContents.toggleDevTools();
    }
  });

  // Los enlaces externos se abren en el navegador, no dentro del juego.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.loadURL(isDev ? `${DEV_URL.replace(/\/+$/, '')}/${PAGE}` : `app://juego/${PAGE}`);
  return win;
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);

  if (!isDev) {
    protocol.handle('app', (request) => {
      const url = new URL(request.url);
      let rel = decodeURIComponent(url.pathname);
      if (rel === '/' || rel === '') rel = `/${PAGE}`;
      const file = path.normalize(path.join(DIST, rel));
      // Nunca salir de dist/.
      if (!file.startsWith(DIST)) return new Response('Prohibido', { status: 403 });
      return net.fetch(pathToFileURL(file).toString());
    });
  }

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
