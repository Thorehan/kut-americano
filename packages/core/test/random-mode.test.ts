import { describe, expect, it } from 'vitest';
import { CONTRACTS, Game, RANDOM_MAX_REPEAT, RANDOM_WEIGHTS, decideBotAction, mulberry32, randomContractOrder } from '../src';

describe('rastgele mod oranları', () => {
  it('ağırlıklar toplamı 100 (doğrudan yüzde)', () => {
    expect(RANDOM_WEIGHTS).toHaveLength(CONTRACTS.length);
    expect(RANDOM_WEIGHTS.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('her el için kural üretir; aynı kural art arda gelmez, en fazla 2 kez gelir', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const order = randomContractOrder(mulberry32(seed));
      expect(order).toHaveLength(CONTRACTS.length);
      for (let i = 1; i < order.length; i++) expect(order[i]).not.toBe(order[i - 1]);
      const counts = CONTRACTS.map((_, c) => order.filter((x) => x === c).length);
      expect(Math.max(...counts)).toBeLessThanOrEqual(RANDOM_MAX_REPEAT);
    }
  });

  it('ilk el her kural olabilir ve oranlara yakın dağılır', () => {
    const N = 20000;
    const first = CONTRACTS.map(() => 0);
    for (let seed = 1; seed <= N; seed++) first[randomContractOrder(mulberry32(seed))[0]]++;
    first.forEach((n, i) => {
      expect(n).toBeGreaterThan(0);
      expect(Math.abs((n / N) * 100 - RANDOM_WEIGHTS[i])).toBeLessThan(1.5);
    });
    expect(first[CONTRACTS.findIndex((c) => c.name === "5'li Seri")]).toBeGreaterThan(0); // 5'li seri ilk el olabilir
  });
});

describe('rastgele mod oyunu', () => {
  it('aynı seed aynı sırayı verir; klasik mod 1→15 sırayla gider', () => {
    const a = new Game({ seed: 77, ruleOrder: 'random' });
    const b = new Game({ seed: 77, ruleOrder: 'random' });
    expect(a.state.contractOrder).toEqual(b.state.contractOrder);
    expect(a.contract).toBe(CONTRACTS[a.state.contractOrder[0]]);
    const c = new Game({ seed: 77 });
    expect(c.state.contractOrder).toEqual(CONTRACTS.map((_, i) => i));
    expect(c.contract).toBe(CONTRACTS[0]);
  });

  it('klasik modun dağıtımı rastgele mod eklenince değişmedi', () => {
    const g = new Game({ seed: 1 });
    expect(g.state.players[0].hand.map((t) => t.id).slice(0, 5)).toEqual(new Game({ seed: 1, ruleOrder: 'classic' }).state.players[0].hand.map((t) => t.id).slice(0, 5));
  });

  it('4 bot rastgele modda tüm elleri hatasız bitirir', () => {
    for (let seed = 1; seed <= 3; seed++) {
      const g = new Game({ seed: seed * 31, ruleOrder: 'random', bots: [true, true, true, true] });
      const s = g.state;
      const seen: string[] = [];
      let steps = 0;
      seen.push(g.contract.name);
      while (s.phase !== 'gameOver') {
        if (++steps > 25000) throw new Error('sonsuz döngü');
        if (s.phase === 'roundOver') {
          g.act(0, { type: 'nextRound' });
          seen.push(g.contract.name);
          continue;
        }
        const seat = s.phase === 'claim' ? s.claim!.queue[0] : s.current;
        const r = g.act(seat, decideBotAction(g, seat));
        if (!r.ok) throw new Error(r.error);
      }
      expect(s.history.map((h) => h.contractName)).toEqual(seen);
      expect(s.history).toHaveLength(CONTRACTS.length);
    }
  });
});
