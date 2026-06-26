// Room-scoped state snapshot builder + broadcast helpers.
// Story 1.1: snapshot reads from getRoom(roomId), not a singleton. All fan-out
// goes through io.to('room:'+roomId).emit('state', ...) (MUST rule #1).
// io ownership moved here from matchLifecycle (single source of truth for
// the room-scoped emit pattern).

const { getRoom, PHASES } = require('../game/state.js');
const { mask } = require('../profanity.js');
const { categoryLabel, difficultyLabel } = require('../game/targetPrompt.js');

let _io = null;

function setIo(io) {
  _io = io;
}

function _safePlayer(p, opts) {
  if (!p) return null;
  return {
    nickname: p.nickname,
    submitted: !!p.submitted,
    forfeit: !!p.forfeit,
    disconnected: !!p.disconnectedAt,
    imageUrl: opts.includeImage ? p.imageUrl : null,
    prompt: opts.includePrompt ? mask(p.prompt) : null,
    aiScore: opts.includeScore ? p.aiScore : null,
    // LOBBY/ready-check flag — clients use it to render the "Hazırım" toggle.
    ready: !!p.ready
  };
}

// Story 1.7: role-aware snapshot. Role differentiation is light in Phase 1 —
// stories 2.4 (player draft restore) and 3.3 (audience vote restore) add the
// per-role fields. For now `role` only sets `viewerRole` on the payload so
// the client can render role-conditional UI without re-asking the server.
function buildSnapshot(roomId, role = 'audience') {
  const room = getRoom(roomId);
  if (!room) return null;
  const phase = room.phase;

  // Live prompt görünürlüğü: PROMPTING'de hâlâ showLivePrompts admin ayarına bağlı
  // (oyun gerginliği için). GENERATING'den itibaren audience her zaman prompt'ları
  // görür — "kim daha iyi yazdı" tahminini canlı yapabilmek için.
  const includePrompt =
    (room.showLivePrompts && phase === PHASES.PROMPTING) ||
    phase === PHASES.GENERATING ||
    phase === PHASES.SCORING ||
    phase === PHASES.VOTING ||
    phase === PHASES.TIEBREAK_VOTE ||
    phase === PHASES.RESULT;

  const includeImage =
    phase === PHASES.GENERATING ||
    phase === PHASES.SCORING ||
    phase === PHASES.VOTING ||
    phase === PHASES.TIEBREAK_VOTE ||
    phase === PHASES.RESULT;

  // Kazanan her zaman AI ile belirlendiği için skorlar SCORING/RESULT'ta hep gönderilir.
  const includeScore = phase === PHASES.SCORING || phase === PHASES.RESULT;

  return {
    viewerRole: role, // Story 1.7: who the server thought you were
    roomId: room.roomId,
    roomCode: room.roomCode,
    roomName: room.roomName,
    roomState: room.state, // ROOM_CREATED / WAITING_FOR_PLAYERS / ...
    audienceEnabled: room.audienceEnabled !== false,
    audienceVotingEnabled: !!room.audienceVotingEnabled,
    aiScoreEnabled: room.aiScoreEnabled !== false,
    roomMode: room.roomMode,
    tournament: room.roomMode === 'TOURNAMENT' ? require('../game/tournament/snapshot.js').tournamentSnapshot(room) : null,
    phase,
    phaseEndsAt: room.phaseEndsAt,
    matchId: room.matchId,
    // Kategori/zorluk rozeti: tur boyunca görünür (kod + TR etiket).
    roundCategory: room.roundCategory,
    roundDifficulty: room.roundDifficulty,
    roundCategoryLabel: room.roundCategory ? categoryLabel(room.roundCategory) : null,
    roundDifficultyLabel: room.roundDifficulty ? difficultyLabel(room.roundDifficulty) : null,
    // Gerçek prompt SADECE RESULT'ta sızdırılır (reveal/payoff).
    // EN (legacy alanı, görsel üretiminde kullanıldı) + TR (TR oyuncuya gösterilen).
    targetPrompt: phase === PHASES.RESULT ? room.targetPrompt : null,
    targetPromptTr: phase === PHASES.RESULT ? room.targetPromptTr : null,
    winnerMode: room.winnerMode,
    showLivePrompts: room.showLivePrompts,
    stageLanguage: room.stageLanguage,
    stageTheme: room.stageTheme,
    referenceImageUrl: room.referenceImageUrl,
    players: {
      A: _safePlayer(room.players.A, { includePrompt, includeImage, includeScore }),
      B: _safePlayer(room.players.B, { includePrompt, includeImage, includeScore })
    },
    votes:
      phase === PHASES.VOTING || phase === PHASES.TIEBREAK_VOTE || phase === PHASES.RESULT
        ? { A: room.votes.A, B: room.votes.B }
        : null,
    winner: phase === PHASES.RESULT ? room.winner : null,
    aiReasoning: phase === PHASES.RESULT ? room.aiReasoning : null,
    durations: {
      promptDurationSec: room.promptDurationSec,
      votingDurationSec: room.votingDurationSec,
      tiebreakDurationSec: room.tiebreakDurationSec,
      resultDurationSec: room.resultDurationSec,
      vsIntroDurationSec: room.vsIntroDurationSec
    }
  };
}

function broadcastState(roomId) {
  if (!_io) return;
  const room = getRoom(roomId);
  if (!room) return;
  // TTL bookkeeping (Story 1.1 AC #3): every broadcast counts as activity.
  room.lastActivityAt = Date.now();
  const snapshot = buildSnapshot(roomId);
  _io.to('room:' + roomId).emit('state', snapshot);
}

function broadcastPromptUpdate(roomId, slot, text) {
  if (!_io) return;
  const room = getRoom(roomId);
  if (!room || !room.showLivePrompts) return;
  _io.to('room:' + roomId).emit('prompt_update', { slot, text });
}

// Generic room-scoped emit helper (used by roomRegistry.expireRoom for
// `room:closed`, future stories for other notifications).
function emitToRoom(roomId, event, payload) {
  if (!_io) return;
  _io.to('room:' + roomId).emit(event, payload);
}

// Single-socket emit helper (used by tournament final-duel handoff to push
// `joined_as` to the two finalists so their clients learn their slot).
function emitToSocket(socketId, event, payload) {
  if (_io && socketId) _io.to(socketId).emit(event, payload);
}

module.exports = {
  setIo,
  buildSnapshot,
  broadcastState,
  broadcastPromptUpdate,
  emitToRoom,
  emitToSocket
};
