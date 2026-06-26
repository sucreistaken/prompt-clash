'use client';

// CreateRoomFormClient v2 — ported from mockups/create-room.html + create-room-mobile.html.
// POST /api/rooms (Story 1.6) + redirect to /rooms/:roomId/control on success.
// Logic: roomName, categoryMode, advanced toggles/numbers, error handling, submit state.
// Visual: panel-less frame, mascot header, label-with-line-prefix fields,
// segmented control with inset shadow, advanced disclosure with dashed border-top.

import { useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { I18nProvider, useI18n } from '@/components/client/i18nContext';
import { AppHeader } from '@/components/common/AppHeader';
import { BackLink } from '@/components/common/BackLink';
import { BgAtmosphere } from '@/components/common/BgAtmosphere';
import { MascotFrame } from '@/components/common/MascotFrame';
import type { RoomMode } from '@/types/game';

type CategoryMode = 'RANDOM' | 'HOST_SELECTED' | 'PLAYER_VOTE';

type RoomDraft = {
  roomMode: RoomMode;
  categoryMode: CategoryMode;
  audienceEnabled: boolean;
  promptDuration: number;
  votingDuration: number;
  aiScoreEnabled: boolean;
  showPromptsAfterResult: boolean;
  showPromptsDuringWriting: boolean;
  rematchEnabled: boolean;
  audienceVotingEnabled: boolean;
};

const DEFAULTS: RoomDraft = {
  roomMode: 'DUEL',
  categoryMode: 'RANDOM',
  audienceEnabled: true,
  promptDuration: 60,
  votingDuration: 15,
  aiScoreEnabled: true,
  showPromptsAfterResult: true,
  showPromptsDuringWriting: false,
  rematchEnabled: true,
  audienceVotingEnabled: false,
};

export function CreateRoomFormClient() {
  return (
    <I18nProvider>
      <CreateRoomBody />
    </I18nProvider>
  );
}

function CreateRoomBody() {
  const { t } = useI18n();
  const router = useRouter();
  const [draft, setDraft] = useState<RoomDraft>(DEFAULTS);
  const [advanced, setAdvanced] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function set<K extends keyof RoomDraft>(key: K, val: RoomDraft[K]) {
    setDraft((d) => ({ ...d, [key]: val }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        const code = body?.code as string | undefined;
        if (code === 'rate_limited' || code === 'room_create_limit') {
          setErr(t('createRoomRateLimited'));
        } else if (code === 'invalid_input') {
          setErr(t('createRoomInvalid'));
        } else {
          setErr(t('createRoomFailed'));
        }
        setSubmitting(false);
        return;
      }
      const roomId: string = body.data.roomId;
      router.replace(`/rooms/${roomId}/control`);
    } catch {
      setErr(t('createRoomFailed'));
      setSubmitting(false);
    }
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
          padding: '14px 18px 32px',
        }}
      >
        <AppHeader right={<BackLink href="/" label={t('back')} />} />

        <section style={headStyle}>
          <span style={tagStyle}>
            <span aria-hidden="true" style={tagDotStyle} />
            {t('createRoomTag')}
          </span>
          <h1 style={h1Style}>{t('createRoomH1')}</h1>
          <p style={subStyle}>{t('createRoomLead')}</p>
        </section>

        <section style={mascotHostStyle} aria-label={t('ariaMascot')}>
          <MascotFrame
            size={104}
            mascotSize={84}
            variant="default"
            label={t('createRoomMascotLabel')}
          />
        </section>

        <form onSubmit={submit} noValidate style={formStyle}>
          {/* roomMode segmented — first control, frames everything else */}
          <div style={fieldStyle}>
            <span style={lblStyle}>
              <span aria-hidden="true" style={lblLineStyle} />
              {t('gameMode')}
            </span>
            <div
              role="radiogroup"
              aria-label={t('gameMode')}
              style={{ ...segStyle, gridTemplateColumns: 'repeat(2, 1fr)' }}
            >
              {(['DUEL', 'TOURNAMENT'] as const).map((mode) => {
                const on = draft.roomMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => set('roomMode', mode)}
                    className="pc-seg-btn"
                    style={{
                      ...segBtnStyle,
                      background: on ? 'var(--pc-accent)' : 'transparent',
                      color: on ? '#fff' : 'var(--pc-text2)',
                      boxShadow: on ? 'inset 0 -2px 0 #5a35cc' : 'none',
                    }}
                  >
                    {mode === 'DUEL' ? t('modeDuel') : t('modeTournament')}
                  </button>
                );
              })}
            </div>
            {draft.roomMode === 'TOURNAMENT' && (
              <span style={rowDescStyle}>{t('modeTournamentHint')}</span>
            )}
          </div>

          {/* categoryMode segmented */}
          <div style={fieldStyle}>
            <span style={lblStyle}>
              <span aria-hidden="true" style={lblLineStyle} />
              {t('createRoomCategoryMode')}
            </span>
            <div role="radiogroup" aria-label={t('createRoomCategoryMode')} style={segStyle}>
              {(['RANDOM', 'HOST_SELECTED', 'PLAYER_VOTE'] as const).map((mode) => {
                const on = draft.categoryMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => set('categoryMode', mode)}
                    className="pc-seg-btn"
                    style={{
                      ...segBtnStyle,
                      background: on ? 'var(--pc-accent)' : 'transparent',
                      color: on ? '#fff' : 'var(--pc-text2)',
                      boxShadow: on ? 'inset 0 -2px 0 #5a35cc' : 'none',
                    }}
                  >
                    {t(
                      mode === 'RANDOM'
                        ? 'categoryModeRandom'
                        : mode === 'HOST_SELECTED'
                          ? 'categoryModeHost'
                          : 'categoryModePlayerVote'
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* audienceEnabled (always visible, before Advanced) */}
          <ToggleRow
            ttl={t('createRoomAudienceEnabledTtl')}
            desc={t('createRoomAudienceEnabledDesc')}
            on={draft.audienceEnabled}
            onChange={(v) => set('audienceEnabled', v)}
          />

          {/* Advanced disclosure */}
          <div style={advWrapStyle} className={advanced ? 'pc-adv pc-adv--open' : 'pc-adv'}>
            <button
              type="button"
              onClick={() => setAdvanced((a) => !a)}
              aria-expanded={advanced}
              aria-controls="pc-adv-body"
              className="pc-adv-trig"
              style={advTrigStyle}
            >
              <span style={advLabelStyle}>{t('createRoomAdvanced')}</span>
              <span
                aria-hidden="true"
                className="pc-adv-chev"
                style={{
                  ...advChevStyle,
                  transform: advanced ? 'rotate(90deg)' : 'rotate(0deg)',
                }}
              >
                ▸
              </span>
            </button>
            {advanced ? (
              <div id="pc-adv-body" style={advBodyStyle}>
                <NumberRow
                  ttl={t('createRoomPromptDuration')}
                  desc="10 – 180 sn"
                  value={draft.promptDuration}
                  min={10}
                  max={180}
                  onChange={(v) => set('promptDuration', v)}
                />
                <NumberRow
                  ttl={t('createRoomVotingDuration')}
                  desc="5 – 120 sn"
                  value={draft.votingDuration}
                  min={5}
                  max={120}
                  onChange={(v) => set('votingDuration', v)}
                />
                <ToggleRow
                  ttl={t('createRoomAudienceVotingTtl')}
                  desc={t('createRoomAudienceVotingDesc')}
                  on={draft.audienceVotingEnabled}
                  onChange={(v) => set('audienceVotingEnabled', v)}
                  inline
                />
                <ToggleRow
                  ttl={t('createRoomAiScoreTtl')}
                  on={draft.aiScoreEnabled}
                  onChange={(v) => set('aiScoreEnabled', v)}
                  inline
                />
                <ToggleRow
                  ttl={t('createRoomShowPromptsAfterResultTtl')}
                  on={draft.showPromptsAfterResult}
                  onChange={(v) => set('showPromptsAfterResult', v)}
                  inline
                />
                <ToggleRow
                  ttl={t('createRoomShowPromptsDuringWritingTtl')}
                  desc={t('createRoomShowPromptsDuringWritingDesc')}
                  on={draft.showPromptsDuringWriting}
                  onChange={(v) => set('showPromptsDuringWriting', v)}
                  inline
                />
                <ToggleRow
                  ttl={t('createRoomRematchTtl')}
                  on={draft.rematchEnabled}
                  onChange={(v) => set('rematchEnabled', v)}
                  inline
                />
              </div>
            ) : null}
          </div>

          {err && (
            <div role="alert" style={errBoxStyle}>
              {err}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{
              ...ctaStyle,
              opacity: submitting ? 0.65 : 1,
              cursor: submitting ? 'wait' : 'pointer',
            }}
            className="pc-cta"
          >
            <span>{submitting ? t('createRoomSubmitting') : t('createRoomSubmit').replace(/\s*→\s*$/, '')}</span>
            {!submitting && (
              <span style={ctaArrowStyle} aria-hidden="true">
                →
              </span>
            )}
          </button>
        </form>
      </div>

      {/* Hydration trap: <style>{text}</style> içinde ASCII tek/çift tırnak
          SSR'de &#x27; / &quot; olarak entity-encode edilir, client raw
          bırakır → mismatch. Türkçe yorum + double-quote'lu attribute
          selector kaldırıldı; CSS spec'te [attr=ident] tırnaksız da
          geçerli. */}
      <style>{`
        .pc-input { transition: border-color .16s, box-shadow .16s; }
        .pc-input:focus { border-color: var(--pc-accent) !important; box-shadow: 0 0 0 3px rgba(124,77,255,.18); outline: none; }
        .pc-cta { transition: transform .1s, box-shadow .16s, opacity .12s; }
        .pc-cta:hover:not(:disabled) { box-shadow: 0 14px 36px rgba(124,77,255,.44), inset 0 -2px 0 rgba(0,0,0,.18); }
        .pc-cta:active:not(:disabled) { transform: translateY(1px); }
        .pc-seg-btn { transition: background .14s, color .14s, box-shadow .14s, transform 80ms ease-out; }
        .pc-seg-btn:not([aria-checked=true]):hover { background: rgba(124,77,255,.08); color: var(--pc-bone); }
        .pc-seg-btn:active { transform: translateY(1px); }
        .pc-adv-trig { transition: color .14s, border-color .14s; }
        .pc-adv-trig:hover { color: var(--pc-bone); }
        .pc-adv-chev { transition: transform 180ms ease-out, color .14s; }
      `}</style>
    </div>
  );
}

// ─── Toggle row ───────────────────────────────────────────────────────────────

function ToggleRow({
  ttl,
  desc,
  on,
  onChange,
  inline,
}: {
  ttl: string;
  desc?: string;
  on: boolean;
  onChange: (v: boolean) => void;
  /** Inline mode inside advanced body — no outer card, just a divider line above. */
  inline?: boolean;
}) {
  const wrapperStyle: CSSProperties = inline
    ? {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '12px 2px',
        borderTop: '1px solid var(--pc-ink3)',
        cursor: 'pointer',
        background: 'transparent',
        border: 'none',
        textAlign: 'left',
        fontFamily: 'inherit',
        color: 'inherit',
        width: '100%',
      }
    : {
        background: 'var(--pc-ink2)',
        border: '1.5px solid var(--pc-line)',
        borderRadius: 10,
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 14,
        cursor: 'pointer',
        color: 'inherit',
        textAlign: 'left',
        fontFamily: 'inherit',
      };
  // inline rendered as div+button click target to avoid nested button issues with borderTop
  if (inline) {
    return (
      <div
        role="switch"
        aria-checked={on}
        tabIndex={0}
        onClick={() => onChange(!on)}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            onChange(!on);
          }
        }}
        style={wrapperStyle}
      >
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
          <span style={rowTtlStyle}>{ttl}</span>
          {desc ? <span style={rowDescStyle}>{desc}</span> : null}
        </span>
        <SwitchPip on={on} />
      </div>
    );
  }
  return (
    <button type="button" onClick={() => onChange(!on)} role="switch" aria-checked={on} style={wrapperStyle}>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={rowTtlStyle}>{ttl}</span>
        {desc ? <span style={rowDescStyle}>{desc}</span> : null}
      </span>
      <SwitchPip on={on} />
    </button>
  );
}

