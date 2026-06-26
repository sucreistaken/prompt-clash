'use client';

/**
 * Dev preview, full broadcast stage (single phase) with mock socket state.
 * Renders StageShell so fonts, keyframes and the 1920x1080 scaler are exercised
 * exactly like production. Not linked anywhere; access at
 * /preview/stage?phase=VS_INTRO. Phases: IDLE, PLAYER_1_JOINED, VS_INTRO,
 * PROMPTING, GENERATING, SCORING, VOTING, RESULT.
 *
 * For an auto-cycling walkthrough of every phase, see /demo.
 */

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { GameCtx } from '@/components/client/useGameState';
import { I18nProvider } from '@/components/client/i18nContext';
import { StageShell } from '@/components/stage/StageShell';
import { mockGameCtx, mockTournamentCtx } from '../mock';
import type { Phase } from '@/types/game';

export default function StagePreviewClient() {
  return (
    <Suspense fallback={null}>
      <PreviewInner />
    </Suspense>
  );
}

function PreviewInner() {
  const params = useSearchParams();
  const theme = params.get('theme') === 'light' ? 'light' : 'dark';

  if (params.get('mode') === 'tournament') {
    const tphase = params.get('tphase') || 'ROUND_PROMPTING';
    return (
      <I18nProvider forceLang="tr">
        <GameCtx.Provider value={mockTournamentCtx(tphase, { theme })}>
          <StageShell />
        </GameCtx.Provider>
      </I18nProvider>
    );
  }

  const phase = (params.get('phase') as Phase) || 'IDLE';
  return (
    <I18nProvider forceLang="tr">
      <GameCtx.Provider value={mockGameCtx(phase, null, theme)}>
        <StageShell />
      </GameCtx.Provider>
    </I18nProvider>
  );
}
