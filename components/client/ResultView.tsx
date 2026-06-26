'use client';

import { useState, type CSSProperties } from 'react';
import { useGameState } from './useGameState';
import { useI18n } from './i18nContext';
import { C, FONT, StageFonts, StageKeyframes } from '@/components/stage/atmosphere';
import type { Slot } from '@/types/game';
import type { DictKey } from '@/i18n/dict';

/**
 * RESULT — audience-first 3-kolon arena (v2 mockup): kazanan büyük | hedef ortada
 * | kaybeden soluk. Altta gerçek prompt + iki oyuncunun prompt'u side-by-side.
 * 3 saniyede maça hakim ol: hedef + kazanan + kaybeden tek bakışta.
 */
export function ResultView() {
  const { state, mySlot } = useGameState();
  const { t, lang } = useI18n();
  const [showDetails, setShowDetails] = useState(false);

  if (!state) return null;

  const truePromptText =
    (lang === 'tr' ? state.targetPromptTr : state.targetPrompt) ||
    state.targetPrompt ||
    state.targetPromptTr;

  const isTie = state.winner === 'TIE';
  const winnerSlot: Slot | null = state.winner === 'A' ? 'A' : state.winner === 'B' ? 'B' : null;
  const loserSlot: Slot | null = winnerSlot ? (winnerSlot === 'A' ? 'B' : 'A') : null;
  const winner = winnerSlot ? state.players[winnerSlot] : null;
  const loser = loserSlot ? state.players[loserSlot] : null;
  const aiMode = state.winnerMode === 'AI_SCORE';

  const winnerColor = winnerSlot ? C.player(winnerSlot) : C.accent;
  const winnerMetric = aiMode ? winner?.aiScore ?? null : state.votes ? state.votes[winnerSlot ?? 'A'] : null;
  const loserMetric = aiMode ? loser?.aiScore ?? null : state.votes && loserSlot ? state.votes[loserSlot] : null;

  return (
    <>
      <StageFonts />
      <StageKeyframes />
      <style>{`
        @keyframes acLiveDot { 0%, 100% { opacity: 1 } 50% { opacity: .4 } }
        @media (prefers-reduced-motion: reduce) { .ac-live-dot { animation: none !important; } }
      `}</style>
      <main
        style={{
          minHeight: '100dvh',
          background: C.ink,
          color: C.text,
          fontFamily: FONT.body,
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
        className="flex flex-col"
      >
        {/* DESKTOP — 3-kolon arena */}
        <div
          className="hidden lg:flex flex-col items-center"
          style={{
            width: '100%',
            maxWidth: 1180,
            margin: '0 auto',
            padding: '28px 56px 32px',
            minHeight: '100dvh',
          }}
        >
          <TopBar t={t} />
          <ResultHero
            t={t}
            isTie={isTie}
            winnerNick={winner?.nickname ?? ''}
            winnerColor={winnerColor}
            aiMode={aiMode}
          />
          {isTie ? (
            <TieDesktop t={t} state={state} aiMode={aiMode} />
          ) : (
            <WinnerArenaDesktop
              t={t}
              winnerSlot={winnerSlot}
              loserSlot={loserSlot}
              winner={winner}
              loser={loser}
              referenceUrl={state.referenceImageUrl}
              winnerMetric={winnerMetric}
              loserMetric={loserMetric}
              aiMode={aiMode}
              truePrompt={truePromptText ?? ''}
            />
          )}
          {aiMode && state.aiReasoning && <AiReasoning t={t} text={state.aiReasoning} />}
          <Cta t={t} mySlot={mySlot} winnerColor={winnerColor} />
        </div>

        {/* MOBILE — kazanan büyük + hedef sağ üst + kaybeden mini */}
        <div
          className="flex lg:hidden flex-col items-center"
          style={{
            width: '100%',
            padding: '14px 14px 18px',
            minHeight: '100dvh',
          }}
        >
          <div style={{ width: '100%', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
              <TopBar t={t} compact />
            </div>
            <HedefCornerMobile src={state.referenceImageUrl} alt={t('referenceImage')} label={t('audienceHedefShort')} />
          </div>
          {isTie ? (
            <>
              <ResultHero t={t} isTie winnerNick="" winnerColor={winnerColor} aiMode={aiMode} compact />
              <TieMobile t={t} state={state} aiMode={aiMode} />
            </>
          ) : (
            winner && winnerSlot && (
              <WinnerHeroMobile
                t={t}
                slot={winnerSlot}
                nick={winner.nickname}
                imageUrl={winner.imageUrl ?? null}
                prompt={winner.prompt ?? ''}
                metric={winnerMetric}
                aiMode={aiMode}
              />
            )
          )}
          {aiMode && state.aiReasoning && <AiReasoning t={t} text={state.aiReasoning} compact />}
          {!isTie && (truePromptText || (loser && loserSlot)) && (
            <div style={{ width: '100%', marginTop: 10 }}>
              <button
                type="button"
                onClick={() => setShowDetails((v) => !v)}
                aria-expanded={showDetails}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '8px 10px',
                  background: 'transparent',
                  border: `1px solid ${C.line}`,
                  color: C.text3,
                  fontFamily: FONT.mono,
                  fontSize: 9.5,
                  letterSpacing: '0.22em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                {t('resultDetailsToggle')}
                <span style={{ fontSize: 11, lineHeight: 1 }}>{showDetails ? '▴' : '▾'}</span>
              </button>
              {showDetails && (
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
                  {truePromptText && <TrueBlock t={t} text={truePromptText} compact />}
                  {loser && loserSlot && (
                    <LoserRowMobile
                      slot={loserSlot}
                      nick={loser.nickname}
                      imageUrl={loser.imageUrl ?? null}
                      prompt={loser.prompt ?? ''}
                      metric={loserMetric}
                    />
                  )}
                </div>
              )}
            </div>
          )}
          <Cta t={t} mySlot={mySlot} winnerColor={winnerColor} />
        </div>
      </main>
    </>
  );
}

// ─── reusable parts ────────────────────────────────────────────────────

function TopBar({ t, compact = false }: { t: (k: DictKey) => string; compact?: boolean }) {
  return (
    <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span
        style={{
          fontFamily: FONT.pixel,
          fontSize: compact ? 11 : 13,
          color: C.bone,
          letterSpacing: '0.08em',
        }}
      >
        {t('brandWordmark').toUpperCase()}
      </span>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          fontFamily: FONT.mono,
          fontSize: compact ? 9 : 10,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: C.text2,
        }}
      >
        <span
          className="ac-live-dot"
          style={{
            width: compact ? 5 : 6,
            height: compact ? 5 : 6,
            borderRadius: '50%',
            background: C.live,
            animation: 'acLiveDot 1.6s ease-in-out infinite',
            display: 'inline-block',
          }}
        />
        {t('live')}
      </span>
    </div>
  );
}

function ResultHero({
  t,
  isTie,
  winnerNick,
  winnerColor,
  aiMode,
  compact = false,
}: {
  t: (k: DictKey) => string;
  isTie: boolean;
  winnerNick: string;
  winnerColor: string;
  aiMode: boolean;
  compact?: boolean;
}) {
  return (
    <div
      style={{
        marginTop: compact ? 12 : 16,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: compact ? 4 : 6,
        textAlign: 'center',
      }}
    >
      <span
        style={{
          fontFamily: FONT.pixel,
          fontSize: compact ? 9 : 10,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: C.accent,
        }}
      >
        {aiMode ? t('audienceWinnerHeroLabel') : t('winner')}
      </span>
      {isTie ? (
        <div
          style={{
            fontFamily: FONT.pixel,
            fontSize: compact ? 20 : 24,
            color: C.bone,
            letterSpacing: '0.04em',
            lineHeight: 1,
          }}
        >
          {t('tie')}
        </div>
      ) : (
        <div
          style={{
            fontFamily: FONT.pixel,
            fontSize: compact ? 20 : 24,
            letterSpacing: '0.04em',
            lineHeight: 1,
            color: winnerColor,
            maxWidth: '90vw',
            wordBreak: 'break-word',
          }}
        >
          {winnerNick.toUpperCase()}
        </div>
      )}
    </div>
  );
}

interface ResultPlayer {
  nickname: string;
  imageUrl: string | null;
  prompt: string | null;
  aiScore: number | null;
}

function WinnerArenaDesktop({
  t,
  winnerSlot,
  loserSlot,
  winner,
  loser,
  referenceUrl,
  winnerMetric,
  loserMetric,
  aiMode,
  truePrompt,
}: {
  t: (k: DictKey) => string;
  winnerSlot: Slot | null;
  loserSlot: Slot | null;
  winner: ResultPlayer | null;
  loser: ResultPlayer | null;
  referenceUrl: string | null;
  winnerMetric: number | null;
  loserMetric: number | null;
  aiMode: boolean;
  truePrompt?: string;
}) {
  return (
    <div
      style={{
        marginTop: 22,
        width: '100%',
        maxWidth: 1060,
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        gap: 36,
        alignItems: 'start',
        justifyContent: 'center',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ width: '100%', maxWidth: 280 }}>
          {winner && winnerSlot && (
            <ArenaCardDesktop
              slot={winnerSlot}
              nick={winner.nickname}
              imageUrl={winner.imageUrl}
              metric={winnerMetric}
              isWinner
              aiMode={aiMode}
              t={t}
              prompt={winner.prompt ?? ''}
            />
          )}
        </div>
      </div>
      <div style={{ paddingTop: 18 }}>
        <HedefBlockDesktop src={referenceUrl} alt={t('referenceImage')} label={t('audienceHedefShort')} truePrompt={truePrompt} truePromptLabel={t('truePromptLabel')} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
        <div style={{ width: '100%', maxWidth: 280 }}>
          {loser && loserSlot && (
            <ArenaCardDesktop
              slot={loserSlot}
              nick={loser.nickname}
              imageUrl={loser.imageUrl}
              metric={loserMetric}
              isWinner={false}
              aiMode={aiMode}
              t={t}
              prompt={loser.prompt ?? ''}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ArenaCardDesktop({
  slot,
  nick,
  imageUrl,
  metric,
  isWinner,
  aiMode,
  t,
  prompt,
}: {
  slot: Slot;
  nick: string;
  imageUrl: string | null;
  metric: number | null;
  isWinner: boolean;
  aiMode: boolean;
  t: (k: DictKey) => string;
  prompt?: string;
}) {
  const slotColor = C.player(slot);
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        minWidth: 0,
        opacity: isWinner ? 1 : 0.55,
        filter: isWinner ? 'none' : 'grayscale(0.4)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span
          style={{
            fontFamily: FONT.pixel,
            fontSize: 13,
            letterSpacing: '0.06em',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            minWidth: 0,
            flex: 1,
          }}
        >
          <span style={{ color: slotColor, fontSize: 14 }}>{slot}</span>
          <span style={{ color: C.text4, fontSize: 11 }}>·</span>
          <span
            style={{
              color: C.bone,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
            }}
          >
            {nick.toUpperCase()}
          </span>
        </span>
        <span
          style={{
            fontFamily: FONT.mono,
            fontSize: 9,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            padding: '3px 7px',
            border: `1px solid ${isWinner ? slotColor : C.line}`,
            color: isWinner ? slotColor : C.text3,
            flexShrink: 0,
          }}
        >
          {isWinner ? t('audienceWinnerBadge') : t('audienceLoserBadge')}
        </span>
      </div>
      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '1 / 1',
          background: '#15141b',
          overflow: 'hidden',
          border: `1.5px solid ${isWinner ? slotColor : C.line}`,
        }}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={nick}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : null}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 10px',
          background: isWinner ? `color-mix(in srgb, ${slotColor} 6%, transparent)` : 'rgba(255,255,255,0.02)',
          border: `1px solid ${isWinner ? `color-mix(in srgb, ${slotColor} 40%, transparent)` : C.line}`,
        }}
      >
        <span
          style={{
            fontFamily: FONT.mono,
            fontSize: 9.5,
            letterSpacing: '0.20em',
            textTransform: 'uppercase',
            color: C.text3,
          }}
        >
          {aiMode ? t('aiPoints') : t('votesShort')}
        </span>
        <span
          style={{
            fontFamily: FONT.pixel,
            fontSize: 18,
            fontVariantNumeric: 'tabular-nums',
            color: isWinner ? slotColor : C.text2,
          }}
        >
          {metric ?? '—'}
        </span>
      </div>
      {prompt !== undefined && (
        <div
          style={{
            fontFamily: FONT.mono,
            fontSize: 11,
            lineHeight: 1.5,
            color: isWinner ? C.text2 : C.text3,
            borderLeft: `2px solid ${isWinner ? slotColor : C.line}`,
            paddingLeft: 9,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            wordBreak: 'break-word',
          }}
        >
          {prompt || '—'}
        </div>
      )}
    </div>
  );
}

