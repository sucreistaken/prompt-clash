# Tournament Mode A — Full Completion (Backend + UI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The controller scouts exact call sites/line numbers before each task (the duel UI files are large; locate by responsibility, mirror existing patterns).

**Goal:** Make Tournament **Mode A** a fully playable, reachable feature end-to-end — a host creates a TOURNAMENT room, players QR-join as entrants, the host starts it, players write prompts each round, the engine eliminates down to 2, the existing duel engine runs the final, and a champion is crowned — with admin, stage, and phone UIs — all verifiable in **DEMO ($0)** and a real browser via Playwright.

**Architecture:** Build on the existing tournament backbone (`lib/game/tournament/*`, already DEMO-verified to crown a champion at N=100). Add the missing **wiring**: socket events to start a tournament and submit round prompts; a real timed PROMPTING window; a per-round topic from the existing target engine; a `tournament` block in the room snapshot. Then add **UI surfaces** that the live app currently lacks, routed by `snapshot.roomMode === 'TOURNAMENT'`, built against the finished mockup `mockups/tournament-flow-v3.html` and reusing the duel design system (`components/common/`, `components/stage/atmosphere.tsx`). The 1v1 duel engine and its UI stay **untouched** (the tournament final delegates to it unchanged).

**Tech Stack:** Node ≥20 CommonJS backend (`lib/**`, `models/*`, `scripts/*` are `.js`, require()-loaded, NO transpile), Next 14 App Router (TS/TSX frontend), socket.io 4.7.5, zod **v4**, framer-motion 11, tailwind 3, Gemini (real AI, **gated**). Frontend copy via `i18n/dict.ts` (`useI18n().t`), TR+EN parity-gated.

## Global Constraints

- **Backend files are CommonJS `.js`** (`require`/`module.exports`); frontend is TS/TSX with `@/` alias. Never author a require()'d module as `.ts`.
- **Duel engine untouched.** No behavioral change to DUEL code paths; tournament additions are guarded by `roomMode === 'TOURNAMENT'` and skipped for DUEL. The final duel reuses `startMatch` verbatim.
- **MUST #1** broadcast after every state mutation (`broadcastState(roomId)`); **MUST #2** roomId-first; **MUST #5** logs `[tournament:${shortRoomId(roomId)}]`. **Epoch guards** on every async (`getOperationEpoch`/`isCurrentEpoch`).
- **Sockets:** every new socket event is rate-limited via `lib/rateLimit.js` (`_allow(socket, event, {limit, windowMs})`), reuses the handshake `auth.roomId`/`auth.role`/`deviceId`, and the admin-only events check the signed admin cookie identity already on the handshake (never trust client-claimed role).
- **COST = REAL MONEY, hard rule:** all development and testing run with `DEMO_MODE=1` (fake images + fake scores, $0). The real Gemini scoring path (`scoreRoster`) and real image generation are **built but never auto-invoked** by an implementer — they only run when the user sets real API keys and tests a small room themselves. No task may run a non-DEMO tournament. Image generation is wave-throttled (sequential, no bursts); never abort an in-flight generation.
- **i18n dual-write:** every new user-facing string added to BOTH `tr` and `en` blocks of `i18n/dict.ts` in the same edit; run `npm run i18n:check` (must report equal key counts).
- **Frozen enums** via `Object.freeze`. Stage boards are fixed `STAGE_W=1920 × STAGE_H=1080` absolute layouts scaled by `StageScaler`. Reuse `components/common/` chrome; never reintroduce removed components (`BrandFrame`, `StatusIndicator`, `RoomCode`, `ShareActions`). No `grid-template-areas` inside inline `<style>` JSX (hydration trap).
- **Mongo optional** — never a hard dependency in a hot path.
- **Verification gates (no unit-test framework exists — do not add one):** `npm run typecheck` · `npm run i18n:check` · a new DEMO socket smoke `scripts/tournamentSocketSmoke.js` · `npm run smoke` (DUEL regression) · the preview routes (`/preview/...`) · and Playwright browser checks against a `DEMO_MODE=1` dev server (Chrome is installed at `/Applications/Google Chrome.app`).

