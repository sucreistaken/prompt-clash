'use client';

// ControlPanelClient v3 — host bekleme ekranı UX yeniden yapılandırması.
//
// v2 (sprint v3) → v3 (2026-06-01) farkları:
// - Tek davet kartı: oda kodu ekranda sadece BİR kez büyük; ana aksiyon
//   "Oyuncu linkini kopyala", ikincil "QR Göster". Üstteki ayrı kod-strip
//   ve InviteLinksCard kalabalığı kaldırıldı.
// - İzleyici linki / sahne linki / yeni sekmede aç → <details> accordion
//   ("Diğer paylaşım seçenekleri"). İlk bakışta uzun URL'ler yok.
// - Lobby durumu ekranın merkezine taşındı: maskot + tek başlık + iki
//   oyuncu slotu + küçük izleyici satırı.
// - Ana CTA tek bir "Maçı başlat" oldu. 2 oyuncu gelene kadar disabled
//   ve "Başlamak için 2 oyuncu gerekli" yardımcı metniyle.
// - "Sahneyi yeni sekmede aç" ana CTA seviyesinden indi (accordion'a).
// - "Oyuncu olarak katıl" ghost/secondary aksiyon olarak ufaldı.
// - Pause / Süre uzat / Render yenile gibi canlı kontroller başlangıçta
//   gösterilmiyor; yalnızca matchStarted true olduğunda compact bar olarak
//   açılır (Epic 2 wiring'ine hazır).
// - "Odayı kapat" ekranın en altına düşük görünürlüklü link olarak indi.
//
// Not: playerCount / audienceCount şu an local state, default 0. Epic 2
// içinde socket state hook'una bağlanacak (yapı hazır, kanca açık).

