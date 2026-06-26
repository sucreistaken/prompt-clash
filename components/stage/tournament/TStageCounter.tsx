'use client';

import { useGameState } from '@/components/client/useGameState';
import { useI18n } from '@/components/client/i18nContext';
import {
  StageFrame,
  StageBackdrop,
  TopBar,
  PixelText,
  Lbl,
  C,
  FONT,
} from '../atmosphere';
import type { TournamentEntrantSnapshot } from '@/types/game';

/**
 * D-STAGE-1 — Tournament counter board.
 * Giant "KALAN" (remaining) count + shrinking wall of player tiles (dimmed
 * when eliminated) + bottom phase rail showing the reduction progression.
 * Fixed 1920×1080 absolute layout, matches stage atmosphere idiom.
 */

interface RailItem {
  label: string;
  isCurrent: boolean;
  isPast: boolean;
}

function buildRailItems(
  totalCount: number,
  roundIndex: number,
  roundCount: number,
): RailItem[] {
  const items: RailItem[] = [];

  // Start: total participants
  items.push({
    label: String(totalCount),
    isCurrent: roundIndex === 0,
    isPast: roundIndex > 0,
  });

  // Intermediate checkpoints (geometric halving per round)
  for (let i = 1; i < roundCount; i++) {
    const frac = i / roundCount;
    const approx = Math.max(4, Math.round(totalCount * Math.pow(2 / totalCount, frac)));
    items.push({
      label: String(approx),
      isCurrent: i === roundIndex,
      isPast: i < roundIndex,
    });
  }

  // End: 2 finalists
  items.push({
    label: '2',
    isCurrent: roundIndex >= roundCount,
    isPast: false,
  });

  return items;
}

function EntrantTile({ entrant }: { entrant: TournamentEntrantSnapshot }) {
  const out = entrant.eliminated;
  return (
    <div
      style={{
        padding: '10px 18px',
        background: out ? C.ink : C.ink2,
        border: `1px solid ${out ? C.line : C.accent}`,
        borderLeft: `3px solid ${out ? C.line : C.accent}`,
        opacity: out ? 0.32 : 1,
        display: 'flex',
        alignItems: 'center',
        minWidth: 120,
      }}
    >
      <span
        style={{
          fontFamily: FONT.mono,
          fontSize: 16,
          fontWeight: 600,
          color: out ? C.text3 : C.text,
          textDecoration: out ? 'line-through' : 'none',
          letterSpacing: '0.02em',
          whiteSpace: 'nowrap',
        }}
      >
        {entrant.nickname}
      </span>
    </div>
  );
}

export function TStageCounter() {
  const { tournament } = useGameState();
  const { t } = useI18n();
  if (!tournament) return null;

  const { activeCount, totalCount, roster, topic, roundIndex, roundCount, mode, groupPhase, currentGroupIndex, groupCount } = tournament;
  const railItems = buildRailItems(totalCount, roundIndex, roundCount);
  const showGroupLabel = mode === 'B' && groupPhase && currentGroupIndex >= 0 && groupCount > 0;

  return (
    <StageFrame>
      <StageBackdrop />
      <TopBar liveLabel={t('live')} matchId="" />

      {/* Topic strip — shown when a round topic is active */}
      {topic?.promptTr && (
        <div
          style={{
            position: 'absolute',
            top: 100,
            left: 60,
            right: 60,
            height: 52,
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            padding: '0 22px',
            background: C.ink3,
            borderLeft: `4px solid ${C.accent}`,
          }}
        >
          <Lbl size={11} color="accent">
            {t('tPromptTopicLabel')}
          </Lbl>
          <span
            style={{
              display: 'inline-block',
              width: 1,
              height: 28,
              background: C.line2,
            }}
          />
          <span
            style={{
              fontFamily: FONT.mono,
              fontSize: 22,
              color: C.text,
              fontWeight: 600,
              letterSpacing: '0.04em',
            }}
          >
            {topic.promptTr}
          </span>
        </div>
      )}

      {/* Left zone: giant remaining counter */}
      <div
        style={{
          position: 'absolute',
          top: 168,
          left: 60,
          width: 680,
          bottom: 100,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 10,
        }}
      >
        <Lbl size={14} color="text3">
          {t('tPromptRoundLabel').replace('{n}', String(roundIndex))}
        </Lbl>
        {/* Mode B group label — shown during the group phase, near KALAN counter */}
        {showGroupLabel && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 14px',
              background: 'rgba(174,210,74,0.12)',
              border: '1.5px solid rgba(174,210,74,0.40)',
              alignSelf: 'flex-start',
            }}
          >
            <span
              style={{
                fontFamily: FONT.mono,
                fontSize: 14,
                fontWeight: 700,
                color: '#aed24a',
                letterSpacing: '0.08em',
              }}
            >
              {t('tStageGroupLabel')} {currentGroupIndex + 1} / {groupCount}
            </span>
          </div>
        )}
        <PixelText size={280} color={C.accent}>
          {activeCount}
        </PixelText>
        <Lbl size={24}>
          {t('tStageRemaining')}
        </Lbl>
      </div>

      {/* Right zone: wall grid of player tiles */}
      <div
        style={{
          position: 'absolute',
          top: 168,
          left: 760,
          right: 60,
          bottom: 100,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          alignContent: 'flex-start',
          overflow: 'hidden',
        }}
      >
        {roster.map((entrant) => (
          <EntrantTile key={entrant.entrantId} entrant={entrant} />
        ))}
      </div>

      {/* Bottom: phase rail showing reduction progression */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 90,
          borderTop: `1px solid ${C.line}`,
          display: 'flex',
          alignItems: 'center',
          padding: '0 60px',
          gap: 0,
          background: C.ink2,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {railItems.flatMap((item, i) => {
            const node = (
              <span
                key={`cp-${i}`}
                style={{
                  fontFamily: FONT.pixel,
                  fontSize: 20,
                  color: item.isCurrent ? C.accent : item.isPast ? C.text4 : C.text3,
                  opacity: item.isPast ? 0.45 : 1,
                }}
              >
                {item.label}
              </span>
            );
            if (i < railItems.length - 1) {
              return [
                node,
                <span
                  key={`arr-${i}`}
                  style={{
                    fontFamily: FONT.mono,
                    fontSize: 14,
                    color: C.text4,
                    margin: '0 8px',
                  }}
                >
                  {'→'}
                </span>,
              ];
            }
            return [node];
          })}
        </div>
        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <Lbl size={11} color="text3">
            {t('tJoinActive')}
          </Lbl>
          <PixelText size={32} color={C.accent}>
            {activeCount}
          </PixelText>
          <span
            style={{ fontFamily: FONT.mono, fontSize: 13, color: C.text3 }}
          >
            / {totalCount}
          </span>
        </div>
      </div>
    </StageFrame>
  );
}
