export type Phase =
  | 'IDLE'
  | 'PLAYER_1_JOINED'
  | 'LOBBY'
  | 'VS_INTRO'
  | 'PROMPTING'
  | 'GENERATING'
  | 'SCORING'
  | 'VOTING'
  | 'TIEBREAK_VOTE'
  | 'RESULT';

export type Slot = 'A' | 'B';

export type WinnerMode = 'AI_SCORE' | 'AUDIENCE_VOTE';

export type RoomMode = 'DUEL' | 'TOURNAMENT';

export interface PlayerSnapshot {
  nickname: string;
  submitted: boolean;
  forfeit: boolean;
  disconnected: boolean;
  imageUrl: string | null;
  prompt: string | null;
  aiScore: number | null;
  /** Story 2026-05-31: LOBBY ready-check flag. Both true → startMatch. */
  ready?: boolean;
}

export interface StateSnapshot {
  phase: Phase;
  phaseEndsAt: number | null;
  matchId: string | null;
  roundCategory: string | null;
  roundDifficulty: string | null;
  roundCategoryLabel: string | null;
  roundDifficultyLabel: string | null;
  targetPrompt: string | null;
  targetPromptTr: string | null;
  winnerMode: WinnerMode;
  showLivePrompts: boolean;
  stageLanguage: 'tr' | 'en';
  stageTheme: 'dark' | 'light';
  referenceImageUrl: string | null;
  players: {
    A: PlayerSnapshot | null;
    B: PlayerSnapshot | null;
  };
  votes: { A: number; B: number } | null;
  winner: Slot | 'TIE' | null;
  aiReasoning: string | null;
  durations: {
    promptDurationSec: number;
    votingDurationSec: number;
    tiebreakDurationSec: number;
    resultDurationSec: number;
    vsIntroDurationSec: number;
  };
  // Multi-room context — populated when a roomId is in scope on the socket
  // handshake. Legacy single-room paths leave these undefined.
  viewerRole?: Role;
  roomId?: string;
  roomCode?: string | null;
  roomName?: string | null;
  roomState?: string | null;
  audienceVotingEnabled?: boolean;
  audienceEnabled?: boolean;
  aiScoreEnabled?: boolean;
  roomMode?: RoomMode;
}

export type Role = 'player' | 'audience' | 'stage' | 'admin';
