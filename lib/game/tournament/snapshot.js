// lib/game/tournament/snapshot.js
'use strict';
function tournamentSnapshot(room) {
  const t = room.tournament;
  if (!t) return null;
  const ents = Object.values(t.entrants);
  const byId = (id) => (id && t.entrants[id] ? { entrantId: id, nickname: t.entrants[id].nickname } : null);
  // The topic text is the ANSWER — the hidden target IMAGE is the challenge.
  // Reveal the text only at the payoff (scoring/cut/final/complete), never while
  // players are prompting or generating against the target.
  const reveal =
    t.phase === 'ROUND_SCORING' ||
    t.phase === 'ROUND_CUT' ||
    t.phase === 'FINAL_DUEL' ||
    t.phase === 'COMPLETE';
  return {
    phase: t.phase,
    roundIndex: t.roundIndex,
    roundCount: (t.schedule || []).length,
    activeCount: t.activeIds.length,
    totalCount: ents.length,
    topic: t.topic && reveal ? { promptTr: t.topic.promptTr } : null,
    champion: byId(t.champion),
    finalists: t.finalIds ? t.finalIds.map(byId).filter(Boolean) : null,
    roster: ents.map((e) => ({ entrantId: e.entrantId, nickname: e.nickname, eliminated: e.eliminated, lastScore: e.lastScore, groupIndex: e.groupIndex ?? null })),
    mode: t.mode || 'A',
    groupPhase: t.currentGroupIndex >= 0,
    currentGroupIndex: t.currentGroupIndex,
    groupCount: (t.groups || []).length,
  };
}
module.exports = { tournamentSnapshot };
