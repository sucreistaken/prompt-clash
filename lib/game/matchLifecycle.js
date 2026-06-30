// Room-scoped match lifecycle orchestrator.
// Story 1.1: every public function takes roomId as its first argument
// (MUST rule #2). Every state mutation is followed by broadcastState(roomId)
// (MUST rule #1). Logs carry [scope:roomId-short] prefix (MUST rule #5).
//
// Pause + in-flight generation (G-9 / FR-15.7):
//   - In-flight generationQueue job: COMPLETES (do not abort, do not bump epoch).
//   - Next queued job: BLOCKED while room.state === 'ROOM_PAUSED' (queue checks
//     before pulling next).
//   - operationEpoch: PRESERVED (no bump on pause/resume). Resume continues
//     with the same epoch.
// Rationale: aborting an in-flight HTTP image-gen call wastes the quota we
// already paid for; blocking the next pull keeps the lifecycle frozen cleanly.

const {
  getRoom,
  PHASES,
  setPhase,
  resetMatch,
  softResetForRematch,
  makePlayer,
  newMatchId,
  bumpOperationEpoch,
  getOperationEpoch,
  isCurrentEpoch
} = require('./state.js');
const {
  setPhaseTimer,
  clearPhaseTimer,
  setDisconnectTimer,
  clearDisconnectTimer,
  clearAllDisconnectTimers
} = require('./timers.js');
const { broadcastState, broadcastPromptUpdate } = require('../socket/broadcasts.js');
const { shortRoomId } = require('./roomRegistry.js');
const { trackJobStart, trackJobComplete, trackJobFailed } = require('./generationQueue.js');
const { generateImage } = require('../image.js');
const { scoreVsReference } = require('../gemini/score.js');
const { pickRound, generateTargetPrompt, roundArgsForRoom } = require('./targetPrompt.js');
const { translateToEnglish } = require('../gemini/prompt.js');
const { SAFETY_SUFFIX, buildGuardedPrompt } = require('./promptGuard.js');
const { uploadBuffer } = require('../storage.js');
const { saveMatch } = require('../../models/Match.js');
const { recordVote } = require('../../models/Vote.js');
const { validateNickname, mask } = require('../profanity.js');
const { createTournamentState, addEntrant, TOURNAMENT_PHASES } = require('./tournament/state.js');

const DISCONNECT_GRACE_MS = 10_000;
// Sally v3 LOBBY auto-ready: if either player stalls on the "Hazırım" prompt,
// promote the match anyway after this window so host events never deadlock.
const LOBBY_AUTO_READY_MS = 60_000;
// SAFETY_SUFFIX + buildGuardedPrompt artık paylaşılan ./promptGuard.js'ten gelir
// (tournament wave-gen de aynı guard'ı kullanır).

// ---------------------------------------------------------------------------
// Target image (her tur dinamik üretilir; pre-cache + on-demand)
// ---------------------------------------------------------------------------

// Bir sonraki turun hedefini (gerçek prompt + görsel + kategori/zorluk) üretip
// next* alanlarına yazar. startMatch bunu aktif tura promote eder.
async function ensureTargetImage(roomId) {
  const room = getRoom(roomId);
  if (!room) return;
  if (room.referencePending) return;
  if (room.nextReferenceImageUrl && room.nextTargetPrompt) return;
  room.referencePending = true;
  try {
    const round = pickRound(roundArgsForRoom(room));
    const { promptEn, promptTr, category, difficulty } = await generateTargetPrompt(round);

    if (process.env.DEMO_MODE === '1') {
      room.nextReferenceImageUrl =
        'https://picsum.photos/seed/promptclash-ref-' + Date.now() + '/640';
      room.nextTargetPrompt = promptEn;
      room.nextTargetPromptTr = promptTr;
      room.nextRoundCategory = category;
      room.nextRoundDifficulty = difficulty;
      console.log(`[target:${shortRoomId(roomId)}] demo placeholder set:`, category, difficulty);
      return;
    }

    const { buffer, mimeType } = await generateImage(promptEn + SAFETY_SUFFIX);
    const path = `references/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${mimeType.includes('jpeg') ? 'jpg' : 'png'}`;
    const url = await uploadBuffer(path, buffer, mimeType);
    // Re-fetch room — async resolve window may have outlived the room.
    const r = getRoom(roomId);
    if (!r) return;
    r.nextReferenceImageUrl = url;
    r.nextTargetPrompt = promptEn;
    r.nextTargetPromptTr = promptTr;
    r.nextRoundCategory = category;
    r.nextRoundDifficulty = difficulty;
    console.log(`[target:${shortRoomId(roomId)}] pre-cached:`, category, difficulty, url);
  } catch (err) {
    console.warn(`[target:${shortRoomId(roomId)}] generation failed:`, err.message);
    invalidateReferenceCache(roomId);
  } finally {
    const r = getRoom(roomId);
    if (r) r.referencePending = false;
  }
}

