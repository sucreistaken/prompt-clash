'use client';

import { C, FONT, StageFonts, StageKeyframes } from '@/components/stage/atmosphere';
import { BgAtmosphere } from '@/components/common/BgAtmosphere';
import { MascotFrame } from '@/components/common/MascotFrame';
import { AppHeader } from '@/components/common/AppHeader';
import { useGameState } from '../useGameState';
import { useI18n } from '../i18nContext';

/**
 * M-1 · Katıl (Tournament Lobby)
 *
 * Shown while tournament.phase === 'LOBBY'.
 * Two states:
 *   - not yet joined → QR-framing + player count + join hint
 *   - already joined (myEntrant) → confirmed "Katıldın ✓" card
 */
export function TJoin() {
  const { tournament: t, myEntrant } = useGameState();
  const { t: i18n } = useI18n();

  const joined = !!myEntrant && !myEntrant.eliminated;
  const count = t?.totalCount ?? 0;
  const active = t?.activeCount ?? 0;

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
          padding: '20px 20px',
          paddingTop: 'calc(20px + env(safe-area-inset-top))',
          paddingBottom: 'max(env(safe-area-inset-bottom), 20px)',
        }}
      >
        <AppHeader
          right={
            <span
              style={{
                fontFamily: FONT.mono,
                fontSize: 10,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: C.live,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  background: C.live,
                  borderRadius: '50%',
                  animation: 'pcLivePulse 1.4s ease-in-out infinite',
                }}
              />
              {i18n('live')}
            </span>
          }
        />

        {/* Center area */}
        <div
          className="tj-center"
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
            size={96}
            variant="default"
            particles
            label={i18n('tJoinLobbyLabel')}
            desktopSize={154}
          />

          {/* Title */}
          <div
            className="tj-title"
            style={{
              fontFamily: FONT.pixel,
              fontSize: 13,
              letterSpacing: '0.08em',
              color: C.bone,
              lineHeight: 1.3,
            }}
          >
            {i18n('tJoinTitle')}
          </div>

          {/* Player count pill */}
          <div
            className="tj-count"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '6px 14px',
              borderRadius: 999,
              border: `1px solid ${C.accent}`,
              background: 'rgba(124,77,255,0.10)',
              fontFamily: FONT.mono,
              fontSize: 12,
              color: 'var(--pc-accent)',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
              <circle cx="6.5" cy="4.5" r="2.5" style={{ stroke: 'var(--pc-accent)' }} strokeWidth="1.5" fill="none" />
              <path d="M1.5 12c0-2.76 2.24-5 5-5s5 2.24 5 5" style={{ stroke: 'var(--pc-accent)' }} strokeWidth="1.5" strokeLinecap="round" fill="none" />
            </svg>
            {i18n('tJoinCount').replace('{n}', String(count))}
          </div>

          {/* Active count sub-info */}
          {active > 0 && active !== count && (
            <span
              style={{
                fontFamily: FONT.mono,
                fontSize: 11,
                color: C.text3,
                marginTop: -8,
              }}
            >
              {active} {i18n('tJoinActive')}
            </span>
          )}
        </div>

        {/* Bottom CTA */}
        <div
          style={{
            flex: 'none',
            paddingTop: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {joined ? (
            <div
              style={{
                width: '100%',
                padding: '14px 16px',
                borderRadius: 12,
                background: 'rgba(174,210,74,0.14)',
                border: '1.5px solid var(--pc-b)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                fontFamily: FONT.pixel,
                fontSize: 13,
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
              {i18n('tJoinedConfirm')}
            </div>
          ) : (
            <div
              style={{
                width: '100%',
                padding: '14px 16px',
                borderRadius: 12,
                background: 'rgba(255,255,255,0.04)',
                border: `1px solid ${C.line}`,
                textAlign: 'center',
                fontFamily: FONT.mono,
                fontSize: 12,
                color: C.text2,
                lineHeight: 1.5,
              }}
            >
              {i18n('tJoinWaiting')}
            </div>
          )}
        </div>
      </main>
      <style>{`
        @media (min-width: 960px) {
          .tj-center { gap: 28px !important; max-width: 560px; margin-left: auto; margin-right: auto; }
          .tj-title { font-size: 20px !important; }
          .tj-count { font-size: 16px !important; padding: 8px 20px !important; }
        }
      `}</style>
    </>
  );
}
