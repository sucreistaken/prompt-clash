'use client';

import { C, FONT, StageFonts, StageKeyframes } from '@/components/stage/atmosphere';
import { BgAtmosphere } from '@/components/common/BgAtmosphere';
import { MascotFrame } from '@/components/common/MascotFrame';
import { AppHeader } from '@/components/common/AppHeader';
import { useGameState } from '../useGameState';
import { useI18n } from '../i18nContext';

/**
 * Champion celebration screen (Tournament COMPLETE).
 *
 * Uses the existing orphaned i18n key `tChampionIs` as the champion label.
 * Variant: gold/celebratory — achieved via lime bg + particles + accent styling.
 */
export function TChampion() {
  const { tournament } = useGameState();
  const { t } = useI18n();

  const champion = tournament?.champion ?? null;

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
          className="tc-center"
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
          {/* Crown icon — pixel-art SVG (no emoji), matches the stage/mockup crown */}
          <div
            aria-hidden="true"
            style={{ filter: 'drop-shadow(0 4px 12px rgba(174,210,74,0.40))' }}
          >
            <svg width="56" height="38" viewBox="0 0 24 16" shapeRendering="crispEdges">
              <g fill="#ffd24a">
                <rect x="2" y="10" width="20" height="4" />
                <rect x="2" y="4" width="4" height="8" />
                <rect x="10" y="2" width="4" height="10" />
                <rect x="18" y="4" width="4" height="8" />
                <rect x="9" y="0" width="6" height="2" />
              </g>
            </svg>
          </div>

          <MascotFrame
            size={100}
            variant="lime"
            particles
            desktopSize={160}
          />

          {/* Champion label */}
          <div
            style={{
              fontFamily: FONT.pixel,
              fontSize: 11,
              letterSpacing: '0.18em',
              color: C.text3,
              textTransform: 'uppercase' as const,
            }}
          >
            {t('tChampionTitle')}
          </div>

          {/* Champion name */}
          {champion ? (
            <div
              className="tc-name"
              style={{
                fontFamily: FONT.pixel,
                fontSize: 30,
                letterSpacing: '0.06em',
                color: C.bColor,
                lineHeight: 1.1,
                maxWidth: '22ch',
                wordBreak: 'break-word' as const,
              }}
            >
              {champion.nickname}
            </div>
          ) : (
            <div
              style={{
                fontFamily: FONT.pixel,
                fontSize: 16,
                color: C.text2,
              }}
            >
              {t('tChampionIs')}
            </div>
          )}

          {/* "tChampionIs" label usage — reuse existing orphaned key as subtitle */}
          {champion && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '6px 16px',
                borderRadius: 999,
                border: `1px solid ${C.bColor}`,
                background: 'rgba(174,210,74,0.10)',
                fontFamily: FONT.mono,
                fontSize: 12,
                color: C.bColor,
                letterSpacing: '0.10em',
              }}
            >
              {t('tChampionIs')}
            </div>
          )}

          {/* Congratulations message */}
          <p
            style={{
              fontFamily: FONT.mono,
              fontSize: 13,
              color: C.text2,
              margin: 0,
              lineHeight: 1.6,
              maxWidth: '28ch',
            }}
          >
            {t('tChampionCongrats')}
          </p>
        </div>
      </main>
      <style>{`
        @media (min-width: 960px) {
          .tc-center { gap: 28px !important; max-width: 560px; margin-left: auto; margin-right: auto; }
          .tc-name { font-size: 44px !important; }
        }
      `}</style>
    </>
  );
}