## Milestones

- **M1 — Backend wiring (reachable & driveable):** start event, real prompt window, per-round topic, tournament snapshot block, submit event. End state: a DEMO tournament runs end-to-end driven by **real socket clients** (new socket smoke), not just the registry.
- **M2 — Create-room mode toggle:** host can create a TOURNAMENT room from the UI.
- **M3 — Phone (player) screens:** join/lobby → write prompt → passed/eliminated → final vote. Players can actually play on a phone.
- **M4 — Stage screens:** KALAN counter + shrinking wall → final duel → champion (per v3 mockup).
- **M5 — Admin control + bracket:** start button + live bracket (per v3 mockup).
- **M6 — Polish + E2E + flagged follow-ons:** i18n sweep, Playwright DEMO E2E, then **separate** follow-on epics (real Gemini `scoreRoster`, Mode B groups+wildcard, Mongo persistence, cost-budget caps) captured at the end.

Each milestone is independently DEMO-testable. M1–M3 deliver a minimally playable tournament; M4–M5 complete the surfaces; M6 polishes and verifies.

---

## File Structure

**Backend (modify/create):**
- `lib/game/tournament/lifecycle.js` (modify) — real `_awaitPrompts` timed window; per-round topic via target engine; `submitEntrantPrompt` already exists.
- `lib/game/tournament/snapshot.js` (create) — `tournamentSnapshot(room)` → the `tournament` block for the room snapshot (pure, role-light).
- `lib/socket/broadcasts.js` (modify) — splice `tournament: tournamentSnapshot(room)` into `buildSnapshot` when `room.roomMode === 'TOURNAMENT'`.
- `lib/socket/server.js` (modify) — register `start_tournament` (admin) and `tournament_prompt` (entrant) socket events; store `socket.data.entrantId` on TOURNAMENT join.
- `lib/game/tournament/topic.js` (create) — `nextTopic(room)` → `{prompt, promptTr, category, difficulty}` reusing the duel target engine; DEMO returns a fixed fun topic.
- `types/game.ts` (modify) — `TournamentSnapshot` type + `tournament?` on `StateSnapshot`.
- `scripts/tournamentSocketSmoke.js` (create) — N socket.io-client entrants + admin start → champion, DEMO.

**Frontend (create/modify):**
- `app/create-room/CreateRoomFormClient.tsx` (modify) — room-mode toggle (DUEL/TOURNAMENT) → `roomMode` in POST body.
- `components/client/useGameState.tsx` / `hooks/useRoomState.ts` (modify) — expose `tournament` + `myEntrant` (resolved by deviceId).
- `components/client/TournamentMobileShell.tsx` (create) — routes phone tournament screens by tournament phase + my entrant status.
- `components/client/tournament/*.tsx` (create) — `TJoin`, `TPrompt`, `TPassed`, `TEliminated`, `TFinalVote` phone screens.
- `components/stage/TournamentStage.tsx` (create) + `components/stage/tournament/*` — `TStageCounter` (KALAN+wall), `TStageDuel` (reuse duel duel-card), `TStageChampion`.
- `components/client/MobileShell.tsx` & `components/stage/StageShell` (modify) — branch to tournament shells when `roomMode === 'TOURNAMENT'`.
- `components/admin/TournamentControl.tsx` (create) + `components/admin/TournamentBracket.tsx` (create) — start button + bracket; mounted in `app/admin`.
- `app/preview/...` (modify) — add tournament phase fixtures so screens render without a live socket.
- `i18n/dict.ts` (modify) — all new copy, TR+EN.

---

## M1 — Backend wiring

### Task 1: Per-round topic engine

