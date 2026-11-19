/**
 * Platformdan bağımsız oda mantığı: hem Node sunucusu (apps/server) hem de
 * Cloudflare Durable Object (apps/worker) aynı Room sınıfını kullanır.
 */
import { decideBotAction } from './bot';
import { RuleOrder } from './contracts';
import { Action, Game, GameEvent, GameMode, SEATS } from './game';
import { ClientMsg, CODE_ALPHABET, CODE_LENGTH, LobbyInfo, ServerMsg } from './protocol';
import { rotateEvents, toView, viewFor } from './view';

/** Bir koltuğa bağlı istemci (WebSocket soyutlaması — testte sahte de olabilir). */
export interface Client {
  send(msg: ServerMsg): void;
  close(): void;
}

interface Seat {
  name: string;
  avatar?: string;
  color?: number;
  token: string;
  client: Client | null;
  /** Bağlantısı kopsa da koltuk bu oyuncunun (yeniden bağlanabilir). */
  human: boolean;
}

export interface RoomTiming {
  /** Bot/oto hamle gecikmeleri bu katsayıyla çarpılır (test için küçültülür). */
  scale: number;
  /** İnsan oyuncunun sırası için süre (ms) — dolarsa bot onun yerine oynar. */
  turnMs: number;
  /** Yan taş isteği sorusu süresi (ms). */
  claimMs: number;
  /** El sonu ekranından sonra otomatik sonraki ele geçiş (ms). */
  nextRoundMs: number;
  /** El başı duyurusu için botların bekleme süresi (ms). */
  roundHoldMs: number;
  /** Bağlantısı kopan oyuncunun sırası: bot devralmadan önce geri dönmesi için beklenen süre (ms). */
  disconnectGraceMs: number;
}

export const DEFAULT_TIMING: RoomTiming = {
  scale: 1,
  turnMs: 45_000,
  claimMs: 9_000,
  nextRoundMs: 25_000,
  roundHoldMs: 3_500,
  disconnectGraceMs: 15_000,
};

const BOT_NAMES = ['Bot Ayla', 'Bot Cem', 'Bot Derya', 'Bot Emre'];

function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

export function newToken(): string {
  return Array.from(randomBytes(16), (x) => x.toString(16).padStart(2, '0')).join('');
}

export class Room {
  readonly seats: (Seat | null)[] = [null, null, null, null];
  hostSeat = 0;
  game: Game | null = null;
  lastActive = Date.now();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private holdUntil = 0;

  constructor(
    readonly code: string,
    public mode: GameMode,
    public ruleOrder: RuleOrder,
    private timing: RoomTiming = DEFAULT_TIMING,
    private onEmpty: (room: Room) => void = () => {},
  ) {}

  // ---------------------------------------------------------------- koltuklar

  get humans(): number {
    return this.seats.filter((s) => s?.human).length;
  }

  get connected(): number {
    return this.seats.filter((s) => s?.client).length;
  }

  /** Lobiye katıl: ilk boş koltuğa oturur. */
  join(client: Client, name: string, look: { avatar?: unknown; color?: unknown } = {}): number | string {
    if (this.game) return 'Bu odada oyun başladı.';
    const seat = this.seats.findIndex((s) => s === null);
    if (seat < 0) return 'Oda dolu.';
    const token = newToken();
    this.seats[seat] = { name: cleanName(name, seat), token, client, human: true, ...cleanLook(look) };
    if (this.humans === 1) this.hostSeat = seat;
    client.send({ t: 'joined', code: this.code, token, seat });
    this.touch();
    this.broadcastLobby();
    return seat;
  }

  rejoin(client: Client, token: string): number | null {
    const seat = this.seats.findIndex((s) => s?.token === token);
    if (seat < 0) return null;
    const s = this.seats[seat]!;
    if (s.client && s.client !== client) s.client.close();
    s.client = client;
    client.send({ t: 'joined', code: this.code, token, seat });
    this.touch();
    this.broadcastLobby();
    if (this.game) {
      this.broadcastPresence();
      this.schedule(); // geri dönen oyuncunun sırasıysa normal süre başlar
    }
    return seat;
  }

  /** Bağlantı koptu: koltuk korunur, sırası gelirse bot oynar. */
  disconnect(client: Client) {
    const seat = this.seatOf(client);
    if (seat < 0) return;
    this.seats[seat]!.client = null;
    this.broadcastLobby();
    if (this.game) {
      this.broadcastPresence();
      this.schedule();
    }
    if (this.connected === 0) this.onEmpty(this);
  }

