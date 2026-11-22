import Phaser from 'phaser';

/**
 * Yapay zekâyla üretilen görseller (tools/gen-art.mjs → public/art/*.png).
 * Dosya yoksa yükleme hatası sessizce yutulur; oyun kodla çizilen yedek görünümü kullanır.
 */
export const ART_IDS = [
  'bg-menu',
  'bg-table',
  'emblem',
  'ornament-corner',
  'divider',
  'icon-coin',
  'icon-video',
  'icon-trophy',
  'icon-shop',
  'icon-sound',
  'icon-tutorial',
  'icon-online',
] as const;

export type ArtId = (typeof ART_IDS)[number];

export function artKey(id: ArtId) {
  return `art-${id}`;
}

/** Sahnenin preload() aşamasında çağrılır; zaten yüklü olanları atlar. */
export function preloadArt(scene: Phaser.Scene) {
  scene.load.on('loaderror', () => {
    /* görsel henüz üretilmemiş: yedek görünüm kullanılır */
  });
  for (const id of ART_IDS) {
    const key = artKey(id);
    if (!scene.textures.exists(key)) scene.load.image(key, `art/${id}.png`);
  }
}

export function hasArt(scene: Phaser.Scene, id: ArtId) {
  return scene.textures.exists(artKey(id));
}

/** Görseli verilen kutuyu kaplayacak (cover) şekilde yerleştirir. */
export function coverImage(scene: Phaser.Scene, id: ArtId, x: number, y: number, w: number, h: number) {
  const img = scene.add.image(x + w / 2, y + h / 2, artKey(id));
  img.setScale(Math.max(w / img.width, h / img.height));
  return img;
}

/** Bir panelin dört köşesine pirinç süs koyar (görsel varsa). */
export function cornerOrnaments(scene: Phaser.Scene, x: number, y: number, w: number, h: number, size = 54, depth = 0) {
  if (!hasArt(scene, 'ornament-corner')) return [];
  const out: Phaser.GameObjects.Image[] = [];
  const pos: [number, number, number, number][] = [
    [x, y, 1, 1],
    [x + w, y, -1, 1],
    [x, y + h, 1, -1],
    [x + w, y + h, -1, -1],
  ];
  for (const [px, py, sx, sy] of pos) {
    const img = scene.add.image(px, py, artKey('ornament-corner')).setOrigin(0, 0).setDepth(depth);
    const s = size / img.width;
    img.setScale(s * sx, s * sy);
    out.push(img);
  }
  return out;
}
