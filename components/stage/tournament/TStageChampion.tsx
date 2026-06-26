'use client';

import { motion } from 'framer-motion';
import { useGameState } from '@/components/client/useGameState';
import { useI18n } from '@/components/client/i18nContext';
import {
  StageFrame,
  StageBackdrop,
  PixelText,
  LetterCascade,
  Lbl,
  C,
  FONT,
} from '../atmosphere';

/**
 * D-STAGE-3 — Tournament champion celebration board.
 * Pixel-art crown SVG + champion nickname.
 * Fixed 1920×1080 absolute layout, matches stage atmosphere idiom.
 */

const EASE_BACK: [number, number, number, number] = [0.34, 1.56, 0.64, 1];

/** Pixel-art crown — 24×16 grid, brand gold #ffd24a. NOT an emoji. */
function PixelCrown({ size = 240 }: { size?: number }) {
  // viewBox 0 0 24 16 → aspect ratio 3:2
  const height = Math.round((size * 16) / 24);
  return (
    <svg
      viewBox="0 0 24 16"
      width={size}
      height={height}
      shapeRendering="crispEdges"
      aria-label="crown"
    >
      <g fill="#ffd24a">
        <rect x="2" y="10" width="20" height="4" />
        <rect x="2" y="4" width="4" height="8" />
        <rect x="10" y="2" width="4" height="10" />
        <rect x="18" y="4" width="4" height="8" />
        <rect x="9" y="0" width="6" height="2" />
      </g>
    </svg>
  );
}

export function TStageChampion() {
  const { tournament } = useGameState();
  const { t } = useI18n();
  if (!tournament) return null;

  const champion = tournament.champion;
  const name = (champion?.nickname ?? '???').toUpperCase();

  return (
    <StageFrame>
      <StageBackdrop />

      {/* Centred celebration content */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 48,
        }}
      >
        {/* Crown */}
        <motion.div
          initial={{ opacity: 0, y: -40, scale: 0.6 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: EASE_BACK }}
        >
          <PixelCrown size={260} />
        </motion.div>

        {/* Champion label */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.4 }}
        >
          <Lbl size={20} color="accent">
            {t('tStageChampionLabel')}
          </Lbl>
        </motion.div>

        {/* Champion name — letter cascade entrance */}
        <LetterCascade
          text={name}
          size={160}
          color={C.bone}
          baseDelay={0.55}
          gap={10}
        />

        {/* Subtitle */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE_BACK, delay: 0.9 + name.length * 0.05 }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            padding: '14px 32px',
            background: C.ink2,
            border: `1px solid ${C.line}`,
          }}
        >
          <span
            style={{
              fontFamily: FONT.mono,
              fontSize: 15,
              color: C.text2,
              letterSpacing: '0.12em',
            }}
          >
            {t('tChampionCongrats')}
          </span>
        </motion.div>
      </div>

      {/* Brand mark — bottom left */}
      <div
        style={{
          position: 'absolute',
          bottom: 40,
          left: 60,
        }}
      >
        <span
          style={{
            fontFamily: FONT.pixel,
            fontSize: 18,
            color: C.text4,
            letterSpacing: '0.06em',
          }}
        >
          PROMPT CLASH
        </span>
      </div>
    </StageFrame>
  );
}
