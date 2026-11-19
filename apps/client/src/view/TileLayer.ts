import Phaser from 'phaser';
import { Tile } from '@kut/core';
import { TILE_H, TILE_W, tileKey } from '../textures';

/**
 * Her görünen taş, kimliğine (id) bağlı tek bir sprite'tır. Oyun durumu değiştiğinde
 * hedef yerler yeniden hesaplanır ve sprite'lar oraya kayar: desteden ıstakaya, ıstakadan
 * atılan taşlara, perlere… Böylece arayüz ile oynanış aynı nesnelerdir.
 */

export type TileKind = 'rack' | 'staged' | 'meld' | 'discard';

export interface Place {
  x: number;
  y: number;
  scale: number;
  depth: number;
  alpha?: number;
  angle?: number;
}

export interface Target {
  tile: Tile;
  kind: TileKind;
  place: Place;
  selected?: boolean;
  /** Okeyin yerine geçebilen (işlek) taş: mavi parlama. */
  hint?: boolean;
  /** Öğreticinin işaret ettiği taş: yeşil parlama. */
  focus?: boolean;
  dim?: boolean;
}

export interface Origin {
  x: number;
  y: number;
  scale: number;
  /** Kapalı (arka yüz) başlayıp uçarken açılsın. */
  flip?: boolean;
  delay?: number;
}

export interface Point {
  x: number;
  y: number;
}

const FLY_DEPTH = 2000;

export class TileLayer {
  readonly sprites = new Map<number, Phaser.GameObjects.Image>();
  private kinds = new Map<number, TileKind>();

  constructor(
    private scene: Phaser.Scene,
    private onTap: (id: number, kind: TileKind) => void,
  ) {}

  get(id: number) {
    return this.sprites.get(id);
  }

  /** Tüm taşları bir noktaya süpürüp siler (el sonu). */
  clearAll(to: Point, dur = 380) {
    let i = 0;
    for (const [id, img] of this.sprites) {
      this.scene.tweens.killTweensOf(img);
      this.disableGlow(img);
      img.disableInteractive();
      this.scene.tweens.add({
        targets: img,
        x: to.x,
        y: to.y,
        scale: 0.25,
        alpha: 0,
        duration: dur,
        delay: (i++ % 30) * 8,
        ease: 'Cubic.easeIn',
        onComplete: () => img.destroy(),
      });
      this.sprites.delete(id);
      this.kinds.delete(id);
    }
  }

  sync(
    targets: Map<number, Target>,
    origin: (t: Target) => Origin | null,
    depart: (id: number) => Point | null,
    dur = 380,
  ) {
    const tw = this.scene.tweens;

    // Artık görünmeyenler: sahibine uçup kaybolsun
    for (const [id, img] of this.sprites) {
      if (targets.has(id)) continue;
      this.sprites.delete(id);
      this.kinds.delete(id);
      tw.killTweensOf(img);
      this.disableGlow(img);
      img.disableInteractive();
      const to = depart(id);
      img.setDepth(FLY_DEPTH);
      if (to) {
        tw.add({ targets: img, x: to.x, y: to.y, scale: img.scaleY * 0.55, alpha: 0, duration: dur + 60, ease: 'Cubic.easeIn', onComplete: () => img.destroy() });
      } else {
        tw.add({ targets: img, alpha: 0, scale: img.scaleY * 0.8, duration: 160, onComplete: () => img.destroy() });
      }
    }

    for (const [id, t] of targets) {
      const p = t.place;
      const key = tileKey(t.tile);
      let img = this.sprites.get(id);
      const isNew = !img;
      if (!img) {
        const o = origin(t);
        img = this.scene.add.image(o?.x ?? p.x, o?.y ?? p.y, o?.flip ? 'tile-back' : key);
        img.setScale(o?.scale ?? p.scale).setDepth(p.depth);
        if (!o) img.setAlpha(0);
        img.setData('id', id);
        // Dokunma ancak basış da bu taşta başladıysa sayılır (altından kayıp gelen taş seçilmesin).
        img.on('pointerdown', () => img!.setData('down', true).setData('dragged', false));
        img.on('pointerup', () => {
          const down = img!.getData('down');
          const dragged = img!.getData('dragged');
          img!.setData('down', false).setData('dragged', false);
          if (!down || dragged) return;
          this.onTap(id, this.kinds.get(id) ?? 'meld');
        });
        this.sprites.set(id, img);
        this.animateTo(img, key, t, dur, o);
      } else if (!img.getData('dragging')) {
        const moved =
          Math.abs(img.x - p.x) > 0.5 || Math.abs(img.y - p.y) > 0.5 || Math.abs(img.scaleY - p.scale) > 0.002 || img.texture.key !== key;
        if (moved) this.animateTo(img, key, t, dur, null);
        else img.setDepth(p.depth);
        img.setAlpha(t.dim ? 0.55 : p.alpha ?? 1);
      }

      // etkileşim türü
      const prevKind = this.kinds.get(id);
      if (isNew || prevKind !== t.kind) {
        this.kinds.set(id, t.kind);
        if (t.kind === 'rack') {
          img.setInteractive({ draggable: true, useHandCursor: true });
          this.scene.input.setDraggable(img, true);
        } else if (t.kind === 'staged') {
          img.setInteractive({ useHandCursor: true });
          this.scene.input.setDraggable(img, false);
        } else {
          img.disableInteractive();
        }
      }

      // seçili taş altın, işlek taş mavi parlar
      if (t.selected) this.setGlow(img, 'sel');
      else if (t.focus) this.setGlow(img, 'focus');
      else if (t.hint) this.setGlow(img, 'hint');
      else this.disableGlow(img);
    }
  }

