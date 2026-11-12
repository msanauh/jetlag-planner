import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { addGeoNames, cities, CURATED, findCity, searchCities } from '../src/cities';
import { validTz } from '../src/core/time';

describe('ciudades curadas', () => {
  it('110 ciudades, todas con zona válida', () => {
    expect(CURATED).toHaveLength(110);
    expect(CURATED.filter(c => !validTz(c.tz))).toEqual([]);
  });
  it('busca sin acentos ni mayúsculas', () => {
    expect(findCity('tokio')?.label).toBe('Tokio (Japón)');
    expect(findCity('Seul')?.label).toBe('Seúl (Corea del Sur)');
    expect(findCity('Málaga')).toBeNull();
  });
});

describe('con GeoNames', () => {
  beforeAll(() => addGeoNames(JSON.parse(readFileSync('public/data/cities.json', 'utf8'))));
  it('carga miles de ciudades sin duplicar las curadas', () => {
    expect(cities().length).toBeGreaterThan(30000);
    expect(cities().filter(c => c.n === 'Barcelona' && c.tz === 'Europe/Madrid')).toHaveLength(1);
    expect([...new Set(cities().map(c => c.tz))].filter(tz => !validTz(tz))).toEqual([]);
  });
  it('encuentra ciudades que antes faltaban', () => {
    expect(findCity('Málaga')?.tz).toBe('Europe/Madrid');
    expect(searchCities('kyoto')[0].tz).toBe('Asia/Tokyo');
    expect(searchCities('Hiroshima')[0].c).toBe('Japón');
  });
  it('las curadas salen primero', () => {
    expect(searchCities('santiago')[0].label).toBe('Santiago (Chile)');
    expect(searchCities('Tokio')[0].label).toBe('Tokio (Japón)');
  });
  it('distingue homónimas por región', () => {
    const s = searchCities('Springfield', 20).filter(c => c.c === 'Estados Unidos');
    expect(s.length).toBeGreaterThan(1);
    expect(new Set(s.map(c => c.label)).size).toBe(s.length);
  });
});