import { useMemo, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { I18nProvider, useI18n } from '@/components/client/i18nContext';
import { useDeviceId } from '@/components/client/useDeviceId';
import { useRoomState } from '@/hooks/useRoomState';
import { AppHeader } from '@/components/common/AppHeader';
import { BgAtmosphere } from '@/components/common/BgAtmosphere';
import { RolePill } from '@/components/common/RolePill';
import { MascotFrame } from '@/components/common/MascotFrame';
import { QrModal } from '@/components/room/QrModal';
import { TournamentBracket, type TournamentSnapshot } from '@/components/admin/TournamentBracket';

type Props = {
  roomId: string;
  roomCode: string;
  roomName: string;
  audienceEnabled: boolean;
  origin: string;
};

type PlayerSlot = { nickname: string } | null;

export function ControlPanelClient(props: Props) {
  return (
    <I18nProvider>
      <PanelBody {...props} />
    </I18nProvider>
  );
}

function PanelBody({ roomId, roomCode, roomName, audienceEnabled, origin }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const [qrOpen, setQrOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeErr, setCloseErr] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedPlayer, setCopiedPlayer] = useState(false);

  // Lobi/maç durumu canlı socket snapshot'undan türetilir. `useRoomState` hem
  // cold-load (REST GET /api/rooms/:id/state) hem websocket 'state' event'ini
  // dinler — host olarak bağlanıyoruz ki kontrol paneli oyuncu giriş/çıkışını
  // anlık görsün ("Bekleniyor" → nickname).
  const deviceId = useDeviceId();
  const { snapshot, emit } = useRoomState({
    roomId,
    role: 'host',
    deviceId: deviceId ?? undefined,
  });

  // Tournament mode derivations
  const isTournament = snapshot?.roomMode === 'TOURNAMENT';
  const tournament = snapshot?.tournament as TournamentSnapshot | undefined;
  const canStartTournament =
    !!tournament && tournament.phase === 'LOBBY' && tournament.activeCount >= 2;

  const players: [PlayerSlot, PlayerSlot] = useMemo(() => {
    const A = snapshot?.players?.A;
    const B = snapshot?.players?.B;
    return [
      A?.nickname ? { nickname: A.nickname } : null,
      B?.nickname ? { nickname: B.nickname } : null,
    ];
  }, [snapshot?.players?.A, snapshot?.players?.B]);

  const audienceCount = 0; // TODO: snapshot'a eklendiğinde bağla (broadcasts.js).

  const matchStarted = useMemo(() => {
    const phase = snapshot?.phase;
    if (!phase) return false;
    return phase !== 'IDLE' && phase !== 'PLAYER_1_JOINED' && phase !== 'LOBBY';
  }, [snapshot?.phase]);

  const playerInvite = `${origin}/join/${roomCode}`;
  const audienceInvite = `${origin}/watch/${roomCode}`;
  const stageUrl = `${origin}/rooms/${roomId}/stage`;

  const playerCount = useMemo(
    () => (players[0] ? 1 : 0) + (players[1] ? 1 : 0),
    [players],
  );
  const canStart = playerCount >= 2;

  async function copyToClipboard(text: string, setter: (v: boolean) => void) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setter(true);
      setTimeout(() => setter(false), 1500);
    } catch {
      /* ignore */
    }
  }

  function copyCode() {
    void copyToClipboard(roomCode, setCopiedCode);
  }
  function copyPlayerLink() {
    void copyToClipboard(playerInvite, setCopiedPlayer);
  }

  function startMatch() {
    if (!canStart) return;
    // Epic 2: emit socket event. Şimdilik no-op.
  }

  function startTournament() {
    if (!canStartTournament) return;
    emit('start_tournament', {});
  }

  async function closeRoom() {
    if (!confirm(t('roomCloseConfirm'))) return;
    setClosing(true);
    setCloseErr(null);
    try {
      const res = await fetch(`/api/rooms/${roomId}/close`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setCloseErr(t('roomCloseFailed'));
        setClosing(false);
        return;
      }
      router.replace('/create-room');
    } catch {
      setCloseErr(t('roomCloseFailed'));
      setClosing(false);
    }
  }

  function openStage() {
    if (typeof window !== 'undefined') {
      window.open(`/rooms/${roomId}/stage`, '_blank', 'noopener');
    }
  }

  function joinAsPlayer() {
    if (typeof window !== 'undefined') {
      window.open(`/join/${roomCode}`, '_blank', 'noopener');
    }
  }

  // Bekleyiş kopyası (0 → "2 oyuncu gerekli", 1 → "bir oyuncu daha", 2 → "hazır").
  const lobbyBodyKey =
    playerCount === 0
      ? 'roomLobbyBody0'
      : playerCount === 1
        ? 'roomLobbyBody1'
        : 'roomLobbyBody2';

  return (
    <div style={pageStyle}>
      <BgAtmosphere variant="default" />

      <div style={containerStyle} className="pc-host-container">
        <AppHeader right={<RolePill kind="host" label={t('roomRoleHost')} />} />

        {/* HEAD — arcade lobby başlığı: eyebrow pill + pixel başlık */}
        <section style={headStyle}>
          <span style={eyebrowStyle}>
            <span aria-hidden="true" style={eyebrowDotStyle} />
            {t('roomReadyEyebrow')}
            {roomName ? <span style={eyebrowRoomNameStyle}>· {roomName}</span> : null}
          </span>
          <h1 style={h1Style}>
            {t('roomReadyH1')}{' '}
            <span style={{ color: 'var(--pc-lime, #aed24a)' }}>{t('roomReadyAc')}</span>
          </h1>
          <p style={subStyle}>{t('roomReadySubV2')}</p>
        </section>

        {/* TEK DAVET KARTI */}
        <section style={inviteCardStyle} className="pc-invite-card">
          <div style={inviteCardLblStyle}>
            <span aria-hidden="true" style={lblLineStyle} />
            {t('roomCodeLabel')}
          </div>

          <div style={codeRowStyle}>
            <span style={codeStyle}>{roomCode}</span>
            <button
              type="button"
              onClick={copyCode}
              aria-label={t('ariaCopyCode')}
              className={copiedCode ? 'pc-copy-icon pc-copy-icon--ok' : 'pc-copy-icon'}
              style={copyIconStyle}
            >
              {copiedCode ? <CheckGlyph /> : <CopyGlyph />}
              <span style={copyIconLabelStyle}>
                {copiedCode ? t('roomCopied') : t('roomCopyCodeLabel')}
              </span>
            </button>
          </div>

          <div style={inviteActionsStyle} className="pc-invite-share-row">
            <button
              type="button"
              onClick={copyPlayerLink}
              className={copiedPlayer ? 'pc-cta-primary pc-cta-primary--ok' : 'pc-cta-primary'}
              style={ctaPrimaryStyle}
            >
              {copiedPlayer ? <CheckGlyph /> : <LinkGlyph />}
              {copiedPlayer ? t('roomCopyPlayerLinkDone') : t('roomCopyPlayerLink')}
            </button>
            <button
              type="button"
              onClick={() => setQrOpen(true)}
              className="pc-cta-ghost"
              style={ctaGhostStyle}
            >
              <QrGlyph />
              {t('roomShowQr')}
            </button>
          </div>

          {/* Host'un kendi cihazında açtığı testler — paylaşımdan ayrı semantik
              grup. Etiketle anlamı netleştir: bu butonlar başka cihazlara link
              göndermek için değil, "ben burada test ediyorum" akışı için. */}
          <div style={hostOpenGroupStyle}>
            <div style={hostOpenLabelStyle}>
              <span aria-hidden="true" style={lblLineStyle} />
              {t('roomHostOpenLabel')}
            </div>
            <div style={hostOpenRowStyle} className="pc-host-open-row">
              <button
                type="button"
                onClick={joinAsPlayer}
                className="pc-cta-ghost"
                style={hostOpenBtnStyle}
              >
                <span style={hostOpenBtnHeadStyle}>
                  <JoinSelfGlyph />
                  {t('roomJoinAsPlayer')}
                </span>
                <span style={hostOpenBtnDescStyle}>{t('roomJoinAsPlayerDesc')}</span>
              </button>
              <button
                type="button"
                onClick={openStage}
                className="pc-cta-ghost"
                style={hostOpenBtnStyle}
              >
                <span style={hostOpenBtnHeadStyle}>
                  <OpenExtGlyph />
                  {t('roomOpenStageShort')}
                </span>
                <span style={hostOpenBtnDescStyle}>{t('roomOpenStageDesc')}</span>
              </button>
            </div>
          </div>

          <details style={detailsStyle} className="pc-advanced">
            <summary style={summaryStyle} className="pc-advanced-summary">
              <span style={summaryChevronStyle} aria-hidden="true">
                <ChevronGlyph />
              </span>
              {t('roomShareMore')}
            </summary>
            <div style={advancedRowsStyle}>
              {audienceEnabled ? (
                <ShareRow
                  label={t('roomShareAudienceLabel')}
                  copyValue={audienceInvite}
                />
              ) : null}
              <ShareRow label={t('roomShareStageLabel')} copyValue={stageUrl} />
            </div>
          </details>
        </section>

        {isTournament ? (
          <TournamentControlSection
            tournament={tournament}
            canStart={canStartTournament}
            onStart={startTournament}
          />
        ) : (
          <>
            {/* LOBBY STATUS */}
            <section style={lobbyStyle} className="pc-lobby">
              <div style={lobbyMascotHostStyle}>
                <div style={lobbyBubbleStyle}>
                  <span aria-hidden="true" style={lobbyBubbleDotStyle} />
                  {t('roomLobbyMascotBubble')}
                  <span
                    aria-hidden="true"
                    className="pc-lobby-bubble-tail"
                    style={lobbyBubbleTailStyle}
                  />
                </div>
                <MascotFrame size={96} mascotSize={76} variant="default" particles />
              </div>
              <h2 style={lobbyTtlStyle}>{t('roomLobbyTtl')}</h2>
              <p style={lobbyBodyStyle}>{t(lobbyBodyKey)}</p>

              <div style={slotsRowStyle} aria-label={t('ariaSlots')}>
                <Slot index={1} player={players[0]} />
                <span style={vsStyle} aria-hidden="true">
                  VS
                </span>
                <Slot index={2} player={players[1]} />
              </div>

              <div style={audienceLineStyle}>
                <span style={audienceDotStyle} aria-hidden="true" />
                <span>
                  <b style={audienceCountValStyle}>{audienceCount}</b>{' '}
                  {t('roomAudienceCountSuffix')}
                </span>
              </div>
            </section>

            {/* ANA CTA — Maçı başlat */}
            <div style={ctaWrapStyle}>
              <button
                type="button"
                onClick={startMatch}
                disabled={!canStart}
                aria-disabled={!canStart}
                className={canStart ? 'pc-start pc-start--ready' : 'pc-start pc-start--off'}
                style={canStart ? startCtaReadyStyle : startCtaOffStyle}
              >
                {canStart ? <PlayGlyph /> : <LockGlyph />}
                {t('roomCtrlStart')}
              </button>
              {!canStart ? (
                <p style={startHintStyle}>{t('roomStartDisabledHint')}</p>
              ) : null}
            </div>

            {/* LIVE CONTROLS — yalnız match başladıysa */}
            {matchStarted ? (
              <section style={liveControlsStyle}>
                <div style={sectionLabStyle}>
                  <span aria-hidden="true" style={lblLineStyle} />
                  {t('roomLiveControlsTtl')}
                </div>
                <div style={liveControlsBarStyle}>
                  <CompactCtrl label={t('roomCtrlPause')} />
                  <CompactCtrl label={t('roomCtrlExtend')} hint={t('roomCtrlHintExtend')} />
                  <CompactCtrl label={t('roomCtrlRetryGen')} />
                </div>
              </section>
            ) : null}
          </>
        )}

        {/* FOOTER · close room low-vis */}
        <div style={footerActionsStyle}>
          <button
            type="button"
            onClick={closeRoom}
            disabled={closing}
            className="pc-close-link"
            style={closeLinkStyle}
          >
            {closing ? t('roomClosing') : t('roomCtrlClose')}
          </button>
          {closeErr ? (
            <div role="alert" style={errBoxStyle}>
              {closeErr}
            </div>
          ) : null}
        </div>
      </div>

      <QrModal
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        playerInviteUrl={playerInvite}
        audienceInviteUrl={audienceInvite}
        audienceEnabled={audienceEnabled}
      />

      <style>{`
        .pc-host-container { padding-bottom: max(48px, env(safe-area-inset-bottom, 0px) + 24px); }

        .pc-copy-icon { transition: border-color .14s, color .14s, background .14s, transform 80ms ease-out; }
        .pc-copy-icon:hover { border-color: var(--pc-accent); color: var(--pc-bone); background: rgba(124,77,255,.10); }
        .pc-copy-icon:active { transform: translateY(1px); }
        .pc-copy-icon--ok { border-color: #aed24a; color: #aed24a; background: rgba(174,210,74,.10); }

        .pc-cta-primary { transition: transform .1s, box-shadow .16s, background .14s; }
        .pc-cta-primary:hover { box-shadow: 0 14px 34px rgba(124,77,255,.42), inset 0 -2px 0 rgba(0,0,0,.18); }
        .pc-cta-primary:active { transform: translateY(1px); }
        .pc-cta-primary--ok { background: #aed24a !important; color: #18221a !important; box-shadow: 0 10px 26px rgba(174,210,74,.30), inset 0 -2px 0 rgba(0,0,0,.18); }

        .pc-cta-ghost { transition: border-color .14s, color .14s, background .14s, transform 80ms ease-out; }
        .pc-cta-ghost:hover { border-color: var(--pc-bone); color: var(--pc-bone); background: rgba(124,77,255,.06); }
        .pc-cta-ghost:active { transform: translateY(1px); }

        .pc-advanced-summary { transition: color .14s, background .14s; }
        .pc-advanced-summary:hover { color: var(--pc-bone); background: rgba(255,255,255,.02); }
        .pc-advanced > summary::-webkit-details-marker { display: none; }
        .pc-advanced > summary { list-style: none; }
        .pc-advanced[open] .pc-summary-chevron { transform: rotate(90deg); }

        .pc-share-row { transition: border-color .14s, background .14s; }
        .pc-share-row:hover { border-color: var(--pc-line2); }
        .pc-share-btn { transition: border-color .14s, color .14s, background .14s, transform 80ms ease-out; }
        .pc-share-btn:hover { border-color: var(--pc-accent); color: var(--pc-bone); background: rgba(124,77,255,.08); }
        .pc-share-btn:active { transform: translateY(1px); }
        .pc-share-btn--ok { border-color: #aed24a !important; color: #aed24a !important; background: rgba(174,210,74,.10) !important; }

        .pc-start--ready { animation: pcStartPulse 2.4s ease-in-out infinite; }
        .pc-start--ready:hover { box-shadow: 0 5px 0 #6f8c2a, 0 10px 30px rgba(174,210,74,.42); filter: brightness(1.04); }
        .pc-start--ready:active { transform: translateY(3px); box-shadow: 0 2px 0 #6f8c2a; }
        @keyframes pcStartPulse {
          0%, 100% { box-shadow: 0 5px 0 #6f8c2a, 0 7px 20px rgba(174,210,74,.22); }
          50% { box-shadow: 0 5px 0 #6f8c2a, 0 10px 30px rgba(174,210,74,.42); }
        }

        .pc-blink { animation: pcBlink 1s step-end infinite; }
        @keyframes pcBlink { 0%, 50% { opacity: 1; } 50.01%, 100% { opacity: 0; } }

        .pc-close-link { transition: color .14s, border-color .14s; }
        .pc-close-link:hover { color: var(--pc-live, #ff5c5c); border-color: rgba(255,92,92,.35); }

        @media (max-width: 380px) {
          .pc-host-container { padding-left: 14px !important; padding-right: 14px !important; }
        }
        @media (min-width: 560px) {
          .pc-invite-share-row { grid-template-columns: 1.6fr 1fr !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          .pc-start--ready { animation: none !important; }
          .pc-blink { animation: none !important; }
        }
      `}</style>
    </div>
  );
}

