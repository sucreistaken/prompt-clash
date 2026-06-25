// Multi-room state factory + per-room helpers.
// Story 1.1: singleton retired. Each room owns its own state object inside
// roomRegistry's Map<roomId, RoomState>. Every helper takes roomId as first
// arg and reads via getRoom(roomId) — never destructures state at module load
// (MUST rule #9 in architecture.md).
//
// State.js does NOT require('./roomRegistry.js') at the module top. The
// require lands at the BOTTOM of the file (after module.exports is populated)
// to resolve the CJS cycle: roomRegistry requires this file for the
// createRoomState factory, and this file requires roomRegistry to expose
// getRoom as a re-export so existing call sites can do
// `const { getRoom } = require('./state.js')` per the Story 1.1 inventory.

const PHASES = Object.freeze({
  IDLE: 'IDLE',
  PLAYER_1_JOINED: 'PLAYER_1_JOINED',
  LOBBY: 'LOBBY', // Sally v3 ready-check: both players in, waiting for both to tap "Hazırım"
  VS_INTRO: 'VS_INTRO',
  PROMPTING: 'PROMPTING',
  GENERATING: 'GENERATING',
  SCORING: 'SCORING',
  VOTING: 'VOTING',
  TIEBREAK_VOTE: 'TIEBREAK_VOTE',
  RESULT: 'RESULT',
  ROOM_EXPIRED: 'ROOM_EXPIRED' // Story 1.1: TTL expiry pseudo-state
});

// Lazy registry accessor — avoids caching a stale module.exports reference
// while roomRegistry is mid-load. CJS caches the require call itself, and the
// `.getRoom` lookup re-resolves through the live exports object every call.
function _getRoom(roomId) {
  return require('./roomRegistry.js').getRoom(roomId);
}

function _emptyPlayer() {
  return null;
}

// Factory: produce a fresh RoomState object. Shape is identical to the
// pre-Story-1.1 singleton _initialState() output, plus roomId/roomCode/hostId/
// createdAt/lastActivityAt for registry bookkeeping.
function createRoomState({
  roomId,
  roomCode = null,
  hostId = null,
  roomName = null,
  settings = null,
  state: roomState = 'WAITING_FOR_PLAYERS' // Story 1.6: room-level state (separate from match phase)
} = {}) {
  if (!roomId) throw new Error('createRoomState requires roomId');
  const room = {
    roomId,
    roomCode,
    hostId,
    roomName,
    state: roomState, // ROOM_CREATED → WAITING_FOR_PLAYERS → LOBBY → ... → ROOM_COMPLETED|ROOM_EXPIRED
    settings: settings || null, // Raw POST /api/rooms body — Story 1.6+ reads `audienceEnabled`/`audienceVotingEnabled` etc. directly.
    audienceEnabled: settings ? settings.audienceEnabled !== false : true,
    audienceVotingEnabled: !!(settings && settings.audienceVotingEnabled),
    roomMode: (settings && settings.roomMode) === 'TOURNAMENT' ? 'TOURNAMENT' : 'DUEL',
    rematchEnabled: settings ? settings.rematchEnabled !== false : true,
    showPromptsAfterResult: settings ? settings.showPromptsAfterResult !== false : true,
    showPromptsDuringWriting: !!(settings && settings.showPromptsDuringWriting),
    aiScoreEnabled: settings ? settings.aiScoreEnabled !== false : true,
    categoryMode: (settings && settings.categoryMode) || 'RANDOM',
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    phase: PHASES.IDLE,
    phaseEndsAt: null,
    matchId: null,
    matchStartedAt: null,
    players: { A: _emptyPlayer(), B: _emptyPlayer() },
    referenceImageUrl: null,
    nextReferenceImageUrl: null,
    referencePending: false,
    // Aktif turun hedefi (her tur dinamik üretilir).
    // targetPrompt = EN (görsel üretimine giden + legacy alanı).
    // targetPromptTr = TR (RESULT ekranında TR oyuncuya gösterilen).
    targetPrompt: null,
    targetPromptTr: null,
    roundCategory: null,
    roundDifficulty: null,
    // Bir sonraki tur için pre-cache edilen hedef metadata'sı.
    nextTargetPrompt: null,
    nextTargetPromptTr: null,
    nextRoundCategory: null,
    nextRoundDifficulty: null,
    // Admin kilitleri (boş = otomatik rastgele).
    lockedCategory: null,
    lockedDifficulty: null,
    winnerMode: 'AI_SCORE',
    showLivePrompts: true,
    promptDurationSec: 60,
    votingDurationSec: 15,
    tiebreakDurationSec: 10,
    resultDurationSec: 15,
    vsIntroDurationSec: 5,
    stageLanguage: 'tr',
    stageTheme: 'dark',
    votes: { A: 0, B: 0 },
    voterIds: new Set(),
    scoringPhase: 'MAIN', // 'MAIN' veya 'TIEBREAK'
    results: null,
    winner: null,
    aiReasoning: null,
    operationEpoch: 0,
    genErrors: { A: false, B: false }
  };
  if (settings) _applySettingsTo(room, settings);
  return room;
}