function SwitchPip({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 42,
        height: 24,
        borderRadius: 999,
        background: on ? 'var(--pc-accent)' : 'var(--pc-ink3)',
        border: `1px solid ${on ? 'var(--pc-accent)' : 'var(--pc-line2)'}`,
        position: 'relative',
        flex: 'none',
        transition: 'background 0.18s, border-color 0.18s',
      }}
    >
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: on ? '#fff' : 'var(--pc-text3)',
          position: 'absolute',
          top: 2,
          left: on ? 21 : 2,
          transition: 'left 0.18s ease',
          boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
          display: 'block',
        }}
      />
    </span>
  );
}

// ─── Number row ───────────────────────────────────────────────────────────────

function NumberRow({
  ttl,
  desc,
  value,
  min,
  max,
  onChange,
}: {
  ttl: string;
  desc?: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '12px 2px',
        borderTop: '1px solid var(--pc-ink3)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
        <span style={rowTtlStyle}>{ttl}</span>
        {desc ? <span style={rowDescStyle}>{desc}</span> : null}
      </div>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, n)));
        }}
        className="pc-input pc-num-input"
        style={{
          width: 80,
          minHeight: 44,
          borderRadius: 6,
          background: 'var(--pc-ink2)',
          border: '1px solid var(--pc-line)',
          color: 'var(--pc-bone)',
          fontFamily: "'Inter Tight', system-ui, sans-serif",
          fontSize: 14,
          textAlign: 'center',
          outline: 'none',
          letterSpacing: '0.04em',
        }}
      />
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const headStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: '18px 0 12px',
};

const tagStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  alignSelf: 'flex-start',
  gap: 8,
  padding: '4px 10px',
  borderRadius: 999,
  background: 'rgba(124,77,255,0.10)',
  border: '1px solid rgba(124,77,255,0.34)',
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 10.5,
  letterSpacing: '0.10em',
  color: 'var(--pc-accent)',
};

const tagDotStyle: CSSProperties = {
  width: 6,
  height: 6,
  background: 'var(--pc-accent)',
  flex: 'none',
  boxShadow: '0 0 8px rgba(124,77,255,0.5)',
};

const h1Style: CSSProperties = {
  // Sayfa başlığı pixel — landing showcase ile aynı dil, daha sakin boyut.
  // Silkscreen'de negatif tracking harfleri eziyor; pozitife çevrildi.
  fontFamily: "'Silkscreen', monospace",
  fontSize: 'clamp(22px, 6vw, 28px)',
  fontWeight: 400,
  color: 'var(--pc-bone)',
  letterSpacing: '0.02em',
  lineHeight: 1.15,
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

const mascotHostStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  padding: '8px 0 16px',
};

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

const segStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 4,
  background: 'var(--pc-ink2)',
  border: '1.5px solid var(--pc-line)',
  borderRadius: 10,
  padding: 4,
};

