'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { io, Socket } from 'socket.io-client';
import type { Role, Slot, StateSnapshot, TournamentSnapshot, TournamentEntrantSnapshot } from '@/types/game';
import { useDeviceId } from './useDeviceId';

interface Ctx {
  socket: Socket | null;
  state: StateSnapshot | null;
  livePrompts: { A: string; B: string };
  mySlot: Slot | null;
  myNickname: string | null;
  setMyNickname: (n: string) => void;
  joinGame: (nickname: string) => Promise<{ ok: boolean; reason?: string }>;
  submitPrompt: (text: string) => void;
  sendTyping: (text: string) => void;
  vote: (slot: Slot) => Promise<{ ok: boolean; reason?: string }>;
  forceUpdate: () => void;
  tournament: TournamentSnapshot | null;
  myEntrant: TournamentEntrantSnapshot | null;
  submitTournamentPrompt: (text: string) => void;
  startTournament: () => Promise<{ ok: boolean; reason?: string }>;
}

export const GameCtx = createContext<Ctx | null>(null);

export function GameStateProvider({
  children,
  role,
  roomId
}: {
  children: React.ReactNode;
  role: Role;
  /** Story 2.1/2.2: opt-in room scoping. Omit on legacy single-room paths
   *  (the socket handshake middleware defaults to the synthetic 'default' room). */
  roomId?: string;
}) {
  const deviceId = useDeviceId();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [state, setState] = useState<StateSnapshot | null>(null);
  const [livePrompts, setLivePrompts] = useState({ A: '', B: '' });
  const [mySlot, setMySlot] = useState<Slot | null>(null);
  const [myNickname, setMyNickname] = useState<string | null>(null);
  const [entrantId, setEntrantId] = useState<string | null>(null);
  const sockRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!deviceId) return;
    const auth: Record<string, unknown> = { role, deviceId };
    if (roomId) auth.roomId = roomId;
    const s = io({
      path: '/api/socket',
      transports: ['websocket', 'polling'],
      auth
    });
    sockRef.current = s;
    setSocket(s);

    s.on('state', (snapshot: StateSnapshot) => {
      setState(snapshot);
      // Phase IDLE → clear local live prompts and slot
      if (snapshot.phase === 'IDLE') {
        setLivePrompts({ A: '', B: '' });
        setMySlot(null);
      }
      // After GENERATING, the server includes prompts in state; sync them
      if (snapshot.players.A?.prompt) {
        setLivePrompts((lp) => ({ ...lp, A: snapshot.players.A!.prompt || '' }));
      }
      if (snapshot.players.B?.prompt) {
        setLivePrompts((lp) => ({ ...lp, B: snapshot.players.B!.prompt || '' }));
      }
    });

    s.on('prompt_update', ({ slot, text }: { slot: Slot; text: string }) => {
      setLivePrompts((lp) => ({ ...lp, [slot]: text }));
    });

    s.on('joined_as', ({ slot }: { slot: Slot }) => {
      // Defensive: yalnız player handshake mySlot tutar. Server tarafı zaten
      // role-gated reattach yapıyor ama bu listener client'ta da sızıntıyı
      // ikinci kat olarak kapatır (audience/stage/admin asla player'a kayma).
      if (role !== 'player') return;
      setMySlot(slot);
    });

    s.on('joined_as_entrant', ({ entrantId }: { entrantId: string }) => {
      if (role !== 'player') return;
      setEntrantId(entrantId);
    });

    return () => {
      s.disconnect();
      sockRef.current = null;
    };
  }, [deviceId, role, roomId]);

  const value = useMemo<Ctx>(
    () => ({
      socket,
      state,
      livePrompts,
      mySlot,
      myNickname,
      setMyNickname,
      forceUpdate: () => setState((s) => (s ? { ...s } : s)),
      joinGame: (nickname) =>
        new Promise((resolve) => {
          if (!sockRef.current) return resolve({ ok: false, reason: 'no_socket' });
          sockRef.current.emit('join_game', { nickname }, (res: any) => {
            if (res?.ok) setMyNickname(nickname);
            resolve(res || { ok: false, reason: 'no_response' });
          });
        }),
      submitPrompt: (text) => sockRef.current?.emit('prompt_submit', { text }),
      sendTyping: (text) => sockRef.current?.emit('prompt_typing', { text }),
      vote: (slot) =>
        new Promise((resolve) => {
          if (!sockRef.current) return resolve({ ok: false, reason: 'no_socket' });
          sockRef.current.emit('vote', { for: slot }, (res: any) =>
            resolve(res || { ok: false, reason: 'no_response' })
          );
        }),
      tournament: state?.tournament ?? null,
      myEntrant:
        entrantId && state?.tournament
          ? state.tournament.roster.find((e) => e.entrantId === entrantId) ?? null
          : null,
      submitTournamentPrompt: (text) => sockRef.current?.emit('tournament_prompt', { text }),
      startTournament: () =>
        new Promise((resolve) => {
          if (!sockRef.current) return resolve({ ok: false, reason: 'no_socket' });
          sockRef.current.emit('start_tournament', {}, (res: any) =>
            resolve(res || { ok: false, reason: 'no_response' })
          );
        })
    }),
    [socket, state, livePrompts, mySlot, myNickname, entrantId]
  );

  return <GameCtx.Provider value={value}>{children}</GameCtx.Provider>;
}

export function useGameState() {
  const ctx = useContext(GameCtx);
  if (!ctx) throw new Error('useGameState must be inside GameStateProvider');
  return ctx;
}
