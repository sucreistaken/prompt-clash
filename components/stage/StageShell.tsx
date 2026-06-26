'use client';

import { MotionConfig } from 'framer-motion';
import { useGameState } from '@/components/client/useGameState';
import { useI18n } from '@/components/client/i18nContext';
import { StageFonts, StageKeyframes, StageScaler, LoadingStage, useStageTheme } from './atmosphere';
import { StageIdle } from './StageIdle';
import { StageVS } from './StageVS';
import { StagePrompting } from './StagePrompting';
import { StageGenerating } from './StageGenerating';
import { StageVoting } from './StageVoting';
import { StageResult } from './StageResult';
import { StageAudio } from './StageAudio';
import { TStageCounter } from './tournament/TStageCounter';
import { TStageChampion } from './tournament/TStageChampion';
import { TStageLobby } from './tournament/TStageLobby';

/**
 * Stage root - broadcast/arcade dark stage scaled into any projector viewport.
 * Loads the pixel/broadcast fonts, injects pc-* keyframes, and routes the
 * socket phase to the matching 1920x1080 board.
 */
export function StageShell() {
  const { state } = useGameState();
  const { t } = useI18n();
  useStageTheme(state?.stageTheme);

  return (
    <MotionConfig reducedMotion="user">
      <StageFonts />
      <StageKeyframes />
      <StageScaler>
        {state ? (
          state.roomMode === 'TOURNAMENT'
            ? <TournamentStage />
            : <PhaseBoard phase={state.phase} />
        ) : <LoadingStage label={t('connecting')} />}
      </StageScaler>
      <StageAudio phase={state?.phase} />
    </MotionConfig>
  );
}

/**
 * Routes tournament phases to their dedicated stage boards.
 * FINAL_DUEL reuses the duel PhaseBoard — it IS a real duel.
 */
function TournamentStage() {
  const { state, tournament: t } = useGameState();
  if (!t) return <LoadingStage label="..." />;
  switch (t.phase) {
    case 'LOBBY':
      return <TStageLobby />;
    case 'ROUND_PROMPTING':
    case 'ROUND_GENERATING':
    case 'ROUND_SCORING':
    case 'ROUND_CUT':
      return <TStageCounter />;
    case 'FINAL_DUEL':
      return <PhaseBoard phase={state!.phase} />;
    case 'COMPLETE':
      return <TStageChampion />;
    default:
      return <TStageCounter />;
  }
}

function PhaseBoard({ phase }: { phase: string }) {
  switch (phase) {
    case 'IDLE':
    case 'PLAYER_1_JOINED':
      return <StageIdle />;
    case 'VS_INTRO':
      return <StageVS />;
    case 'PROMPTING':
      return <StagePrompting />;
    case 'GENERATING':
      return <StageGenerating />;
    case 'SCORING':
      return <StageGenerating scoringMode />;
    case 'VOTING':
    case 'TIEBREAK_VOTE':
      return <StageVoting />;
    case 'RESULT':
      return <StageResult />;
    default:
      return null;
  }
}
