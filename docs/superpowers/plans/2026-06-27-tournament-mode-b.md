# Tournament Mode B — "Eleme Grupları" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`). Controller scouts exact line numbers before each task.

**Goal:** Add Mode B (group elimination, "yarışma programı") on top of the existing Mode A tournament: N players split into groups; each group competes **sequentially** with its own topic; the AI judge picks the top-K of each group; a **wildcard** rescues the highest-scoring eliminated; then the survivors flow into the existing Mode A reduction → 1v1 final → champion. Built in DEMO ($0); real AI stays user-gated.

**Architecture:** Mode B is a **sub-mode of `roomMode: 'TOURNAMENT'`**, selected by a new `tournamentMode: 'A' | 'B'` (default `'A'`). The group phase is a **prefix** before the Mode A reduction: `startTournament` branches — for Mode B it runs `_runGroupPhase` (partition → run each group like a scoped `_runRound` → collect top-K per group + wildcards → set `activeIds = survivors`), then falls into the SAME `buildSchedule`+`_runRound` reduction loop and `_startFinalDuel` that Mode A uses. Most UI is mode-agnostic and reused as-is (prompt / passed / eliminated / final-vote / champion / stage counter); Mode B adds only **group awareness** (which group, "waiting for your group", group label on stage/admin). The duel engine stays untouched.

**Tech Stack:** Node ≥20 CommonJS backend (`lib/**` `.js`, no transpile), Next 14 TSX, socket.io, zod v4, i18n TR+EN parity-gated.

## Global Constraints

- Backend `.js` CommonJS; frontend TSX `@/`. Duel engine untouched. Mode A engine untouched on the `tournamentMode === 'A'` path (the group phase is additive, gated on `'B'`).
- MUST #1 broadcast after mutation; MUST #2 roomId-first; MUST #5 logs `[tournament:<short>]`. Epoch guards on every async await.
- DEMO cost rule: all dev/test `DEMO_MODE=1`; the real Gemini `scoreRoster` path stays a user-gated seam (never auto-invoked). Wave generation sequential.
- No generic emoji (pixel SVG / typographic glyphs only). No `grid-template-areas` in inline `<style>` JSX. Design-system fidelity (`C`/`FONT` or `var(--pc-*)`). i18n dual-write parity.
- Frozen enums via `Object.freeze`. Mongo optional.
- Verification (no unit-test framework): `npm run typecheck` · `npm run i18n:check` · `DEMO_MODE=1 npm run smoke:tournament` (Mode A regression) · a new Mode-B registry smoke · Playwright on preview routes · `npm run smoke` (duel regression, sandbox-flaky — typecheck is the duel gate).

## File Structure

- `lib/game/tournament/state.js` (modify) — `tournamentMode` + group fields in factory.
- `lib/game/tournament/groups.js` (create) — pure `partitionGroups(ids, n)` + group-size derivation + `topKPerGroup`/`wildcardCount` helpers.
- `lib/game/tournament/lifecycle.js` (modify) — `_runGroup` (scoped round), `_runGroupPhase` (sequential groups + wildcard), `startTournament` B-branch.
- `lib/game/tournament/snapshot.js` (modify) — group-aware fields (`mode`, `groupPhase`, `currentGroupIndex`, `groupCount`, per-entrant `groupIndex`).
- `models/Room.js` · `app/api/rooms/route.ts` · `types/game.ts` (modify) — `tournamentMode`.
- `app/create-room/CreateRoomFormClient.tsx` (modify) — A/B selector (shown only when Tournament).
- `components/client/tournament/TWaiting.tsx` + `TournamentMobileShell.tsx` (modify) — "waiting for your group" + group indicator.
- `components/stage/tournament/TStageCounter.tsx` + `components/admin/TournamentBracket.tsx` (modify) — group label / current group.
- `i18n/dict.ts` (modify) — new copy TR+EN.
- `scripts/tournamentModeBSmoke.js` (create) — DEMO registry smoke: 100 entrants Mode B → champion.

