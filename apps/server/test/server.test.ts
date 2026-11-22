import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { Action, CONTRACTS, ClientMsg, Game, GameState, ServerMsg, decideBotAction } from '@kut/core';
import { RunningServer, startServer } from '../src/server';

let srv: RunningServer;

beforeEach(async () => {
  srv = await startServer({
    port: 0,
    timing: { scale: 0.02, turnMs: 60_000, claimMs: 60_000, nextRoundMs: 2_000, roundHoldMs: 500 },
    roomTtlMs: 50,
  });
});
afterEach(async () => {
  await srv.close();
});

class TestClient {
  ws: WebSocket;
  msgs: ServerMsg[] = [];
  private waiters: { pred: (m: ServerMsg) => boolean; resolve: (m: ServerMsg) => void }[] = [];
  onMsg?: (m: ServerMsg) => void;

  constructor(port: number) {
    this.ws = new WebSocket(`ws://localhost:${port}`);
    this.ws.on('message', (d) => {
      const m = JSON.parse(String(d)) as ServerMsg;
      this.msgs.push(m);
      this.onMsg?.(m);
      this.waiters = this.waiters.filter((w) => {
        if (w.pred(m)) {
          w.resolve(m);
          return false;
        }
        return true;
      });
    });
  }
  open() {
    return new Promise<void>((r) => this.ws.once('open', () => r()));
  }
  send(m: ClientMsg) {
    this.ws.send(JSON.stringify(m));
  }
  wait<T extends ServerMsg['t']>(t: T, pred: (m: Extract<ServerMsg, { t: T }>) => boolean = () => true, ms = 10_000) {
    const found = this.msgs.find((m) => m.t === t && pred(m as Extract<ServerMsg, { t: T }>));
    if (found) return Promise.resolve(found as Extract<ServerMsg, { t: T }>);
    return new Promise<Extract<ServerMsg, { t: T }>>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`beklenen mesaj gelmedi: ${t}`)), ms);
      this.waiters.push({
        pred: (m) => m.t === t && pred(m as Extract<ServerMsg, { t: T }>),
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m as Extract<ServerMsg, { t: T }>);
        },
      });
    });
  }
  lastState(): GameState | null {
    for (let i = this.msgs.length - 1; i >= 0; i--) {
      const m = this.msgs[i];
      if (m.t === 'state') return m.view;
    }
    return null;
  }
  close() {
    this.ws.close();
  }
}

async function client() {
  const c = new TestClient(srv.port);
  await c.open();
  return c;
}

/** İki insan oyunculu oda kurar ve başlatır. */
async function twoPlayerRoom() {
  const a = await client();
  a.send({ t: 'create', name: 'Ali', mode: 'solo', ruleOrder: 'classic' });
  const joined = await a.wait('joined');
  const b = await client();
  b.send({ t: 'join', code: joined.code.toLowerCase(), name: 'Banu' });
  await b.wait('joined');
  await a.wait('lobby', (m) => m.lobby.seats.filter((s) => s.human).length === 2);
  return { a, b, code: joined.code, tokenA: joined.token };
}

function hiddenOk(view: GameState) {
  const reveal = view.phase === 'roundOver' || view.phase === 'gameOver';
  if (!reveal) for (let s = 1; s < 4; s++) for (const t of view.players[s].hand) expect(t.id).toBeLessThan(0);
  for (const t of view.deck) expect(t.id).toBeLessThan(0);
  for (const t of view.players[0].hand) expect(t.id).toBeGreaterThanOrEqual(0);
  expect(view.seed).toBe(0);
}

