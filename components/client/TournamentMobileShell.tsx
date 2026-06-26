'use client';

import { useGameState } from './useGameState';
import { TJoin } from './tournament/TJoin';
import { TPrompt } from './tournament/TPrompt';
import { TWaiting } from './tournament/TWaiting';

/**
 * Tournament phone shell — routes by tournament.phase.
 *
 * Task 8a builds: TJoin (LOBBY) + TPrompt (ROUND_PROMPTING active).
 * All other phases fall back to TWaiting so the shell never crashes.
 * Task 8b will replace several TWaiting branches with TPassed/TEliminated/
 * TFinalVote/TChampion — keep the switch shape.
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
        : <TWaiting variant={eliminated ? 'eliminated' : 'watching'} />;

    case 'ROUND_GENERATING':
    case 'ROUND_SCORING':
    case 'ROUND_CUT':
      return <TWaiting variant={eliminated ? 'eliminated' : 'scoring'} />;

    case 'FINAL_DUEL':
      return <TWaiting variant="final" />;

    case 'COMPLETE':
      return <TWaiting variant="complete" />;

    default:
      return <TWaiting variant="connecting" />;
  }
}