  /** Bilerek ayrıldı: lobide koltuk boşalır, oyunda bot devralır. */
  leave(client: Client) {
    const seat = this.seatOf(client);
    if (seat < 0) return;
    client.send({ t: 'left' });
    if (this.game) {
      const s = this.seats[seat]!;
      s.client = null;
      s.human = false;
      s.token = newToken();
      this.game.state.players[seat].isBot = true;
      this.broadcastPresence();
      this.schedule();
    } else {
      this.seats[seat] = null;
    }
    if (seat === this.hostSeat) {
      const next = this.seats.findIndex((s) => s?.human && s.client);
      if (next >= 0) this.hostSeat = next;
    }
    this.broadcastLobby();
    if (this.connected === 0) this.onEmpty(this);
  }

  seatOf(client: Client): number {
    return this.seats.findIndex((s) => s?.client === client);
  }

  // ---------------------------------------------------------------- mesajlar

  handle(client: Client, msg: ClientMsg) {
    const seat = this.seatOf(client);
    if (seat < 0) return;
    this.touch();
    switch (msg.t) {
      case 'settings':
        if (seat !== this.hostSeat || this.game) return;
        this.mode = msg.mode === 'team' ? 'team' : 'solo';
        this.ruleOrder = msg.ruleOrder === 'random' ? 'random' : 'classic';
        this.broadcastLobby();
        return;
      case 'start':
        // Kurucu bağlı değilse odadaki herhangi biri başlatabilir.
        if (seat !== this.hostSeat && this.seats[this.hostSeat]?.client) {
          return client.send({ t: 'error', message: 'Oyunu sadece odayı kuran başlatabilir.' });
        }
        if (this.game && this.game.state.phase !== 'gameOver') return;
        this.start();
        return;
      case 'act':
        this.act(seat, msg.action, client);
        return;
      case 'leave':
        this.leave(client);
        return;
    }
  }

  start() {
    let b = 0;
    const names = this.seats.map((s) => (s?.human ? s.name : BOT_NAMES[b++ % BOT_NAMES.length]));
    const bots = this.seats.map((s) => !s?.human);
    const profiles = this.seats.map((s, i) => (s?.human ? { avatar: s.avatar, color: s.color } : { avatar: BOT_AVATARS[i % BOT_AVATARS.length], color: 0x4a4f57 }));
    this.game = new Game({ mode: this.mode, ruleOrder: this.ruleOrder, names, bots, profiles });
    this.holdUntil = Date.now() + this.timing.roundHoldMs * this.timing.scale;
    this.broadcastLobby();
    this.broadcast(this.game.state.log.slice(-1));
    this.schedule();
  }

  private act(seat: number, action: Action, client: Client | null) {
    const g = this.game;
    if (!g) return;
    const r = g.act(seat, action);
    if (!r.ok) {
      client?.send({ t: 'error', message: r.error });
      return;
    }
    if (r.events.some((e) => e.type === 'roundStart')) this.holdUntil = Date.now() + this.timing.roundHoldMs * this.timing.scale;
    this.broadcast(r.events);
    this.schedule();
  }

  // ---------------------------------------------------------------- sıra / botlar

  /** Sıradaki kimse, onun için zamanlayıcı kurar: bot hemen (gecikmeli), insan süre dolunca. */
  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const g = this.game;
    if (!g) return;
    const s = g.state;
    const sc = this.timing.scale;

