'use client';

// JoinClient v2 — ported from mockups/join-full.html for the room_full branch,
// and a lighter refresh on the regular join form (BgAtmosphere swap, label-with-line
// pattern). Server replies with `room_full` → form swaps to JoinFullView dead-end
// which routes spectators to /watch/<code>.
//
// Logic preserved: nick validation, POST /api/rooms/[id]/join, sessionStorage
// pending-nick handoff, router.replace to /game on success, full state from
// initialFull prop OR API code='room_full'.

import { useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { I18nProvider, useI18n } from '@/components/client/i18nContext';
import { AppHeader } from '@/components/common/AppHeader';
import { BackLink } from '@/components/common/BackLink';
import { BgAtmosphere } from '@/components/common/BgAtmosphere';

type Props = {
  roomId: string;
  roomCode: string;
  roomName: string;
  initialFull?: boolean;
};

export function JoinClient(props: Props) {
  return (
    <I18nProvider>
      <JoinBody {...props} />
    </I18nProvider>
  );
}

function JoinBody({ roomId, roomCode, roomName, initialFull = false }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const [nick, setNick] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [full, setFull] = useState(initialFull);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const trimmed = nick.trim();
    if (trimmed.length < 3) {
      setErr(t('nicknameTooShort'));
      return;
    }
    if (trimmed.length > 20) {
      setErr(t('nicknameTooLong'));
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: trimmed }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        const code = body?.code as string | undefined;
        if (code === 'rate_limited') setErr(t('joinRateLimited'));
        else if (code === 'room_full') {
          setFull(true);
          setBusy(false);
          return;
        } else setErr(t('joinFailed'));
        setBusy(false);
        return;
      }
      try {
        sessionStorage.setItem(`pc_pending_nick:${roomId}`, trimmed);
      } catch {
        /* ignore */
      }
      router.replace(`/rooms/${roomId}/game`);
    } catch {
      setErr(t('joinFailed'));
      setBusy(false);
    }
  }

  if (full) {
    return <JoinFullView roomCode={roomCode} />;
  }

  return (
    <div style={{ minHeight: '100dvh', position: 'relative', overflowX: 'hidden' }}>
      <BgAtmosphere variant="default" />

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          maxWidth: 560,
          margin: '0 auto',
          padding: '14px 18px 36px',
        }}
      >
        <AppHeader right={<BackLink href="/" label={t('backHome')} />} />

        <section style={headStyle}>
          <span style={tagAccentStyle}>
            <span aria-hidden="true" style={tagAccentDotStyle} />
            {t('joinRoomLabel')} · {roomCode}
          </span>
          <h1 style={h1Style}>{t('joinTitle')}</h1>
          {roomName ? <p style={subStyle}>{roomName}</p> : null}
          <p style={subStyle}>{t('joinLead')}</p>
        </section>

        <form onSubmit={submit} noValidate style={formStyle}>
          <div style={fieldStyle}>
            <label htmlFor="nick" style={lblStyle}>
              <span aria-hidden="true" style={lblLineStyle} />
              {t('joinNicknameLabel')}
            </label>
            <input
              id="nick"
              type="text"
              value={nick}
              onChange={(e) => setNick(e.target.value)}
              placeholder={t('nicknamePlaceholder')}
              maxLength={20}
              autoFocus
              inputMode="text"
              autoCorrect="off"
              autoCapitalize="words"
              className="pc-input"
              style={{
                ...inputStyle,
                borderColor: nick ? 'var(--pc-line2)' : 'var(--pc-line)',
                fontWeight: nick ? 600 : 400,
                color: nick ? 'var(--pc-bone)' : 'var(--pc-text)',
              }}
            />
          </div>

          {err && (
            <div role="alert" style={errBoxStyle}>
              {err}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            style={{ ...ctaStyle, opacity: busy ? 0.65 : 1, cursor: busy ? 'wait' : 'pointer' }}
            className="pc-cta"
          >
            <span>{busy ? t('joining') : t('joinCta').replace(/\s*→\s*$/, '')}</span>
            {!busy && (
              <span aria-hidden="true" style={ctaArrowStyle}>→</span>
            )}
          </button>

          <p style={footerHintStyle}>{t('joinFooterHint')}</p>
        </form>
      </div>

      <style>{`
        .pc-input { transition: border-color .16s, box-shadow .16s; }
        .pc-input:focus { border-color: var(--pc-accent) !important; box-shadow: 0 0 0 3px rgba(124,77,255,.18); outline: none; }
        .pc-cta { transition: transform .08s ease-out, box-shadow .08s ease-out, filter .12s; }
        .pc-cta:hover:not(:disabled) { filter: brightness(1.07); }
        .pc-cta:active:not(:disabled) { transform: translateY(5px); box-shadow: 0 0 0 #4a2bb0, inset 0 2px 7px rgba(0,0,0,.32); }
      `}</style>
    </div>
  );
}

