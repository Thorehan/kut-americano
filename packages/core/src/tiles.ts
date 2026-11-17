export const COLORS = ['red', 'yellow', 'blue', 'black'] as const;
export type Color = (typeof COLORS)[number];

export const COLOR_NAMES: Record<Color, string> = {
  red: 'Kırmızı',
  yellow: 'Sarı',
  blue: 'Mavi',
  black: 'Siyah',
};

export const MAX_VALUE = 13;
/** Elde kalan okeyin ceza değeri (İstişare S3 varsayımı). */
export const JOKER_PENALTY = 25;

export interface Tile {
  readonly id: number;
  /** Okey (sahte okey simgeli taş) için null. */
  readonly color: Color | null;
  /** 1..13, okey için 0. */
  readonly value: number;
  readonly joker: boolean;
}

/** Standart okey takımı: 4 renk × 1-13 × 2 + okey taşları (varsayılan 2 → 106 taş). */
export function createTileSet(jokerCount = 2): Tile[] {
  const tiles: Tile[] = [];
  let id = 0;
  for (let copy = 0; copy < 2; copy++) {
    for (const color of COLORS) {
      for (let value = 1; value <= MAX_VALUE; value++) {
        tiles.push({ id: id++, color, value, joker: false });
      }
    }
  }
  for (let j = 0; j < jokerCount; j++) tiles.push({ id: id++, color: null, value: 0, joker: true });
  return tiles;
}

/** Ceza puanı: 1-9 kendi sayısı, 10 ve üstü 10, okey 25. */
export function tilePenalty(t: Tile): number {
  return t.joker ? JOKER_PENALTY : Math.min(t.value, 10);
}

export function colorIndex(c: Color | null): number {
  return c ? COLORS.indexOf(c) : 99;
}

/** Renk → sayı sırası (okeyler sonda). */
export function compareByColor(a: Tile, b: Tile): number {
  if (a.joker !== b.joker) return a.joker ? 1 : -1;
  return colorIndex(a.color) - colorIndex(b.color) || a.value - b.value || a.id - b.id;
}

/** Sayı → renk sırası (okeyler sonda). */
export function compareByValue(a: Tile, b: Tile): number {
  if (a.joker !== b.joker) return a.joker ? 1 : -1;
  return a.value - b.value || colorIndex(a.color) - colorIndex(b.color) || a.id - b.id;
}

export function tileName(t: Tile): string {
  return t.joker ? 'Okey' : `${COLOR_NAMES[t.color!]} ${t.value}`;
}
