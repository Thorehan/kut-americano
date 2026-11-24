import Phaser from 'phaser';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { setNativeHaptic, sfx } from './sfx';

/**
 * Mobil uygulama (Capacitor) entegrasyonu. Tarayıcıda hiçbir şey yapmaz.
 *  - titreşim: yerel Haptics (iOS'ta navigator.vibrate yok)
 *  - arka plana alınınca ses durur, öne gelince devam eder
 *  - Android geri tuşu: açık sahnenin onBack()'i; kimse karşılamazsa uygulama arka plana alınır
 */
export const isNative = Capacitor.isNativePlatform();

/** Geri tuşunu karşılayan sahne true döner. */
export interface BackHandler {
  onBack(): boolean;
}

export function setupNative(game: Phaser.Game) {
  if (!isNative) return;
  setNativeHaptic((ms) => {
    const style = ms >= 40 ? ImpactStyle.Heavy : ms >= 20 ? ImpactStyle.Medium : ImpactStyle.Light;
    void Haptics.impact({ style });
  });
  void App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) sfx.resume();
    else sfx.suspend();
  });
  void App.addListener('backButton', () => {
    // en üstteki (son eklenen) aktif sahneden başla
    const scenes = game.scene.getScenes(true).reverse();
    for (const s of scenes) {
      const h = (s as unknown as Partial<BackHandler>).onBack;
      if (typeof h === 'function' && h.call(s)) return;
    }
    void App.minimizeApp();
  });
}
