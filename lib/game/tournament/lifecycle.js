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
const { uploadBuffer } = require('../../storage.js');
const { translateToEnglish } = require('../../gemini/prompt.js');
const { buildGuardedPrompt } = require('../promptGuard.js');
const { withTimeout, timeoutMs } = require('../../async.js');
const { nextTopic } = require('./topic.js');
const { partitionGroups, topKForGroup, wildcardCount } = require('./groups.js');

const log = (roomId, m) => console.log(`[tournament:${shortRoomId(roomId)}] ${m}`);

// Map duel slot back to the finalist entrantId stashed at handoff.
function onFinalDuelResult(roomId, winnerSlot) {
  const room = getRoom(roomId);
  if (!room || !room.tournament) return;
  const t = room.tournament;
  const championId = winnerSlot === 'B' ? t.finalIds?.[1] : t.finalIds?.[0];
  t.champion = championId || null;
  // The losing finalist (runner-up) is out too — mark eliminated so the champion
  // is the only non-eliminated entrant once the tournament completes (otherwise a
  // "who's still in" view would render the runner-up as still active).
  for (const id of t.finalIds || []) {
    if (id && id !== t.champion && t.entrants[id]) t.entrants[id].eliminated = true;
  }
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

  if (t.mode === 'B' && t.activeIds.length > 2) {
    await _runGroupPhase(roomId, epoch);
    if (!isCurrentEpoch(roomId, epoch)) return;
  }

  t.schedule = buildSchedule(t.activeIds.length);
  log(roomId, `start: mode ${t.mode}, ${t.activeIds.length} active, schedule ${JSON.stringify(t.schedule)}`);

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
  t.topic = await nextTopic(room);
  if (!isCurrentEpoch(roomId, epoch)) return;
  room.targetPrompt = t.topic.prompt;
  room.targetPromptTr = t.topic.promptTr;
  room.roundCategory = t.topic.category;
  room.roundDifficulty = t.topic.difficulty;
  const promptMs = (room.promptDurationSec || 30) * 1000;
  setPhase(roomId, PHASES.PROMPTING, promptMs);
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

// Returns the entrants for the given id set, or falls back to activeEntrants when
// ids is undefined (preserving byte-identical Mode A behaviour).
function _entrantsFor(room, ids) {
  if (!ids) return activeEntrants(room);
  return ids.map((id) => room.tournament.entrants[id]).filter(Boolean);
}

function _awaitPrompts(roomId, epoch, ids) {
  const room = getRoom(roomId);
  const t = room.tournament;
  const ms = (room.promptDurationSec || 30) * 1000;
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      t._promptResolve = null;
      resolve();
    };
    // Early-resolve hook: the `tournament_prompt` socket handler calls this after
    // each submit; we finish once every active entrant has a non-empty prompt.
    t._promptResolve = () => {
      if (!isCurrentEpoch(roomId, epoch)) return finish();
      const active = _entrantsFor(getRoom(roomId), ids);
      if (active.every((e) => (e.lastPrompt || '').trim().length > 0)) finish();
    };
    const timer = setTimeout(finish, ms);
  });
}

async function _waveGenerate(roomId, epoch, ids) {
  const room = getRoom(roomId);
  const ents = _entrantsFor(room, ids);
  const round = room.tournament?.roundIndex ?? 0;
  const limit = timeoutMs('TOURNAMENT_GEN', 20000);
  for (const e of ents) {
    if (!isCurrentEpoch(roomId, epoch)) return;
    if (process.env.DEMO_MODE === '1') {
      e.lastImageUrl = `demo://${e.entrantId}`;
      continue;
    }
    try {
      // 1v1 ile aynı desen: EN'e çevir (fallback orijinal) → guard → üret → upload.
      let promptText = e.lastPrompt || '';
      try {
        promptText = await translateToEnglish(promptText);
      } catch (err) {
        log(roomId, `translate fail ${e.entrantId}, using original: ${err.message}`);
      }
      if (!isCurrentEpoch(roomId, epoch)) return;
      const prompt = buildGuardedPrompt(promptText);
      const { buffer, mimeType } = await withTimeout(generateImage(prompt), limit, 'tgen');
      if (!isCurrentEpoch(roomId, epoch)) return;
      const ext = mimeType.includes('jpeg') ? 'jpg' : 'png';
      const objPath = `tournament/${roomId}/r${round}_${e.entrantId}.${ext}`;
      const url = await uploadBuffer(objPath, buffer, mimeType);
      if (!isCurrentEpoch(roomId, epoch)) return;
      e.lastImageUrl = url;
    } catch (err) {
      e.lastImageUrl = null;
      log(roomId, `gen fail ${e.entrantId}: ${err.message}`);
    }
  }
}

