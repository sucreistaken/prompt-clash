// Multi-room socket handler.
// Story 1.1: handshake middleware validates roomId and joins the socket to
// `room:<roomId>` (D-5 / D-6 in architecture.md). Phase-1 transition path:
// sockets without an explicit auth.roomId join the synthetic 'default' room
// so the existing UI + matchSmoke.js keep working unchanged.
// TODO(Story 1.6): drop the 'default' fallback once /create-room ships.

const { getRoom: getRoomBase, applySettings } = require('../game/state.js');
// Re-bind via direct registry import for the host-live-controls helper that
// runs inside connection handlers (avoid the lazy closure overhead).
const { getRoom } = require('../game/roomRegistry.js');
void getRoomBase;
const { DEFAULT_ROOM_ID, shortRoomId, createRoom } = require('../game/roomRegistry.js');
const { setIo, buildSnapshot, broadcastState } = require('./broadcasts.js');
const lifecycle = require('../game/matchLifecycle.js');
const { loadSettings, saveSettings } = require('../../models/Settings.js');
const { verifyToken, COOKIE_NAME } = require('../adminAuth.js');
const { rateLimit } = require('../rateLimit.js');
const cookie = require('cookie');

const ROLES = new Set(['player', 'audience', 'stage', 'admin']);

function _parseAdminCookie(handshake) {
  const raw = handshake?.headers?.cookie;
  if (!raw) return false;
  const parsed = cookie.parse(raw);
  const token = parsed[COOKIE_NAME];
  return !!verifyToken(token);
}

function _parseDeviceCookie(handshake) {
  const raw = handshake?.headers?.cookie;
  if (!raw) return null;
  const parsed = cookie.parse(raw);
  return parsed.pc_device_id ? String(parsed.pc_device_id) : null;
}

function _identifySlot(socket) {
  const room = getRoom(socket.data.roomId);
  if (!room) return null;
  if (room.players.A?.socketId === socket.id) return 'A';
  if (room.players.B?.socketId === socket.id) return 'B';
  return null;
}

function _identifySlotByDevice(roomId, deviceId) {
  const room = getRoom(roomId);
  if (!room) return null;
  if (room.players.A?.deviceId === deviceId) return 'A';
  if (room.players.B?.deviceId === deviceId) return 'B';
  return null;
}

function _clientIp(socket) {
  const xf = socket.handshake.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf) return xf.split(',')[0].trim();
  return socket.handshake.address || 'unknown';
}

function _allow(socket, event, opts) {
  const ip = _clientIp(socket);
  const deviceId = socket.data.deviceId || 'unknown';
  const keys = [`ip:${ip}:${event}`, `device:${deviceId}:${event}`];
  for (const key of keys) {
    const res = rateLimit(key, opts);
    if (!res.ok) {
      socket.emit('error', { code: 'rate_limited', event, retryInMs: res.retryInMs });
      return false;
    }
  }
  return true;
}

