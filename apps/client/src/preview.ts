import { CONTRACTS, Color, Game, Tile, asCift, asKut, asSeri } from '@kut/core';

/**
 * Bitiş ekranı önizlemeleri (?onizleme): hazır bir elde son hamleyi oyuncu kendisi yapar,
 * gerçek motor puanı hesaplar → kutlama + el sonu ekranı birebir oyundaki gibi görünür.
 */
export type FinishPreview = 'normal' | 'okey' | 'ciftOkey' | 'ce-normal' | 'ce-okey' | 'ce-ciftOkey';

export interface PreviewSpec {
  id: FinishPreview;
  title: string;
  mult: number;
  ciftEli: boolean;
  /** Oyuncunun elinde kalan taş(lar). */
  hand: string;
  how: string;
}

export const PREVIEWS: PreviewSpec[] = [
  { id: 'normal', title: 'Normal bitiş', mult: 1, ciftEli: false, hand: 'b11', how: 'Son taşı "Bitir!" ile ortaya vur' },
  { id: 'okey', title: 'Okey ile bitiş', mult: 2, ciftEli: false, hand: 'J', how: 'Son taş okey: "Bitir!"' },
  { id: 'ciftOkey', title: 'Çift okey ile bitiş', mult: 4, ciftEli: false, hand: 'J J', how: 'Elde iki okey: "Çift Okey!"' },
  { id: 'ce-normal', title: 'Çift Eli · normal', mult: 2, ciftEli: true, hand: 'b11', how: 'Son taşı "Bitir!" ile ortaya vur' },
  { id: 'ce-okey', title: 'Çift Eli · okey', mult: 4, ciftEli: true, hand: 'J', how: 'Son taş okey: "Bitir!"' },
  { id: 'ce-ciftOkey', title: 'Çift Eli · çift okey', mult: 8, ciftEli: true, hand: 'J J', how: 'Elde iki okey: "Çift Okey!"' },
];

export function previewSpec(id: string | null | undefined): PreviewSpec | undefined {
  return PREVIEWS.find((p) => p.id === id);
}

export const CIFT_ELI_ROUND = CONTRACTS.findIndex((c) => c.mode === 'ciftEli');

const C: Record<string, Color> = { r: 'red', y: 'yellow', b: 'blue', k: 'black' };

export function setupPreviewGame(game: Game, spec: PreviewSpec) {
  const s = game.state;
  const pool: Tile[] = [...s.deck, ...s.players.flatMap((p) => p.hand)];
  const take = (t: string): Tile => {
    const i = pool.findIndex((x) => (t === 'J' ? x.joker : !x.joker && x.color === C[t[0]] && x.value === Number(t.slice(1))));
    if (i < 0) throw new Error('önizleme taşı yok: ' + t);
    return pool.splice(i, 1)[0];
  };
  const many = (t: string) => t.split(' ').map(take);

  const me = s.players[0];
  me.hand = many(spec.hand);
  me.opened = true;
  me.openedThisTurn = false;
  let id = 950;
  if (spec.ciftEli) {
    s.melds = ['r5 r5', 'k8 k8', 'y2 y2', 'b13 b13', 'r10 r10', 'k3 k3'].map((p) => ({ ...asCift(many(p))!, id: id++, owner: 0 }));
  } else {
    s.melds = [
      { ...asKut(many('r6 b6 k6'))!, id: id++, owner: 0 },
      { ...asSeri(many('y3 y4 y5'))!, id: id++, owner: 0 },
    ];
  }
  // Rakiplere biraz taş: ceza sütunu dolu görünsün (okeysiz, işlek olmayan taşlar).
  const others = ['r9 b2 k12', 'y7 b8', 'k4 r12 b1 y10'];
  others.forEach((h, i) => {
    s.players[i + 1].hand = many(h);
    s.players[i + 1].opened = false;
  });
  s.deck = pool.filter((t) => !t.joker).concat(pool.filter((t) => t.joker));
  s.players.forEach((p) => (p.discards = []));
  s.extraTile = null;
  s.starter = 0;
  s.current = 0;
  s.phase = 'action';
  s.pendingDiscard = null;
  s.claim = null;
  s.turnJokers = 0;
}
