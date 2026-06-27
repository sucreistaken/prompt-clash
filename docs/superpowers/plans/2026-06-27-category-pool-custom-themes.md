# Tema Havuzu + Custom Temalar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create-room'daki "Sen seç" modunu gerçek bir tema-havuzu editörüne çeviren (hazır kategori aç/kapa chip'leri + host'un yazdığı serbest-metin custom temalar) ve bunları görsel-üretim motoruna bağlayan değişiklik; ayrıca yeni hazır kategoriler (backrooms + horror/anime/memes).

**Architecture:** İki yeni Room alanı (`categoryPool: string[]`, `customThemes: string[]`) zod → RAM state → Mongo boyunca taşınır. `targetPrompt.pickRound` bir havuz + custom temalar kabul edecek şekilde genişletilir; custom tema seçilirse metnin kendisi seed olur ve mevcut Gemini `expandSeedToPrompt` pipeline'ı onu canlı prompt'a açar. UI, mevcut arcade/pixel diliyle inline reveal olarak "Sen seç" altında açılır; kategori etiketleri server `page.tsx`'ten prop ile gelir (gemini deps client'a sızmaz).

**Tech Stack:** Next.js App Router (TS/TSX frontend, plain-JS backend `lib/`), Zod, Mongoose (graceful-degrade), Socket.io. Test framework YOK — pure logic için `node` assert script'leri, gate olarak `npm run typecheck` + `npm run i18n:check`, görsel için Playwright/manuel.

## Global Constraints

