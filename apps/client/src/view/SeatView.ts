import Phaser from 'phaser';
import { GameMode, PlayerState, teamOf } from '@kut/core';
import { UI } from '../layout';
import { panel, txt } from '../ui/text';

const AVATAR_COLORS = [0x3b8fe6, 0xd9534f, 0x8e5bd6, 0xe0962a];

/** Rakip oyuncu kartı: avatar, ad, taş sayısı, kural rozeti, puan ve sıra halkası. */
export class SeatView {
  readonly root: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Graphics;
  private ring: Phaser.GameObjects.Graphics;
  private ringTween: Phaser.Tweens.Tween;
  private nameT: Phaser.GameObjects.Text;
  private countT: Phaser.GameObjects.Text;
  private badgeBg: Phaser.GameObjects.Graphics;
  private badgeT: Phaser.GameObjects.Text;
  private scoreT: Phaser.GameObjects.Text;
  private thinkT: Phaser.GameObjects.Text;
  private backs: Phaser.GameObjects.Image[] = [];
  private w: number;
  private h: number;
  private last = '';

  constructor(
    private scene: Phaser.Scene,
    readonly seat: number,
    x: number,
    y: number,
    private vertical: boolean,
  ) {
    this.w = vertical ? 136 : 262;
    this.h = vertical ? 132 : 58;
    const { w, h } = this;
    this.root = scene.add.container(x, y).setDepth(50);
    this.ring = scene.add.graphics();
    this.ring.lineStyle(4, UI.gold, 1);
    this.ring.strokeRoundedRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8, 18);
    this.ring.setAlpha(0);
    this.ringTween = scene.tweens.add({ targets: this.ring, alpha: { from: 1, to: 0.35 }, duration: 650, yoyo: true, repeat: -1, paused: true });
    this.bg = scene.add.graphics();
    panel(this.bg, -w / 2, -h / 2, w, h, 16);

    const av = scene.add.graphics();
    const ax = vertical ? 0 : -w / 2 + 30;
    const ay = vertical ? -h / 2 + 30 : 0;
    av.fillStyle(AVATAR_COLORS[seat % 4], 1);
    av.fillCircle(ax, ay, 20);
    av.lineStyle(2, 0xffffff, 0.6);
    av.strokeCircle(ax, ay, 20);
    const initial = txt(scene, ax, ay, '', 20, '#fff', 900).setOrigin(0.5);
    this.root.setData('initial', initial);

    if (vertical) {
      this.nameT = txt(scene, 0, -h / 2 + 56, '', 16, '#fff', 800).setOrigin(0.5, 0);
      this.countT = txt(scene, 10, -h / 2 + 82, '', 14, UI.cream, 700).setOrigin(0, 0.5);
      for (let i = 0; i < 3; i++) this.backs.push(scene.add.image(-22 + i * 5, -h / 2 + 82, 'tile-back').setScale(0.16));
      this.badgeBg = scene.add.graphics();
      this.badgeT = txt(scene, 0, -h / 2 + 104, '', 12, '#fff', 800).setOrigin(0.5);
      this.scoreT = txt(scene, 0, h / 2 - 4, '', 12, UI.goldHex, 800).setOrigin(0.5, 1);
    } else {
      this.nameT = txt(scene, -w / 2 + 58, -h / 2 + 7, '', 16, '#fff', 800);
      this.scoreT = txt(scene, -w / 2 + 58, -h / 2 + 30, '', 12, UI.goldHex, 800);
      this.countT = txt(scene, w / 2 - 74, -6, '', 14, UI.cream, 700).setOrigin(0, 0.5);
      for (let i = 0; i < 3; i++) this.backs.push(scene.add.image(w / 2 - 98 + i * 5, -6, 'tile-back').setScale(0.16));
      this.badgeBg = scene.add.graphics();
      this.badgeT = txt(scene, w / 2 - 52, 15, '', 11, '#fff', 800).setOrigin(0.5);
    }
    this.thinkT = txt(scene, 0, h / 2 + 8, '', 12, UI.muted, 700).setOrigin(0.5, 0);
    this.root.add([this.ring, this.bg, av, initial, this.nameT, this.countT, ...this.backs, this.badgeBg, this.badgeT, this.scoreT, this.thinkT]);
  }

  get anchor() {
    return { x: this.root.x, y: this.root.y };
  }

  update(p: PlayerState, active: boolean, mode: GameMode, thinking: string) {
    const team = mode === 'team' ? (teamOf(p.seat) === 0 ? 'A' : 'B') : '';
    const sig = [p.name, p.hand.length, p.opened, p.score, active, team, thinking].join('|');
    if (sig === this.last) return;
    this.last = sig;

    (this.root.getData('initial') as Phaser.GameObjects.Text).setText(/\d$/.test(p.name) ? p.name.slice(-1) : p.name.slice(0, 1).toUpperCase());
    this.nameT.setText(p.name);
    this.countT.setText(`${p.hand.length}`);
    this.scoreT.setText(`${team ? `Takım ${team} · ` : ''}${p.score} puan`);
    this.thinkT.setText(thinking);

    const opened = p.opened;
    this.badgeT.setText(opened ? 'AÇTI ✓' : 'AÇMADI');
    const bw = this.badgeT.width + 16;
    const bx = this.badgeT.x - bw / 2;
    const by = this.badgeT.y - 10;
    this.badgeBg.clear();
    this.badgeBg.fillStyle(opened ? UI.green : 0x000000, opened ? 1 : 0.3);
    this.badgeBg.fillRoundedRect(bx, by, bw, 20, 10);

    if (mode === 'team') {
      this.bg.clear();
      panel(this.bg, -this.w / 2, -this.h / 2, this.w, this.h, 16, UI.panel, 0.92, teamOf(p.seat) === 0 ? UI.teamA : UI.teamB, 1);
    }

    if (active) {
      this.ringTween.resume();
      this.ring.setAlpha(1);
    } else {
      this.ringTween.pause();
      this.ring.setAlpha(0);
    }
  }

  /** Kısa süreli konuşma balonu (ör. "İSTEDİ!"). */
  bubble(text: string, color: number = UI.gold, dark = true) {
    const s = this.scene;
    const { x, y } = this.anchor;
    const bx = this.vertical ? x : x;
    const by = this.vertical ? y - this.h / 2 - 22 : y + this.h / 2 + 22;
    showBubble(s, bx, by, text, color, dark);
  }
}

export function showBubble(scene: Phaser.Scene, x: number, y: number, text: string, color: number = UI.gold, dark = true) {
  const t = txt(scene, 0, 0, text, 15, dark ? '#1b1405' : '#fff', 900).setOrigin(0.5);
  const w = t.width + 26;
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.3);
  g.fillRoundedRect(-w / 2, -14 + 3, w, 28, 14);
  g.fillStyle(color, 1);
  g.fillRoundedRect(-w / 2, -14, w, 28, 14);
  const c = scene.add.container(Phaser.Math.Clamp(x, w / 2 + 6, 1280 - w / 2 - 6), y, [g, t]).setDepth(3000).setScale(0.4).setAlpha(0);
  scene.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 220, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: c, y: y - 14, alpha: 0, delay: 1500, duration: 380, onComplete: () => c.destroy() });
}