// ─── Slot (player 1 / player 2 placeholder) ──────────────────────────────────

function Slot({ index, player }: { index: 1 | 2; player: PlayerSlot }) {
  const { t } = useI18n();
  const filled = !!player;
  return (
    <div style={filled ? slotFilledStyle : slotEmptyStyle} aria-label={`${t('roomSlotPlayer')} ${index}`}>
      <span style={slotIdxStyle}>{`${t('roomSlotPlayer')} ${index}`}</span>
      <span style={filled ? slotAvatarFilledStyle : slotAvatarEmptyStyle} aria-hidden="true">
        {filled ? player!.nickname.slice(0, 1).toUpperCase() : String(index)}
      </span>
      {filled ? (
        <span style={slotNickStyle}>{player!.nickname}</span>
      ) : (
        <span style={slotPendingStyle}>
          {t('roomSlotPending')}
          <span className="pc-blink" style={slotCursorStyle} aria-hidden="true">
            _
          </span>
        </span>
      )}
    </div>
  );
}

// ─── Accordion rows ──────────────────────────────────────────────────────────

function ShareRow({ label, copyValue }: { label: string; copyValue: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  async function copy() {
    if (!copyValue) return;
    try {
      await navigator.clipboard.writeText(copyValue);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }
  return (
    <div style={shareRowStyle} className="pc-share-row">
      <span style={shareRowLabelStyle}>{label}</span>
      <button
        type="button"
        onClick={copy}
        className={copied ? 'pc-share-btn pc-share-btn--ok' : 'pc-share-btn'}
        style={shareBtnStyle}
      >
        {copied ? t('roomCopied') : t('roomCopy')}
      </button>
    </div>
  );
}

// ─── Compact ctrl (match-running) ────────────────────────────────────────────

function CompactCtrl({ label, hint }: { label: string; hint?: string }) {
  return (
    <button type="button" style={compactCtrlStyle}>
      <span>{label}</span>
      {hint ? <span style={compactCtrlHintStyle}>{hint}</span> : null}
    </button>
  );
}

// ─── Tournament control section ──────────────────────────────────────────────

function TournamentControlSection({
  tournament,
  canStart,
  onStart,
}: {
  tournament: TournamentSnapshot | null | undefined;
  canStart: boolean;
  onStart: () => void;
}) {
  const { t } = useI18n();

  if (!tournament) return null;

  const isLobby = tournament.phase === 'LOBBY';

  return (
    <section style={tSectionStyle}>
      {isLobby ? (
        <>
          {/* Section label */}
          <div style={sectionLabStyle}>
            <span aria-hidden="true" style={lblLineStyle} />
            {t('tCtrlTournamentLobbyTtl')}
          </div>

          {/* Player count + compact roster */}
          <div style={tLobbyCardStyle}>
            <div style={tLobbyCountRowStyle}>
              <span style={tLobbyCountValStyle}>{tournament.totalCount}</span>
              <span style={tLobbyCountLabelStyle}>
                {t('tCtrlLobbyPlayers').replace('{n}', '').trim()}
              </span>
            </div>
            {tournament.roster && tournament.roster.length > 0 ? (
              <div style={tLobbyRosterStyle}>
                {tournament.roster.map((e) => (
                  <span key={e.entrantId} style={tLobbyRosterPillStyle}>
                    {e.nickname}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          {/* Start CTA */}
          <div style={ctaWrapStyle}>
            <button
              type="button"
              onClick={onStart}
              disabled={!canStart}
              aria-disabled={!canStart}
              className={canStart ? 'pc-start pc-start--ready' : 'pc-start pc-start--off'}
              style={canStart ? startCtaReadyStyle : startCtaOffStyle}
            >
              {canStart ? <PlayGlyph /> : <LockGlyph />}
              {t('tCtrlStartTournament')}
            </button>
            {!canStart ? (
              <p style={startHintStyle}>{t('tCtrlTournamentStartDisabledHint')}</p>
            ) : null}
          </div>
        </>
      ) : (
        <>
          {/* Section label */}
          <div style={sectionLabStyle}>
            <span aria-hidden="true" style={lblLineStyle} />
            {t('tCtrlTournamentLive')}
          </div>

          {/* Round + remaining meta */}
          <div style={tMetaRowStyle}>
            <span style={tRoundBadgeStyle}>
              {t('tCtrlRound')
                .replace('{n}', String(tournament.roundIndex + 1))
                .replace('{total}', String(tournament.roundCount))}
            </span>
            <span style={tRemainingStyle}>
              {t('tCtrlRemaining').replace('{n}', String(tournament.activeCount))}
            </span>
          </div>

          {/* Current topic */}
          {tournament.topic?.promptTr ? (
            <div style={tTopicStyle}>
              <span style={tTopicLabelStyle}>{t('tCtrlTopicLabel')}</span>
              <span style={tTopicTextStyle}>{tournament.topic.promptTr}</span>
            </div>
          ) : null}

          {/* Bracket */}
          <TournamentBracket tournament={tournament} />
        </>
      )}
    </section>
  );
}

// ─── Glyphs ──────────────────────────────────────────────────────────────────

function CopyGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12.5l5 5L20 6" />
    </svg>
  );
}

function LinkGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 14a4 4 0 0 1 0-5.66l3-3a4 4 0 1 1 5.66 5.66l-1.5 1.5" />
      <path d="M14 10a4 4 0 0 1 0 5.66l-3 3a4 4 0 1 1-5.66-5.66l1.5-1.5" />
    </svg>
  );
}

function QrGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <path d="M14 14h3v3M14 20h3M20 14v7" />
    </svg>
  );
}

function ChevronGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function OpenExtGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 17l10-10" />
      <path d="M17 7H7M17 7v10" />
    </svg>
  );
}

function PlayGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 4l14 8-14 8z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function LockGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="11" width="16" height="10" rx="1.5" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function JoinSelfGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M19 8v6M22 11h-6" />
    </svg>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const pageStyle: CSSProperties = {
  minHeight: '100dvh',
  position: 'relative',
  overflowX: 'hidden',
};

const containerStyle: CSSProperties = {
  position: 'relative',
  zIndex: 1,
  maxWidth: 640,
  margin: '0 auto',
  padding: '12px 20px 48px',
  display: 'flex',
  flexDirection: 'column',
};

// Head
const headStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 10,
  padding: '14px 0 18px',
};

// Eyebrow pill — create-room "YENİ ODA" rozetiyle aynı dil.
const eyebrowStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '4px 10px',
  borderRadius: 3,
  background: 'rgba(124,77,255,0.10)',
  border: '1px solid rgba(124,77,255,0.40)',
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: 'var(--pc-accent)',
};

const eyebrowDotStyle: CSSProperties = {
  width: 6,
  height: 6,
  background: 'var(--pc-accent)',
  flex: 'none',
  boxShadow: '0 0 8px rgba(124,77,255,0.5)',
};

const eyebrowRoomNameStyle: CSSProperties = {
  color: 'var(--pc-text3)',
  letterSpacing: '0.04em',
  textTransform: 'none',
  fontWeight: 600,
};

