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
