import Phaser from 'phaser';
import { GAME_H, GAME_W, UI } from '../layout';
import { Badge, DAILY_REWARDS, Gain, KP, claimDaily, dailyAvailable } from '../profile';
import { haptic, sfx } from '../sfx';
import { Button } from './Button';
import { panel, txt } from './text';
import { playRewardedVideo } from './videoAd';

export function fmt(n: number): string {
  return n.toLocaleString('tr-TR');
}

/** Uçuşan "+100 KP" yazısı; seviye ve rozet varsa ardından gösterir. */
export function showGain(scene: Phaser.Scene, g: Gain | null, x = GAME_W / 2, y = GAME_H / 2) {
  if (!g) return;
  if (g.kp > 0 || g.xp > 0) {
    const parts = [g.kp > 0 ? `+${fmt(g.kp)} ${KP}` : '', g.xp > 0 ? `+${g.xp} XP` : ''].filter(Boolean).join('   ');
    const t = txt(scene, x, y, parts, 30, UI.goldHex, 900).setOrigin(0.5).setDepth(9500).setShadow(0, 3, 'rgba(0,0,0,0.6)', 6);
    t.setScale(0.5);
    scene.tweens.add({ targets: t, scale: 1, duration: 260, ease: 'Back.easeOut' });
    scene.tweens.add({ targets: t, y: y - 60, alpha: 0, delay: 1200, duration: 600, onComplete: () => t.destroy() });
    sfx.pop();
  }
  if (g.levelUp) scene.time.delayedCall(700, () => banner(scene, `SEVİYE ${g.levelUp}!`, `Seviye ödülü dahil`, '⭐'));
  g.badges.forEach((b, i) => scene.time.delayedCall(1200 + i * 1600, () => showBadge(scene, b)));
}

export function showBadge(scene: Phaser.Scene, b: Badge) {
  banner(scene, `Rozet: ${b.name}`, `${b.desc} · +${fmt(b.reward)} ${KP}`, b.icon);
}

/** Üstten inen kısa kutlama şeridi. */
export function banner(scene: Phaser.Scene, title: string, sub: string, icon: string) {
  const c = scene.add.container(GAME_W / 2, -60).setDepth(9600);
  const g = scene.add.graphics();
  panel(g, -260, -40, 520, 80, 20, 0x14402f, 0.98, UI.gold, 1);
  c.add(g);
  c.add(txt(scene, -228, 0, icon, 36, '#fff', 900).setOrigin(0.5));
  c.add(txt(scene, -192, -26, title, 22, UI.goldHex, 900));
  c.add(txt(scene, -192, 4, sub, 15, UI.cream, 800));
  scene.tweens.add({ targets: c, y: 70, duration: 380, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: c, y: -80, delay: 2400, duration: 300, ease: 'Cubic.easeIn', onComplete: () => c.destroy() });
  sfx.chime();
  haptic(20);
}

/** Günlük ödül penceresi: al ya da video izleyip 2 kat al. */
export function showDailyPopup(scene: Phaser.Scene, onDone?: () => void) {
  const d = dailyAvailable();
  if (!d) return;
  const c = scene.add.container(0, 0).setDepth(8000);
  c.add(scene.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.6).setOrigin(0).setInteractive());
  const g = scene.add.graphics();
  panel(g, GAME_W / 2 - 400, 150, 800, 420, 24, 0x0c2c21, 0.98, UI.gold, 1);
  c.add(g);
  c.add(txt(scene, GAME_W / 2, 176, 'GÜNLÜK ÖDÜL', 30, UI.goldHex, 900).setOrigin(0.5, 0));
  c.add(txt(scene, GAME_W / 2, 218, `Her gün gel, ödül büyüsün · ${d.day}. gün`, 16, UI.cream, 800).setOrigin(0.5, 0));
  DAILY_REWARDS.forEach((amt, i) => {
    const x = GAME_W / 2 - 330 + i * 110;
    const y = 320;
    const past = i + 1 < d.day;
    const now = i + 1 === d.day;
    const bg = scene.add.graphics();
    bg.fillStyle(now ? UI.gold : past ? 0x1e6b43 : 0x000000, now ? 1 : past ? 0.9 : 0.3);
    bg.fillRoundedRect(x - 48, y - 52, 96, 110, 14);
    if (now) {
      bg.lineStyle(3, 0xffffff, 0.9);
      bg.strokeRoundedRect(x - 48, y - 52, 96, 110, 14);
    }
    c.add(bg);
    c.add(txt(scene, x, y - 40, `${i + 1}. gün`, 13, now ? '#2a1d02' : UI.muted, 900).setOrigin(0.5, 0));
    if (past) c.add(txt(scene, x, y - 6, '✓', 30, '#fff', 900).setOrigin(0.5));
    else c.add(scene.add.image(x, y - 6, 'coin').setScale(0.55));
    c.add(txt(scene, x, y + 30, fmt(amt), 17, now ? '#2a1d02' : UI.cream, 900).setOrigin(0.5));
  });
  const close = (gain: Gain | null) => {
    scene.tweens.add({ targets: c, alpha: 0, duration: 160, onComplete: () => c.destroy() });
    showGain(scene, gain);
    onDone?.();
  };
  c.add(new Button(scene, GAME_W / 2 - 150, 500, 260, 62, `Al · +${fmt(d.amount)} ${KP}`, () => close(claimDaily(1)), UI.slate, 19));
  const dbl = new Button(scene, GAME_W / 2 + 150, 500, 280, 62, `🎬 2 Kat · +${fmt(d.amount * 2)} ${KP}`, async () => {
    c.setVisible(false);
    const ok = await playRewardedVideo(scene, `+${fmt(d.amount * 2)} ${KP}`);
    c.setVisible(true);
    if (ok) close(claimDaily(2));
  }, UI.green, 19);
  dbl.setPulse(true);
  c.add(dbl);
  c.setAlpha(0);
  scene.tweens.add({ targets: c, alpha: 1, duration: 200 });
}
