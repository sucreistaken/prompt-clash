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
