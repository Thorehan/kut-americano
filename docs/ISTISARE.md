# Küt (Amerikano) Okey — İstişare Planı

> Durum: **v0.2** (2026-11-17) — Faz 1 deneme sürümü yapıldı; açık sorular varsayımlarıyla kodlandı. Kararlar bölümü kesinleşenleri, "Açık sorular" bölümü cevap bekleyenleri tutar.
> Açık sorulara cevap verildikçe bu dosya güncellenir; deneme sürümü kodlaması bu dosyadaki kurallara göre yapılır.

---

## 1. Oyunun özeti

Küt (Amerikano), rummy ailesinden "kontratlı" bir oyundur: her elde masada **bir kural (kontrat)** geçerlidir ve oyuncu o kuralı yere açmadan (kural kilidini açmadan) taş dizemez, işleyemez, eli bitiremez. Biz bunu **101 Okey görselliğiyle, okey taşlarıyla** oynatıyoruz.

- **Küt:** Aynı sayı, farklı renk (ör. kırmızı 7 – mavi 7 – siyah 7).
- **Seri:** Aynı renk, ardışık sayı (ör. sarı 4-5-6). **Başa sarma yok:** yalnızca 1-2-3 … 11-12-13. 12-13-1 ve 13-1-2 geçersiz.
- **Okey (joker):** Her zaman **sahte okey simgeli taş**. Gösterge yok, okey her elde aynı taştır.

## 2. El kuralları (11 el)

Her el sıradaki kural geçerlidir. UI'da sabit bir **Kural Paneli** o elin kuralını gösterir.

| El | Kural | Açmak için gereken |
|---|---|---|
| 1 | 3'lü küt | 1 × küt (3 taş) |
| 2 | 3'lü seri | 1 × seri (3 taş) |
| 3 | 3'lü küt + 3'lü seri | küt + seri (6 taş) |
| 4 | 4'lü küt | 1 × küt (4 renk, 4 taş) |
| 5 | 4'lü seri | 1 × seri (4 taş) |
| 6 | İki 4'lü küt | 2 × küt (8 taş) |
| 7 | İki 4'lü seri | 2 × seri (8 taş) |
| 8 | 4'lü küt + 4'lü seri | küt + seri (8 taş) |
| 9 | 5'li seri | 1 × 5'li seri |
| 10 | Elden bitme | Tüm el tek hamlede (bkz. açık soru S4) |
| 11 | Çift eli | Çiftlerle bitiş, puanlar ×2 (bkz. açık soru S5) |

**Açma (kural kilidi):** O elin kuralı yere açılır → kilit açılır. **Açtığın sırada yalnızca kural iner, fazlalık inmez:** ne ek per ne de kurala eklenen fazla taş (ör. 3'lü küt elinde 4'lü küt açılmaz). Fazlalıklar **bir sonraki sırada** dizilir/işlenir, bitebiliyorsan bitersin. Kural açılmadan **elden bile bitilemez**.

**Dizme ve işleme:** Kuralı açmış oyuncu, sonraki sıralarında elindeki perleri yere dizebilir ve yerdeki perlere (kendi ve rakiplerin) uyan taşları işleyebilir.

## 3. Dağıtım ve tur akışı

- 4 oyuncu. Her oyuncuya **14 taş**, başlayan oyuncuya **15 taş**.
- Başlayanın **fazlalık (15.) taşı oyun başında herkese gösterilir.**
- Başlayan oyuncu her elde bir sonrakine geçer.
- Sıra akışı (okey düzeni):
  1. Soldaki oyuncunun attığı **yan taşı al** *veya* **ortadan çek**.
  2. Kural açılmadıysa kuralı aç / açıldıysa per diz, işle.
  3. Bir taş at (attığın taş sağındakinin önüne düşer).

### İstek mekaniği (yan taş)

