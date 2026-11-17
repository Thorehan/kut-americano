import { COLORS, Color, MAX_VALUE, Tile, colorIndex } from './tiles';

/** kut: aynı sayı farklı renk · seri: aynı renk ardışık · cift: aynı renk aynı sayı (çift eli) */
export type MeldKind = 'kut' | 'seri' | 'cift';

export interface MeldShape {
  kind: MeldKind;
  /** Gösterim sırası. Seri için soldan sağa artan değerler (okeyler yerini tuttuğu konumda). */
  tiles: Tile[];
  /** Seri ve çift için renk. */
  color: Color | null;
  /** Küt/çift: sayı. Seri: başlangıç sayısı. */
  value: number;
}

export interface Meld extends MeldShape {
  id: number;
  owner: number;
}

export const MELD_NAMES: Record<MeldKind, string> = { kut: 'Küt', seri: 'Seri', cift: 'Çift' };

function split(tiles: readonly Tile[]) {
  const reals: Tile[] = [];
  const jokers: Tile[] = [];
  for (const t of tiles) (t.joker ? jokers : reals).push(t);
  return { reals, jokers };
}

/** 3-4 taş, aynı sayı, hepsi farklı renk. Okey eksik rengin yerine geçer. */
export function asKut(tiles: readonly Tile[]): MeldShape | null {
  if (tiles.length < 3 || tiles.length > 4) return null;
  const { reals, jokers } = split(tiles);
  if (reals.length === 0) return null;
  const value = reals[0].value;
  const colors = new Set<Color | null>();
  for (const t of reals) {
    if (t.value !== value || colors.has(t.color)) return null;
    colors.add(t.color);
  }
  const ordered = [...reals].sort((a, b) => colorIndex(a.color) - colorIndex(b.color));
  return { kind: 'kut', tiles: [...ordered, ...jokers], color: null, value };
}

/**
 * En az 3 taş, aynı renk, ardışık. Başa sarma yok: 1..13.
 * Boşlukları okey doldurur; fazla okey önce sona, sona yer yoksa başa eklenir.
 */
export function asSeri(tiles: readonly Tile[]): MeldShape | null {
  const len = tiles.length;
  if (len < 3 || len > MAX_VALUE) return null;
  const { reals, jokers } = split(tiles);
  if (reals.length === 0) return null;
  const color = reals[0].color;
  const byValue = new Map<number, Tile>();
  for (const t of reals) {
    if (t.color !== color || byValue.has(t.value)) return null;
    byValue.set(t.value, t);
  }
  const values = [...byValue.keys()].sort((a, b) => a - b);
  const min = values[0];
  const max = values[values.length - 1];
  if (max - min + 1 > len) return null;
  const start = Math.min(min, MAX_VALUE - len + 1);
  const ordered: Tile[] = [];
  let j = 0;
  for (let v = start; v < start + len; v++) ordered.push(byValue.get(v) ?? jokers[j++]);
  return { kind: 'seri', tiles: ordered, color, value: start };
}

/** Çift eli için: aynı renk + aynı sayı iki taş; okey bir taşın yerine geçer. */
export function asCift(tiles: readonly Tile[]): MeldShape | null {
  if (tiles.length !== 2) return null;
  const { reals, jokers } = split(tiles);
  if (reals.length === 2 && (reals[0].color !== reals[1].color || reals[0].value !== reals[1].value)) return null;
  const ref = reals[0];
  return { kind: 'cift', tiles: [...reals, ...jokers], color: ref?.color ?? null, value: ref?.value ?? 0 };
}

export function asKind(kind: MeldKind, tiles: readonly Tile[]): MeldShape | null {
  return kind === 'kut' ? asKut(tiles) : kind === 'seri' ? asSeri(tiles) : asCift(tiles);
}