// Scoped mini-round for a single group. Returns { survivors: id[], eliminatedScored: [{entrantId, score}] }.
async function _runGroup(roomId, epoch, groupIds, topK) {
  const room = getRoom(roomId);
  const t = room.tournament;

  // Track current group index.
  const gi = t.groups.indexOf(groupIds);
  t.currentGroupIndex = gi >= 0 ? gi : t.currentGroupIndex;
  for (const id of groupIds) {
    if (t.entrants[id]) t.entrants[id].groupIndex = t.currentGroupIndex;
  }

  // 1) Topic + prompting (scoped to the group).
  t.phase = TOURNAMENT_PHASES.ROUND_PROMPTING;
  t.topic = await nextTopic(room);
  if (!isCurrentEpoch(roomId, epoch)) return { survivors: [], eliminatedScored: [] };
  room.targetPrompt = t.topic.prompt;
  room.targetPromptTr = t.topic.promptTr;
  room.roundCategory = t.topic.category;
  room.roundDifficulty = t.topic.difficulty;
  const promptMs = (room.promptDurationSec || 30) * 1000;
  setPhase(roomId, PHASES.PROMPTING, promptMs);
  broadcastState(roomId);
  await _awaitPrompts(roomId, epoch, groupIds);
  if (!isCurrentEpoch(roomId, epoch)) return { survivors: [], eliminatedScored: [] };

  // 2) Generate (scoped).
  t.phase = TOURNAMENT_PHASES.ROUND_GENERATING;
  setPhase(roomId, PHASES.GENERATING);
  broadcastState(roomId);
  await _waveGenerate(roomId, epoch, groupIds);
  if (!isCurrentEpoch(roomId, epoch)) return { survivors: [], eliminatedScored: [] };

  // 3) Score (scoped).
  t.phase = TOURNAMENT_PHASES.ROUND_SCORING;
  setPhase(roomId, PHASES.SCORING);
  broadcastState(roomId);
  const ranked = await scoreRoster(roomId, room.referenceImageUrl, _entrantsFor(room, groupIds));
  if (!isCurrentEpoch(roomId, epoch)) return { survivors: [], eliminatedScored: [] };
  for (const { entrantId, score } of ranked) t.entrants[entrantId].lastScore = score;

  // 4) Cut: top-K survive; rest eliminated (returned for wildcard rescue pool).
  t.phase = TOURNAMENT_PHASES.ROUND_CUT;
  const survivors = ranked.slice(0, topK).map((r) => r.entrantId);
  const survivorSet = new Set(survivors);
  const eliminatedScored = ranked.filter((r) => !survivorSet.has(r.entrantId));
  for (const { entrantId } of eliminatedScored) t.entrants[entrantId].eliminated = true;
  broadcastState(roomId);
  log(roomId, `group ${t.currentGroupIndex}: ${survivors.length}/${groupIds.length} advance`);
  return { survivors, eliminatedScored };
}

// Runs the full group phase for Mode B: partitions activeIds into groups,
// runs each sequentially, collects survivors + wildcard rescues, sets activeIds.
async function _runGroupPhase(roomId, epoch) {
  const room = getRoom(roomId);
  const t = room.tournament;

  t.groups = partitionGroups(t.activeIds);
  const survivors = [];
  const eliminatedPool = [];

  for (let gi = 0; gi < t.groups.length; gi++) {
    if (!isCurrentEpoch(roomId, epoch)) return;
    const groupIds = t.groups[gi];
    const r = await _runGroup(roomId, epoch, groupIds, topKForGroup(groupIds.length));
    if (!isCurrentEpoch(roomId, epoch)) return;
    survivors.push(...r.survivors);
    eliminatedPool.push(...r.eliminatedScored);
  }

  // Wildcard: highest-scoring eliminated across all groups get rescued.
  const wc = wildcardCount(t.groups.length);
  eliminatedPool.sort((a, b) => b.score - a.score);
  for (const { entrantId } of eliminatedPool.slice(0, wc)) {
    t.entrants[entrantId].eliminated = false;
    survivors.push(entrantId);
  }

  t.activeIds = survivors;
  t.currentGroupIndex = -1;
  broadcastState(roomId);
  log(
    roomId,
    `group phase done: ${survivors.length} advance (incl. ${Math.min(wc, eliminatedPool.length)} wildcard)`
  );
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
  // Populate duel slots from finalists; carry live socketIds so finalists can
  // type/submit prompts via the normal duel handlers (Fix A step 3).
  const entA = t.entrants[idA], entB = t.entrants[idB];
  room.players = {
    A: makePlayer({ socketId: entA.socketId || null, deviceId: entA.deviceId, nickname: entA.nickname }),
    B: makePlayer({ socketId: entB.socketId || null, deviceId: entB.deviceId, nickname: entB.nickname })
  };
  // Push joined_as so each finalist's client learns its duel slot and switches
  // from TournamentMobileShell to the normal PromptingView / duel UI.
  const { emitToSocket } = require('../../socket/broadcasts.js');
  if (entA.socketId) emitToSocket(entA.socketId, 'joined_as', { slot: 'A' });
  if (entB.socketId) emitToSocket(entB.socketId, 'joined_as', { slot: 'B' });
  log(roomId, `final duel: ${entA.nickname} vs ${entB.nickname}`);
  // LAZY require — hoisting creates a CJS require cycle (matchLifecycle →
  // tournament/lifecycle in finalizeMatch's hook).
  const { startMatch } = require('../matchLifecycle.js');
  await startMatch(roomId); // existing flow → finalizeMatch → onFinalDuelResult
}

module.exports = { startTournament, submitEntrantPrompt, onFinalDuelResult };
