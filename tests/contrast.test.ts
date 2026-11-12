import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/* Contraste WCAG de los pares de color que llevan texto (AA: 4,5:1) e iconos (3:1). */
const css = readFileSync('src/styles.css', 'utf8');
function tokens(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--([\w-]+):(#[0-9A-Fa-f]{6})/g)) out[m[1]] = m[2];
  return out;
}
const light = tokens(css.slice(css.indexOf(':root{'), css.indexOf('}', css.indexOf(':root{'))));
const darkStart = css.indexOf(':root[data-theme="dark"]{');
const dark = { ...light, ...tokens(css.slice(darkStart, css.indexOf('}', darkStart))) };

const lum = (h: string) => {
  const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

const TEXT: [string, string][] = [
  ['ink', 'bg'], ['ink', 'surface'], ['muted', 'bg'], ['muted', 'surface'], ['orange-text', 'bg'], ['orange-text', 'surface'],
  ['accent-ink', 'accent'], ['p-light-ink', 'p-light'], ['pill-ink', 'p-coffee'], ['pill-ink', 'p-sleep'],
  ['sleep', 'sleep-bg'], ['light', 'light-bg'], ['coffee', 'coffee-bg'], ['meal', 'meal-bg'], ['sugar', 'sugar-bg'],
  ['stop', 'stop-bg'], ['muted', 'stop-bg'], ['ink', 'stop-bg'], ['mel', 'mel-bg'], ['flight', 'flight-bg'], ['vanilla-ink', 'vanilla'], ['danger', 'bg'], ['ok', 'surface'],
];
const ICON: [string, string][] = [['o-light', 'surface'], ['o-coffee', 'surface'], ['o-sugar', 'surface'], ['now', 'bg'], ['orange-text', 'vanilla']];

for (const [name, t] of [['claro', light], ['oscuro', dark]] as const) {
  describe(`contraste, modo ${name}`, () => {
    for (const [fg, bg] of TEXT) it(`${fg} sobre ${bg} ≥ 4,5`, () => expect(ratio(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5));
    for (const [fg, bg] of ICON) it(`${fg} sobre ${bg} ≥ 3 (iconos)`, () => expect(ratio(t[fg], t[bg])).toBeGreaterThanOrEqual(3));
  });
}
