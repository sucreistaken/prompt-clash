# Case File — Generated player images don't match their prompts

## Hand-off Brief (15-second read)

Players write a faithful Turkish description but the AI-generated image shows an
unrelated scene (apothecary prompt → mosque; orange-in-space prompt → mountain /
coastal town). **Root cause (Deduced): the Turkish→English translation step fails
intermittently, and the generation code silently falls back to sending the RAW
TURKISH prompt to Cloudflare flux-1-schnell, which is English-trained and renders
generic/unrelated scenes for non-English input.** The on-screen prompt stays Turkish,
so the mismatch is fully visible to the audience and breaks the game's fairness.

- **Status:** Fix applied locally (not yet deployed); root cause Deduced from
  source; trigger (actual translate failures in prod) still Hypothesized — needs
  prod logs to Confirm.
- **Confidence:** Medium-High.

## Resolution (fix applied 2026-06-29)

Removed the silent "fall back to raw text" behavior, which only ever triggered for
**non-English** prompts (English inputs return early from `translateToEnglish` and
never throw). Changes:

1. `lib/gemini/prompt.js` — `translateToEnglish` now retries (default 2) across
   key rotation; empty output is treated as failure; persistent failure **throws**
   instead of returning the raw text.
2. `lib/game/matchLifecycle.js` `_generateForSlot` — on translate failure, mark the
   slot `genError`/`forfeit` (`errorReason: 'translate_failed'`) instead of feeding
   raw Turkish to flux. No misleading image is ever produced.
3. `lib/game/tournament/lifecycle.js` `_waveGenerate` — same: translate failure now
   propagates to the outer catch → `lastImageUrl = null` (entrant scores low), no
   raw-text fallback.

**Product tradeoff:** a prompt whose translation persistently fails now *forfeits*
the round (clear "generation failed") rather than showing an unrelated image. With
retries, this should be rare. Confirm/adjust if forfeiting is undesirable.

**Verification done (local):**
- `node scripts/translateFallbackCheck.js` — English passes through; Turkish throws
  when translate is unavailable (proves no raw fallback); blank is safe. All pass.
- `npm run typecheck` — clean. `node --check` on all 3 edited files — clean.

**Verification NOT done (needs prod/credentials):**
- End-to-end with real Cloudflare flux + a forced translate failure (no CF creds
  here; `DEMO_MODE` smoke bypasses translate entirely).
- Prod-log confirmation that translate actually failed for the screenshot rounds.

## Case Info

