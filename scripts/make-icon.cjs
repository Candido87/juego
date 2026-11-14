/**
 * Genera el icono de la aplicación (build/icon.png, 512x512) sin dependencias:
 * un cubo isométrico con tres caras sobre fondo redondeado. electron-builder lo convierte a .ico.
 * Uso: node scripts/make-icon.cjs
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function render(N) {
const S = N / 512;
const px = Buffer.alloc(N * N * 4);

const inPoly = (x, y, p) => {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i];
    const [xj, yj] = p[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};

// Cubo: centro (256, 270), medio ancho 150, medio alto de la cara superior 75, altura lateral 150.
const cx = 256 * S;
const top = 100 * S;
const hw = 150 * S;
const hh = 75 * S;
const hz = 150 * S;
const faces = [
  { color: [247, 201, 72], poly: [[cx, top], [cx + hw, top + hh], [cx, top + 2 * hh], [cx - hw, top + hh]] }, // arriba
  { color: [196, 86, 52], poly: [[cx - hw, top + hh], [cx, top + 2 * hh], [cx, top + 2 * hh + hz], [cx - hw, top + hh + hz]] }, // izquierda
  { color: [140, 56, 40], poly: [[cx + hw, top + hh], [cx, top + 2 * hh], [cx, top + 2 * hh + hz], [cx + hw, top + hh + hz]] }, // derecha
];

const R = 96 * S; // radio de las esquinas
const inRound = (x, y) => {
  const dx = Math.max(R - x, 0, x - (N - 1 - R));
  const dy = Math.max(R - y, 0, y - (N - 1 - R));
  return dx * dx + dy * dy <= R * R;
};

for (let y = 0; y < N; y++) {
  for (let x = 0; x < N; x++) {
    const i = (y * N + x) * 4;
    if (!inRound(x, y)) continue;
    const t = y / N;
    let [r, g, b] = [34 + 20 * t, 44 + 26 * t, 62 + 30 * t]; // fondo azul oscuro con degradado
    for (const f of faces) if (inPoly(x + 0.5, y + 0.5, f.poly)) [r, g, b] = f.color;
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    px[i + 3] = 255;
  }
}

return px;
}

// Codificador PNG mínimo (RGBA, 8 bits).
const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function encodePng(N, px) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(N, 0);
  ihdr.writeUInt32BE(N, 4);
  ihdr[8] = 8; // bits
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((N * 4 + 1) * N);
  for (let y = 0; y < N; y++) {
    raw[y * (N * 4 + 1)] = 0;
    px.copy(raw, y * (N * 4 + 1) + 1, y * N * 4, (y + 1) * N * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ICO con una imagen PNG de 256x256 (Windows lo admite desde Vista).
function encodeIco(png256) {
  const dir = Buffer.alloc(6 + 16);
  dir.writeUInt16LE(0, 0); // reservado
  dir.writeUInt16LE(1, 2); // tipo: icono
  dir.writeUInt16LE(1, 4); // una imagen
  dir[6] = 0; // ancho 256 (0 = 256)
  dir[7] = 0; // alto 256
  dir.writeUInt16LE(1, 10); // planos
  dir.writeUInt16LE(32, 12); // bits por píxel
  dir.writeUInt32LE(png256.length, 14);
  dir.writeUInt32LE(22, 18); // desplazamiento de los datos
  return Buffer.concat([dir, png256]);
}

const dir = path.join(__dirname, '..', 'build');
fs.mkdirSync(dir, { recursive: true });
const png512 = encodePng(512, render(512));
fs.writeFileSync(path.join(dir, 'icon.png'), png512);
fs.writeFileSync(path.join(dir, 'icon.ico'), encodeIco(encodePng(256, render(256))));
console.log('Iconos escritos en', dir);
