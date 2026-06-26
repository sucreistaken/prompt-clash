'use client';

import { useGameState } from './useGameState';
import { TJoin } from './tournament/TJoin';
import { TPrompt } from './tournament/TPrompt';
import { TWaiting } from './tournament/TWaiting';
import { TPassed } from './tournament/TPassed';
import { TEliminated } from './tournament/TEliminated';
import { TFinalVote } from './tournament/TFinalVote';
import { TChampion } from './tournament/TChampion';

/**
 * Tournament phone shell — routes by tournament.phase.
 *
 * Task 8a built: TJoin (LOBBY) + TPrompt (ROUND_PROMPTING active).
 * Task 8b adds: TPassed (ROUND_CUT survivor) + TEliminated (eliminated) +
 *               TFinalVote (FINAL_DUEL) + TChampion (COMPLETE).
 */
export function TournamentMobileShell() {
  const { tournament: t, myEntrant } = useGameState();

  if (!t) return <TWaiting variant="connecting" />;

  const eliminated = !!myEntrant?.eliminated;

  switch (t.phase) {
    case 'LOBBY':
      return <TJoin />;

    case 'ROUND_PROMPTING':
      return myEntrant && !eliminated
        ? <TPrompt />
        : (eliminated ? <TEliminated /> : <TWaiting variant="watching" />);

    case 'ROUND_GENERATING':
    case 'ROUND_SCORING':
      return eliminated ? <TEliminated /> : <TWaiting variant="scoring" />;

    case 'ROUND_CUT':
      return eliminated ? <TEliminated /> : <TPassed />;

    case 'FINAL_DUEL':
      return <TFinalVote />;

    case 'COMPLETE':
      return <TChampion />;

    default:
      return <TWaiting variant="connecting" />;
  }
}
