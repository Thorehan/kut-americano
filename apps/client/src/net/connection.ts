import { ClientMsg, ServerMsg } from '@kut/core';

/**
 * Sunucu adresi: yayında VITE_SERVER_URL ile verilir (ör. wss://kut-server.onrender.com).
 * Yerelde (localhost / aynı ağdaki IP) otomatik olarak ws://<adres>:2567 kullanılır.
 */
function resolveServerUrl(): string {
  const env = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (env) return env;
  const h = location.hostname;
  const local = h === 'localhost' || h === '127.0.0.1' || /^(\d{1,3}\.){3}\d{1,3}$/.test(h) || h.endsWith('.local');
  return local ? `ws://${h}:2567` : '';
}

export const SERVER_URL = resolveServerUrl();

export interface Session {
  code: string;
  token: string;
}

export type ConnStatus = 'idle' | 'connecting' | 'open' | 'closed';
type Listener = (m: ServerMsg) => void;
type StatusListener = (s: ConnStatus) => void;

const SESSION_KEY = 'kut-session';

/** Tek WebSocket bağlantısı; kopunca kendiliğinden yeniden bağlanır ve odaya geri döner. */
export class Connection {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private statusListeners = new Set<StatusListener>();
  private retry = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private wanted = false;
  private queue: ClientMsg[] = [];
  status: ConnStatus = 'idle';

  get available(): boolean {
    return !!SERVER_URL;
  }

  get session(): Session | null {
    try {
      const s = sessionStorage.getItem(SESSION_KEY);
      return s ? (JSON.parse(s) as Session) : null;
    } catch {
      return null;
    }
  }

  private setSession(s: Session | null) {
    try {
      if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
      else sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* depolama yok */
    }
  }

  clearSession() {
    this.setSession(null);
  }

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onStatus(fn: StatusListener): () => void {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  private setStatus(s: ConnStatus) {
    this.status = s;
    for (const l of this.statusListeners) l(s);
  }

  connect() {
    this.wanted = true;
    if (!SERVER_URL || this.ws) return;
    this.setStatus('connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(SERVER_URL);
    } catch {
      this.scheduleRetry();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.setStatus('open');
      const s = this.session;
      if (s) this.rawSend({ t: 'rejoin', code: s.code, token: s.token });
      const q = this.queue;
      this.queue = [];
      q.forEach((m) => this.rawSend(m));
      this.pingTimer = setInterval(() => this.rawSend({ t: 'ping' }), 25_000);
    };
    ws.onmessage = (e) => {
      let m: ServerMsg;
      try {
        m = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (m.t === 'joined') this.setSession({ code: m.code, token: m.token });
      if (m.t === 'left') this.setSession(null);
      if (m.t === 'error' && m.fatal) this.setSession(null);
      for (const l of this.listeners) l(m);
    };
    ws.onclose = () => {
      this.ws = null;
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = null;
      this.setStatus('closed');
      if (this.wanted) this.scheduleRetry();
    };
    ws.onerror = () => ws.close();
  }

  private scheduleRetry() {
    if (this.retryTimer) return;
    const delay = Math.min(8000, 800 * 2 ** this.retry++);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, delay);
  }

  private rawSend(m: ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  /** Bağlantı açık değilse mesaj sıraya alınır ve açılınca gönderilir. */
  send(m: ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.rawSend(m);
    else {
      this.queue.push(m);
      this.connect();
    }
  }

  /** Odadan çık ve bağlantıyı kapat. */
  leave() {
    this.rawSend({ t: 'leave' });
    this.setSession(null);
    this.wanted = false;
    this.queue = [];
    setTimeout(() => this.ws?.close(), 150);
  }
}

export const connection = new Connection();