function _applySettingsTo(room, settings) {
  room.lockedCategory = settings.lockedCategory ?? room.lockedCategory;
  room.lockedDifficulty = settings.lockedDifficulty ?? room.lockedDifficulty;
  room.winnerMode = settings.winnerMode ?? room.winnerMode;
  room.showLivePrompts = settings.showLivePrompts ?? room.showLivePrompts;
  room.promptDurationSec = settings.promptDurationSec ?? room.promptDurationSec;
  room.votingDurationSec = settings.votingDurationSec ?? room.votingDurationSec;
  room.tiebreakDurationSec = settings.tiebreakDurationSec ?? room.tiebreakDurationSec;
  room.resultDurationSec = settings.resultDurationSec ?? room.resultDurationSec;
  room.vsIntroDurationSec = settings.vsIntroDurationSec ?? room.vsIntroDurationSec;
  room.stageLanguage = settings.stageLanguage ?? room.stageLanguage;
  room.stageTheme = settings.stageTheme ?? room.stageTheme;
}

function applySettings(roomId, settings) {
  const room = _getRoom(roomId);
  if (!room) return;
  _applySettingsTo(room, settings);
}

function newMatchId() {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function makePlayer({ socketId, deviceId, nickname }) {
  return {
    socketId,
    deviceId,
    nickname,
    prompt: '',
    submitted: false,
    imageUrl: null,
    disconnectedAt: null,
    forfeit: false,
    aiScore: null,
    ready: false // LOBBY ready-check
  };
}

function resetMatch(roomId) {
  const room = _getRoom(roomId);
  if (!room) return;
  room.operationEpoch += 1;
  room.phase = PHASES.IDLE;
  room.phaseEndsAt = null;
  room.matchId = null;
  room.matchStartedAt = null;
  room.players = { A: null, B: null };
  room.referenceImageUrl = null;
  // Aktif tur hedefi sıfırlanır; next* (pre-cache) bir sonraki maç için korunur.
  room.targetPrompt = null;
  room.targetPromptTr = null;
  room.roundCategory = null;
  room.roundDifficulty = null;
  room.votes = { A: 0, B: 0 };
  room.voterIds = new Set();
  room.scoringPhase = 'MAIN';
  room.results = null;
  room.winner = null;
  room.aiReasoning = null;
  room.genErrors = { A: false, B: false };
}

// Rematch için soft reset: oyuncuların kimlik (nickname/deviceId/socketId) ve
// slot kaydı KORUNUR; sadece tur-içi durum temizlenir. Pre-cache (next*) de
// dokunulmaz — startMatch onu promote edecek. Caller phase'i ayrı set eder.
function softResetForRematch(roomId) {
  const room = _getRoom(roomId);
  if (!room) return;
  room.operationEpoch += 1;
  room.matchId = null;
  room.matchStartedAt = null;
  for (const slot of ['A', 'B']) {
    const p = room.players[slot];
    if (!p) continue;
    p.prompt = '';
    p.submitted = false;
    p.imageUrl = null;
    p.aiScore = null;
    p.forfeit = false;
    p.ready = false;
    p.disconnectedAt = null;
  }
  room.referenceImageUrl = null;
  room.targetPrompt = null;
  room.targetPromptTr = null;
  room.roundCategory = null;
  room.roundDifficulty = null;
  room.votes = { A: 0, B: 0 };
  room.voterIds = new Set();
  room.scoringPhase = 'MAIN';
  room.results = null;
  room.winner = null;
  room.aiReasoning = null;
  room.genErrors = { A: false, B: false };
}

function bumpOperationEpoch(roomId) {
  const room = _getRoom(roomId);
  if (!room) return 0;
  room.operationEpoch += 1;
  return room.operationEpoch;
}

function getOperationEpoch(roomId) {
  const room = _getRoom(roomId);
  return room ? room.operationEpoch : 0;
}

function isCurrentEpoch(roomId, epoch) {
  const room = _getRoom(roomId);
  return !!room && room.operationEpoch === epoch;
}

function setPhase(roomId, phase, endsInMs = null) {
  const room = _getRoom(roomId);
  if (!room) return;
  room.phase = phase;
  room.phaseEndsAt = endsInMs ? Date.now() + endsInMs : null;
}

module.exports = {
  PHASES,
  createRoomState,
  applySettings,
  resetMatch,
  softResetForRematch,
  setPhase,
  makePlayer,
  newMatchId,
  bumpOperationEpoch,
  getOperationEpoch,
  isCurrentEpoch
};

// Re-export getRoom as a lazy closure so callers can do
// `const { getRoom } = require('./state.js')` per the Story 1.1 call-site
// inventory. The require resolves through roomRegistry's live exports object
// on every call — robust against any module-load ordering.
module.exports.getRoom = (roomId) => require('./roomRegistry.js').getRoom(roomId);