- **Görsel dil:** Sadece `--pc-*` tema token'ları; üç font (Silkscreen pixel / Inter Tight body / JetBrains Mono); mevcut arcade segmented/switch/CTA stilleri ve maskot korunur. Yeni UI formun parçası gibi durmalı.
- **Responsive:** Mobil tek kolon, tablet, ≥880px iki-kolon grid — havuz editörü taşmadan sarmalı (flex-wrap); min 44px dokunma hedefleri.
- **Hydration tuzağı:** `<style>{...}</style>` JSX children içinde tırnaklı değer (örn. `grid-template-areas: "..."`) YOK — yalnız class selector + media query.
- **i18n parity:** Her yeni copy `i18n/dict.ts` içinde `tr:` ve `en:` olarak AYNI edit'te eklenir; `npm run i18n:check` geçmeli.
- **Backend değişikliğinden sonra** dev server restart gerekir (Next HMR `lib/`'i izlemez).
- **CI/deploy gate:** `npm run typecheck` her task sonunda geçmeli.
- **MUST kuralları:** `lib/game/*` düzenlerken roomId-first + broadcast-after-mutation kalıplarını bozma (bu planda yeni transition eklenmiyor; sadece pickRound argümanları değişiyor).
- **Limitler:** max 8 custom tema; her biri trim sonrası 2–60 karakter; boş/whitespace ve case-insensitive tekrar eklenemez. Bu kurallar hem client'ta hem zod'da uygulanır.

---

### Task 1: Yeni hazır kategoriler (veri)

**Files:**
- Modify: `lib/game/targetPrompt.js` (CATEGORIES dizisi, ~line 98'den önce yeni öğeler)
- Create: `scripts/checks/categoryData.js`

**Interfaces:**
- Produces: `CATEGORIES` dizisine 4 yeni `{code, labelTr, seeds[]}` öğesi: `backrooms`, `horror`, `anime`, `memes`. Diğer task'lar bu code'lara isimle bağlı değil (pickRound dinamik çalışır), ama UI chip'leri ve havuz bu code'ları otomatik gösterir.

- [ ] **Step 1: Doğrulama script'ini yaz (failing test)**

Create `scripts/checks/categoryData.js`:

```js
'use strict';
// Pure-data assertion: CATEGORIES iyi biçimli mi + yeni temalar eklendi mi.
const assert = require('assert');
const { CATEGORIES } = require('../../lib/game/targetPrompt.js');

const codes = CATEGORIES.map((c) => c.code);
const required = ['backrooms', 'horror', 'anime', 'memes'];
for (const code of required) {
  assert.ok(codes.includes(code), `missing category: ${code}`);
}
// Her kategori: code (string), labelTr (non-empty string), seeds (>=3 non-empty string).
for (const c of CATEGORIES) {
  assert.ok(typeof c.code === 'string' && c.code.length > 0, `bad code: ${JSON.stringify(c)}`);
  assert.ok(typeof c.labelTr === 'string' && c.labelTr.length > 0, `bad labelTr: ${c.code}`);
  assert.ok(Array.isArray(c.seeds) && c.seeds.length >= 3, `bad seeds: ${c.code}`);
  for (const s of c.seeds) {
    assert.ok(typeof s === 'string' && s.trim().length > 0, `empty seed in ${c.code}`);
  }
}
// Code'lar benzersiz.
assert.strictEqual(new Set(codes).size, codes.length, 'duplicate category codes');
console.log(`OK — ${CATEGORIES.length} categories, all well-formed, new themes present.`);
```

- [ ] **Step 2: Çalıştır, başarısız olduğunu gör**

Run: `node scripts/checks/categoryData.js`
Expected: FAIL — `AssertionError: missing category: backrooms`

- [ ] **Step 3: Yeni kategorileri ekle**

`lib/game/targetPrompt.js` içinde, CATEGORIES dizisinin son öğesi (`vehicles`, ~line 96-98) ile kapanış `];` arasına ekle (öncesindeki öğeye virgül koymayı unutma):

```js
  {
    code: 'backrooms', labelTr: 'BACKROOMS',
    seeds: ['an endless yellow office hallway', 'buzzing fluorescent lights over damp carpet', 'a flooded backrooms level', 'an infinite stairwell of identical doors', 'a lone figure in a liminal empty mall at night']
  },
  {
    code: 'horror', labelTr: 'KORKU',
    seeds: ['an abandoned hospital corridor', 'a fog-wrapped cabin in the woods', 'a single shadow under a candle', 'the ruins of an old amusement park', 'one chair alone in a dark attic']
  },
  {
    code: 'anime', labelTr: 'ANİME',
    seeds: ['a rooftop sunset confession scene', 'a sword duel under falling sakura', 'a giant mecha in its hangar', 'a cozy witch supply shop', 'a neon street in the rain']
  },
  {
    code: 'memes', labelTr: 'İNTERNET',
    seeds: ['two unrelated objects absurdly merged', 'an exaggerated reaction moment', 'a calm figure in a burning room', 'a badly drawn heroic pose', 'an ironic corporate stock photo']
  }
```

- [ ] **Step 4: Çalıştır, geçtiğini gör**

Run: `node scripts/checks/categoryData.js`
Expected: PASS — `OK — 24 categories, all well-formed, new themes present.`

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: hatasız çıkış.

- [ ] **Step 6: Commit**

```bash
git add lib/game/targetPrompt.js scripts/checks/categoryData.js
git commit -m "feat(categories): add backrooms, horror, anime, memes built-in themes"
```

---

### Task 2: `pickRound` havuz + custom tema desteği

**Files:**
- Modify: `lib/game/targetPrompt.js` (`pickRound`, `categoryLabel`)
- Create: `scripts/checks/pickRoundPool.js`

**Interfaces:**
- Consumes: `CATEGORIES`, `DIFFICULTIES`, `_findCategory`, `_rand` (mevcut, aynı dosyada).
- Produces:
  - `pickRound({ category?, difficulty?, pool?, customThemes? })` → `{ category, difficulty, seed }`. Yeni davranış: `pool` (kategori code dizisi) ve/veya `customThemes` (string dizisi) verilirse seçim bunların birleşik havuzundan yapılır; custom tema seçilirse dönen `category === 'custom'` ve `seed` = temanın metni. `category` (tek kilit) verilirse o her şeyi geçersiz kılar (admin override). İkisi de yoksa tüm CATEGORIES üzerinden tam rastgele (mevcut davranış korunur).
  - `categoryLabel('custom')` → `'ÖZEL'`.

- [ ] **Step 1: Test script'ini yaz (failing test)**

Create `scripts/checks/pickRoundPool.js`:

```js
'use strict';
const assert = require('assert');
const { pickRound, categoryLabel, CATEGORIES } = require('../../lib/game/targetPrompt.js');

const allCodes = CATEGORIES.map((c) => c.code);

// 1) Argümansız → geçerli bir hazır kategori (mevcut davranış).
for (let i = 0; i < 50; i++) {
  const r = pickRound();
  assert.ok(allCodes.includes(r.category), `random gave unknown category: ${r.category}`);
  assert.ok(typeof r.seed === 'string' && r.seed.length > 0);
}

// 2) Tek kilit (admin) → her zaman o kategori.
for (let i = 0; i < 20; i++) {
  const r = pickRound({ category: 'backrooms' });
  assert.strictEqual(r.category, 'backrooms');
}

// 3) Sadece built-in pool → yalnız havuzdaki kategorilerden çekilir.
const pool = ['cinema', 'food'];
for (let i = 0; i < 80; i++) {
  const r = pickRound({ pool });
  assert.ok(pool.includes(r.category), `pool pick out of pool: ${r.category}`);
}

// 4) Sadece custom temalar → category 'custom', seed = tema metni.
const customs = ['cats in space', '90s turkish films'];
const seenSeeds = new Set();
for (let i = 0; i < 80; i++) {
  const r = pickRound({ customThemes: customs });
  assert.strictEqual(r.category, 'custom', `custom should yield category 'custom', got ${r.category}`);
  assert.ok(customs.includes(r.seed), `custom seed not from list: ${r.seed}`);
  seenSeeds.add(r.seed);
}
assert.strictEqual(seenSeeds.size, 2, 'both custom themes should appear over 80 draws');

// 5) Karışık havuz → built-in code'lar VEYA 'custom'.
const mixedSeen = new Set();
for (let i = 0; i < 200; i++) {
  const r = pickRound({ pool: ['cinema'], customThemes: ['cats in space'] });
  assert.ok(r.category === 'cinema' || r.category === 'custom', `mixed gave: ${r.category}`);
  mixedSeen.add(r.category);
}
assert.strictEqual(mixedSeen.size, 2, 'both builtin and custom should appear in mixed pool');

// 6) Bilinmeyen kilit kategori → güvenli fallback (tam rastgele, patlamaz).
const rUnknown = pickRound({ category: 'does-not-exist' });
assert.ok(allCodes.includes(rUnknown.category), 'unknown lock should fall back to random builtin');

// 7) Boş/whitespace custom temalar elenir; hepsi boşsa fallback rastgele.
const rEmpty = pickRound({ customThemes: ['   ', ''] , pool: [] });
assert.ok(allCodes.includes(rEmpty.category), 'all-empty pool should fall back to random builtin');

// 8) categoryLabel custom → 'ÖZEL'.
assert.strictEqual(categoryLabel('custom'), 'ÖZEL');
assert.strictEqual(categoryLabel('cinema'), 'SİNEMA');
assert.strictEqual(categoryLabel('nope'), '');

console.log('OK — pickRound pool/custom behavior verified.');
```

- [ ] **Step 2: Çalıştır, başarısız olduğunu gör**

Run: `node scripts/checks/pickRoundPool.js`
Expected: FAIL (pool/customThemes henüz desteklenmiyor — örn. custom çağrısı 'custom' yerine rastgele kategori döndürür).

- [ ] **Step 3: `pickRound`'u genişlet**

`lib/game/targetPrompt.js` içindeki mevcut `pickRound`'u (lines ~110-116) tamamen şununla değiştir:

```js
// Kategori/zorluk verilmişse onu kullanır; pool/customThemes verilmişse o havuzdan
// çeker; hiçbiri yoksa tüm kategorilerden rastgele seçer. Bir tohum çeker.
function pickRound({ category, difficulty, pool, customThemes } = {}) {
  const diff =
    (difficulty && DIFFICULTIES.find((d) => d.code === difficulty)) || _rand(DIFFICULTIES);

  // 1) Tek kilit kategori (admin override) — geçerliyse her şeyi geçersiz kılar.
  if (category) {
    const locked = _findCategory(category);
    if (locked) {
      return { category: locked.code, difficulty: diff.code, seed: _rand(locked.seeds) };
    }
    // bilinmeyen kod → yok say, aşağı düş.
  }

  // 2) Host-küratörlü havuz: hazır kategoriler + serbest-metin custom temalar.
  const builtins = Array.isArray(pool) ? pool.map(_findCategory).filter(Boolean) : [];
  const customs = Array.isArray(customThemes)
    ? customThemes.map((t) => (typeof t === 'string' ? t.trim() : '')).filter(Boolean)
    : [];

  if (builtins.length || customs.length) {
    const candidates = [
      ...builtins.map((c) => ({ kind: 'builtin', cat: c })),
      ...customs.map((text) => ({ kind: 'custom', text }))
    ];
    const pick = _rand(candidates);
    if (pick.kind === 'builtin') {
      return { category: pick.cat.code, difficulty: diff.code, seed: _rand(pick.cat.seeds) };
    }
    return { category: 'custom', difficulty: diff.code, seed: pick.text };
  }

  // 3) Varsayılan: tüm kategoriler üzerinden tam rastgele.
  const cat = _rand(CATEGORIES);
  return { category: cat.code, difficulty: diff.code, seed: _rand(cat.seeds) };
}
```

Aynı dosyadaki `categoryLabel`'ı (lines ~135-137) şununla değiştir:

```js
function categoryLabel(code) {
  if (code === 'custom') return 'ÖZEL';
  return _findCategory(code)?.labelTr || '';
}
```

- [ ] **Step 4: Çalıştır, geçtiğini gör**

Run: `node scripts/checks/pickRoundPool.js`
Expected: PASS — `OK — pickRound pool/custom behavior verified.`

- [ ] **Step 5: Regresyon — kategori verisi hâlâ sağlam**

Run: `node scripts/checks/categoryData.js && npm run typecheck`
Expected: ikisi de geçer.

- [ ] **Step 6: Commit**

```bash
git add lib/game/targetPrompt.js scripts/checks/pickRoundPool.js
git commit -m "feat(target): pickRound supports category pool + free-text custom themes"
```

---

### Task 3: Room state + Mongo modeli alanları

**Files:**
- Modify: `lib/game/state.js` (room factory, ~line 65 civarı)
- Modify: `models/Room.js` (`RoomSettingsSchema`)
- Create: `scripts/checks/roomPoolFields.js`

**Interfaces:**
- Consumes: `createRoom` factory (state.js) `settings` objesi = POST body.
- Produces: Room state'inde `room.categoryPool: string[]` ve `room.customThemes: string[]` (settings'te yoksa `[]`). Task 5 bu alanları okur.

- [ ] **Step 1: Test script'ini yaz (failing test)**

Create `scripts/checks/roomPoolFields.js`:

```js
'use strict';
const assert = require('assert');
const { createRoom } = require('../../lib/game/state.js');

// settings ile → alanlar taşınır.
const withPool = createRoom({
  roomCode: 'TEST01',
  hostId: 'host_x',
  roomName: 'r',
  settings: { categoryMode: 'HOST_SELECTED', categoryPool: ['cinema', 'food'], customThemes: ['cats in space'] },
  state: 'WAITING_FOR_PLAYERS'
});
assert.deepStrictEqual(withPool.categoryPool, ['cinema', 'food']);
assert.deepStrictEqual(withPool.customThemes, ['cats in space']);
assert.strictEqual(withPool.categoryMode, 'HOST_SELECTED');

// settings'te alan yoksa → boş diziler (undefined değil).
const without = createRoom({
  roomCode: 'TEST02',
  hostId: 'host_y',
  roomName: 'r',
  settings: { categoryMode: 'RANDOM' },
  state: 'WAITING_FOR_PLAYERS'
});
assert.deepStrictEqual(without.categoryPool, []);
assert.deepStrictEqual(without.customThemes, []);

console.log('OK — room factory carries categoryPool + customThemes.');
```

> NOT: `createRoom`'un imzası objedir (`route.ts`'teki çağrıyla aynı: `{ roomCode, hostId, roomName, settings, state }`). Eğer factory bu objeyi farklı destructure ediyorsa, script'i gerçek imzaya göre düzelt — önce `lib/game/state.js`'teki `function createRoom(...)` tanımını oku.

