'use client';

import { C, FONT, StageFonts, StageKeyframes } from '@/components/stage/atmosphere';
import { BgAtmosphere } from '@/components/common/BgAtmosphere';
import { MascotFrame } from '@/components/common/MascotFrame';
import { AppHeader } from '@/components/common/AppHeader';
import { useGameState } from '../useGameState';
import { useI18n } from '../i18nContext';

/**
 * M-3a · Geçtin (Tournament Round Cut — survivor)
 *
 * Celebratory screen shown when the player survives the cut.
 * Displays their score and round index. Variant: lime/positive.
 */
export function TPassed() {
  const { tournament, myEntrant } = useGameState();
  const { t } = useI18n();

  const roundNum = (tournament?.roundIndex ?? 0) + 1;
  const score = myEntrant?.lastScore ?? null;
  const activeCount = tournament?.activeCount ?? 0;
  const totalCount = tournament?.totalCount ?? 0;
  const groupNum =
    tournament?.mode === 'B' && tournament?.groupPhase && myEntrant?.groupIndex != null
      ? myEntrant.groupIndex + 1
      : null;

  return (
    <>
      <StageFonts />
      <StageKeyframes />
      <BgAtmosphere variant="lime" />
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
          className="tp-center"
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 20,
            textAlign: 'center',
          }}
        >
          <MascotFrame
            size={100}
            variant="lime"
            particles
            label={t('tPassedMascotLabel')}
            desktopSize={160}
          />

          {/* Main title */}
          <div
            className="tp-title"
            style={{
              fontFamily: FONT.pixel,
              fontSize: 28,
              letterSpacing: '0.06em',
              color: C.bColor,
              lineHeight: 1.1,
            }}
          >
            {t('tPassedTitle')}
          </div>

          {/* Round indicator */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '5px 14px',
              borderRadius: 999,
              border: `1px solid ${C.bColor}`,
              background: 'rgba(174,210,74,0.10)',
              fontFamily: FONT.mono,
              fontSize: 11,
              color: C.bColor,
              letterSpacing: '0.12em',
            }}
          >
            {t('tPassedRound').replace('{n}', String(roundNum))}
          </div>

          {/* Mode B group badge */}
          {groupNum != null && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '4px 12px',
                borderRadius: 999,
                border: `1px solid ${C.bColor}`,
                background: 'rgba(174,210,74,0.10)',
                fontFamily: FONT.mono,
                fontSize: 11,
                color: C.bColor,
                letterSpacing: '0.14em',
              }}
            >
              {t('tGroupBadge')} {groupNum}
            </div>
          )}

          {/* Score card */}
          {score !== null && (
            <div
              style={{
                padding: '20px 28px',
                borderRadius: 16,
                background: 'rgba(174,210,74,0.08)',
                border: `1.5px solid ${C.bColor}`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                minWidth: 160,
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
                className="tp-score-num"
                style={{
                  fontFamily: FONT.pixel,
                  fontSize: 48,
                  color: C.bColor,
                  lineHeight: 1,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {score}
              </span>
            </div>
          )}

          {/* Survivors count */}
          {activeCount > 0 && (
            <p
              style={{
                fontFamily: FONT.mono,
                fontSize: 12,
                color: C.text2,
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              {t('tPassedSurvivors')
                .replace('{active}', String(activeCount))
                .replace('{total}', String(totalCount))}
            </p>
          )}

          {/* Next round hint */}
          <p
            className="tp-body-text"
            style={{
              fontFamily: FONT.mono,
              fontSize: 13,
              color: C.bColor,
              margin: 0,
              lineHeight: 1.5,
              maxWidth: '28ch',
            }}
          >
            {t('tPassedNext')}
          </p>
        </div>
      </main>
      <style>{`
        @media (min-width: 960px) {
          .tp-center { gap: 28px !important; max-width: 560px; margin-left: auto; margin-right: auto; }
          .tp-title { font-size: 40px !important; }
          .tp-score-num { font-size: 68px !important; }
          .tp-body-text { font-size: 16px !important; max-width: 36ch !important; }
        }
      `}</style>
    </>
  );
}
