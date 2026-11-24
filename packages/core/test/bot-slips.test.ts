import { describe, expect, it } from 'vitest';
import { Game, decideBotAction } from '../src';

describe('bot insansı hataları', () => {
  it('botlar ara sıra (ama seyrek) işlek atar; oyunlar yine hatasız biter', () => {
    let islek = 0;
    let discards = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const g = new Game({ seed: seed * 101, length: 'short', bots: [true, true, true, true] });
      const s = g.state;
      let steps = 0;
      while (s.phase !== 'gameOver') {
        if (++steps > 40000) throw new Error('sonsuz döngü');
        if (s.phase === 'roundOver') {
          g.act(0, { type: 'nextRound' });
          continue;
        }
        const seat = s.phase === 'claim' ? s.claim!.queue[0] : s.current;
        const r = g.act(seat, decideBotAction(g, seat));
        if (!r.ok) throw new Error(r.error);
        for (const e of r.events) {
          if (e.type === 'islek') islek++;
          if (e.type === 'discard' || e.type === 'islek') discards++;
        }
      }
    }
    expect(islek).toBeGreaterThan(0);
    expect(islek / discards).toBeLessThan(0.08);
  });
});