---

### Task B1: `tournamentMode` flag (A/B) end-to-end

**Files:** modify `lib/game/tournament/state.js`, `models/Room.js`, `app/api/rooms/route.ts`, `types/game.ts`, `app/create-room/CreateRoomFormClient.tsx`, `lib/game/tournament/snapshot.js`, `i18n/dict.ts`.

**Interfaces:** Produces `room.tournament.mode: 'A' | 'B'` (default `'A'`), threaded from the create-room body `tournamentMode` through zod/Mongo into `createTournamentState`, exposed on the tournament snapshot as `mode`. A create-room sub-control (visible only when `roomMode === 'TOURNAMENT'`) sets it.

- [ ] **Step 1:** `state.js` `createTournamentState({ entrants, mode = 'A' })` → add `mode: mode === 'B' ? 'B' : 'A'` to the returned object; default the existing call sites to 'A'. The join handler that lazily creates the state must pass `mode` from `room.settings.tournamentMode` (read it: `createTournamentState({ mode: room.settings?.tournamentMode })`).
- [ ] **Step 2:** `models/Room.js` RoomSettingsSchema: add `tournamentMode: { type: String, enum: ['A','B'], default: 'A' }`.
- [ ] **Step 3:** `app/api/rooms/route.ts` CreateRoomBody: add `tournamentMode: z.enum(['A','B']).default('A')`.
- [ ] **Step 4:** `types/game.ts`: add `export type TournamentMode = 'A' | 'B';` and `mode: TournamentMode;` to `TournamentSnapshot`.
- [ ] **Step 5:** `snapshot.js` `tournamentSnapshot`: add `mode: t.mode || 'A'`.
- [ ] **Step 6:** `CreateRoomFormClient.tsx`: add a sub-toggle "Turnuva tipi: Aynı Sahne (A) / Eleme Grupları (B)" bound to a new `tournamentMode` draft field (default 'A'), rendered ONLY when `draft.roomMode === 'TOURNAMENT'` (mirror the existing segmented control). i18n keys `tournamentTypeLabel`, `tModeA`, `tModeAHint`, `tModeB`, `tModeBHint` (TR+EN).
- [ ] **Step 7:** Verify `npm run typecheck` + `npm run i18n:check` + `DEMO_MODE=1 npm run smoke:tournament` (Mode A unaffected — default 'A'). Commit `feat(tournament): tournamentMode A/B flag + create-room selector`.

### Task B2: Group partition (pure) + group state

**Files:** create `lib/game/tournament/groups.js`; modify `lib/game/tournament/state.js` (group fields).

**Interfaces:**
- `partitionGroups(ids: string[], opts?) -> string[][]` — split into groups of ≈`GROUP_TARGET` (20), balanced (no group < `GROUP_MIN` 4 unless total < that); deterministic order.
- `topKForGroup(groupSize) -> number` — how many advance per group (≈ `ceil(groupSize/4)`, min 1).
- `wildcardCount(totalGroups) -> number` — rescued eliminated count (≈ `min(3, totalGroups)`).
- State fields (in `createTournamentState`): `groups: string[][]` (set at group-phase start), `currentGroupIndex: number` (-1 until phase starts), and per-entrant `groupIndex: number | null`.

- [ ] **Step 1:** Implement `groups.js` (pure, no deps). `partitionGroups(100)` → 5 groups of 20; `partitionGroups(8)` → 2 groups of 4; balanced.
- [ ] **Step 2:** Add `groups: []`, `currentGroupIndex: -1` to the factory; add `groupIndex: null` to the entrant shape in `addEntrant`.
- [ ] **Step 3:** Inline-verify: `node -e "const {partitionGroups,topKForGroup,wildcardCount}=require('./lib/game/tournament/groups.js'); const g=partitionGroups(Array.from({length:100},(_,i)=>'e'+i)); console.log(g.length===5, g.every(x=>x.length===20), topKForGroup(20)===5, wildcardCount(5)===3);"` → `true true true true`.
- [ ] **Step 4:** Commit `feat(tournament): group partition + wildcard helpers + group state`.

