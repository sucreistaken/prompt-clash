'use client';

import { useState } from 'react';
import { C, FONT, StageFonts, StageKeyframes, useCountdown } from '@/components/stage/atmosphere';
import { BgAtmosphere } from '@/components/common/BgAtmosphere';
import { AppHeader } from '@/components/common/AppHeader';
import { useGameState } from '../useGameState';
import { useI18n } from '../i18nContext';

/**
 * M-4 · Final oyu (Tournament FINAL_DUEL)
 *
 * Phase-aware: adapts rendering to state.phase sub-states:
 *   PREP  (VS_INTRO | PROMPTING | GENERATING)  — name cards + "oluşturuluyor" hint
 *   JUDGING (SCORING)                           — images shown, no vote
 *   VOTE  (VOTING | TIEBREAK_VOTE)              — tappable image cards + countdown
 *   RESULT                                      — winner reveal with pixel crown
 *
 * finalists[0] → slot A (state.players.A), finalists[1] → slot B (state.players.B).
 * Desktop @media scaling kept via .tfv-root / .tfv-title / .tfv-cards class names.
 */

// Typographic reaction glyphs (no emoji), per the v3 mockup's ♥ ▲ ★ row.
const REACTION_GLYPHS = ['♥', '▲', '★', '✕'];

// ─── Pixel crown SVG (no emoji) ───────────────────────────────────────────────
function PixelCrown({ color }: { color: string }) {
  return (
    <svg
      width="22"
      height="16"
      viewBox="0 0 22 16"
      aria-hidden
      style={{ display: 'block', flexShrink: 0 }}
    >
      <polygon points="1,16 1,7 6,11 11,1 16,11 21,7 21,16" fill={color} />
    </svg>
  );
}

// ─── Image tile — fixed aspect ratio, placeholder when null ──────────────────
function FinalistImage({
  imageUrl,
  label,
  pending,
}: {
  imageUrl: string | null;
  label: string;
  pending: string;
}) {
  return (
    <div
      style={{
        width: '100%',
        aspectRatio: '4/3',
        borderRadius: 0,
        overflow: 'hidden',
        background: 'var(--pc-ink2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={label}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <span
          className="tfv-img-pending"
          style={{
            fontFamily: FONT.mono,
            fontSize: 11,
            color: C.text3,
            textAlign: 'center',
            padding: '0 12px',
          }}
        >
          {pending}
        </span>
      )}
    </div>
  );
}