function invalidateReferenceCache(roomId) {
  const room = getRoom(roomId);
  if (!room) return;
  room.nextReferenceImageUrl = null;
  room.nextTargetPrompt = null;
  room.nextTargetPromptTr = null;
  room.nextRoundCategory = null;
  room.nextRoundDifficulty = null;
}

// ---------------------------------------------------------------------------
// Join flow
// ---------------------------------------------------------------------------

function tryJoinAsPlayer(roomId, { socketId, deviceId, nickname }) {
  const room = getRoom(roomId);
  if (!room) return { ok: false, reason: 'room_not_found' };

  const v = validateNickname(nickname);
  if (!v.ok) return { ok: false, reason: v.reason };

  if (room.roomMode === 'TOURNAMENT') {
    if (!room.tournament) room.tournament = createTournamentState({ mode: room.settings?.tournamentMode });
    const entrantId = addEntrant(room, { deviceId, nickname: v.value });
    broadcastState(roomId); // MUST #1
    return { ok: true, entrantId };
  }

  if (room.phase === PHASES.IDLE) {
    room.players.A = makePlayer({ socketId, deviceId, nickname: v.value });
    setPhase(roomId, PHASES.PLAYER_1_JOINED);
    broadcastState(roomId);
    return { ok: true, slot: 'A' };
  }
  if (room.phase === PHASES.PLAYER_1_JOINED) {
    if (room.players.A?.deviceId === deviceId) {
      return { ok: false, reason: 'already_player_a' };
    }
    room.players.B = makePlayer({ socketId, deviceId, nickname: v.value });
    enterLobby(roomId);
    return { ok: true, slot: 'B' };
  }
  return { ok: false, reason: 'match_in_progress' };
}

// Sally v3 ready-check: both players are in, but the match does not start
// until both tap "Hazırım" (or LOBBY_AUTO_READY_MS elapses). Resets any prior
// ready state so a re-entry can't carry a stale flag in.
function enterLobby(roomId) {
  const room = getRoom(roomId);
  if (!room) return;
  const epoch = bumpOperationEpoch(roomId);
  if (room.players.A) room.players.A.ready = false;
  if (room.players.B) room.players.B.ready = false;
  setPhase(roomId, PHASES.LOBBY, LOBBY_AUTO_READY_MS);
  broadcastState(roomId);
  console.log(`[lifecycle:${shortRoomId(roomId)}] LOBBY (waiting for ready)`);
  setPhaseTimer(roomId, LOBBY_AUTO_READY_MS, () => {
    if (!isCurrentEpoch(roomId, epoch)) return;
    const r = getRoom(roomId);
    if (!r || r.phase !== PHASES.LOBBY) return;
    console.log(`[lifecycle:${shortRoomId(roomId)}] LOBBY auto-ready timeout, starting`);
    if (r.players.A) r.players.A.ready = true;
    if (r.players.B) r.players.B.ready = true;
    startMatch(roomId);
  });
}

