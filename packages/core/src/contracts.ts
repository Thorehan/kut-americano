/** normal: kural açılır, sonra dizilir/işlenir · eldenBitme: tüm el tek seferde · ciftEli: çiftlerle tek seferde, puan ×2 */
export type ContractMode = 'normal' | 'eldenBitme' | 'ciftEli';

export interface Requirement {
  kind: 'kut' | 'seri';
  /** Açılışta per tam olarak kaç taş olmalı (fazlalık o sırada yere inemez). */
  size: number;
}

export interface Contract {
  name: string;
  mode: ContractMode;
  reqs: Requirement[];
  description: string;
}

const kut = (size: number): Requirement => ({ kind: 'kut', size });
const seri = (size: number): Requirement => ({ kind: 'seri', size });

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

// ------------------------------------------------------------ rastgele mod

/** classic: 11 el sırayla · random: her elin kuralı aşağıdaki oranlarla rastgele seçilir */
export type RuleOrder = 'classic' | 'random';

/**
 * Rastgele modda her kuralın seçilme ağırlığı (toplam 100 → doğrudan yüzde).
 * Kolay kurallar biraz daha sık, özel eller (Elden Bitme, Çift Eli) daha seyrek gelir.
 */
export const RANDOM_WEIGHTS: readonly number[] = [12, 12, 11, 10, 10, 8, 8, 8, 9, 6, 6];

/** Aynı kural en fazla bu kadar kez gelebilir. */
export const RANDOM_MAX_REPEAT = 2;

/**
 * Rastgele mod için el sırası üretir: ağırlıklı seçim, aynı kural art arda gelmez
 * ve bir oyunda en fazla RANDOM_MAX_REPEAT kez gelir. İlk el dahil her el her kural olabilir.
 */
export function randomContractOrder(rand: () => number, rounds = CONTRACTS.length): number[] {
  const order: number[] = [];
  const count = CONTRACTS.map(() => 0);
  for (let r = 0; r < rounds; r++) {
    const prev = order[order.length - 1];
    let pool = CONTRACTS.map((_, i) => i).filter((i) => i !== prev && count[i] < RANDOM_MAX_REPEAT);
    if (!pool.length) pool = CONTRACTS.map((_, i) => i).filter((i) => i !== prev);
    const total = pool.reduce((a, i) => a + RANDOM_WEIGHTS[i], 0);
    let x = rand() * total;
    let pick = pool[pool.length - 1];
    for (const i of pool) {
      x -= RANDOM_WEIGHTS[i];
      if (x < 0) {
        pick = i;
        break;
      }
    }
    order.push(pick);
    count[pick]++;
  }
  return order;
}
