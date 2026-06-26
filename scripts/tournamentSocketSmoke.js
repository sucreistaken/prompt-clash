// scripts/tournamentSocketSmoke.js
// End-to-end DEMO socket smoke: real socket.io clients drive a full TOURNAMENT
// room from creation through elimination rounds to a crowned champion.
//
// Requires:
//   - Running dev server: DEMO_MODE=1 ADMIN_COOKIE_SECRET=<secret> COOKIE_SECRET=<secret> npm run dev
//   - Same secret exported for this script: DEMO_MODE=1 ADMIN_COOKIE_SECRET=<same-secret> npm run smoke:tournament-socket
//
// Usage: DEMO_MODE=1 npm run smoke:tournament-socket
//        (ADMIN_COOKIE_SECRET must match the server's value)
'use strict';

process.env.DEMO_MODE = '1';

const http = require('http');
const crypto = require('crypto');
const { io } = require('socket.io-client');

const BASE_URL = process.env.SMOKE_URL || 'http://localhost:3000';
const PATH = '/api/socket';
const N_ENTRANTS = 8;
const TOTAL_TIMEOUT_MS = 90_000; // final duel prompting waits up to promptDurationSec (default 60s)

const start = Date.now();
function log(...a) { console.log(`[+${((Date.now() - start) / 1000).toFixed(1)}s]`, ...a); }

// ---------------------------------------------------------------------------
// Admin cookie forging — mirrors lib/adminAuth.js _sign() exactly.
// Payload: { role: 'admin', exp: <future ms> }
// Token:   base64url(JSON(payload)) + '.' + HMAC-SHA256(base64url(JSON(payload)))
// ---------------------------------------------------------------------------
const ADMIN_COOKIE_SECRET = process.env.ADMIN_COOKIE_SECRET;
if (!ADMIN_COOKIE_SECRET || ADMIN_COOKIE_SECRET.length < 16) {
  console.error('FATAL: ADMIN_COOKIE_SECRET must be set and >=16 chars');
  process.exit(1);
}

function forgeAdminToken() {
  const payload = { role: 'admin', exp: Date.now() + 7 * 24 * 60 * 60 * 1000 };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto
    .createHmac('sha256', ADMIN_COOKIE_SECRET)
    .update(body)
    .digest('base64url');
  return `${body}.${mac}`;
}

