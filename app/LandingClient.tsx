'use client';

// Landing v2 port — ported from mockups/landing-v2.html + landing-v2-mobile.html.
// Mobile-first: hero stacks vertically with mascot centered above H1; desktop
// (≥960px) flips to 2-col grid with mascot pulled to the right column.
//
// Logic preserved from prior LandingClient: room-code regex validate + router
// push to /join/[code]. Pixel-heavy v1 chrome (BattlePreview arena, corner
// notches, pixel-font body copy) was deleted in mockup v2 — DO NOT reintroduce.
// "Bir referans gelir..." pitch + "Etkinlik modu" event line + "VEYA" divider
// pattern explicitly removed per Sally session 2026-06-01.

import { useState, type FormEvent, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/components/client/i18nContext';
import { AppHeader } from '@/components/common/AppHeader';
import { BgAtmosphere } from '@/components/common/BgAtmosphere';
import { MascotFrame } from '@/components/common/MascotFrame';

export function LandingClient() {
  const { t } = useI18n();
  const router = useRouter();
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setErr(null);
    const clean = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,8}$/.test(clean)) {
      setErr(t('landingCodeInvalid'));
      return;
    }
    // Anlık görsel feedback: submit'e basınca buton "wait" cursor + opacity
    // düşer, router.push tamamlanırken kullanıcı "donmuş" hissetmez.
    setBusy(true);
    router.push(`/join/${clean}`);
  }

  return (
    <div style={{ minHeight: '100dvh', position: 'relative', overflowX: 'hidden' }}>
      <BgAtmosphere variant="default" />

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          maxWidth: 1180,
          margin: '0 auto',
          padding: '14px 18px 40px',
        }}
      >
        <AppHeader />

        <section className="pc-landing-hero" style={heroStyle}>
          {/* Mobile DOM order: copy → mascot → flow.
              Desktop ≥960px: grid-template-areas swaps mascot to right column. */}
          <div className="pc-landing-copy" style={copyStyle}>
            <h1 className="pc-landing-h1" style={h1Style}>
              {t('landingH1Part1')}
              <br />
              <span style={{ color: 'var(--pc-accent)' }}>{t('landingH1Part2')}</span>
            </h1>

            <p style={sloganStyle}>
              {t('landingSlogan')}{' '}
              <span style={{ color: '#aed24a' }}>{t('landingSloganEm')}</span>
            </p>

            <a href="/create-room" style={ctaPrimaryStyle} className="pc-cta-primary">
              <span>
                <span style={ctaPrimaryTitleStyle}>{t('landingPrimary')}</span>
                <span style={ctaPrimarySubStyle}>{t('landingPrimarySub')}</span>
              </span>
              <span style={ctaPrimaryArrowStyle} aria-hidden="true">→</span>
            </a>

            <form onSubmit={submit} noValidate style={codeFormStyle}>
              <label htmlFor="pc-code" style={codeLabelStyle}>
                <span aria-hidden="true" style={codeLabelLineStyle} />
                {t('landingCodeLabel')}
              </label>
              <div
                style={codeFieldStyle}
                className={err ? 'pc-code-field pc-code-field--err' : 'pc-code-field'}
              >
                <input
                  id="pc-code"
                  type="text"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase());
                    if (err) setErr(null);
                  }}
                  maxLength={8}
                  placeholder={t('landingCodePlaceholder')}
                  aria-label={t('landingCodeLabel')}
                  aria-invalid={err ? 'true' : undefined}
                  aria-describedby={err ? 'pc-code-err' : undefined}
                  autoCorrect="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  style={codeInputStyle}
                />
                <button type="submit" aria-label={t('landingCodeSubmit')} style={codeBtnStyle}>
                  →
                </button>
              </div>
              {err && (
                <span id="pc-code-err" role="alert" style={codeErrorStyle}>
                  {err}
                </span>
              )}
            </form>
          </div>

          <aside className="pc-landing-mascot" style={mascotWrapStyle} aria-label={t('ariaMascot')}>
            <MascotFrame
              size={128}
              desktopSize={300}
              desktopMascotSize={260}
              variant="default"
              label={t('landingMascotLabel')}
              sub={t('landingMascotSub')}
            />
          </aside>

          <div className="pc-landing-flow" style={flowSectionStyle}>
            <div style={flowLabStyle}>
              <span aria-hidden="true" style={flowLabLineStyle} />
              {t('landingHowH')}
            </div>
            <div className="pc-landing-steps" style={stepsGridStyle}>
              <FlowStep n="01" tone="accent" title={t('landingHow1Ttl')} />
              <FlowStep n="02" tone="lime" title={t('landingHow2Ttl')} />
              <FlowStep n="03" tone="bone" title={t('landingHow3Ttl')} />
            </div>
          </div>
        </section>

        <footer style={footStyle}>{t('landingFooter')}</footer>
      </div>

      <style>{`
        .pc-code-field { transition: border-color .16s, box-shadow .16s; }
        .pc-code-field:focus-within { border-color: var(--pc-accent); box-shadow: 0 0 0 3px rgba(124,77,255,.18); }
        .pc-code-field--err { border-color: var(--pc-live); }
        .pc-code-field button[type=submit]:hover { color: var(--pc-bone); background: rgba(124,77,255,.10); }
        .pc-code-field button[type=submit]:active { transform: translateY(1px); color: var(--pc-bone); }
        .pc-code-field button[type=submit][data-busy=true] { opacity: .65; cursor: wait; }
        .pc-cta-primary { transition: transform .1s, box-shadow .16s; }
        .pc-cta-primary:hover { box-shadow: 0 16px 40px rgba(124,77,255,.44), inset 0 -2px 0 rgba(0,0,0,.18); }
        .pc-cta-primary:active { transform: translateY(1px); }

        @media (min-width: 960px) {
          .pc-landing-hero {
            display: grid !important;
            grid-template-columns: 1.05fr .95fr !important;
            grid-template-rows: auto auto !important;
            column-gap: 56px !important;
            row-gap: 28px !important;
            padding: 24px 0 40px !important;
            align-items: start !important;
          }
          .pc-landing-copy { grid-column: 1 !important; grid-row: 1 !important; }
          .pc-landing-flow { grid-column: 1 !important; grid-row: 2 !important; margin-top: 0 !important; }
          .pc-landing-mascot { grid-column: 2 !important; grid-row: 1 / 3 !important; align-self: center !important; min-height: 440px !important; display: flex !important; align-items: center !important; justify-content: center !important; }
          .pc-landing-h1 { font-size: clamp(60px, 7vw, 86px) !important; }
          .pc-landing-steps { grid-template-columns: repeat(3, 1fr) !important; }
        }
      `}</style>
    </div>
  );
}