// Pixel başlık — create-room "BIR ODA AÇ." ile aynı Silkscreen dili.
const h1Style: CSSProperties = {
  fontFamily: "'Silkscreen', monospace",
  fontSize: 'clamp(22px, 6vw, 30px)',
  fontWeight: 400,
  color: 'var(--pc-bone)',
  lineHeight: 1.15,
  letterSpacing: '0.02em',
  textTransform: 'uppercase',
  margin: 0,
};

const subStyle: CSSProperties = {
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 14,
  color: 'var(--pc-text2)',
  lineHeight: 1.5,
  margin: 0,
  maxWidth: '46ch',
};

// Section label
const sectionLabStyle: CSSProperties = {
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  color: 'var(--pc-text3)',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  margin: '0 0 10px',
};

const lblLineStyle: CSSProperties = {
  width: 14,
  height: 1,
  background: 'var(--pc-line2)',
  flex: 'none',
};

// Arcade konsol paneli — create-room formStyle ile aynı: sert kenar + 3px accent
// üst-cap + hard-offset gölge. SaaS yumuşaklığı yerine kabin hissi.
const consolePanelStyle: CSSProperties = {
  background: 'var(--pc-ink2)',
  border: '2px solid var(--pc-line2)',
  borderTop: '3px solid var(--pc-accent)',
  borderRadius: 6,
  boxShadow: '6px 6px 0 rgba(0,0,0,0.32)',
};