- [ ] **Step 2: Çalıştır, başarısız olduğunu gör**

Run: `node scripts/checks/roomPoolFields.js`
Expected: FAIL — `categoryPool` undefined (deepStrictEqual `[]` ile uyuşmaz).

- [ ] **Step 3: State factory'ye alanları ekle**

`lib/game/state.js` içinde `categoryMode: (settings && settings.categoryMode) || 'RANDOM',` satırının (~line 65) hemen ALTINA ekle:

```js
    categoryPool: settings && Array.isArray(settings.categoryPool) ? settings.categoryPool : [],
    customThemes: settings && Array.isArray(settings.customThemes) ? settings.customThemes : [],
```

- [ ] **Step 4: Mongo şemasına alanları ekle**

`models/Room.js` `RoomSettingsSchema` içinde `tournamentMode: { ... }` satırının ardına (objenin sonuna, virgülle) ekle:

```js
    categoryPool: { type: [String], default: [] },
    customThemes: { type: [String], default: [] }
```

(Bir önceki `tournamentMode` satırının sonuna virgül eklemeyi unutma.)

- [ ] **Step 5: Çalıştır, geçtiğini gör + typecheck**

Run: `node scripts/checks/roomPoolFields.js && npm run typecheck`
Expected: `OK — room factory carries categoryPool + customThemes.` ve typecheck temiz.

