import { Color, Tile } from '../src';

let nextId = 10_000;

/** Test taşı: t('red', 5) · okey: j() */
export function t(color: Color, value: number): Tile {
  return { id: nextId++, color, value, joker: false };
}

export function j(): Tile {
  return { id: nextId++, color: null, value: 0, joker: true };
}

/** "r5 y5 b5 k5 J" → taşlar (r=kırmızı y=sarı b=mavi k=siyah J=okey) */
export function tiles(spec: string): Tile[] {
  const map: Record<string, Color> = { r: 'red', y: 'yellow', b: 'blue', k: 'black' };
  return spec
    .trim()
    .split(/\s+/)
    .map((s) => (s === 'J' ? j() : t(map[s[0]], Number(s.slice(1)))));
}