### Task B3: Group-phase engine + startTournament B-branch (the core)

**Files:** modify `lib/game/tournament/lifecycle.js`.

**Interfaces:**
- Consumes: `partitionGroups`/`topKForGroup`/`wildcardCount` (B2), `nextTopic`, the existing `_awaitPrompts`/`_waveGenerate`/`scoreRoster`, `buildSchedule`/`_runRound`/`_startFinalDuel`.
- Produces: `_runGroupPhase(roomId, epoch)` that, when `t.mode === 'B'`, partitions `t.activeIds` into `t.groups`, runs each group **sequentially** as a scoped mini-round, collects per-group top-K survivors + wildcards (highest-scoring eliminated across all groups), sets `t.activeIds = survivors`, then returns; `startTournament` calls it before the reduction loop for Mode B.

- [ ] **Step 1:** Implement a scoped `_runGroup(roomId, epoch, groupIds, topK)`: set `t.currentGroupIndex`; assign each member `groupIndex`; new topic via `nextTopic`; PROMPTING window (reuse `_awaitPrompts` but only the group's members need a prompt — pass the group ids); wave-generate the group; `scoreRoster(roomId, ref, groupEntrants)`; keep top-K survivors, mark the rest `eliminated`, and RETURN `{ survivors: id[], eliminatedScored: [{entrantId,score}] }` (the latter feeds wildcards). Re-check epoch after each await.
- [ ] **Step 2:** Implement `_runGroupPhase(roomId, epoch)`:
```js
async function _runGroupPhase(roomId, epoch) {
  const room = getRoom(roomId); const t = room.tournament;
  t.groups = partitionGroups(t.activeIds);
  const survivors = []; const eliminatedPool = [];
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
  log(roomId, `group phase done: ${survivors.length} advance (incl. ${Math.min(wc, eliminatedPool.length)} wildcard)`);
}
```
- [ ] **Step 3:** In `startTournament`, before the reduction loop:
```js
  if (t.mode === 'B' && t.activeIds.length > 2) {
    await _runGroupPhase(roomId, epoch);
    if (!isCurrentEpoch(roomId, epoch)) return;
  }
  t.schedule = buildSchedule(t.activeIds.length); // now runs on group-phase survivors
```
(Move the existing `t.schedule = buildSchedule(...)` to AFTER the group phase so it reduces the survivors. Mode A path: `t.mode !== 'B'` → no group phase, identical to today.)
- [ ] **Step 4:** Refactor `_awaitPrompts`/`_waveGenerate`/`scoreRoster` calls so `_runGroup` can scope to `groupIds` (e.g. add an optional `ids` arg defaulting to `activeEntrants`). Keep Mode A behavior identical when no ids passed.
- [ ] **Step 5:** Verify `DEMO_MODE=1 npm run smoke:tournament` (Mode A still crowns champion) + `npm run typecheck`. Commit `feat(tournament): Mode B group-phase engine + wildcard`.

### Task B4: Group-aware snapshot + phone group UI

**Files:** modify `lib/game/tournament/snapshot.js`, `components/client/TournamentMobileShell.tsx`, `components/client/tournament/TWaiting.tsx` (+ a new `TGroupWait` if cleaner), `app/preview/mock.ts`, `i18n/dict.ts`.

**Interfaces:** snapshot adds `groupPhase: boolean`, `currentGroupIndex`, `groupCount`, and `myEntrant.groupIndex`. Phone: during the group phase, an entrant whose group is NOT the current group sees a "Sıranı bekle — Grup N" screen; the active group sees the normal `TPrompt`; a group indicator ("Grup N") shows on the prompt/passed screens.

- [ ] **Step 1:** snapshot: add `groupPhase: t.currentGroupIndex >= 0`, `currentGroupIndex: t.currentGroupIndex`, `groupCount: (t.groups||[]).length`, and include each roster entry's `groupIndex`.
- [ ] **Step 2:** `TournamentMobileShell`: when `tournament.mode === 'B' && tournament.groupPhase`, route a non-active-group entrant (`myEntrant.groupIndex !== tournament.currentGroupIndex`) to a waiting screen (TWaiting `variant="groupWait"` showing `myEntrant.groupIndex+1`); the active group keeps `TPrompt`. Add a small "Grup N" badge to `TPrompt`/`TPassed` when `mode === 'B'`.
- [ ] **Step 3:** Extend `mockTournamentCtx` for a Mode B group-phase fixture (mode 'B', groupPhase true, a roster with groupIndex, myEntrant in a waiting group). Preview URL `?mode=tournament&tphase=ROUND_PROMPTING&tmode=B&groupwait=1`.
- [ ] **Step 4:** i18n keys (`tGroupWaitTitle`, `tGroupWaitBody`, `tGroupBadge`) TR+EN. Verify typecheck + i18n:check. (Controller Playwright-verifies the group-wait + active-group screens.) Commit `feat(tournament): group-aware snapshot + phone group screens`.

### Task B5: Mode B smoke + stage/admin group label + verify

**Files:** create `scripts/tournamentModeBSmoke.js` (+ package.json script); modify `components/stage/tournament/TStageCounter.tsx` + `components/admin/TournamentBracket.tsx` (group label); `i18n/dict.ts`.

- [ ] **Step 1:** `tournamentModeBSmoke.js` (registry-drive, DEMO, mirror `tournamentSmoke.js`): create a TOURNAMENT room with `settings.tournamentMode='B'`, `createTournamentState({mode:'B'})`, add 100 entrants, `startTournament`, poll for champion. Assert: champion crowned, `phase === 'COMPLETE'`, exactly one non-eliminated entrant. Add `"smoke:tournament-mode-b"` script.
- [ ] **Step 2:** Stage `TStageCounter` + admin bracket: when `tournament.mode === 'B' && groupPhase`, show "GRUP {currentGroupIndex+1} / {groupCount}" label. i18n TR+EN.
- [ ] **Step 3:** Verify: `DEMO_MODE=1 npm run smoke:tournament-mode-b` (champion) + `DEMO_MODE=1 npm run smoke:tournament` (Mode A regression) + typecheck + i18n:check. (Controller Playwright-verifies the stage group label.) Commit `feat(tournament): Mode B smoke + stage/admin group label`.

---

## Self-Review

**Spec coverage (brainstorm MOD B → tasks):** groups split from N → B2 `partitionGroups`; sequential groups own topic → B3 `_runGroupPhase`/`_runGroup`; top-K per group → B2 `topKForGroup` + B3; wildcard rescue → B3; survivors → upper rounds (same shrink) → B3 reuses `buildSchedule`/`_runRound`; final 1v1 → reuses `_startFinalDuel` (untouched). A/B selection → B1. Group awareness UI → B4/B5. Mode B DEMO E2E → B5 smoke. ✓

**Mode A / duel safety:** the group phase is gated on `t.mode === 'B'`; Mode A path (`mode !== 'B'`) runs the identical existing flow (B3 step 3 keeps `buildSchedule` on the full roster when no group phase). Duel engine untouched. The `_awaitPrompts`/`_waveGenerate`/`scoreRoster` `ids` arg defaults to current behavior (B3 step 4).

**Placeholder/cost:** real `scoreRoster` stays the user-gated throwing seam; all smokes DEMO. No emoji; i18n dual-write.

**Controller pre-flight (verify before each task):** the join handler's `createTournamentState` call site (B1); the exact `_awaitPrompts`/`_waveGenerate` signatures to add the `ids` arg (B3); `mockTournamentCtx` current shape (B4); `TStageCounter`/bracket group-label insertion points (B5).

**Deferred follow-ons (not in this plan):** dead-time mini-game for waiting groups; per-group live stage standings; group-draw animation; the real-AI/Mongo/budget items from the Mode A plan still apply.
