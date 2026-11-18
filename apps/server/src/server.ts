import { createServer, IncomingMessage, Server as HttpServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { Client, ClientMsg, DEFAULT_TIMING, Room, RoomTiming, ServerMsg, makeCode, normalizeCode } from '@kut/core';

export interface ServerOptions {
  port: number;
  timing?: Partial<RoomTiming>;
  /** Bağlantısız oda bu süreden sonra silinir (ms). */
  roomTtlMs?: number;
  /** İzin verilen tarayıcı kökenleri (boşsa hepsi). */
  allowedOrigins?: string[];
}

export interface RunningServer {
  http: HttpServer;
  wss: WebSocketServer;
  rooms: Map<string, Room>;
  port: number;
  close(): Promise<void>;
}

const MAX_MSG_BYTES = 8 * 1024;
const MAX_ROOMS = 2000;

class WsClient implements Client {
  room: Room | null = null;
  constructor(readonly ws: WebSocket) {}
  send(msg: ServerMsg) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }
  close() {
    try {
      this.ws.close();
    } catch {
      /* zaten kapalı */
    }
  }
}

export function startServer(opts: ServerOptions): Promise<RunningServer> {
  const timing: RoomTiming = { ...DEFAULT_TIMING, ...opts.timing };
  const rooms = new Map<string, Room>();
  const ttl = opts.roomTtlMs ?? 10 * 60_000;

  const http = createServer((req, res) => {
    // Sağlık kontrolü (barındırma servisleri için)
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'access-control-allow-origin': '*' });
    res.end(`kut-server ok · ${rooms.size} oda\n`);
  });

  const wss = new WebSocketServer({
    server: http,
    maxPayload: MAX_MSG_BYTES,
    verifyClient: (info: { origin: string; req: IncomingMessage }) =>
      !opts.allowedOrigins?.length || opts.allowedOrigins.includes(info.origin),
  });

  const removeRoom = (room: Room) => {
    // Kimse bağlı değilse bir süre bekle (yeniden bağlanma için), sonra sil.
    setTimeout(() => {
      if (room.connected === 0 && rooms.get(room.code) === room) {
        room.dispose();
        rooms.delete(room.code);
      }
    }, ttl);
  };

  wss.on('connection', (ws) => {
    const client = new WsClient(ws);
    const live = ws as WebSocket & { __alive?: boolean };
    live.__alive = true;
    ws.on('pong', () => (live.__alive = true));
    ws.on('message', (data) => {
      let msg: ClientMsg;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object') return;
      try {
        handle(client, msg);
      } catch (e) {
        console.error('mesaj hatası', e);
        client.send({ t: 'error', message: 'Sunucu hatası.' });
      }
    });
    ws.on('close', () => client.room?.disconnect(client));
  });

  function handle(client: WsClient, msg: ClientMsg) {
    switch (msg.t) {
      case 'ping':
        client.send({ t: 'pong' });
        return;
      case 'create': {
        if (client.room) client.room.leave(client);
        if (rooms.size >= MAX_ROOMS) return client.send({ t: 'error', message: 'Sunucu dolu, biraz sonra dene.', fatal: true });
        const code = makeCode((c) => rooms.has(c));
        const room = new Room(code, msg.mode === 'team' ? 'team' : 'solo', msg.ruleOrder === 'random' ? 'random' : 'classic', timing, removeRoom);
        rooms.set(code, room);
        client.room = room;
        room.join(client, msg.name);
        return;
      }
      case 'join': {
        const room = rooms.get(normalizeCode(String(msg.code ?? '')));
        if (!room) return client.send({ t: 'error', message: 'Böyle bir oda yok. Kodu kontrol et.', fatal: true });
        if (client.room && client.room !== room) client.room.leave(client);
        const r = room.join(client, msg.name);
        if (typeof r === 'string') return client.send({ t: 'error', message: r, fatal: true });
        client.room = room;
        return;
      }
      case 'rejoin': {
        const room = rooms.get(normalizeCode(String(msg.code ?? '')));
        const seat = room?.rejoin(client, String(msg.token ?? ''));
        if (!room || seat === null || seat === undefined) return client.send({ t: 'error', message: 'Oda bulunamadı ya da süresi doldu.', fatal: true });
        client.room = room;
        return;
      }
      default:
        client.room?.handle(client, msg);
    }
  }

  // Ölü bağlantıları temizle (30 sn'de bir ping; cevap vermeyen kapatılır)
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      const live = ws as WebSocket & { __alive?: boolean };
      if (live.__alive === false) {
        ws.terminate();
        continue;
      }
      live.__alive = false;
      ws.ping();
    }
  }, 30_000);

  return new Promise((resolve) => {
    http.listen(opts.port, () => {
      const addr = http.address();
      const port = typeof addr === 'object' && addr ? addr.port : opts.port;
      resolve({
        http,
        wss,
        rooms,
        port,
        close: () =>
          new Promise<void>((done) => {
            clearInterval(heartbeat);
            for (const r of rooms.values()) r.dispose();
            for (const ws of wss.clients) ws.terminate();
            wss.close(() => http.close(() => done()));
          }),
      });
    });
  });
}