describe('oda ve lobi', () => {
  it('oda kurulur, kodla katılınır, sadece kurucu başlatır', async () => {
    const { a, b } = await twoPlayerRoom();
    const lobbyB = await b.wait('lobby', (m) => m.lobby.seats.filter((s) => s.human).length === 2);
    expect(lobbyB.lobby.yourSeat).toBe(1);
    expect(lobbyB.lobby.hostSeat).toBe(0);
    b.send({ t: 'start' });
    await b.wait('error');
    a.send({ t: 'start' });
    const sa = await a.wait('state');
    const sb = await b.wait('state');
    // herkes kendini koltuk 0 görür
    expect(sa.view.players[0].name).toBe('Ali');
    expect(sb.view.players[0].name).toBe('Banu');
    expect(sb.view.players[3].name).toBe('Ali');
    expect(sa.view.players[2].isBot).toBe(true);
    hiddenOk(sa.view);
    hiddenOk(sb.view);
    a.close();
    b.close();
  });

  it('olmayan oda ve dolu oda reddedilir', async () => {
    const x = await client();
    x.send({ t: 'join', code: 'ZZZZ', name: 'X' });
    expect((await x.wait('error')).fatal).toBe(true);
    const host = await client();
    host.send({ t: 'create', name: 'H', mode: 'team', ruleOrder: 'random' });
    const { code } = await host.wait('joined');
    const others = await Promise.all([client(), client(), client()]);
    for (const o of others) {
      o.send({ t: 'join', code, name: 'O' });
      await o.wait('joined');
    }
    const fifth = await client();
    fifth.send({ t: 'join', code, name: 'F' });
    expect((await fifth.wait('error')).message).toMatch(/dolu/);
    [x, host, fifth, ...others].forEach((c) => c.close());
  });
});

describe('oyun', () => {
  it('iki insan + iki bot oyunu sonuna kadar oynar; hiçbir mesajda gizli el sızmaz', { timeout: 90_000 }, async () => {
    const { a, b } = await twoPlayerRoom();
    // Her istemci sırası gelince kendi görünümünden bot mantığıyla oynar.
    for (const c of [a, b]) {
      c.onMsg = (m) => {
        if (m.t !== 'state') return;
        hiddenOk(m.view);
        const s = m.view;
        const mine =
          (s.phase === 'claim' && s.claim!.queue[0] === 0) || ((s.phase === 'draw' || s.phase === 'action') && s.current === 0);
        if (mine) {
          const action: Action = decideBotAction(Game.fromState(s), 0);
          setTimeout(() => c.send({ t: 'act', action }), 1);
        }
      };
    }
    a.send({ t: 'start' });
    const end = await a.wait('state', (m) => m.view.phase === 'gameOver', 80_000);
    expect(end.view.history).toHaveLength(CONTRACTS.length);
    // iki tarafın gördüğü toplam puanlar aynı (koltuk döndürülmüş olarak)
    const endB = await b.wait('state', (m) => m.view.phase === 'gameOver');
    expect(endB.view.players[3].score).toBe(end.view.players[0].score);
    a.close();
    b.close();
  });

  it('kopan oyuncu jetonla geri döner ve kaldığı yerden görür', async () => {
    const { a, b, code, tokenA } = await twoPlayerRoom();
    a.send({ t: 'start' });
    await a.wait('state');
    a.close();
    await b.wait('state', (m) => m.online[3] === false);
    const a2 = await client();
    a2.send({ t: 'rejoin', code, token: tokenA });
    const st = await a2.wait('state');
    expect(st.view.players[0].name).toBe('Ali');
    expect(st.view.players[0].hand.length).toBeGreaterThanOrEqual(14);
    a2.close();
    b.close();
  });

  it('geçersiz hamle hata döner, oyunu bozmaz', async () => {
    const { a, b } = await twoPlayerRoom();
    a.send({ t: 'start' });
    const st = await a.wait('state');
    // Ali başlar (koltuk 0, 15 taş, action). Sırası olmayan Banu atmaya çalışır:
    expect(st.view.current).toBe(0);
    b.send({ t: 'act', action: { type: 'discard', tileId: 1 } });
    expect((await b.wait('error')).message).toBeTruthy();
    a.close();
    b.close();
  });
});

describe('kopma süresi', () => {
  it('sırası gelen oyuncu koparsa bot hemen oynamaz; süre içinde dönerse sıra onda kalır', async () => {
    await srv.close();
    srv = await startServer({
      port: 0,
      timing: { scale: 1, turnMs: 60_000, claimMs: 60_000, nextRoundMs: 60_000, roundHoldMs: 0, disconnectGraceMs: 1_500 },
      roomTtlMs: 50,
    });
    const { a, b, code, tokenA } = await twoPlayerRoom();
    a.send({ t: 'start' });
    const st = await a.wait('state');
    expect(st.view.current).toBe(0); // Ali başlar
    a.close();
    await new Promise((r) => setTimeout(r, 500));
    const a2 = await client();
    a2.send({ t: 'rejoin', code, token: tokenA });
    const back = await a2.wait('state');
    expect(back.view.current).toBe(0);
    expect(back.view.players[0].hand).toHaveLength(15); // bot oynamadı
    a2.close();
    b.close();
  });
});
