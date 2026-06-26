// Tournament sub-state: roster factory + mutators.
// Task 3: per-room tournament state, loaded lazily when roomMode === 'TOURNAMENT'.
// CommonJS (.js) — require()-loaded, no transpile step.
'use strict';

const TOURNAMENT_PHASES = Object.freeze({
  LOBBY: 'LOBBY',
  ROUND_PROMPTING: 'ROUND_PROMPTING',
  ROUND_GENERATING: 'ROUND_GENERATING',
  ROUND_SCORING: 'ROUND_SCORING',
  ROUND_CUT: 'ROUND_CUT',
  FINAL_DUEL: 'FINAL_DUEL',
  COMPLETE: 'COMPLETE'
});

function createTournamentState({ entrants = [], mode = 'A' } = {}) {
  const map = {};
  for (const e of entrants) map[e.entrantId] = e;
  return {
    phase: TOURNAMENT_PHASES.LOBBY,
    roundIndex: 0,
    schedule: [],
    activeIds: entrants.map((e) => e.entrantId),
    entrants: map,
    topic: null,
    champion: null,
    mode: mode === 'B' ? 'B' : 'A'
  };
}

let _seq = 0;
function _newEntrantId(deviceId) {
  _seq += 1;
  return `e_${(deviceId || 'anon').slice(0, 6)}_${_seq.toString(36)}`;
}

/**
 * addEntrant(room, { deviceId, nickname }) -> entrantId
 * Idempotent on deviceId: if the device already has an entrant, updates
 * nickname and returns the existing id (reattach semantics).
 */
function addEntrant(room, { deviceId, nickname }) {
  const t = room.tournament;
  // Idempotent reattach by deviceId.
  for (const id of Object.keys(t.entrants)) {
    if (deviceId && t.entrants[id].deviceId === deviceId) {
      t.entrants[id].nickname = nickname || t.entrants[id].nickname;
      return id;
    }
  }
  const entrantId = _newEntrantId(deviceId);
  t.entrants[entrantId] = {
    entrantId,
    deviceId: deviceId || null,
    nickname: nickname || 'oyuncu',
    eliminated: false,
    lastScore: null,
    lastImageUrl: null,
    lastPrompt: ''
  };
  if (t.phase === TOURNAMENT_PHASES.LOBBY) t.activeIds.push(entrantId);
  return entrantId;
}

/**
 * activeEntrants(room) -> Entrant[]
 * Returns the entrant objects for all currently active (non-eliminated) ids.
 */
function activeEntrants(room) {
  const t = room.tournament;
  return t.activeIds.map((id) => t.entrants[id]).filter(Boolean);
}

module.exports = {
  TOURNAMENT_PHASES,
  createTournamentState,
  addEntrant,
  activeEntrants
};