- Surfaces: `/rooms/<id>/game` (audience "AI KARAR VERİYOR" board) and `/stage`.
- Provider (prod): `IMAGE_PROVIDER=cloudflare` → flux-1-schnell, `STEPS=4`
  (`deploy/env.production.example:13`). NOT pollinations (that's only the dev default).
- Storage (prod): `STORAGE_PROVIDER=local`.

## Problem Statement (evidence)

Two screenshots, two different rounds:

1. Reference = apothecary w/ black cat.
   - **Sefa** prompt (apothecary) → image = apothecary. **Matches.** ✅
   - **İlay** prompt (apothecary: "raflarda iksirler… şömine… siyah kedi") →
     image = **mosque at night.** ❌
2. Reference = glowing orange in space.
   - **İlay** prompt ("kocaman parlak portakal… 3 yeşil yaprak… siyah dolunay") →
     image = **rocky mountain cliff.** ❌
   - **Sefa** prompt ("portakal… stratosferde… ayın karanlık yüzü arkada") →
     image = **coastal town at sunset.** ❌

Key pattern: the wrong images are **coherent but unrelated** real-scene defaults
(architecture / landscapes); the correct one (Sefa #1) and the references are
faithful, detailed renders. Mismatch is **per-call inconsistent** (same round, one
player right, one wrong).

## Evidence Inventory

| Item | Grade | Where |
|---|---|---|
| Prod provider = cloudflare flux-1-schnell, STEPS=4 | Confirmed | `deploy/env.production.example:13`, `lib/cloudflare/image.js:7-8` |
| flux returns the real image for the prompt, or throws → forfeit (no random-fallback path) | Confirmed | `lib/cloudflare/image.js`, `lib/pollinations/image.js` |
| flux CAN render faithfully given good English input | Confirmed | Sefa #1 image + both reference images |
| Player image generated from `translateToEnglish(p.prompt)` | Confirmed | `lib/game/matchLifecycle.js:330-346` |
| On ANY translate error, code falls back to **raw Turkish** `p.prompt` and proceeds | Confirmed | `lib/game/matchLifecycle.js:331-340` (and tournament `tournament/lifecycle.js:164-171`) |
| `withKeyFailover` throws on all-keys-quota OR first non-quota error (timeout/500/net) — non-quota does NOT try other keys | Confirmed | `lib/gemini/keyRotator.js:35-54` |
| Translate call has a 12s timeout that surfaces as a non-quota throw | Confirmed | `lib/gemini/prompt.js:114-129` (`GEMINI_TRANSLATE` 12000) |
| Displayed prompt = untranslated `p.prompt` (Turkish), so any mismatch is visible | Confirmed | `lib/game/matchLifecycle.js:329` comment + snapshot |
| Both İlay prompts carry Turkish diacritics → correctly flagged non-English → DO get sent to translate (not skipped) | Deduced | `_isLikelyEnglish` regex `lib/gemini/prompt.js:88-98` |
| flux on raw Turkish → generic/unrelated scenes | Deduced | observed images + model is English-trained |
| Translation actually failed for the wrong-image generations in prod | **Hypothesized** | needs prod logs: `[gen:*] slot * translate failed, using original` |

## Source Code Trace

Root cause chain (Confirmed in code; trigger Hypothesized):

1. `_generateForSlot` (`lib/game/matchLifecycle.js:330-340`):
   ```js
   let promptText = p.prompt;                 // Turkish
   try { promptText = await translateToEnglish(p.prompt); }
   catch (err) { /* warn */ }                 // <-- swallows, keeps RAW TURKISH
   const prompt = buildGuardedPrompt(promptText);
   const { buffer } = await generateImage(prompt);  // flux gets Turkish
   ```
2. `translateToEnglish` → `withKeyFailover` throws on quota-exhaustion **or** any
   non-quota error on the first key (timeout @12s, 5xx, network). `keyRotator.js:48`:
   `if (!_isQuotaError(err)) throw err;` — no failover for non-quota.
3. Raw Turkish → `buildGuardedPrompt` (only appends safety suffix) → flux-1-schnell
   (English-trained, STEPS=4) → unfaithful generic image.
4. UI still shows the original Turkish prompt → visible mismatch.

Per-call inconsistency (Sefa right / İlay wrong in the same round) is consistent
with intermittent per-call Gemini failures (quota bursts, individual timeouts).

Contributing factor (not primary): `STEPS=4` lowers fidelity, but faithful renders
elsewhere prove quality is not the main driver.

## Hypotheses

- **#1 (LEADING, Deduced):** Translate fails → raw Turkish reaches flux → unrelated
  image. Confirm: prod logs `translate failed, using original` correlated to the
  bad matchIds; or reproduce by forcing translate to throw.
- **#2 (Refuted):** Stale `imageUrl` from a prior round. Refuted — `softResetForRematch`
  and tournament `makePlayer` null out `imageUrl`; `newMatchId()` is unique so storage
  paths don't collide (`state.js:137-139,196`; `matchLifecycle.js:350`).
- **#3 (Refuted):** Provider returns random/fallback images. Refuted — both providers
  return the real image or throw → forfeit; no random path.
- **#4 (Weakened):** flux-1-schnell @4 steps just ignores prompts. Weakened — Sefa #1
  and references render faithfully, so flux honors good English input.

## Missing Evidence (itself a finding)

- Prod app logs around these two generations (would Confirm #1 outright).
- Whether `GEMINI_API_KEY_*` rotation is configured in prod (single key → quota
  exhaustion far more likely). Check prod env.

## Fix Direction (investigation stops at diagnosis)

The dangerous line is the silent fallback to raw Turkish for a known-non-English
prompt. Options (by mechanism):
- Don't send raw Turkish to an English-only model: if translate fails AND the input
  is non-English, **retry** translate (own backoff) or mark the slot as a
  generation failure (forfeit) rather than emitting a misleading image.
- Make `withKeyFailover` retry the first key once on transient non-quota errors
  (timeout/5xx) before throwing; raise `GEMINI_TRANSLATE` timeout.
- Ensure multiple `GEMINI_API_KEY_*` are set in prod (quota headroom).
- Secondary: raise flux `STEPS` for fidelity.

## Reproduction / Verification Plan

1. In dev with `IMAGE_PROVIDER=cloudflare`, temporarily force `translateToEnglish`
   to throw; submit a Turkish prompt; confirm the generated image is unrelated and
   the log shows `translate failed, using original`.
2. Grep prod logs for `translate failed, using original` and correlate timestamps
   with the bad rounds → Confirms #1.