// ─── Join-Full dead-end ───────────────────────────────────────────────────────

function JoinFullView({ roomCode }: { roomCode: string }) {
  const { t } = useI18n();
  return (
    <div style={{ minHeight: '100dvh', position: 'relative', overflowX: 'hidden' }}>
      <BgAtmosphere variant="default" />

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          maxWidth: 560,
          margin: '0 auto',
          padding: '14px 18px 36px',
        }}
      >
        <AppHeader right={<BackLink href="/" label={t('backHome')} />} />

        <section style={headStyle}>
          <span style={tagNeutralStyle}>
            <span aria-hidden="true" style={tagNeutralDotStyle} />
            {t('joinFullTag').toUpperCase()}
          </span>
          <h1 style={h1Style}>{t('joinFullTitle')}</h1>
          <p style={subStyle}>{t('joinFullSub')}</p>
        </section>

        <section style={slotsStripStyle} aria-label={t('ariaSlots')}>
          <SlotTile slot="A" label={`${t('joinFullSlotLabel')} 1`} />
          <span style={vsMidStyle} aria-hidden="true">VS</span>
          <SlotTile slot="B" label={`${t('joinFullSlotLabel')} 2`} />
        </section>

        <div style={actionsStyle}>
          <a href={`/watch/${roomCode}`} style={ctaStyle} className="pc-cta">
            <span>{t('joinFullCta')}</span>
            <span aria-hidden="true" style={ctaArrowStyle}>→</span>
          </a>
          <a href="/" style={ctaSecondaryStyle} className="pc-cta-sec">
            {t('joinFullSecondary')}
          </a>
        </div>

        <p style={noteStyle}>{t('joinFullNote')}</p>
      </div>

      <style>{`
        .pc-cta { transition: transform .08s ease-out, box-shadow .08s ease-out, filter .12s; text-decoration: none; }
        .pc-cta:hover { filter: brightness(1.07); }
        .pc-cta:active { transform: translateY(5px); box-shadow: 0 0 0 #4a2bb0, inset 0 2px 7px rgba(0,0,0,.32); }
        .pc-cta-sec { transition: border-color .14s, color .14s, background .14s; text-decoration: none; }
        .pc-cta-sec:hover { border-color: var(--pc-line2); color: var(--pc-bone); background: var(--pc-ink2); }
      `}</style>
    </div>
  );
}

function SlotTile({ slot, label }: { slot: 'A' | 'B'; label: string }) {
  const isA = slot === 'A';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: 12,
        background: 'var(--pc-ink2)',
        border: `2px solid ${isA ? 'var(--pc-accent)' : '#aed24a'}`,
        borderRadius: 4,
        minWidth: 0,
        boxShadow: isA
          ? 'inset 0 -2px 0 rgba(124,77,255,0.28)'
          : 'inset 0 -2px 0 rgba(174,210,74,0.28)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 40,
          height: 40,
          flex: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "'Inter Tight', system-ui, sans-serif",
          fontSize: 17,
          letterSpacing: '0.04em',
          borderRadius: 3,
          imageRendering: 'pixelated',
          background: isA ? 'var(--pc-accent)' : '#aed24a',
          color: isA ? '#fff' : '#0e0e10',
          boxShadow: isA
            ? 'inset 0 -3px 0 #5a35cc, inset 0 1px 0 rgba(255,255,255,0.18)'
            : 'inset 0 -3px 0 #88aa2e, inset 0 1px 0 rgba(255,255,255,0.20)',
        }}
      >
        {slot}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span
          style={{
            fontFamily: "'Inter Tight', system-ui, sans-serif",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: isA ? 'var(--pc-accent)' : '#aed24a',
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontFamily: "'Inter Tight', system-ui, sans-serif",
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--pc-bone)',
            lineHeight: 1.2,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          —
        </span>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const headStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: '20px 0 14px',
};

const tagBaseStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  alignSelf: 'flex-start',
  gap: 8,
  padding: '4px 10px',
  borderRadius: 3,
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
};

