/**
 * Captura una página a PNG con Electron (herramienta de desarrollo, no forma parte del juego).
 *
 *   CAP_URL=<url> CAP_OUT=<salida.png> [CAP_W=1280] [CAP_H=800] [CAP_WAIT=6000] [CAP_JS="..."] npx electron tools/captura.cjs
 *
 * Abre la dirección en una ventana del tamaño pedido, espera, ejecuta el JavaScript opcional (para pulsar un botón
 * o mover la cámara antes de la foto) y guarda la captura. Sirve para las fotos de `docs/` y para comparar aspectos.
 */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

// Los argumentos van por variables de entorno: Electron se queda para si las direcciones http que recibe como argumento.
const { CAP_URL: url, CAP_OUT: out, CAP_W: w = '1280', CAP_H: h = '800', CAP_WAIT: wait = '6000', CAP_JS: js = '' } = process.env;
if (!url || !out) {
  console.error('Uso: CAP_URL=<url> CAP_OUT=<salida.png> npx electron tools/captura.cjs');
  process.exit(2);
}
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: Number(w), height: Number(h), useContentSize: true, show: true, enableLargerThanScreen: true, webPreferences: { backgroundThrottling: false } });
  win.setContentSize(Number(w), Number(h));
  const errors = [];
  win.webContents.on('console-message', (_e, level, message) => level >= 3 && errors.push(message));
  await win.loadURL(url);
  await new Promise((r) => setTimeout(r, Number(wait)));
  if (js) {
    await win.webContents.executeJavaScript(js).catch((e) => errors.push(String(e)));
    await new Promise((r) => setTimeout(r, 700));
  }
  const image = await win.webContents.capturePage();
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, image.toPNG());
  const size = image.getSize();
  console.log(`CAPTURA ${out} ${size.width}x${size.height}${errors.length ? ' errores: ' + JSON.stringify(errors.slice(0, 3)) : ''}`);
  app.exit(errors.length ? 1 : 0);
});
