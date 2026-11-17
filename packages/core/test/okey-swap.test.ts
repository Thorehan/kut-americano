import { describe, expect, it } from 'vitest';
import { Game, Meld, asKut, asSeri, jokerSlots, jokerSwapIndex } from '../src';
import { tiles } from './helpers';

function ok(r: ReturnType<Game['act']>) {
  if (!r.ok) throw new Error(r.error);
  return r;
}

let meldId = 900;
function meld(owner: number, spec: string, kind: 'seri' | 'kut'): Meld {
  const sh = kind === 'seri' ? asSeri(tiles(spec)) : asKut(tiles(spec));
  if (!sh) throw new Error('geçersiz per: ' + spec);
  return { ...sh, id: meldId++, owner };
}

/** Sıra bende (koltuk 0), kuralım açık ve bu sırada açmadım. */
function setup(opts: { mode?: 'solo' | 'team'; hand: string; melds: Meld[]; opened?: boolean }) {
  const g = new Game({ seed: 21, mode: opts.mode ?? 'solo' });
  const s = g.state;
  const p = s.players[0];
  p.hand = tiles(opts.hand);
  p.opened = opts.opened ?? true;
  p.openedThisTurn = false;
  s.melds = opts.melds;
  return g;
}

describe('okeyin yerini tutan taş', () => {
  it('seride okeyin sayısı ve rengi bilinir', () => {
    const m = meld(1, 'r1 J r3', 'seri');
    expect(jokerSlots(m)).toEqual([{ index: 1, value: 2, colors: ['red'] }]);
    expect(jokerSwapIndex(m, tiles('r2')[0])).toBe(1);
    expect(jokerSwapIndex(m, tiles('b2')[0])).toBeNull();
  });
  it('kütte okeyin yerine eksik renklerden biri geçer', () => {
    const m = meld(1, 'r7 y7 J', 'kut');
    expect(jokerSwapIndex(m, tiles('b7')[0])).not.toBeNull();
    expect(jokerSwapIndex(m, tiles('k7')[0])).not.toBeNull();
    expect(jokerSwapIndex(m, tiles('r7')[0])).toBeNull();
    expect(jokerSwapIndex(m, tiles('b8')[0])).toBeNull();
  });
});

describe('okeyi alma', () => {
  it('rakibin 1-okey-3 serisine 2 koyunca okey elime gelir, rakibe +50 yazılır', () => {
    const m = meld(1, 'r1 J r3', 'seri');
    const g = setup({ hand: 'r2 b9 k11', melds: [m] });
    const s = g.state;
    const r2 = s.players[0].hand[0];
    ok(g.act(0, { type: 'swapJoker', tileId: r2.id, meldId: m.id }));
    expect(s.melds[0].tiles.map((t) => t.value)).toEqual([1, 2, 3]);
    expect(s.melds[0].tiles.some((t) => t.joker)).toBe(false);
    expect(s.players[0].hand.some((t) => t.joker)).toBe(true);
    expect(s.players[0].hand).toHaveLength(3);
    expect(s.extraPenalties).toEqual([0, 50, 0, 0]);
  });

  it('kütteki okey eksik renkle alınır', () => {
    const m = meld(2, 'r7 y7 J', 'kut');
    const g = setup({ hand: 'k7 b1', melds: [m] });
    ok(g.act(0, { type: 'swapJoker', tileId: g.state.players[0].hand[0].id, meldId: m.id }));
    expect(g.state.melds[0].tiles.map((t) => t.color)).toEqual(['red', 'yellow', 'black']);
    expect(g.state.extraPenalties[2]).toBe(50);
  });

  it('kendi perimdeki okeyi alırsam ceza yok', () => {
    const m = meld(0, 'b4 b5 J', 'seri');
    const g = setup({ hand: 'b6 r1', melds: [m] });
    ok(g.act(0, { type: 'swapJoker', tileId: g.state.players[0].hand[0].id, meldId: m.id }));
    expect(g.state.extraPenalties).toEqual([0, 0, 0, 0]);
  });

  it('takım modunda ortağımın perinden alırsam ceza yok, rakipten alırsam var', () => {
    const partner = meld(2, 'y9 y10 J', 'seri');
    const rival = meld(3, 'k2 J k4', 'seri');
    const g = setup({ mode: 'team', hand: 'y11 k3 r5', melds: [partner, rival] });
    const [y11, k3] = g.state.players[0].hand;
    ok(g.act(0, { type: 'swapJoker', tileId: y11.id, meldId: partner.id }));
    expect(g.state.extraPenalties).toEqual([0, 0, 0, 0]);
    ok(g.act(0, { type: 'swapJoker', tileId: k3.id, meldId: rival.id }));
    expect(g.state.extraPenalties).toEqual([0, 0, 0, 50]);
  });

  it('kural açılmadan okey alınmaz', () => {
    const m = meld(1, 'r1 J r3', 'seri');
    const g = setup({ hand: 'r2 b9', melds: [m], opened: false });
    expect(g.act(0, { type: 'swapJoker', tileId: g.state.players[0].hand[0].id, meldId: m.id }).ok).toBe(false);
  });

  it('kuralı açtığım sırada okey alınmaz', () => {
    const m = meld(1, 'r1 J r3', 'seri');
    const g = setup({ hand: 'r2 b9', melds: [m] });
    g.state.players[0].openedThisTurn = true;
    expect(g.act(0, { type: 'swapJoker', tileId: g.state.players[0].hand[0].id, meldId: m.id }).ok).toBe(false);
  });
});

