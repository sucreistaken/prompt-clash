// Shared mock match state for the dev preview (/preview/stage) and the demo
// auto-player (/demo). One source of truth so the two never drift. No socket,
// no AI, no DB — pure fixtures that exercise every StageShell phase board.

import type { Phase, Slot, StateSnapshot, TournamentSnapshot, TournamentEntrantSnapshot } from '@/types/game';

export const IMG_A = 'https://picsum.photos/seed/clash-a/700/700';
export const IMG_B = 'https://picsum.photos/seed/clash-b/700/700';
export const REF = 'https://picsum.photos/seed/clash-ref/600/600';
export const PROMPT_A =
  'neon-soaked alley cat, chrome whiskers, holographic collar glowing magenta, rain reflections of tokyo signs';
export const PROMPT_B =
  'lone cyber-feline on a midnight rooftop, fiber-optic fur, two katanas, the moon a flickering hologram';

const durations = {
  promptDurationSec: 30,
  votingDurationSec: 20,
  tiebreakDurationSec: 10,
  resultDurationSec: 12,
  vsIntroDurationSec: 5,
};

function player(nickname: string, over: Partial<StateSnapshot['players']['A']> = {}) {
  return {
    nickname,
    submitted: false,
    forfeit: false,
    disconnected: false,
    imageUrl: null,
    prompt: null,
    aiScore: null,
    ...over,
  };
}

export function buildMock(phase: Phase): {
  state: StateSnapshot;
  livePrompts: { A: string; B: string };
} {
  const base: StateSnapshot = {
    phase,
    phaseEndsAt: Date.now() + 22_000,
    matchId: 'preview-match-12ab',
    roomCode: 'DX22DT',
    roundCategory: 'scifi',
    roundDifficulty: 'legendary',
    roundCategoryLabel: 'BİLİM-KURGU',
    roundDifficultyLabel: 'EFSANE',
    targetPrompt: 'a neon megacity skyline at dusk, flying cars between glass towers',
    targetPromptTr: 'alacakaranlıkta neon kaplı bir megakent silueti, cam kuleler arasından süzülen uçan arabalar',
    winnerMode: 'AUDIENCE_VOTE',
    showLivePrompts: true,
    stageLanguage: 'tr',
    stageTheme: 'dark',
    referenceImageUrl: REF,
    players: { A: player('alice'), B: player('bob') },
    votes: null,
    winner: null,
    aiReasoning: null,
    durations,
  };
  const live = { A: '', B: '' };

  switch (phase) {
    case 'IDLE':
      base.players = { A: null, B: null };
      break;
    case 'PLAYER_1_JOINED':
      base.players = { A: player('alice'), B: null };
      break;
    case 'PROMPTING':
      base.players = { A: player('alice'), B: player('bob', { submitted: true, prompt: PROMPT_B }) };
      live.A = PROMPT_A;
      live.B = PROMPT_B;
      break;
    case 'GENERATING':
      base.players = {
        A: player('alice', { submitted: true, prompt: PROMPT_A }),
        B: player('bob', { submitted: true, prompt: PROMPT_B }),
      };
      live.A = PROMPT_A;
      live.B = PROMPT_B;
      break;
    case 'SCORING':
      base.players = {
        A: player('alice', { submitted: true, prompt: PROMPT_A, imageUrl: IMG_A }),
        B: player('bob', { submitted: true, prompt: PROMPT_B, imageUrl: IMG_B }),
      };
      break;
    case 'VOTING':
    case 'TIEBREAK_VOTE':
      base.players = {
        A: player('alice', { submitted: true, prompt: PROMPT_A, imageUrl: IMG_A }),
        B: player('bob', { submitted: true, prompt: PROMPT_B, imageUrl: IMG_B }),
      };
      base.votes = { A: 47, B: 35 };
      break;
    case 'RESULT':
      base.players = {
        A: player('alice', { submitted: true, prompt: PROMPT_A, imageUrl: IMG_A }),
        B: player('bob', { submitted: true, prompt: PROMPT_B, imageUrl: IMG_B }),
      };
      base.votes = { A: 54, B: 33 };
      base.winner = 'A';
      base.phaseEndsAt = null;
      break;
    default:
      break;
  }
  return { state: base, livePrompts: live };
}

