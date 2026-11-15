/**
 * Captura una página a PNG con Electron (herramienta de desarrollo, no forma parte del juego).
 *
 *   CAP_URL=<url> CAP_OUT=<salida.png> [CAP_W=1280] [CAP_H=800] [CAP_WAIT=6000] [CAP_JS="..."] npx electron tools/captura.cjs
 *   CAP_URL=<url> CAP_SHOTS='[{"out":"a.png","js":"..."},{"out":"b.png","js":"...","wait":1000}]' npx electron tools/captura.cjs
 *
 * Abre la dirección en una ventana (casi transparente y sin ratón, para no estorbar) del tamaño pedido, espera, ejecuta el
 * JavaScript opcional (para pulsar un botón o mover la cámara antes de la foto) y guarda la captura. Con `CAP_SHOTS`
 * saca varias fotos seguidas de la misma página. Sirve para las fotos de `docs/` y para comparar aspectos.
 */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

// Los argumentos van por variables de entorno: Electron se queda para si las direcciones http que recibe como argumento.
const { CAP_URL: url, CAP_OUT: out, CAP_W: w = '1280', CAP_H: h = '800', CAP_WAIT: wait = '6000', CAP_JS: js = '', CAP_SHOTS: shotsJson = '' } = process.env;
const shots = shotsJson ? JSON.parse(shotsJson) : out ? [{ out, js }] : [];
if (!url || !shots.length) {
  console.error('Uso: CAP_URL=<url> CAP_OUT=<salida.png> npx electron tools/captura.cjs');
  process.exit(2);
}
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.whenReady().then(async () => {
  // Una ventana oculta no pinta fotogramas nuevos: se muestra casi transparente, sin foco y sin recibir el ratón.
  const win = new BrowserWindow({ width: Number(w), height: Number(h), useContentSize: true, show: false, focusable: false, skipTaskbar: true, opacity: 0.01, webPreferences: { backgroundThrottling: false } });
  win.setIgnoreMouseEvents(true);
  win.setContentSize(Number(w), Number(h));
  win.showInactive();
  const errors = [];
  win.webContents.on('console-message', (_e, level, message) => level >= 3 && errors.push(message));
  await win.loadURL(url);
  await new Promise((r) => setTimeout(r, Number(wait)));
  for (const s of shots) {
    let res;
    if (s.js) res = await win.webContents.executeJavaScript(s.js).catch((e) => errors.push(String(e)));
    await new Promise((r) => setTimeout(r, s.wait ?? 700));
    const image = await win.webContents.capturePage();
    fs.mkdirSync(path.dirname(path.resolve(s.out)), { recursive: true });
    fs.writeFileSync(s.out, image.toPNG());
    const size = image.getSize();
    console.log(`CAPTURA ${s.out} ${size.width}x${size.height}${res !== undefined && typeof res !== "object" ? " => " + res : res ? " => " + JSON.stringify(res) : ""}`);
  }
  if (errors.length) console.log('ERRORES ' + JSON.stringify(errors.slice(0, 3)));
  app.exit(errors.length ? 1 : 0);
});