// Rematch entry: aynı odada bir önceki maçtan kalan iki oyuncuyu yeniden
// LOBBY'e sokar. enterLobby ile farkı: oyuncular zaten room.players içinde —
// softResetForRematch per-match alanları temizler ama nickname/deviceId/socketId
// + slot kaydı korunur. operationEpoch softResetForRematch içinde artırılır,
// bu yüzden burada tekrar bumpOperationEpoch çağrılmaz.
function beginRematchLobby(roomId) {
  const room = getRoom(roomId);
  if (!room) return;
  softResetForRematch(roomId);
  const epoch = getOperationEpoch(roomId);
  setPhase(roomId, PHASES.LOBBY, LOBBY_AUTO_READY_MS);
  broadcastState(roomId);
  console.log(`[lifecycle:${shortRoomId(roomId)}] LOBBY (rematch, waiting for ready)`);
  setPhaseTimer(roomId, LOBBY_AUTO_READY_MS, () => {
    if (!isCurrentEpoch(roomId, epoch)) return;
    const r = getRoom(roomId);
    if (!r || r.phase !== PHASES.LOBBY) return;
    console.log(`[lifecycle:${shortRoomId(roomId)}] LOBBY rematch auto-ready timeout, starting`);
    if (r.players.A) r.players.A.ready = true;
    if (r.players.B) r.players.B.ready = true;
    startMatch(roomId);
  });
}

function markPlayerReady(roomId, slot) {
  const room = getRoom(roomId);
  if (!room) return { ok: false, reason: 'room_not_found' };
  if (room.phase !== PHASES.LOBBY) return { ok: false, reason: 'not_in_lobby' };
  const p = room.players[slot];
  if (!p) return { ok: false, reason: 'no_such_player' };
  if (p.ready) return { ok: true, alreadyReady: true };
  p.ready = true;
  broadcastState(roomId);
  if (room.players.A?.ready && room.players.B?.ready) {
    clearPhaseTimer(roomId);
    startMatch(roomId);
  }
  return { ok: true };
}

function startMatch(roomId) {
  const room = getRoom(roomId);
  if (!room) return;
  const epoch = bumpOperationEpoch(roomId);
  room.matchId = newMatchId();
  room.matchStartedAt = new Date();
  // Promote pre-cached next target into current (görsel + gerçek prompt EN/TR + kategori/zorluk).
  if (room.nextReferenceImageUrl && room.nextTargetPrompt) {
    room.referenceImageUrl = room.nextReferenceImageUrl;
    room.targetPrompt = room.nextTargetPrompt;
    room.targetPromptTr = room.nextTargetPromptTr;
    room.roundCategory = room.nextRoundCategory;
    room.roundDifficulty = room.nextRoundDifficulty;
    invalidateReferenceCache(roomId);
  } else {
    room.referenceImageUrl = null;
    room.targetPrompt = null;
    room.targetPromptTr = null;
    room.roundCategory = null;
    room.roundDifficulty = null;
    invalidateReferenceCache(roomId);
  }

  setPhase(roomId, PHASES.VS_INTRO, room.vsIntroDurationSec * 1000);
  broadcastState(roomId);
  setPhaseTimer(roomId, room.vsIntroDurationSec * 1000, () => {
    if (isCurrentEpoch(roomId, epoch)) beginPrompting(roomId, epoch);
  });

  // Pre-cache miss: generate now in background. Players will see a placeholder
  // briefly; usually pre-cache is ready.
  if (!room.referenceImageUrl) {
    room.referencePending = false;
    ensureTargetImage(roomId).then(() => {
      if (!isCurrentEpoch(roomId, epoch)) return;
      const r = getRoom(roomId);
      if (!r) return;
      if (r.nextReferenceImageUrl && !r.referenceImageUrl) {
        r.referenceImageUrl = r.nextReferenceImageUrl;
        r.targetPrompt = r.nextTargetPrompt;
        r.targetPromptTr = r.nextTargetPromptTr;
        r.roundCategory = r.nextRoundCategory;
        r.roundDifficulty = r.nextRoundDifficulty;
        invalidateReferenceCache(roomId);
        broadcastState(roomId);
      }
    });
  }
}

function beginPrompting(roomId, epoch) {
  if (!isCurrentEpoch(roomId, epoch)) return;
  const room = getRoom(roomId);
  if (!room) return;
  setPhase(roomId, PHASES.PROMPTING, room.promptDurationSec * 1000);
  broadcastState(roomId);
  setPhaseTimer(roomId, room.promptDurationSec * 1000, () =>
    beginGenerating(roomId, 'timer', epoch)
  );
}

// ---------------------------------------------------------------------------
// Prompt updates / submission
// ---------------------------------------------------------------------------

