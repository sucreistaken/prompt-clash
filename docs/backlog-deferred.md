# Deferred Backlog (project knowledge — surfaced by `bmad-help`)

Items intentionally postponed. When the user runs **bmad-help / "ne yapmalıyım"**,
remind them about these.

## DEFERRED — AI scoring rubric (improvement #2)

**Status:** Not started — postponed on 2026-06-30 by user ("şimdilik 1 ve 4").

**What:** Replace the single holistic 0-100 similarity score with a **per-dimension
rubric** in the AI judge:
- Sub-scores for **subject / composition / color / lighting-mood** (e.g. each 0-25),
  aggregated into the 0-100 total.
- Surface the breakdown in the result UI (mini bar/row per dimension) if desired.

**Why:** A rubric makes scores more **calibrated and less clustered** (weak holistic
scores bunch in the 70s-80s) and gives the judge **concrete material** for specific
reasoning. Pairs with the already-shipped #1 (specific reasoning) + #4 (full-range
instruction).

**Where:**
- 1v1: `lib/gemini/score.js` — `buildSystemPrompt` + the returned JSON schema +
  `scoreVsReference` parsing (add sub-score fields, keep back-compat).
- N-way: `lib/game/tournament/scoreRoster.js` — `_batchSystemPrompt` + parse.
- UI: result/scoring board components consuming `aiReasoning*` / `aiScore`.

**Effort:** Medium (schema + parse + UI). **Risk:** Medium (JSON schema change —
keep a fallback to the flat score so old/partial responses still parse).

**Related:** `docs/investigations/image-prompt-mismatch.md` (the generation-fidelity
fix that preceded this scoring work).

## Already shipped (context)

- #1 specific 2-3-sentence reasoning + #4 full-range/decisive instruction —
  `lib/gemini/score.js`, `lib/game/tournament/scoreRoster.js` (2026-06-30).
- Optional, not yet decided: dedicated `GEMINI_SCORE_MODEL` (stronger judge model
  than `flash-lite`) — improvement #3, raised but not chosen.
