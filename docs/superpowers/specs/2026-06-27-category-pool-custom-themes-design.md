# Tema Havuzu + Custom Temalar — Tasarım

**Tarih:** 2026-06-27
**Durum:** Onaylandı (brainstorming), implementasyon planı bekliyor
**Kapsam dilimi:** A (havuz + custom temalar). Oyuncu oyu modu bu dilimde değil.

## Problem

Create-room formundaki **Kategori Modu** kontrolü (Rastgele / Sen seç / Oyuncu oyu) bugün
işlevsiz: `categoryMode` Room state'ine ve Mongo'ya kaydediliyor ama motorun davranışını
hiç değiştirmiyor. Motorun gerçekten baktığı tek kategori levyesi `room.lockedCategory`
(admin SettingsForm'daki tek-kategori dropdown'u). Sonuç olarak üç mod da aynı davranıyor:
`lockedCategory` set'liyse o, değilse `targetPrompt.CATEGORIES` içinden tamamen rastgele.

Host'un istediği: hazır 20 kategoriye bağlı kalmadan, **odayı kurarken kendi temalarını**
yazabilmek; ayrıca hangi hazır kategorilerin sahada olacağını seçebilmek.

## Kanıt (kod doğrulaması)

- `lib/game/targetPrompt.js` — `CATEGORIES` (20 öğe, her biri `{code, labelTr, seeds[]}`),
  `pickRound({category, difficulty})` `category` verilmezse rastgele seçer, `expandSeedToPrompt`
  seed'i canlı görsel prompt'a açar. Custom tema = host metninin seed olması; pipeline buna uygun.
- `lib/game/matchLifecycle.js` — tur hedefi `generateTargetPrompt({ category: room.lockedCategory || undefined, ... })`.
  `categoryMode` hiçbir dalda okunmuyor (grep ile doğrulandı).
- `lib/game/state.js` — `categoryMode` (default 'RANDOM') + `lockedCategory: null` state'te var.
- `models/Room.js` — `categoryMode` enum alanı mevcut.
- `app/api/rooms/route.ts` — zod: `categoryMode: z.enum([...]).default('RANDOM')`.
- `app/create-room/CreateRoomFormClient.tsx` — 3 modlu segmented kontrol; havuz/picker yok.
- `components/admin/SettingsForm.tsx` — `lockedCategory` dropdown (boş = otomatik).

## Konsept: iki eksen

- **Havuz** — sahada hangi temalar var: açık hazır kategoriler + host'un yazdığı custom temalar.
- **Mod** — her tur havuzdan nasıl çekilir.

Modların yeniden tanımı:

| Mod | Anlam |
|---|---|
| Rastgele | Havuz = tüm hazır kategoriler. Her tur tam rastgele. (Bugünün dürüst hali.) |
| Sen seç | Host havuzu kurar: hazır kategorileri aç/kapa + kendi custom temalarını yaz. Her tur o havuzdan rastgele. |
| Oyuncu oyu | KAPSAM DIŞI (bu dilimde ölü kalır; UI'da "yakında" olarak pasif gösterilebilir). |

## UI tasarımı — create-room formu

"Sen seç" seçilince, mod satırının hemen altında **inline reveal** havuz editörü açılır
(tournamentMode'un `isT` koşuluyla göründüğü kalıbın aynısı). Mevcut konsol panelinin parçası
gibi durur — dışarıdan eklenmiş kart gibi değil.

- **Hazır temalar:** 20 kategori, aç/kapa chip grid'i. Açık = accent dolgu, kapalı = sönük.
  Mevcut `segBtnVisual(on)` / `pc-seg-btn` görsel dili küçük chip ölçeğine uyarlanır.
- **Kendi temaların:** text input + "Ekle" butonu (Enter ile de eklenir). Eklenenler altında
  `×` ile silinebilir chip listesi.
- Rastgele / Oyuncu oyu seçiliyken editör görünmez (state korunur, sadece gizli).

### Limitler / doğrulama
- Max **8** custom tema.
- Her tema **2–60** karakter (trim sonrası).
- Boş/whitespace eklenemez; case-insensitive tekrar eklenemez.
- Bu kurallar hem client'ta (anında) hem `app/api/rooms` zod şemasında (otorite) uygulanır.

### Boş havuz davranışı
"Sen seç" ama havuz tamamen boşsa (hiç hazır kategori açık değil + hiç custom tema yok) →
Rastgele gibi davran (tüm kategoriler). Formda küçük uyarı satırı: "Havuz boş — rastgele oynanır."
(`rowDescStyle` diliyle, mevcut `modeTournamentHint` gibi.)

## Davranış / motor bağlama

Yeni Room alanları (state + Room.js + zod + create-room draft):
- `categoryPool: string[]` — açık hazır kategori code'ları (örn. `['cinema','fantasy','food']`).
- `customThemes: string[]` — host metinleri.
- `categoryMode` korunur.

`targetPrompt.pickRound` bir `pool` (kategori code listesi) + `customThemes` kabul edecek
biçimde genişletilir:
- Birleşik havuzdan (pool öğeleri + custom temalar) rastgele bir öğe seçilir.
- Hazır kategori seçilirse: mevcut akış — `{category: code, difficulty, seed}`.
- Custom tema seçilirse: `{category: 'custom', customSeed: <metin>, difficulty}` döner;
  `generateTargetPrompt` `customSeed`'i doğrudan `expandSeedToPrompt`'a verir.

`matchLifecycle` tur hedefi üretirken:
- `room.lockedCategory` set'liyse → **o kazanır** (admin operatör override'ı; mevcut davranış korunur).
- Aksi halde `categoryMode === 'HOST_SELECTED'` ve havuz doluysa → havuzdan çek.
- Aksi halde → bugünkü tam rastgele.

Sahne rozeti: custom tema turunda kategori etiketi yerine temanın metni (ya da "ÖZEL · <metin>")
gösterilir; `categoryLabel` custom için metni döndürür.

## Tutarlılık / responsive kuralları (zorunlu)

- Mevcut create-room görsel dili korunur: `--pc-*` token'ları, üç font (Silkscreen pixel /
  Inter Tight body / JetBrains Mono), arcade segmented/switch/CTA stilleri, maskot + konuşma balonu.
