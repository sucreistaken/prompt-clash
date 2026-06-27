'use strict';

const { pickRound, generateTargetPrompt, roundArgsForRoom } = require('../targetPrompt.js');

/**
 * Per-round topic engine for tournament mode.
 * Generates the next topic (prompt + category + difficulty) for a round.
 *
 * In DEMO_MODE, returns a fixed topic without calling AI (cost: $0).
 * In real mode, reuses the duel target engine (pickRound + generateTargetPrompt).
 *
 * @param {Object} room - Room object with optional lockedCategory/lockedDifficulty
 * @returns {Promise<{prompt: string, promptTr: string, category: string, difficulty: string}>}
 */
async function nextTopic(room) {
  if (process.env.DEMO_MODE === '1') {
    return {
      prompt: 'dancing toaster',
      promptTr: 'dans eden tost makinesi',
      category: 'absurd',
      difficulty: 'easy'
    };
  }

  const round = pickRound(roundArgsForRoom(room));

  const t = await generateTargetPrompt(round);

  return {
    prompt: t.promptEn,
    promptTr: t.promptTr,
    category: t.category,
    difficulty: t.difficulty
  };
}

module.exports = { nextTopic };