// ─── Flow step ────────────────────────────────────────────────────────────────

const flowToneColors: Record<'accent' | 'lime' | 'bone', string> = {
  accent: 'var(--pc-accent)',
  lime: '#aed24a',
  bone: 'var(--pc-bone)',
};

function FlowStep({
  n,
  tone,
  title,
}: {
  n: string;
  tone: 'accent' | 'lime' | 'bone';
  title: string;
}) {
  return (
    <div style={flowStepStyle}>
      <span
        style={{
          // Küçük pixel adım numarası ("01"/"02"/"03") — retro detay, başlık değil.
          fontFamily: "'Silkscreen', monospace",
          fontSize: 13,
          letterSpacing: '0.04em',
          color: flowToneColors[tone],
          flex: 'none',
          width: 24,
        }}
      >
        {n}
      </span>
      <span
        style={{
          fontFamily: "'Inter Tight', system-ui, sans-serif",
          fontSize: 14,
          color: 'var(--pc-text)',
          fontWeight: 600,
          lineHeight: 1.3,
        }}
      >
        {title}
      </span>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const heroStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 18,
  padding: '4px 0 8px',
};

const copyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  minWidth: 0,
  order: 1,
};

const h1Style: CSSProperties = {
  // Showcase pixel başlık — Landing'in marka odağı ("PROMPT CLASH").
  // Kullanıcı net istek: bu yer Silkscreen kalır, gövde metni değil.
  fontFamily: "'Silkscreen', monospace",
  fontSize: 'clamp(38px, 10vw, 76px)',
  lineHeight: 0.96,
  letterSpacing: '0.02em',
  color: 'var(--pc-bone)',
  fontWeight: 400,
  margin: 0,
};

