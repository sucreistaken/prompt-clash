'use client';

import { C, FONT, StageFonts, StageKeyframes } from '@/components/stage/atmosphere';
import { BgAtmosphere } from '@/components/common/BgAtmosphere';
import { MascotFrame } from '@/components/common/MascotFrame';
import { AppHeader } from '@/components/common/AppHeader';
import { useGameState } from '../useGameState';
import { useI18n } from '../i18nContext';

/**
 * M-3b · Elendin (Tournament elimination — soft-landing)
 *
 * Rage-quit-prevention screen. Shows a friendly "X kişiyi geçtin" success card
 * so elimination still feels like an achievement. Variant: danger/dim.
 */
export function TEliminated() {
  const { tournament, myEntrant } = useGameState();
  const { t } = useI18n();

  const totalCount = tournament?.totalCount ?? 0;
  const activeCount = tournament?.activeCount ?? 0;

  // Number of people the player outlasted: totalCount minus survivors (activeCount).
  // Use eliminated count as proxy — anyone who didn't survive was beaten.
  const beatCount = Math.max(0, totalCount - activeCount - 1);

  const score = myEntrant?.lastScore ?? null;

  return (
    <>
      <StageFonts />
      <StageKeyframes />
      <BgAtmosphere variant="danger" />
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
          padding: '20px 20px',
          paddingTop: 'calc(20px + env(safe-area-inset-top))',
          paddingBottom: 'max(env(safe-area-inset-bottom), 20px)',
        }}
      >
        <AppHeader />

        {/* Center area */}
        <div
          className="te-center"
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 18,
            textAlign: 'center',
          }}
        >
          <MascotFrame
            size={90}
            variant="dim"
            desktopSize={144}
          />

          {/* Title */}
          <div
            className="te-title"
            style={{
              fontFamily: FONT.pixel,
              fontSize: 22,
              letterSpacing: '0.06em',
              color: C.live,
              lineHeight: 1.2,
            }}
          >
            {t('tElimTitle')}
          </div>

          {/* Success card */}
          <div
            style={{
              padding: '20px 24px',
              borderRadius: 16,
              background: 'rgba(255,92,92,0.08)',
              border: `1.5px solid ${C.live}`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 10,
              minWidth: 200,
              maxWidth: 280,
            }}
          >
            {score !== null && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                  marginBottom: 6,
                }}
              >
                <span
                  style={{
                    fontFamily: FONT.pixel,
                    fontSize: 10,
                    letterSpacing: '0.18em',
                    color: C.text3,
                    textTransform: 'uppercase',
                  }}
                >
                  {t('tPassedScore')}
                </span>
                <span
                  className="te-score-num"
                  style={{
                    fontFamily: FONT.pixel,
                    fontSize: 38,
                    color: C.live,
                    lineHeight: 1,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {score}
                </span>
              </div>
            )}

            {/* Beat count */}
            <p
              style={{
                fontFamily: FONT.mono,
                fontSize: 13,
                color: C.text,
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              {beatCount > 0
                ? t('tElimBeat').replace('{n}', String(beatCount))
                : t('tElimBeatZero').replace('{total}', String(totalCount))}
            </p>
          </div>

          {/* Share CTA (decorative — non-functional placeholder) */}
          <button
            type="button"
            disabled
            aria-label={t('tElimShare')}
            style={{
              marginTop: 6,
              padding: '12px 28px',
              borderRadius: 10,
              border: `1.5px solid ${C.line}`,
              background: 'rgba(255,255,255,0.04)',
              color: C.text3,
              fontFamily: FONT.pixel,
              fontSize: 11,
              letterSpacing: '0.10em',
              cursor: 'not-allowed',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path
                d="M10 1L13 4L10 7"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M13 4H5C3.34315 4 2 5.34315 2 7V13"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {t('tElimShare')}
          </button>

          {/* Watch encouragement */}
          <p
            style={{
              fontFamily: FONT.mono,
              fontSize: 12,
              color: C.text2,
              margin: 0,
              lineHeight: 1.5,
              maxWidth: '28ch',
            }}
          >
            {t('tElimWatch')}
          </p>
        </div>
      </main>
      <style>{`
        @media (min-width: 960px) {
          .te-center { gap: 26px !important; max-width: 520px; margin-left: auto; margin-right: auto; }
          .te-title { font-size: 32px !important; }
          .te-score-num { font-size: 54px !important; }
        }
      `}</style>
    </>
  );
}
