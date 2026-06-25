'use strict';

// N-way roster scorer. DEMO_MODE returns deterministic, near-unique fakes so
// the elimination engine is fully testable headlessly. The real path wraps
// Gemini; scoring 100 images is the cost/accuracy-sensitive part and may need
// chunked calls + merge — keep that ITERATION behind this stable interface.
async function scoreRoster(roomId, referenceImageUrl, entrants) {
  if (process.env.DEMO_MODE === '1') {
    return entrants
      .map((e, i) => ({
        entrantId: e.entrantId,
        // deterministic spread 40..98, decreasing by index, jittered by id hash
        score: 98 - i - (_hash(e.entrantId) % 5)
      }))
      .sort((x, y) => y.score - x.score);
  }
  // REAL PATH (iterate here): batch entrants, call the Gemini multi-image
  // ranker against referenceImageUrl, merge batch scores into one ordered list.
  // Until implemented, fail loudly rather than silently mis-ranking.
  throw new Error('scoreRoster: real Gemini path not yet implemented (use DEMO_MODE=1)');
}

function _hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

module.exports = { scoreRoster };