describe('işlek taş', () => {
  it('işlek taşı tutmak serbest; atan taşı geri alır + ortadan 1 taş, +50 ceza yer, sıra geçer', () => {
    const m = meld(1, 'r1 J r3', 'seri');
    const g = setup({ hand: 'r2 b9 k11', melds: [m] });
    const s = g.state;
    const [r2] = s.players[0].hand;
    expect(g.isIslek(r2)).toBe(true);
    expect(g.isIslek(s.players[0].hand[1])).toBe(false);
    const deck = s.deck.length;
    ok(g.act(0, { type: 'discard', tileId: r2.id }));
    expect(s.extraPenalties).toEqual([50, 0, 0, 0]);
    expect(s.players[0].hand).toHaveLength(4);
    expect(s.players[0].hand).toContain(r2);
    expect(s.players[0].discards).toHaveLength(0);
    expect(s.deck).toHaveLength(deck - 1);
    expect(s.pendingDiscard).toBeNull();
    expect(s.current).toBe(1);
    expect(s.phase).toBe('draw');
  });

  it('pere işlenebilen taş da işlektir: rakibin 1-2-3 serisine 4 atılırsa geri gelir, +50, sıra geçer', () => {
    const m = meld(1, 'r1 r2 r3', 'seri');
    const g = setup({ hand: 'r4 b9 k11', melds: [m] });
    const s = g.state;
    const [r4] = s.players[0].hand;
    expect(g.isIslek(r4)).toBe(true);
    expect(g.canSwapJoker(r4)).toBe(false);
    ok(g.act(0, { type: 'discard', tileId: r4.id }));
    expect(s.extraPenalties[0]).toBe(50);
    expect(s.players[0].hand).toContain(r4);
    expect(s.players[0].hand).toHaveLength(4);
    expect(s.pendingDiscard).toBeNull();
    expect(s.current).toBe(1);
    // sıradaki oyuncu yan taşı alamaz, ortadan çeker
    expect(g.act(1, { type: 'takeDiscard' }).ok).toBe(false);
  });

  it('kütün eksik rengi işlektir, işlek olmayan taş normal atılır', () => {
    const m = meld(2, 'r7 y7 k7', 'kut');
    const g = setup({ hand: 'b7 b9 k11', melds: [m] });
    const s = g.state;
    const [b7, b9] = s.players[0].hand;
    expect(g.isIslek(b7)).toBe(true);
    expect(g.isIslek(b9)).toBe(false);
    ok(g.act(0, { type: 'discard', tileId: b9.id }));
    expect(s.extraPenalties[0]).toBe(0);
    expect(s.pendingDiscard?.tile).toBe(b9);
  });

  it('son taşı işlekse onunla bitilemez', () => {
    const m = meld(1, 'r1 J r3', 'seri');
    const g = setup({ hand: 'r2', melds: [m] });
    ok(g.act(0, { type: 'discard', tileId: g.state.players[0].hand[0].id }));
    expect(g.state.phase).toBe('draw');
    expect(g.state.players[0].hand).toHaveLength(2);
  });

  it('ek cezalar el sonu puanına çarpansız eklenir', () => {
    const m = meld(1, 'r1 J r3', 'seri');
    const g = setup({ hand: 'b9', melds: [m] });
    const s = g.state;
    s.players[1].hand = tiles('b5');
    s.players[2].hand = tiles('k3');
    s.players[3].hand = tiles('y4');
    s.extraPenalties[0] = 50; // daha önce işlek atmış
    s.extraPenalties[2] = 50; // daha önce okeyi alınmış
    ok(g.act(0, { type: 'discard', tileId: s.players[0].hand[0].id }));
    const h = s.history[0];
    expect(h.extras).toEqual([50, 0, 50, 0]);
    expect(h.deltas).toEqual([-50 + 50, 5, 3 + 50, 4]);
  });
});
