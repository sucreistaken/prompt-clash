// scripts/tournamentSmoke.js
// DEMO_MODE end-to-end: N simulated entrants → champion. No real images/AI.
// Drives the room registry directly (no sockets, no dev server) — backbone gate.
'use strict';
const assert = require('assert');
const { buildSchedule } = require('../lib/game/tournament/schedule.js');

// Unit-level invariants (pure, no server needed):
assert.deepStrictEqual(buildSchedule(100), [25, 6, 2], 'schedule 100');
assert.deepStrictEqual(buildSchedule(8), [2], 'schedule 8');
assert.deepStrictEqual(buildSchedule(2), [], 'schedule 2');

// Engine-level invariant via direct registry drive (no sockets — backbone):
process.env.DEMO_MODE = '1';
const reg = require('../lib/game/roomRegistry.js');
const { createTournamentState, addEntrant } = require('../lib/game/tournament/state.js');
const { startTournament } = require('../lib/game/tournament/lifecycle.js');

(async () => {
  const { roomId } = reg.createRoom({ hostId: 'h', settings: { roomMode: 'TOURNAMENT' } });
  const room = reg.getRoom(roomId);
  room.roomMode = 'TOURNAMENT';
  room.tournament = createTournamentState({});
  // The final duel reuses the real duel engine, whose finalists (socketId:null)
  // never submit prompts — so it advances on phase timers. Shorten them so the
  // smoke doesn't sit through the default 60s PROMPTING window.
  room.vsIntroDurationSec = 0;
  room.promptDurationSec = 1;
  room.resultDurationSec = 1;
  for (let i = 0; i < 16; i++) addEntrant(room, { deviceId: 'd' + i, nickname: 'p' + i });
  await startTournament(roomId);
  // startTournament runs the elimination rounds synchronously (DEMO), then kicks
  // off the final duel which completes ASYNCHRONOUSLY via timers + DEMO scoring.
  // Poll for the champion rather than asserting immediately.
  const deadline = Date.now() + 30000;
  while (!reg.getRoom(roomId).tournament.champion && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200));
  }
  const t = reg.getRoom(roomId).tournament;
  assert.ok(t.champion, 'a champion was crowned within 30s');
  assert.strictEqual(t.phase, 'COMPLETE', 'tournament complete');
  console.log('tournamentSmoke OK — champion:', t.champion);
  process.exit(0);
})().catch((e) => { console.error('tournamentSmoke FAIL:', e); process.exit(1); });
