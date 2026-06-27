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