**Files:** Create `lib/game/tournament/topic.js`. Reference (read first, do not edit): `lib/game/targetPrompt.js` (the duel's target/category/difficulty source — find its exported generator, e.g. `pickTarget`/`ensureTargetImage` and `categoryLabel`/`difficultyLabel`).

**Interfaces:**
- Produces: `async nextTopic(room) -> { prompt, promptTr, category, difficulty }`. DEMO returns a fixed absurd topic. Real path reuses the duel target engine (no new AI cost beyond what a duel round already spends).

- [ ] **Step 1:** Read `lib/game/targetPrompt.js`; identify the function that yields `{prompt, promptTr, category, difficulty}` (or the closest), and how DEMO is handled there.
- [ ] **Step 2:** Implement `nextTopic`:

```js
// lib/game/tournament/topic.js
'use strict';
const target = require('../targetPrompt.js'); // adapt to the actual export name found in Step 1

async function nextTopic(room) {
  if (process.env.DEMO_MODE === '1') {
    return { prompt: 'dancing toaster', promptTr: 'dans eden tost makinesi', category: 'absurd', difficulty: 'easy' };
  }
  // Reuse the duel target engine. Map its return shape to ours.
  const t = await target./*<found fn>*/(room);
  return { prompt: t.prompt, promptTr: t.promptTr, category: t.category, difficulty: t.difficulty };
}

module.exports = { nextTopic };
```

- [ ] **Step 3:** Verify DEMO inline: `DEMO_MODE=1 node -e "require('./lib/game/tournament/topic.js').nextTopic({}).then(t=>console.log(t.promptTr==='dans eden tost makinesi'))"` → `true`.
- [ ] **Step 4:** Commit `feat(tournament): per-round topic engine (DEMO + duel-target reuse)`.

### Task 2: Real timed PROMPTING window

**Files:** Modify `lib/game/tournament/lifecycle.js` — replace the no-op `_awaitPrompts(roomId)` with a real window; set the round topic via `nextTopic`.

**Interfaces:**
- Consumes: `nextTopic` (T1); existing `submitEntrantPrompt(roomId, entrantId, text)`; `room.promptDurationSec`.
- Produces: `_awaitPrompts(roomId, epoch) -> Promise` that resolves when all active entrants have a non-empty `lastPrompt` OR `promptDurationSec` elapses (whichever first); stores a resolver on `room.tournament._promptResolve` so the socket `tournament_prompt` handler can early-resolve.

- [ ] **Step 1:** In `_runRound`, set `t.topic = await nextTopic(room)` (replace the hardcoded placeholder) and write `room.targetPrompt`/`room.targetPromptTr`/`room.roundCategory`/`room.roundDifficulty` from it so existing snapshot fields render. Re-check epoch after the await.
- [ ] **Step 2:** Implement the real window:

```js
function _awaitPrompts(roomId, epoch) {
  const room = getRoom(roomId);
  const t = room.tournament;
  const ms = (room.promptDurationSec || 30) * 1000;
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (done) return; done = true; clearTimeout(timer); t._promptResolve = null; resolve(); };
    t._promptResolve = () => {
      if (!isCurrentEpoch(roomId, epoch)) return finish();
      const active = activeEntrants(getRoom(roomId));
      if (active.every((e) => (e.lastPrompt || '').trim().length > 0)) finish();
    };
    const timer = setTimeout(finish, ms);
  });
}
```

- [ ] **Step 3:** `setPhase(roomId, PHASES.PROMPTING, ms)` so `phaseEndsAt` drives the client countdown; `broadcastState(roomId)` before awaiting (MUST #1). DEMO: keep the window short via the smoke setting `promptDurationSec`.
- [ ] **Step 4:** Verify the engine still completes via the existing `DEMO_MODE=1 npm run smoke:tournament` (it sets `promptDurationSec=1`; the window resolves on the 1s timer). Expected: champion crowned.
- [ ] **Step 5:** Commit `feat(tournament): real timed round prompting window + per-round topic`.

### Task 3: Tournament snapshot block

**Files:** Create `lib/game/tournament/snapshot.js`; modify `lib/socket/broadcasts.js`; modify `types/game.ts`.

**Interfaces:**
- Produces: `tournamentSnapshot(room) -> TournamentSnapshot | null` where
  `TournamentSnapshot = { phase, roundIndex, roundCount, activeCount, totalCount, topic: {promptTr}|null, champion: {entrantId, nickname}|null, finalists: [{entrantId,nickname}]|null, roster: [{entrantId, nickname, eliminated, lastScore}] }`.
- `StateSnapshot.tournament?: TournamentSnapshot`.

- [ ] **Step 1:** Implement `tournamentSnapshot(room)`:

```js
// lib/game/tournament/snapshot.js
'use strict';
function tournamentSnapshot(room) {
  const t = room.tournament;
  if (!t) return null;
  const ents = Object.values(t.entrants);
  const byId = (id) => (id && t.entrants[id] ? { entrantId: id, nickname: t.entrants[id].nickname } : null);
  return {
    phase: t.phase,
    roundIndex: t.roundIndex,
    roundCount: (t.schedule || []).length,
    activeCount: t.activeIds.length,
    totalCount: ents.length,
    topic: t.topic ? { promptTr: t.topic.promptTr } : null,
    champion: byId(t.champion),
    finalists: t.finalIds ? t.finalIds.map(byId).filter(Boolean) : null,
    roster: ents.map((e) => ({ entrantId: e.entrantId, nickname: e.nickname, eliminated: e.eliminated, lastScore: e.lastScore }))
  };
}
module.exports = { tournamentSnapshot };
```

- [ ] **Step 2:** In `lib/socket/broadcasts.js` `buildSnapshot`, after `roomMode: room.roomMode,` add: `tournament: room.roomMode === 'TOURNAMENT' ? require('../game/tournament/snapshot.js').tournamentSnapshot(room) : null,` (lazy require keeps the cycle clean).
- [ ] **Step 3:** Add the `TournamentSnapshot` type + `tournament?: TournamentSnapshot | null` to `StateSnapshot` in `types/game.ts`.
- [ ] **Step 4:** Verify `npm run typecheck` clean; `DEMO_MODE=1 npm run smoke:tournament` still green.
- [ ] **Step 5:** Commit `feat(tournament): tournament block in room snapshot`.

### Task 4: Socket events — start + submit, entrant identity

**Files:** Modify `lib/socket/server.js`.

**Interfaces:**
- Consumes: `startTournament(roomId)`, `submitEntrantPrompt(roomId, entrantId, text)` from `lib/game/tournament/lifecycle.js`; the TOURNAMENT join result `{ ok, entrantId }` (Task 3 of the backbone).
- Produces: socket events `start_tournament` (admin-only) and `tournament_prompt` `{ text }` (entrant); `socket.data.entrantId` set on TOURNAMENT join.

- [ ] **Step 1:** Read the `join_game` handler region (~line 145) and how admin identity is checked elsewhere. On a successful TOURNAMENT join, set `socket.data.entrantId = result.entrantId` and `socket.emit('joined_as_entrant', { entrantId: result.entrantId })`.
- [ ] **Step 2:** Register `start_tournament` (admin-only, rate-limited):

```js
socket.on('start_tournament', (payload, ack) => {
  if (!_allow(socket, 'start_tournament', { limit: 5, windowMs: 60_000 })) return ack && ack({ ok: false, code: 'rate_limited' });
  if (!socket.data.isAdmin) return ack && ack({ ok: false, code: 'forbidden' }); // mirror the existing admin check
  require('../game/tournament/lifecycle.js').startTournament(roomId); // async, fire-and-forget; it broadcasts
  ack && ack({ ok: true });
});
```

- [ ] **Step 3:** Register `tournament_prompt`:

```js
socket.on('tournament_prompt', (payload, ack) => {
  if (!_allow(socket, 'tournament_prompt', { limit: 30, windowMs: 60_000 })) return ack && ack({ ok: false, code: 'rate_limited' });
  const entrantId = socket.data.entrantId;
  if (!entrantId) return ack && ack({ ok: false, code: 'not_entrant' });
  const lc = require('../game/tournament/lifecycle.js');
  lc.submitEntrantPrompt(roomId, entrantId, String(payload?.text || ''));
  const room = getRoom(roomId);
  if (room?.tournament?._promptResolve) room.tournament._promptResolve(); // early-resolve when all submitted
  require('./broadcasts.js').broadcastState(roomId);
  ack && ack({ ok: true });
});
```

(Adapt `socket.data.isAdmin` / `_allow` / `getRoom` to the real names in `server.js`.)

- [ ] **Step 4:** Verify `npm run typecheck`; `npm run smoke` (DUEL regression — new events don't touch duel).
- [ ] **Step 5:** Commit `feat(tournament): start + prompt socket events, entrant identity`.

### Task 5: DEMO socket smoke (real clients end-to-end)

**Files:** Create `scripts/tournamentSocketSmoke.js`; add `"smoke:tournament-socket"` to package.json. Reference (read first): `scripts/matchSmoke.js` for the socket.io-client connection contract (path `/api/socket`, `auth: { role, deviceId, roomId }`).

**Interfaces:** Consumes the M1 socket events. Produces a script that: creates a TOURNAMENT room (via `POST /api/rooms` with `roomMode:'TOURNAMENT'`, or registry bootstrap), connects N entrant clients (each joins → gets `entrantId`), an admin client emits `start_tournament`, each entrant replies to each `PROMPTING` phase with `tournament_prompt`, and the script asserts a `tournament.champion` appears in a broadcast within a timeout.

- [ ] **Step 1:** Implement the smoke (mirror matchSmoke's client setup; `DEMO_MODE=1`; short `promptDurationSec`). Assert: a `state` broadcast eventually has `tournament.phase === 'COMPLETE'` and a non-null `tournament.champion`.
- [ ] **Step 2:** Run `DEMO_MODE=1 npm run dev` (background, set `ADMIN_COOKIE_SECRET`/`COOKIE_SECRET` ≥32 chars) then `DEMO_MODE=1 npm run smoke:tournament-socket`. Expected: champion asserted.

  > NOTE: in THIS sandbox the socket layer may not complete (the duel `matchSmoke` times out on base too — a pre-existing env issue). If so, log it and rely on the registry-drive `smoke:tournament` for engine proof; the socket smoke is the gate to run on the user's machine / CI. Do NOT fake a pass.

- [ ] **Step 3:** Commit `test(tournament): DEMO socket smoke — real clients to champion`.

---

## M2 — Create-room mode toggle

### Task 6: Room-mode toggle in create-room UI

**Files:** Modify `app/create-room/CreateRoomFormClient.tsx`; add i18n keys.

**Interfaces:** Consumes the existing `roomMode` zod field (`POST /api/rooms`, already added). Produces a UI control that sets `roomMode: 'DUEL' | 'TOURNAMENT'` in the create payload; default `DUEL`.

- [ ] **Step 1:** Read `CreateRoomFormClient.tsx` `RoomDraft` state + the POST body assembly.
- [ ] **Step 2:** Add a segmented toggle "Oyun modu: Düello / Turnuva" (mirror the existing `categoryMode` radiogroup styling) bound to `roomMode`; thread it into the POST body.
- [ ] **Step 3:** Add i18n keys (`gameMode`, `modeDuel`, `modeTournament`, `modeTournamentHint`) TR+EN; run `npm run i18n:check`.
- [ ] **Step 4:** Verify `npm run typecheck`; Playwright: `DEMO_MODE=1` dev server → navigate `/create-room` → snapshot shows the toggle.
- [ ] **Step 5:** Commit `feat(tournament): room-mode toggle in create-room`.

---

## M3 — Phone (player) screens

> UI tasks: the **visual spec is `mockups/tournament-flow-v3.html`** (M-1…M-4 phone frames) and the design system is `components/stage/atmosphere.tsx` (`C`/`FONT`) + `components/common/`. Reuse, don't re-roll. Verification per task = `npm run typecheck` + `npm run i18n:check` + render via a preview route + Playwright snapshot/screenshot against a `DEMO_MODE=1` server.

### Task 7: Client state — expose tournament + myEntrant

**Files:** Modify `components/client/useGameState.tsx` (and/or `hooks/useRoomState.ts`).

**Interfaces:** Produces, from the game-state hook: `tournament: TournamentSnapshot | null` (passthrough from snapshot) and `myEntrant: { entrantId, nickname, eliminated, lastScore } | null` resolved by matching the client's `pc_device_id`/`entrantId` against `tournament.roster` (store `entrantId` from the `joined_as_entrant` event).

- [ ] **Step 1:** Read the hook; add `tournament` passthrough + `myEntrant` resolution (capture `entrantId` from `joined_as_entrant`, match into roster).
- [ ] **Step 2:** `npm run typecheck`. Commit `feat(tournament): expose tournament + myEntrant in client state`.

### Task 8: Phone shell + screens

**Files:** Create `components/client/TournamentMobileShell.tsx` + `components/client/tournament/{TJoin,TPrompt,TPassed,TEliminated,TFinalVote}.tsx`; modify `components/client/MobileShell.tsx` to branch when `roomMode === 'TOURNAMENT'`; add i18n keys; add a preview fixture.

**Interfaces:** Consumes `tournament` + `myEntrant` (T7), `phaseEndsAt` (countdown), socket `tournament_prompt` emit, and final-vote (reuse the existing duel vote emit for the FINAL_DUEL phase). Routing:
- `tournament.phase === LOBBY` → `TJoin` (QR/joined, "X/Y katıldı")
- `ROUND_PROMPTING` & my entrant active → `TPrompt` (topic + textarea + GÖNDER; on submit emit `tournament_prompt`)
- after a cut: my entrant active → `TPassed` (streak/score, "sonraki tura hazırım"); my entrant eliminated → `TEliminated` ("TOP N · X kişiyi geçtin", share)
- `FINAL_DUEL` → `TFinalVote` (tap-to-vote between the 2 finalists — reuse duel audience vote)
- `COMPLETE` → champion celebration

- [ ] **Step 1:** Build `TournamentMobileShell` routing by the rules above; mount it from `MobileShell` when `roomMode === 'TOURNAMENT'`.
- [ ] **Step 2:** Build the five screens against the v3 mockup phone frames, reusing `C`/`FONT`/`components/common/` (`BgAtmosphere`, `MascotFrame`, `AppHeader`, `SectionLabel`). All copy via `t()` dual-written TR+EN.
- [ ] **Step 3:** Add a preview fixture (`app/preview/phone` tournament cases) so each screen renders without a live socket.
- [ ] **Step 4:** `npm run typecheck` + `npm run i18n:check`; Playwright: render each phone tournament phase via the preview route, screenshot.
- [ ] **Step 5:** Commit `feat(tournament): phone player screens (join/prompt/passed/eliminated/vote)`.

---

## M4 — Stage screens

### Task 9: Stage tournament boards

**Files:** Create `components/stage/TournamentStage.tsx` + `components/stage/tournament/{TStageCounter,TStageDuel,TStageChampion}.tsx`; branch the stage shell on `roomMode === 'TOURNAMENT'`; add a `/preview/stage` tournament fixture; i18n keys.

**Interfaces:** Consumes `tournament` snapshot. Fixed 1920×1080 boards (`STAGE_W/STAGE_H`, scaled by `StageScaler`). Routing: `ROUND_*` → `TStageCounter` (giant KALAN counter `activeCount` + shrinking wall of `roster` tiles, `out` for eliminated, phase rail `total→…→2`); `FINAL_DUEL` → `TStageDuel` (reuse the duel duel-card with the two finalists); `COMPLETE` → `TStageChampion` (crown + champion nickname). Per v3 mockup D-STAGE-1/2/3.

- [ ] **Step 1:** Build the three boards against the mockup, reusing `atmosphere.tsx` + the existing duel duel-card for `TStageDuel`.
- [ ] **Step 2:** Branch the stage shell; add the preview fixture.
- [ ] **Step 3:** `npm run typecheck`; Playwright: `/preview/stage?phase=...` tournament cases → screenshot each board.
- [ ] **Step 4:** Commit `feat(tournament): stage boards (counter+wall / duel / champion)`.

---

## M5 — Admin control + bracket

### Task 10: Admin tournament control + bracket

**Files:** Create `components/admin/TournamentControl.tsx` + `components/admin/TournamentBracket.tsx`; mount in `app/admin` (gate on the room being TOURNAMENT); i18n keys.

**Interfaces:** Consumes `tournament` snapshot + the admin socket. Produces: a "Turnuvayı başlat" button (enabled when `tournament.phase === LOBBY` and `activeCount ≥ 2`) emitting `start_tournament`; live round status (`roundIndex/roundCount`, `activeCount`); a bracket view (per v3 mockup D-ADMIN-1) rendering `roster`/`finalists`/`champion` — early rounds summarized as phase counts, the tree drawing the final stages.

- [ ] **Step 1:** Build `TournamentControl` (start button + status) wired to the admin socket; disabled/labeled states for each tournament phase.
- [ ] **Step 2:** Build `TournamentBracket` from the mockup (flex tree, seed badges, live-match glow, gold champion node).
- [ ] **Step 3:** Mount both in `app/admin` behind a `roomMode === 'TOURNAMENT'` check; i18n TR+EN; `npm run i18n:check`.
- [ ] **Step 4:** `npm run typecheck`; Playwright: `DEMO_MODE=1` server → admin view of a TOURNAMENT room → screenshot start button + bracket.
- [ ] **Step 5:** Commit `feat(tournament): admin control + bracket`.

---

## M6 — Polish, E2E, follow-ons

### Task 11: i18n sweep + Playwright DEMO E2E

**Files:** `i18n/dict.ts`; a Playwright walkthrough (manual via MCP, documented in the commit).

- [ ] **Step 1:** `npm run i18n:check` — fix any TR/EN gaps across all new copy.
- [ ] **Step 2:** Playwright DEMO E2E ($0): start `DEMO_MODE=1` dev server; create a TOURNAMENT room; open admin + stage + two phone contexts; start; submit prompts; drive to champion; screenshot each surface. (If the sandbox socket layer stalls — same pre-existing limit as duel `matchSmoke` — document it and hand the user the exact steps to run the same walkthrough on their machine.) **Never run non-DEMO.**
- [ ] **Step 3:** `npm run typecheck` + `npm run smoke` (DUEL regression) + `DEMO_MODE=1 npm run smoke:tournament` + `smoke:tournament-socket`. Commit `chore(tournament): i18n sweep + DEMO E2E walkthrough`.

### Follow-on epics (captured so "nothing is forgotten" — separate plans, NOT in this build)

- **Real Gemini `scoreRoster`** (N-way image ranking; replaces the throwing seam) — **real money**, user-gated, measured with a small test room first; chunk + merge for large N; widen the DEMO jitter (`%5`→`%29/37`) and fix the negative-score comment while there.
- **Mode B** (group elimination + wildcard) — new round-shape on top of the same engine + UI.
- **Mongo persistence** of tournament results (history/observability).
- **Cost-budget caps** per room + provider safe-concurrency wave sizing; loser-retention & winner-legitimacy mechanics from the brainstorm's open risks.

---

## Self-Review

**Spec coverage (the "what's missing" list → tasks):** start entry → T4; real prompt window → T2; real topic → T1; tournament snapshot → T3; create-room toggle → T6; phone UI → T7/T8; stage UI → T9; admin+bracket UI → T10; i18n+E2E → T11; real-AI/Mode B/persistence/budget → flagged follow-ons. Every gap from the status review maps to a task or an explicitly-deferred follow-on. ✓

**Placeholder scan:** `_awaitPrompts` is now a real window (T2); `scoreRoster` real path stays a labeled, user-gated seam (cost rule) — not a silent TODO. UI tasks reference the concrete mockup + design system rather than inlining every pixel; this is the stated adaptation (no unit-test framework; UI verified via preview routes + Playwright). Backend tasks carry runnable code.

**Type consistency:** `TournamentSnapshot` fields are defined once in T3 and consumed unchanged in T7–T10. `entrantId` shape is consistent across snapshot/socket/client. `tournament_prompt`/`start_tournament`/`joined_as_entrant` event names are used identically in server (T4), smoke (T5), and client (T7/T8/T10).

**Controller pre-flight (verify before coding each task — don't assume):** the exact export name in `lib/game/targetPrompt.js` (T1); the admin-identity flag + `_allow`/`getRoom` names in `lib/socket/server.js` (T4); `CreateRoomFormClient`'s draft+POST assembly (T6); the game-state hook's shape (T7); `MobileShell`/stage-shell branch points (T8/T9); whether the sandbox completes socket flows at all (T5/T11 — known pre-existing risk).
