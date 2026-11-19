import { Action, GameEvent, GameMode, GameState } from './game';
import { RuleOrder } from './contracts';

/** İstemci ↔ sunucu mesajları (JSON). */

export interface LobbySeat {
  name: string;
  avatar?: string;
  color?: number;
  /** Koltukta gerçek bir oyuncu var mı (yoksa bot oynar). */
  human: boolean;
  connected: boolean;
  you: boolean;
}

export interface LobbyInfo {
  code: string;
  /** Görünüm koltuğuna göre değil, gerçek koltuk sırasıyla. */
  seats: LobbySeat[];
  hostSeat: number;
  yourSeat: number;
  mode: GameMode;
  ruleOrder: RuleOrder;
  started: boolean;
}

export type ClientMsg =
  | { t: 'create'; name: string; mode: GameMode; ruleOrder: RuleOrder; avatar?: string; color?: number }
  | { t: 'join'; code: string; name: string; avatar?: string; color?: number }
  | { t: 'rejoin'; code: string; token: string }
  | { t: 'settings'; mode: GameMode; ruleOrder: RuleOrder }
  | { t: 'start' }
  | { t: 'act'; action: Action }
  | { t: 'leave' }
  | { t: 'ping' };

export type ServerMsg =
  | { t: 'joined'; code: string; token: string; seat: number }
  | { t: 'lobby'; lobby: LobbyInfo }
  /** Görünüm: alıcı her zaman koltuk 0. online[] da görünüm sırasıyla. */
  | { t: 'state'; view: GameState; events: GameEvent[]; online: boolean[] }
  | { t: 'error'; message: string; fatal?: boolean }
  | { t: 'left' }
  | { t: 'pong' };

/** Oda kodu: karışabilecek harfler (O/0, I/1) yok. */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPRSTUVYZ23456789';
export const CODE_LENGTH = 4;

export function normalizeCode(s: string): string {
  return s
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, CODE_LENGTH);
}
