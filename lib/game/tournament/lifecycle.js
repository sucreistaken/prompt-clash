// lib/game/tournament/lifecycle.js
// Task 5: Mode A tournament round engine + final-duel handoff.
// Drives a TOURNAMENT room from a locked roster through elimination rounds
// (topic → prompt → wave generate → score → cut) until 2 remain, then hands
// the finalists to the EXISTING 1v1 duel engine unchanged and captures the
// winner as champion. CommonJS (.js) — require()-loaded, no transpile step.
'use strict';

const {
  getRoom,
  PHASES,
  setPhase,
  getOperationEpoch,
  isCurrentEpoch,
  makePlayer
} = require('../state.js');
const { broadcastState } = require('../../socket/broadcasts.js');
const { shortRoomId } = require('../roomRegistry.js');
const { TOURNAMENT_PHASES, activeEntrants } = require('./state.js');
const { buildSchedule } = require('./schedule.js');
const { scoreRoster } = require('./scoreRoster.js');
const { generateImage } = require('../../image.js'); // image.js exports { generateImage, provider }
const { withTimeout, timeoutMs } = require('../../async.js');

const log = (roomId, m) => console.log(`[tournament:${shortRoomId(roomId)}] ${m}`);

// Map duel slot back to the finalist entrantId stashed at handoff.
function onFinalDuelResult(roomId, winnerSlot) {
  const room = getRoom(roomId);
  if (!room || !room.tournament) return;
  const t = room.tournament;
  const championId = winnerSlot === 'B' ? t.finalIds?.[1] : t.finalIds?.[0];
  t.champion = championId || null;
  t.phase = TOURNAMENT_PHASES.COMPLETE;
  setPhase(roomId, PHASES.RESULT);
  broadcastState(roomId);
  log(roomId, `champion = ${t.champion}`);
}

async function startTournament(roomId) {
  const room = getRoom(roomId);
  if (!room || room.roomMode !== 'TOURNAMENT' || !room.tournament) return;
  const epoch = getOperationEpoch(roomId);
  const t = room.tournament;
  t.schedule = buildSchedule(t.activeIds.length);
  log(roomId, `start: ${t.activeIds.length} entrants, schedule ${JSON.stringify(t.schedule)}`);

  for (let i = 0; i < t.schedule.length; i++) {
    if (!isCurrentEpoch(roomId, epoch)) return;
    const targetSize = t.schedule[i];
    t.roundIndex = i;
    await _runRound(roomId, epoch, targetSize);
    if (!isCurrentEpoch(roomId, epoch)) return;
  }
  await _startFinalDuel(roomId, epoch);
}

async function _runRound(roomId, epoch, targetSize) {
  const room = getRoom(roomId);
  const t = room.tournament;

  // 1) Topic + prompting window. (Topic source: reuse the duel target engine in
  //    a later task; for the backbone the smoke injects prompts directly.)
  t.phase = TOURNAMENT_PHASES.ROUND_PROMPTING;
  t.topic = t.topic || { prompt: 'dancing toaster', promptTr: 'dans eden tost makinesi' };
  setPhase(roomId, PHASES.PROMPTING);
  broadcastState(roomId);
  await _awaitPrompts(roomId, epoch);
  if (!isCurrentEpoch(roomId, epoch)) return;

  // 2) Wave generation — one image per active entrant, throttled (NO bursts).
  t.phase = TOURNAMENT_PHASES.ROUND_GENERATING;
  setPhase(roomId, PHASES.GENERATING);
  broadcastState(roomId);
  await _waveGenerate(roomId, epoch);
  if (!isCurrentEpoch(roomId, epoch)) return;

  // 3) Score all active entrants in one ranked list.
  t.phase = TOURNAMENT_PHASES.ROUND_SCORING;
  setPhase(roomId, PHASES.SCORING);
  broadcastState(roomId);
  const ranked = await scoreRoster(roomId, room.referenceImageUrl, activeEntrants(room));
  if (!isCurrentEpoch(roomId, epoch)) return;
  for (const { entrantId, score } of ranked) t.entrants[entrantId].lastScore = score;

  // 4) Cut to targetSize.
  t.phase = TOURNAMENT_PHASES.ROUND_CUT;
  const survivors = ranked.slice(0, targetSize).map((r) => r.entrantId);
  const survivorSet = new Set(survivors);
  for (const id of t.activeIds) if (!survivorSet.has(id)) t.entrants[id].eliminated = true;
  t.activeIds = survivors;
  t.topic = null; // fresh topic next round
  broadcastState(roomId);
  log(roomId, `round ${t.roundIndex}: cut to ${survivors.length}`);
}

// Backbone: resolve immediately (smoke pre-fills prompts). A later task replaces
// this with a real timed PROMPTING window driven by submitEntrantPrompt.
function _awaitPrompts(roomId) {
  return Promise.resolve();
}

async function _waveGenerate(roomId, epoch) {
  const room = getRoom(roomId);
  const ents = activeEntrants(room);
  const limit = timeoutMs('TOURNAMENT_GEN', 20000);
  for (const e of ents) {
    if (!isCurrentEpoch(roomId, epoch)) return;
    if (process.env.DEMO_MODE === '1') {
      e.lastImageUrl = `demo://${e.entrantId}`;
      continue;
    }
    try {
      const url = await withTimeout(generateImage(e.lastPrompt || ''), limit, 'tgen');
      if (!isCurrentEpoch(roomId, epoch)) return;
      e.lastImageUrl = url;
    } catch (err) {
      e.lastImageUrl = null;
      log(roomId, `gen fail ${e.entrantId}: ${err.message}`);
    }
  }
}

function submitEntrantPrompt(roomId, entrantId, text) {
  const room = getRoom(roomId);
  if (!room || !room.tournament) return;
  const e = room.tournament.entrants[entrantId];
  if (e) e.lastPrompt = String(text || '').slice(0, 500);
}

// Hand the final 2 to the EXISTING duel engine, untouched.
async function _startFinalDuel(roomId, epoch) {
  const room = getRoom(roomId);
  if (!room || !isCurrentEpoch(roomId, epoch)) return;
  const t = room.tournament;

  if (t.activeIds.length < 2) {
    t.champion = t.activeIds[0] || null; // 1 entrant → sole survivor; 0 → none
    t.phase = TOURNAMENT_PHASES.COMPLETE;
    setPhase(roomId, PHASES.RESULT);
    broadcastState(roomId);
    log(roomId, `final skipped: ${t.activeIds.length} entrant(s), champion=${t.champion}`);
    return;
  }

  const [idA, idB] = t.activeIds;
  t.finalIds = [idA, idB];
  t.phase = TOURNAMENT_PHASES.FINAL_DUEL;
  // Populate duel slots from finalists, then invoke the standard duel start.
  room.players = {
    A: makePlayer({ socketId: null, deviceId: t.entrants[idA].deviceId, nickname: t.entrants[idA].nickname }),
    B: makePlayer({ socketId: null, deviceId: t.entrants[idB].deviceId, nickname: t.entrants[idB].nickname })
  };
  log(roomId, `final duel: ${t.entrants[idA].nickname} vs ${t.entrants[idB].nickname}`);
  // LAZY require — hoisting creates a CJS require cycle (matchLifecycle →
  // tournament/lifecycle in finalizeMatch's hook).
  const { startMatch } = require('../matchLifecycle.js');
  await startMatch(roomId); // existing flow → finalizeMatch → onFinalDuelResult
}

module.exports = { startTournament, submitEntrantPrompt, onFinalDuelResult };
