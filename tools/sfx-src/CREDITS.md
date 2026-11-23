# Ses kaynakları

Oyundaki tüm sesler bu klasördeki kayıtlardan `node tools/build-sfx.mjs` (ya da `npm run sfx`) ile
üretilir → `apps/client/public/sfx/*.mp3`. Hepsi **CC0 (kamu malı)**: ticari kullanım serbest,
atıf zorunlu değil (yine de teşekkür ederiz).

## kenney/ — Kenney (kenney.nl), CC0
Gerçek kayıtlar. 23.11.2026'da indirildi.
- **Casino Audio** — chip-lay, chips-collide, chips-stack, card-slide, card-fan, card-shove, dice-shake
  (taş konma / seçme / çekme / karma)
- **Impact Sounds** — impactBell_heavy, impactPlate_heavy (çarpışma çanı, çarpan damgası)
- **Interface Sounds** — confirmation, error (sıra sende, kural açma, uyarı)

## opengameart/ — OpenGameArt.org, CC0
Orkestral zafer müzikleri (okey / çift okey / Çift Eli kutlamaları):
- `triumphant.mp3` — "Triumphant", Emma_MA — https://opengameart.org/content/triumphant
- `fanfare.ogg` — "Just a random fanfare", Spring Spring — https://opengameart.org/content/just-a-random-fanfare
- `Heavy_ConceptB.mp3` — "Victory Fanfare Short", cynicmusic — https://opengameart.org/content/victory-fanfare-short
- `winmelody.ogg` — "Win Fanfare", gchoc — https://opengameart.org/content/win-fanfare
- `Excitement_0.ogg` — "Orchestral Excitement [0:30]", Dizzy Crow — https://opengameart.org/content/orchestral-excitement-030

## Hangi ses nerede
| Oyun sesi | Kaynak |
|---|---|
| tok (taş konma) | chip-lay 1–3 |
| select (seçme/buton) | chips-collide 3–4 |
| draw (desteden çekme) | card-slide 1, 4 |
| shuffle (dağıtma) | dice-shake-1 |
| win (el kazanma) | winmelody (ilk 3,4 sn) |
| okey (×2) | çan + fanfare.ogg son bölüm |
| okey-royal (Çift Eli ×4) | çan + triumphant.mp3 finali |
| cift-okey (×4) | çan + tabak + Heavy_ConceptB + çip yağmuru |
| cift-okey-royal (×8) | çift çan + Excitement_0 doruk finali + çip yağmuru |
