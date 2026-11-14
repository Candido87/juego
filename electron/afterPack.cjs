/**
 * Hook de electron-builder: pone el icono y los datos de versión al .exe.
 * Se usa en vez de la edición automática (win.signAndEditExecutable=false), porque esa necesita descargar
 * `winCodeSign`, que en Windows exige privilegios para crear enlaces simbólicos y falla sin modo desarrollador.
 */
const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;
  const mod = require('rcedit');
  const rcedit = typeof mod === 'function' ? mod : mod.rcedit || mod.default;
  const info = context.packager.appInfo;
  const exe = path.join(context.appOutDir, `${info.productFilename}.exe`);
  await rcedit(exe, {
    icon: path.join(context.packager.projectDir, 'build', 'icon.ico'),
    'version-string': { ProductName: info.productName, FileDescription: info.productName, CompanyName: info.productName },
    'file-version': info.version,
    'product-version': info.version,
  });
  console.log('  • icono y versión aplicados a', path.basename(exe));
};
