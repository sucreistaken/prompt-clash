'use client';

/**
 * Dev preview, the MOBILE/phone shell (MobileShell) with mock socket state.
 * Lets you see the player + audience phone views without a live match.
 *
 * Duel modes:
 *   /preview/phone?phase=PROMPTING&slot=A
 *   phase: IDLE, PLAYER_1_JOINED, VS_INTRO, PROMPTING, GENERATING, SCORING, VOTING, RESULT
 *   slot:  A | B (omit for the audience/voter flow)
 *
 * Tournament modes:
 *   /preview/phone?mode=tournament&tphase=LOBBY|ROUND_PROMPTING|ROUND_SCORING|COMPLETE&elim=0|1
 *   tphase: LOBBY, ROUND_PROMPTING, ROUND_GENERATING, ROUND_SCORING, ROUND_CUT, FINAL_DUEL, COMPLETE
 *   elim:   1 = local player is eliminated
 */

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { GameCtx } from '@/components/client/useGameState';
import { I18nProvider } from '@/components/client/i18nContext';
import { MobileShell } from '@/components/client/MobileShell';
import { mockGameCtx, mockTournamentCtx } from '../mock';
import type { Phase, Slot } from '@/types/game';

export default function PhonePreviewClient() {
  return (
    <Suspense fallback={null}>
      <PreviewInner />
    </Suspense>
  );
}

function PreviewInner() {
  const params = useSearchParams();
  const mode = params.get('mode');
  const theme = params.get('theme') === 'light' ? 'light' : 'dark';

  if (mode === 'tournament') {
    const tphase = params.get('tphase') || 'ROUND_PROMPTING';
    const elim = params.get('elim') === '1';
    const tmode = params.get('tmode') ?? undefined;
    const groupWait = params.get('groupwait') === '1';
    return (
      <I18nProvider forceLang="tr">
        <GameCtx.Provider value={mockTournamentCtx(tphase, { eliminated: elim, theme, tmode, groupWait })}>
          <MobileShell />
        </GameCtx.Provider>
      </I18nProvider>
    );
  }

  const phase = (params.get('phase') as Phase) || 'PROMPTING';
  const slotParam = params.get('slot');
  const slot = slotParam === 'A' || slotParam === 'B' ? (slotParam as Slot) : null;

  return (
    <I18nProvider forceLang="tr">
      <GameCtx.Provider value={mockGameCtx(phase, slot, theme)}>
        <MobileShell />
      </GameCtx.Provider>
    </I18nProvider>
  );
}
