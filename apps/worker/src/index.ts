import { DurableObject } from 'cloudflare:workers';
import { CODE_ALPHABET, CODE_LENGTH, Client, ClientMsg, DEFAULT_TIMING, Room, ServerMsg, normalizeCode } from '@kut/core';

/**
 * Cloudflare Worker: bağlantıyı doğru odaya (Durable Object) yönlendirir.
 *   /ws?code=ABCD  → o odaya katıl / geri dön
 *   /ws?new=1      → yeni kod üret, o koda ait odaya bağlan (ilk mesaj 'create')
 *   /              → sağlık kontrolü
 * Her oda tek bir Durable Object'tir; oyun durumu onun belleğinde tutulur.
 */

export interface Env {
  ROOMS: DurableObjectNamespace<RoomDO>;
  ALLOWED_ORIGINS?: string;
}

function newCode(): string {
  const b = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => CODE_ALPHABET[x % CODE_ALPHABET.length]).join('');
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.headers.get('Upgrade') !== 'websocket') {
      return new Response('kut-server ok (cloudflare)\n', { headers: { 'content-type': 'text/plain; charset=utf-8', 'access-control-allow-origin': '*' } });
    }
    const allowed = (env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const origin = req.headers.get('Origin') ?? '';
    if (allowed.length && !allowed.includes(origin)) return new Response('origin not allowed', { status: 403 });

    const code = url.searchParams.get('new') ? newCode() : normalizeCode(url.searchParams.get('code') ?? '');
    if (code.length !== CODE_LENGTH) return new Response('bad room code', { status: 400 });
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    const fwd = new Request(req, { headers: new Headers(req.headers) });
    fwd.headers.set('x-room-code', code);
    return stub.fetch(fwd);
  },
};

class SocketClient implements Client {
  constructor(readonly ws: WebSocket) {}
  send(msg: ServerMsg) {
    try {
      this.ws.send(JSON.stringify(msg));
    } catch {
      /* kapanmış */
    }
  }
  close() {
    try {
      this.ws.close(1000, 'replaced');
    } catch {
      /* zaten kapalı */
    }
  }
}

const MAX_MSG = 8 * 1024;

/** Bir oda. WebSocket'ler açık kaldıkça bellekte yaşar; herkes çıkınca kendiliğinden kapanır. */
export class RoomDO extends DurableObject<Env> {
  private room: Room | null = null;
  private code = '';

  async fetch(req: Request): Promise<Response> {
    this.code = req.headers.get('x-room-code') ?? this.code;
    const pair = new WebSocketPair();
    const [clientSide, serverSide] = Object.values(pair) as [WebSocket, WebSocket];
    serverSide.accept();
    const client = new SocketClient(serverSide);
    serverSide.addEventListener('message', (e) => {
      const data = typeof e.data === 'string' ? e.data : '';
      if (!data || data.length > MAX_MSG) return;
      let msg: ClientMsg;
      try {
        msg = JSON.parse(data);
      } catch {
        return;
      }
      try {
        this.onMessage(client, msg);
      } catch (err) {
        console.error('mesaj hatası', err);
        client.send({ t: 'error', message: 'Sunucu hatası.' });
      }
    });
    const gone = () => this.room?.disconnect(client);
    serverSide.addEventListener('close', gone);
    serverSide.addEventListener('error', gone);
    return new Response(null, { status: 101, webSocket: clientSide });
  }

  private onMessage(client: SocketClient, msg: ClientMsg) {
    switch (msg.t) {
      case 'ping':
        client.send({ t: 'pong' });
        return;
      case 'create': {
        if (this.room && this.room.humans > 0) {
          // çok nadir: üretilen kod dolu bir odaya denk geldi
          client.send({ t: 'error', message: 'Oda kurulamadı, tekrar dene.', fatal: true });
          return;
        }
        this.room?.dispose();
        this.room = new Room(this.code, msg.mode === 'team' ? 'team' : 'solo', msg.ruleOrder === 'random' ? 'random' : 'classic', DEFAULT_TIMING, () => {
          /* herkes çıkınca Durable Object kendiliğinden uyur; oda bellekle birlikte gider */
        });
        this.room.join(client, msg.name, msg);
        return;
      }
      case 'join': {
        if (!this.room) return client.send({ t: 'error', message: 'Böyle bir oda yok. Kodu kontrol et.', fatal: true });
        const r = this.room.join(client, msg.name, msg);
        if (typeof r === 'string') client.send({ t: 'error', message: r, fatal: true });
        return;
      }
      case 'rejoin': {
        const seat = this.room?.rejoin(client, String(msg.token ?? ''));
        if (seat === null || seat === undefined) client.send({ t: 'error', message: 'Oda bulunamadı ya da süresi doldu.', fatal: true });
        return;
      }
      default:
        this.room?.handle(client, msg);
    }
  }
}
