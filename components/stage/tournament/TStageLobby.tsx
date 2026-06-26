'use client';

import { useEffect, useState } from 'react';
import { useGameState } from '@/components/client/useGameState';
import { useI18n } from '@/components/client/i18nContext';
import {
  StageFrame,
  StageBackdrop,
  TopBar,
  PixelText,
  Lbl,
  StageQR,
  C,
  FONT,
} from '../atmosphere';

/**
 * Tournament LOBBY board — pre-start waiting screen.
 * Shows the TURNUVA title, live join count, and a QR code to join.
 * Fixed 1920×1080 absolute layout, mirrors StageIdle idiom.
 */
export function TStageLobby() {
  const { tournament } = useGameState();
  const { t } = useI18n();
  const [origin, setOrigin] = useState('');
  const [host, setHost] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
      setHost(window.location.host);
    }
  }, []);

  const count = tournament?.totalCount ?? 0;

  return (
    <StageFrame>
      <StageBackdrop />
      <TopBar liveLabel={t('live')} matchId="" />

      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          padding: '120px 60px 60px',
          gap: 80,
        }}
      >
        {/* Left column: title + counter + hint */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 40,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <PixelText size={120}>{t('tStageTournament')}</PixelText>
            <Lbl size={14} color="text3">
              {t('tJoinLobbyLabel')}
            </Lbl>
          </div>

          {/* Live join counter */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              padding: '28px 36px',
              background: C.ink2,
              border: `1px solid ${C.line}`,
              borderLeft: `4px solid ${C.accent}`,
              alignSelf: 'flex-start',
            }}
          >
            <PixelText size={100} color={C.accent}>
              {count}
            </PixelText>
            <Lbl size={16} color="text2">
              {t('tJoinActive')}
            </Lbl>
          </div>

          {/* Join hint */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              maxWidth: 760,
            }}
          >
            <span
              style={{ width: 3, height: 40, background: C.accent, flexShrink: 0 }}
            />
            <p
              style={{
                fontFamily: FONT.body,
                fontSize: 22,
                fontWeight: 500,
                lineHeight: 1.4,
                color: C.text2,
              }}
            >
              {t('tStageJoinQr')}
            </p>
          </div>

          {/* Waiting copy */}
          <span
            style={{
              fontFamily: FONT.mono,
              fontSize: 16,
              color: C.text3,
              letterSpacing: '0.06em',
            }}
          >
            {t('tJoinWaiting')}
          </span>
        </div>

        {/* Right column: QR card (always ink-on-white for scanner compatibility) */}
        <div
          style={{
            background: '#ffffff',
            color: '#0e0e10',
            border: '1px solid rgba(0,0,0,0.10)',
            padding: 36,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 22,
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontFamily: FONT.pixel,
              fontSize: 16,
              color: '#0e0e10',
              letterSpacing: '0.06em',
              alignSelf: 'flex-start',
            }}
          >
            {t('tJoinTitle')}
          </span>
          {origin && <StageQR value={origin} size={380} />}
          <span
            style={{
              fontFamily: FONT.mono,
              fontSize: 19,
              color: '#0e0e10',
              letterSpacing: '0.02em',
              alignSelf: 'stretch',
              textAlign: 'center',
              borderTop: '1px solid #d4d2cc',
              paddingTop: 16,
            }}
          >
            {host}
          </span>
        </div>
      </div>
    </StageFrame>
  );
}