function handlePromptTyping(roomId, { slot, text }) {
  const room = getRoom(roomId);
  if (!room || room.phase !== PHASES.PROMPTING) return;
  const p = room.players[slot];
  if (!p || p.submitted) return;
  p.prompt = normalizePrompt(text);
  if (room.showLivePrompts) {
    broadcastPromptUpdate(roomId, slot, mask(p.prompt));
  }
}

function handlePromptSubmit(roomId, { slot, text }) {
  const room = getRoom(roomId);
  if (!room || room.phase !== PHASES.PROMPTING) return;
  const p = room.players[slot];
  if (!p || p.submitted) return;
  p.prompt = normalizePrompt(text);
  p.submitted = true;
  broadcastState(roomId);

  if (room.players.A?.submitted && room.players.B?.submitted) {
    beginGenerating(roomId, 'both_submitted', getOperationEpoch(roomId));
  }
}

function normalizePrompt(text) {
  return String(text || '').trim().slice(0, 500);
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

async function _generateForSlot(roomId, slot, epoch) {
  const room = getRoom(roomId);
  if (!room) return;
  const p = room.players[slot];
  if (!p) return;

  if (process.env.DEMO_MODE === '1') {
    // Stagger so the two "renderings" arrive at slightly different times
    await new Promise((r) => setTimeout(r, 1500 + Math.random() * 2500));
    if (!isCurrentEpoch(roomId, epoch)) return;
    const r = getRoom(roomId);
    if (!r) return;
    const seed = `${r.matchId}-${slot}-${p.prompt.slice(0, 20)}`.replace(/\s+/g, '-');
    r.players[slot].imageUrl = `https://picsum.photos/seed/${encodeURIComponent(seed)}/640`;
    r.genErrors[slot] = false;
    broadcastState(roomId);
    return;
  }

  // Görsel modelleri İngilizce'de çok daha iyi: oyuncu metnini İngilizce'ye çevir.
  // Ekranda gösterilen p.prompt Türkçe kalır; sadece üretime giden metin çevrilir.
  // translateToEnglish YALNIZCA İngilizce-olmayan metni API'ye yollar (İngilizce
  // girdi erken döner). Bu yüzden buradan fırlayan hata = elimizde çevrilmemiş,
  // İngilizce-olmayan metin var demek. Onu İngilizce-eğitimli görsel modeline
  // göndermek alakasız görsel üretir (prompt↔görsel uyuşmazlığı bug'ı) — bunun
  // yerine üretimi başarısız say (forfeit), yanıltıcı görsel ÜRETME.
  let promptText;
  try {
    promptText = await translateToEnglish(p.prompt);
  } catch (err) {
    if (!isCurrentEpoch(roomId, epoch)) return;
    console.warn(
      `[gen:${shortRoomId(roomId)}] slot ${slot} translate failed → forfeit (ham metni görsel modeline yollamıyoruz):`,
      err.message
    );
    const rf = getRoom(roomId);
    if (!rf || !rf.players[slot]) return;
    rf.genErrors[slot] = true;
    rf.players[slot].forfeit = true;
    trackJobFailed({
      roomId,
      matchId: rf.matchId,
      slot,
      errorReason: 'translate_failed'
    }).catch(() => {});
    if (isCurrentEpoch(roomId, epoch)) broadcastState(roomId);
    return;
  }
  if (!isCurrentEpoch(roomId, epoch)) return;
  const prompt = buildGuardedPrompt(promptText);

  // Story 2.5: persist a GenerationJob row for the admin observability surface.
  trackJobStart({ roomId, matchId: room.matchId, slot, prompt }).catch(() => {});

  try {
    const { buffer, mimeType } = await generateImage(prompt);
    if (!isCurrentEpoch(roomId, epoch)) return;
    const r1 = getRoom(roomId);
    if (!r1) return;
    const objPath = `matches/${r1.matchId}/${slot}.png`;
    const url = await uploadBuffer(objPath, buffer, mimeType);
    if (!isCurrentEpoch(roomId, epoch)) return;
    const r2 = getRoom(roomId);
    if (!r2 || !r2.players[slot]) return;
    r2.players[slot].imageUrl = url;
    r2.genErrors[slot] = false;
    trackJobComplete({
      roomId,
      matchId: r2.matchId,
      slot,
      resultImageUrl: url
    }).catch(() => {});
  } catch (err) {
    if (!isCurrentEpoch(roomId, epoch)) return;
    console.warn(`[gen:${shortRoomId(roomId)}] slot ${slot} failed:`, err.message);
    const r = getRoom(roomId);
    if (!r || !r.players[slot]) return;
    r.genErrors[slot] = true;
    r.players[slot].forfeit = true;
    trackJobFailed({
      roomId,
      matchId: r.matchId,
      slot,
      errorReason: err.message || 'generation_failed'
    }).catch(() => {});
  }
  if (isCurrentEpoch(roomId, epoch)) broadcastState(roomId);
}

async function beginGenerating(roomId, reason, epoch) {
  if (!isCurrentEpoch(roomId, epoch)) return;
  const room = getRoom(roomId);
  if (!room) return;
  clearPhaseTimer(roomId);
  // Lock any un-submitted prompts as final
  for (const slot of ['A', 'B']) {
    const p = room.players[slot];
    if (p && !p.submitted) p.submitted = true;
  }
  setPhase(roomId, PHASES.GENERATING);
  broadcastState(roomId);
  console.log(`[lifecycle:${shortRoomId(roomId)}] GENERATING (${reason})`);

  // Sıralı üret: ücretsiz görsel sağlayıcılar eşzamanlı çift isteği throttle ediyor (402/429).
  await _generateForSlot(roomId, 'A', epoch);
  if (!isCurrentEpoch(roomId, epoch)) return;
  await _generateForSlot(roomId, 'B', epoch);
  if (!isCurrentEpoch(roomId, epoch)) return;
  await afterGenerating(roomId, epoch);
}

async function afterGenerating(roomId, epoch) {
  if (!isCurrentEpoch(roomId, epoch)) return;
  const room = getRoom(roomId);
  if (!room) return;
  const failA = room.genErrors.A;
  const failB = room.genErrors.B;

  if (failA && failB) {
    // İki taraf da başarısız → berabere ilan et, hemen RESULT
    room.winner = 'TIE';
    finalizeMatch(roomId, epoch);
    return;
  }
  if (failA || failB) {
    // Tek taraf forfeit → diğeri kazandı
    room.winner = failA ? 'B' : 'A';
    finalizeMatch(roomId, epoch);
    return;
  }

  // Story 3.1: voting opt-in branch (D-1). When audienceVotingEnabled and
  // audienceEnabled are both true, open the voting phase; otherwise fall
  // through to AI scoring (legacy default).
  if (room.audienceVotingEnabled && room.audienceEnabled) {
    beginVoting(roomId, 'MAIN', epoch);
    return;
  }

  // Kazananı AI belirler (default verdict path).
  await beginScoring(roomId, epoch);
}

// ---------------------------------------------------------------------------
// Scoring (AI mode)
// ---------------------------------------------------------------------------

async function beginScoring(roomId, epoch) {
  if (!isCurrentEpoch(roomId, epoch)) return;
  const room = getRoom(roomId);
  if (!room) return;
  setPhase(roomId, PHASES.SCORING);
  broadcastState(roomId);

  if (process.env.DEMO_MODE === '1') {
    // Stay on SCORING screen briefly, then commit fake scores
    await new Promise((r) => setTimeout(r, 3000));
    if (!isCurrentEpoch(roomId, epoch)) return;
    const r = getRoom(roomId);
    if (!r) return;
    const a = 52 + Math.floor(Math.random() * 12);
    let b = 100 - a + Math.floor(Math.random() * 8) - 4;
    if (b === a) b = a - 1; // beraberlik yok
    if (r.players.A) r.players.A.aiScore = a;
    if (r.players.B) r.players.B.aiScore = b;
    r.aiReasoning =
      'Both entries captured the brief, but one held the mood and composition tighter.';
    r.aiReasoningTr =
      'İki görsel de konuyu yakaladı ama biri atmosferi ve kompozisyonu daha tutarlı korudu.';
    r.winner = a > b ? 'A' : 'B';
    broadcastState(roomId);
    finalizeMatch(roomId, epoch);
    return;
  }

  try {
    if (!room.referenceImageUrl || !room.players.A?.imageUrl || !room.players.B?.imageUrl) {
      throw new Error('missing images');
    }
    // AI puanlama 2 denemeli; başarısız olursa oylamaya DÜŞMEZ (kullanıcı oyu yok).
    let scored;
    let lastErr;
    for (let attempt = 0; attempt < 2 && !scored; attempt++) {
      try {
        scored = await scoreVsReference(
          room.referenceImageUrl,
          room.players.A.imageUrl,
          room.players.B.imageUrl,
          { nameA: room.players.A?.nickname, nameB: room.players.B?.nickname }
        );
      } catch (e) {
        lastErr = e;
        console.warn(
          `[scoring:${shortRoomId(roomId)}] attempt ${attempt + 1} failed:`,
          e.message
        );
      }
    }
    if (!isCurrentEpoch(roomId, epoch)) return;
    if (!scored) throw lastErr || new Error('scoring failed');

    const r = getRoom(roomId);
    if (!r) return;
    const { a, b, winner, reasoningTr, reasoningEn } = scored;
    if (r.players.A) r.players.A.aiScore = a;
    if (r.players.B) r.players.B.aiScore = b;
    r.aiReasoning = reasoningEn;
    r.aiReasoningTr = reasoningTr;
    r.winner = winner === 'b' ? 'B' : 'A';
    broadcastState(roomId);
    finalizeMatch(roomId, epoch);
  } catch (err) {
    if (!isCurrentEpoch(roomId, epoch)) return;
    // AI hiç çalışmadıysa (nadir): skor yok → puana göre/A varsayılan, oylama YOK.
    console.warn(
      `[scoring:${shortRoomId(roomId)}] failed permanently, AI fallback winner:`,
      err.message
    );
    const r = getRoom(roomId);
    if (!r) return;
    const a = r.players.A?.aiScore ?? 0;
    const b = r.players.B?.aiScore ?? 0;
    r.winner = b > a ? 'B' : 'A';
    r.aiReasoning = null;
    r.aiReasoningTr = null;
    broadcastState(roomId);
    finalizeMatch(roomId, epoch);
  }
}

// ---------------------------------------------------------------------------
// Voting (audience + tiebreak)
// ---------------------------------------------------------------------------

function beginVoting(roomId, scoringPhase, epoch) {
  if (!isCurrentEpoch(roomId, epoch)) return;
  const room = getRoom(roomId);
  if (!room) return;
  room.scoringPhase = scoringPhase;
  room.votes = { A: 0, B: 0 };
  room.voterIds = new Set();
  const phase = scoringPhase === 'TIEBREAK' ? PHASES.TIEBREAK_VOTE : PHASES.VOTING;
  const durationSec =
    scoringPhase === 'TIEBREAK' ? room.tiebreakDurationSec : room.votingDurationSec;
  setPhase(roomId, phase, durationSec * 1000);
  broadcastState(roomId);
  setPhaseTimer(roomId, durationSec * 1000, () => finalizeVote(roomId, epoch));
}

function handleVote(roomId, { deviceId, votedFor }) {
  const room = getRoom(roomId);
  if (!room) return { ok: false, reason: 'room_not_found' };
  if (room.phase !== PHASES.VOTING && room.phase !== PHASES.TIEBREAK_VOTE) {
    return { ok: false, reason: 'not_voting' };
  }
  if (!['A', 'B'].includes(votedFor)) return { ok: false, reason: 'invalid' };
  if (room.voterIds.has(deviceId)) return { ok: false, reason: 'already_voted' };
  room.voterIds.add(deviceId);
  room.votes[votedFor] += 1;
  // Async, best-effort Mongo dedup record
  recordVote({
    matchId: room.matchId,
    deviceId,
    votedFor,
    phase: room.scoringPhase
  }).catch(() => {});
  broadcastState(roomId);
  return { ok: true };
}

function finalizeVote(roomId, epoch) {
  if (!isCurrentEpoch(roomId, epoch)) return;
  const room = getRoom(roomId);
  if (!room) return;
  const { A, B } = room.votes;
  if (room.players.A) room.players.A.voteCount = A;
  if (room.players.B) room.players.B.voteCount = B;

  if (A === B) {
    // Hâlâ berabere
    if (room.scoringPhase === 'MAIN') {
      // Sudden-death dene
      beginVoting(roomId, 'TIEBREAK', epoch);
      return;
    }
    room.winner = 'TIE';
  } else {
    room.winner = A > B ? 'A' : 'B';
  }
  finalizeMatch(roomId, epoch);
}

// ---------------------------------------------------------------------------
// Finalize → RESULT → back to IDLE
// ---------------------------------------------------------------------------

function finalizeMatch(roomId, epoch) {
  if (!isCurrentEpoch(roomId, epoch)) return;
  const room = getRoom(roomId);
  if (!room) return;
  setPhase(roomId, PHASES.RESULT, room.resultDurationSec * 1000);
  broadcastState(roomId);

  // TOURNAMENT final-duel handoff: when this duel is the tournament's FINAL_DUEL,
  // map the winner back to the finalist entrant and crown the champion instead of
  // running the duel's saveMatch + rematch/idle reset. DUEL rooms are unaffected
  // (guard is false → existing logic below runs byte-for-byte unchanged).
  if (room.roomMode === 'TOURNAMENT' && room.tournament &&
      room.tournament.phase === TOURNAMENT_PHASES.FINAL_DUEL) {
    const winnerSlot = room.winner === 'TIE' ? 'A' : room.winner; // tie → first finalist
    // LAZY require — hoisting creates a CJS require cycle.
    require('./tournament/lifecycle.js').onFinalDuelResult(roomId, winnerSlot);
    return; // skip duel rematch/idle path
  }

  // Mongo'ya yaz (best-effort)
  saveMatch({
    startedAt: room.matchStartedAt || new Date(),
    endedAt: new Date(),
    targetPrompt: room.targetPrompt,
    category: room.roundCategory,
    difficulty: room.roundDifficulty,
    referenceImageUrl: room.referenceImageUrl,
    winnerMode: room.winnerMode,
    playerA: room.players.A
      ? {
          nickname: room.players.A.nickname,
          prompt: room.players.A.prompt,
          imageUrl: room.players.A.imageUrl,
          aiScore: room.players.A.aiScore,
          voteCount: room.votes.A,
          forfeit: room.players.A.forfeit
        }
      : null,
    playerB: room.players.B
      ? {
          nickname: room.players.B.nickname,
          prompt: room.players.B.prompt,
          imageUrl: room.players.B.imageUrl,
          aiScore: room.players.B.aiScore,
          voteCount: room.votes.B,
          forfeit: room.players.B.forfeit
        }
      : null,
    winner: room.winner,
    tiebreakUsed: room.scoringPhase === 'TIEBREAK'
  }).catch(() => {});

  // Pre-cache next target (best effort)
  ensureTargetImage(roomId).catch(() => {});

  // RESULT bitiminde: rematch koşulları sağlanırsa LOBBY'ye geri dön, yoksa IDLE.
  // Koşul = rematchEnabled açık VE iki oyuncu da hâlâ bağlı (disconnectedAt yok).
  setPhaseTimer(roomId, room.resultDurationSec * 1000, () => {
    if (!isCurrentEpoch(roomId, epoch)) return;
    const r = getRoom(roomId);
    if (!r) return;
    const bothConnected =
      !!r.rematchEnabled &&
      r.players.A && !r.players.A.disconnectedAt &&
      r.players.B && !r.players.B.disconnectedAt;
    if (bothConnected) {
      beginRematchLobby(roomId);
    } else {
      returnToIdle(roomId);
    }
  });
}

function returnToIdle(roomId) {
  clearAllDisconnectTimers(roomId);
  resetMatch(roomId);
  broadcastState(roomId);
}

// ---------------------------------------------------------------------------
// Disconnect handling
// ---------------------------------------------------------------------------

function handlePlayerDisconnect(roomId, slot) {
  const room = getRoom(roomId);
  if (!room) return;
  const p = room.players[slot];
  if (!p) return;

  if (room.phase === PHASES.PLAYER_1_JOINED) {
    // Player A vazgeçti, oyun idle'a döner
    returnToIdle(roomId);
    return;
  }

  if (room.phase === PHASES.RESULT) {
    // RESULT esnasında biri kaçarsa rematch koşulu yıkılmalı; bunu sadece
    // disconnectedAt set ederek işaretliyoruz. finalizeMatch'in timer callback'i
    // bothConnected kontrolünde bu bayrağı görüp returnToIdle'a düşecek.
    // Grace timer'a gerek yok — RESULT zaten geri-sayım fazı.
    p.disconnectedAt = Date.now();
    broadcastState(roomId);
    return;
  }

  if (room.phase === PHASES.LOBBY) {
    // Either player leaving the ready-check returns the room to idle. The
    // surviving player will have to re-invite — simpler than half-staffed
    // ready-checks that can't progress.
    returnToIdle(roomId);
    return;
  }

  if (room.phase === PHASES.VS_INTRO || room.phase === PHASES.PROMPTING) {
    p.disconnectedAt = Date.now();
    broadcastState(roomId);
    setDisconnectTimer(roomId, slot, DISCONNECT_GRACE_MS, () => {
      const r = getRoom(roomId);
      if (!r) return;
      const stillGone = r.players[slot]?.disconnectedAt;
      if (!stillGone) return;
      if (r.phase === PHASES.PROMPTING) {
        // Auto-submit whatever they had
        r.players[slot].submitted = true;
        broadcastState(roomId);
        if (r.players.A?.submitted && r.players.B?.submitted) {
          beginGenerating(roomId, 'disconnect_grace', getOperationEpoch(roomId));
        }
      } else if (r.phase === PHASES.VS_INTRO) {
        // Reset to idle — eşitsiz başlangıç olur
        returnToIdle(roomId);
      }
    });
  }
}

function handlePlayerReconnect(roomId, slot, socketId) {
  const room = getRoom(roomId);
  if (!room) return;
  const p = room.players[slot];
  if (!p) return;
  p.disconnectedAt = null;
  p.socketId = socketId;
  clearDisconnectTimer(roomId, slot);
  broadcastState(roomId);
}

// ---------------------------------------------------------------------------
// Admin actions
// ---------------------------------------------------------------------------

function adminForceEnd(roomId) {
  const room = getRoom(roomId);
  if (!room) return;
  if (room.phase === PHASES.IDLE) return;
  const epoch = bumpOperationEpoch(roomId);
  room.winner = 'TIE';
  finalizeMatch(roomId, epoch);
}

function adminReset(roomId) {
  const room = getRoom(roomId);
  if (!room) return;
  clearPhaseTimer(roomId);
  clearAllDisconnectTimers(roomId);
  returnToIdle(roomId);
}

function adminUpdateSettings(roomId, patch) {
  const room = getRoom(roomId);
  if (!room) return;
  const lockChanged =
    (patch.lockedCategory !== undefined && patch.lockedCategory !== room.lockedCategory) ||
    (patch.lockedDifficulty !== undefined && patch.lockedDifficulty !== room.lockedDifficulty);
  Object.assign(room, {
    lockedCategory: patch.lockedCategory ?? room.lockedCategory,
    lockedDifficulty: patch.lockedDifficulty ?? room.lockedDifficulty,
    winnerMode: patch.winnerMode ?? room.winnerMode,
    showLivePrompts:
      patch.showLivePrompts !== undefined ? !!patch.showLivePrompts : room.showLivePrompts,
    promptDurationSec: patch.promptDurationSec ?? room.promptDurationSec,
    votingDurationSec: patch.votingDurationSec ?? room.votingDurationSec,
    tiebreakDurationSec: patch.tiebreakDurationSec ?? room.tiebreakDurationSec,
    resultDurationSec: patch.resultDurationSec ?? room.resultDurationSec,
    vsIntroDurationSec: patch.vsIntroDurationSec ?? room.vsIntroDurationSec,
    stageLanguage: patch.stageLanguage ?? room.stageLanguage,
    stageTheme: patch.stageTheme ?? room.stageTheme
  });
  if (lockChanged) {
    invalidateReferenceCache(roomId);
    room.referencePending = false;
    if (room.phase === PHASES.IDLE) {
      ensureTargetImage(roomId).catch(() => {});
    }
  }
  broadcastState(roomId);
}

module.exports = {
  ensureTargetImage,
  invalidateReferenceCache,
  tryJoinAsPlayer,
  markPlayerReady,
  handlePromptTyping,
  handlePromptSubmit,
  handleVote,
  handlePlayerDisconnect,
  handlePlayerReconnect,
  adminForceEnd,
  adminReset,
  adminUpdateSettings,
  returnToIdle,
  startMatch,
  // for testing
  beginGenerating
};
