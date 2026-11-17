import { GameEvent, GameState, PlayerState, RoundResult, SEATS } from './game';
import { Tile } from './tiles';

/**
 * Online oyunda bir oyuncuya gönderilecek görünüm:
 * - Koltuklar döndürülür: alıcı her zaman koltuk 0'dır (istemci kodu aynı kalır).
 * - Başkalarının eli ve destedeki taşlar gizlenir (sadece sayıları gider).
 *   Taş kimlikleri (id) renk/sayıya bağlı olduğu için gerçek id'ler de gönderilmez.
 * - El bitince (roundOver/gameOver) herkesin eli açılır (sonuç ekranı için).
 */

const hidden = (n: number, salt: number): Tile[] =>
  Array.from({ length: n }, (_, i) => ({ id: -(salt * 1000 + i + 1), color: null, value: 0, joker: false }));

/** Gerçek koltuktan görünüm koltuğuna. */
export function toView(actual: number, me: number): number {
  return actual < 0 ? actual : (actual - me + SEATS) % SEATS;
}

function rotate<T>(arr: readonly T[], me: number): T[] {
  return arr.map((_, v) => arr[(v + me) % SEATS]);
}

function rotateResult(r: RoundResult, me: number): RoundResult {
  return {
    ...r,
    winner: r.winner === null ? null : toView(r.winner, me),
    penalties: rotate(r.penalties, me),
    extras: rotate(r.extras ?? [0, 0, 0, 0], me),
    deltas: rotate(r.deltas, me),
  };
}

export function rotateEvents(events: readonly GameEvent[], me: number): GameEvent[] {
  return events.map((e) => ({ ...e, seat: toView(e.seat, me), target: e.target === undefined ? undefined : toView(e.target, me) }));
}

export function viewFor(state: GameState, me: number): GameState {
  const reveal = state.phase === 'roundOver' || state.phase === 'gameOver';
  const players: PlayerState[] = rotate(state.players, me).map((p, v) => ({
    ...p,
    seat: v,
    hand: v === 0 || reveal ? p.hand.slice() : hidden(p.hand.length, v),
    discards: p.discards.slice(),
  }));
  return {
    ...state,
    seed: 0,
    players,
    deck: hidden(state.deck.length, 9),
    melds: state.melds.map((m) => ({ ...m, owner: toView(m.owner, me), tiles: m.tiles.slice() })),
    starter: toView(state.starter, me),
    current: toView(state.current, me),
    pendingDiscard: state.pendingDiscard ? { ...state.pendingDiscard, from: toView(state.pendingDiscard.from, me) } : null,
    claim: state.claim
      ? { ...state.claim, from: toView(state.claim.from, me), queue: state.claim.queue.map((q) => toView(q, me)) }
      : null,
    extraPenalties: rotate(state.extraPenalties, me),
    history: state.history.map((r) => rotateResult(r, me)),
    contractOrder: state.contractOrder.slice(),
    log: [],
  };
}