const tagAccentStyle: CSSProperties = {
  ...tagBaseStyle,
  background: 'rgba(124,77,255,0.10)',
  border: '1px solid rgba(124,77,255,0.34)',
  color: 'var(--pc-accent)',
};

const tagAccentDotStyle: CSSProperties = {
  width: 6,
  height: 6,
  background: 'var(--pc-accent)',
  flex: 'none',
  boxShadow: '0 0 8px rgba(124,77,255,0.5)',
};

const tagNeutralStyle: CSSProperties = {
  ...tagBaseStyle,
  background: 'rgba(168,164,179,0.08)',
  border: '1px solid var(--pc-line)',
  color: 'var(--pc-text2)',
};

const tagNeutralDotStyle: CSSProperties = {
  width: 6,
  height: 6,
  background: 'var(--pc-text2)',
  flex: 'none',
};

// Pixel başlık — landing/create-room/control ile aynı Silkscreen dili.
const h1Style: CSSProperties = {
  fontFamily: "'Silkscreen', monospace",
  fontSize: 'clamp(22px, 6vw, 30px)',
  fontWeight: 400,
  color: 'var(--pc-bone)',
  letterSpacing: '0.02em',
  lineHeight: 1.15,
  textTransform: 'uppercase',
  margin: 0,
};

const subStyle: CSSProperties = {
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 14,
  color: 'var(--pc-text2)',
  lineHeight: 1.5,
  margin: 0,
  maxWidth: '48ch',
};

// Form
const formStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  marginTop: 4,
};

const fieldStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 7,
};

const lblStyle: CSSProperties = {
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  color: 'var(--pc-text3)',
  paddingLeft: 2,
  display: 'flex',
  alignItems: 'center',
  gap: 10,
};

const lblLineStyle: CSSProperties = {
  width: 16,
  height: 1,
  background: 'var(--pc-line2)',
  flex: 'none',
};

// Blok arcade input — sert kenar, dolu zemin.
const inputStyle: CSSProperties = {
  height: 54,
  borderRadius: 4,
  background: 'var(--pc-ink)',
  border: '2px solid var(--pc-line2)',
  padding: '0 16px',
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 16,
  width: '100%',
};

const errBoxStyle: CSSProperties = {
  padding: '10px 14px',
  background: 'rgba(255,92,92,0.12)',
  border: '1px solid rgba(255,92,92,0.4)',
  borderRadius: 8,
  color: '#ffb0b0',
  fontSize: 13,
  fontFamily: "'Inter Tight', system-ui, sans-serif",
};

// Blok arcade tuşu — hard-offset taban (soft glow yerine).
const ctaStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  minHeight: 60,
  borderRadius: 4,
  background: 'var(--pc-accent)',
  color: '#fff',
  border: '2px solid #5a35cc',
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 16,
  fontWeight: 800,
  letterSpacing: '0.02em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  boxShadow: '0 5px 0 #4a2bb0',
  textDecoration: 'none',
};

const ctaSecondaryStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  minHeight: 46,
  borderRadius: 4,
  background: 'var(--pc-ink3)',
  border: '1px solid var(--pc-line)',
  color: 'var(--pc-text)',
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
  textDecoration: 'none',
  boxShadow: '0 2px 0 var(--pc-ink)',
};

const ctaArrowStyle: CSSProperties = {
  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
  fontSize: 18,
  fontWeight: 800,
  lineHeight: 1,
};

const footerHintStyle: CSSProperties = {
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 12.5,
  color: 'var(--pc-text3)',
  lineHeight: 1.45,
  margin: 0,
};

// Slots strip (join full)
const slotsStripStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr auto 1fr',
  gap: 10,
  alignItems: 'stretch',
  marginTop: 6,
};

const vsMidStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: "'Silkscreen', monospace",
  fontSize: 13,
  fontWeight: 400,
  letterSpacing: '0.04em',
  color: 'var(--pc-lime, #aed24a)',
  padding: '0 4px',
  minWidth: 28,
  flex: 'none',
};

const actionsStyle: CSSProperties = {
  marginTop: 18,
  display: 'flex',
  flexDirection: 'column',
  gap: 9,
};

const noteStyle: CSSProperties = {
  marginTop: 16,
  padding: '11px 14px',
  borderRadius: 10,
  background: 'rgba(174,210,74,0.06)',
  border: '1px solid rgba(174,210,74,0.22)',
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 13,
  color: 'var(--pc-text2)',
  lineHeight: 1.5,
  textAlign: 'center',
  margin: '16px 0 0',
};
