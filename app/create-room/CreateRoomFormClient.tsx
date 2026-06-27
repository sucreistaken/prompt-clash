'use client';

// CreateRoomFormClient v3 — arcade/pixel pass over v2.
// POST /api/rooms (Story 1.6) + redirect to /rooms/:roomId/control on success.
// Logic unchanged from v2 (roomMode, tournamentMode, categoryMode, advanced
// toggles/numbers, error handling, submit state, all i18n keys + a11y roles).
// Visual: two-column desktop layout (intro+mascot | console panel), mascot
// speech bubble, blocky segmented "keys", square-knob arcade switch, bordered
// advanced bar with pixel +/- box, hard-offset 3D CTA. Theme tokens only.

import { useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { I18nProvider, useI18n } from '@/components/client/i18nContext';
import { AppHeader } from '@/components/common/AppHeader';
import { BackLink } from '@/components/common/BackLink';
import { BgAtmosphere } from '@/components/common/BgAtmosphere';
import { MascotFrame } from '@/components/common/MascotFrame';
import type { RoomMode, TournamentMode } from '@/types/game';

type CategoryMode = 'RANDOM' | 'HOST_SELECTED' | 'PLAYER_VOTE';

type RoomDraft = {
  roomMode: RoomMode;
  tournamentMode: TournamentMode;
  categoryMode: CategoryMode;
  categoryPool: string[];
  customThemes: string[];
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
  tournamentMode: 'A',
  categoryMode: 'RANDOM',
  categoryPool: [],
  customThemes: [],
  audienceEnabled: true,
  promptDuration: 60,
  votingDuration: 15,
  aiScoreEnabled: true,
  showPromptsAfterResult: true,
  showPromptsDuringWriting: false,
  rematchEnabled: true,
  audienceVotingEnabled: false,
};

type CategoryOption = { code: string; labelTr: string };

export function CreateRoomFormClient({ categories }: { categories: CategoryOption[] }) {
  return (
    <I18nProvider>
      <CreateRoomBody categories={categories} />
    </I18nProvider>
  );
}

function CreateRoomBody({ categories }: { categories: CategoryOption[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [draft, setDraft] = useState<RoomDraft>(DEFAULTS);
  const [advanced, setAdvanced] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [themeInput, setThemeInput] = useState('');

  function set<K extends keyof RoomDraft>(key: K, val: RoomDraft[K]) {
    setDraft((d) => ({ ...d, [key]: val }));
  }

  function toggleCat(code: string) {
    set(
      'categoryPool',
      draft.categoryPool.includes(code)
        ? draft.categoryPool.filter((c) => c !== code)
        : [...draft.categoryPool, code]
    );
  }
  function addTheme() {
    const v = themeInput.trim();
    if (v.length < 2 || v.length > 60) return;
    if (draft.customThemes.length >= 8) return;
    if (draft.customThemes.some((t) => t.toLowerCase() === v.toLowerCase())) {
      setThemeInput('');
      return;
    }
    set('customThemes', [...draft.customThemes, v]);
    setThemeInput('');
  }
  function removeTheme(t: string) {
    set('customThemes', draft.customThemes.filter((x) => x !== t));
  }

  const poolEmpty = draft.categoryPool.length === 0 && draft.customThemes.length === 0;

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

  const isT = draft.roomMode === 'TOURNAMENT';

  return (
    <div style={{ minHeight: '100dvh', position: 'relative', overflowX: 'hidden' }}>
      <BgAtmosphere variant="default" />

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          maxWidth: 960,
          margin: '0 auto',
          padding: '14px 18px 36px',
        }}
      >
        <AppHeader right={<BackLink href="/" label={t('back')} />} />

        <div className="cr-grid">
          {/* ── Intro column (head + mascot + speech bubble) ───────────────── */}
          <aside className="cr-intro">
            <section style={headStyle} className="cr-head">
              <span style={tagStyle}>
                <span aria-hidden="true" style={tagDotStyle} />
                {t(isT ? 'createRoomTagT' : 'createRoomTag')}
              </span>
              <h1 style={h1Style}>{t(isT ? 'createRoomH1T' : 'createRoomH1')}</h1>
              <p style={subStyle}>{t(isT ? 'createRoomLeadT' : 'createRoomLead')}</p>
            </section>

            <section style={mascotHostStyle} aria-label={t('ariaMascot')} className="cr-mascot">
              {/* Pixel speech bubble — gives the mascot a voice instead of empty space */}
              <div style={bubbleStyle}>
                <span aria-hidden="true" style={bubbleDotStyle} />
                {t('createRoomMascotLabel')}
                <span aria-hidden="true" className="cr-bubble-tail" style={bubbleTailStyle} />
              </div>
              <MascotFrame
                size={104}
                mascotSize={84}
                variant="default"
                particles
                desktopSize={148}
              />
            </section>
          </aside>

          {/* ── Console panel (the form) ───────────────────────────────────── */}
          <form onSubmit={submit} noValidate style={formStyle} className="cr-panel">
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
                      style={segBtnVisual(on)}
                    >
                      {mode === 'DUEL' ? t('modeDuel') : t('modeTournament')}
                    </button>
                  );
                })}
              </div>
              {isT && <span style={rowDescStyle}>{t('modeTournamentHint')}</span>}
            </div>

            {/* tournamentMode segmented — only visible when TOURNAMENT is selected */}
            {isT && (
              <div style={fieldStyle}>
                <span style={lblStyle}>
                  <span aria-hidden="true" style={lblLineStyle} />
                  {t('tournamentTypeLabel')}
                </span>
                <div
                  role="radiogroup"
                  aria-label={t('tournamentTypeLabel')}
                  style={{ ...segStyle, gridTemplateColumns: 'repeat(2, 1fr)' }}
                >
                  {(['A', 'B'] as const).map((m) => {
                    const on = draft.tournamentMode === m;
                    return (
                      <button
                        key={m}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => set('tournamentMode', m)}
                        className="pc-seg-btn"
                        style={segBtnVisual(on)}
                      >
                        {m === 'A' ? t('tModeA') : t('tModeB')}
                      </button>
                    );
                  })}
                </div>
                <span style={rowDescStyle}>
                  {draft.tournamentMode === 'A' ? t('tModeAHint') : t('tModeBHint')}
                </span>
              </div>
            )}

            {/* categoryMode segmented */}
            <div style={fieldStyle}>
              <span style={lblStyle}>
                <span aria-hidden="true" style={lblLineStyle} />
                {t('createRoomCategoryMode')}
              </span>
              <div role="radiogroup" aria-label={t('createRoomCategoryMode')} style={segStyle}>
                {(['RANDOM', 'HOST_SELECTED', 'PLAYER_VOTE'] as const).map((mode) => {
                  const on = draft.categoryMode === mode;
                  const soon = mode === 'PLAYER_VOTE';
                  return (
                    <button
                      key={mode}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      aria-disabled={soon}
                      disabled={soon}
                      onClick={() => !soon && set('categoryMode', mode)}
                      className="pc-seg-btn"
                      style={{ ...segBtnVisual(on), opacity: soon ? 0.5 : 1, cursor: soon ? 'not-allowed' : 'pointer', position: 'relative' }}
                    >
                      {t(
                        mode === 'RANDOM'
                          ? 'categoryModeRandom'
                          : mode === 'HOST_SELECTED'
                            ? 'categoryModeHost'
                            : 'categoryModePlayerVote'
                      )}
                      {soon ? <span style={soonBadgeStyle}>{t('createRoomModeSoon')}</span> : null}
                    </button>
                  );
                })}
              </div>
              {draft.categoryMode === 'HOST_SELECTED' ? (
                <div style={poolWrapStyle}>
                  {/* Hazır temalar — aç/kapa chip grid */}
                  <span style={poolSubLabelStyle}>{t('createRoomPoolBuiltinLabel')}</span>
                  <div className="cr-chips" role="group" aria-label={t('createRoomPoolBuiltinLabel')}>
                    {categories.map((c) => {
                      const on = draft.categoryPool.includes(c.code);
                      return (
                        <button
                          key={c.code}
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggleCat(c.code)}
                          className="pc-seg-btn"
                          style={catChipStyle(on)}
                        >
                          {c.labelTr}
                        </button>
                      );
                    })}
                  </div>

                  {/* Kendi temaların — input + chip listesi */}
                  <span style={poolSubLabelStyle}>{t('createRoomPoolCustomLabel')}</span>
                  <div style={themeRowStyle}>
                    <input
                      type="text"
                      value={themeInput}
                      onChange={(e) => setThemeInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addTheme();
                        }
                      }}
                      maxLength={60}
                      placeholder={t('createRoomThemePlaceholder')}
                      className="pc-input"
                      style={themeInputStyle}
                      aria-label={t('createRoomPoolCustomLabel')}
                    />
                    <button
                      type="button"
                      onClick={addTheme}
                      disabled={draft.customThemes.length >= 8 || themeInput.trim().length < 2}
                      className="pc-seg-btn"
                      style={themeAddBtnStyle}
                    >
                      {t('createRoomThemeAdd')}
                    </button>
                  </div>
                  {draft.customThemes.length > 0 ? (
                    <div className="cr-chips">
                      {draft.customThemes.map((tm) => (
                        <span key={tm} style={themeChipStyle}>
                          {tm}
                          <button
                            type="button"
                            onClick={() => removeTheme(tm)}
                            aria-label={t('createRoomThemeRemove')}
                            style={themeChipXStyle}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <span style={rowDescStyle}>
                    {poolEmpty ? t('createRoomPoolEmptyHint') : t('createRoomPoolLimitHint')}
                  </span>
                </div>
              ) : null}
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
                <span aria-hidden="true" className="pc-adv-box" style={advBoxStyle}>
                  {advanced ? '−' : '+'}
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
                opacity: submitting ? 0.7 : 1,
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
      </div>

      {/* Hydration trap: <style>{text}</style> içinde grid-template-areas gibi
          tırnaklı değerlerden kaçın — SSR &quot; encode eder. Burada sadece
          class selector + media query var, güvenli. */}
      <style>{`
        .cr-grid { display: flex; flex-direction: column; gap: 22px; margin-top: 6px; }
        .cr-intro { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 4px; }
        .cr-head { align-items: center; }
        .cr-mascot { align-items: center; }
        .pc-input { transition: border-color .16s, box-shadow .16s; }
        .pc-input:focus { border-color: var(--pc-accent) !important; box-shadow: 0 0 0 3px rgba(124,77,255,.18); outline: none; }
        .pc-cta { transition: transform .08s ease-out, box-shadow .08s ease-out, filter .12s; }
        .pc-cta:hover:not(:disabled) { filter: brightness(1.07); }
        .pc-cta:active:not(:disabled) { transform: translateY(5px); box-shadow: 0 0 0 #4a2bb0, inset 0 2px 7px rgba(0,0,0,.32); }
        .pc-seg-btn { transition: background .12s, color .12s, box-shadow .1s, transform 70ms ease-out; }
        .pc-seg-btn:not([aria-checked=true]):hover { background: var(--pc-ink4); color: var(--pc-bone); }
        .pc-seg-btn:active { transform: translateY(1px); }
        .pc-adv-trig { transition: border-color .14s, background .14s; }
        .pc-adv-trig:hover { border-color: var(--pc-line2); background: var(--pc-ink2); }
        .pc-adv-trig:hover .pc-adv-box { border-color: var(--pc-accent); }
        .cr-chips { display: flex; flex-wrap: wrap; gap: 6px; }
        @media (min-width: 880px) {
          .cr-grid { display: grid; grid-template-columns: 0.92fr 1.08fr; gap: 36px; align-items: center; margin-top: 18px; }
          .cr-intro { align-items: flex-start; text-align: left; gap: 10px; }
          .cr-head { align-items: flex-start; }
          .cr-mascot { align-items: flex-start; }
        }
      `}</style>
    </div>
  );
}

// ─── Segmented "key" visual ─────────────────────────────────────────────────

/** Blocky arcade key — passive keys look raised+clickable, active key looks pressed-in. */
function segBtnVisual(on: boolean): CSSProperties {
  return {
    ...segBtnStyle,
    background: on ? 'var(--pc-accent)' : 'var(--pc-ink3)',
    color: on ? '#fff' : 'var(--pc-text2)',
    border: `1px solid ${on ? 'var(--pc-bone)' : 'var(--pc-line)'}`,
    boxShadow: on ? 'inset 0 -3px 0 #5a35cc' : '0 2px 0 var(--pc-ink)',
    transform: on ? 'translateY(1px)' : 'none',
  };
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
        background: 'var(--pc-ink)',
        border: '2px solid var(--pc-line2)',
        borderRadius: 4,
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 14,
        cursor: 'pointer',
        color: 'inherit',
        textAlign: 'left',
        fontFamily: 'inherit',
        boxShadow: '0 2px 0 rgba(0,0,0,0.22)',
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

/** Square-knob arcade switch — blocky track + sliding square knob (no iOS pill). */
function SwitchPip({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 50,
        height: 26,
        borderRadius: 3,
        background: on ? 'var(--pc-accent)' : 'var(--pc-ink)',
        border: `2px solid ${on ? 'var(--pc-accent)' : 'var(--pc-line2)'}`,
        position: 'relative',
        flex: 'none',
        boxShadow: 'inset 0 2px 0 rgba(0,0,0,0.22)',
        transition: 'background 0.16s, border-color 0.16s',
      }}
    >
      <span
        style={{
          width: 16,
          height: 16,
          borderRadius: 2,
          background: on ? '#fff' : 'var(--pc-text3)',
          border: `1px solid ${on ? 'var(--pc-bone)' : 'var(--pc-line2)'}`,
          position: 'absolute',
          top: 3,
          left: on ? 28 : 3,
          transition: 'left 0.16s ease',
          boxShadow: '0 1px 0 rgba(0,0,0,0.35)',
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
          borderRadius: 4,
          background: 'var(--pc-ink)',
          border: '2px solid var(--pc-line2)',
          color: 'var(--pc-bone)',
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          fontSize: 15,
          fontWeight: 700,
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
  padding: '14px 0 6px',
};

const tagStyle: CSSProperties = {
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
  fontSize: 'clamp(22px, 6vw, 30px)',
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
  maxWidth: '42ch',
};

const mascotHostStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  padding: '12px 0 4px',
};

// Pixel speech bubble — lime arcade tint, hard corners, downward tail.
const bubbleStyle: CSSProperties = {
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 14px',
  borderRadius: 4,
  background: 'rgba(174,210,74,0.12)',
  border: '2px solid rgba(174,210,74,0.46)',
  boxShadow: '0 3px 0 rgba(0,0,0,0.22)',
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: '#aed24a',
  textShadow: '0 0 12px rgba(174,210,74,0.30)',
};

const bubbleDotStyle: CSSProperties = {
  width: 6,
  height: 6,
  background: '#aed24a',
  flex: 'none',
  boxShadow: '0 0 8px rgba(174,210,74,0.6)',
};

const bubbleTailStyle: CSSProperties = {
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

// Console panel — single framed card with neon top cap + hard offset shadow.
const formStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  background: 'var(--pc-ink2)',
  border: '2px solid var(--pc-line2)',
  borderTop: '3px solid var(--pc-accent)',
  borderRadius: 6,
  padding: '20px 18px',
  boxShadow: '6px 6px 0 rgba(0,0,0,0.32)',
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
  color: 'var(--pc-text2)',
  paddingLeft: 2,
  display: 'flex',
  alignItems: 'center',
  gap: 10,
};

const lblLineStyle: CSSProperties = {
  width: 16,
  height: 2,
  background: 'var(--pc-accent)',
  flex: 'none',
};

const segStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 5,
  background: 'var(--pc-ink)',
  border: '2px solid var(--pc-line2)',
  borderRadius: 4,
  padding: 5,
};

const segBtnStyle: CSSProperties = {
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 13,
  fontWeight: 700,
  padding: '11px 4px',
  borderRadius: 2,
  cursor: 'pointer',
  lineHeight: 1.2,
};

const advWrapStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  marginTop: 2,
};

