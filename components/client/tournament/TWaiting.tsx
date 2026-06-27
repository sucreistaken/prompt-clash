'use client';

import { C, FONT, StageFonts, StageKeyframes } from '@/components/stage/atmosphere';
import { BgAtmosphere } from '@/components/common/BgAtmosphere';
import { MascotFrame } from '@/components/common/MascotFrame';
import { AppHeader } from '@/components/common/AppHeader';
import { useGameState } from '../useGameState';
import { useI18n } from '../i18nContext';

export type WaitVariant =
  | 'connecting'
  | 'watching'
  | 'scoring'
  | 'eliminated'
  | 'final'
  | 'complete'
  | 'groupWait'
  | 'groupAdvanced';

const variantToMascotVariant: Record<WaitVariant, 'default' | 'lime' | 'dim'> = {
  connecting: 'default',
  watching: 'lime',
  scoring: 'default',
  eliminated: 'dim',
  final: 'default',
  complete: 'default',
  groupWait: 'default',
  groupAdvanced: 'lime',
};

export function TWaiting({ variant }: { variant: WaitVariant }) {
  const { tournament, myEntrant } = useGameState();
  const { t } = useI18n();

  const msgKey: Record<WaitVariant, string> = {
    connecting: t('tWaitConnecting'),
    watching: t('tWaitWatching'),
    scoring: t('tWaitScoring'),
    eliminated: t('tWaitEliminated'),
    final: t('tWaitFinal'),
    complete: t('tWaitComplete'),
    groupWait: t('tGroupWaitBody'),
    groupAdvanced: t('tGroupAdvancedBody'),
  };

  const msg = msgKey[variant];
  const champName = variant === 'complete' && tournament?.champion?.nickname
    ? tournament.champion.nickname
    : null;

  // Group-wait / group-advanced: derive group number from myEntrant
  const groupNum =
    (variant === 'groupWait' || variant === 'groupAdvanced') && myEntrant?.groupIndex != null
      ? myEntrant.groupIndex + 1
      : null;

  const mascotVariant = variantToMascotVariant[variant];

  return (
    <>
      <StageFonts />
      <StageKeyframes />
      <BgAtmosphere variant={variant === 'eliminated' ? 'danger' : variant === 'watching' || variant === 'groupWait' || variant === 'groupAdvanced' ? 'lime' : 'default'} />
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

        <div
          className="tw-center"
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
            variant={mascotVariant}
            particles={variant === 'complete'}
            desktopSize={160}
          />

          {champName && (
            <div
              className="tw-champ"
              style={{
                fontFamily: FONT.pixel,
                fontSize: 22,
                color: 'var(--pc-b)',
                letterSpacing: '0.06em',
              }}
            >
              {champName}
            </div>
          )}

          {/* Group-wait: group badge + title */}
          {variant === 'groupWait' && groupNum != null && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '4px 12px',
                borderRadius: 999,
                border: `1px solid var(--pc-b)`,
                background: 'rgba(174,210,74,0.10)',
                fontFamily: FONT.mono,
                fontSize: 11,
                color: 'var(--pc-b)',
                letterSpacing: '0.14em',
              }}
            >
              {t('tGroupBadge')} {groupNum}
            </div>
          )}

          {variant === 'groupWait' && (
            <div
              className="tw-group-title"
              style={{
                fontFamily: FONT.pixel,
                fontSize: 22,
                color: C.text,
                letterSpacing: '0.06em',
                lineHeight: 1.2,
              }}
            >
              {t('tGroupWaitTitle')}
            </div>
          )}

          {/* Group-advanced: group badge */}
          {variant === 'groupAdvanced' && groupNum != null && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '4px 12px',
                borderRadius: 999,
                border: `1px solid var(--pc-b)`,
                background: 'rgba(174,210,74,0.10)',
                fontFamily: FONT.mono,
                fontSize: 11,
                color: 'var(--pc-b)',
                letterSpacing: '0.14em',
              }}
            >
              {t('tGroupBadge')} {groupNum}
            </div>
          )}

          {/* Group-advanced: lime positive title */}
          {variant === 'groupAdvanced' && (
            <div
              className="tw-group-title"
              style={{
                fontFamily: FONT.pixel,
                fontSize: 22,
                color: 'var(--pc-b)',
                letterSpacing: '0.06em',
                lineHeight: 1.2,
              }}
            >
              {t('tGroupAdvancedTitle')}
            </div>
          )}

          <p
            className="tw-msg"
            style={{
              fontFamily: FONT.mono,
              fontSize: 14,
              color: variant === 'eliminated' ? C.live : variant === 'complete' ? 'var(--pc-b)' : C.text2,
              lineHeight: 1.5,
              maxWidth: '28ch',
              margin: 0,
            }}
          >
            {msg}
          </p>

          {/* Spinner for transient states */}
          {(variant === 'connecting' || variant === 'scoring') && (
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                border: '3px solid rgba(255,255,255,0.10)',
                borderTopColor: C.accent,
                animation: 'pcSpin 0.9s linear infinite',
              }}
            />
          )}
        </div>
      </main>
      <style>{`
        @media (min-width: 960px) {
          .tw-center { gap: 28px !important; max-width: 560px; margin-left: auto; margin-right: auto; }
          .tw-champ { font-size: 32px !important; }
          .tw-group-title { font-size: 32px !important; }
          .tw-msg { font-size: 18px !important; max-width: 36ch !important; }
        }
      `}</style>
    </>
  );
}
