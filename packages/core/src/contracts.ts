/** normal: kural açılır, sonra dizilir/işlenir · eldenBitme: tüm el tek seferde · ciftEli: çiftlerle tek seferde, puan ×2 */
export type ContractMode = 'normal' | 'eldenBitme' | 'ciftEli';

export interface Requirement {
  kind: 'kut' | 'seri';
  /** En az kaç taşlık olmalı. */
  min: number;
}

export interface Contract {
  name: string;
  mode: ContractMode;
  reqs: Requirement[];
  description: string;
}

const kut = (min: number): Requirement => ({ kind: 'kut', min });
const seri = (min: number): Requirement => ({ kind: 'seri', min });

/** 11 elin sırası (İstişare §2). */
export const CONTRACTS: readonly Contract[] = [
  { name: "3'lü Küt", mode: 'normal', reqs: [kut(3)], description: 'Aynı sayıdan 3 farklı renk taş aç.' },
  { name: "3'lü Seri", mode: 'normal', reqs: [seri(3)], description: 'Aynı renkten 3 ardışık taş aç.' },
  {
    name: "3'lü Küt + 3'lü Seri",
    mode: 'normal',
    reqs: [kut(3), seri(3)],
    description: 'Bir 3\'lü küt ve bir 3\'lü seriyi birlikte aç.',
  },
  { name: "4'lü Küt", mode: 'normal', reqs: [kut(4)], description: 'Aynı sayıdan 4 renk taş aç.' },
  { name: "4'lü Seri", mode: 'normal', reqs: [seri(4)], description: 'Aynı renkten 4 ardışık taş aç.' },
  { name: "İki 4'lü Küt", mode: 'normal', reqs: [kut(4), kut(4)], description: "İki ayrı 4'lü kütü birlikte aç." },
  { name: "İki 4'lü Seri", mode: 'normal', reqs: [seri(4), seri(4)], description: "İki ayrı 4'lü seriyi birlikte aç." },
  {
    name: "4'lü Küt + 4'lü Seri",
    mode: 'normal',
    reqs: [kut(4), seri(4)],
    description: "Bir 4'lü küt ve bir 4'lü seriyi birlikte aç.",
  },
  { name: "5'li Seri", mode: 'normal', reqs: [seri(5)], description: 'Aynı renkten 5 ardışık taş aç.' },
  {
    name: 'Elden Bitme',
    mode: 'eldenBitme',
    reqs: [],
    description: 'Hiç açmadan, tüm elini tek seferde küt/seri dizip bit.',
  },
  {
    name: 'Çift Eli',
    mode: 'ciftEli',
    reqs: [],
    description: 'En az 7 çifti tek seferde açıp bit. Puanlar 2 kat.',
  },
];