const advTrigStyle: CSSProperties = {
  background: 'var(--pc-ink)',
  color: 'inherit',
  padding: '13px 14px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  cursor: 'pointer',
  width: '100%',
  fontFamily: 'inherit',
  border: '2px solid var(--pc-line)',
  borderRadius: 4,
};

const advLabelStyle: CSSProperties = {
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: 'var(--pc-text)',
};

// Pixel +/- box on the right of the advanced bar — reads as a real toggle.
const advBoxStyle: CSSProperties = {
  width: 24,
  height: 24,
  display: 'grid',
  placeItems: 'center',
  border: '2px solid var(--pc-line2)',
  borderRadius: 3,
  background: 'var(--pc-ink2)',
  color: 'var(--pc-accent)',
  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
  fontSize: 16,
  fontWeight: 800,
  lineHeight: 1,
  transition: 'border-color .14s',
};

const advBodyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  padding: '10px 12px 2px',
  marginTop: 6,
  border: '2px solid var(--pc-line)',
  borderRadius: 4,
  background: 'rgba(0,0,0,0.14)',
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
  border: '2px solid rgba(255,92,92,0.42)',
  borderRadius: 4,
  color: '#ffb0b0',
  fontSize: 13,
  fontFamily: "'Inter Tight', system-ui, sans-serif",
};

