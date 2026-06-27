'use strict';
const assert = require('assert');
const { createRoom } = require('../../lib/game/roomRegistry.js');

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