- **Responsive:** mobil (tek kolon), tablet ve ≥880px iki-kolon grid'de havuz editörü taşmadan,
  chip grid'i sarılarak (`flex-wrap` / auto-fit grid) düzgün durur. 44px min dokunma hedefleri.
- **Hydration tuzağı:** `<style>{...}</style>` içinde tırnaklı değer (grid-template-areas) yok;
  yalnız class selector + media query. Inline chip wrap için CSS class kullan.
- **i18n parity:** her yeni copy `i18n/dict.ts` içinde tr + en olarak aynı edit'te eklenir;
  `npm run i18n:check` geçmeli.
- **a11y:** chip'ler `role="radio"`/`aria-pressed` uygun şekilde; custom tema sil butonları
  erişilebilir etiketli.
- `npm run typecheck` (CI deploy gate) ve mevcut smoke akışı bozulmaz.

## Yeni hazır kategoriler (kapsam içi)

`lib/game/targetPrompt.js` `CATEGORIES` listesine yeni temalar eklenir; her biri mevcut
`{code, labelTr, seeds[]}` şeklinde 5 küratörlü seed ile. Bunlar otomatik olarak hem Rastgele
modunda hem "Sen seç" havuz chip'lerinde belirir (ekstra UI işi yok — veri-odaklı).

Eklenecekler (host onayıyla budanabilir):
- `backrooms` — **BACKROOMS** (istendi). Seeds: liminal sarı ofis koridoru, vızıldayan flüoresan
  + nemli halı, su basmış backrooms katı, sonsuz aynı kapılı merdiven boşluğu, gece ıssız AVM.
- `horror` — **KORKU** (şu an yok). Seeds: terk edilmiş hastane koridoru, sisli orman evi,
  yanan mum ışığında bir gölge, eski bir lunaparkın enkazı, çatı katında tek sandalye.
- `anime` — **ANİME**. Seeds: çatıda gün batımı sahnesi, sakura altında düello, mecha hangarı,
  kedili büyücü dükkânı, yağmurda neon sokak.
- `memes` — **İNTERNET / MEME**. Seeds: alakasız iki nesnenin absürt birleşimi (mizah tonu),
  abartılı tepki anı, "this is fine" tarzı sahne, kötü çizilmiş kahraman, ironik kurumsal stok görsel.

Not: `horror`/`anime`/`memes` öneri; host plan incelemesinde çıkarabilir. `backrooms` sabit.

## Kapsam dışı

- Oyuncu oyu (canlı tur-içi oylama fazı) — ayrı dilim.
- Custom temaya zorluk/ekstra ayar — bu dilimde sadece metin.

## Açık riskler

- Custom tema metni Gemini'ye gidiyor → uzunluk/sayı limiti dışında içerik denetimi yok
  (MVP kabul; ileride moderasyon eklenebilir).
- `lockedCategory` vs havuz önceliği netleştirildi (lockedCategory kazanır) — implementasyonda
  bu sıralama korunmalı.