    if (s.phase === 'gameOver') return;
    if (s.phase === 'roundOver') {
      this.timer = setTimeout(() => this.act(0, { type: 'nextRound' }, null), this.timing.nextRoundMs * sc);
      return;
    }
    const seat = s.phase === 'claim' ? s.claim!.queue[0] : s.current;
    const human = this.seats[seat]?.human && this.seats[seat]?.client;
    const away = this.seats[seat]?.human && !this.seats[seat]?.client;
    const hold = Math.max(0, this.holdUntil - Date.now());
    let delay: number;
    if (human) {
      delay = hold + (s.phase === 'claim' ? this.timing.claimMs : this.timing.turnMs) * sc;
    } else if (away) {
      // kısa kopmalarda (sayfa yenileme, tünel) hemen bot oynamasın
      delay = hold + (s.phase === 'claim' ? this.timing.claimMs : this.timing.disconnectGraceMs) * sc;
    } else {
      delay = hold + (s.phase === 'claim' ? 420 : s.phase === 'draw' ? 650 : 560) * sc;
    }
    this.timer = setTimeout(() => this.autoPlay(seat), delay);
  }

  /** Bot hamlesi ya da süresi dolan insan için otomatik hamle. */
  private autoPlay(seat: number) {
    this.timer = null;
    const g = this.game;
    if (!g) return;
    const s = g.state;
    const now = s.phase === 'claim' ? s.claim!.queue[0] : s.current;
    if (now !== seat || s.phase === 'roundOver' || s.phase === 'gameOver') return this.schedule();
    const human = !!this.seats[seat]?.human;
    // Süresi dolan insan: isteğe "hayır" de, sırasını bot mantığıyla oyna.
    const action: Action = human && s.phase === 'claim' ? { type: 'claim', want: false } : decideBotAction(g, seat);
    const r = g.act(seat, action);
    if (!r.ok) {
      const fallback: Action =
        s.phase === 'draw'
          ? { type: 'drawDeck' }
          : s.phase === 'claim'
            ? { type: 'claim', want: false }
            : { type: 'discard', tileId: s.players[seat].hand[0].id };
      const r2 = g.act(seat, fallback);
      if (!r2.ok) return;
      this.broadcast(r2.events);
    } else {
      if (r.events.some((e) => e.type === 'roundStart')) this.holdUntil = Date.now() + this.timing.roundHoldMs * this.timing.scale;
      this.broadcast(r.events);
    }
    this.schedule();
  }

  // ---------------------------------------------------------------- yayın

  private online(): boolean[] {
    return this.seats.map((s) => !!s?.client);
  }

  private sendState(seat: number, events: GameEvent[]) {
    const s = this.seats[seat];
    if (!s?.client || !this.game) return;
    const online = this.online();
    s.client.send({
      t: 'state',
      view: viewFor(this.game.state, seat),
      events: rotateEvents(events, seat),
      online: online.map((_, v) => online[(v + seat) % SEATS]),
    });
  }

  private broadcast(events: GameEvent[]) {
    for (let seat = 0; seat < SEATS; seat++) this.sendState(seat, events);
  }

  private broadcastPresence() {
    this.broadcast([]);
  }

  lobbyFor(seat: number): LobbyInfo {
    return {
      code: this.code,
      seats: this.seats.map((s, i) => ({
        name: s?.human ? s.name : '',
        avatar: s?.human ? s.avatar : undefined,
        color: s?.human ? s.color : undefined,
        human: !!s?.human,
        connected: !!s?.client,
        you: i === seat,
      })),
      hostSeat: this.hostSeat,
      yourSeat: seat,
      mode: this.mode,
      ruleOrder: this.ruleOrder,
      started: !!this.game && this.game.state.phase !== 'gameOver',
    };
  }

  private broadcastLobby() {
    this.seats.forEach((s, i) => s?.client?.send({ t: 'lobby', lobby: this.lobbyFor(i) }));
  }

  private touch() {
    this.lastActive = Date.now();
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Görünüm koltuğunu gerçek koltuğa çevirir (istemci her zaman kendini 0 görür). */
  static actualSeat(view: number, me: number): number {
    return view < 0 ? view : (view + me) % SEATS;
  }
}

const BOT_AVATARS = ['🤖', '👾', '🎲', '🎮'];

function cleanLook(look: { avatar?: unknown; color?: unknown }): { avatar?: string; color?: number } {
  const avatar = typeof look.avatar === 'string' && look.avatar.length <= 8 && !/[<>]/.test(look.avatar) ? look.avatar : undefined;
  const color = typeof look.color === 'number' && Number.isInteger(look.color) && look.color >= 0 && look.color <= 0xffffff ? look.color : undefined;
  return { avatar, color };
}

function cleanName(name: string, seat: number): string {
  const n = String(name ?? '')
    .replace(/[\u0000-\u001f<>]/g, '')
    .trim()
    .slice(0, 16);
  return n || `Oyuncu ${seat + 1}`;
}

export function makeCode(exists: (c: string) => boolean): string {
  for (let tries = 0; tries < 1000; tries++) {
    const bytes = randomBytes(CODE_LENGTH);
    let c = '';
    for (let i = 0; i < CODE_LENGTH; i++) c += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    if (!exists(c)) return c;
  }
  throw new Error('Oda kodu üretilemedi');
}

export { toView };