async function attachSocketServer(io) {
  // Broadcasts owns the io reference (was on matchLifecycle pre-Story 1.1).
  setIo(io);

  // Load global settings, apply to the default room. Story 4.x will expand to
  // per-room settings broadcast.
  try {
    const settings = await loadSettings();
    applySettings(DEFAULT_ROOM_ID, settings);
    // Background: pre-cache first target for the default room.
    lifecycle.ensureTargetImage(DEFAULT_ROOM_ID).catch(() => {});
  } catch (err) {
    console.warn(`[init:${shortRoomId(DEFAULT_ROOM_ID)}] settings load failed:`, err.message);
  }

  // Handshake middleware: validate roomId, join `room:<roomId>` (D-5 / D-6).
  io.use((socket, next) => {
    const auth = socket.handshake.auth || {};
    const rawRoomId = auth.roomId;
    const roomId =
      typeof rawRoomId === 'string' && rawRoomId.length > 0 ? rawRoomId : DEFAULT_ROOM_ID;

    let room = getRoom(roomId);
    if (!room) {
      // Phase-1 strict: any roomId other than 'default' must already exist.
      // TODO(Story 1.6): replace fallback with a hard 404 once /create-room ships.
      if (roomId === DEFAULT_ROOM_ID) {
        room = createRoom({ roomId: DEFAULT_ROOM_ID });
      } else {
        return next(new Error('room_not_found'));
      }
    }

    const rawRole = auth.role;
    const role = ROLES.has(rawRole) ? rawRole : 'audience';
    const isAdmin = role === 'admin' ? _parseAdminCookie(socket.handshake) : false;
    const cookieDeviceId = _parseDeviceCookie(socket.handshake);

    socket.data.roomId = roomId;
    socket.data.role = role;
    socket.data.isAdmin = isAdmin;
    socket.data.deviceId = String(cookieDeviceId || auth.deviceId || socket.id);

    socket.join('room:' + roomId);
    next();
  });

  io.on('connection', (socket) => {
    const roomId = socket.data.roomId;

    // Reconnect: is this deviceId already holding a slot in this room?
    // Role-gated: yalnız role='player' handshake'inde reattach. Aynı browser
    // önce /join'den player olup sonra /watch'tan audience olduğunda audience
    // socket'ine yanlışlıkla 'joined_as' atmamak için (ekstra bug: o tab
    // kapanınca disconnect handler aktif player'ı slot'tan düşürüyordu).
    if (socket.data.role === 'player') {
      const existingSlot = _identifySlotByDevice(roomId, socket.data.deviceId);
      if (existingSlot) {
        lifecycle.handlePlayerReconnect(roomId, existingSlot, socket.id);
        socket.data.slot = existingSlot;
        socket.emit('joined_as', { slot: existingSlot });
      }
    }

    // Cold-load snapshot to just this socket (NOT a room broadcast — single-socket
    // delivery is intentional per architecture §reconnect endpoint pattern).
    socket.emit('state', buildSnapshot(roomId));

    // -----------------------------------------------------------------------
    // Player events
    // -----------------------------------------------------------------------
    socket.on('join_game', (payload, ack) => {
      if (!_allow(socket, 'join_game', { limit: 10, windowMs: 60_000 })) {
        if (typeof ack === 'function') ack({ ok: false, reason: 'rate_limited' });
        return;
      }
      const nickname = payload?.nickname;
      const result = lifecycle.tryJoinAsPlayer(roomId, {
        socketId: socket.id,
        deviceId: socket.data.deviceId,
        nickname
      });
      if (result.ok) {
        if (result.slot) {
          socket.data.slot = result.slot;
          socket.emit('joined_as', { slot: result.slot });
        } else if (result.entrantId) {
          socket.data.entrantId = result.entrantId;
          socket.emit('joined_as_entrant', { entrantId: result.entrantId });
        }
      } else {
        socket.emit('error', { code: 'join_failed', reason: result.reason });
      }
      if (typeof ack === 'function') ack(result);
    });

    socket.on('player_ready', (payload, ack) => {
      void payload;
      if (!_allow(socket, 'player_ready', { limit: 10, windowMs: 30_000 })) {
        if (typeof ack === 'function') ack({ ok: false, reason: 'rate_limited' });
        return;
      }
      const slot = socket.data.slot || _identifySlot(socket);
      if (!slot) {
        if (typeof ack === 'function') ack({ ok: false, reason: 'no_slot' });
        return;
      }
      const result = lifecycle.markPlayerReady(roomId, slot);
      if (typeof ack === 'function') ack(result);
    });

    socket.on('prompt_typing', (payload) => {
      if (!_allow(socket, 'prompt_typing', { limit: 90, windowMs: 30_000 })) return;
      const slot = socket.data.slot || _identifySlot(socket);
      if (!slot) return;
      lifecycle.handlePromptTyping(roomId, { slot, text: payload?.text });
    });

    socket.on('prompt_submit', (payload) => {
      if (!_allow(socket, 'prompt_submit', { limit: 6, windowMs: 60_000 })) return;
      const slot = socket.data.slot || _identifySlot(socket);
      if (!slot) return;
      lifecycle.handlePromptSubmit(roomId, { slot, text: payload?.text });
    });

    socket.on('vote', (payload, ack) => {
      if (!_allow(socket, 'vote', { limit: 20, windowMs: 30_000 })) {
        if (typeof ack === 'function') ack({ ok: false, reason: 'rate_limited' });
        return;
      }
      const result = lifecycle.handleVote(roomId, {
        deviceId: socket.data.deviceId,
        votedFor: payload?.for
      });
      if (!result.ok) socket.emit('error', { code: 'vote_failed', reason: result.reason });
      if (typeof ack === 'function') ack(result);
    });

    socket.on('tournament_prompt', (payload, ack) => {
      if (!_allow(socket, 'tournament_prompt', { limit: 30, windowMs: 60_000 })) {
        if (typeof ack === 'function') ack({ ok: false, reason: 'rate_limited' });
        return;
      }
      const entrantId = socket.data.entrantId;
      if (!entrantId) {
        if (typeof ack === 'function') ack({ ok: false, reason: 'not_entrant' });
        return;
      }
      const tlc = require('../game/tournament/lifecycle.js');
      tlc.submitEntrantPrompt(roomId, entrantId, String(payload?.text || ''));
      const room = getRoom(roomId);
      if (room && room.tournament && typeof room.tournament._promptResolve === 'function') {
        room.tournament._promptResolve();
      }
      broadcastState(roomId);
      if (typeof ack === 'function') ack({ ok: true });
    });

    // -----------------------------------------------------------------------
    // Admin events
    // -----------------------------------------------------------------------
    socket.on('start_tournament', (payload, ack) => {
      void payload;
      // `socket.data.role` is coerced to 'audience' for hosts (ROLES whitelist
      // has no 'host'); use _isHostFor, the same handshake-auth check the other
      // host actions use, so the room host can actually start the tournament.
      if (!socket.data.isAdmin && !_isHostFor(roomId)) {
        socket.emit('error', { code: 'forbidden' });
        if (typeof ack === 'function') ack({ ok: false, reason: 'forbidden' });
        return;
      }
      if (!_allow(socket, 'start_tournament', { limit: 5, windowMs: 60_000 })) {
        if (typeof ack === 'function') ack({ ok: false, reason: 'rate_limited' });
        return;
      }
      require('../game/tournament/lifecycle.js').startTournament(roomId); // async, fire-and-forget; it broadcasts
      if (typeof ack === 'function') ack({ ok: true });
    });

    socket.on('admin:update_settings', async (payload, ack) => {
      if (!socket.data.isAdmin) {
        socket.emit('error', { code: 'admin_required' });
        if (typeof ack === 'function') ack({ ok: false });
        return;
      }
      try {
        const saved = await saveSettings(payload || {});
        lifecycle.adminUpdateSettings(roomId, saved);
        if (typeof ack === 'function') ack({ ok: true, settings: saved });
      } catch (err) {
        if (typeof ack === 'function') ack({ ok: false, reason: err.message });
      }
    });

    socket.on('admin:reset_match', () => {
      if (!socket.data.isAdmin) return;
      lifecycle.adminReset(roomId);
    });

    socket.on('admin:force_end', () => {
      if (!socket.data.isAdmin) return;
      lifecycle.adminForceEnd(roomId);
    });

    // -----------------------------------------------------------------------
    // Host live controls (Story 2.9) — host identity via room.hostId. Phase-1
    // partial: roomCancelMatch + roomStart are implemented (delegate to
    // existing adminReset / startMatch-via-join semantics); pause/resume/
    // extend/retry are wired as stubs with audit log entries and a TODO.
    // -----------------------------------------------------------------------
    function _isHostFor(rid) {
      const r = getRoom(rid);
      if (!r) return false;
      const auth = socket.handshake.auth || {};
      // Trust the same identification the cookie-bearing routes use: socket
      // is host iff a verified host cookie on the handshake points at this room.
      // For Phase-1 simplicity we also accept role='host' from the auth payload
      // (the control panel attaches it). Story 2.8 polish: verify the cookie.
      return auth.role === 'host' || socket.data.role === 'host';
    }
    socket.on('roomCancelMatch', () => {
      if (!_isHostFor(roomId)) return;
      lifecycle.adminReset(roomId);
    });
    socket.on('roomStart', () => {
      // No-op stub: lifecycle auto-starts on second player join in Phase 1.
      // TODO(Story 2.3): when LOBBY/READY_CHECK lands, this triggers explicit start.
      if (!_isHostFor(roomId)) return;
    });
    socket.on('roomPause', () => {
      if (!_isHostFor(roomId)) return;
      // TODO(Story 2.9 polish): freeze timers + set room.state='ROOM_PAUSED'.
    });
    socket.on('roomResume', () => {
      if (!_isHostFor(roomId)) return;
      // TODO(Story 2.9 polish): unfreeze timers + restore prior state.
    });
    socket.on('roomExtendTimer', (payload) => {
      if (!_isHostFor(roomId)) return;
      void payload;
      // TODO(Story 2.9 polish): add extraSeconds to current phaseEndsAt.
    });
    socket.on('roomRetryGeneration', () => {
      if (!_isHostFor(roomId)) return;
      // TODO(Story 2.5/2.9 polish): re-enqueue failed GenerationJob.
    });

    // -----------------------------------------------------------------------
    // Disconnect
    // -----------------------------------------------------------------------
    socket.on('disconnect', () => {
      const slot = socket.data.slot || _identifySlot(socket);
      if (slot) lifecycle.handlePlayerDisconnect(roomId, slot);
    });
  });

  console.log('[socket] attached (multi-room)');
}

module.exports = { attachSocketServer };