// Invite card (single, hero) — arcade panel
const inviteCardStyle: CSSProperties = {
  ...consolePanelStyle,
  padding: '18px 18px 14px',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
};

const inviteCardLblStyle: CSSProperties = {
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  color: 'var(--pc-text3)',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
};

const codeRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
};

// Oda kodu — terminal/arcade hissi için JetBrains Mono.
const codeStyle: CSSProperties = {
  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
  fontSize: 'clamp(34px, 9vw, 46px)',
  color: 'var(--pc-bone)',
  letterSpacing: '0.12em',
  lineHeight: 1,
  flex: 1,
  minWidth: 0,
  fontWeight: 700,
};

// Kod kopya — sadece ikon değil, etiketli arcade chip (aksiyon net olsun).
const copyIconStyle: CSSProperties = {
  minHeight: 44,
  padding: '0 12px',
  background: 'var(--pc-ink3)',
  border: '1px solid var(--pc-line)',
  borderRadius: 4,
  boxShadow: '0 2px 0 var(--pc-ink)',
  color: 'var(--pc-text2)',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  flex: 'none',
};

const copyIconLabelStyle: CSSProperties = {
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
};

// Invite actions — primary + ghost
const inviteActionsStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr',
  gap: 10,
};

// Birincil aksiyon — blok arcade tuşu (soft glow yerine hard-offset taban).
const ctaPrimaryStyle: CSSProperties = {
  width: '100%',
  minHeight: 52,
  padding: '0 16px',
  borderRadius: 4,
  border: '2px solid #5a35cc',
  cursor: 'pointer',
  background: 'var(--pc-accent)',
  color: '#fff',
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 14.5,
  fontWeight: 800,
  letterSpacing: '0.02em',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  boxShadow: '0 4px 0 #4a2bb0',
};

const ctaGhostStyle: CSSProperties = {
  width: '100%',
  minHeight: 52,
  padding: '0 16px',
  borderRadius: 4,
  background: 'var(--pc-ink3)',
  color: 'var(--pc-text)',
  border: '1px solid var(--pc-line)',
  cursor: 'pointer',
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 13.5,
  fontWeight: 700,
  letterSpacing: '0.04em',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  boxShadow: '0 2px 0 var(--pc-ink)',
};

// "Bu cihazda aç" host-test grubu — paylaşımdan visually ayrılsın diye
// üstte ince ayraç + section label + ghost satırı.
const hostOpenGroupStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  marginTop: 2,
  paddingTop: 12,
  borderTop: '1px dashed var(--pc-ink3)',
};

const hostOpenLabelStyle: CSSProperties = {
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  color: 'var(--pc-text3)',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
};

const hostOpenRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 8,
};

// Host-test butonları — iki satır: aksiyon + ne yaptığı (Sahne herkese net değil).
const hostOpenBtnStyle: CSSProperties = {
  width: '100%',
  minHeight: 52,
  padding: '8px 12px',
  borderRadius: 4,
  background: 'var(--pc-ink3)',
  color: 'var(--pc-text)',
  border: '1px solid var(--pc-line)',
  boxShadow: '0 2px 0 var(--pc-ink)',
  cursor: 'pointer',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  justifyContent: 'center',
  gap: 2,
  textAlign: 'left',
};

const hostOpenBtnHeadStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 12.5,
  fontWeight: 700,
  letterSpacing: '0.03em',
  color: 'var(--pc-text)',
};

const hostOpenBtnDescStyle: CSSProperties = {
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 11,
  fontWeight: 500,
  color: 'var(--pc-text3)',
  lineHeight: 1.3,
};

// Accordion
const detailsStyle: CSSProperties = {
  marginTop: 4,
  borderTop: '1px dashed var(--pc-ink3)',
  paddingTop: 4,
};

const summaryStyle: CSSProperties = {
  cursor: 'pointer',
  padding: '12px 14px',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  background: 'var(--pc-ink3)',
  border: '1px solid var(--pc-line)',
  borderRadius: 4,
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 12.5,
  fontWeight: 700,
  letterSpacing: '0.04em',
  color: 'var(--pc-text2)',
  userSelect: 'none',
  outline: 'none',
};

const summaryChevronStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 16,
  height: 16,
  color: 'var(--pc-text3)',
  transition: 'transform .18s ease',
};

const advancedRowsStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: '6px 0 2px',
};

const shareRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  padding: '10px 12px',
  background: 'transparent',
  border: '1px solid var(--pc-ink3)',
  borderRadius: 10,
};

const shareRowLabelStyle: CSSProperties = {
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 13,
  color: 'var(--pc-text)',
  fontWeight: 500,
};

const shareBtnStyle: CSSProperties = {
  padding: '7px 12px',
  border: '1px solid var(--pc-line2)',
  background: 'transparent',
  color: 'var(--pc-text)',
  borderRadius: 8,
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 10.5,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  fontWeight: 700,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  minHeight: 32,
};

// Lobby — arcade panel
const lobbyStyle: CSSProperties = {
  ...consolePanelStyle,
  marginTop: 22,
  padding: '20px 18px 20px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 10,
  textAlign: 'center',
};

const lobbyTtlStyle: CSSProperties = {
  margin: 0,
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 16,
  fontWeight: 700,
  color: 'var(--pc-bone)',
  letterSpacing: '0.01em',
};

const lobbyBodyStyle: CSSProperties = {
  margin: 0,
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 13.5,
  color: 'var(--pc-text3)',
  lineHeight: 1.5,
  maxWidth: '38ch',
};

// Maskot + konuşma balonu (create-room bubble diliyle).
const lobbyMascotHostStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 14,
};

const lobbyBubbleStyle: CSSProperties = {
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  maxWidth: '32ch',
  padding: '8px 14px',
  borderRadius: 4,
  background: 'rgba(174,210,74,0.12)',
  border: '2px solid rgba(174,210,74,0.46)',
  boxShadow: '0 3px 0 rgba(0,0,0,0.22)',
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '0.02em',
  color: '#aed24a',
  textShadow: '0 0 12px rgba(174,210,74,0.30)',
  lineHeight: 1.35,
};

const lobbyBubbleDotStyle: CSSProperties = {
  width: 6,
  height: 6,
  background: '#aed24a',
  flex: 'none',
  boxShadow: '0 0 8px rgba(174,210,74,0.6)',
};

const lobbyBubbleTailStyle: CSSProperties = {
  position: 'absolute',
  left: '50%',
  bottom: -8,
  width: 12,
  height: 12,
  transform: 'translateX(-50%) rotate(45deg)',
  background: 'rgba(174,210,74,0.12)',
  borderRight: '2px solid rgba(174,210,74,0.46)',
  borderBottom: '2px solid rgba(174,210,74,0.46)',
};

const slotsRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'stretch',
  justifyContent: 'center',
  gap: 10,
  marginTop: 12,
  width: '100%',
  maxWidth: 380,
};

const slotBaseStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: '16px 12px',
  borderRadius: 4,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 9,
  textAlign: 'center',
};

const slotEmptyStyle: CSSProperties = {
  ...slotBaseStyle,
  background: 'var(--pc-ink)',
  border: '2px dashed var(--pc-line2)',
};

const slotFilledStyle: CSSProperties = {
  ...slotBaseStyle,
  background: 'rgba(124,77,255,0.12)',
  border: '2px solid var(--pc-accent)',
  boxShadow: 'inset 0 -3px 0 rgba(124,77,255,0.30)',
};

const slotIdxStyle: CSSProperties = {
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 9.5,
  fontWeight: 700,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: 'var(--pc-text3)',
};

// Pixel avatar kutusu — boşken slot numarası, dolunca baş harf.
const slotAvatarBaseStyle: CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 4,
  display: 'grid',
  placeItems: 'center',
  fontFamily: "'Silkscreen', monospace",
  fontSize: 18,
  lineHeight: 1,
};

const slotAvatarEmptyStyle: CSSProperties = {
  ...slotAvatarBaseStyle,
  background: 'var(--pc-ink2)',
  border: '2px solid var(--pc-line2)',
  color: 'var(--pc-text4)',
};

const slotAvatarFilledStyle: CSSProperties = {
  ...slotAvatarBaseStyle,
  background: 'var(--pc-accent)',
  border: '2px solid var(--pc-bone)',
  color: '#fff',
};

const slotPendingStyle: CSSProperties = {
  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
  fontSize: 12.5,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--pc-text3)',
  fontWeight: 700,
  display: 'inline-flex',
  alignItems: 'center',
};

const slotCursorStyle: CSSProperties = {
  marginLeft: 1,
  color: '#aed24a',
  fontWeight: 700,
};

const slotNickStyle: CSSProperties = {
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 14,
  color: 'var(--pc-bone)',
  fontWeight: 700,
  maxWidth: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

// VS — pixel rozet, sahne dilindeki gibi.
const vsStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  alignSelf: 'center',
  fontFamily: "'Silkscreen', monospace",
  fontSize: 13,
  fontWeight: 400,
  letterSpacing: '0.04em',
  color: 'var(--pc-lime, #aed24a)',
  padding: '0 4px',
};

