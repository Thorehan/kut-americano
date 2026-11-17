import { describe, expect, it } from 'vitest';
import { Game, decideBotAction, SEATS } from '../src';
import { tiles } from './helpers';

const allBots = [true, true, true, true];

function ok(r: ReturnType<Game['act']>) {
  if (!r.ok) throw new Error(r.error);
  return r;
}

describe('dağıtım', () => {
  it('başlayan 15, diğerleri 14 taş; ortada 49 taş; fazlalık taşı başlayanda', () => {
    const g = new Game({ seed: 1 });
    const s = g.state;
    expect(s.players[s.starter].hand).toHaveLength(15);
    expect(s.players.filter((p) => p.hand.length === 14)).toHaveLength(3);
    expect(s.deck).toHaveLength(49);
    expect(s.players[s.starter].hand).toContain(s.extraTile);
    expect(s.phase).toBe('action');
  });
});

describe('sıra akışı ve istek', () => {
  it('atılan taşı sıradaki cezasız alır', () => {
    const g = new Game({ seed: 2 });
    const s = g.state;
    const tile = s.players[0].hand[0];
    ok(g.act(0, { type: 'discard', tileId: tile.id }));
    expect(s.current).toBe(1);
    expect(s.phase).toBe('draw');
    ok(g.act(1, { type: 'takeDiscard' }));
    expect(s.players[1].hand).toHaveLength(15);
    expect(s.players[1].hand).toContain(tile);
    expect(s.players[0].discards).toHaveLength(0);
  });

  it('sıradaki ortadan çekerse diğerleri sırayla istenir; isteyen yan taş + 1 ortadan alır', () => {
    const g = new Game({ seed: 3 });
    const s = g.state;
    const tile = s.players[0].hand[0];
    ok(g.act(0, { type: 'discard', tileId: tile.id }));
    ok(g.act(1, { type: 'drawDeck' }));
    expect(s.phase).toBe('claim');
    expect(s.claim!.queue).toEqual([2, 3]);
    expect(g.act(3, { type: 'claim', want: true }).ok).toBe(false); // önce 2 sorulur
    ok(g.act(2, { type: 'claim', want: false }));
    const before = s.players[3].hand.length;
    ok(g.act(3, { type: 'claim', want: true }));
    expect(s.players[3].hand).toHaveLength(before + 2);
    expect(s.players[3].hand).toContain(tile);
    expect(s.phase).toBe('action');
    expect(s.current).toBe(1);
  });

  it('herkes pas geçerse sıradaki oynamaya devam eder', () => {
    const g = new Game({ seed: 4 });
    const s = g.state;
    ok(g.act(0, { type: 'discard', tileId: s.players[0].hand[0].id }));
    ok(g.act(1, { type: 'drawDeck' }));
    ok(g.act(2, { type: 'claim', want: false }));
    ok(g.act(3, { type: 'claim', want: false }));
    expect(s.phase).toBe('action');
    expect(s.claim).toBeNull();
    expect(s.players[0].discards).toHaveLength(1);
  });
});

describe('kural açma ve işleme', () => {
  function rigged() {
    const g = new Game({ seed: 5 }); // El 1: 3'lü Küt
    const p = g.state.players[0];
    p.hand = tiles('r7 y7 b7 k2 k3 k4 b1 b9 y11 r12 y13 k10 b5 r3 y8');
    return g;
  }

  it('kuralı sağlamayan açılış reddedilir', () => {
    const g = rigged();
    const h = g.state.players[0].hand;
    const r = g.act(0, { type: 'lay', melds: [[h[3].id, h[4].id, h[5].id]] }); // seri, ama kural küt
    expect(r.ok).toBe(false);
    expect(g.state.players[0].opened).toBe(false);
  });

  it('kural açılınca diğer perler de dizilebilir; aynı sırada işleme yok, sonraki sırada var', () => {
    const g = rigged();
    const s = g.state;
    const h = s.players[0].hand;
    ok(g.act(0, { type: 'lay', melds: [[h[0].id, h[1].id, h[2].id], [h[3].id, h[4].id, h[5].id]] }));
    expect(s.players[0].opened).toBe(true);
    expect(s.melds).toHaveLength(2);
    const k5 = tiles('k5')[0];
    s.players[0].hand.push(k5);
    const seri = s.melds.find((m) => m.kind === 'seri')!;
    expect(g.act(0, { type: 'addToMeld', tileId: k5.id, meldId: seri.id }).ok).toBe(false);
    // bir tur dön
    ok(g.act(0, { type: 'discard', tileId: s.players[0].hand[0].id }));
    for (let seat = 1; seat < SEATS; seat++) {
      ok(g.act(seat, { type: 'drawDeck' }));
      while (s.phase === 'claim') ok(g.act(s.claim!.queue[0], { type: 'claim', want: false }));
      ok(g.act(seat, { type: 'discard', tileId: s.players[seat].hand[0].id }));
    }
    ok(g.act(0, { type: 'drawDeck' }));
    while (s.phase === 'claim') ok(g.act(s.claim!.queue[0], { type: 'claim', want: false }));
    ok(g.act(0, { type: 'addToMeld', tileId: k5.id, meldId: seri.id }));
    expect(s.melds.find((m) => m.id === seri.id)!.tiles).toHaveLength(4);
  });

  it('kural açmadan bitilemez', () => {
    const g = new Game({ seed: 6 });
    const p = g.state.players[0];
    p.hand = tiles('r5');
    expect(g.act(0, { type: 'discard', tileId: p.hand[0].id }).ok).toBe(false);
  });
});

