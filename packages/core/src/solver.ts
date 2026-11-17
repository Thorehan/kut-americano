import { COLORS, MAX_VALUE, Tile, compareByColor } from './tiles';
import { Requirement } from './contracts';

/** Eldeki taşlardan per arayan yardımcılar (botlar ve ipuçları için). */

export function combos<T>(arr: readonly T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (k > arr.length) return [];
  const out: T[][] = [];
  const rec = (start: number, acc: T[]) => {
    if (acc.length === k) {
      out.push(acc.slice());
      return;
    }
    for (let i = start; i <= arr.length - (k - acc.length); i++) {
      acc.push(arr[i]);
      rec(i + 1, acc);
      acc.pop();
    }
  };
  rec(0, []);
  return out;
}

export function without(pool: readonly Tile[], used: readonly Tile[]): Tile[] {
  const ids = new Set(used.map((t) => t.id));
  return pool.filter((t) => !ids.has(t.id));
}

/** Tam `size` taşlık küt adayları; az okey kullananlar önce. */
export function kutCandidates(pool: readonly Tile[], size: number, maxJokers = Infinity): Tile[][] {
  const jokers = pool.filter((t) => t.joker);
  const byValue = new Map<number, Map<string, Tile>>();
  for (const t of pool) {
    if (t.joker) continue;
    let m = byValue.get(t.value);
    if (!m) byValue.set(t.value, (m = new Map()));
    if (!m.has(t.color!)) m.set(t.color!, t);
  }
  const out: Tile[][] = [];
  const jmax = Math.min(jokers.length, maxJokers, size - 1);
  for (let j = 0; j <= jmax; j++) {
    for (const m of byValue.values()) {
      const reals = [...m.values()];
      const need = size - j;
      if (need < 1 || reals.length < need) continue;
      for (const c of combos(reals, need)) out.push([...c, ...jokers.slice(0, j)]);
    }
  }
  return out;
}

/** Tam `size` taşlık seri adayları; az okey kullananlar önce. */
export function seriCandidates(pool: readonly Tile[], size: number, maxJokers = Infinity): Tile[][] {
  const jokers = pool.filter((t) => t.joker);
  const limit = Math.min(jokers.length, maxJokers);
  const byColor = new Map<string, Map<number, Tile>>();
  for (const t of pool) {
    if (t.joker) continue;
    let m = byColor.get(t.color!);
    if (!m) byColor.set(t.color!, (m = new Map()));
    if (!m.has(t.value)) m.set(t.value, t);
  }
  const found: { tiles: Tile[]; used: number }[] = [];
  for (const color of COLORS) {
    const m = byColor.get(color);
    if (!m) continue;
    for (let start = 1; start + size - 1 <= MAX_VALUE; start++) {
      const reals: Tile[] = [];
      let used = 0;
      for (let v = start; v < start + size; v++) {
        const t = m.get(v);
        if (t) reals.push(t);
        else used++;
      }
      if (used > limit || used >= size) continue;
      found.push({ tiles: [...reals, ...jokers.slice(0, used)], used });
    }
  }
  found.sort((a, b) => a.used - b.used);
  return found.map((f) => f.tiles);
}

export function requirementCandidates(pool: readonly Tile[], req: Requirement, maxJokers = Infinity): Tile[][] {
  return req.kind === 'kut' ? kutCandidates(pool, req.min, maxJokers) : seriCandidates(pool, req.min, maxJokers);
}

/** Elin kuralı açıp açamayacağını bulur; açabiliyorsa gerekli perleri döndürür. */
export function findContractMelds(hand: readonly Tile[], reqs: readonly Requirement[]): Tile[][] | null {
  if (reqs.length === 0) return null;
  const rec = (i: number, pool: Tile[]): Tile[][] | null => {
    if (i === reqs.length) return [];
    for (const cand of requirementCandidates(pool, reqs[i])) {
      const r = rec(i + 1, without(pool, cand));
      if (r) return [cand, ...r];
    }
    return null;
  };
  return rec(0, hand.slice());
}

function bestMeld(pool: readonly Tile[], maxJokers: number): Tile[] | null {
  let best: Tile[] | null = null;
  let bestJokers = Infinity;
  const consider = (c: Tile[] | undefined) => {
    if (!c) return;
    const j = c.filter((t) => t.joker).length;
    if (j < bestJokers || (j === bestJokers && c.length > (best?.length ?? 0))) {
      best = c;
      bestJokers = j;
    }
  };
  for (let size = MAX_VALUE; size >= 3; size--) consider(seriCandidates(pool, size, maxJokers)[0]);
  consider(kutCandidates(pool, 4, maxJokers)[0]);
  consider(kutCandidates(pool, 3, maxJokers)[0]);
  return best;
}

