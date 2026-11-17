import { describe, expect, it } from 'vitest';
import {
  addPosition,
  asCift,
  asKut,
  asSeri,
  createTileSet,
  findContractMelds,
  findFullPartition,
  findPairPartition,
  matchContract,
  tilePenalty,
  withTile,
} from '../src';
import { tiles } from './helpers';

describe('taş seti', () => {
  it('106 taş, 2 okey, her taş iki kopya', () => {
    const set = createTileSet();
    expect(set).toHaveLength(106);
    expect(set.filter((x) => x.joker)).toHaveLength(2);
    expect(set.filter((x) => x.color === 'red' && x.value === 7)).toHaveLength(2);
    expect(new Set(set.map((x) => x.id)).size).toBe(106);
  });

  it('ceza değerleri: 10 ve üstü 10, okey 25', () => {
    const [a, b, c, d] = tiles('r3 b10 k13 J');
    expect([a, b, c, d].map(tilePenalty)).toEqual([3, 10, 10, 25]);
  });
});

describe('küt', () => {
  it('aynı sayı farklı renk geçerli', () => {
    expect(asKut(tiles('r7 y7 b7'))).not.toBeNull();
    expect(asKut(tiles('r7 y7 b7 k7'))).not.toBeNull();
  });
  it('aynı renk iki taş geçersiz', () => {
    expect(asKut(tiles('r7 r7 b7'))).toBeNull();
  });
  it('farklı sayı geçersiz, 5 taş geçersiz', () => {
    expect(asKut(tiles('r7 y8 b7'))).toBeNull();
    expect(asKut(tiles('r7 y7 b7 k7 J'))).toBeNull();
  });
  it('okey eksik rengin yerine geçer', () => {
    expect(asKut(tiles('r7 y7 J'))?.value).toBe(7);
  });
});

describe('seri', () => {
  it('ardışık aynı renk geçerli', () => {
    const s = asSeri(tiles('b6 b4 b5'));
    expect(s?.value).toBe(4);
    expect(s?.tiles.map((x) => x.value)).toEqual([4, 5, 6]);
  });
  it('başa sarma yok: 12-13-1 ve 13-1-2 geçersiz', () => {
    expect(asSeri(tiles('r12 r13 r1'))).toBeNull();
    expect(asSeri(tiles('r13 r1 r2'))).toBeNull();
  });
  it('farklı renk geçersiz', () => {
    expect(asSeri(tiles('r4 b5 r6'))).toBeNull();
  });
  it('okey boşluğu doldurur', () => {
    const s = asSeri(tiles('k3 J k5'));
    expect(s?.tiles.map((x) => (x.joker ? 'J' : x.value))).toEqual([3, 'J', 5]);
  });
  it('fazla okey sona, sona yer yoksa başa eklenir', () => {
    expect(asSeri(tiles('y5 y6 J'))?.value).toBe(5);
    expect(asSeri(tiles('y12 y13 J'))?.value).toBe(11);
  });
});

describe('işleme', () => {
  it('seriye baş ve sondan işlenir', () => {
    const s = { ...asSeri(tiles('r4 r5 r6'))!, id: 1, owner: 0 };
    const [r3, r7, r8, b7] = tiles('r3 r7 r8 b7');
    expect(addPosition(s, r3)).toBe('start');
    expect(addPosition(s, r7)).toBe('end');
    expect(addPosition(s, r8)).toBeNull();
    expect(addPosition(s, b7)).toBeNull();
    expect(withTile(s, r3)?.value).toBe(3);
  });
  it('13 ile biten seriye sondan işlenmez', () => {
    const s = asSeri(tiles('r11 r12 r13'))!;
    const [r1] = tiles('r1');
    expect(addPosition(s, r1)).toBeNull();
  });
  it('küte eksik renk işlenir, 4 taştan sonra işlenmez', () => {
    const k = asKut(tiles('r9 y9 b9'))!;
    const [k9, r9] = tiles('k9 r9');
    expect(addPosition(k, k9)).toBe('end');
    expect(addPosition(k, r9)).toBeNull();
    const full = withTile(k, k9)!;
    expect(addPosition(full, tiles('J')[0])).toBeNull();
  });
});

describe('kontrat arama', () => {
  it("3'lü küt + 3'lü seri bulunur", () => {
    const hand = tiles('r5 y5 b5 k2 k3 k4 r9 b11');
    const m = findContractMelds(hand, [
      { kind: 'kut', size: 3 },
      { kind: 'seri', size: 3 },
    ]);
    expect(m).not.toBeNull();
    expect(m!.flat()).toHaveLength(6);
  });
  it('bulunamazsa null', () => {
    expect(findContractMelds(tiles('r5 y5 k2 k3'), [{ kind: 'kut', size: 3 }])).toBeNull();
  });
  it('matchContract: gruplar kurala eşlenir, kısa grup reddedilir', () => {
    const reqs = [{ kind: 'seri' as const, size: 4 }];
    expect(matchContract([tiles('b1 b2 b3 b4')], reqs)).not.toBeNull();
    expect(matchContract([tiles('b1 b2 b3')], reqs)).toBeNull();
    expect(matchContract([tiles('b1 b2 b3 b4'), tiles('r1 r1 r2')], reqs)).toBeNull();
  });
});

describe('tam bölme (elden bitme)', () => {
  it('15 taşı perlere böler, 1 taş artar', () => {
    const hand = tiles('r1 r2 r3 r4 y7 b7 k7 b10 b11 b12 b13 k5 y5 J y2');
    const p = findFullPartition(hand, 1);
    expect(p).not.toBeNull();
    expect(p!.leftovers).toHaveLength(1);
    expect(p!.melds.flat()).toHaveLength(14);
  });
  it('bölünemeyen el null döner', () => {
    expect(findFullPartition(tiles('r1 r5 r9 y2 b4 k8 k11'), 1)).toBeNull();
  });
});

describe('çift', () => {
  it('aynı renk aynı sayı çifttir', () => {
    expect(asCift(tiles('r5 r5'))).not.toBeNull();
    expect(asCift(tiles('r5 b5'))).toBeNull();
    expect(asCift(tiles('r5 J'))).not.toBeNull();
  });
  it('7 çift + 1 artık', () => {
    const hand = tiles('r1 r1 y2 y2 b3 b3 k4 k4 r5 r5 y6 y6 b7 J k9');
    const p = findPairPartition(hand, 7);
    expect(p?.melds).toHaveLength(7);
    expect(p?.leftovers).toHaveLength(1);
  });
});
