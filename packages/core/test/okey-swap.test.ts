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
  it("3'lü kütte okeyin rengi belli değil: alınamaz", () => {
    const m = meld(1, 'r7 y7 J', 'kut');
    expect(jokerSlots(m)).toEqual([]);
    expect(jokerSwapIndex(m, tiles('b7')[0])).toBeNull();
    expect(jokerSwapIndex(m, tiles('k7')[0])).toBeNull();
  });
  it("4'lü kütte okey tek eksik rengin yerindedir: sadece o renkle alınır", () => {
    const m = meld(1, 'r7 y7 b7 J', 'kut');
    expect(jokerSwapIndex(m, tiles('k7')[0])).not.toBeNull();
    expect(jokerSwapIndex(m, tiles('r7')[0])).toBeNull();
    expect(jokerSwapIndex(m, tiles('k8')[0])).toBeNull();
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

  it("4'lü kütteki okey eksik renkle alınır, 3'lü kütteki alınamaz", () => {
    const four = meld(2, 'r7 y7 b7 J', 'kut');
    const three = meld(3, 'r5 y5 J', 'kut');
    const g = setup({ hand: 'k7 k5 b1', melds: [four, three] });
    const [k7, k5] = g.state.players[0].hand;
    expect(g.act(0, { type: 'swapJoker', tileId: k5.id, meldId: three.id }).ok).toBe(false);
    ok(g.act(0, { type: 'swapJoker', tileId: k7.id, meldId: four.id }));
    expect(g.state.melds[0].tiles.map((t) => t.color)).toEqual(['red', 'yellow', 'blue', 'black']);
    expect(g.state.extraPenalties[2]).toBe(50);
    // 3'lü küte eksik renk yine işlenebilir (4'lü olur)
    ok(g.act(0, { type: 'addToMeld', tileId: k5.id, meldId: three.id }));
    expect(g.state.melds[1].tiles).toHaveLength(4);
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

  it('son taş işlek olsa da ortaya vurulur ve el biter; ceza yok, yana düşmez', () => {
    const m = meld(1, 'r1 J r3', 'seri');
    const g = setup({ hand: 'r2', melds: [m] });
    const s = g.state;
    const [r2] = s.players[0].hand;
    expect(g.isIslek(r2)).toBe(true);
    ok(g.act(0, { type: 'discard', tileId: r2.id }));
    expect(s.phase).toBe('roundOver');
    expect(s.history[0].winner).toBe(0);
    expect(s.extraPenalties[0]).toBe(0);
    expect(s.finishTiles).toEqual([r2]);
    expect(s.players[0].discards).not.toContain(r2);
    expect(s.pendingDiscard).toBeNull();
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

describe('elde kalan okey', () => {
  it('el bitince elinde okey kalan rakibe okey başına +50 yazılır ve duyurulur', () => {
    const g = setup({ hand: 'b9', melds: [] });
    const s = g.state;
    s.players[1].hand = tiles('J r3');
    s.players[2].hand = tiles('J J k1');
    s.players[3].hand = tiles('y4');
    const r = ok(g.act(0, { type: 'discard', tileId: s.players[0].hand[0].id }));
    const held = r.events.filter((e) => e.type === 'okeyHeld');
    expect(held.map((e) => e.seat)).toEqual([1, 2]);
    expect(s.history[0].extras).toEqual([0, 50, 100, 0]);
    // okey taşı değeri (25) de ceza olarak sayılır
    expect(s.history[0].deltas[1]).toBe(25 + 3 + 50);
  });

  it('takım modunda bitiren takımın okeyi cezalanmaz', () => {
    const g = setup({ mode: 'team', hand: 'b9', melds: [] });
    const s = g.state;
    s.players[2].hand = tiles('J'); // ortak
    s.players[1].hand = tiles('J'); // rakip
    s.players[3].hand = tiles('y4');
    ok(g.act(0, { type: 'discard', tileId: s.players[0].hand[0].id }));
    expect(s.history[0].extras).toEqual([0, 50, 0, 0]);
  });
});

describe('okey ile bitiş türleri', () => {
  it('son taş tek okeyse: okey ile bitiş ×2 (elde başka okey olsa bile önceki sırada)', () => {
    const g = setup({ hand: 'J', melds: [] });
    const s = g.state;
    s.turnJokers = 2; // eski kural bunu çift okey sayıyordu
    s.players[1].hand = tiles('r3');
    ok(g.act(0, { type: 'discard', tileId: s.players[0].hand[0].id }));
    expect(s.history[0].finishType).toBe('okey');
    expect(s.history[0].multiplier).toBe(2);
    expect(s.finishTiles).toHaveLength(1);
  });

  it('elde sadece iki okey kaldıysa ikisi birden ortaya vurulur: çift okey ×4', () => {
    const g = setup({ hand: 'J J', melds: [] });
    const s = g.state;
    s.players[1].hand = tiles('r3');
    s.players[2].hand = tiles('k1');
    s.players[3].hand = tiles('y4');
    ok(g.act(0, { type: 'finishDoubleOkey' }));
    const h = s.history[0];
    expect(h.finishType).toBe('ciftOkey');
    expect(h.multiplier).toBe(4);
    expect(h.deltas).toEqual([-200, 12, 4, 16]);
    expect(s.finishTiles).toHaveLength(2);
  });

  it('iki okey + başka taş varken çift okey yapılamaz', () => {
    const g = setup({ hand: 'J J r5', melds: [] });
    expect(g.act(0, { type: 'finishDoubleOkey' }).ok).toBe(false);
  });

  it('çift elinde: okey ×4, çift okey ×8', () => {
    const g1 = new Game({ seed: 3, startRound: 10 });
    g1.state.players[0].hand = tiles('J');
    g1.state.players[0].opened = true;
    g1.state.players[1].hand = tiles('r3');
    ok(g1.act(0, { type: 'discard', tileId: g1.state.players[0].hand[0].id }));
    expect(g1.state.history[0].multiplier).toBe(4);
    const g2 = new Game({ seed: 3, startRound: 10 });
    g2.state.players[0].hand = tiles('J J');
    g2.state.players[0].opened = true;
    g2.state.players[1].hand = tiles('r3');
    ok(g2.act(0, { type: 'finishDoubleOkey' }));
    expect(g2.state.history[0].multiplier).toBe(8);
    expect(g2.state.history[0].deltas[0]).toBe(-400);
  });
});
