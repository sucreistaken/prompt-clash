# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this app is

**Prompt Clash** — QR-join 1v1 AI image-generation party game for live events. Three surfaces share one Node process:

| Route | Surface |
|---|---|
| `/` | Mobile join + spectator + player view (`MobileShell` routes by phase + role) |
| `/stage` | Big-screen broadcast at fixed 1920×1080, scaled to fit any projector (`StageShell`) |
| `/admin` | Operator panel (settings, force-skip, history) |

## Commands

```bash
npm run dev        # custom node server.js (Next + Socket.io on same port)
npm run build      # next build
npm start          # NODE_ENV=production node server.js
npm run typecheck  # tsc --noEmit (no separate frontend/backend split)
npm run lint       # next lint
npm run i18n:check # asserts every tr: key in i18n/dict.ts has an en: twin

# End-to-end smoke (server must be running):
npm run smoke              # matchSmoke (2 players, asserts winner) + multiRoomSmoke (room isolation)
npm run smoke:match        # just the single-match smoke
npm run smoke:multi-room   # just the multi-room isolation smoke
node scripts/demo-match.js # keeps fake players connected for screenshots
```

Dev-time UI inspection without a live socket (uses `app/preview/mock.ts` fixtures, no AI calls):

```
/preview/stage?phase=IDLE|VS_INTRO|PROMPTING|GENERATING|SCORING|VOTING|RESULT
/preview/phone?phase=...&slot=A|B            # omit slot for audience view
/preview/stage?...&theme=light               # dark default, light optional
```

`/demo` auto-cycles every phase end-to-end.

## High-level architecture

### One process, multi-room, RAM-authoritative state