const audienceLineStyle: CSSProperties = {
  marginTop: 6,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: 'var(--pc-text3)',
};

const audienceDotStyle: CSSProperties = {
  width: 5,
  height: 5,
  borderRadius: 999,
  background: 'var(--pc-text4)',
  display: 'inline-block',
};

const audienceCountValStyle: CSSProperties = {
  color: 'var(--pc-bone)',
  fontWeight: 700,
};

// CTA wrap
const ctaWrapStyle: CSSProperties = {
  marginTop: 22,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 10,
};

// Ready — blok lime arcade tuşu, hard-offset taban (pulse class style bloğunda).
const startCtaReadyStyle: CSSProperties = {
  width: '100%',
  minHeight: 62,
  padding: '0 18px',
  borderRadius: 4,
  border: '2px solid #7a9c2e',
  cursor: 'pointer',
  background: 'linear-gradient(180deg, #b8de4f, #9bc23a)',
  color: '#0c1410',
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 17,
  fontWeight: 800,
  letterSpacing: '0.01em',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  boxShadow: '0 5px 0 #6f8c2a',
};

// Off — ölü-dashed değil, görünür "kilitli tuş": dolu zemin + sert taban + kilit.
const startCtaOffStyle: CSSProperties = {
  width: '100%',
  minHeight: 62,
  padding: '0 18px',
  borderRadius: 4,
  border: '2px solid var(--pc-line2)',
  cursor: 'not-allowed',
  background: 'var(--pc-ink3)',
  color: 'var(--pc-text2)',
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 16,
  fontWeight: 800,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  boxShadow: '0 3px 0 var(--pc-ink)',
};

const startHintStyle: CSSProperties = {
  margin: 0,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  padding: '5px 12px',
  borderRadius: 3,
  background: 'rgba(174,210,74,0.10)',
  border: '1px solid rgba(174,210,74,0.34)',
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: '#aed24a',
};

// Live controls (match running)
const liveControlsStyle: CSSProperties = {
  marginTop: 24,
};

const liveControlsBarStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
  gap: 8,
};

const compactCtrlStyle: CSSProperties = {
  padding: '12px 12px',
  borderRadius: 10,
  background: 'var(--pc-ink2)',
  border: '1.5px solid var(--pc-line)',
  color: 'var(--pc-text)',
  textAlign: 'left',
  cursor: 'pointer',
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 13,
  fontWeight: 600,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
};

const compactCtrlHintStyle: CSSProperties = {
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: 'var(--pc-text4)',
};

// Footer
const footerActionsStyle: CSSProperties = {
  marginTop: 36,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 10,
};

const closeLinkStyle: CSSProperties = {
  padding: '8px 14px',
  background: 'transparent',
  border: '1px solid transparent',
  borderRadius: 8,
  color: 'var(--pc-text4)',
  cursor: 'pointer',
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
};

const errBoxStyle: CSSProperties = {
  padding: '10px 14px',
  background: 'rgba(255,92,92,0.10)',
  border: '1px solid rgba(255,92,92,0.4)',
  borderRadius: 8,
  color: '#ffb0b0',
  fontSize: 12.5,
  fontFamily: "'Inter Tight', system-ui, sans-serif",
};

// Tournament control section
const tSectionStyle: CSSProperties = {
  marginTop: 22,
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
};

const tLobbyCardStyle: CSSProperties = {
  ...consolePanelStyle,
  padding: '18px 18px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};

const tLobbyCountRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 8,
};

const tLobbyCountValStyle: CSSProperties = {
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 'clamp(28px, 8vw, 36px)',
  fontWeight: 800,
  color: 'var(--pc-bone)',
  lineHeight: 1,
};

const tLobbyCountLabelStyle: CSSProperties = {
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--pc-text3)',
};

const tLobbyRosterStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
};

const tLobbyRosterPillStyle: CSSProperties = {
  padding: '4px 10px',
  borderRadius: 6,
  background: 'rgba(124,77,255,0.10)',
  border: '1px solid rgba(124,77,255,0.22)',
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 12.5,
  fontWeight: 600,
  color: 'var(--pc-text)',
};

const tMetaRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '12px 14px',
  borderRadius: 10,
  background: 'var(--pc-ink2)',
  border: '1.5px solid var(--pc-line)',
};

const tRoundBadgeStyle: CSSProperties = {
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 13.5,
  fontWeight: 800,
  color: 'var(--pc-bone)',
  letterSpacing: '0.02em',
};

const tRemainingStyle: CSSProperties = {
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '0.10em',
  textTransform: 'uppercase',
  color: '#aed24a',
};

const tTopicStyle: CSSProperties = {
  padding: '10px 14px',
  borderRadius: 10,
  background: 'var(--pc-ink2)',
  border: '1px solid var(--pc-line2)',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const tTopicLabelStyle: CSSProperties = {
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 9.5,
  fontWeight: 700,
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  color: 'var(--pc-text3)',
};

const tTopicTextStyle: CSSProperties = {
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 14,
  fontWeight: 500,
  color: 'var(--pc-bone)',
  lineHeight: 1.4,
};
