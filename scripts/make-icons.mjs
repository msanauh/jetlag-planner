// Genera los iconos de la app (public/icons): sol naranja asomando sobre una línea de horizonte.
// Sin dependencias: dibuja las formas con supermuestreo y codifica el PNG a mano.
// Uso: npm run icons
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const OUT = new URL('../public/icons/', import.meta.url);
const BG = '#FFF3EB', SUN = '#DE6C3F', INK = '#2B2D42';

// Geometría en un lienzo de 512. Todo queda dentro de la zona segura de los iconos "maskable" (círculo de radio 205).
const SUN_C = { x: 256, y: 258, r: 112 }, SUN_CUT = 236;
const bars = [
  { x: 104, y: 244, w: 304, h: 28, c: INK }, // horizonte
  { x: 176, y: 300, w: 160, h: 20, c: SUN }, // reflejo
  { x: 220, y: 346, w: 72, h: 20, c: SUN },  // reflejo
];

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<rect width="512" height="512" fill="${BG}"/>
<clipPath id="s"><rect width="512" height="${SUN_CUT}"/></clipPath>
<circle cx="${SUN_C.x}" cy="${SUN_C.y}" r="${SUN_C.r}" fill="${SUN}" clip-path="url(#s)"/>
${bars.map(b => `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${b.h / 2}" fill="${b.c}"/>`).join('\n')}
</svg>
`;

const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const inPill = (b, x, y) => {
  const r = b.h / 2, cy = b.y + r;
  const cx = Math.min(Math.max(x, b.x + r), b.x + b.w - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};
function colorAt(x, y) {
  for (const b of bars) if (inPill(b, x, y)) return b.c;
  if (y < SUN_CUT && (x - SUN_C.x) ** 2 + (y - SUN_C.y) ** 2 <= SUN_C.r ** 2) return SUN;
  return BG;
}

const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = buf => { let c = 0xFFFFFFFF; for (const b of buf) c = CRC[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size) {
  const SS = 4, k = 512 / size, raw = Buffer.alloc(size * (size * 3 + 1));
  const cache = new Map();
  for (let py = 0; py < size; py++) {
    raw[py * (size * 3 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      const acc = [0, 0, 0];
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const c = colorAt((px + (sx + 0.5) / SS) * k, (py + (sy + 0.5) / SS) * k);
        if (!cache.has(c)) cache.set(c, rgb(c));
        cache.get(c).forEach((v, i) => { acc[i] += v; });
      }
      const o = py * (size * 3 + 1) + 1 + px * 3;
      for (let i = 0; i < 3; i++) raw[o + i] = Math.round(acc[i] / (SS * SS));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

mkdirSync(OUT, { recursive: true });
writeFileSync(new URL('icon.svg', OUT), svg);
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(new URL(name, OUT), png(size));
}
console.log('Iconos generados en public/icons/');