  private animateTo(img: Phaser.GameObjects.Image, key: string, t: Target, dur: number, o: Origin | null) {
    const tw = this.scene.tweens;
    const p = t.place;
    tw.killTweensOf(img);
    const delay = o?.delay ?? 0;
    const alpha = t.dim ? 0.55 : p.alpha ?? 1;
    const far = Phaser.Math.Distance.Between(img.x, img.y, p.x, p.y) > 40;
    img.setDepth(far ? FLY_DEPTH + p.depth : p.depth);
    const done = () => img.setDepth(p.depth);

    if (o?.flip) {
      img.setTexture('tile-back');
      tw.add({ targets: img, x: p.x, y: p.y, scaleY: p.scale, alpha, angle: p.angle ?? 0, duration: dur, delay, ease: 'Cubic.easeOut', onComplete: done });
      tw.add({
        targets: img,
        scaleX: 0,
        duration: dur * 0.42,
        delay,
        ease: 'Sine.easeIn',
        onComplete: () => {
          img.setTexture(key);
          tw.add({ targets: img, scaleX: p.scale, duration: dur * 0.42, ease: 'Sine.easeOut' });
        },
      });
    } else {
      if (img.texture.key !== key) img.setTexture(key);
      tw.add({
        targets: img,
        x: p.x,
        y: p.y,
        scaleX: p.scale,
        scaleY: p.scale,
        alpha,
        angle: p.angle ?? 0,
        duration: far ? dur : Math.min(dur, 170),
        delay,
        ease: far ? 'Cubic.easeOut' : 'Quad.easeOut',
        onComplete: done,
      });
    }
  }

  private setGlow(img: Phaser.GameObjects.Image, kind: 'sel' | 'hint' | 'focus') {
    if (img.getData('glow') === kind) return;
    img.preFX?.clear();
    if (kind === 'sel') img.preFX?.addGlow(0xffd35c, 5, 0, false, 0.12, 14);
    else if (kind === 'focus') img.preFX?.addGlow(0x6bff8f, 7, 0, false, 0.12, 16);
    else img.preFX?.addGlow(0x6fe7ff, 3, 0, false, 0.12, 10);
    img.setData('glow', kind);
  }

  private disableGlow(img: Phaser.GameObjects.Image) {
    if (!img.getData('glow')) return;
    img.preFX?.clear();
    img.setData('glow', null);
  }

  /** Kapalı bir taşın bir yerden bir yere uçuşu (rakibin çektiği taş gibi). */
  flyBack(from: Point, to: Point, delay = 0, dur = 320) {
    const img = this.scene.add.image(from.x, from.y, 'tile-back').setScale(0.46).setDepth(FLY_DEPTH);
    this.scene.tweens.add({
      targets: img,
      x: to.x,
      y: to.y,
      scale: 0.3,
      duration: dur,
      delay,
      ease: 'Cubic.easeInOut',
      onComplete: () => this.scene.tweens.add({ targets: img, alpha: 0, duration: 120, onComplete: () => img.destroy() }),
    });
  }
}

export const tileSize = (scale: number) => ({ w: TILE_W * scale, h: TILE_H * scale });
