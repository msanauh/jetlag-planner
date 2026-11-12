// Genera public/data/cities.json a partir de GeoNames (cities15000 + admin1).
// Datos de GeoNames, licencia CC BY 4.0 (https://www.geonames.org).
// Uso: npm run cities
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cache = join(root, 'scripts', '.cache');
mkdirSync(cache, { recursive: true });

function download(name) {
  const file = join(cache, name);
  if (!existsSync(file)) execFileSync('curl', ['-sSfL', '-o', file, `https://download.geonames.org/export/dump/${name}`]);
  return file;
}
const zip = download('cities15000.zip');
const txt = join(cache, 'cities15000.txt');
if (!existsSync(txt)) execFileSync('unzip', ['-o', '-q', zip, '-d', cache]);
const admin1 = new Map(readFileSync(download('admin1CodesASCII.txt'), 'utf8').split('\n').filter(Boolean).map(l => { const a = l.split('\t'); return [a[0], a[1]]; }));

const region = new Intl.DisplayNames(['es'], { type: 'region' });
const countries = {};
const rows = [];
for (const line of readFileSync(txt, 'utf8').split('\n')) {
  if (!line) continue;
  const f = line.split('\t');
  // 0 id, 1 name, 2 ascii, 4 lat, 5 lon, 7 feature code, 8 cc, 10 admin1, 14 population, 17 tz
  const [name, ascii, lat, lon, fcode, cc, a1, pop, tz] = [f[1], f[2], +f[4], +f[5], f[7], f[8], f[10], +f[14], f[17]];
  if (!tz || fcode === 'PPLX' || fcode === 'PPLH') continue; // barrios y lugares históricos
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); } catch { continue; }
  if (!countries[cc]) { try { countries[cc] = region.of(cc) ?? cc; } catch { countries[cc] = cc; } }
  rows.push([name, ascii === name ? 0 : ascii, cc, admin1.get(`${cc}.${a1}`) ?? '', tz, Math.round(lat * 100) / 100, Math.round(lon * 100) / 100, pop]);
}
rows.sort((a, b) => b[7] - a[7]);
// Compacto: tablas de zonas y regiones; sin población (el orden ya es por población);
// sin nombre ASCII cuando coincide con el nombre sin acentos.
const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const tzs = [], tzIdx = new Map(), regions = [], rIdx = new Map();
const idx = (list, map, v) => { if (!map.has(v)) { map.set(v, list.length); list.push(v); } return map.get(v); };
const packed = rows.map(([name, ascii, cc, reg, tz, lat, lon]) => [
  name, ascii && norm(ascii) !== norm(name) ? ascii : 0, cc, idx(regions, rIdx, reg), idx(tzs, tzIdx, tz),
  Math.round(lat * 10) / 10, Math.round(lon * 10) / 10,
]);
const out = { source: 'GeoNames cities15000 (CC BY 4.0)', built: new Date().toISOString().slice(0, 10), countries, tzs, regions, fields: ['name', 'ascii', 'cc', 'region', 'tz', 'lat', 'lon'], rows: packed };
mkdirSync(join(root, 'public', 'data'), { recursive: true });
writeFileSync(join(root, 'public', 'data', 'cities.json'), JSON.stringify(out));
console.log(`${rows.length} ciudades, ${Object.keys(countries).length} países`);