/** Açgözlü per bulma: önce okeysiz, sonra (izin varsa) okeyli. */
export function findGreedyMelds(hand: readonly Tile[], maxJokers = 0): Tile[][] {
  let pool = hand.slice();
  const out: Tile[][] = [];
  for (const jokersAllowed of maxJokers > 0 ? [0, maxJokers] : [0]) {
    for (;;) {
      const m = bestMeld(pool, jokersAllowed);
      if (!m) break;
      out.push(m);
      pool = without(pool, m);
    }
  }
  return out;
}

export interface Partition {
  melds: Tile[][];
  leftovers: Tile[];
}

/** `t` taşını içeren tüm küt/seri adayları. */
function candidatesContaining(t: Tile, pool: readonly Tile[]): Tile[][] {
  const jokers = pool.filter((x) => x.joker);
  const out: { tiles: Tile[]; used: number }[] = [];

  const others = new Map<string, Tile>();
  for (const x of pool) {
    if (x.joker || x === t || x.value !== t.value || x.color === t.color) continue;
    if (!others.has(x.color!)) others.set(x.color!, x);
  }
  const otherList = [...others.values()];
  for (const size of [4, 3]) {
    for (let j = 0; j <= Math.min(jokers.length, size - 1); j++) {
      const need = size - 1 - j;
      if (need > otherList.length) continue;
      for (const c of combos(otherList, need)) out.push({ tiles: [t, ...c, ...jokers.slice(0, j)], used: j });
    }
  }

  const sameColor = new Map<number, Tile>();
  for (const x of pool) {
    if (x.joker || x === t || x.color !== t.color || x.value === t.value) continue;
    if (!sameColor.has(x.value)) sameColor.set(x.value, x);
  }
  for (let len = MAX_VALUE; len >= 3; len--) {
    for (let start = Math.max(1, t.value - len + 1); start <= Math.min(t.value, MAX_VALUE - len + 1); start++) {
      const tiles = [t];
      let used = 0;
      for (let v = start; v < start + len; v++) {
        if (v === t.value) continue;
        const x = sameColor.get(v);
        if (x) tiles.push(x);
        else used++;
      }
      if (used <= jokers.length && used < len) out.push({ tiles: [...tiles, ...jokers.slice(0, used)], used });
    }
  }
  out.sort((a, b) => a.used - b.used || b.tiles.length - a.tiles.length);
  return out.map((o) => o.tiles);
}

/**
 * Elin tamamını küt/seri perlerine böler; en fazla `leftoverBudget` taş dışarıda kalabilir.
 * Elden bitme kontrolü için.
 */
export function findFullPartition(hand: readonly Tile[], leftoverBudget = 1): Partition | null {
  let nodes = 0;
  const LIMIT = 40000;
  const rec = (pool: Tile[], budget: number): Partition | null => {
    if (++nodes > LIMIT) return null;
    if (pool.length === 0) return { melds: [], leftovers: [] };
    const first = pool.find((t) => !t.joker);
    if (!first) return pool.length <= budget ? { melds: [], leftovers: pool.slice() } : null;
    for (const cand of candidatesContaining(first, pool)) {
      const r = rec(without(pool, cand), budget);
      if (r) {
        r.melds.unshift(cand);
        return r;
      }
    }
    if (budget > 0) {
      const r = rec(
        pool.filter((t) => t !== first),
        budget - 1,
      );
      if (r) {
        r.leftovers.push(first);
        return r;
      }
    }
    return null;
  };
  return rec(hand.slice().sort(compareByColor), leftoverBudget);
}

/** Çift eli: eli çiftlere böler (en fazla 1 taş dışarıda, en az `minPairs` çift). */
export function findPairPartition(hand: readonly Tile[], minPairs = 7): Partition | null {
  const groups = new Map<string, Tile[]>();
  const jokers: Tile[] = [];
  for (const t of hand) {
    if (t.joker) {
      jokers.push(t);
      continue;
    }
    const key = `${t.color}-${t.value}`;
    const g = groups.get(key);
    if (g) g.push(t);
    else groups.set(key, [t]);
  }
  const melds: Tile[][] = [];
  const singles: Tile[] = [];
  for (const g of groups.values()) {
    while (g.length >= 2) melds.push([g.pop()!, g.pop()!]);
    if (g.length) singles.push(g[0]);
  }
  while (singles.length && jokers.length) melds.push([singles.pop()!, jokers.pop()!]);
  while (jokers.length >= 2) melds.push([jokers.pop()!, jokers.pop()!]);
  const leftovers = [...singles, ...jokers];
  if (leftovers.length > 1 || melds.length < minPairs) return null;
  return { melds, leftovers };
}
