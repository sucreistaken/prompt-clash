'use client';

// TournamentBracket — Task 10.
// Renders the tournament roster as standings (active highlighted, eliminated
// dimmed), surfaces finalists pair and the champion (gold crown SVG).
// Uses var(--pc-*) CSS vars + Inter Tight to match ControlPanelClient's idiom.
// NO emoji — SVG glyphs only.

import type { CSSProperties } from 'react';
import { useI18n } from '@/components/client/i18nContext';
import type { TournamentSnapshot } from '@/types/game';

// Re-export the canonical type so existing importers (ControlPanelClient) can
// continue importing from this file without changes (Fix C).
export type { TournamentSnapshot };

export function TournamentBracket({ tournament }: { tournament: TournamentSnapshot }) {
  const { t } = useI18n();

  const sortedRoster = [...(tournament.roster ?? [])].sort((a, b) => {
    // Active first; within each group sort by lastScore desc
    if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
    const sa = a.lastScore ?? -Infinity;
    const sb = b.lastScore ?? -Infinity;
    return sb - sa;
  });

  const showGroupLabel =
    tournament.mode === 'B' &&
    tournament.groupPhase &&
    tournament.currentGroupIndex >= 0 &&
    tournament.groupCount > 0;

  return (
    <div style={bracketWrapStyle}>
      {/* Mode B group label — shown in bracket header during the group phase */}
      {showGroupLabel && (
        <div style={groupLabelRowStyle}>
          <span style={groupLabelTextStyle}>
            {t('tBracketGroup')} {tournament.currentGroupIndex + 1}/{tournament.groupCount}
          </span>
        </div>
      )}

      {/* Champion row — gold, appears when tournament is over */}
      {tournament.champion ? (
        <div style={championRowStyle}>
          <CrownSvg />
          <span style={championNameStyle}>{tournament.champion.nickname}</span>
          <span style={championLabelStyle}>{t('tBracketChampion')}</span>
        </div>
      ) : null}

      {/* Finalists pair — shown during final round, before champion declared */}
      {tournament.finalists && tournament.finalists.length > 0 && !tournament.champion ? (
        <div style={finalistsWrapStyle}>
          <div style={finalistLabelStyle}>{t('tBracketFinalists')}</div>
          <div style={finalistsRowStyle}>
            {tournament.finalists.map((f) => (
              <div key={f.entrantId} style={finalistPillStyle}>
                {f.nickname}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Roster standings */}
      <div style={rosterWrapStyle}>
        <div style={rosterLabelStyle}>{t('tCtrlRosterLabel')}</div>
        <div style={rosterListStyle}>
          {sortedRoster.map((entry, idx) => (
            <div
              key={entry.entrantId}
              style={entry.eliminated ? rosterRowEliminatedStyle : rosterRowActiveStyle}
            >
              <span style={rosterRankStyle}>{idx + 1}</span>
              <span style={entry.eliminated ? rosterNickEliminatedStyle : rosterNickStyle}>
                {entry.nickname}
              </span>
              {entry.eliminated ? (
                <span style={elimBadgeStyle}>{t('tBracketEliminated')}</span>
              ) : (
                <span style={activeDotStyle} aria-hidden="true" />
              )}
              {entry.lastScore != null ? (
                <span style={scoreStyle}>{entry.lastScore}</span>
              ) : null}
            </div>
          ))}
          {sortedRoster.length === 0 ? (
            <p style={emptyRosterStyle}>{t('tCtrlLobbyPlayers').replace('{n}', '0')}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ─── Pixel-art crown SVG (no emoji) ─────────────────────────────────────────

function CrownSvg() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ flex: 'none' }}
    >
      {/* Base bar */}
      <rect x="3" y="17" width="18" height="3" rx="1" fill="#c89a20" />
      {/* Crown points: left tooth, left peak, center peak, right peak, right tooth */}
      <path
        d="M3 17 L3 9 L7 13 L12 5 L17 13 L21 9 L21 17 Z"
        fill="#f0c040"
        stroke="#c89a20"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
      {/* Center gem */}
      <rect x="10.5" y="10.5" width="3" height="3" rx="0.5" fill="#fff8d0" opacity="0.75" />
    </svg>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const bracketWrapStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  marginTop: 8,
};

const championRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '12px 14px',
  borderRadius: 12,
  background: 'rgba(240,192,64,0.12)',
  border: '1.5px solid rgba(240,192,64,0.45)',
};

const championNameStyle: CSSProperties = {
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 16,
  fontWeight: 800,
  color: '#f0c040',
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const championLabelStyle: CSSProperties = {
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.20em',
  textTransform: 'uppercase',
  color: '#c89a20',
};

const finalistsWrapStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const finalistLabelStyle: CSSProperties = {
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: '0.20em',
  textTransform: 'uppercase',
  color: 'var(--pc-text3)',
};

const finalistsRowStyle: CSSProperties = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
};

const finalistPillStyle: CSSProperties = {
  padding: '6px 14px',
  borderRadius: 8,
  background: 'rgba(174,210,74,0.12)',
  border: '1.5px solid rgba(174,210,74,0.40)',
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 13,
  fontWeight: 700,
  color: '#aed24a',
};

const rosterWrapStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const rosterLabelStyle: CSSProperties = {
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: '0.20em',
  textTransform: 'uppercase',
  color: 'var(--pc-text3)',
};

const rosterListStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const rosterRowBaseStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 10px',
  borderRadius: 8,
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 13,
};

const rosterRowActiveStyle: CSSProperties = {
  ...rosterRowBaseStyle,
  background: 'rgba(124,77,255,0.08)',
  border: '1px solid rgba(124,77,255,0.20)',
};

const rosterRowEliminatedStyle: CSSProperties = {
  ...rosterRowBaseStyle,
  background: 'transparent',
  border: '1px solid var(--pc-ink3)',
  opacity: 0.5,
};

const rosterRankStyle: CSSProperties = {
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--pc-text3)',
  minWidth: 18,
  textAlign: 'right',
};

const rosterNickStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: 'var(--pc-bone)',
  fontWeight: 600,
};

const rosterNickEliminatedStyle: CSSProperties = {
  ...rosterNickStyle,
  color: 'var(--pc-text3)',
  fontWeight: 500,
  textDecoration: 'line-through',
  textDecorationColor: 'var(--pc-text4)',
};

const activeDotStyle: CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: 999,
  background: '#aed24a',
  display: 'inline-block',
  flex: 'none',
};

const elimBadgeStyle: CSSProperties = {
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 9.5,
  fontWeight: 700,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--pc-text4)',
};

const scoreStyle: CSSProperties = {
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--pc-text2)',
  minWidth: 28,
  textAlign: 'right',
};

const emptyRosterStyle: CSSProperties = {
  margin: 0,
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 12.5,
  color: 'var(--pc-text4)',
};

const groupLabelRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '6px 10px',
  borderRadius: 8,
  background: 'rgba(174,210,74,0.10)',
  border: '1px solid rgba(174,210,74,0.30)',
};

const groupLabelTextStyle: CSSProperties = {
  fontFamily: "'Inter Tight', system-ui, sans-serif",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: '#aed24a',
};
