'use client';

import { useGameState } from './useGameState';
import { useI18n } from './i18nContext';
import { useStageTheme } from '@/components/stage/atmosphere';
import { PromptingView } from './PromptingView';
import { AudienceView } from './AudienceView';
import { AudienceWaitingView } from './AudienceWaitingView';
import { VoteView } from './VoteView';
import { ResultView } from './ResultView';
import { LangToggle } from './LangToggle';
import { PlayerWaitingView } from './PlayerWaitingView';
import { ReadyCheckView } from './ReadyCheckView';
import { TournamentMobileShell } from './TournamentMobileShell';

export function MobileShell() {
  return (
    <>
      <MobileShellInner />
    </>
  );
}

function MobileShellInner() {
  const { state, mySlot } = useGameState();
  const { t } = useI18n();
  useStageTheme(state?.stageTheme);

  if (!state) {
    // Match the dark broadcast language even before socket state lands, so the
    // first paint never flashes the light surface.
    return (
      <>
        <LangToggle />
        <main
          className="grid place-items-center px-6"
          style={{ minHeight: '100dvh', background: 'var(--pc-ink)' }}
        >
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-full border-[3px] border-white/15 border-t-[#7c4dff] animate-spin" />
            <p
              style={{
                fontFamily: "'Inter Tight', system-ui, sans-serif",
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: '#8c8898',
              }}
            >
              {t('connecting')}
            </p>
          </div>
        </main>
      </>
    );
  }

  // Tournament mode — hand off entirely to the tournament shell.
  // Do NOT alter the duel routing below.
  if (state.roomMode === 'TOURNAMENT') return <TournamentMobileShell />;

  // Active player flow
  if (mySlot) {
    // Sally v3: room-scoped solo waiting board. Only kicks in when we have a
    // roomCode (multi-room context) — legacy single-room paths fall through
    // to StageEntry as before.
    if (state.phase === 'PLAYER_1_JOINED' && state.roomCode) {
      return <PlayerWaitingView />;
    }
    if (state.phase === 'LOBBY' && state.roomCode) {
      return <ReadyCheckView />;
    }
    if (state.phase === 'PROMPTING' || state.phase === 'VS_INTRO') {
      // Sayaç sağ üstte; fixed LangToggle çakışıyordu. AudienceView
      // GENERATING/SCORING ile aynı pattern: oyun fazlarında dil chip'i suppress.
      return <PromptingView />;
    }
    if (state.phase === 'GENERATING' || state.phase === 'SCORING') {
      // AudienceView GENERATING/SCORING dalı kendi inline lang chip'ini kullanır:
      // fixed LangToggle, sağ üstteki referans/header bloğunun üzerine biner.
      return <AudienceView />;
    }
    if (state.phase === 'VOTING' || state.phase === 'TIEBREAK_VOTE') {
      return (
        <>
          <LangToggle />
          <AudienceView />
        </>
      );
    }
    if (state.phase === 'RESULT') {
      return (
        <>
          <LangToggle />
          <ResultView />
        </>
      );
    }
  }

  // Audience flow
  return (
    <>
      <LangToggle />
      <AudienceShell phase={state.phase} />
    </>
  );
}

function AudienceShell({ phase }: { phase: string }) {
  switch (phase) {
    case 'IDLE':
    case 'PLAYER_1_JOINED':
    case 'LOBBY':
      // Audience artık oyuncu nickname formunu (StageEntry) görmüyor.
      // İzleyici için temalı bekleme ekranı — lime aksan, oyuncu slot durumu,
      // sakin ipucu.
      return <AudienceWaitingView />;
    case 'VOTING':
    case 'TIEBREAK_VOTE':
      return <VoteView />;
    case 'RESULT':
      return <ResultView />;
    default:
      return <AudienceView />;
  }
}