- `server.js` hosts Next.js (App Router) AND Socket.io on the same port. Backend runtime is plain JS (`.js`) so it can `require()` without a transpile step; frontend is TS/TSX.
- State is **multi-room**: a `Map<roomId, RoomState>` lives in `lib/game/roomRegistry.js` (backed on `globalThis` so `server.js`'s direct `require()` and Next's webpack-bundled `app/api/*` routes share one instance). Read room state via `getRoom(roomId)` — there is no global match singleton anymore.
- Sockets join a socket.io room `room:<roomId>` (handshake middleware in `lib/socket/server.js` validates `auth.roomId`). A synthetic `'default'` room is bootstrapped at load so the legacy single-room UI + `matchSmoke.js` keep working. Fan-out is `io.to('room:'+roomId).emit('state', ...)`; the snapshot is **role-aware** (`buildSnapshot(roomId, role)` in `lib/socket/broadcasts.js`) and already role-safe before broadcast (player / audience / stage / admin).
- Still **single-instance, RAM-authoritative** (no shared store): rooms live in process memory and are lost on restart/redeploy (accepted). Deploy is a **Dockerized container on a cloud VM** (SSH deploy via GitHub Actions) — **not** Cloud Run. Don't introduce a second instance without adding a shared store first.
- The room model follows numbered **MUST rules** referenced throughout the code (MUST #1 broadcast-after-mutation, #2 `roomId` first arg, #5 `[scope:roomId-short]` log prefix, #7 audit log, etc.) and `D-*` decisions — preserve them when editing `lib/game/*` / `lib/socket/*`.

### Phase lifecycle is the source of truth

`lib/game/state.js` exports a frozen `PHASES` enum and per-room state factories. **All phase transitions go through `lib/game/matchLifecycle.js`** — every public function takes `roomId` as its first argument (MUST #2) and every transition ends with `broadcastState(roomId)` (MUST #1). Phases:

```
IDLE → PLAYER_1_JOINED → VS_INTRO → PROMPTING → GENERATING → SCORING
     → (VOTING | TIEBREAK_VOTE) → RESULT → IDLE
```

Per round, image generation runs **3+ times**: 1 target reference + 2 player outputs, plus a **prefetched next-round target** (`nextReferenceImageUrl`). This matters for provider quota planning.

`bumpOperationEpoch(roomId)` / `isCurrentEpoch(roomId, epoch)` guards async results **per room**: when a match is reset or skipped mid-flight, in-flight `generateImage` / scoring promises check the epoch on resolve and drop themselves if stale. **Pause is special** — an in-flight generation completes and the epoch is *not* bumped on pause/resume; the next queued job is blocked while `ROOM_PAUSED` (G-9). Always preserve this when adding new async work in lifecycle.

### Provider switchers (env-driven)

Two thin selectors pick implementations at require-time from env:

- `lib/image.js` → `IMAGE_PROVIDER=cloudflare | pollinations | gemini` (Cloudflare flux-1-schnell is the cheapest reliable; Pollinations is keyless/free but 402s on bursts).
- `lib/storage.js` → `STORAGE_PROVIDER=local | gcs` (local writes to `public/uploads/`, accessed via `/uploads/...`).

When adding a new provider, mirror the existing module shape (`module.exports = { generateImage }` or `{ uploadBuffer }`) and register the switch case.

`DEMO_MODE=1` bypasses real image generation and AI scoring with placeholder fixtures — use it to test UI/flow without burning quota.

### Stage rendering: fixed canvas + smart scaler

`components/stage/atmosphere.tsx` defines the design system: palette via CSS vars (`--pc-*` in `styles/globals.css`, dark default + light via `data-pc-theme` on `<html>` — `useStageTheme()` syncs it from server state), three font stacks (Silkscreen pixel, Inter Tight body, JetBrains Mono), and **`STAGE_W = 1920`, `STAGE_H = 1080`**.

Every stage phase board is built as a fixed 1920×1080 absolute layout. `StageScaler` `transform: scale()`s the whole board to fit the viewport. The scaler **refits on any viewport change** — `resize`, `visualViewport` resize/scroll, `orientationchange`, and the host element's `ResizeObserver`. Browser zoom (Ctrl+/-) is treated the same as a resize — the board grows/shrinks to match the new CSS viewport, which is the expected behavior on phones, tablets and projector windows. Don't reintroduce DPR-based zoom suppression or a path-based "preview only" branch.

`StageGenerating` is shared between GENERATING and SCORING phases via a `scoringMode` prop (true = images filled, false = render portal). Do not split it.

### Mobile / audience views

`MobileShell` routes by `mySlot` (player) vs no slot (audience). `AudienceView` is mobile-first (single column) but responsive at `md:` (side-by-side cards). All client views share `atmosphere.tsx`'s `C`/`FONT` so phone and stage stay visually coherent.

### Shared common components (Epic 6 · Visual Refresh)

The visual refresh (2026-06-01) consolidated the v2 mockup pattern into `components/common/`. Use these instead of re-rolling the same chrome per surface:

- `<BgAtmosphere variant="default|lime|danger" />` — fixed glow + pixel-grid backdrop. Lime = audience surfaces (watch), danger = 404.
- `<MascotFrame size mascotSize variant particles label sub desktopSize desktopMascotSize />` — axolotl + halo + opt. 3 particles + opt. label badge + opt. micro copy. `variant: default | lime | dim` (dim = grayscale "uyuyor" for 404). `desktopSize` grows the mascot at ≥960px via useId-scoped CSS.
- `<SectionLabel htmlFor?>` — mono caps + line-prefix label pattern (renders `<label>` or `<span>`).
- `<RolePill kind="host|audience|player|lobi" />` — topbar role chip.
- `<AppHeader right>` — brand + slot for right content (BackLink, RolePill); auto-mounts `<LangToggle/>` (fixed top-right).
- `<NotFoundShell context?>` — 4 `not-found.tsx` routes consume this; danger atmosphere + dim mascot + err pill + pixel h1.

Removed in Epic 6 (Strategy B: old removed when last consumer migrates): `BrandFrame`, `StatusIndicator`, `RoomCode`, `ShareActions` — don't reintroduce, use the new components above.

**Hydration trap:** Avoid `grid-template-areas: "..."` inside `<style>{...}</style>` JSX children — SSR escapes the quotes to `&quot;` causing a mismatch. Use explicit `grid-column` + `grid-row` placement on children instead.

**i18n parity gate:** `npm run i18n:check` (scripts/i18nParityCheck.js) regex-walks `i18n/dict.ts` and asserts every `tr:` key has an `en:` twin. Run after adding any new copy.

### Sockets

`lib/socket/server.js` has one namespace; the handshake middleware validates `auth.roomId` and **joins the socket to the socket.io room `room:<roomId>`** (D-5/D-6) — a missing `roomId` falls back to the synthetic `'default'` room. Events are rate-limited per `(ip, event)` + `(deviceId, event)` via `lib/rateLimit.js`. The admin role is identified by a signed cookie (`lib/adminAuth.js`) read off the handshake. Device identity persists via `pc_device_id` cookie (used to reattach players across reconnects, per room).

### MongoDB

`lib/db.js` connects on boot but the app degrades gracefully if Mongo is down: `validateEnv` only warns in dev, the settings loader falls back to defaults, and matches just don't persist. **Don't add hard Mongo dependencies in hot paths.** Models live in `models/` (`Match.js`, `Settings.js`, `Vote.js`).

### i18n

`i18n/dict.ts` has flat TR + EN dictionaries, accessed via `useI18n().t(key)`. When adding a key, **add it to both `tr` and `en` blocks** in the same edit. Stage uses TR by default; preview pages force TR (`forceLang="tr"`).

## Working in this repo

- **Brand & SEO assets**: master logo `public/logo.svg` (full lockup), `public/logo-mark.svg` (axolotl only), `public/logo-wordmark.svg` (wordmark only). PNG/ICO assets generated by `scripts/build-icons.js` (run after logo SVG changes; needs `sharp` + `png-to-ico`). Next.js metadata file convention: `app/icon.png`, `app/apple-icon.png`, `app/opengraph-image.png`, `app/twitter-image.png` are auto-served. SEO routes: `app/robots.ts`, `app/sitemap.ts`, `app/manifest.ts`. Per-page metadata is in route's server component (`page.tsx`), `*PageClient.tsx` holds the `'use client'` body. Brand brief: `mockups/brand-design.md`.
- After backend (`lib/`, `server.js`, `models/`) changes, the dev server **must be restarted** — Next's HMR only watches the Next side.
- After changing `.env`, restart the dev server (env is loaded at boot via `@next/env`).
- When stopping a dev server in this codebase, prefer stopping the npm parent task — orphaned child `node` may hold port 3000; on Windows, kill by PID via PowerShell `Stop-Process -Id <pid> -Force`.
- Use `npm run typecheck` to verify after edits (this is also the CI deploy gate) — there is no unit-test framework; `npm run smoke` (matchSmoke + multiRoomSmoke) is the closest thing to an integration test and requires a running server.
- The `mockups/` directory holds standalone HTML mockups used as design-spec artifacts. They are not built by Next; serve via `python -m http.server` from inside `mockups/` if you need to view them.
- `public/uploads/` is the local STORAGE_PROVIDER target — generated images land here in dev; gitignored aside from the directory marker.
- Production runs as a **Dockerized container on a single cloud VM**, deployed over SSH by GitHub Actions (`.github/workflows/deploy.yml`: push to `main` → `npm run typecheck` gate → SSH → `deploy/deploy.sh` container swap, serialized by a `deploy-production` concurrency group). It is **not** serverless Cloud Run. State is single-instance / RAM-authoritative — keep it that way (sockets + in-RAM rooms assume one hot process). See `docs/DEPLOY-VM.md`, `Dockerfile`, `docker-compose.yml`, `deploy/`.