// Arcade CTA — hard offset "base" shadow, presses down on :active (no blur glow).
const ctaStyle: CSSProperties = {
  width: '100%',
  minHeight: 58,
  borderRadius: 4,
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 15,
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  background: 'var(--pc-accent)',
  color: '#fff',
  border: '2px solid #5a35cc',
  marginTop: 2,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  boxShadow: '0 5px 0 #4a2bb0',
};

const ctaArrowStyle: CSSProperties = {
  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
  fontSize: 18,
  fontWeight: 800,
  lineHeight: 1,
};

const poolWrapStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  marginTop: 8,
  padding: '12px 12px 10px',
  border: '2px solid var(--pc-line)',
  borderRadius: 4,
  background: 'rgba(0,0,0,0.14)',
};

const poolSubLabelStyle: CSSProperties = {
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: 'var(--pc-text2)',
  marginTop: 2,
};

function catChipStyle(on: boolean): CSSProperties {
  return {
    fontFamily: "'Inter Tight', system-ui, sans-serif",
    fontSize: 11.5,
    fontWeight: 700,
    padding: '8px 10px',
    borderRadius: 3,
    lineHeight: 1.1,
    cursor: 'pointer',
    background: on ? 'var(--pc-accent)' : 'var(--pc-ink3)',
    color: on ? '#fff' : 'var(--pc-text2)',
    border: `1px solid ${on ? 'var(--pc-bone)' : 'var(--pc-line)'}`,
    boxShadow: on ? 'inset 0 -2px 0 #5a35cc' : '0 2px 0 var(--pc-ink)',
  };
}