const sloganStyle: CSSProperties = {
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 'clamp(18px, 4.6vw, 24px)',
  fontWeight: 700,
  color: 'var(--pc-bone)',
  lineHeight: 1.25,
  letterSpacing: '-0.005em',
  margin: '-2px 0 0',
  maxWidth: 520,
};

// Primary CTA
const ctaPrimaryStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '16px 18px',
  borderRadius: 10,
  background: 'var(--pc-accent)',
  color: '#fff',
  border: 'none',
  textDecoration: 'none',
  cursor: 'pointer',
  width: '100%',
  minHeight: 60,
  boxShadow: '0 10px 28px rgba(124,77,255,0.32), inset 0 -2px 0 rgba(0,0,0,0.18)',
  marginTop: 4,
};

const ctaPrimaryTitleStyle: CSSProperties = {
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 16,
  fontWeight: 800,
  lineHeight: 1.1,
  display: 'block',
  textAlign: 'left',
};

const ctaPrimarySubStyle: CSSProperties = {
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 10.5,
  fontWeight: 500,
  letterSpacing: '0.10em',
  textTransform: 'uppercase',
  opacity: 0.82,
  lineHeight: 1.2,
  display: 'block',
  marginTop: 3,
  textAlign: 'left',
};

const ctaPrimaryArrowStyle: CSSProperties = {
  marginLeft: 'auto',
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 22,
  lineHeight: 1,
};

// Code form
const codeFormStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  marginTop: 6,
  maxWidth: 480,
};

const codeLabelStyle: CSSProperties = {
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

const codeLabelLineStyle: CSSProperties = {
  width: 16,
  height: 1,
  background: 'var(--pc-line2)',
  flex: 'none',
};

const codeFieldStyle: CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'stretch',
  background: 'var(--pc-ink2)',
  border: '1.5px solid var(--pc-line)',
  borderRadius: 10,
  overflow: 'hidden',
};

const codeInputStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  height: 52,
  background: 'transparent',
  border: 'none',
  padding: '0 16px',
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 15,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: 'var(--pc-bone)',
  outline: 'none',
};

const codeBtnStyle: CSSProperties = {
  flex: 'none',
  width: 54,
  height: 52,
  background: 'transparent',
  border: 'none',
  borderLeft: '1px solid var(--pc-line)',
  color: 'var(--pc-text3)',
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 20,
  lineHeight: 1,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'color .14s, background .14s, transform 80ms ease-out',
};

const codeErrorStyle: CSSProperties = {
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 12.5,
  color: '#ffb0b0',
  lineHeight: 1.4,
  paddingLeft: 2,
  marginTop: 2,
};

// Mascot wrap (mobile: appears between copy and flow per visual order via flex order)
const mascotWrapStyle: CSSProperties = {
  position: 'relative',
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '8px 8px 0',
  order: 0, // pushes mascot above copy on mobile (DOM is copy → mascot → flow)
};

// Flow section
const flowSectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  marginTop: 18,
  order: 2,
};

const flowLabStyle: CSSProperties = {
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  color: 'var(--pc-text3)',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

const flowLabLineStyle: CSSProperties = {
  width: 14,
  height: 1,
  background: 'var(--pc-line2)',
  flex: 'none',
};

const stepsGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr 1fr',
  gap: 8,
};

const flowStepStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: '10px 10px 11px',
  background: 'var(--pc-ink2)',
  border: '1px solid var(--pc-line)',
  borderRadius: 10,
  minHeight: 74,
};

const footStyle: CSSProperties = {
  marginTop: 32,
  padding: '14px 0',
  borderTop: '1px solid var(--pc-ink3)',
  textAlign: 'center',
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 10,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: 'var(--pc-text4)',
};
