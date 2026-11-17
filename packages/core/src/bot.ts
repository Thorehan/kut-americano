import { Action, Game } from './game';
import { addPosition, jokerSwapIndex } from './melds';
import { findContractMelds, findFullPartition, findGreedyMelds, findPairPartition } from './solver';
import { Tile, tilePenalty } from './tiles';

/** Basit kural tabanlı bot. Her çağrıda tek bir hamle döndürür. */
export function decideBotAction(game: Game, seat: number): Action {
  const s = game.state;
  const p = s.players[seat];
  const c = game.contract;

  if (s.phase === 'claim') return { type: 'claim', want: wantsClaim(game, seat, s.claim!.tile) };
  if (s.phase === 'draw') {
    const pd = s.pendingDiscard;
    if (pd && wantsDiscard(game, seat, pd.tile)) return { type: 'takeDiscard' };
    return { type: 'drawDeck' };
  }
  if (s.phase !== 'action') return { type: 'nextRound' };

  const ids = (groups: Tile[][]) => groups.map((g) => g.map((t) => t.id));

  if (c.mode === 'normal') {
    if (!p.opened) {
      // Açılışta yalnızca kural iner; fazlalıklar sonraki sırada.
      const open = findContractMelds(p.hand, c.reqs);
      if (open) return { type: 'lay', melds: ids(open) };
    } else if (!p.openedThisTurn) {
      // Okeyin yerine geçen taş elimdeyse: koy, okeyi al (rakibe +50).
      for (const t of p.hand) {
        const m = s.melds.find((m) => jokerSwapIndex(m, t) !== null);
        if (m) return { type: 'swapJoker', tileId: t.id, meldId: m.id };
      }
      const jokers = p.hand.filter((t) => t.joker).length;
      const extra = findGreedyMelds(p.hand, jokers);
      if (extra.length) return { type: 'lay', melds: ids(extra) };
      if (game.canAddToMelds(seat)) {
        const ordered = [...p.hand].sort((a, b) => Number(a.joker) - Number(b.joker));
        for (const t of ordered) {
          const m = s.melds.find((m) => addPosition(m, t));
          if (m) return { type: 'addToMeld', tileId: t.id, meldId: m.id };
        }
      }
    }
  } else if (c.mode === 'eldenBitme') {
    const part = findFullPartition(p.hand, 1);
    if (part && part.melds.length) return { type: 'lay', melds: ids(part.melds) };
  } else {
    const part = findPairPartition(p.hand, 7);
    if (part) return { type: 'lay', melds: ids(part.melds) };
  }

  return { type: 'discard', tileId: chooseDiscard(game, seat).id };
}

function meldCoverage(hand: Tile[]): number {
  return findGreedyMelds(hand, 0).reduce((n, m) => n + m.length, 0);
}

function hasDuplicate(hand: Tile[], t: Tile): boolean {
  return !t.joker && hand.some((o) => o !== t && !o.joker && o.color === t.color && o.value === t.value);
}

/** Taşın eldeki faydası: yüksek = tut, düşük = at. */
export function usefulness(game: Game, seat: number, hand: Tile[], t: Tile, inMeld: Set<number>): number {
  if (t.joker) return 1000;
  // İşlek taş atmak +50 ceza: elde tut.
  if (game.isIslek(t)) return 500;
  const p = game.state.players[seat];
  const c = game.contract;
  if (c.mode === 'ciftEli') return (hasDuplicate(hand, t) ? 50 : 0) - tilePenalty(t) * 0.1;

  let kutW = 1;
  let seriW = 1;
  if (c.mode === 'normal' && !p.opened) {
    const k = c.reqs.some((r) => r.kind === 'kut');
    const sr = c.reqs.some((r) => r.kind === 'seri');
    if (k && !sr) [kutW, seriW] = [1.6, 0.6];
    else if (sr && !k) [kutW, seriW] = [0.6, 1.6];
  }
  let score = inMeld.has(t.id) ? 40 : 0;
  const kutColors = new Set<string>();
  for (const o of hand) {
    if (o === t || o.joker) continue;
    if (o.value === t.value && o.color !== t.color) {
      if (!kutColors.has(o.color!)) {
        kutColors.add(o.color!);
        score += 6 * kutW;
      }
    } else if (o.color === t.color) {
      const d = Math.abs(o.value - t.value);
      if (d === 1) score += 7 * seriW;
      else if (d === 2) score += 3 * seriW;
    }
  }
  if (p.opened && c.mode === 'normal' && game.state.melds.some((m) => addPosition(m, t))) score += 12;
  return score - tilePenalty(t) * 0.15;
}

export function chooseDiscard(game: Game, seat: number): Tile {
  const hand = game.state.players[seat].hand;
  const inMeld = new Set(findGreedyMelds(hand, 0).flat().map((t) => t.id));
  let worst = hand[0];
  let worstScore = Infinity;
  for (const t of hand) {
    const sc = usefulness(game, seat, hand, t, inMeld);
    if (sc < worstScore) {
      worst = t;
      worstScore = sc;
    }
  }
  return worst;
}

function improvesContract(game: Game, seat: number, tile: Tile): boolean {
  const p = game.state.players[seat];
  const c = game.contract;
  if (c.mode !== 'normal' || p.opened) return false;
  return !findContractMelds(p.hand, c.reqs) && !!findContractMelds([...p.hand, tile], c.reqs);
}

/** Sıradaki oyuncu olarak yan taşı (cezasız) almalı mı? */
export function wantsDiscard(game: Game, seat: number, tile: Tile): boolean {
  const p = game.state.players[seat];
  const c = game.contract;
  if (tile.joker) return true;
  if (c.mode === 'ciftEli') return hasDuplicate([...p.hand, tile], tile);
  if (improvesContract(game, seat, tile)) return true;
  if (p.opened && game.isIslek(tile)) return true;
  const after = [...p.hand, tile];
  if (meldCoverage(after) > meldCoverage(p.hand)) return true;
  if (p.opened && c.mode === 'normal' && game.state.melds.some((m) => addPosition(m, tile))) return true;
  const inMeld = new Set(findGreedyMelds(after, 0).flat().map((t) => t.id));
  return usefulness(game, seat, after, tile, inMeld) >= 11;
}

/** Sırası olmadan yan taşı istemeli mi? (+1 ortadan taş cezası var) */
export function wantsClaim(game: Game, seat: number, tile: Tile): boolean {
  const p = game.state.players[seat];
  const c = game.contract;
  if (p.hand.length >= 18) return false;
  if (tile.joker) return true;
  if (c.mode === 'ciftEli') return hasDuplicate([...p.hand, tile], tile) && p.hand.length <= 15;
  if (improvesContract(game, seat, tile)) return true;
  if (p.opened) return false;
  return meldCoverage([...p.hand, tile]) >= meldCoverage(p.hand) + 3;
}