- [ ] **Step 6: Commit**

```bash
git add lib/game/state.js models/Room.js scripts/checks/roomPoolFields.js
git commit -m "feat(room): persist categoryPool + customThemes in state and Mongo schema"
```

---

### Task 4: API zod doğrulama (`POST /api/rooms`)

**Files:**
- Modify: `app/api/rooms/route.ts` (`CreateRoomBody` zod şeması, ~line 38-51)

**Interfaces:**
- Consumes: gelen JSON body.
- Produces: doğrulanmış `body.categoryPool: string[]` (default `[]`) ve `body.customThemes: string[]` (trim'li, her biri 2–60 char, max 8, default `[]`). Bu body `createRoom({ settings: body })` ve `saveRoom({ settings: body })`'e akar (Task 3 RAM + Mongo zaten hazır).

- [ ] **Step 1: Zod şemasına alanları ekle**

`app/api/rooms/route.ts` `CreateRoomBody` objesinde `tournamentMode: z.enum(['A', 'B']).default('A')` satırının sonuna virgül koyup ardına ekle:

```ts
  categoryPool: z.array(z.string()).max(40).default([]),
  customThemes: z.array(z.string().trim().min(2).max(60)).max(8).default([])
```

> Güvenlik: `categoryPool` serbest string kabul eder; bilinmeyen code'lar `pickRound` içindeki `_findCategory` ile zaten elenir (Task 2 testi #6). `customThemes` uzunluk/sayı burada (otorite) zorlanır — client doğrulaması UX içindir.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: hatasız.

- [ ] **Step 3: Runtime smoke (dev server)**

Bir terminalde dev server başlat: `npm run dev` (port 3000). Başka terminalde:

```bash
curl -s -X POST http://localhost:3000/api/rooms \
  -H 'Content-Type: application/json' \
  -d '{"categoryMode":"HOST_SELECTED","categoryPool":["cinema","food"],"customThemes":["cats in space","90s turkish films"]}' | head -c 400
```

Expected: `{"ok":true,...,"data":{"roomId":...}}` (200). Geçersiz custom (örn. `"customThemes":["a"]` — 2 char altı) gönderildiğinde `invalid_input` kodlu hata dönmeli:

```bash
curl -s -X POST http://localhost:3000/api/rooms \
  -H 'Content-Type: application/json' \
  -d '{"customThemes":["a"]}' | head -c 200
```

Expected: `ok:false` + `invalid_input` (400).

- [ ] **Step 4: Commit**

```bash
git add app/api/rooms/route.ts
git commit -m "feat(api): validate categoryPool + customThemes on room create"
```

---

### Task 5: Motoru bağla — duel + tournament hedef üretimi

**Files:**
- Modify: `lib/game/matchLifecycle.js` (`ensureTargetImage`, ~line 74)
- Modify: `lib/game/tournament/topic.js` (`nextTopic`, ~line 24)
- Create: `scripts/checks/engineWiring.js`

**Interfaces:**
- Consumes: `room.categoryMode`, `room.categoryPool`, `room.customThemes`, `room.lockedCategory`, `room.lockedDifficulty`; `pickRound` (Task 2).
- Produces: `categoryMode === 'HOST_SELECTED'` iken her tur hedefi havuzdan/custom'dan çekilir; aksi halde mevcut tam-rastgele davranış. `lockedCategory` set'liyse o önceliklidir (mevcut admin override korunur).

- [ ] **Step 1: Test script'ini yaz (failing test)**

Create `scripts/checks/engineWiring.js`. `ensureTargetImage` I/O yaptığı için doğrudan çağırmak yerine, onun `pickRound`'a verdiği argümanları üreten saf bir yardımcıyı test ederiz. Bu task o yardımcıyı `targetPrompt`'tan dışa açar:

```js
'use strict';
const assert = require('assert');
const { roundArgsForRoom, pickRound, CATEGORIES } = require('../../lib/game/targetPrompt.js');

const allCodes = CATEGORIES.map((c) => c.code);

// HOST_SELECTED + havuz → pickRound havuzdan çeker.
const hostRoom = { categoryMode: 'HOST_SELECTED', categoryPool: ['cinema'], customThemes: ['cats in space'], lockedCategory: null, lockedDifficulty: null };
const a = roundArgsForRoom(hostRoom);
assert.deepStrictEqual(a.pool, ['cinema']);
assert.deepStrictEqual(a.customThemes, ['cats in space']);
for (let i = 0; i < 100; i++) {
  const r = pickRound(roundArgsForRoom(hostRoom));
  assert.ok(r.category === 'cinema' || r.category === 'custom');
}

// RANDOM → havuz argümanı verilmez (undefined), tam rastgele.
const randRoom = { categoryMode: 'RANDOM', categoryPool: ['cinema'], customThemes: ['x'], lockedCategory: null, lockedDifficulty: null };
const b = roundArgsForRoom(randRoom);
assert.strictEqual(b.pool, undefined);
assert.strictEqual(b.customThemes, undefined);
const rr = pickRound(roundArgsForRoom(randRoom));
assert.ok(allCodes.includes(rr.category));

// lockedCategory set → override, mode ne olursa olsun o kategori.
const lockedRoom = { categoryMode: 'HOST_SELECTED', categoryPool: ['cinema'], customThemes: [], lockedCategory: 'backrooms', lockedDifficulty: null };
for (let i = 0; i < 20; i++) {
  const r = pickRound(roundArgsForRoom(lockedRoom));
  assert.strictEqual(r.category, 'backrooms');
}

console.log('OK — engine wiring args correct for all modes.');
```

- [ ] **Step 2: Çalıştır, başarısız olduğunu gör**

Run: `node scripts/checks/engineWiring.js`
Expected: FAIL — `roundArgsForRoom is not a function`.

- [ ] **Step 3: `roundArgsForRoom` yardımcısını ekle ve dışa aç**

`lib/game/targetPrompt.js` içinde `pickRound`'dan sonra ekle:

```js
// Bir room'un kategori ayarlarından pickRound argümanlarını kurar.
// HOST_SELECTED modunda havuz/custom temaları geçer; diğer modlarda geçmez
// (tam rastgele). lockedCategory her zaman override olarak taşınır.
function roundArgsForRoom(room) {
  const hostSelected = room && room.categoryMode === 'HOST_SELECTED';
  return {
    category: (room && room.lockedCategory) || undefined,
    difficulty: (room && room.lockedDifficulty) || undefined,
    pool: hostSelected ? room.categoryPool : undefined,
    customThemes: hostSelected ? room.customThemes : undefined
  };
}
```

`module.exports` bloğuna `roundArgsForRoom` ekle (mevcut export listesine virgülle):

```js
module.exports = {
  CATEGORIES,
  DIFFICULTIES,
  pickRound,
  roundArgsForRoom,
  generateTargetPrompt,
  difficultyLabel,
  categoryLabel
};
```

> Mevcut export bloğunun tam alan listesini önce oku; yukarıdaki sıralama mevcut dosyadakini yansıtmalı — sadece `roundArgsForRoom` satırını ekle.

- [ ] **Step 4: `ensureTargetImage`'i bağla**

`lib/game/matchLifecycle.js` üstündeki `pickRound` import'unu `roundArgsForRoom`'u da içerecek şekilde güncelle (mevcut require satırını bul: `const { pickRound, generateTargetPrompt } = require('./targetPrompt.js');` benzeri → `roundArgsForRoom` ekle).

Ardından `ensureTargetImage` içindeki (lines ~74-77):

```js
    const round = pickRound({
      category: room.lockedCategory || undefined,
      difficulty: room.lockedDifficulty || undefined
    });
```

şununla değiştir:

```js
    const round = pickRound(roundArgsForRoom(room));
```

- [ ] **Step 5: Tournament topic'i bağla**

`lib/game/tournament/topic.js` üstündeki import'u güncelle:

```js
const { pickRound, generateTargetPrompt, roundArgsForRoom } = require('../targetPrompt.js');
```

`nextTopic` içindeki (lines ~24-27):

```js
  const round = pickRound({
    category: room.lockedCategory || null,
    difficulty: room.lockedDifficulty || null
  });
```

şununla değiştir:

```js
  const round = pickRound(roundArgsForRoom(room));
```

- [ ] **Step 6: Çalıştır, geçtiğini gör + regresyon + typecheck**

Run: `node scripts/checks/engineWiring.js && node scripts/checks/pickRoundPool.js && npm run typecheck`
Expected: üçü de geçer.

- [ ] **Step 7: Entegrasyon smoke (server gerekiyor)**

Backend değişti → dev server'ı restart et (`npm run dev`). Sonra:

Run: `npm run smoke`
Expected: matchSmoke + multiRoomSmoke geçer (kategori havuzu varsayılan boş → mevcut rastgele davranış bozulmamış olmalı).

- [ ] **Step 8: Commit**

```bash
git add lib/game/targetPrompt.js lib/game/matchLifecycle.js lib/game/tournament/topic.js scripts/checks/engineWiring.js
git commit -m "feat(engine): use category pool + custom themes for target generation (duel + tournament)"
```

---

### Task 6: create-room UI — havuz editörü + i18n + responsive

**Files:**
- Modify: `app/create-room/page.tsx` (server — `CATEGORIES`'i prop geçir)
- Modify: `app/create-room/CreateRoomFormClient.tsx` (prop, draft alanları, havuz editörü, PLAYER_VOTE pasif, stiller)
- Modify: `i18n/dict.ts` (yeni copy — tr + en)

**Interfaces:**
- Consumes: `CATEGORIES` (server-side import), `pickRound` davranışı (Task 2), zod alanları (Task 4).
- Produces: Kullanıcı "Sen seç" seçince hazır kategori chip'lerini aç/kapatabilir ve max 8 custom tema ekleyebilir; `categoryPool` + `customThemes` POST body'sine gider.

- [ ] **Step 1: i18n anahtarlarını ekle (tr + en aynı edit)**

`i18n/dict.ts` içinde mevcut `createRoom*` anahtarlarının yanına — `tr` bloğuna:

```ts
  createRoomPoolBuiltinLabel: 'Hazır temalar',
  createRoomPoolCustomLabel: 'Kendi temaların',
  createRoomThemePlaceholder: 'tema yaz — örn. uzayda kediler',
  createRoomThemeAdd: 'Ekle',
  createRoomThemeRemove: 'Temayı kaldır',
  createRoomPoolEmptyHint: 'Havuz boş — rastgele oynanır.',
  createRoomPoolLimitHint: 'En fazla 8 tema, her biri 2–60 karakter.',
  createRoomModeSoon: 'Yakında',
```

`en` bloğuna AYNI anahtarlar:

```ts
  createRoomPoolBuiltinLabel: 'Built-in themes',
  createRoomPoolCustomLabel: 'Your themes',
  createRoomThemePlaceholder: 'type a theme — e.g. cats in space',
  createRoomThemeAdd: 'Add',
  createRoomThemeRemove: 'Remove theme',
  createRoomPoolEmptyHint: 'Pool empty — plays random.',
  createRoomPoolLimitHint: 'Up to 8 themes, 2–60 chars each.',
  createRoomModeSoon: 'Soon',
```

- [ ] **Step 2: Parity gate**

Run: `npm run i18n:check`
Expected: PASS (tüm tr anahtarlarının en karşılığı var).

- [ ] **Step 3: Server page kategori prop'unu geçsin**

`app/create-room/page.tsx`'i şununla değiştir:

```tsx
// /create-room — Story 1.8. Server component owns metadata + SEO.
// Form body lives in CreateRoomFormClient.tsx.

import type { Metadata } from 'next';
import { CreateRoomFormClient } from './CreateRoomFormClient';
import { CATEGORIES } from '@/lib/game/targetPrompt.js';

export const metadata: Metadata = {
  title: 'Yeni Oda · Prompt Clash',
  description:
    'Özel maç odanı saniyeler içinde oluştur. QR ile arkadaşlarınla paylaş, AI senin için çizsin.',
  robots: { index: false }
};

export default function CreateRoomPage() {
  const categories = (CATEGORIES as Array<{ code: string; labelTr: string }>).map((c) => ({
    code: c.code,
    labelTr: c.labelTr
  }));
  return <CreateRoomFormClient categories={categories} />;
}
```

- [ ] **Step 4: Client form — prop tipi, draft alanları, state**

`app/create-room/CreateRoomFormClient.tsx`:

(a) `RoomDraft` tipine ekle (`categoryMode` satırının altına):

```tsx
  categoryPool: string[];
  customThemes: string[];
```

(b) `DEFAULTS`'a ekle (`categoryMode: 'RANDOM',` altına):

```tsx
  categoryPool: [],
  customThemes: [],
```

(c) Bileşen imzalarına `categories` prop'unu geçir:

```tsx
type CategoryOption = { code: string; labelTr: string };

export function CreateRoomFormClient({ categories }: { categories: CategoryOption[] }) {
  return (
    <I18nProvider>
      <CreateRoomBody categories={categories} />
    </I18nProvider>
  );
}

function CreateRoomBody({ categories }: { categories: CategoryOption[] }) {
```

(d) `CreateRoomBody` içinde, mevcut `const [err, setErr] = useState<string | null>(null);` satırının altına ekle:

```tsx
  const [themeInput, setThemeInput] = useState('');

  function toggleCat(code: string) {
    set(
      'categoryPool',
      draft.categoryPool.includes(code)
        ? draft.categoryPool.filter((c) => c !== code)
        : [...draft.categoryPool, code]
    );
  }
  function addTheme() {
    const v = themeInput.trim();
    if (v.length < 2 || v.length > 60) return;
    if (draft.customThemes.length >= 8) return;
    if (draft.customThemes.some((t) => t.toLowerCase() === v.toLowerCase())) {
      setThemeInput('');
      return;
    }
    set('customThemes', [...draft.customThemes, v]);
    setThemeInput('');
  }
  function removeTheme(t: string) {
    set('customThemes', draft.customThemes.filter((x) => x !== t));
  }

  const poolEmpty = draft.categoryPool.length === 0 && draft.customThemes.length === 0;
```

- [ ] **Step 5: Client form — categoryMode segmentini güncelle + havuz editörü**

Mevcut categoryMode segmentinde (lines ~221-244) PLAYER_VOTE butonunu pasifleştir. `.map` içindeki `const on = draft.categoryMode === mode;` satırından sonra ekle ve `button`'a `disabled` + "yakında" rozeti ver:

```tsx
                {(['RANDOM', 'HOST_SELECTED', 'PLAYER_VOTE'] as const).map((mode) => {
                  const on = draft.categoryMode === mode;
                  const soon = mode === 'PLAYER_VOTE';
                  return (
                    <button
                      key={mode}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      aria-disabled={soon}
                      disabled={soon}
                      onClick={() => !soon && set('categoryMode', mode)}
                      className="pc-seg-btn"
                      style={{ ...segBtnVisual(on), opacity: soon ? 0.5 : 1, cursor: soon ? 'not-allowed' : 'pointer', position: 'relative' }}
                    >
                      {t(
                        mode === 'RANDOM'
                          ? 'categoryModeRandom'
                          : mode === 'HOST_SELECTED'
                            ? 'categoryModeHost'
                            : 'categoryModePlayerVote'
                      )}
                      {soon ? <span style={soonBadgeStyle}>{t('createRoomModeSoon')}</span> : null}
                    </button>
                  );
                })}
```

Bu segmenti saran `<div style={fieldStyle}>...</div>`'in KAPANIŞINDAN hemen önce (categoryMode segment `</div>`'inden sonra, fieldStyle `</div>`'inden önce) havuz editörünü ekle:

```tsx
              {draft.categoryMode === 'HOST_SELECTED' ? (
                <div style={poolWrapStyle}>
                  {/* Hazır temalar — aç/kapa chip grid */}
                  <span style={poolSubLabelStyle}>{t('createRoomPoolBuiltinLabel')}</span>
                  <div className="cr-chips" role="group" aria-label={t('createRoomPoolBuiltinLabel')}>
                    {categories.map((c) => {
                      const on = draft.categoryPool.includes(c.code);
                      return (
                        <button
                          key={c.code}
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggleCat(c.code)}
                          className="pc-seg-btn"
                          style={catChipStyle(on)}
                        >
                          {c.labelTr}
                        </button>
                      );
                    })}
                  </div>

                  {/* Kendi temaların — input + chip listesi */}
                  <span style={poolSubLabelStyle}>{t('createRoomPoolCustomLabel')}</span>
                  <div style={themeRowStyle}>
                    <input
                      type="text"
                      value={themeInput}
                      onChange={(e) => setThemeInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addTheme();
                        }
                      }}
                      maxLength={60}
                      placeholder={t('createRoomThemePlaceholder')}
                      className="pc-input"
                      style={themeInputStyle}
                      aria-label={t('createRoomPoolCustomLabel')}
                    />
                    <button
                      type="button"
                      onClick={addTheme}
                      disabled={draft.customThemes.length >= 8 || themeInput.trim().length < 2}
                      className="pc-seg-btn"
                      style={themeAddBtnStyle}
                    >
                      {t('createRoomThemeAdd')}
                    </button>
                  </div>
                  {draft.customThemes.length > 0 ? (
                    <div className="cr-chips">
                      {draft.customThemes.map((tm) => (
                        <span key={tm} style={themeChipStyle}>
                          {tm}
                          <button
                            type="button"
                            onClick={() => removeTheme(tm)}
                            aria-label={t('createRoomThemeRemove')}
                            style={themeChipXStyle}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <span style={rowDescStyle}>
                    {poolEmpty ? t('createRoomPoolEmptyHint') : t('createRoomPoolLimitHint')}
                  </span>
                </div>
              ) : null}
```

- [ ] **Step 6: Client form — yeni stiller + responsive chip CSS**

`// ─── Styles ───` bölümüne (dosya sonu civarı) ekle:

```tsx
const poolWrapStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  marginTop: 8,
  padding: '12px 12px 10px',
  border: '2px solid var(--pc-line)',
  borderRadius: 4,
  background: 'rgba(0,0,0,0.14)',
};

const poolSubLabelStyle: CSSProperties = {
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: 'var(--pc-text2)',
  marginTop: 2,
};

function catChipStyle(on: boolean): CSSProperties {
  return {
    fontFamily: "'Inter Tight', system-ui, sans-serif",
    fontSize: 11.5,
    fontWeight: 700,
    padding: '8px 10px',
    borderRadius: 3,
    lineHeight: 1.1,
    cursor: 'pointer',
    background: on ? 'var(--pc-accent)' : 'var(--pc-ink3)',
    color: on ? '#fff' : 'var(--pc-text2)',
    border: `1px solid ${on ? 'var(--pc-bone)' : 'var(--pc-line)'}`,
    boxShadow: on ? 'inset 0 -2px 0 #5a35cc' : '0 2px 0 var(--pc-ink)',
  };
}

const themeRowStyle: CSSProperties = {
  display: 'flex',
  gap: 6,
  alignItems: 'stretch',
};

const themeInputStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  minHeight: 44,
  borderRadius: 4,
  background: 'var(--pc-ink)',
  border: '2px solid var(--pc-line2)',
  color: 'var(--pc-bone)',
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 14,
  padding: '0 12px',
  outline: 'none',
};

const themeAddBtnStyle: CSSProperties = {
  flex: 'none',
  padding: '0 16px',
  minHeight: 44,
  borderRadius: 4,
  background: 'var(--pc-ink3)',
  color: 'var(--pc-bone)',
  border: '1px solid var(--pc-line)',
  boxShadow: '0 2px 0 var(--pc-ink)',
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 12.5,
  fontWeight: 700,
  cursor: 'pointer',
};

const themeChipStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 6px 6px 10px',
  borderRadius: 3,
  background: 'rgba(124,77,255,0.14)',
  border: '1px solid rgba(124,77,255,0.42)',
  color: 'var(--pc-bone)',
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 12,
  fontWeight: 600,
};

const themeChipXStyle: CSSProperties = {
  display: 'grid',
  placeItems: 'center',
  width: 18,
  height: 18,
  borderRadius: 2,
  border: 'none',
  background: 'rgba(0,0,0,0.25)',
  color: 'var(--pc-bone)',
  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
  fontSize: 14,
  lineHeight: 1,
  cursor: 'pointer',
};

const soonBadgeStyle: CSSProperties = {
  position: 'absolute',
  top: 3,
  right: 4,
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 7.5,
  fontWeight: 800,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--pc-text3)',
};
```

Mevcut `<style>{` bloğuna (responsive chip wrap — tırnaklı değer YOK, sadece class) ekle:

```css
        .cr-chips { display: flex; flex-wrap: wrap; gap: 6px; }
```

- [ ] **Step 7: Typecheck + i18n parity**

Run: `npm run typecheck && npm run i18n:check`
Expected: ikisi de temiz.

- [ ] **Step 8: Görsel doğrulama (Playwright — mobil + masaüstü)**

Dev server çalışırken (`npm run dev`), Playwright MCP ile:
1. `/create-room` aç.
2. "Sen seç" butonuna tıkla → havuz editörü açılmalı (hazır chip grid + tema input).
3. Birkaç kategori chip'ine tıkla → accent dolgu (aria-pressed=true).
4. Input'a "uzayda kediler" yaz, "Ekle" → silinebilir chip listede görünür.
5. 8 tema sınırını ve 2 char altını dene → eklenmez.
6. "Oyuncu oyu" pasif + "Yakında" rozeti, tıklanamaz.
7. Viewport'u 390px (mobil) ve 1280px (masaüstü) yap → chip'ler taşmadan sarılıyor, dokunma hedefleri ≥44px, hizalama bozulmuyor.
8. Konsolda hydration uyarısı olmamalı (`browser_console_messages`).

Expected: hepsi geçer; ekran görüntüleriyle (mobil + masaüstü) doğrula.

- [ ] **Step 9: Uçtan uca — havuz POST'a gidiyor mu**

"Sen seç" + birkaç kategori + 1 custom tema seçili haldeyken "ODAYI OLUŞTUR". Ağ sekmesinde / server logunda `categoryPool` + `customThemes` POST body'sinde olmalı; oda oluşmalı ve control sayfasına yönlenmeli. (DEMO_MODE=1 ile quota yakmadan da test edilebilir.)

Expected: 200, yönlendirme başarılı.

- [ ] **Step 10: Commit**

```bash
git add app/create-room/page.tsx app/create-room/CreateRoomFormClient.tsx i18n/dict.ts
git commit -m "feat(create-room): host theme pool editor (built-in chips + custom themes), disable player-vote (soon)"
```

---

## Self-Review notları

- **Spec kapsamı:** Havuz editörü UI (Task 6) ✓; karışık tek havuz (chip + custom input) ✓; custom sadece metin ✓; boş havuz → rastgele + uyarı (Task 6 hint + Task 2 fallback) ✓; lockedCategory önceliği (Task 5) ✓; state+Mongo+zod taşıma (Task 3,4) ✓; motor bağlama duel+tournament (Task 5) ✓; yeni hazır kategoriler dahil backrooms (Task 1) ✓; Oyuncu oyu kapsam dışı/pasif (Task 6) ✓; responsive + tema/font/maskot tutarlılığı (Global Constraints + Task 6 Step 8) ✓.
- **Badge sınırı (bilinçli MVP kararı):** custom tur rozeti sabit "ÖZEL" gösterir; spesifik tema metnini rozette göstermek `roundCategoryLabel` alanı ripple'ı gerektirir → ertelendi. Tema metni zaten tur sonunda prompt ifşasında görünür.
- **Type tutarlılığı:** `categoryPool`/`customThemes` her katmanda `string[]`; `pickRound` custom için `category:'custom'` döner, `categoryLabel('custom')='ÖZEL'`, `roundArgsForRoom` tutarlı.
