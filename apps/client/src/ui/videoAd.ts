import Phaser from 'phaser';
import { GAME_H, GAME_W, UI } from '../layout';
import { award, countVideo } from '../profile';
import { showBadge } from './rewards';
import { haptic, sfx } from '../sfx';
import { Button } from './Button';
import { icon } from './icons';
import { txt } from './text';

/**
 * Simüle ödüllü video. Mobil sürümde (Faz 4) burası AdMob "rewarded ad" çağrısıyla
 * değiştirilir; geri dönüş aynıdır: video sonuna kadar izlendiyse true.
 */
export const VIDEO_SECONDS = 15;

export function playRewardedVideo(scene: Phaser.Scene, rewardText: string): Promise<boolean> {
  return new Promise((resolve) => {
    const c = scene.add.container(0, 0).setDepth(9000);
    const dim = scene.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.92).setOrigin(0).setInteractive();
    c.add(dim);

    // "video" alanı: kendi oyunumuzun tanıtımı gibi hareketli bir sahne
    const vx = GAME_W / 2;
    const vy = GAME_H / 2 - 20;
    const vw = 880;
    const vh = 460;
    const frame = scene.add.graphics();
    frame.fillStyle(0x0b3a2a, 1);
    frame.fillRoundedRect(vx - vw / 2, vy - vh / 2, vw, vh, 18);
    frame.lineStyle(2, 0xffffff, 0.15);
    frame.strokeRoundedRect(vx - vw / 2, vy - vh / 2, vw, vh, 18);
    c.add(frame);
    c.add(txt(scene, vx - vw / 2 + 18, vy - vh / 2 + 14, 'SPONSORLU · ÖDÜLLÜ VİDEO (simülasyon)', 12, 'rgba(255,255,255,0.6)', 900));

    const keys = ['tile-red-7', 'tile-yellow-7', 'tile-blue-7', 'tile-joker', 'tile-black-7'];
    const flying: Phaser.GameObjects.Image[] = [];
    keys.forEach((k, i) => {
      const img = scene.add.image(vx - 240 + i * 120, vy + 260, k).setScale(0.62).setAngle(-12 + i * 6);
      flying.push(img);
      c.add(img);
      scene.tweens.add({ targets: img, y: vy - 20, duration: 700, delay: 200 + i * 140, ease: 'Back.easeOut' });
      scene.tweens.add({ targets: img, y: '+=10', angle: '+=6', duration: 1200 + i * 90, delay: 1000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    });
    const headline = txt(scene, vx, vy - 150, 'Küt: Kural Okey', 44, UI.goldHex, 900).setOrigin(0.5).setAlpha(0);
    const sub = txt(scene, vx, vy + 120, 'Her elin bir kuralı var · arkadaşlarını davet et, birlikte oyna!', 19, '#ffffff', 800).setOrigin(0.5).setAlpha(0);
    c.add([headline, sub]);
    scene.tweens.add({ targets: headline, alpha: 1, duration: 500, delay: 900 });
    scene.tweens.add({ targets: sub, alpha: 1, duration: 500, delay: 1500 });

    // ilerleme çubuğu + sayaç
    const bar = scene.add.graphics();
    c.add(bar);
    const left = txt(scene, vx + vw / 2 - 16, vy - vh / 2 + 12, '', 15, '#fff', 900).setOrigin(1, 0);
    c.add(left);
    const prog = { v: 0 };
    const draw = () => {
      bar.clear();
      bar.fillStyle(0xffffff, 0.15);
      bar.fillRect(vx - vw / 2, vy + vh / 2 - 6, vw, 6);
      bar.fillStyle(UI.gold, 1);
      bar.fillRect(vx - vw / 2, vy + vh / 2 - 6, vw * prog.v, 6);
      left.setText(prog.v < 1 ? `Ödül ${Math.ceil(VIDEO_SECONDS * (1 - prog.v))} sn sonra` : 'Tamamlandı ✓');
    };
    draw();

    const finish = (ok: boolean) => {
      timer.remove();
      scene.tweens.add({ targets: c, alpha: 0, duration: 180, onComplete: () => c.destroy() });
      if (ok) {
        countVideo();
        const b = award('video');
        if (b) scene.time.delayedCall(1600, () => showBadge(scene, b));
      }
      resolve(ok);
    };

    // erken kapatma: ödül yok
    const close = new Button(scene, vx + vw / 2 - 30, vy - vh / 2 - 34, 44, 44, '', () => {
      if (prog.v >= 1) return finish(true);
      sub.setText('Videoyu bitirmeden kapatırsan ödül verilmez.');
      close.setColor(UI.red);
      if (close.getData('armed')) finish(false);
      close.setData('armed', true);
    }, UI.slate, 18).setIcon(icon('close'), 20);
    c.add(close);

    const claim = new Button(scene, vx, vy + vh / 2 + 48, 320, 62, `Ödülü Al · ${rewardText}`, () => finish(true), UI.green, 20);
    claim.setVisible(false);
    c.add(claim);

    const timer = scene.tweens.add({
      targets: prog,
      v: 1,
      duration: VIDEO_SECONDS * 1000,
      onUpdate: draw,
      onComplete: () => {
        draw();
        claim.setVisible(true).setScale(0.6);
        scene.tweens.add({ targets: claim, scale: 1, duration: 260, ease: 'Back.easeOut' });
        claim.setPulse(true);
        sfx.chime();
        haptic(20);
      },
    });
    c.setAlpha(0);
    scene.tweens.add({ targets: c, alpha: 1, duration: 200 });
  });
}
