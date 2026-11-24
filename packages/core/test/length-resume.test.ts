import { describe, expect, it } from 'vitest';
import { CONTRACTS, Game, GameState, SHORT_ORDER, SHORT_ROUNDS, decideBotAction } from '../src';

/** Botları belirli sayıda hamle oynatır (ya da oyun bitene kadar). */
function play(g: Game, maxSteps = 40000, stopAfterSteps = Infinity) {
  const s = g.state;
  let steps = 0;
  while (s.phase !== 'gameOver' && steps < stopAfterSteps) {
    if (++steps > maxSteps) throw new Error('sonsuz döngü');
    if (s.phase === 'roundOver') {
      g.act(0, { type: 'nextRound' });
      continue;
    }
    const seat = s.phase === 'claim' ? s.claim!.queue[0] : s.current;
    const r = g.act(seat, decideBotAction(g, seat));
    if (!r.ok) throw new Error(r.error);
  }
}

describe('kısa oyun (5 el)', () => {
  it('sıralı kısa oyun belirlenen 5 kuralla oynanır ve 5 elde biter', () => {
    const g = new Game({ seed: 5, length: 'short', bots: [true, true, true, true] });
    expect(g.totalRounds).toBe(SHORT_ROUNDS);
    expect(g.state.contractOrder).toEqual([...SHORT_ORDER]);
    play(g);
    expect(g.state.history.map((h) => h.contractName)).toEqual(SHORT_ORDER.map((i) => CONTRACTS[i].name));
  });

  it('rastgele kısa oyun 5 el sürer', () => {
    const g = new Game({ seed: 9, length: 'short', ruleOrder: 'random', bots: [true, true, true, true] });
    expect(g.state.contractOrder).toHaveLength(SHORT_ROUNDS);
    play(g);
    expect(g.state.history).toHaveLength(SHORT_ROUNDS);
  });

  it('tam oyun hâlâ 15 el', () => {
    expect(new Game({ seed: 1 }).totalRounds).toBe(CONTRACTS.length);
  });
});

describe('kaydedilen oyunu sürdürme', () => {
  it('JSON kaydından geri yüklenen oyun aynı durumdan hatasız devam eder', () => {
    const g = new Game({ seed: 21, length: 'short', bots: [true, true, true, true] });
    play(g, 40000, 300); // ikinci-üçüncü ele kadar oyna
    const saved = JSON.parse(JSON.stringify(g.state)) as GameState;
    const r = Game.restore(saved);
    expect(r.state.roundIndex).toBe(g.state.roundIndex);
    expect(r.state.players.map((p) => p.hand.length)).toEqual(g.state.players.map((p) => p.hand.length));
    expect(r.contract.name).toBe(g.contract.name);
    play(r);
    expect(r.state.phase).toBe('gameOver');
    expect(r.state.history).toHaveLength(SHORT_ROUNDS);
  });
});