const segBtnStyle: CSSProperties = {
  border: 'none',
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 13,
  fontWeight: 600,
  padding: '11px 4px',
  borderRadius: 6,
  cursor: 'pointer',
  lineHeight: 1.2,
  transition: 'background .14s, color .14s',
};

const advWrapStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
};

const advTrigStyle: CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: 'inherit',
  padding: '11px 2px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  cursor: 'pointer',
  width: '100%',
  fontFamily: 'inherit',
  borderTop: '1px dashed var(--pc-ink3)',
  marginTop: 4,
};

const advLabelStyle: CSSProperties = {
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: 'var(--pc-text2)',
};

const advChevStyle: CSSProperties = {
  color: 'var(--pc-text3)',
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 12,
  transition: 'transform .16s',
};

const advBodyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  padding: '8px 0 4px',
};

const rowTtlStyle: CSSProperties = {
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--pc-text)',
};

const rowDescStyle: CSSProperties = {
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 12,
  color: 'var(--pc-text3)',
  lineHeight: 1.4,
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

const ctaStyle: CSSProperties = {
  width: '100%',
  minHeight: 60,
  borderRadius: 10,
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 16,
  fontWeight: 800,
  background: 'var(--pc-accent)',
  color: '#fff',
  border: 'none',
  marginTop: 4,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  boxShadow: '0 10px 28px rgba(124,77,255,0.32), inset 0 -2px 0 rgba(0,0,0,0.18)',
  letterSpacing: '0.005em',
};

const ctaArrowStyle: CSSProperties = {
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 18,
  lineHeight: 1,
};
