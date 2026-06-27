# Tournament Mode A ("Aynı Sahne") — Backend Backbone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a server-side tournament engine that takes N players through topic-based elimination rounds (≈100→24→6→2) and hands the final 2 off to the **untouched** existing 1v1 duel engine to crown a champion — all verifiable headlessly via a new smoke script, before any tournament UI is built.

**Architecture:** Tournament lives in a **new, isolated module tree** `lib/game/tournament/*` that owns a per-room tournament sub-state (a roster of entrants + a round schedule). It reuses existing infra (`lib/image.js` wave generation, `lib/async.js` timeout/retry, a new multi-image AI scorer) and, when 2 entrants remain, **delegates to the existing `matchLifecycle` duel flow unchanged** (the plan's hard constraint: "mevcut 1v1 motoru dokunulmaz"). A `roomMode: 'DUEL' | 'TOURNAMENT'` flag selects behavior; `DUEL` is the default and is byte-for-byte the current product.

**Tech Stack:** Node ≥20 CommonJS backend (`lib/**`, `models/*`, `scripts/*` are `.js`, `require()`-loaded, NO transpile), socket.io 4.7.5, mongoose 8 (optional), zod **v4**, Gemini for AI scoring. Frontend types in `types/game.ts` (TS). Verification = `npm run typecheck` + new `scripts/tournamentSmoke.js` (socket.io-client harness, `DEMO_MODE=1`) + existing `npm run smoke` for regression. **No unit-test framework exists — do not add one.**

## Global Constraints

- **Backend files are CommonJS `.js`** (`require`/`module.exports`). Never author a `require()`-loaded module as `.ts`. (project-context)
- **1v1 duel engine is untouched.** No edits to the DUEL code paths in `matchLifecycle.js` beyond *additive* branch-guards that are skipped when `roomMode === 'DUEL'`. The final duel reuses the existing `startMatch`/`PROMPTING…RESULT` flow verbatim.
- **MUST #2 — roomId first:** every new public lifecycle/state function takes `roomId` as its first argument; read state via `getRoom(roomId)`, never a global.
- **MUST #1 — broadcast after mutation:** every tournament state mutation is immediately followed by `broadcastState(roomId)` (`lib/socket/broadcasts.js`).
- **MUST #5 — scoped logs:** new log lines carry `[tournament:${shortRoomId(roomId)}]` prefix.
- **Epoch guards (G-7/G-9):** any async tournament work captures `epoch = getOperationEpoch(roomId)` before the await and re-checks `isCurrentEpoch(roomId, epoch)` on resolve; stale results are dropped.
- **Cost is real money.** Each entrant generates exactly **once per round** (wave-throttled, no bursts). Never abort an in-flight generation. Use `DEMO_MODE=1` for all dev/smoke.
- **Mongo is optional** — never a hard dependency in a hot path; degrade gracefully.
- **Frozen enums:** new enums declared with `Object.freeze({...})` (mirror `PHASES`, `ERROR_CODES`).
- **i18n dual-write:** any user-facing copy added to `i18n/dict.ts` goes in **both** `tr` and `en`; run `npm run i18n:check`. (This plan is backend-only and should add **no** copy; if a key sneaks in, dual-write it.)
- **Scope:** This plan is the **Mode A backend backbone only.** Mode B (groups + wildcard), admin bracket UI, stage wall/duel/champion screens, and mobile/desktop jury UI are **separate downstream plans** that consume the interfaces produced here.

---

## File Structure

- `lib/game/tournament/state.js` (new) — tournament sub-state factory + roster mutators (frozen `TOURNAMENT_PHASES`, entrant shape, round schedule).
- `lib/game/tournament/schedule.js` (new) — pure function: derive the round-reduction schedule from N (the ~1/4 rule down to 2).
- `lib/game/tournament/scoreRoster.js` (new) — multi-image AI scorer abstraction: rank K images against one reference topic into an ordered score list. DEMO_MODE returns deterministic fakes; real path wraps Gemini (the **iterative/risky** piece — may need batching).
- `lib/game/tournament/lifecycle.js` (new) — the round engine: run a round (topic → collect prompts → wave-generate → score → cut), advance rounds, and trigger the final-duel handoff.
- `lib/game/state.js` (modify) — add `roomMode` + a `tournament` sub-state slot to `createRoomState`; reset hooks.
- `models/Room.js` (modify) — add `roomMode` to `RoomSettingsSchema`.
- `app/api/rooms/route.ts` (modify) — add `roomMode` to `CreateRoomBody` zod.
- `types/game.ts` (modify) — add `RoomMode` type + optional tournament snapshot fields.
- `scripts/tournamentSmoke.js` (new) — N simulated players run a full DEMO_MODE tournament to a champion; the plan's primary integration gate.

---

### Task 1: Room mode flag (additive, zero behavior change)

Introduce `roomMode` end-to-end defaulting to `DUEL`. Nothing branches on it yet — this task only proves the flag threads through create → state → snapshot with **no regression** to the existing duel game.

**Files:**
- Modify: `models/Room.js:21-38` (RoomSettingsSchema)
- Modify: `app/api/rooms/route.ts:38-49` (CreateRoomBody)
- Modify: `lib/game/state.js:42-110` (createRoomState)
- Modify: `types/game.ts:13-15` and `:64-68` (RoomMode type + snapshot field)

**Interfaces:**
- Produces: `room.roomMode: 'DUEL' | 'TOURNAMENT'` on every RoomState; `StateSnapshot.roomMode?: RoomMode`; zod/Mongo accept `roomMode`.

- [ ] **Step 1: Add `roomMode` to the Mongo settings schema**

In `models/Room.js`, inside `RoomSettingsSchema` (after `audienceVotingEnabled`):

```js
    audienceVotingEnabled: { type: Boolean, default: false }, // D-1: opt-in
    roomMode: { type: String, enum: ['DUEL', 'TOURNAMENT'], default: 'DUEL' }
```

- [ ] **Step 2: Add `roomMode` to the create-room zod body**

In `app/api/rooms/route.ts`, inside `CreateRoomBody`:

```ts
  audienceVotingEnabled: z.boolean().default(false),
  roomMode: z.enum(['DUEL', 'TOURNAMENT']).default('DUEL')
```

- [ ] **Step 3: Thread `roomMode` into the RoomState factory**

In `lib/game/state.js` `createRoomState`, alongside the other `settings ? … : default` reads (near line 64):

```js
    roomMode: (settings && settings.roomMode) === 'TOURNAMENT' ? 'TOURNAMENT' : 'DUEL',
```

- [ ] **Step 4: Add the type**

In `types/game.ts` after `WinnerMode`:

```ts
export type RoomMode = 'DUEL' | 'TOURNAMENT';
```

and inside `StateSnapshot` (with the other optional multi-room fields):

```ts
  roomMode?: RoomMode;
```

(If `buildSnapshot` in `lib/socket/broadcasts.js` allowlists fields explicitly, add `roomMode: room.roomMode` there; if it spreads room fields, no change needed — verify by reading the snapshot builder.)

- [ ] **Step 5: Typecheck + regression smoke**

```bash
npm run typecheck
# In a second terminal: DEMO_MODE=1 npm run dev   (wait for "ready")
npm run smoke
```

Expected: `typecheck` clean; `matchSmoke` still asserts a winner and `multiRoomSmoke` still passes — proving the flag is inert for DUEL.

- [ ] **Step 6: Commit**

```bash
git add models/Room.js app/api/rooms/route.ts lib/game/state.js types/game.ts
git commit -m "feat(tournament): add inert roomMode flag (DUEL default)"
```

---

### Task 2: Round schedule (pure function)

A standalone, dependency-free function that converts an entrant count into the ordered list of round target-sizes ending at 2, using the plan's "~her tur 1/4 kalır" rule. Pure → directly assertable in the smoke harness without a server.

**Files:**
- Create: `lib/game/tournament/schedule.js`

**Interfaces:**
- Produces: `buildSchedule(n: number) -> number[]` — the sequence of survivor counts after each cut, ending in `2`. E.g. `buildSchedule(100) -> [25, 6, 2]` (exact 1/4 of 100 = 25; the brainstorm's "~24" was approximate); `buildSchedule(8) -> [2]`; `buildSchedule(2) -> []` (already final); `buildSchedule(3) -> [2]`.

- [ ] **Step 1: Implement the schedule**

```js
// lib/game/tournament/schedule.js
// Pure: survivor counts after each cut, applying ~1/4 survival down to 2.
// The final entry is always 2 (the duel handoff size). n<=2 → no rounds.
'use strict';

function buildSchedule(n) {
  const total = Math.floor(Number(n) || 0);
  if (total <= 2) return [];
  const out = [];
  let cur = total;
  while (cur > 2) {
    let next = Math.max(2, Math.round(cur / 4));
    if (next >= cur) next = cur - 1; // guarantee strict shrink
    out.push(next);
    cur = next;
  }
  return out;
}

module.exports = { buildSchedule };
```

- [ ] **Step 2: Assert it in the smoke harness (created in Task 5) — placeholder check now**

Run an inline node check:

```bash
node -e "const {buildSchedule}=require('./lib/game/tournament/schedule.js'); const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b); console.log(eq(buildSchedule(100),[25,6,2]), eq(buildSchedule(8),[2]), eq(buildSchedule(2),[]), buildSchedule(3).at(-1)===2);"
```

Expected: `true true true true`

- [ ] **Step 3: Commit**

```bash
git add lib/game/tournament/schedule.js
git commit -m "feat(tournament): round-reduction schedule (1/4 rule to final 2)"
```

---

### Task 3: Tournament sub-state + roster

A per-room tournament state object and roster mutators, plus join-flow integration: when `roomMode === 'TOURNAMENT'`, a joining socket is appended to the roster instead of filling duel slot A/B.

**Files:**
- Create: `lib/game/tournament/state.js`
- Modify: `lib/game/state.js` (init `room.tournament = null` in factory; null it in `resetMatch`)
- Modify: the join handler (read `lib/game/matchLifecycle.js:125-147` `tryJoinAsPlayer` and `lib/socket/server.js` join wiring first; add a `roomMode` guard that routes to `addEntrant` — do **not** alter the DUEL branch)

**Interfaces:**
- Consumes: `room.roomMode` (Task 1).
- Produces, from `lib/game/tournament/state.js`:
  - `createTournamentState({ entrants?: [] }) -> TournamentState` where `TournamentState = { phase, roundIndex, schedule, activeIds: string[], entrants: Record<id, Entrant>, topic: {prompt, promptTr} | null, champion: id | null }` and `Entrant = { entrantId, deviceId, nickname, eliminated: boolean, lastScore: number | null, lastImageUrl: string | null, lastPrompt: string }`.
  - `TOURNAMENT_PHASES` (frozen): `LOBBY, ROUND_PROMPTING, ROUND_GENERATING, ROUND_SCORING, ROUND_CUT, FINAL_DUEL, COMPLETE`.
  - `addEntrant(room, { deviceId, nickname }) -> entrantId` (idempotent on deviceId; reattach returns existing id).
  - `activeEntrants(room) -> Entrant[]`.

- [ ] **Step 1: Implement tournament state factory + roster mutators**

```js
// lib/game/tournament/state.js
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

function createTournamentState({ entrants = [] } = {}) {
  const map = {};
  for (const e of entrants) map[e.entrantId] = e;
  return {
    phase: TOURNAMENT_PHASES.LOBBY,
    roundIndex: 0,
    schedule: [],
    activeIds: entrants.map((e) => e.entrantId),
    entrants: map,
    topic: null,
    champion: null
  };
}

let _seq = 0;
function _newEntrantId(deviceId) {
  _seq += 1;
  return `e_${(deviceId || 'anon').slice(0, 6)}_${_seq.toString(36)}`;
}

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
```

- [ ] **Step 2: Wire the sub-state slot into RoomState**

In `lib/game/state.js` `createRoomState`, add to the room object (near `genErrors`):

```js
    genErrors: { A: false, B: false },
    tournament: null // populated lazily when a TOURNAMENT room enters its lobby
```

and in `resetMatch` (after `room.genErrors = …`):

```js
  room.genErrors = { A: false, B: false };
  if (room.roomMode === 'TOURNAMENT') room.tournament = null;
```

- [ ] **Step 3: Route joins by mode (additive guard only)**

Read the current join path first (`lib/game/matchLifecycle.js` `tryJoinAsPlayer` + its socket caller in `lib/socket/server.js`). Add, at the top of the join handler, a guard that leaves the DUEL path **exactly as-is**:

```js
// inside the join handler, before the existing DUEL slot logic
if (room.roomMode === 'TOURNAMENT') {
  if (!room.tournament) room.tournament = createTournamentState({});
  const entrantId = addEntrant(room, { deviceId, nickname });
  broadcastState(roomId); // MUST #1
  return { ok: true, entrantId };
}
// …existing DUEL slot-A/B logic untouched below…
```

Import at top of the file: `const { createTournamentState, addEntrant } = require('./tournament/state.js');`

- [ ] **Step 4: Typecheck + regression smoke (DUEL still intact)**

```bash
npm run typecheck
npm run smoke   # dev server running with DEMO_MODE=1
```

Expected: clean + both smokes pass (TOURNAMENT branch is not exercised by existing smokes, so DUEL is provably unaffected).

- [ ] **Step 5: Commit**

```bash
git add lib/game/tournament/state.js lib/game/state.js lib/game/matchLifecycle.js lib/socket/server.js
git commit -m "feat(tournament): per-room tournament state + roster join routing"
```

---

### Task 4: Roster scorer (DEMO-first, Gemini real path flagged)

A function that scores the active roster for the current topic into an ordered list. The DEMO path is deterministic (enables the whole smoke); the real Gemini path is the **iterative/risky** piece and is built behind the same interface so the engine never changes.

**Files:**
- Create: `lib/game/tournament/scoreRoster.js`
- Reference (do not edit): `lib/gemini/score.js` (`scoreVsReference(refUrl,aUrl,bUrl) -> {a,b,winner,reasoning}` is **pairwise** — insufficient for N; this task introduces the N-way scorer).

**Interfaces:**
- Consumes: `activeEntrants(room)` (Task 3), each with `lastImageUrl` + `lastPrompt`; `room.tournament.topic`.
- Produces: `scoreRoster(roomId, referenceImageUrl, entrants) -> Promise<Array<{ entrantId, score }>>` sorted **descending** by score, length === `entrants.length`, scores unique enough that ties are rare (mirror the duel "no exact tie" convention).

- [ ] **Step 1: Implement DEMO path + real-path seam**

```js
// lib/game/tournament/scoreRoster.js
'use strict';

// N-way roster scorer. DEMO_MODE returns deterministic, near-unique fakes so
// the elimination engine is fully testable headlessly. The real path wraps
// Gemini; scoring 100 images is the cost/accuracy-sensitive part and may need
// chunked calls + merge — keep that ITERATION behind this stable interface.
async function scoreRoster(roomId, referenceImageUrl, entrants) {
  if (process.env.DEMO_MODE === '1') {
    return entrants
      .map((e, i) => ({
        entrantId: e.entrantId,
        // deterministic spread 40..98, decreasing by index, jittered by id hash
        score: 98 - i - (_hash(e.entrantId) % 5)
      }))
      .sort((x, y) => y.score - x.score);
  }
  // REAL PATH (iterate here): batch entrants, call the Gemini multi-image
  // ranker against referenceImageUrl, merge batch scores into one ordered list.
  // Until implemented, fail loudly rather than silently mis-ranking.
  throw new Error('scoreRoster: real Gemini path not yet implemented (use DEMO_MODE=1)');
}

function _hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

module.exports = { scoreRoster };
```

- [ ] **Step 2: Verify DEMO ordering**

```bash
DEMO_MODE=1 node -e "const {scoreRoster}=require('./lib/game/tournament/scoreRoster.js'); scoreRoster('r',null,[{entrantId:'a'},{entrantId:'b'},{entrantId:'c'}]).then(r=>{const desc=r.every((x,i)=>i===0||r[i-1].score>=x.score); console.log('len',r.length===3,'desc',desc);});"
```

Expected: `len true desc true`

- [ ] **Step 3: Commit**

```bash
git add lib/game/tournament/scoreRoster.js
git commit -m "feat(tournament): N-way roster scorer (DEMO path + Gemini seam)"
```

---

### Task 5: Round engine + final-duel handoff + smoke

The backbone: drive a TOURNAMENT room from lobby through rounds to a champion. Each round sets a topic, collects prompts from active entrants, wave-generates one image each (reusing `lib/image.js` + `lib/async.js`), scores via `scoreRoster`, cuts to the next scheduled size, and when 2 remain, **populates duel slots A/B and invokes the existing `startMatch` flow unchanged**, capturing its `winner` as champion.

**Files:**
- Create: `lib/game/tournament/lifecycle.js`
- Create: `scripts/tournamentSmoke.js`
- Modify (additive, read first): `lib/game/matchLifecycle.js` `finalizeMatch` — when `room.roomMode === 'TOURNAMENT'` and the tournament is in `FINAL_DUEL`, after recording the duel winner, call `tournament.onFinalDuelResult(roomId, winnerSlot)` instead of the normal idle/rematch reset. Guard so DUEL behavior is unchanged.

**Interfaces:**
- Consumes: `buildSchedule` (T2), `createTournamentState/addEntrant/activeEntrants/TOURNAMENT_PHASES` (T3), `scoreRoster` (T4), existing `startMatch`, `setPhase`, `broadcastState`, `getOperationEpoch/isCurrentEpoch`, `lib/image.js generateImage`, `lib/async.js withTimeout/retry`.
- Produces:
  - `startTournament(roomId) -> Promise<void>` — locks the roster, sets `schedule = buildSchedule(activeCount)`, runs rounds until 2 remain, then triggers the duel.
  - `submitEntrantPrompt(roomId, entrantId, text) -> void` — records a prompt during `ROUND_PROMPTING`.
  - `onFinalDuelResult(roomId, winnerSlot) -> void` — maps the duel A/B winner back to an entrantId, sets `tournament.champion`, phase `COMPLETE`, broadcasts.

- [ ] **Step 1: Implement the round engine**

```js
// lib/game/tournament/lifecycle.js
'use strict';

const { getRoom, setPhase, getOperationEpoch, isCurrentEpoch } = require('../state.js');
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
  setPhase(roomId, 'RESULT');
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
  setPhase(roomId, 'PROMPTING');
  broadcastState(roomId);
  await _awaitPrompts(roomId, epoch);
  if (!isCurrentEpoch(roomId, epoch)) return;

  // 2) Wave generation — one image per active entrant, throttled (NO bursts).
  t.phase = TOURNAMENT_PHASES.ROUND_GENERATING;
  setPhase(roomId, 'GENERATING');
  broadcastState(roomId);
  await _waveGenerate(roomId, epoch);
  if (!isCurrentEpoch(roomId, epoch)) return;

  // 3) Score all active entrants in one ranked list.
  t.phase = TOURNAMENT_PHASES.ROUND_SCORING;
  setPhase(roomId, 'SCORING');
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
      e.lastImageUrl = await withTimeout(generateImage(e.lastPrompt || ''), limit, 'tgen');
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
  const [idA, idB] = t.activeIds;
  t.finalIds = [idA, idB];
  t.phase = TOURNAMENT_PHASES.FINAL_DUEL;
  // Populate duel slots from finalists, then invoke the standard duel start.
  const { makePlayer } = require('../state.js');
  room.players = {
    A: makePlayer({ socketId: null, deviceId: t.entrants[idA].deviceId, nickname: t.entrants[idA].nickname }),
    B: makePlayer({ socketId: null, deviceId: t.entrants[idB].deviceId, nickname: t.entrants[idB].nickname })
  };
  log(roomId, `final duel: ${t.entrants[idA].nickname} vs ${t.entrants[idB].nickname}`);
  const { startMatch } = require('../matchLifecycle.js');
  await startMatch(roomId); // existing flow → finalizeMatch → onFinalDuelResult
}

module.exports = { startTournament, submitEntrantPrompt, onFinalDuelResult };
```

> Note: confirm `lib/image.js` exports a callable `generateImage(prompt)` (the selector). If it exports `{ generateImage }`, adjust the require. Confirm `lib/async.js` exports `withTimeout` + `timeoutMs` (project-context says it does). Read both before Step 1.

- [ ] **Step 2: Add the additive handoff hook in `finalizeMatch`**

Read `finalizeMatch` in `lib/game/matchLifecycle.js` (around line 583-642). At the point where it would normally go IDLE/rematch, add a guarded branch **above** the existing logic:

```js
// inside finalizeMatch, after room.winner is settled and broadcast
if (room.roomMode === 'TOURNAMENT' && room.tournament &&
    room.tournament.phase === 'FINAL_DUEL') {
  const winnerSlot = room.winner === 'TIE' ? 'A' : room.winner; // tie → first finalist
  require('./tournament/lifecycle.js').onFinalDuelResult(roomId, winnerSlot);
  return; // skip duel rematch/idle path
}
// …existing DUEL finalize logic unchanged…
```

- [ ] **Step 3: Write the smoke harness**

```js
// scripts/tournamentSmoke.js
// DEMO_MODE end-to-end: N simulated entrants → champion. No real images/AI.
'use strict';
const assert = require('assert');
const { buildSchedule } = require('../lib/game/tournament/schedule.js');

// Unit-level invariants (pure, no server needed):
assert.deepStrictEqual(buildSchedule(100), [25, 6, 2], 'schedule 100');
assert.deepStrictEqual(buildSchedule(8), [2], 'schedule 8');
assert.deepStrictEqual(buildSchedule(2), [], 'schedule 2');

// Engine-level invariant via direct registry drive (no sockets — backbone):
process.env.DEMO_MODE = '1';
const reg = require('../lib/game/roomRegistry.js');
const { createTournamentState, addEntrant } = require('../lib/game/tournament/state.js');
const { startTournament } = require('../lib/game/tournament/lifecycle.js');

(async () => {
  const { roomId } = reg.createRoom({ hostId: 'h', settings: { roomMode: 'TOURNAMENT' } });
  const room = reg.getRoom(roomId);
  room.roomMode = 'TOURNAMENT';
  room.tournament = createTournamentState({});
  // The final duel reuses the real duel engine, whose finalists (socketId:null)
  // never submit prompts — so it advances on phase timers. Shorten them so the
  // smoke doesn't sit through the default 60s PROMPTING window.
  room.vsIntroDurationSec = 0;
  room.promptDurationSec = 1;
  room.resultDurationSec = 1;
  for (let i = 0; i < 16; i++) addEntrant(room, { deviceId: 'd' + i, nickname: 'p' + i });
  await startTournament(roomId);
  // startTournament runs the elimination rounds synchronously (DEMO), then kicks
  // off the final duel which completes ASYNCHRONOUSLY via timers + DEMO scoring.
  // Poll for the champion rather than asserting immediately.
  const deadline = Date.now() + 30000;
  while (!reg.getRoom(roomId).tournament.champion && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200));
  }
  const t = reg.getRoom(roomId).tournament;
  assert.ok(t.champion, 'a champion was crowned within 30s');
  assert.strictEqual(t.phase, 'COMPLETE', 'tournament complete');
  console.log('tournamentSmoke OK — champion:', t.champion);
  process.exit(0);
})().catch((e) => { console.error('tournamentSmoke FAIL:', e); process.exit(1); });
```

> Confirm `createRoom`'s signature/return shape against `lib/game/roomRegistry.js` before running; adjust the bootstrap to match (it may need a `roomCode`).

- [ ] **Step 4: Add the npm script**

In `package.json` scripts:

```json
    "smoke:tournament": "node scripts/tournamentSmoke.js",
```

- [ ] **Step 5: Run the backbone gate**

```bash
npm run typecheck
DEMO_MODE=1 npm run smoke:tournament
npm run smoke   # regression: DUEL still green
```

Expected: typecheck clean; `tournamentSmoke OK — champion: e_…`; existing duel smokes still pass.

- [ ] **Step 6: Commit**

```bash
git add lib/game/tournament/lifecycle.js scripts/tournamentSmoke.js package.json lib/game/matchLifecycle.js
git commit -m "feat(tournament): Mode A round engine + final-duel handoff + smoke"
```

---

## Self-Review

**Spec coverage (plan-A-B-akis.md → tasks):**
- "Turnuva = yeni oda modu, 1v1 dokunulmaz" → Task 1 flag + Task 5 untouched-duel handoff. ✓
- "Parametreler N'den türetilir (~1/4 kalır, final 2)" → Task 2 `buildSchedule` (e.g. 100→[25,6,2]; "~24" in the brainstorm was approximate, exact 1/4 = 25). ✓
- "Tur: tek konu, herkes yazar, dalga dalga üretim, robot tek listede puanlar, top-K geçer" → Task 5 `_runRound` + Task 4 `scoreRoster`. ✓
- "Son 2 → mevcut 1v1 motoru → kazanan" → Task 5 `_startFinalDuel` + `onFinalDuelResult`. ✓
- "Dalga dalga üret (burst/402 yok)" → Task 5 `_waveGenerate` sequential loop. ✓
- **Deferred (explicitly out of this plan, flagged):** Mode B groups+wildcard; real Gemini N-way scoring (Task 4 seam); real timed PROMPTING window + topic engine (Task 5 `_awaitPrompts` placeholder); tiebreak `TIEBREAK_VOTE`; all UI (admin bracket, stage wall/duel/champion, mobile jury); cost budget caps. These become separate plans.

**Placeholder scan:** `_awaitPrompts` resolves immediately and `scoreRoster` real path throws — both are **intentional, labeled seams** for the backbone (smoke runs DEMO), not silent TODOs. Every code step contains runnable code.

**Type consistency:** `roomMode: 'DUEL' | 'TOURNAMENT'` identical across Mongo enum / zod / factory / type. `entrantId` shape consistent across `state.js`, `scoreRoster.js`, `lifecycle.js`. `onFinalDuelResult(roomId, winnerSlot)` name matches its call site in `finalizeMatch`. `finalIds` set in `_startFinalDuel`, read in `onFinalDuelResult`.

**Known verification-before-coding checks the implementer MUST do first (don't assume):**
1. `lib/image.js` export shape (`generateImage` vs `{ generateImage }`).
2. `lib/async.js` exports `withTimeout` + `timeoutMs`.
3. `lib/game/roomRegistry.js` `createRoom` signature + return + whether `shortRoomId` is exported there.
4. `lib/socket/broadcasts.js` `buildSnapshot` — does it allowlist fields (needs `roomMode`/tournament added) or spread?
5. The exact join handler location/signature in `lib/socket/server.js` ↔ `matchLifecycle.tryJoinAsPlayer`.
