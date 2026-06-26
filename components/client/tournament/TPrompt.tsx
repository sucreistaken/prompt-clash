'use client';

import { useState } from 'react';
import { C, FONT, StageFonts, StageKeyframes, useCountdown, PROMPT_MAX } from '@/components/stage/atmosphere';
import { BgAtmosphere } from '@/components/common/BgAtmosphere';
import { AppHeader } from '@/components/common/AppHeader';
import { useGameState } from '../useGameState';
import { useI18n } from '../i18nContext';

/**
 * M-2 · Prompt yaz (Tournament Round Prompting)
 *
 * Shown while tournament.phase === 'ROUND_PROMPTING' and the player is still active.
 * - Round pill + countdown timer
 * - KONU label + topic in pixel/lime font
 * - Textarea + "GÖNDER →" button
 * - After submit: locked confirmation card
 */
export function TPrompt() {
  const { state, tournament, myEntrant, submitTournamentPrompt } = useGameState();
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [focused, setFocused] = useState(false);

  const cd = useCountdown(
    state?.phaseEndsAt ?? null,
    state?.durations?.promptDurationSec ?? 60,
  );

  const topic = tournament?.topic?.promptTr ?? '';
  const roundLabel = `${t('tPromptRoundLabel').replace('{n}', String((tournament?.roundIndex ?? 0) + 1))}`;
  const groupNum =
    tournament?.mode === 'B' && tournament?.groupPhase && myEntrant?.groupIndex != null
      ? myEntrant.groupIndex + 1
      : null;
  const empty = text.trim().length === 0;
  const isLast10 = cd.value <= 10 && cd.value > 0 && !submitted;
  const counterWarn = text.length >= 250;

  function handleSubmit() {
    if (submitted || empty) return;
    submitTournamentPrompt(text.trim());
    setSubmitted(true);
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
        {/* Sticky top bar */}
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
          {/* Round pill + optional group badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '5px 11px',
                borderRadius: 999,
                border: `1px solid ${C.live}`,
                background: 'rgba(255,92,92,0.10)',
                fontFamily: FONT.mono,
                fontSize: 11,
                color: C.live,
                letterSpacing: '0.10em',
              }}
            >
              {roundLabel}
            </div>
            {groupNum != null && (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '4px 10px',
                  borderRadius: 999,
                  border: `1px solid var(--pc-b)`,
                  background: 'rgba(174,210,74,0.10)',
                  fontFamily: FONT.mono,
                  fontSize: 11,
                  color: 'var(--pc-b)',
                  letterSpacing: '0.12em',
                }}
              >
                {t('tGroupBadge')} {groupNum}
              </div>
            )}
          </div>

          {/* Timer */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {isLast10 && (
              <span
                style={{
                  background: C.live,
                  color: '#fff',
                  fontFamily: FONT.pixel,
                  fontSize: 9,
                  letterSpacing: '0.10em',
                  padding: '2px 7px',
                  borderRadius: 2,
                }}
              >
                {t('last10').toUpperCase()}
              </span>
            )}
            <span
              role="timer"
              aria-live="polite"
              style={{
                fontFamily: FONT.mono,
                fontSize: 15,
                color: cd.danger ? C.live : C.text2,
                fontVariantNumeric: 'tabular-nums',
                animation: cd.danger ? 'pcPulseSoft 1.4s ease-in-out infinite' : 'none',
              }}
            >
              {String(Math.floor(cd.value / 60)).padStart(2, '0')}:{String(cd.value % 60).padStart(2, '0')}
            </span>
          </div>
        </header>

        {/* Body */}
        <div
          style={{
            flex: 1,
            padding: '20px 20px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          {/* Topic section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span
              style={{
                fontFamily: FONT.pixel,
                fontSize: 10,
                letterSpacing: '0.18em',
                color: C.text3,
                textTransform: 'uppercase',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              {t('tPromptTopicLabel')}
              <span style={{ display: 'inline-block', width: 28, height: 1, background: C.line }} />
            </span>
            <div
              style={{
                fontFamily: FONT.pixel,
                fontSize: 16,
                lineHeight: 1.3,
                color: 'var(--pc-b)',
                letterSpacing: '0.04em',
              }}
            >
              {topic}
            </div>
          </div>

          {/* Prompt textarea */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
            <span
              style={{
                fontFamily: FONT.pixel,
                fontSize: 10,
                letterSpacing: '0.18em',
                color: C.accent,
                textTransform: 'uppercase',
              }}
            >
              {t('yourPrompt').toUpperCase()}
            </span>
            <textarea
              rows={5}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={t('tPromptPlaceholder')}
              maxLength={PROMPT_MAX}
              disabled={submitted}
              style={{
                width: '100%',
                flex: 1,
                minHeight: 140,
                padding: '14px 16px',
                borderRadius: 12,
                background: C.ink2,
                color: submitted ? C.text2 : C.bone,
                border: `1.5px solid ${submitted ? C.line : focused ? C.accent : C.line}`,
                boxShadow: !submitted && focused ? '0 0 0 4px rgba(124,77,255,0.14)' : 'none',
                fontFamily: FONT.mono,
                fontSize: 16,
                lineHeight: 1.55,
                resize: 'none',
                outline: 'none',
                opacity: submitted ? 0.75 : 1,
                transition: 'border-color 160ms ease-out, box-shadow 200ms ease-out',
              }}
            />
            <span
              style={{
                fontFamily: FONT.mono,
                fontSize: 12,
                color: counterWarn ? C.live : C.text3,
                textAlign: 'right',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {text.length} / {PROMPT_MAX}
            </span>
          </div>
        </div>

        {/* Bottom CTA / locked */}
        <div
          style={{
            flex: 'none',
            background: C.ink,
            borderTop: `1px solid ${C.line}`,
            padding: '12px 20px',
            paddingBottom: 'max(env(safe-area-inset-bottom), 14px)',
          }}
        >
          {submitted ? (
            <div
              style={{
                padding: '14px 16px',
                borderRadius: 12,
                background: 'rgba(174,210,74,0.10)',
                border: `1.5px solid var(--pc-b)`,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontFamily: FONT.pixel,
                fontSize: 12,
                letterSpacing: '0.08em',
                color: 'var(--pc-b)',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path
                  d="M3 8 L7 12 L13 4"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ stroke: 'var(--pc-b)' }}
                />
              </svg>
              {t('tPromptSubmitted').toUpperCase()}
            </div>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={empty}
              style={{
                width: '100%',
                height: 52,
                borderRadius: 12,
                border: empty ? `1.5px solid ${C.line}` : 'none',
                background: empty ? 'transparent' : C.accent,
                color: empty ? C.text3 : 'var(--pc-accent-ink)',
                boxShadow: empty ? 'none' : '0 12px 28px rgba(124,77,255,0.30)',
                fontFamily: FONT.pixel,
                fontSize: 13,
                letterSpacing: '0.08em',
                cursor: empty ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                transition: 'transform 120ms ease-out, background 160ms ease-out',
              }}
            >
              {t('tPromptSend')}
            </button>
          )}
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