function HedefBlockDesktop({
  src,
  alt,
  label,
  truePrompt,
  truePromptLabel,
}: {
  src: string | null;
  alt: string;
  label: string;
  truePrompt?: string;
  truePromptLabel?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
      <span
        style={{
          fontFamily: FONT.pixel,
          fontSize: 11,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: C.accent,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <span style={{ display: 'inline-block', width: 18, height: 1, background: C.accent, opacity: 0.5 }} />
        {label}
        <span style={{ display: 'inline-block', width: 18, height: 1, background: C.accent, opacity: 0.5 }} />
      </span>
      <div
        style={{
          position: 'relative',
          width: 240,
          height: 240,
          background: '#0f0e14',
          border: `1.5px solid color-mix(in srgb, ${C.accent} 55%, transparent)`,
          overflow: 'hidden',
        }}
      >
        {src && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        )}
        {(['tl', 'tr', 'bl', 'br'] as const).map((pos) => {
          const s: CSSProperties = { position: 'absolute', width: 14, height: 14 };
          if (pos === 'tl') Object.assign(s, { top: 5, left: 5, borderTop: `2px solid ${C.accent}`, borderLeft: `2px solid ${C.accent}` });
          if (pos === 'tr') Object.assign(s, { top: 5, right: 5, borderTop: `2px solid ${C.accent}`, borderRight: `2px solid ${C.accent}` });
          if (pos === 'bl') Object.assign(s, { bottom: 5, left: 5, borderBottom: `2px solid ${C.accent}`, borderLeft: `2px solid ${C.accent}` });
          if (pos === 'br') Object.assign(s, { bottom: 5, right: 5, borderBottom: `2px solid ${C.accent}`, borderRight: `2px solid ${C.accent}` });
          return <div key={pos} style={s} />;
        })}
      </div>
      {truePrompt ? (
        <div style={{ width: 240, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
          <span style={{ fontFamily: FONT.mono, fontSize: 8.5, letterSpacing: '0.20em', textTransform: 'uppercase', color: C.accent }}>{truePromptLabel}</span>
          <span
            style={{
              fontFamily: FONT.mono,
              fontSize: 11,
              lineHeight: 1.5,
              color: C.text2,
              textAlign: 'center',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {truePrompt}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function HedefCornerMobile({ src, alt, label }: { src: string | null; alt: string; label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
      <span
        style={{
          fontFamily: FONT.pixel,
          fontSize: 8,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: C.accent,
        }}
      >
        {label}
      </span>
      <div
        style={{
          position: 'relative',
          width: 72,
          height: 72,
          background: '#0f0e14',
          border: `1.5px solid color-mix(in srgb, ${C.accent} 55%, transparent)`,
          overflow: 'hidden',
        }}
      >
        {src && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        )}
        {(['tl', 'tr', 'bl', 'br'] as const).map((pos) => {
          const s: CSSProperties = { position: 'absolute', width: 8, height: 8 };
          if (pos === 'tl') Object.assign(s, { top: 3, left: 3, borderTop: `1.5px solid ${C.accent}`, borderLeft: `1.5px solid ${C.accent}` });
          if (pos === 'tr') Object.assign(s, { top: 3, right: 3, borderTop: `1.5px solid ${C.accent}`, borderRight: `1.5px solid ${C.accent}` });
          if (pos === 'bl') Object.assign(s, { bottom: 3, left: 3, borderBottom: `1.5px solid ${C.accent}`, borderLeft: `1.5px solid ${C.accent}` });
          if (pos === 'br') Object.assign(s, { bottom: 3, right: 3, borderBottom: `1.5px solid ${C.accent}`, borderRight: `1.5px solid ${C.accent}` });
          return <div key={pos} style={s} />;
        })}
      </div>
    </div>
  );
}

function WinnerHeroMobile({
  t,
  slot,
  nick,
  imageUrl,
  prompt,
  metric,
  aiMode,
}: {
  t: (k: DictKey) => string;
  slot: Slot;
  nick: string;
  imageUrl: string | null;
  prompt: string;
  metric: number | null;
  aiMode: boolean;
}) {
  const slotColor = C.player(slot);
  return (
    <div style={{ marginTop: 12, width: '100%', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Hero görsel + alttan overlay (isim + skor) — ayrı kutu yok */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          flex: 1,
          minHeight: 168,
          overflow: 'hidden',
          background: '#0e0d14',
          borderLeft: `3px solid ${slotColor}`,
        }}
      >
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={nick}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        )}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            padding: '40px 14px 13px',
            background: 'linear-gradient(to top, rgba(8,7,12,0.94) 0%, rgba(8,7,12,0.55) 52%, transparent 100%)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
            <span
              style={{
                fontFamily: FONT.pixel,
                fontSize: 9,
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: slotColor,
              }}
            >
              {aiMode ? t('audienceWinnerHeroLabel') : t('winner')}
            </span>
            <span
              style={{
                fontFamily: FONT.pixel,
                fontSize: 24,
                letterSpacing: '0.04em',
                lineHeight: 1,
                color: C.bone,
                wordBreak: 'break-word',
              }}
            >
              {nick.toUpperCase()}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
            <span
              style={{
                fontFamily: FONT.pixel,
                fontSize: 30,
                lineHeight: 1,
                color: slotColor,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {metric ?? '—'}
            </span>
            <span
              style={{
                fontFamily: FONT.mono,
                fontSize: 8.5,
                letterSpacing: '0.20em',
                textTransform: 'uppercase',
                color: C.text3,
                marginTop: 3,
              }}
            >
              {aiMode ? t('aiPoints') : t('votesShort')}
            </span>
          </div>
        </div>
      </div>
      {/* Prompt — tek temiz satır, kutu yok */}
      <div style={{ display: 'flex', gap: 9, alignItems: 'baseline' }}>
        <span
          style={{
            fontFamily: FONT.mono,
            fontSize: 8.5,
            letterSpacing: '0.20em',
            textTransform: 'uppercase',
            color: slotColor,
            flexShrink: 0,
          }}
        >
          {t('promptLabel')}
        </span>
        <span
          style={{
            fontFamily: FONT.mono,
            fontSize: 11,
            lineHeight: 1.5,
            color: C.text2,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            wordBreak: 'break-word',
          }}
        >
          {prompt || t('typing')}
        </span>
      </div>
    </div>
  );
}

function WinnerCardMobile({
  t,
  slot,
  nick,
  imageUrl,
  prompt,
  metric,
  aiMode,
}: {
  t: (k: DictKey) => string;
  slot: Slot;
  nick: string;
  imageUrl: string | null;
  prompt: string;
  metric: number | null;
  aiMode: boolean;
}) {
  const slotColor = C.player(slot);
  return (
    <div style={{ marginTop: 14, width: '100%', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span
          style={{
            fontFamily: FONT.pixel,
            fontSize: 12,
            letterSpacing: '0.06em',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            minWidth: 0,
            flex: 1,
          }}
        >
          <span style={{ color: slotColor, fontSize: 13 }}>{slot}</span>
          <span style={{ color: C.text4, fontSize: 10 }}>·</span>
          <span
            style={{
              color: C.bone,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
            }}
          >
            {nick.toUpperCase()}
          </span>
        </span>
        <span
          style={{
            fontFamily: FONT.mono,
            fontSize: 8.5,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            padding: '3px 7px',
            border: `1px solid ${slotColor}`,
            color: slotColor,
            flexShrink: 0,
          }}
        >
          {t('audienceWinnerBadge')}
        </span>
      </div>
      <div
        style={{
          position: 'relative',
          width: '100%',
          flex: 1,
          minHeight: 104,
          background: '#0e0d14',
          overflow: 'hidden',
          border: `1.5px solid ${slotColor}`,
        }}
      >
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={nick} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block' }} />
        )}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 11px',
          background: `color-mix(in srgb, ${slotColor} 6%, transparent)`,
          border: `1px solid color-mix(in srgb, ${slotColor} 40%, transparent)`,
        }}
      >
        <span
          style={{
            fontFamily: FONT.mono,
            fontSize: 9,
            letterSpacing: '0.20em',
            textTransform: 'uppercase',
            color: C.text3,
          }}
        >
          {aiMode ? t('aiPoints') : t('votesShort')}
        </span>
        <span
          style={{
            fontFamily: FONT.pixel,
            fontSize: 16,
            fontVariantNumeric: 'tabular-nums',
            color: slotColor,
          }}
        >
          {metric ?? '—'}
        </span>
      </div>
      <div
        style={{
          fontFamily: FONT.mono,
          fontSize: 10.5,
          lineHeight: 1.45,
          color: C.text,
          padding: '8px 10px',
          background: `color-mix(in srgb, ${slotColor} 5%, transparent)`,
          borderLeft: `2px solid ${slotColor}`,
          maxHeight: `calc(${1.45}em * 2 + 16px)`,
          overflow: 'hidden',
          WebkitMaskImage: 'linear-gradient(to bottom, #000 78%, transparent 100%)',
          maskImage: 'linear-gradient(to bottom, #000 78%, transparent 100%)',
          wordBreak: 'break-word',
        }}
      >
        {prompt || t('typing')}
      </div>
    </div>
  );
}

function LoserRowMobile({
  slot,
  nick,
  imageUrl,
  prompt,
  metric,
}: {
  slot: Slot;
  nick: string;
  imageUrl: string | null;
  prompt: string;
  metric: number | null;
}) {
  const slotColor = C.player(slot);
  return (
    <div
      style={{
        marginTop: 10,
        width: '100%',
        display: 'flex',
        gap: 10,
        padding: '9px 11px',
        background: 'rgba(255,255,255,0.02)',
        border: `1px solid ${C.line}`,
        borderRadius: 8,
        opacity: 0.55,
        filter: 'grayscale(0.4)',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          flexShrink: 0,
          background: '#0e0d14',
          overflow: 'hidden',
          border: `1px solid ${C.line}`,
        }}
      >
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={nick} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span
            style={{
              fontFamily: FONT.pixel,
              fontSize: 10.5,
              letterSpacing: '0.06em',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              minWidth: 0,
            }}
          >
            <span style={{ color: slotColor }}>{slot}</span>
            <span style={{ color: C.text4, fontSize: 9 }}>·</span>
            <span
              style={{
                color: C.text2,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0,
              }}
            >
              {nick.toUpperCase()}
            </span>
          </span>
          <span
            style={{
              fontFamily: FONT.pixel,
              fontSize: 12,
              color: C.text3,
              fontVariantNumeric: 'tabular-nums',
              flexShrink: 0,
            }}
          >
            {metric ?? '—'}
          </span>
        </div>
        <div
          style={{
            fontFamily: FONT.mono,
            fontSize: 9.5,
            color: C.text3,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {prompt || '—'}
        </div>
      </div>
    </div>
  );
}

function TrueBlock({ t, text, compact = false }: { t: (k: DictKey) => string; text: string; compact?: boolean }) {
  return (
    <div
      style={{
        marginTop: compact ? 10 : 18,
        width: '100%',
        maxWidth: compact ? undefined : 1060,
        background: `color-mix(in srgb, ${C.accent} 5%, transparent)`,
        border: `1px solid color-mix(in srgb, ${C.accent} 30%, transparent)`,
        borderLeft: `3px solid ${C.accent}`,
        borderRadius: 10,
        padding: compact ? '9px 11px' : '11px 16px',
        display: 'flex',
        flexDirection: compact ? 'column' : 'row',
        alignItems: compact ? 'flex-start' : 'baseline',
        gap: compact ? 4 : 14,
      }}
    >
      <span
        style={{
          fontFamily: FONT.pixel,
          fontSize: compact ? 8.5 : 10,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: C.accent,
          flexShrink: 0,
        }}
      >
        {t('truePromptLabel').toUpperCase()}
      </span>
      <span
        style={{
          fontFamily: FONT.mono,
          fontSize: compact ? 10.5 : 12.5,
          lineHeight: 1.5,
          color: C.text,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: compact ? 3 : 2,
          WebkitBoxOrient: 'vertical',
          flex: compact ? undefined : 1,
        }}
      >
        {text}
      </span>
    </div>
  );
}

function AiReasoning({ t, text, compact = false }: { t: (k: DictKey) => string; text: string; compact?: boolean }) {
  return (
    <div
      style={{
        marginTop: compact ? 10 : 14,
        width: '100%',
        maxWidth: compact ? undefined : 1060,
        background: C.ink2,
        border: `1px solid ${C.line}`,
        borderRadius: 10,
        padding: compact ? '10px 12px' : '12px 16px',
      }}
    >
      <span
        style={{
          fontFamily: FONT.mono,
          fontSize: compact ? 9 : 10,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: C.text3,
        }}
      >
        {t('aiEvaluation').toUpperCase()}
      </span>
      <p
        style={{
          fontFamily: FONT.body,
          fontSize: compact ? 12 : 13,
          lineHeight: 1.55,
          color: C.text2,
          marginTop: 6,
        }}
      >
        {text}
      </p>
    </div>
  );
}

function Cta({ t, mySlot, winnerColor }: { t: (k: DictKey) => string; mySlot: Slot | null; winnerColor: string }) {
  // Player + audience aynı countdown'u görür. Rematch lifecycle'ı arka planda
  // RESULT → LOBBY geçişini yapıyor; oyuncu sayfada kalıyor ve LOBBY açıldığında
  // ReadyCheckView devralıyor. "Tekrar Oyna" butonu (landing'e yönlendiren)
  // kaldırıldı — aynı odada akıl yürüten bir UX değildi.
  void mySlot;
  void winnerColor;
  return (
    <div
      style={{
        marginTop: 'auto',
        paddingTop: 14,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 9,
      }}
    >
      <span
        className="ac-live-dot"
        style={{ width: 5, height: 5, borderRadius: '50%', background: C.accent, display: 'inline-block' }}
      />
      <span
        style={{
          fontFamily: FONT.mono,
          fontSize: 10.5,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: C.text3,
        }}
      >
        {t('audienceNextMatchSoon')}
      </span>
    </div>
  );
}

// ─── TIE fallback ──────────────────────────────────────────────────────

function TieDesktop({ t, state, aiMode }: { t: (k: DictKey) => string; state: NonNullable<ReturnType<typeof useGameState>['state']>; aiMode: boolean }) {
  // TIE durumunda her iki oyuncu da eşit ağırlıkta — hiyerarşi yok, hedef ortada.
  return (
    <div
      style={{
        marginTop: 22,
        width: '100%',
        maxWidth: 1060,
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        gap: 36,
        alignItems: 'start',
        justifyContent: 'center',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ width: '100%', maxWidth: 280 }}>
          <ArenaCardDesktop
            slot="A"
            nick={state.players.A?.nickname ?? 'Player A'}
            imageUrl={state.players.A?.imageUrl ?? null}
            metric={aiMode ? state.players.A?.aiScore ?? null : state.votes?.A ?? null}
            isWinner
            aiMode={aiMode}
            t={t}
          />
        </div>
      </div>
      <div style={{ paddingTop: 18 }}>
        <HedefBlockDesktop src={state.referenceImageUrl} alt={t('referenceImage')} label={t('audienceHedefShort')} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
        <div style={{ width: '100%', maxWidth: 280 }}>
          <ArenaCardDesktop
            slot="B"
            nick={state.players.B?.nickname ?? 'Player B'}
            imageUrl={state.players.B?.imageUrl ?? null}
            metric={aiMode ? state.players.B?.aiScore ?? null : state.votes?.B ?? null}
            isWinner
            aiMode={aiMode}
            t={t}
          />
        </div>
      </div>
    </div>
  );
}

function TieMobile({ t, state, aiMode }: { t: (k: DictKey) => string; state: NonNullable<ReturnType<typeof useGameState>['state']>; aiMode: boolean }) {
  return (
    <div style={{ marginTop: 14, width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <WinnerCardMobile
        t={t}
        slot="A"
        nick={state.players.A?.nickname ?? 'Player A'}
        imageUrl={state.players.A?.imageUrl ?? null}
        prompt={state.players.A?.prompt ?? ''}
        metric={aiMode ? state.players.A?.aiScore ?? null : state.votes?.A ?? null}
        aiMode={aiMode}
      />
      <WinnerCardMobile
        t={t}
        slot="B"
        nick={state.players.B?.nickname ?? 'Player B'}
        imageUrl={state.players.B?.imageUrl ?? null}
        prompt={state.players.B?.prompt ?? ''}
        metric={aiMode ? state.players.B?.aiScore ?? null : state.votes?.B ?? null}
        aiMode={aiMode}
      />
    </div>
  );
}
