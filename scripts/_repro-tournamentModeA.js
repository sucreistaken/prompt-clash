// scripts/_repro-tournamentModeA.js  (investigation + fix-verification — safe to delete)
// Verifies the Mode A fix WITHOUT any network/quota, in REAL mode (DEMO unset):
//   Part 1 — a per-round reference target image IS generated before scoring.
//   Part 2 — scoreRoster soft-fails (no throw) when the reference is missing.
// Provider calls are stubbed; scoreRoster is stubbed (BEFORE lifecycle loads, so
// its destructured binding picks up the stub) to capture state and halt before
// the network-bound final duel.
'use strict';
const assert = require('assert');

// --- Stub providers BEFORE requiring lifecycle (it destructures at load) ---
require('../lib/game/targetPrompt.js').generateTargetPrompt = async () => ({
  promptEn: 'a red bicycle', promptTr: 'kırmızı bisiklet', category: 'object', difficulty: 'easy'
});
require('../lib/gemini/prompt.js').translateToEnglish = async (s) => s || 'x';
const image = require('../lib/image.js');
let refGenPrompt = null;
let genCalls = 0;
image.generateImage = async (prompt) => {
  genCalls++;
  if (refGenPrompt === null) refGenPrompt = prompt; // first call = the reference gen
  // Fail the FIRST attempt to exercise the retry path (D2): the shared retry()
  // must recover so the reference is still set and no whole-round forfeit happens.
  if (genCalls === 1) throw new Error('simulated transient 402');
  return { buffer: Buffer.from('fake'), mimeType: 'image/png' };
};
require('../lib/storage.js').uploadBuffer = async (p) => `https://example.invalid/${p}`;

const reg = require('../lib/game/roomRegistry.js');

// Stub scoreRoster BEFORE lifecycle requires it (capture the real one for Part 2).
const scoreRosterMod = require('../lib/game/tournament/scoreRoster.js');
const realScoreRoster = scoreRosterMod.scoreRoster;
let capturedRef = 'NOT_SET';
scoreRosterMod.scoreRoster = async (roomId) => {
  // Runs right after _generateReferenceImage + _waveGenerate in the round.
  capturedRef = reg.getRoom(roomId).referenceImageUrl;
  throw new Error('STOP_AFTER_REF_CHECK'); // halt before the network-bound final duel
};

const { createTournamentState, addEntrant } = require('../lib/game/tournament/state.js');
const { startTournament, submitEntrantPrompt } = require('../lib/game/tournament/lifecycle.js');

(async () => {
  console.log('DEMO_MODE =', process.env.DEMO_MODE || '(unset → REAL path)');

  // ---- Part 1: reference image is generated before scoring ----
  const { roomId } = reg.createRoom({ hostId: 'h', settings: { roomMode: 'TOURNAMENT' } });
  const room = reg.getRoom(roomId);
  room.roomMode = 'TOURNAMENT';
  room.tournament = createTournamentState({});
  room.promptDurationSec = 1;
  for (let i = 0; i < 8; i++) {
    const id = addEntrant(room, { deviceId: 'd' + i, nickname: 'p' + i });
    submitEntrantPrompt(roomId, id, 'kırmızı bisiklet ' + i);
  }

  let part1Err = null;
  try { await startTournament(roomId); } catch (e) { part1Err = e; }

  console.log('reference generated (round) =', JSON.stringify(capturedRef));
  console.log('reference-gen prompt        =', JSON.stringify(refGenPrompt));
  console.log('generateImage calls         =', genCalls, '(1st failed → retry recovered)');
  assert.ok(part1Err && /STOP_AFTER_REF_CHECK/.test(part1Err.message), 'reached scoring (round ran)');
  assert.ok(genCalls >= 2, 'retry recovered from the simulated transient failure (D2 retry path)');
  assert.ok(typeof capturedRef === 'string' && capturedRef.startsWith('https://example.invalid/tournament/'),
    'reference image WAS generated before scoring despite a transient failure (Finding 1 + D2)');
  assert.ok(refGenPrompt && refGenPrompt.startsWith('a red bicycle'),
    'reference uses the topic prompt + SAFETY_SUFFIX (trusted system prompt, not guarded player text)');

  // ---- Part 2: scoreRoster soft-fails when reference is missing ----
  const ents = [{ entrantId: 'x1', lastImageUrl: 'https://example.invalid/a.png' }];
  let part2Err = null, scores = null;
  try { scores = await realScoreRoster(roomId, null /* no reference */, ents); }
  catch (e) { part2Err = e; }

  console.log('soft-fail scores (null ref) =', JSON.stringify(scores));
  assert.ok(!part2Err, `scoreRoster must NOT throw on missing reference (got: ${part2Err && part2Err.message})`);
  assert.strictEqual(scores[0].score, 0, 'missing reference → forfeit to 0 (Finding 2 fixed)');

  // ---- Part 3: PRESENT-but-unfetchable reference also soft-fails (review P1) ----
  // example.invalid does not resolve → fetchAsInline throws; must NOT wedge.
  let part3Err = null, scores3 = null;
  try { scores3 = await realScoreRoster(roomId, 'https://example.invalid/ref.png', ents); }
  catch (e) { part3Err = e; }
  console.log('soft-fail scores (bad ref)  =', JSON.stringify(scores3));
  assert.ok(!part3Err, `scoreRoster must NOT throw on unfetchable reference (got: ${part3Err && part3Err.message})`);
  assert.strictEqual(scores3[0].score, 0, 'unfetchable reference → forfeit to 0 (review P1 fixed)');

  console.log('\nFIX VERIFIED: reference generated per round + scoreRoster soft-fails on missing AND unfetchable reference.');
  process.exit(0);
})().catch((e) => { console.error('repro harness error:', e); process.exit(1); });
