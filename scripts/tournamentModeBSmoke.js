// scripts/tournamentModeBSmoke.js
// DEMO_MODE end-to-end: 100 simulated entrants Mode B → champion via group phase.
// Drives the room registry directly (no sockets, no dev server) — backbone gate.
'use strict';
const assert = require('assert');
const { partitionGroups, topKForGroup, wildcardCount } = require('../lib/game/tournament/groups.js');

// Unit-level invariants for Mode B helpers (pure, no server needed):
{
  const g = partitionGroups(Array.from({ length: 100 }, (_, i) => 'e' + i));
  assert.strictEqual(g.length, 5, 'partitionGroups(100) => 5 groups');
  assert.ok(g.every((x) => x.length === 20), 'all groups have 20 members');
  assert.strictEqual(topKForGroup(20), 5, 'topKForGroup(20) === 5');
  assert.strictEqual(wildcardCount(5), 3, 'wildcardCount(5) === 3');
}

// Engine-level invariant via direct registry drive (no sockets — backbone):
process.env.DEMO_MODE = '1';
const reg = require('../lib/game/roomRegistry.js');
const { createTournamentState, addEntrant } = require('../lib/game/tournament/state.js');
const { startTournament } = require('../lib/game/tournament/lifecycle.js');

(async () => {
  const { roomId } = reg.createRoom({
    hostId: 'h',
    settings: { roomMode: 'TOURNAMENT', tournamentMode: 'B' },
  });
  const room = reg.getRoom(roomId);
  room.roomMode = 'TOURNAMENT';
  room.tournament = createTournamentState({ mode: 'B' });
  // Shorten timers so the smoke completes quickly
  room.vsIntroDurationSec = 0;
  room.promptDurationSec = 1;
  room.resultDurationSec = 1;

  for (let i = 0; i < 100; i++) {
    addEntrant(room, { deviceId: 'd' + i, nickname: 'p' + i });
  }

  await startTournament(roomId);

  // startTournament runs group phase + reduction rounds, then the final duel
  // completes ASYNCHRONOUSLY via timers + DEMO scoring. Poll for champion.
  const deadline = Date.now() + 40000;
  while (!reg.getRoom(roomId).tournament.champion && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200));
  }

  const t = reg.getRoom(roomId).tournament;

  assert.ok(t.champion, 'a champion was crowned within 40s');
  assert.strictEqual(t.phase, 'COMPLETE', 'tournament phase is COMPLETE');
  assert.strictEqual(t.groups.length, 5, 'exactly 5 groups were formed');

  const nonEliminated = Object.values(t.entrants).filter((e) => !e.eliminated);
  assert.strictEqual(nonEliminated.length, 1, 'exactly one non-eliminated entrant (the champion)');

  const eliminatedCount = Object.values(t.entrants).filter((e) => e.eliminated).length;
  console.log(
    `tournamentModeBSmoke OK — champion: ${t.champion} (5 groups, ${eliminatedCount} eliminated)`
  );
  process.exit(0);
})().catch((e) => {
  console.error('tournamentModeBSmoke FAIL:', e);
  process.exit(1);
});