/** Bir grubu (küt ya da seri) olarak yorumlar; ikisi de olabiliyorsa seri önce gelir. */
export function asAnyMeld(tiles: readonly Tile[]): MeldShape | null {
  return asSeri(tiles) ?? asKut(tiles);
}

export function seriEnd(m: MeldShape): number {
  return m.value + m.tiles.length - 1;
}

export type AddPosition = 'start' | 'end';

/** Yerdeki pere bu taş işlenebilir mi? (Okey değiştirme yok — S7.) */
export function addPosition(meld: MeldShape, tile: Tile): AddPosition | null {
  if (meld.kind === 'kut') {
    if (meld.tiles.length >= 4) return null;
    if (tile.joker) return 'end';
    if (tile.value !== meld.value) return null;
    if (meld.tiles.some((t) => !t.joker && t.color === tile.color)) return null;
    return 'end';
  }
  if (meld.kind === 'seri') {
    const end = seriEnd(meld);
    if (tile.joker) return end < MAX_VALUE ? 'end' : meld.value > 1 ? 'start' : null;
    if (tile.color !== meld.color) return null;
    if (tile.value === end + 1 && end < MAX_VALUE) return 'end';
    if (tile.value === meld.value - 1 && meld.value > 1) return 'start';
    return null;
  }
  return null;
}

/** Taş işlenmiş yeni peri döndürür (geçersizse null). */
export function withTile<T extends MeldShape>(meld: T, tile: Tile): T | null {
  const pos = addPosition(meld, tile);
  if (!pos) return null;
  if (meld.kind === 'kut') {
    const shaped = asKut([...meld.tiles, tile]);
    return shaped ? { ...meld, tiles: shaped.tiles } : null;
  }
  if (pos === 'end') return { ...meld, tiles: [...meld.tiles, tile] };
  return { ...meld, tiles: [tile, ...meld.tiles], value: meld.value - 1 };
}

// ------------------------------------------------------------ okey değiştirme

export interface JokerSlot {
  /** Okeyin perdeki sırası. */
  index: number;
  /** Okeyin yerini tuttuğu sayı. */
  value: number;
  /** Okeyin yerine geçebilecek renkler (seride tek renk, kütte eksik renkler). */
  colors: Color[];
}

/** Perdeki her okeyin hangi taşın yerini tuttuğu. */
export function jokerSlots(meld: MeldShape): JokerSlot[] {
  if (meld.kind === 'seri') {
    return meld.tiles.flatMap((t, i) => (t.joker ? [{ index: i, value: meld.value + i, colors: [meld.color!] }] : []));
  }
  if (meld.kind === 'kut') {
    const present = new Set(meld.tiles.filter((t) => !t.joker).map((t) => t.color));
    const missing = COLORS.filter((c) => !present.has(c));
    return meld.tiles.flatMap((t, i) => (t.joker ? [{ index: i, value: meld.value, colors: missing }] : []));
  }
  return [];
}

/** Bu taş perdeki bir okeyin yerine konabilir mi? (işlek taş) Okeyin sırasını döndürür. */
export function jokerSwapIndex(meld: MeldShape, tile: Tile): number | null {
  if (tile.joker) return null;
  const slot = jokerSlots(meld).find((s) => s.value === tile.value && s.colors.includes(tile.color!));
  return slot ? slot.index : null;
}

/** Okeyin yerine gerçek taşı koyar; yeni peri ve alınan okeyi döndürür. */
export function withJokerSwapped<T extends MeldShape>(meld: T, tile: Tile): { meld: T; joker: Tile } | null {
  const idx = jokerSwapIndex(meld, tile);
  if (idx === null) return null;
  const joker = meld.tiles[idx];
  const tiles = meld.tiles.slice();
  tiles[idx] = tile;
  if (meld.kind === 'kut') {
    const shaped = asKut(tiles);
    return shaped ? { meld: { ...meld, tiles: shaped.tiles }, joker } : null;
  }
  return { meld: { ...meld, tiles }, joker };
}
