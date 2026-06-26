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
 * Two finalist cards, tappable. Tapping calls vote('A')|vote('B')
 * (finalists[0]→'A', finalists[1]→'B'). Emoji reaction row is decorative.
 * Countdown from phaseEndsAt.
 */

// Typographic reaction glyphs (no emoji), per the v3 mockup's ♥ ▲ ★ row.
const REACTION_GLYPHS = ['♥', '▲', '★', '✕'];

export function TFinalVote() {
  const { state, tournament, vote } = useGameState();
  const { t } = useI18n();
  const [voted, setVoted] = useState(false);

  const finalists = tournament?.finalists ?? [];
  const finalist0 = finalists[0] ?? null;
  const finalist1 = finalists[1] ?? null;

  const cd = useCountdown(
    state?.phaseEndsAt ?? null,
    state?.durations?.votingDurationSec ?? 30,
  );

  function handleVote(slot: 'A' | 'B') {
    if (voted) return;
    vote(slot);
    setVoted(true);
  }

  return (
    <>
      <StageFonts />
      <StageKeyframes />
      <BgAtmosphere variant="default" />
      <main
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
        {/* Top bar */}
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

          {/* Timer */}
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
            {String(Math.floor(cd.value / 60)).padStart(2, '0')}:{String(cd.value % 60).padStart(2, '0')}
          </span>
        </header>

        {/* Body */}
        <div
          style={{
            flex: 1,
            padding: '24px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}
        >
          {/* Title */}
          <div style={{ textAlign: 'center' }}>
            <div
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

          {/* Finalist cards */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              flex: 1,
            }}
          >
            {(
              [
                { finalist: finalist0, slot: 'A' as const },
                { finalist: finalist1, slot: 'B' as const },
              ] as const
            ).map(({ finalist, slot }) => {
              if (!finalist) return null;
              const isA = slot === 'A';
              return (
                <button
                  key={slot}
                  type="button"
                  onClick={() => handleVote(slot)}
                  disabled={voted}
                  style={{
                    width: '100%',
                    padding: '22px 20px',
                    borderRadius: 14,
                    border: `1.5px solid ${isA ? C.accent : C.bColor}`,
                    background: isA
                      ? 'rgba(124,77,255,0.10)'
                      : 'rgba(174,210,74,0.08)',
                    color: C.text,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    cursor: voted ? 'default' : 'pointer',
                    textAlign: 'left',
                    opacity: voted ? 0.7 : 1,
                    transition: 'transform 120ms ease-out, box-shadow 140ms ease-out, opacity 200ms ease-out',
                    boxShadow: isA
                      ? '0 6px 24px rgba(124,77,255,0.14)'
                      : '0 6px 24px rgba(174,210,74,0.10)',
                  }}
                >
                  {/* Slot badge */}
                  <span
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      background: isA ? C.accent : C.bColor,
                      color: isA ? C.accentInk : C.bInk,
                      fontFamily: FONT.pixel,
                      fontSize: 14,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flex: 'none',
                    }}
                  >
                    {slot}
                  </span>

                  {/* Nickname */}
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

                  {/* Arrow */}
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <path
                      d="M6 3L11 8L6 13"
                      stroke={isA ? 'var(--pc-accent)' : 'var(--pc-b)'}
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              );
            })}
          </div>

          {/* Decorative emoji reaction row */}
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
                style={{
                  fontSize: 20,
                  opacity: 0.5,
                  userSelect: 'none',
                }}
              >
                {glyph}
              </span>
            ))}
          </div>
        </div>

        <style>{`
          @keyframes pcPulseSoft {
            0%, 100% { transform: scale(1); opacity: 1; }
            50%       { transform: scale(1.04); opacity: 0.9; }
          }
        `}</style>
      </main>
    </>
  );
}