// ─── Shared slot badge ────────────────────────────────────────────────────────
function SlotBadge({
  slot,
  isA,
  size = 36,
}: {
  slot: 'A' | 'B';
  isA: boolean;
  size?: number;
}) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: size <= 28 ? 6 : 8,
        background: isA ? C.accent : C.bColor,
        color: isA ? C.accentInk : C.bInk,
        fontFamily: FONT.pixel,
        fontSize: size <= 28 ? 12 : 14,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 'none',
      }}
    >
      {slot}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function TFinalVote() {
  const { state, tournament, vote } = useGameState();
  const { t } = useI18n();
  const [voted, setVoted] = useState(false);

  const finalists = tournament?.finalists ?? [];
  const finalist0 = finalists[0] ?? null; // → slot A
  const finalist1 = finalists[1] ?? null; // → slot B

  const phase = state?.phase ?? 'IDLE';
  const playerA = state?.players?.A ?? null;
  const playerB = state?.players?.B ?? null;
  const winner = state?.winner ?? null;

  const cd = useCountdown(
    state?.phaseEndsAt ?? null,
    state?.durations?.votingDurationSec ?? 30,
  );

  const showTimer = phase === 'VOTING' || phase === 'TIEBREAK_VOTE';

  function handleVote(slot: 'A' | 'B') {
    if (voted) return;
    vote(slot);
    setVoted(true);
  }

  // ── Determine view mode from duel sub-phase ──────────────────────────────
  type ViewMode = 'PREP' | 'JUDGING' | 'VOTE' | 'RESULT';
  let viewMode: ViewMode;
  switch (phase) {
    case 'VS_INTRO':
    case 'PROMPTING':
    case 'GENERATING':
      viewMode = 'PREP';
      break;
    case 'SCORING':
      viewMode = 'JUDGING';
      break;
    case 'VOTING':
    case 'TIEBREAK_VOTE':
      viewMode = 'VOTE';
      break;
    case 'RESULT':
      viewMode = 'RESULT';
      break;
    default:
      viewMode = 'PREP';
  }

  const slots = [
    { finalist: finalist0, slot: 'A' as const, player: playerA, isA: true },
    { finalist: finalist1, slot: 'B' as const, player: playerB, isA: false },
  ];

  const winnerNickname =
    winner === 'A'
      ? (finalist0?.nickname ?? 'A')
      : winner === 'B'
        ? (finalist1?.nickname ?? 'B')
        : null;

  return (
    <>
      <StageFonts />
      <StageKeyframes />
      <BgAtmosphere variant="default" />
      <main
        className="tfv-root"
        style={{
          position: 'relative',
          zIndex: 1,
          minHeight: '100dvh',
          background: C.ink,
          color: C.text,
          fontFamily: FONT.body,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* ── Top bar ── */}
        <header
          style={{
            flex: 'none',
            background: C.ink,
            borderBottom: `1px solid ${C.line}`,
            padding: '14px 20px',
            paddingTop: 'calc(14px + env(safe-area-inset-top))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <AppHeader />

          {/* Countdown — only during voting phases */}
          {showTimer && (
            <span
              role="timer"
              aria-live="polite"
              style={{
                fontFamily: FONT.mono,
                fontSize: 15,
                color: cd.danger ? C.live : C.text2,
                fontVariantNumeric: 'tabular-nums',
                animation: cd.danger ? 'pcPulseSoft 1.4s ease-in-out infinite' : 'none',
                flex: 'none',
              }}
            >
              {String(Math.floor(cd.value / 60)).padStart(2, '0')}:
              {String(cd.value % 60).padStart(2, '0')}
            </span>
          )}
        </header>

        {/* ── Body ── */}
        <div
          style={{
            flex: 1,
            padding: '24px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}
        >

          {/* ════ PREP — finalists are writing / generating ════ */}
          {viewMode === 'PREP' && (
            <>
              <div style={{ textAlign: 'center' }}>
                <div
                  className="tfv-title"
                  style={{
                    fontFamily: FONT.pixel,
                    fontSize: 13,
                    letterSpacing: '0.10em',
                    color: C.accent,
                    marginBottom: 6,
                  }}
                >
                  {t('tFinalPrepTitle')}
                </div>
                <p
                  style={{
                    fontFamily: FONT.mono,
                    fontSize: 12,
                    color: C.text2,
                    margin: 0,
                  }}
                >
                  {t('tFinalPrepBody')}
                </p>
              </div>

              <div
                className="tfv-cards"
                style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}
              >
                {slots.map(({ finalist, slot, isA }) => {
                  if (!finalist) return null;
                  return (
                    <div
                      key={slot}
                      style={{
                        width: '100%',
                        padding: '22px 20px',
                        borderRadius: 14,
                        border: `1.5px solid ${isA ? C.accent : C.bColor}`,
                        background: isA
                          ? 'rgba(124,77,255,0.10)'
                          : 'rgba(174,210,74,0.08)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                      }}
                    >
                      <SlotBadge slot={slot} isA={isA} size={36} />
                      <span
                        style={{
                          fontFamily: FONT.pixel,
                          fontSize: 16,
                          letterSpacing: '0.04em',
                          color: isA ? C.accent : C.bColor,
                          flex: 1,
                        }}
                      >
                        {finalist.nickname}
                      </span>
                      <span
                        className="tfv-img-pending"
                        style={{ fontFamily: FONT.mono, fontSize: 10, color: C.text3 }}
                      >
                        {t('tFinalImgPending')}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* ════ JUDGING — AI scoring, images visible, no vote ════ */}
          {viewMode === 'JUDGING' && (
            <>
              <div style={{ textAlign: 'center' }}>
                <div
                  className="tfv-title"
                  style={{
                    fontFamily: FONT.pixel,
                    fontSize: 13,
                    letterSpacing: '0.10em',
                    color: C.accent,
                    marginBottom: 6,
                  }}
                >
                  {t('tFinalJudgingTitle')}
                </div>
              </div>

              <div
                className="tfv-cards"
                style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}
              >
                {slots.map(({ finalist, slot, player, isA }) => {
                  if (!finalist) return null;
                  return (
                    <div
                      key={slot}
                      style={{
                        borderRadius: 14,
                        border: `1.5px solid ${isA ? C.accent : C.bColor}`,
                        background: isA
                          ? 'rgba(124,77,255,0.10)'
                          : 'rgba(174,210,74,0.08)',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                      }}
                    >
                      <FinalistImage
                        imageUrl={player?.imageUrl ?? null}
                        label={finalist.nickname}
                        pending={t('tFinalImgPending')}
                      />
                      <div
                        style={{
                          padding: '10px 16px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                        }}
                      >
                        <SlotBadge slot={slot} isA={isA} size={28} />
                        <span
                          style={{
                            fontFamily: FONT.pixel,
                            fontSize: 14,
                            color: isA ? C.accent : C.bColor,
                          }}
                        >
                          {finalist.nickname}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* ════ VOTE — audience votes ════ */}
          {viewMode === 'VOTE' && (
            <>
              <div style={{ textAlign: 'center' }}>
                <div
                  className="tfv-title"
                  style={{
                    fontFamily: FONT.pixel,
                    fontSize: 13,
                    letterSpacing: '0.10em',
                    color: C.accent,
                    marginBottom: 6,
                  }}
                >
                  {t('tFinalVoteTitle')}
                </div>
                <p
                  style={{
                    fontFamily: FONT.mono,
                    fontSize: 12,
                    color: C.text2,
                    margin: 0,
                  }}
                >
                  {voted ? t('voted') : t('tFinalVotePick')}
                </p>
              </div>

              <div
                className="tfv-cards"
                style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}
              >
                {slots.map(({ finalist, slot, player, isA }) => {
                  if (!finalist) return null;
                  return (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => handleVote(slot)}
                      disabled={voted}
                      style={{
                        width: '100%',
                        borderRadius: 14,
                        border: `1.5px solid ${isA ? C.accent : C.bColor}`,
                        background: isA
                          ? 'rgba(124,77,255,0.10)'
                          : 'rgba(174,210,74,0.08)',
                        color: C.text,
                        cursor: voted ? 'default' : 'pointer',
                        textAlign: 'left',
                        opacity: voted ? 0.7 : 1,
                        transition:
                          'transform 120ms ease-out, box-shadow 140ms ease-out, opacity 200ms ease-out',
                        boxShadow: isA
                          ? '0 6px 24px rgba(124,77,255,0.14)'
                          : '0 6px 24px rgba(174,210,74,0.10)',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        padding: 0,
                      }}
                    >
                      <FinalistImage
                        imageUrl={player?.imageUrl ?? null}
                        label={finalist.nickname}
                        pending={t('tFinalImgPending')}
                      />
                      <div
                        style={{
                          padding: '12px 20px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 14,
                        }}
                      >
                        <SlotBadge slot={slot} isA={isA} size={36} />
                        <span
                          style={{
                            fontFamily: FONT.pixel,
                            fontSize: 16,
                            letterSpacing: '0.04em',
                            color: isA ? C.accent : C.bColor,
                            flex: 1,
                          }}
                        >
                          {finalist.nickname}
                        </span>
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 16 16"
                          fill="none"
                          aria-hidden
                        >
                          <path
                            d="M6 3L11 8L6 13"
                            stroke={isA ? 'var(--pc-accent)' : 'var(--pc-b)'}
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Decorative typographic reaction row */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  gap: 14,
                  paddingTop: 8,
                }}
              >
                {REACTION_GLYPHS.map((glyph) => (
                  <span
                    key={glyph}
                    aria-hidden="true"
                    style={{ fontSize: 20, opacity: 0.5, userSelect: 'none' }}
                  >
                    {glyph}
                  </span>
                ))}
              </div>
            </>
          )}

          {/* ════ RESULT — winner reveal ════ */}
          {viewMode === 'RESULT' && (
            <>
              <div style={{ textAlign: 'center' }}>
                <div
                  className="tfv-title"
                  style={{
                    fontFamily: FONT.pixel,
                    fontSize: 13,
                    letterSpacing: '0.10em',
                    color: C.accent,
                    marginBottom: 6,
                  }}
                >
                  {t('tFinalResultTitle')}
                </div>
                {winner === 'TIE' ? (
                  <p
                    style={{
                      fontFamily: FONT.pixel,
                      fontSize: 14,
                      color: C.text2,
                      margin: 0,
                    }}
                  >
                    {t('tie')}
                  </p>
                ) : winnerNickname ? (
                  <p
                    style={{
                      fontFamily: FONT.pixel,
                      fontSize: 18,
                      color: C.bone,
                      margin: 0,
                      letterSpacing: '0.05em',
                    }}
                  >
                    {winnerNickname}
                  </p>
                ) : null}
              </div>

              <div
                className="tfv-cards"
                style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}
              >
                {slots.map(({ finalist, slot, player, isA }) => {
                  if (!finalist) return null;
                  const isWinner = winner === slot;
                  const isTie = winner === 'TIE';
                  return (
                    <div
                      key={slot}
                      style={{
                        borderRadius: 14,
                        border: `${isWinner || isTie ? 2 : 1.5}px solid ${isA ? C.accent : C.bColor}`,
                        background: isA
                          ? 'rgba(124,77,255,0.10)'
                          : 'rgba(174,210,74,0.08)',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: isWinner
                          ? isA
                            ? '0 0 32px rgba(124,77,255,0.5), 0 6px 24px rgba(124,77,255,0.3)'
                            : '0 0 32px rgba(174,210,74,0.5), 0 6px 24px rgba(174,210,74,0.3)'
                          : undefined,
                      }}
                    >
                      <FinalistImage
                        imageUrl={player?.imageUrl ?? null}
                        label={finalist.nickname}
                        pending={t('tFinalImgPending')}
                      />
                      <div
                        style={{
                          padding: '10px 16px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                        }}
                      >
                        <SlotBadge slot={slot} isA={isA} size={28} />
                        <span
                          style={{
                            fontFamily: FONT.pixel,
                            fontSize: 14,
                            color: isA ? C.accent : C.bColor,
                            flex: 1,
                          }}
                        >
                          {finalist.nickname}
                        </span>
                        {isWinner && (
                          <PixelCrown color={isA ? 'var(--pc-accent)' : 'var(--pc-b)'} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <style>{`
          @keyframes pcPulseSoft {
            0%, 100% { transform: scale(1); opacity: 1; }
            50%       { transform: scale(1.04); opacity: 0.9; }
          }
          @keyframes tfvPendingPulse {
            0%, 100% { opacity: 0.45; }
            50%       { opacity: 1; }
          }
          .tfv-img-pending { animation: tfvPendingPulse 2s ease-in-out infinite; }
          @media (min-width: 960px) {
            .tfv-root { max-width: 680px; margin-left: auto; margin-right: auto; }
            .tfv-title { font-size: 18px !important; }
            .tfv-cards { gap: 16px !important; }
          }
        `}</style>
      </main>
    </>
  );
}