/**
 * Mock socket context StageShell / MobileShell consume — everything inert.
 * Pass `mySlot` to preview the player phone flow (PromptingView etc.).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mockGameCtx(
  phase: Phase,
  mySlot: Slot | null = null,
  theme: 'dark' | 'light' = 'dark',
): any {
  const { state, livePrompts } = buildMock(phase);
  state.stageTheme = theme;
  return {
    socket: null,
    state,
    livePrompts,
    mySlot,
    myNickname: null,
    setMyNickname: () => {},
    joinGame: async () => ({ ok: false }),
    submitPrompt: () => {},
    sendTyping: () => {},
    vote: async () => ({ ok: false }),
    forceUpdate: () => {},
    tournament: null,
    myEntrant: null,
    submitTournamentPrompt: () => {},
    startTournament: async () => ({ ok: false }),
  };
}

/**
 * Mock tournament context for /preview/phone?mode=tournament.
 * Provides a believable TournamentSnapshot at the given phase.
 * `opts.eliminated` simulates the local player being knocked out.
 * `opts.tmode='B'` + `opts.groupWait` simulate Mode B group-phase.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mockTournamentCtx(
  tphase: string,
  opts: { eliminated?: boolean; theme?: 'dark' | 'light'; tmode?: string; groupWait?: boolean } = {},
): any {
  const theme = opts.theme ?? 'dark';
  const eliminated = opts.eliminated ?? false;
  const isModeB = opts.tmode === 'B';
  const groupWait = isModeB && (opts.groupWait ?? false);

  // Use a duel phase for countdown plumbing (phaseEndsAt lives on state).
  const basePhase: Phase = tphase === 'ROUND_PROMPTING' ? 'PROMPTING' : 'IDLE';
  const { state } = buildMock(basePhase);
  state.stageTheme = theme;
  state.roomMode = 'TOURNAMENT';
  state.phaseEndsAt = tphase === 'ROUND_PROMPTING' ? Date.now() + 22_000 : null;

  // For Mode B: 5 groups of 3 players each (15 total) + local player
  // groupWait=true → local player is in group 1 (index 1), active group is 0
  // groupWait=false → local player is in group 0 (index 0), active group is 0
  const myGroupIndex = groupWait ? 1 : 0;
  const currentGroupIndex = 0;
  const groupCount = isModeB ? 5 : 0;

  const roster: TournamentEntrantSnapshot[] = isModeB
    ? [
        { entrantId: 'e1',  nickname: 'ayşe_x',  eliminated: false, lastScore: 90,        groupIndex: 0 },
        { entrantId: 'e2',  nickname: 'mert',     eliminated: false, lastScore: 84,        groupIndex: 0 },
        { entrantId: 'e3',  nickname: 'zeynep',   eliminated: false, lastScore: 86,        groupIndex: 0 },
        { entrantId: 'e4',  nickname: 'elif',     eliminated: false, lastScore: 82,        groupIndex: 1 },
        { entrantId: 'e5',  nickname: 'cem',      eliminated: false, lastScore: 78,        groupIndex: 1 },
        { entrantId: 'e6',  nickname: 'nur',      eliminated: false, lastScore: 70,        groupIndex: 1 },
        { entrantId: 'e7',  nickname: 'kaan',     eliminated: false, lastScore: 72,        groupIndex: 2 },
        { entrantId: 'e9',  nickname: 'burak',    eliminated: false, lastScore: 65,        groupIndex: 2 },
        { entrantId: 'e10', nickname: 'defne',    eliminated: false, lastScore: 81,        groupIndex: 2 },
        { entrantId: 'e11', nickname: 'tarık',    eliminated: false, lastScore: 68,        groupIndex: 3 },
        { entrantId: 'e12', nickname: 'selin',    eliminated: false, lastScore: 79,        groupIndex: 3 },
        { entrantId: 'e13', nickname: 'yusuf',    eliminated: false, lastScore: 62,        groupIndex: 3 },
        { entrantId: 'e14', nickname: 'hande',    eliminated: false, lastScore: 77,        groupIndex: 4 },
        { entrantId: 'e15', nickname: 'berk',     eliminated: false, lastScore: 60,        groupIndex: 4 },
        { entrantId: 'e16', nickname: 'melis',    eliminated: false, lastScore: 66,        groupIndex: 4 },
        { entrantId: 'me',  nickname: 'sen',      eliminated,        lastScore: eliminated ? 74 : 88, groupIndex: myGroupIndex },
      ]
    : [
        { entrantId: 'e1',  nickname: 'ayşe_x',  eliminated: false, lastScore: 90,        groupIndex: null },
        { entrantId: 'e2',  nickname: 'mert',     eliminated: false, lastScore: 84,        groupIndex: null },
        { entrantId: 'e3',  nickname: 'zeynep',   eliminated: false, lastScore: 86,        groupIndex: null },
        { entrantId: 'e4',  nickname: 'elif',     eliminated: false, lastScore: 82,        groupIndex: null },
        { entrantId: 'e5',  nickname: 'cem',      eliminated: true,  lastScore: 78,        groupIndex: null },
        { entrantId: 'e6',  nickname: 'nur',      eliminated: true,  lastScore: 70,        groupIndex: null },
        { entrantId: 'e7',  nickname: 'kaan',     eliminated: true,  lastScore: 72,        groupIndex: null },
        { entrantId: 'me',  nickname: 'sen',      eliminated,        lastScore: eliminated ? 74 : 88, groupIndex: null },
        { entrantId: 'e9',  nickname: 'burak',    eliminated: true,  lastScore: 65,        groupIndex: null },
        { entrantId: 'e10', nickname: 'defne',    eliminated: false, lastScore: 81,        groupIndex: null },
        { entrantId: 'e11', nickname: 'tarık',    eliminated: true,  lastScore: 68,        groupIndex: null },
        { entrantId: 'e12', nickname: 'selin',    eliminated: false, lastScore: 79,        groupIndex: null },
        { entrantId: 'e13', nickname: 'yusuf',    eliminated: true,  lastScore: 62,        groupIndex: null },
        { entrantId: 'e14', nickname: 'hande',    eliminated: false, lastScore: 77,        groupIndex: null },
        { entrantId: 'e15', nickname: 'berk',     eliminated: true,  lastScore: 60,        groupIndex: null },
        { entrantId: 'e16', nickname: 'melis',    eliminated: true,  lastScore: 66,        groupIndex: null },
      ];

  const activeCount = roster.filter((e) => !e.eliminated).length;
  const isComplete = tphase === 'COMPLETE';
  const isFinal = tphase === 'FINAL_DUEL' || isComplete;

  const tournament: TournamentSnapshot = {
    phase: tphase,
    roundIndex: 1,
    roundCount: 3,
    activeCount,
    totalCount: roster.length,
    topic: ['ROUND_PROMPTING', 'ROUND_SCORING', 'ROUND_GENERATING', 'ROUND_CUT'].includes(tphase)
      ? { promptTr: 'DANS EDEN TOST MAKİNESİ' }
      : null,
    champion: isComplete ? { entrantId: 'e1', nickname: 'ayşe_x' } : null,
    finalists: isFinal
      ? [{ entrantId: 'e1', nickname: 'ayşe_x' }, { entrantId: 'e2', nickname: 'mert' }]
      : null,
    roster,
    mode: isModeB ? 'B' : 'A',
    groupPhase: isModeB,
    currentGroupIndex: isModeB ? currentGroupIndex : 0,
    groupCount: isModeB ? groupCount : 0,
  };

  state.tournament = tournament;

  const myEntrant: TournamentEntrantSnapshot | null =
    roster.find((e) => e.entrantId === 'me') ?? null;

  return {
    socket: null,
    state,
    livePrompts: { A: '', B: '' },
    mySlot: null,
    myNickname: 'sen',
    setMyNickname: () => {},
    joinGame: async () => ({ ok: false }),
    submitPrompt: () => {},
    sendTyping: () => {},
    vote: async () => ({ ok: false }),
    forceUpdate: () => {},
    tournament,
    myEntrant,
    submitTournamentPrompt: () => {},
    startTournament: async () => ({ ok: true }),
  };
}

/** Demo auto-play order + how long each board stays on screen (ms). */
export const DEMO_SEQUENCE: { phase: Phase; ms: number }[] = [
  { phase: 'IDLE', ms: 3000 },
  { phase: 'PLAYER_1_JOINED', ms: 3000 },
  { phase: 'VS_INTRO', ms: 3500 },
  { phase: 'PROMPTING', ms: 5500 },
  { phase: 'GENERATING', ms: 4500 },
  { phase: 'SCORING', ms: 3500 },
  { phase: 'VOTING', ms: 5500 },
  { phase: 'RESULT', ms: 5500 },
];
