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

/** 15 elin sırası (İstişare §2). Açıklamalar el başında ve sol üstteki kural kutusunda görünür. */
export const CONTRACTS: readonly Contract[] = [
  { name: "3'lü Küt", mode: 'normal', reqs: [kut(3)], description: 'Aynı sayıdan 3 farklı renk taş aç (ör. kırmızı 7 · sarı 7 · mavi 7).' },
  { name: "3'lü Seri", mode: 'normal', reqs: [seri(3)], description: 'Aynı renkten 3 ardışık taş aç (ör. mavi 4-5-6).' },
  { name: "3'lü Küt + 3'lü Seri", mode: 'normal', reqs: [kut(3), seri(3)], description: "Bir 3'lü küt ve bir 3'lü seriyi aynı anda aç." },
  { name: "4'lü Küt", mode: 'normal', reqs: [kut(4)], description: 'Aynı sayıdan dört rengin hepsini aç (ör. 9 · 9 · 9 · 9).' },
  { name: "4'lü Seri", mode: 'normal', reqs: [seri(4)], description: 'Aynı renkten 4 ardışık taş aç (ör. sarı 8-9-10-11).' },
  { name: "4'lü Küt + 3'lü Seri", mode: 'normal', reqs: [kut(4), seri(3)], description: "Bir 4'lü küt ve bir 3'lü seriyi aynı anda aç (7 taş)." },
  { name: "4'lü Seri + 3'lü Küt", mode: 'normal', reqs: [seri(4), kut(3)], description: "Bir 4'lü seri ve bir 3'lü kütü aynı anda aç (7 taş)." },
  { name: "4'lü Küt + 4'lü Seri", mode: 'normal', reqs: [kut(4), seri(4)], description: "Bir 4'lü küt ve bir 4'lü seriyi aynı anda aç." },
  { name: "İki 4'lü Küt", mode: 'normal', reqs: [kut(4), kut(4)], description: "İki ayrı 4'lü kütü aynı anda aç (8 taş)." },
  { name: "İki 4'lü Seri", mode: 'normal', reqs: [seri(4), seri(4)], description: "İki ayrı 4'lü seriyi aynı anda aç (8 taş)." },
  { name: "5'li Seri", mode: 'normal', reqs: [seri(5)], description: 'Aynı renkten 5 ardışık taş aç (ör. kırmızı 3-4-5-6-7).' },
  { name: "5'li Seri + 3'lü Küt", mode: 'normal', reqs: [seri(5), kut(3)], description: "Bir 5'li seri ve bir 3'lü kütü aynı anda aç (8 taş)." },
  { name: "5'li Seri + 4'lü Küt", mode: 'normal', reqs: [seri(5), kut(4)], description: "Bir 5'li seri ve bir 4'lü kütü aynı anda aç (9 taş)." },
  { name: 'Elden Bitme', mode: 'eldenBitme', reqs: [], description: 'Hiç açmadan, tüm elini tek seferde küt/seri olarak dizip bit.' },
  { name: 'Çift Eli', mode: 'ciftEli', reqs: [], description: 'En az 7 çifti tek seferde açıp bit. Bu elde tüm puanlar ×2.' },
];

// ------------------------------------------------------------ oyun uzunluğu

/** short: 5 el (mobilde kısa oturum) · full: 15 el */
export type GameLength = 'short' | 'full';

/** Kısa oyunda el sayısı. */
export const SHORT_ROUNDS = 5;

const idx = (name: string) => {
  const i = CONTRACTS.findIndex((c) => c.name === name);
  if (i < 0) throw new Error('kural yok: ' + name);
  return i;
};

/** Kısa + Sıralı: kolaydan zora 5 el, sonda Çift Eli (×2). */
export const SHORT_ORDER: readonly number[] = [
  idx("3'lü Küt"),
  idx("3'lü Seri"),
  idx("4'lü Küt + 3'lü Seri"),
  idx("5'li Seri"),
  idx('Çift Eli'),
];

// ------------------------------------------------------------ rastgele mod

/** classic: 15 el sırayla · random: her elin kuralı aşağıdaki oranlarla rastgele seçilir */
export type RuleOrder = 'classic' | 'random';

/**
 * Rastgele modda her kuralın seçilme ağırlığı (toplam 100 → doğrudan yüzde).
 * Kolay kurallar biraz daha sık, özel eller (Elden Bitme, Çift Eli) daha seyrek gelir.
 */
export const RANDOM_WEIGHTS: readonly number[] = [9, 9, 8, 7, 7, 7, 7, 6, 6, 6, 6, 6, 5, 6, 5];

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
