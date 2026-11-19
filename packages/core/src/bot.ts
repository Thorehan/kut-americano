import { Action, Game } from './game';
import { MeldShape, addPosition, asAnyMeld, jokerSwapIndex, withTile } from './melds';
import { findContractMelds, findFullPartition, findGreedyMelds, findPairPartition, without } from './solver';
import { Tile, tilePenalty } from './tiles';

/**
 * Bot: sadece açık bilgiyle (kendi eli, masa, atılan taşlar, rakiplerin taş sayısı) oynar.
 * - Kuralı fırsat bulur bulmaz açar (zor kuralda kimse açamamışken öne geçmek için).
 * - Okeyi elde saklar; bu sıra bitebilecekse ya da bir rakip bitmeye yaklaştıysa
 *   (elde kalan okey +50 ceza) okeyi pere koyar.
 * - Tehlikede yüksek değerli taşlardan kurtulur.
 * Her botun temkin düzeyi biraz farklıdır (koltuğa göre), böylece hepsi aynı oynamaz.
 */

/** Bu koltuğun "tehlike" eşiği: rakip bu kadar ya da daha az taşa inince okeyini döker. */
function caution(seat: number): number {
  return [4, 3, 5, 4][seat % 4];
}

/** Bir rakip bitmeye yakın mı? (kuralı açmış ve az taşı kalmış ya da deste bitiyor) */
export function inDanger(game: Game, seat: number): boolean {
  const s = game.state;
  if (s.deck.length <= 8) return true;
  // Kuralı açmış rakip bir sırada birkaç per dizip bitebilir: eşik taş sayısının biraz üstü.
  return s.players.some((q) => game.isOpponent(seat, q.seat) && q.opened && !q.openedThisTurn && q.hand.length <= caution(seat) + 3);
}

/**
 * Bu sıra per dizip işleyerek bitilebiliyor mu?
 * reserve > 0: o kadar okey kenara ayrılır (son taş olarak ortaya vurulacak → okeyle bitiş);
 * bu durumda geri kalan her şeyin yere inmesi gerekir.
 */
export function canFinishThisTurn(game: Game, seat: number, reserve = 0): boolean {
  const s = game.state;
  const p = s.players[seat];
  if (game.contract.mode !== 'normal' || !p.opened || p.openedThisTurn) return false;
  const allJokers = p.hand.filter((t) => t.joker);
  if (allJokers.length < reserve) return false;
  const kept = allJokers.slice(0, reserve);
  const hand = without(p.hand, kept);
  const jokers = allJokers.length - reserve;
  const melds = findGreedyMelds(hand, jokers);
  let pool = without(hand, melds.flat());
  const table: MeldShape[] = [...s.melds, ...melds.map((m) => asAnyMeld(m)).filter((m): m is MeldShape => !!m)];
  let changed = true;
  while (changed && pool.length > 1) {
    changed = false;
    for (const t of [...pool].sort((a, b) => Number(a.joker) - Number(b.joker))) {
      const i = table.findIndex((m) => addPosition(m, t));
      if (i < 0) continue;
      const next = withTile(table[i], t);
      if (!next) continue;
      table[i] = next;
      pool = pool.filter((x) => x !== t);
      changed = true;
      break;
    }
  }
  return reserve > 0 ? pool.length === 0 : pool.length <= 1;
}

/** Her çağrıda tek bir hamle döndürür. */
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
      // Okey planı:
      //  - okeyi son taş bırakıp okeyle bitebiliyorsa: bir okeyi sakla, gerisini kullan (rakiplere ×2)
      //  - normal bitebiliyorsa ya da bir rakip bitmeye yakınsa: okeyleri pere koy (elde kalan okey +50)
      //  - aksi halde okeyi elde sakla
      const allJokers = p.hand.filter((t) => t.joker);
      const okeyFinish = allJokers.length > 0 && canFinishThisTurn(game, seat, 1);
      const useAll = !okeyFinish && (canFinishThisTurn(game, seat) || inDanger(game, seat));
      const reserved = okeyFinish ? allJokers[0] : null;
      const usable = p.hand.filter((t) => t !== reserved && (useAll || okeyFinish || !t.joker));
      const extra = findGreedyMelds(usable, usable.filter((t) => t.joker).length);
      if (extra.length) return { type: 'lay', melds: ids(extra) };
      if (game.canAddToMelds(seat)) {
        const ordered = [...usable].sort((a, b) => Number(a.joker) - Number(b.joker));
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
  // Rakip bitmeye yakınsa yüksek değerli taşlardan önce kurtul.
  const weight = inDanger(game, seat) ? 1.2 : 0.15;
  return score - tilePenalty(t) * weight;
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