const themeRowStyle: CSSProperties = {
  display: 'flex',
  gap: 6,
  alignItems: 'stretch',
};

const themeInputStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  minHeight: 44,
  borderRadius: 4,
  background: 'var(--pc-ink)',
  border: '2px solid var(--pc-line2)',
  color: 'var(--pc-bone)',
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 14,
  padding: '0 12px',
  outline: 'none',
};

const themeAddBtnStyle: CSSProperties = {
  flex: 'none',
  padding: '0 16px',
  minHeight: 44,
  borderRadius: 4,
  background: 'var(--pc-ink3)',
  color: 'var(--pc-bone)',
  border: '1px solid var(--pc-line)',
  boxShadow: '0 2px 0 var(--pc-ink)',
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 12.5,
  fontWeight: 700,
  cursor: 'pointer',
};

const themeChipStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 6px 6px 10px',
  borderRadius: 3,
  background: 'rgba(124,77,255,0.14)',
  border: '1px solid rgba(124,77,255,0.42)',
  color: 'var(--pc-bone)',
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 12,
  fontWeight: 600,
};

const themeChipXStyle: CSSProperties = {
  display: 'grid',
  placeItems: 'center',
  width: 18,
  height: 18,
  borderRadius: 2,
  border: 'none',
  background: 'rgba(0,0,0,0.25)',
  color: 'var(--pc-bone)',
  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
  fontSize: 14,
  lineHeight: 1,
  cursor: 'pointer',
};

const soonBadgeStyle: CSSProperties = {
  position: 'absolute',
  top: 3,
  right: 4,
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 7.5,
  fontWeight: 800,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--pc-text3)',
};