describe('puanlama', () => {
  function finishWith(mode: 'solo' | 'team', last: string, startRound = 0) {
    const g = new Game({ seed: 7, mode, startRound });
    const s = g.state;
    const p = s.players[0];
    p.opened = true;
    p.hand = tiles(last);
    s.turnJokers = p.hand.filter((x) => x.joker).length;
    s.players[1].hand = tiles('r10 b3'); // 13
    s.players[2].hand = tiles('k13'); // 10
    s.players[3].hand = tiles('J y2'); // 27
    ok(g.act(0, { type: 'discard', tileId: p.hand[0].id }));
    return g;
  }

  it('tekli normal bitiş: biten −50, diğerleri elde kalan', () => {
    const g = finishWith('solo', 'r4');
    expect(g.state.history[0].deltas).toEqual([-50, 13, 10, 27]);
    expect(g.state.phase).toBe('roundOver');
  });

  it('okey ile bitiş: −100 ve cezalar ×2', () => {
    const g = finishWith('solo', 'J');
    expect(g.state.history[0].finishType).toBe('okey');
    expect(g.state.history[0].deltas).toEqual([-100, 26, 20, 54]);
  });

  it('takım modu: karşı takım iki elin toplamını yazar', () => {
    const g = finishWith('team', 'r4');
    // takım 0 = koltuk 0 ve 2, takım 1 = koltuk 1 ve 3
    expect(g.state.history[0].deltas).toEqual([-50, 40, -50, 40]);
  });

  it('çift eli: puanlar ×2 (normal bitiş −100)', () => {
    const g = finishWith('solo', 'r4', 10);
    expect(g.state.history[0].deltas).toEqual([-100, 26, 20, 54]);
    expect(g.state.phase).toBe('gameOver');
  });
});

describe('deste biterse', () => {
  it('el berabere biter, herkes elindeki cezayı yazar', () => {
    const g = new Game({ seed: 8 });
    const s = g.state;
    s.deck = [];
    ok(g.act(0, { type: 'discard', tileId: s.players[0].hand[0].id }));
    expect(s.phase).toBe('roundOver');
    expect(s.history[0].winner).toBeNull();
    expect(s.history[0].deltas.every((d) => d > 0)).toBe(true);
  });
});

describe('bot simülasyonu', () => {
  for (const mode of ['solo', 'team'] as const) {
    it(`4 bot 11 eli hatasız bitirir (${mode})`, () => {
      for (let seed = 1; seed <= 4; seed++) {
        const g = new Game({ seed: seed * 101, mode, bots: allBots });
        const s = g.state;
        let steps = 0;
        let finishes = 0;
        while (s.phase !== 'gameOver') {
          if (++steps > 20000) throw new Error('sonsuz döngü');
          if (s.phase === 'roundOver') {
            if (s.history[s.history.length - 1].winner !== null) finishes++;
            ok(g.act(0, { type: 'nextRound' }));
            continue;
          }
          const seat = s.phase === 'claim' ? s.claim!.queue[0] : s.current;
          const total = s.players.reduce((n, p) => n + p.hand.length, 0);
          expect(total + s.deck.length + s.melds.reduce((n, m) => n + m.tiles.length, 0) + s.players.reduce((n, p) => n + p.discards.length, 0)).toBe(106);
          ok(g.act(seat, decideBotAction(g, seat)));
        }
        expect(s.history).toHaveLength(11);
        expect(finishes).toBeGreaterThan(3);
      }
    });
  }
});