// ---------------------------------------------------------------------------
// HTTP helper (Node built-in, no extra deps)
// ---------------------------------------------------------------------------
function postJson(urlStr, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const u = new URL(urlStr);
    const opts = {
      hostname: u.hostname,
      port: Number(u.port) || 3000,
      path: u.pathname + (u.search || ''),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };
    const req = http.request(opts, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch (e) { reject(new Error(`Bad JSON from server (status ${res.statusCode}): ${raw}`)); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Main smoke
// ---------------------------------------------------------------------------
(async () => {
  // ── Step 1: create TOURNAMENT room ────────────────────────────────────────
  log(`Creating TOURNAMENT room at ${BASE_URL}/api/rooms ...`);
  let createResp;
  try {
    createResp = await postJson(`${BASE_URL}/api/rooms`, { roomMode: 'TOURNAMENT' });
  } catch (e) {
    console.error('FATAL: POST /api/rooms failed:', e.message);
    console.error('Is the dev server running?  DEMO_MODE=1 npm run dev');
    process.exit(1);
  }

  if (!createResp.body?.ok) {
    console.error('FATAL: create room rejected:', JSON.stringify(createResp.body));
    process.exit(1);
  }
  const roomId = createResp.body.data.roomId;
  log(`Room created: ${roomId}`);

  // ── Step 2: connect N entrant sockets ────────────────────────────────────
  const entrantSockets = [];
  const entrantIds = [];       // entrantIds[i] = entrantId assigned by server
  const submittedForRound = []; // submittedForRound[i] = last roundIndex we submitted for

  for (let i = 0; i < N_ENTRANTS; i++) {
    entrantIds.push(null);
    submittedForRound.push(-1);
  }

  const joinPromises = Array.from({ length: N_ENTRANTS }, (_, i) =>
    new Promise((resolve, reject) => {
      const sock = io(BASE_URL, {
        path: PATH,
        auth: { role: 'player', deviceId: 'd' + i, roomId },
        transports: ['websocket']
      });
      entrantSockets.push(sock);

      // joined_as_entrant may arrive before or alongside the ack
      sock.on('joined_as_entrant', ({ entrantId }) => {
        if (!entrantIds[i]) {
          entrantIds[i] = entrantId;
          log(`Entrant ${i} joined_as_entrant: ${entrantId}`);
        }
      });

      sock.on('connect', () => {
        log(`Entrant ${i} connected, joining...`);
        sock.emit('join_game', { nickname: 'p' + i }, (ack) => {
          log(`Entrant ${i} join_game ack: ${JSON.stringify(ack)}`);
          if (!ack) { reject(new Error(`Entrant ${i}: no ack`)); return; }
          if (!ack.ok) { reject(new Error(`Entrant ${i} join failed: ${ack.reason}`)); return; }
          // ack.entrantId is also returned for TOURNAMENT rooms
          if (ack.entrantId && !entrantIds[i]) entrantIds[i] = ack.entrantId;
          resolve();
        });
      });

      sock.on('connect_error', (e) =>
        reject(new Error(`Entrant ${i} connect_error: ${e.message}`))
      );
    })
  );

  log(`Waiting for ${N_ENTRANTS} entrants to join...`);
  await Promise.all(joinPromises);
  log(`All ${N_ENTRANTS} entrants joined. IDs: ${entrantIds.join(', ')}`);

  // ── Step 3: set up state listeners (tournament_prompt + champion watch) ──
  //   Must be wired BEFORE start_tournament to catch the first ROUND_PROMPTING.

  let champFound = false;

  const donePromise = new Promise((resolve) => {
    function onState(s, idx) {
      if (champFound) return;
      const t = s && s.tournament;
      if (!t) return;

      // Emit tournament_prompt whenever a new elimination round needs prompts.
      // _awaitPrompts early-resolves once every active entrant has submitted.
      if (t.phase === 'ROUND_PROMPTING') {
        const round = t.roundIndex;
        if (submittedForRound[idx] < round) {
          submittedForRound[idx] = round;
          const text = `demo prompt round${round} entrant${idx}`;
          entrantSockets[idx].emit('tournament_prompt', { text }, (ack) => {
            if (ack) log(`Entrant ${idx} prompt ack (round ${round}): ${JSON.stringify(ack)}`);
          });
          log(`Entrant ${idx} → tournament_prompt (round ${round}): "${text}"`);
        }
      }

      // Assert: tournament complete with a champion
      if (t.phase === 'COMPLETE' && t.champion) {
        if (!champFound) {
          champFound = true;
          console.log(
            `tournamentSocketSmoke OK — champion: ${t.champion.entrantId} (${t.champion.nickname})`
          );
          resolve({ ok: true, champion: t.champion });
        }
      }
    }

    for (let i = 0; i < N_ENTRANTS; i++) {
      const idx = i;
      entrantSockets[i].on('state', (s) => onState(s, idx));
    }
  });

  // ── Step 4: connect admin socket with forged pc_admin cookie ─────────────
  const adminToken = forgeAdminToken();
  const adminSock = io(BASE_URL, {
    path: PATH,
    auth: { role: 'admin', deviceId: 'admin-smoke-' + Date.now(), roomId },
    transports: ['websocket'],
    extraHeaders: { cookie: 'pc_admin=' + adminToken }
  });

  await new Promise((resolve, reject) => {
    adminSock.on('connect', () => { log('Admin socket connected'); resolve(); });
    adminSock.on('connect_error', (e) =>
      reject(new Error(`Admin connect_error: ${e.message}`))
    );
  });

  // Best-effort: shorten timers so the final duel (silent players → timer-driven)
  // resolves faster. Requires Mongo — silently falls back if unavailable.
  await new Promise((resolve) => {
    adminSock.emit(
      'admin:update_settings',
      { promptDurationSec: 5, vsIntroDurationSec: 0, resultDurationSec: 3 },
      (ack) => {
        if (ack?.ok) {
          log('Settings updated: promptDurationSec=5, vsIntroDurationSec=0, resultDurationSec=3');
        } else {
          log(`Settings update skipped (Mongo unavailable?): ${JSON.stringify(ack)}`);
          log('Final duel prompting will use default promptDurationSec (60s) — smoke timeout is 90s');
        }
        resolve();
      }
    );
  });

  // ── Step 5: start the tournament ─────────────────────────────────────────
  adminSock.emit('start_tournament', {}, (ack) => {
    log(`start_tournament ack: ${JSON.stringify(ack)}`);
    if (ack && !ack.ok) {
      console.error('FATAL: start_tournament rejected:', ack.reason);
      process.exit(1);
    }
  });
  log('Tournament started — waiting for champion...');

  // ── Step 6: race champion vs timeout ─────────────────────────────────────
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error(`TIMEOUT: no champion within ${TOTAL_TIMEOUT_MS / 1000}s`)),
      TOTAL_TIMEOUT_MS
    )
  );

  let exitCode = 0;
  try {
    await Promise.race([donePromise, timeoutPromise]);
  } catch (e) {
    console.error(`tournamentSocketSmoke FAIL: ${e.message}`);
    exitCode = 1;
  }

  // Cleanup
  for (const s of entrantSockets) try { s.close(); } catch (_) {}
  try { adminSock.close(); } catch (_) {}
  setTimeout(() => process.exit(exitCode), 300);
})().catch((e) => {
  console.error('tournamentSocketSmoke UNHANDLED:', e.message || e);
  process.exit(1);
});