- Atılan taş öncelikle **sırası gelen oyuncunundur** (atanın sağındaki). O alırsa ortadan çekmez — normal hamledir.
- O almazsa (ortadan çekerse) **diğer oyuncular "İstiyorum" diyebilir.** Yanında olmayan kişiden taş isteyen, yan taşı **ortadan 1 taş ile birlikte** alır (eline +2 taş).
- İstek sayısında **sınır yok.**
- Stratejik kullanım: ortadaki taş lazım olmasa bile ortadakini görmek veya sıradaki oyuncuyu engellemek için istenebilir.

## 4. Oyun modları

- **Tekli:** 4 oyuncu, herkes kendi puanı.
- **Takım:** Karşılıklı oturanlar takımdır (2'ye 2).

## 5. Puanlama

Puanlar ceza mantığındadır; **11 el sonunda en düşük puan kazanır** (biten taraf eksi puan alır).

| Bitiş | Biten (kişi/takım) | Diğerleri |
|---|---|---|
| Normal bitiş | **−50** | Elde kalan taşların toplamı |
| Okey ile bitiş | **−100** | Ceza ×2 |
| Çift okey ile bitiş | **−200** | Ceza ×4 |
| Çift eli — normal | **−100** | Ceza ×2 |
| Çift eli — okey | **−200** | Ceza ×4 |
| Çift eli — çift okey | **−400** | Ceza ×8 |

- Taş değerleri: 1–9 kendi sayısı, **10 ve üstü (10, 11, 12, 13) = 10 puan**.
- Takım modunda karşı takım elinde kalan taşları hesaplar.

## 6. Teknoloji kararı: **Web**

| | Web (seçildi) | Unity |
|---|---|---|
| GitHub'dan link ile oynanabilir prototip | GitHub Pages, anında | WebGL build ağır, mobil tarayıcıda zayıf |
| Mobil mağaza | Capacitor ile Android/iOS | Güçlü |
| PC web sürümü | Aynı kod tabanı | Ayrı build |
| Online | Node.js + Colyseus, kural motoru sunucuyla ortak | Photon/Netcode, ayrı dil |
| İterasyon hızı | Kaydet → tarayıcı yenilenir | Daha yavaş |

**Yığın:**
- **Dil:** TypeScript
- **Kural motoru:** `packages/core` — saf TypeScript, UI'dan bağımsız, Vitest ile test edilir. İstemci, botlar ve online sunucu **aynı motoru** kullanır (hile koruması için sunucu otoriter olur).
- **Oyun ekranı:** Phaser 3 + Vite (masa, ıstaka, sürükle-bırak, animasyon)
- **Online (Faz 3):** Colyseus (Node.js), oda kodu ile davet, yeniden bağlanma
- **Mobil paket (Faz 4):** Capacitor
- **Yayın:** GitHub Actions → GitHub Pages

```
kut-americano/
├─ packages/core/      # taş, deste, per doğrulama, kontratlar, puanlama, tur akışı
├─ apps/client/        # Phaser + Vite oyun istemcisi
├─ apps/server/        # (Faz 3) Colyseus sunucusu
└─ docs/ISTISARE.md    # bu dosya
```

## 7. Görsel yön (101 Okey tarzı, özgün çizim)

- Yatay (landscape) mobil ekran; yeşil çuha masa, ahşap ıstaka (2 sıra).
- Krem taşlar; 4 renk sayı: kırmızı, sarı, mavi, siyah. Sahte okey simgeli joker taşı.
- Ortada kapalı deste ve kalan taş sayısı; her oyuncunun köşesinde attığı yan taş yığını.
- Rakiplerin avatarı, taş sayısı ve **"Kural açtı" rozeti**.
- **Kural Paneli** (üst orta): "El 3/11 — 3'lü küt + 3'lü seri", kilit simgesi (açık/kapalı).
- Butonlar: Diz / Kuralı Aç / İşle / İstiyorum / Sırala (seri–küt).
- Tüm grafikler bu proje için özgün çizilir; mevcut bir okey uygulamasının görselleri kopyalanmaz.

## 8. Yol haritası

| Faz | Hedef | Çıktı |
|---|---|---|
| 0 | İstişare | Bu doküman, kuralların netleşmesi |
| 1 ✅ | **Deneme sürümü** | Tarayıcıda 1 kişi + 3 bot, tekli + takım modu, 11 el, puan tablosu |
| 2 | **GitHub prototipi** | GitHub reposu + Pages linki, telefonda açılır, takım modu |
| 3 | Online | Colyseus sunucu, oda kodu, arkadaşla oynama |
| 4 | Mobil uygulama | Capacitor ile Android (sonra iOS) |
| 5 | PC web | Masaüstü düzeni ve klavye/fare iyileştirmeleri |

**Faz 1 iş listesi:**
1. Proje iskeleti (monorepo, TypeScript, Vite, Vitest)
2. Kural motoru: taş/deste, per doğrulama (küt/seri/okey), 11 kontrat, açma/işleme, istek mekaniği, puanlama — testleriyle
3. Masa ekranı: ıstaka, sürükle-bırak, yan taş, orta deste, Kural Paneli
4. Basit botlar (kural tabanlı: per arar, kontrata yakın taşları tutar, istek kararı verir)
5. El sonu / oyun sonu puan ekranı

## 9. Açık sorular

Cevaplanmayanlar için parantez içindeki **varsayım** ile başlanır.

- **S1 — Taş seti:** Standart okey takımı mı (4 renk × 13 × 2 + **2 sahte okey** = 106 taş), yoksa 4 joker mi (108 taş)? *(Varsayım: 106 taş, 2 okey. 4×14+1 = 57 taş dağıtılır, ortada 49 kalır.)*
- **S2 — "Okey ile bitiş" ve "çift okey ile bitiş" tam olarak ne?** Son atılan taşın okey olması mı, bitiş elinde okey kullanılması mı? Çift okey = iki okeyle mi bitmek? *(Varsayım: son atılan taş okeyse "okey ile bitiş"; elinde iki okey varken biri atılıp diğeri perde kullanılarak bitilirse "çift okey".)*
- **S3 — Elde kalan okeyin ceza değeri?** *(Varsayım: 25 puan.)*
- **S4 — 10. el "Elden bitme":** Önceden hiç açmadan, tüm 14 taşı tek hamlede perleyip bitmek mi? Bu elde ara açma yok mu? *(Varsayım: evet, tek hamlede bitiş; puanlama normal bitiş gibi.)*
- **S5 — 11. el "Çift eli":** Kaç çift gerekli — 7 çift mi? Çift = aynı renk + aynı sayı mı? Okey çiftin yerine geçer mi? *(Varsayım: 7 çift, aynı renk-aynı sayı, okey bir taşın yerine geçer.)*
- ~~**S6 — Kontrat açıldıktan sonra dizme**~~ — **Cevaplandı:** açılış sırasında sadece kural iner; fazlalıklar sonraki sırada.
- **S7 — İşlemede okey değiştirme:** Yerdeki perde okeyin tuttuğu gerçek taş elindeyse, onu koyup okeyi alabilir mi? *(Varsayım: hayır, prototipte yok.)*
- **S8 — İstek zamanlaması ve öncelik:** Birden fazla kişi aynı anda isterse kim alır? İstek penceresi ne zaman kapanır? *(Varsayım — Faz 1'de böyle kodlandı: sırası gelen oyuncu ortadan çektiği anda diğer oyunculara sıra yönüne göre tek tek sorulur (en yakın önce, 8 sn süre); ilk "İSTE" diyen alır, sonra sırası gelen oyuncu devam eder.)*
- **S9 — Deste biterse:** Ortada taş kalmazsa el nasıl biter? *(Varsayım: el berabere biter, herkes elindeki cezayı yazar, kimse eksi almaz.)*
- **S10 — Takım modunda kural açma:** Takım arkadaşının açtığı kural diğerinin kilidini de açar mı? *(Varsayım: hayır, herkes kendi kuralını açar; takım biri bitince biter.)*
- **S11 — "Elden bitmek −50":** Bunu "eli bitirmek" (normal bitiş) olarak yorumladık. Doğru mu?
