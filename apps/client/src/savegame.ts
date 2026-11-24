import type { GameState } from '@kut/core';

/**
 * Yerel (botlu) oyunun otomatik kaydı: her hamleden sonra yazılır, oyun bitince silinir.
 * Uygulama kapanırsa (arama, sistemin kapatması) menüde "kaldığın yerden devam" sunulur.
 * Online oyunlar kaydedilmez (sunucu yeniden bağlanmayı zaten yönetir).
 */

const KEY = 'kut-save';
const VERSION = 1;

interface SaveFile {
  v: number;
  at: number;
  state: GameState;
}

export function writeSave(state: GameState) {
  try {
    if (state.phase === 'gameOver') {
      localStorage.removeItem(KEY);
      return;
    }
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, at: Date.now(), state } satisfies SaveFile));
  } catch {
    /* depolama dolu ya da yok: kayıtsız devam */
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* yok */
  }
}

/** Geçerli bir kayıt varsa durumu döndürür (bozuk / eski sürüm kayıtları atılır). */
export function loadSave(): { state: GameState; at: number } | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const f = JSON.parse(raw) as SaveFile;
    const s = f?.state;
    if (f.v !== VERSION || !s || !Array.isArray(s.players) || s.players.length !== 4 || !Array.isArray(s.contractOrder) || s.phase === 'gameOver') {
      clearSave();
      return null;
    }
    return { state: s, at: f.at };
  } catch {
    clearSave();
    return null;
  }
}
